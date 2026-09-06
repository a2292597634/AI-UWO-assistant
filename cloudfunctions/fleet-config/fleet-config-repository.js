/**
 * Fleet Config Repository
 *
 * CloudBase database read/write layer. All queries include the server-derived
 * ownerUid condition. Never accepts ownerUid or openid from the client payload.
 */

const COLLECTION = 'fleet_configs'
const OWNER_LOCK_COLLECTION = 'fleet_config_owner_locks'

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeStoredName(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * @param {object} record
 * @returns {string}
 */
function getStoredNormalizedName(record) {
  return normalizeStoredName(record.normalizedName ?? record.name)
}

/**
 * @param {object} record
 * @returns {'battle' | 'adventure' | 'unclassified'}
 */
function getStoredScope(record) {
  return record.scope === 'battle' || record.scope === 'adventure' ? record.scope : 'unclassified'
}

/**
 * 使用穩定文件 ID 建立 owner 範圍的交易鎖。
 * @param {string} ownerUid
 * @returns {string}
 */
function getOwnerLockId(ownerUid) {
  return `owner_${encodeURIComponent(ownerUid)}`
}

function isCollectionAlreadyExistsError(error) {
  const code =
    error && typeof error === 'object'
      ? typeof error.code === 'string'
        ? error.code
        : typeof error.errCode === 'string'
          ? error.errCode
          : undefined
      : undefined
  return (
    code === 'DATABASE_COLLECTION_ALREADY_EXIST' || code === 'DATABASE_COLLECTION_ALREADY_EXISTS'
  )
}

const OWNER_LOCK_SCOPES = ['battle', 'adventure', 'unclassified']

/**
 * @param {object} record
 * @returns {string | null}
 */
function getStoredDocumentId(record) {
  return typeof record?._id === 'string' && record._id ? record._id : null
}

/**
 * 建立 owner 鎖文件中的輕量索引。未分類舊記錄也保留在索引內，
 * 讓刪除與分類不會遺留過期項目。
 * @param {string} ownerUid
 * @param {object[]} records
 * @returns {object}
 */
function createOwnerLockState(ownerUid, records = []) {
  const configs = {
    battle: [],
    adventure: [],
    unclassified: [],
  }

  for (const record of records) {
    const recordId = getStoredDocumentId(record)
    if (recordId === null || typeof record.configId !== 'string') continue
    configs[getStoredScope(record)].push({
      configId: record.configId,
      recordId,
      normalizedName: getStoredNormalizedName(record),
    })
  }

  return { ownerUid, revision: 0, configs }
}

/**
 * @param {object | undefined} candidate
 * @param {string} ownerUid
 * @param {object} fallback
 * @returns {object}
 */
function normalizeOwnerLockState(candidate, ownerUid, fallback) {
  const source =
    candidate && candidate.ownerUid === ownerUid && candidate.configs ? candidate : fallback
  const configs = {}

  for (const scope of OWNER_LOCK_SCOPES) {
    const entries = Array.isArray(source?.configs?.[scope]) ? source.configs[scope] : []
    configs[scope] = entries
      .filter(
        (entry) =>
          entry &&
          typeof entry.configId === 'string' &&
          typeof entry.recordId === 'string' &&
          typeof entry.normalizedName === 'string',
      )
      .map((entry) => ({
        configId: entry.configId,
        recordId: entry.recordId,
        normalizedName: entry.normalizedName,
      }))
  }

  return {
    ownerUid,
    revision: Number.isInteger(source?.revision) ? source.revision : 0,
    configs,
  }
}

/**
 * @param {object} state
 * @param {'battle' | 'adventure' | 'unclassified'} scope
 * @returns {object[]}
 */
function getOwnerLockEntries(state, scope) {
  return state.configs[scope]
}

/**
 * @param {object} state
 * @param {object} record
 * @param {string} recordId
 * @returns {void}
 */
function upsertOwnerLockEntry(state, record, recordId) {
  const scope = getStoredScope(record)
  const entries = getOwnerLockEntries(state, scope)
  const entry = {
    configId: record.configId,
    recordId,
    normalizedName: getStoredNormalizedName(record),
  }
  const existingIndex = entries.findIndex((item) => item.configId === record.configId)
  if (existingIndex === -1) entries.push(entry)
  else entries[existingIndex] = entry
}

/**
 * @param {object} state
 * @param {string} configId
 * @returns {void}
 */
function removeOwnerLockEntry(state, configId) {
  for (const scope of OWNER_LOCK_SCOPES) {
    state.configs[scope] = state.configs[scope].filter((entry) => entry.configId !== configId)
  }
}

/**
 * @param {object} db - CloudBase database instance from cloud.database()
 */
function createRepository(db) {
  const collection = db.collection(COLLECTION)
  const ownerLockCollection = db.collection(OWNER_LOCK_COLLECTION)

  // Lazy-create the collection on first access
  const collectionReady = new Set()

  async function ensureCollection(collectionName = COLLECTION) {
    if (collectionReady.has(collectionName)) return
    try {
      await db.createCollection(collectionName)
    } catch (error) {
      if (!isCollectionAlreadyExistsError(error)) throw error
    }
    collectionReady.add(collectionName)
  }

  /**
   * 取得 owner 鎖的交易外初始化快照。舊版本的鎖文件沒有 configs 欄位，
   * 因此需要從 fleet_configs 建立一次索引；真正的寫入仍在交易內完成。
   * @param {string} ownerUid
   * @returns {Promise<object>}
   */
  async function getOwnerLockSeed(ownerUid) {
    const lockId = getOwnerLockId(ownerUid)
    const current = await ownerLockCollection.doc(lockId).get()
    if (current?.data?.ownerUid === ownerUid && current.data.configs) {
      return normalizeOwnerLockState(current.data, ownerUid, createOwnerLockState(ownerUid))
    }

    const existing = await collection.where({ ownerUid }).get()
    const seed = createOwnerLockState(ownerUid, existing.data)
    if (Number.isInteger(current?.data?.revision)) seed.revision = current.data.revision
    return seed
  }

  /**
   * 在 owner 鎖文件上執行交易。交易回調只使用 doc/add 操作，避免 CloudBase
   * 不支援的 transaction.collection().where() 查詢。
   * @param {string} ownerUid
   * @param {(context: { transaction: object, configCollection: object, state: object }) => Promise<unknown>} operation
   * @returns {Promise<unknown>}
   */
  async function runOwnerTransaction(ownerUid, operation) {
    await ensureCollection()
    await ensureCollection(OWNER_LOCK_COLLECTION)
    const seed = await getOwnerLockSeed(ownerUid)
    const lockId = getOwnerLockId(ownerUid)

    return db.runTransaction(async (transaction) => {
      const lockDoc = transaction.collection(OWNER_LOCK_COLLECTION).doc(lockId)
      const current = await lockDoc.get()
      const state = normalizeOwnerLockState(current?.data, ownerUid, seed)
      const result = await operation({
        transaction,
        configCollection: transaction.collection(COLLECTION),
        state,
      })

      await lockDoc.set({
        data: {
          ...state,
          revision: state.revision + 1,
          updatedAt: new Date().toISOString(),
        },
      })
      return result
    })
  }

  /**
   * List all configs for an owner, newest first.
   * @param {string} ownerUid
   * @param {'battle' | 'adventure' | 'unclassified'} [scope]
   * @returns {Promise<object[]>}
   */
  async function listByOwner(ownerUid, scope) {
    await ensureCollection()
    const result = await collection.where({ ownerUid }).get()
    const records =
      scope === undefined
        ? result.data
        : result.data.filter((item) => getStoredScope(item) === scope)
    return records.sort((a, b) => {
      const aTime = a.updatedAt ?? ''
      const bTime = b.updatedAt ?? ''
      return bTime.localeCompare(aTime)
    })
  }

  /**
   * Find a single config by owner and configId.
   * @param {string} ownerUid
   * @param {string} configId
   * @param {'battle' | 'adventure' | 'unclassified'} [scope]
   * @returns {Promise<object|null>}
   */
  async function findByOwnerAndId(ownerUid, configId, scope) {
    await ensureCollection()
    const result = await collection.where({ ownerUid, configId }).limit(1).get()
    const record = result.data[0]
    return record && (scope === undefined || getStoredScope(record) === scope) ? record : null
  }

  /**
   * Count configs for an owner.
   * @param {string} ownerUid
   * @param {'battle' | 'adventure' | 'unclassified'} [scope]
   * @returns {Promise<number>}
   */
  async function countByOwner(ownerUid, scope) {
    await ensureCollection()
    const result = await collection.where({ ownerUid }).count()
    if (scope === undefined) return result.total
    const records = await collection.where({ ownerUid }).get()
    return records.data.filter((item) => getStoredScope(item) === scope).length
  }

  /**
   * Insert a new config record.
   * @param {object} record
   * @returns {Promise<object>}
   */
  async function insert(record) {
    return runOwnerTransaction(record.ownerUid, async ({ configCollection, state }) => {
      const now = new Date().toISOString()
      const doc = {
        ...record,
        normalizedName: record.normalizedName ?? normalizeStoredName(record.name),
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
        version: 1,
      }
      const result = await configCollection.add({ data: doc })
      const stored = { ...doc, _id: result._id, configId: doc.configId }
      upsertOwnerLockEntry(state, stored, result._id)
      return stored
    })
  }

  /**
   * 在交易內完成名稱唯一性、數量上限與新增，避免 count/list 後再 insert 的
   * TOCTOU 競態。CloudBase 交易會在 owner lock 文件發生寫衝突時自動重試。
   * @param {object} record
   * @param {number} maxConfigsPerScope
   * @returns {Promise<{ok: true, data: object} | {ok: false, code: 'duplicate-name' | 'limit-reached'}>}
   */
  async function insertWithConstraints(record, maxConfigsPerScope) {
    return runOwnerTransaction(record.ownerUid, async ({ configCollection, state }) => {
      const recordScope = getStoredScope(record)
      const sameScopeRecords = getOwnerLockEntries(state, recordScope)

      if (sameScopeRecords.length >= maxConfigsPerScope) {
        return { ok: false, code: 'limit-reached' }
      }

      const normalizedName = normalizeStoredName(record.normalizedName ?? record.name)
      if (sameScopeRecords.some((item) => getStoredNormalizedName(item) === normalizedName)) {
        return { ok: false, code: 'duplicate-name' }
      }

      const now = new Date().toISOString()
      const doc = {
        ...record,
        normalizedName,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
        version: 1,
      }
      const result = await configCollection.add({ data: doc })
      const stored = { ...doc, _id: result._id, configId: doc.configId }
      upsertOwnerLockEntry(state, stored, result._id)
      return { ok: true, data: stored }
    })
  }

  /**
   * Update a config only if the version matches (optimistic lock).
   * Returns the updated record or null on conflict.
   * @param {string} ownerUid
   * @param {string} configId
   * @param {number} expectedVersion
   * @param {object} patch
   * @returns {Promise<object|null>}
   */
  async function updateIfVersion(ownerUid, configId, expectedVersion, patch) {
    const now = new Date().toISOString()
    const existing = await findByOwnerAndId(ownerUid, configId)
    if (!existing || existing.version !== expectedVersion) return null

    const nextVersion = expectedVersion + 1
    const updateResult = await collection
      .where({ ownerUid, configId, version: expectedVersion })
      .update({ data: { ...patch, version: nextVersion, updatedAt: now } })

    if (updateResult?.stats?.updated !== 1) return null

    const updated = {
      ...existing,
      ...patch,
      version: nextVersion,
      updatedAt: now,
    }
    return updated
  }

  /**
   * 在 owner 交易鎖內檢查名稱唯一性並執行 rename。
   * @param {string} ownerUid
   * @param {string} configId
   * @param {number} expectedVersion
   * @param {string} name
   * @param {string} normalizedName
   * @param {'battle' | 'adventure'} scope
   * @returns {Promise<{ok: true, data: object} | {ok: false, code: 'not-found' | 'conflict' | 'duplicate-name'}>}
   */
  async function renameIfVersionAndNameAvailable(
    ownerUid,
    configId,
    expectedVersion,
    name,
    normalizedName,
    scope,
  ) {
    const located = await findByOwnerAndId(ownerUid, configId)
    const recordId = located && getStoredDocumentId(located)
    if (!recordId) return { ok: false, code: 'not-found' }

    return runOwnerTransaction(ownerUid, async ({ configCollection, state }) => {
      const result = await configCollection.doc(recordId).get()
      const existing = result?.data

      if (!existing || existing.ownerUid !== ownerUid || existing.configId !== configId) {
        return { ok: false, code: 'not-found' }
      }
      if (getStoredScope(existing) !== scope) return { ok: false, code: 'not-found' }
      if (existing.version !== expectedVersion) return { ok: false, code: 'conflict' }

      const taken = getOwnerLockEntries(state, scope).some(
        (item) => item.configId !== configId && item.normalizedName === normalizedName,
      )
      if (taken) return { ok: false, code: 'duplicate-name' }

      const now = new Date().toISOString()
      const updated = {
        ...existing,
        name,
        normalizedName,
        version: existing.version + 1,
        updatedAt: now,
      }
      const updateResult = await configCollection.doc(recordId).update({
        data: { name, normalizedName, version: updated.version, updatedAt: now },
      })
      if (updateResult?.stats?.updated !== 1) return { ok: false, code: 'conflict' }
      upsertOwnerLockEntry(state, updated, recordId)

      return { ok: true, data: updated }
    })
  }

  /**
   * 在 owner 交易鎖內將舊的未分類記錄歸入指定 scope。
   * @param {string} ownerUid
   * @param {string} configId
   * @param {number} expectedVersion
   * @param {'battle' | 'adventure'} targetScope
   * @param {number} maxConfigsPerScope
   * @returns {Promise<{ok: true, data: object} | {ok: false, code: 'not-found' | 'conflict' | 'invalid-state' | 'duplicate-name' | 'limit-reached'}>}
   */
  async function classifyIfVersionAndConstraints(
    ownerUid,
    configId,
    expectedVersion,
    targetScope,
    maxConfigsPerScope,
  ) {
    const located = await findByOwnerAndId(ownerUid, configId)
    const recordId = located && getStoredDocumentId(located)
    if (!recordId) return { ok: false, code: 'not-found' }

    return runOwnerTransaction(ownerUid, async ({ configCollection, state }) => {
      const result = await configCollection.doc(recordId).get()
      const existing = result?.data

      if (!existing || existing.ownerUid !== ownerUid || existing.configId !== configId) {
        return { ok: false, code: 'not-found' }
      }
      if (existing.version !== expectedVersion) return { ok: false, code: 'conflict' }
      if (getStoredScope(existing) !== 'unclassified') {
        return { ok: false, code: 'invalid-state' }
      }

      const sameScopeRecords = getOwnerLockEntries(state, targetScope).filter(
        (item) => item.configId !== configId,
      )
      if (sameScopeRecords.length >= maxConfigsPerScope) {
        return { ok: false, code: 'limit-reached' }
      }

      const normalizedName = getStoredNormalizedName(existing)
      if (sameScopeRecords.some((item) => getStoredNormalizedName(item) === normalizedName)) {
        return { ok: false, code: 'duplicate-name' }
      }

      const now = new Date().toISOString()
      const updated = {
        ...existing,
        scope: targetScope,
        version: existing.version + 1,
        updatedAt: now,
      }
      const updateResult = await configCollection.doc(recordId).update({
        data: { scope: targetScope, version: updated.version, updatedAt: now },
      })
      if (updateResult?.stats?.updated !== 1) return { ok: false, code: 'conflict' }
      removeOwnerLockEntry(state, configId)
      upsertOwnerLockEntry(state, updated, recordId)

      return { ok: true, data: updated }
    })
  }

  /**
   * Delete a config by owner and configId.
   * @param {string} ownerUid
   * @param {string} configId
   * @param {number} expectedVersion
   * @returns {Promise<boolean>}
   */
  async function deleteByOwnerAndId(ownerUid, configId, expectedVersion) {
    if (typeof expectedVersion !== 'number') return false

    const located = await findByOwnerAndId(ownerUid, configId)
    const recordId = located && getStoredDocumentId(located)
    if (!recordId) return false

    return runOwnerTransaction(ownerUid, async ({ configCollection, state }) => {
      const result = await configCollection.doc(recordId).get()
      const existing = result?.data
      if (
        !existing ||
        existing.ownerUid !== ownerUid ||
        existing.configId !== configId ||
        existing.version !== expectedVersion
      ) {
        return false
      }

      const removeResult = await configCollection.doc(recordId).remove()
      if (removeResult?.stats?.removed !== 1) return false
      removeOwnerLockEntry(state, configId)
      return true
    })
  }

  /**
   * Update the lastUsedAt timestamp without incrementing version.
   * @param {string} ownerUid
   * @param {string} configId
   * @param {string} updatedAt
   */
  async function touchLastUsed(ownerUid, configId, updatedAt) {
    await ensureCollection()
    await collection.where({ ownerUid, configId }).update({ data: { lastUsedAt: updatedAt } })
  }

  return {
    listByOwner,
    findByOwnerAndId,
    countByOwner,
    insert,
    insertWithConstraints,
    updateIfVersion,
    renameIfVersionAndNameAvailable,
    classifyIfVersionAndConstraints,
    deleteByOwnerAndId,
    touchLastUsed,
  }
}

module.exports = { createRepository, getOwnerLockId, getStoredScope }
