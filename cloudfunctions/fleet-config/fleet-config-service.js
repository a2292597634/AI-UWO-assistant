/**
 * Fleet Config Service
 *
 * Pure business rules: ownership, name uniqueness, per-scope 10-record limit,
 * schema validation, version conflict detection. All ownerUid values
 * come from the function entry (server context), never from client event.
 */

const MAX_CONFIGS_PER_SCOPE = 10
const MAX_CONFIG_NAME_LENGTH = 30
const SCHEMA_VERSION = 1
const FLEET_SHIP_COUNT = 7
const SHIP_OFFICER_CAPACITY = 11
const MAX_IDENTIFIER_LENGTH = 100
const MAX_LABEL_LENGTH = 30
const MAX_TARGETS_PER_SHIP = 20
const MAX_OFFICER_ID_LIST_LENGTH = 1000
const CLASSIFIED_CONFIG_SCOPES = new Set(['battle', 'adventure'])
const VALID_ACTIONS = new Set([
  'authenticate',
  'listMyConfigs',
  'listUnclassifiedConfigs',
  'classifyConfig',
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
 * @param {unknown} value
 * @returns {value is 'battle' | 'adventure'}
 */
function isClassifiedScope(value) {
  return CLASSIFIED_CONFIG_SCOPES.has(value)
}

/**
 * @param {object} record
 * @returns {'battle' | 'adventure' | 'unclassified'}
 */
function getStoredScope(record) {
  return isClassifiedScope(record.scope) ? record.scope : 'unclassified'
}

/**
 * @param {unknown} scope
 * @returns {{ ok: true, scope: 'battle' | 'adventure' } | { ok: false, code: string, message: string }}
 */
function validateClassifiedScope(scope) {
  if (isClassifiedScope(scope)) return { ok: true, scope }
  return { ok: false, code: 'invalid-state', message: '配置範圍必須是戰鬥或冒險' }
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

const ALLOWED_STATE_KEYS = new Set(['ships', 'bannedOfficerIds'])
const ALLOWED_SHIP_KEYS = new Set([
  'id',
  'label',
  'mode',
  'officerIds',
  'targets',
  'lockedOfficerIds',
  'removedOfficerIds',
  'needsReview',
])
const ALLOWED_TARGET_KEYS = new Set(['id', 'skillId', 'targetLevel'])

/**
 * 驗證可由 runtime 使用的 FleetState business state。
 * schemaVersion 屬於持久化 envelope，不是此型別的一部分。
 * @param {unknown} state
 * @returns {boolean}
 */
function isValidFleetState(state) {
  if (!isPlainObject(state)) return false
  if (!hasOnlyAllowedKeys(state, ALLOWED_STATE_KEYS)) return false
  if (!Array.isArray(state.ships) || state.ships.length !== FLEET_SHIP_COUNT) return false
  if (!isValidIdArray(state.bannedOfficerIds, MAX_OFFICER_ID_LIST_LENGTH)) return false

  const allOfficerIds = new Set()
  const shipIds = new Set()
  for (const ship of state.ships) {
    if (!isValidShip(ship)) return false
    if (shipIds.has(ship.id)) return false
    shipIds.add(ship.id)
    for (const officerId of ship.officerIds) {
      if (allOfficerIds.has(officerId)) return false
      allOfficerIds.add(officerId)
    }
  }
  return true
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {Record<string, unknown>} value
 * @param {Set<string>} allowed
 * @returns {boolean}
 */
function hasOnlyAllowedKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key))
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isValidIdentifier(value) {
  return typeof value === 'string' && value.length > 0 && [...value].length <= MAX_IDENTIFIER_LENGTH
}

/**
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {value is string[]}
 */
function isValidIdArray(value, maxLength) {
  if (!Array.isArray(value) || value.length > maxLength) return false
  if (!value.every(isValidIdentifier)) return false
  return new Set(value).size === value.length
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidShip(value) {
  if (!isPlainObject(value) || !hasOnlyAllowedKeys(value, ALLOWED_SHIP_KEYS)) return false
  if (!isValidIdentifier(value.id)) return false
  if (
    typeof value.label !== 'string' ||
    value.label.length === 0 ||
    [...value.label].length > MAX_LABEL_LENGTH
  ) {
    return false
  }
  if (value.mode !== 'manual' && value.mode !== 'auto') return false
  if (!isValidIdArray(value.officerIds, SHIP_OFFICER_CAPACITY)) return false
  if (!isValidIdArray(value.lockedOfficerIds, SHIP_OFFICER_CAPACITY)) return false
  if (!isValidIdArray(value.removedOfficerIds, MAX_OFFICER_ID_LIST_LENGTH)) return false
  if (typeof value.needsReview !== 'boolean') return false
  if (!Array.isArray(value.targets) || value.targets.length > MAX_TARGETS_PER_SHIP) return false

  const skillIds = new Set()
  for (const target of value.targets) {
    if (!isValidTarget(target)) return false
    if (target.skillId !== null) {
      if (skillIds.has(target.skillId)) return false
      skillIds.add(target.skillId)
    }
  }
  return true
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidTarget(value) {
  if (!isPlainObject(value) || !hasOnlyAllowedKeys(value, ALLOWED_TARGET_KEYS)) return false
  if (!isValidIdentifier(value.id)) return false
  if (value.skillId !== null && !isValidIdentifier(value.skillId)) return false
  if (typeof value.targetLevel !== 'number') return false
  const minimumLevel = value.skillId === null ? 1 : 0
  if (
    !Number.isInteger(value.targetLevel) ||
    value.targetLevel < minimumLevel ||
    value.targetLevel > 10
  ) {
    return false
  }
  return true
}

/**
 * 由 CloudBase context 取得 request id，沒有時建立可追蹤的本地 id。
 * @param {unknown} context
 * @returns {string}
 */
function getRequestId(context) {
  const requestId = isPlainObject(context) ? context.requestId : undefined
  if (typeof requestId === 'string' && requestId.trim()) return requestId.trim()
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * @param {string} action
 * @param {string} requestId
 * @param {unknown} error
 * @returns {void}
 */
function logServerError(action, requestId, error) {
  console.error(`[fleet-config] ${action} error requestId=${requestId}`, error)
}

/**
 * @returns {{ ok: false, code: string, message: string }}
 */
function createSafeServerError() {
  return {
    ok: false,
    code: 'network',
    message: '伺服器暫時無法處理請求，請稍後再試',
  }
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
    return { code, message: '此類型已達 10 套配置上限' }
  }
  return { code: 'duplicate-name', message: '同一類型已有相同名稱的配置' }
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
 * @returns {{ configId: string, name: string, scope: 'battle' | 'adventure' | 'unclassified', version: number, updatedAt: string, lastUsedAt: string }}
 */
function toSummary(record) {
  return {
    configId: record.configId,
    name: record.name,
    scope: getStoredScope(record),
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
  return { ...rest, scope: getStoredScope(record) }
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
        return handleListMyConfigs(ownerUid, payload)
      case 'listUnclassifiedConfigs':
        return handleListUnclassifiedConfigs(ownerUid)
      case 'classifyConfig':
        return handleClassifyConfig(ownerUid, payload)
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

  async function handleListMyConfigs(ownerUid, payload) {
    const scopeResult = validateClassifiedScope(payload?.scope)
    if (!scopeResult.ok) return fail(scopeResult.code, scopeResult.message)

    const records = await repo.listByOwner(ownerUid, scopeResult.scope)
    console.log(
      `[fleet-config] listMyConfigs: owner=${ownerUid.slice(0, 8)}... scope=${scopeResult.scope} count=${records.length}`,
    )
    return ok(records.map(toSummary))
  }

  async function handleListUnclassifiedConfigs(ownerUid) {
    const records = await repo.listByOwner(ownerUid, 'unclassified')
    return ok(records.map(toSummary))
  }

  async function handleClassifyConfig(ownerUid, payload) {
    const configId = payload?.configId
    const expectedVersion = payload?.expectedVersion
    const scopeResult = validateClassifiedScope(payload?.targetScope)

    if (!configId || typeof configId !== 'string') {
      return fail('not-found', '需要配置 ID')
    }
    if (typeof expectedVersion !== 'number') {
      return fail('conflict', '需要配置版本')
    }
    if (!scopeResult.ok) return fail(scopeResult.code, scopeResult.message)

    const result = await repo.classifyIfVersionAndConstraints(
      ownerUid,
      configId,
      expectedVersion,
      scopeResult.scope,
      MAX_CONFIGS_PER_SCOPE,
    )
    if (result.ok) return ok(toClientRecord(result.data))
    if (result.code === 'duplicate-name' || result.code === 'limit-reached') {
      const constraintFailure = getConstraintFailure(result.code)
      return fail(constraintFailure.code, constraintFailure.message)
    }
    if (result.code === 'invalid-state') {
      return fail('invalid-state', '此配置已完成分類，無法重複分類')
    }
    if (result.code === 'conflict') {
      return fail('conflict', '配置已被其他裝置修改，請重新載入')
    }
    return fail('not-found', '找不到配置')
  }

  async function handleLoadConfig(ownerUid, payload) {
    const configId = payload?.configId
    const scopeResult = validateClassifiedScope(payload?.scope)
    if (!configId || typeof configId !== 'string') {
      return fail('not-found', '需要配置 ID')
    }
    if (!scopeResult.ok) return fail(scopeResult.code, scopeResult.message)
    const record = await repo.findByOwnerAndId(ownerUid, configId)
    if (!record) return fail('not-found', 'Config not found')
    if (getStoredScope(record) !== scopeResult.scope) return fail('not-found', '找不到配置')

    // Update lastUsedAt
    await repo.touchLastUsed(ownerUid, configId, new Date().toISOString(), scopeResult.scope)

    if (!isSchemaCompatible(record.schemaVersion)) {
      return fail('invalid-state', `Unsupported schema version: ${record.schemaVersion}`)
    }
    if (!isValidFleetState(record.fleetState)) {
      return fail('invalid-state', 'Invalid fleet configuration data')
    }

    return ok(toClientRecord(record))
  }

  async function handleCreateConfig(ownerUid, payload) {
    const scopeResult = validateClassifiedScope(payload?.scope)
    const name = payload?.name
    const fleetState = payload?.fleetState

    if (!scopeResult.ok) return fail(scopeResult.code, scopeResult.message)

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
      scope: scopeResult.scope,
      fleetState,
      schemaVersion: SCHEMA_VERSION,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    }

    const result = await repo.insertWithConstraints(record, MAX_CONFIGS_PER_SCOPE)
    if (!result.ok) {
      const constraintFailure = getConstraintFailure(result.code)
      return fail(constraintFailure.code, constraintFailure.message)
    }

    return ok(toClientRecord(result.data))
  }

  async function handleUpdateConfig(ownerUid, payload) {
    const scopeResult = validateClassifiedScope(payload?.scope)
    const configId = payload?.configId
    const expectedVersion = payload?.expectedVersion
    const fleetState = payload?.fleetState
    const force = payload?.force === true

    if (!scopeResult.ok) return fail(scopeResult.code, scopeResult.message)

    if (!configId || typeof configId !== 'string') {
      return fail('not-found', 'Config ID is required')
    }

    if (!fleetState || !isValidFleetState(fleetState)) {
      return fail('invalid-state', 'Invalid fleet configuration data')
    }

    const existing = await repo.findByOwnerAndId(ownerUid, configId)
    if (!existing) return fail('not-found', 'Config not found')
    if (getStoredScope(existing) !== scopeResult.scope) return fail('not-found', '找不到配置')

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
    const scopeResult = validateClassifiedScope(payload?.scope)
    const name = payload?.name
    const fleetState = payload?.fleetState

    if (!scopeResult.ok) return fail(scopeResult.code, scopeResult.message)

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
      scope: scopeResult.scope,
      fleetState,
      schemaVersion: SCHEMA_VERSION,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    }

    const result = await repo.insertWithConstraints(record, MAX_CONFIGS_PER_SCOPE)
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
    const scopeResult = validateClassifiedScope(payload?.scope)
    const configId = payload?.configId
    const expectedVersion = payload?.expectedVersion
    const name = payload?.name

    if (!scopeResult.ok) return fail(scopeResult.code, scopeResult.message)

    if (!configId || typeof configId !== 'string') {
      return fail('not-found', 'Config ID is required')
    }

    if (!name || !isValidConfigName(name)) {
      return fail('name-required', 'Please enter a config name (1-30 characters)')
    }

    const existing = await repo.findByOwnerAndId(ownerUid, configId)
    if (!existing) return fail('not-found', 'Config not found')
    if (getStoredScope(existing) !== scopeResult.scope) return fail('not-found', '找不到配置')

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
      scopeResult.scope,
    )

    if (!result.ok) {
      if (result.code === 'duplicate-name') {
        return fail('duplicate-name', '同一類型已有相同名稱的配置')
      }
      if (result.code === 'not-found') {
        return fail('not-found', 'Config not found')
      }
      return fail('conflict', 'Config was modified by another device')
    }

    return ok(toClientRecord(result.data))
  }

  async function handleDeleteConfig(ownerUid, payload) {
    const scopeResult = validateClassifiedScope(payload?.scope)
    const configId = payload?.configId
    const expectedVersion = payload?.expectedVersion
    if (!scopeResult.ok) return fail(scopeResult.code, scopeResult.message)
    if (!configId || typeof configId !== 'string') {
      return fail('not-found', 'Config ID is required')
    }

    if (typeof expectedVersion !== 'number') {
      return fail('conflict', 'Version is required')
    }

    const existing = await repo.findByOwnerAndId(ownerUid, configId)
    if (!existing) return fail('not-found', 'Config not found')
    if (getStoredScope(existing) !== scopeResult.scope) return fail('not-found', '找不到配置')

    const deleted = await repo.deleteByOwnerAndId(
      ownerUid,
      configId,
      expectedVersion,
      scopeResult.scope,
    )
    if (!deleted) {
      return fail('conflict', 'Config was modified by another device')
    }

    return ok({ deleted: true })
  }

  async function handleSetLastUsedConfig(ownerUid, payload) {
    const scopeResult = validateClassifiedScope(payload?.scope)
    const configId = payload?.configId
    if (!scopeResult.ok) return fail(scopeResult.code, scopeResult.message)
    if (!configId || typeof configId !== 'string') {
      return fail('not-found', 'Config ID is required')
    }

    const existing = await repo.findByOwnerAndId(ownerUid, configId)
    if (!existing) return fail('not-found', 'Config not found')
    if (getStoredScope(existing) !== scopeResult.scope) return fail('not-found', '找不到配置')

    await repo.touchLastUsed(ownerUid, configId, new Date().toISOString(), scopeResult.scope)
    return ok({ updated: true })
  }

  return { dispatch }
}

module.exports = {
  createFleetConfigService,
  MAX_CONFIGS_PER_SCOPE,
  MAX_CONFIG_NAME_LENGTH,
  SCHEMA_VERSION,
  VALID_ACTIONS,
  normalizeConfigName,
  isValidConfigName,
  isValidFleetState,
  isSchemaCompatible,
  isNameTaken,
  generateConfigId,
  getRequestId,
  logServerError,
  createSafeServerError,
}
