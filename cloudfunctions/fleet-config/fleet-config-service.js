/**
 * Fleet Config Service
 *
 * Pure business rules: ownership, name uniqueness, 20-record limit,
 * schema validation, version conflict detection. All ownerUid values
 * come from the function entry (server context), never from client event.
 */

const MAX_CONFIGS_PER_USER = 20
const MAX_CONFIG_NAME_LENGTH = 30
const SCHEMA_VERSION = 1
const VALID_ACTIONS = new Set([
  'authenticate',
  'listMyConfigs',
  'loadConfig',
  'createConfig',
  'updateConfig',
  'saveAsConfig',
  'renameConfig',
  'deleteConfig',
  'setLastUsedConfig',
])

// ── Helpers ──

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeConfigName(value) {
  return (value ?? '').trim()
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isValidConfigName(name) {
  const normalized = normalizeConfigName(name)
  if (normalized.length === 0) return false
  if ([...normalized].length > MAX_CONFIG_NAME_LENGTH) return false
  return true
}

/**
 * Check schema version compatibility.
 * @param {number} version
 * @returns {boolean}
 */
function isSchemaCompatible(version) {
  return version === SCHEMA_VERSION
}

/**
 * Validate fleet state structure.
 * Basic structural checks; the contract module has more thorough validation.
 * @param {object} state
 * @returns {boolean}
 */
function isValidFleetState(state) {
  if (!state || typeof state !== 'object') return false
  if (!Array.isArray(state.ships) || state.ships.length !== 7) return false
  if (!Array.isArray(state.bannedOfficerIds)) return false
  // Each ship must have required fields
  for (const ship of state.ships) {
    if (!ship || typeof ship !== 'object') return false
    if (typeof ship.id !== 'string' || !ship.id) return false
    if (!Array.isArray(ship.officerIds)) return false
    if (ship.officerIds.length > 11) return false
    if (ship.mode !== 'manual' && ship.mode !== 'auto') return false
    if (!Array.isArray(ship.targets)) return false
    for (const t of ship.targets) {
      if (t.targetLevel < 1 || t.targetLevel > 10) return false
    }
  }
  return true
}

/**
 * Generate a unique config ID.
 * @returns {string}
 */
function generateConfigId() {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `cfg_${ts}_${rand}`
}

/**
 * @param {string} name
 * @param {object[]} existing
 * @param {string} [ignoredConfigId]
 * @returns {boolean}
 */
function isNameTaken(name, existing, ignoredConfigId) {
  const normalized = normalizeConfigName(name)
  return existing.some(
    (cfg) =>
      normalizeConfigName(cfg.name) === normalized && cfg.configId !== (ignoredConfigId ?? ''),
  )
}

/**
 * @param {'duplicate-name' | 'limit-reached'} code
 * @returns {{ code: string, message: string }}
 */
function getConstraintFailure(code) {
  if (code === 'limit-reached') {
    return { code, message: `Maximum ${MAX_CONFIGS_PER_USER} configs per user` }
  }
  return { code: 'duplicate-name', message: 'A config with this name already exists' }
}

// ── Result envelopes ──

/**
 * @template T
 * @param {T} data
 * @returns {{ ok: true, data: T }}
 */
function ok(data) {
  return { ok: true, data }
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {{ ok: false, code: string, message: string }}
 */
function fail(code, message) {
  return { ok: false, code, message }
}

// ── Summary mapping ──

/**
 * @param {object} record
 * @returns {{ configId: string, name: string, version: number, updatedAt: string, lastUsedAt: string }}
 */
function toSummary(record) {
  return {
    configId: record.configId,
    name: record.name,
    version: record.version,
    updatedAt: record.updatedAt,
    lastUsedAt: record.lastUsedAt,
  }
}

/**
 * Strip ownerUid before returning to client.
 * @param {object} record
 * @returns {object}
 */
function toClientRecord(record) {
  const { ownerUid: _ownerUid, _id: _recordId, ...rest } = record
  return rest
}

// ── Service factory ──

/**
 * @param {object} repo - Repository instance
 * @returns {object} Service with action handlers
 */
function createFleetConfigService(repo) {
  /**
   * Dispatch an action.
   * @param {string} action
   * @param {object} payload
   * @param {string} ownerUid - From server context, NEVER from client
   * @returns {Promise<object>}
   */
  async function dispatch(action, payload, ownerUid) {
    if (!VALID_ACTIONS.has(action)) {
      return fail('unknown-action', `Unknown action: ${action}`)
    }

    if (!ownerUid && action !== 'authenticate') {
      return fail('unauthenticated', 'Login required')
    }

    switch (action) {
      case 'authenticate':
        return handleAuthenticate(ownerUid)
      case 'listMyConfigs':
        return handleListMyConfigs(ownerUid)
      case 'loadConfig':
        return handleLoadConfig(ownerUid, payload)
      case 'createConfig':
        return handleCreateConfig(ownerUid, payload)
      case 'updateConfig':
        return handleUpdateConfig(ownerUid, payload)
      case 'saveAsConfig':
        return handleSaveAsConfig(ownerUid, payload)
      case 'renameConfig':
        return handleRenameConfig(ownerUid, payload)
      case 'deleteConfig':
        return handleDeleteConfig(ownerUid, payload)
      case 'setLastUsedConfig':
        return handleSetLastUsedConfig(ownerUid, payload)
      default:
        return fail('unknown-action', `Unknown action: ${action}`)
    }
  }

  async function handleAuthenticate(ownerUid) {
    // Return auth status — the caller can check `authenticated`.
    // All data operations still enforce ownerUid independently.
    return ok({ authenticated: Boolean(ownerUid) })
  }

  async function handleListMyConfigs(ownerUid) {
    const records = await repo.listByOwner(ownerUid)
    console.log(
      `[fleet-config] listMyConfigs: owner=${ownerUid.slice(0, 8)}... count=${records.length}`,
    )
    return ok(records.map(toSummary))
  }

  async function handleLoadConfig(ownerUid, payload) {
    const configId = payload?.configId
    if (!configId || typeof configId !== 'string') {
      return fail('not-found', 'Config ID is required')
    }
    const record = await repo.findByOwnerAndId(ownerUid, configId)
    if (!record) return fail('not-found', 'Config not found')

    // Update lastUsedAt
    await repo.touchLastUsed(ownerUid, configId, new Date().toISOString())

    if (!isSchemaCompatible(record.schemaVersion)) {
      return fail('invalid-state', `Unsupported schema version: ${record.schemaVersion}`)
    }

    return ok(toClientRecord(record))
  }

  async function handleCreateConfig(ownerUid, payload) {
    const name = payload?.name
    const fleetState = payload?.fleetState

    // Validate name
    if (!name || !isValidConfigName(name)) {
      return fail('name-required', 'Please enter a config name (1-30 characters)')
    }

    // Validate fleet state
    if (!fleetState || !isValidFleetState(fleetState)) {
      return fail('invalid-state', 'Invalid fleet configuration data')
    }

    const configId = generateConfigId()
    const normalizedName = normalizeConfigName(name)
    const record = {
      configId,
      ownerUid,
      name: normalizedName,
      normalizedName,
      fleetState,
      schemaVersion: SCHEMA_VERSION,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    }

    const result = await repo.insertWithConstraints(record, MAX_CONFIGS_PER_USER)
    if (!result.ok) {
      const constraintFailure = getConstraintFailure(result.code)
      return fail(constraintFailure.code, constraintFailure.message)
    }

    return ok(toClientRecord(result.data))
  }

  async function handleUpdateConfig(ownerUid, payload) {
    const configId = payload?.configId
    const expectedVersion = payload?.expectedVersion
    const fleetState = payload?.fleetState
    const force = payload?.force === true

    if (!configId || typeof configId !== 'string') {
      return fail('not-found', 'Config ID is required')
    }

    if (!fleetState || !isValidFleetState(fleetState)) {
      return fail('invalid-state', 'Invalid fleet configuration data')
    }

    const existing = await repo.findByOwnerAndId(ownerUid, configId)
    if (!existing) return fail('not-found', 'Config not found')

    if (!isSchemaCompatible(existing.schemaVersion)) {
      return fail('invalid-state', `Unsupported schema version: ${existing.schemaVersion}`)
    }

    const versionToCheck = force ? existing.version : expectedVersion

    if (typeof versionToCheck !== 'number') {
      return fail('conflict', 'Version is required for update')
    }

    const result = await repo.updateIfVersion(ownerUid, configId, versionToCheck, {
      fleetState,
      name: existing.name,
      lastUsedAt: new Date().toISOString(),
    })

    if (!result) {
      return fail('conflict', 'Config was modified by another device. Reload or force overwrite.')
    }

    return ok(toClientRecord(result))
  }

  async function handleSaveAsConfig(ownerUid, payload) {
    const name = payload?.name
    const fleetState = payload?.fleetState

    if (!name || !isValidConfigName(name)) {
      return fail('name-required', 'Please enter a config name (1-30 characters)')
    }

    if (!fleetState || !isValidFleetState(fleetState)) {
      return fail('invalid-state', 'Invalid fleet configuration data')
    }

    const configId = generateConfigId()
    const normalizedName = normalizeConfigName(name)
    const record = {
      configId,
      ownerUid,
      name: normalizedName,
      normalizedName,
      fleetState,
      schemaVersion: SCHEMA_VERSION,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    }

    const result = await repo.insertWithConstraints(record, MAX_CONFIGS_PER_USER)
    if (!result.ok) {
      const constraintFailure = getConstraintFailure(result.code)
      return fail(constraintFailure.code, constraintFailure.message)
    }

    console.log(
      `[fleet-config] saveAs: owner=${ownerUid.slice(0, 8)}... configId=${configId} name="${result.data.name}"`,
    )
    return ok(toClientRecord(result.data))
  }

  async function handleRenameConfig(ownerUid, payload) {
    const configId = payload?.configId
    const expectedVersion = payload?.expectedVersion
    const name = payload?.name

    if (!configId || typeof configId !== 'string') {
      return fail('not-found', 'Config ID is required')
    }

    if (!name || !isValidConfigName(name)) {
      return fail('name-required', 'Please enter a config name (1-30 characters)')
    }

    const existing = await repo.findByOwnerAndId(ownerUid, configId)
    if (!existing) return fail('not-found', 'Config not found')

    if (typeof expectedVersion !== 'number') {
      return fail('conflict', 'Version is required')
    }

    const normalizedName = normalizeConfigName(name)
    const result = await repo.renameIfVersionAndNameAvailable(
      ownerUid,
      configId,
      expectedVersion,
      normalizedName,
      normalizedName,
    )

    if (!result.ok) {
      if (result.code === 'duplicate-name') {
        return fail('duplicate-name', 'A config with this name already exists')
      }
      if (result.code === 'not-found') {
        return fail('not-found', 'Config not found')
      }
      return fail('conflict', 'Config was modified by another device')
    }

    return ok(toClientRecord(result.data))
  }

  async function handleDeleteConfig(ownerUid, payload) {
    const configId = payload?.configId
    const expectedVersion = payload?.expectedVersion
    if (!configId || typeof configId !== 'string') {
      return fail('not-found', 'Config ID is required')
    }

    if (typeof expectedVersion !== 'number') {
      return fail('conflict', 'Version is required')
    }

    const existing = await repo.findByOwnerAndId(ownerUid, configId)
    if (!existing) return fail('not-found', 'Config not found')

    const deleted = await repo.deleteByOwnerAndId(ownerUid, configId, expectedVersion)
    if (!deleted) {
      return fail('conflict', 'Config was modified by another device')
    }

    return ok({ deleted: true })
  }

  async function handleSetLastUsedConfig(ownerUid, payload) {
    const configId = payload?.configId
    if (!configId || typeof configId !== 'string') {
      return fail('not-found', 'Config ID is required')
    }

    const existing = await repo.findByOwnerAndId(ownerUid, configId)
    if (!existing) return fail('not-found', 'Config not found')

    await repo.touchLastUsed(ownerUid, configId, new Date().toISOString())
    return ok({ updated: true })
  }

  return { dispatch }
}

module.exports = {
  createFleetConfigService,
  MAX_CONFIGS_PER_USER,
  MAX_CONFIG_NAME_LENGTH,
  SCHEMA_VERSION,
  VALID_ACTIONS,
  normalizeConfigName,
  isValidConfigName,
  isValidFleetState,
  isSchemaCompatible,
  isNameTaken,
  generateConfigId,
}
