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
 * 使用穩定文件 ID 建立 owner 範圍的交易鎖。
 * @param {string} ownerUid
 * @returns {string}
 */
function getOwnerLockId(ownerUid) {
  return `owner_${encodeURIComponent(ownerUid)}`
}

function isCollectionAlreadyExistsError(error) {
  const code = error && typeof error === 'object' ? (error.errCode ?? error.code) : undefined
  return (
    code === 'DATABASE_COLLECTION_ALREADY_EXIST' || code === 'DATABASE_COLLECTION_ALREADY_EXISTS'
  )
}

/**
 * @param {object} db - CloudBase database instance from cloud.database()
 */
function createRepository(db) {
  const collection = db.collection(COLLECTION)

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
   * 交易內更新 owner lock 文件。所有需要檢查名稱或數量的寫入都必須
   * 更新同一份文件，讓同一 owner 的交易在提交時產生寫衝突並自動重試。
   * @param {object} transaction
   * @param {string} ownerUid
   * @returns {Promise<void>}
   */
  async function touchOwnerLock(transaction, ownerUid) {
    const lockCollection = transaction.collection(OWNER_LOCK_COLLECTION)
    const lockId = getOwnerLockId(ownerUid)
    const current = await lockCollection.where({ ownerUid }).limit(1).get()
    const currentRevision = current.data[0]?.revision ?? 0
    await lockCollection.doc(lockId).set({
      data: {
        ownerUid,
        revision: currentRevision + 1,
        updatedAt: new Date().toISOString(),
      },
    })
  }

  /**
   * List all configs for an owner, newest first.
   * @param {string} ownerUid
   * @returns {Promise<object[]>}
   */
  async function listByOwner(ownerUid) {
    await ensureCollection()
    const result = await collection.where({ ownerUid }).get()
    return result.data.sort((a, b) => {
      const aTime = a.updatedAt ?? ''
      const bTime = b.updatedAt ?? ''
      return bTime.localeCompare(aTime)
    })
  }

  /**
   * Find a single config by owner and configId.
   * @param {string} ownerUid
   * @param {string} configId
   * @returns {Promise<object|null>}
   */
  async function findByOwnerAndId(ownerUid, configId) {
    await ensureCollection()
    const result = await collection.where({ ownerUid, configId }).limit(1).get()
    return result.data.length > 0 ? result.data[0] : null
  }

  /**
   * Count configs for an owner.
   * @param {string} ownerUid
   * @returns {Promise<number>}
   */
  async function countByOwner(ownerUid) {
    await ensureCollection()
    const result = await collection.where({ ownerUid }).count()
    return result.total
  }

  /**
   * Insert a new config record.
   * @param {object} record
   * @returns {Promise<object>}
   */
  async function insert(record) {
    await ensureCollection()
    const now = new Date().toISOString()
    const doc = {
      ...record,
      normalizedName: record.normalizedName ?? normalizeStoredName(record.name),
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      version: 1,
    }
    const result = await collection.add({ data: doc })
    return { ...doc, _id: result._id, configId: doc.configId }
  }

  /**
   * 在交易內完成名稱唯一性、數量上限與新增，避免 count/list 後再 insert 的
   * TOCTOU 競態。CloudBase 交易會在 owner lock 文件發生寫衝突時自動重試。
   * @param {object} record
   * @param {number} maxConfigsPerOwner
   * @returns {Promise<{ok: true, data: object} | {ok: false, code: 'duplicate-name' | 'limit-reached'}>}
   */
  async function insertWithConstraints(record, maxConfigsPerOwner) {
    await ensureCollection()
    await ensureCollection(OWNER_LOCK_COLLECTION)

    return db.runTransaction(async (transaction) => {
      await touchOwnerLock(transaction, record.ownerUid)
      const existing = await transaction
        .collection(COLLECTION)
        .where({ ownerUid: record.ownerUid })
        .get()

      if (existing.data.length >= maxConfigsPerOwner) {
        return { ok: false, code: 'limit-reached' }
      }

      const normalizedName = normalizeStoredName(record.normalizedName ?? record.name)
      if (existing.data.some((item) => getStoredNormalizedName(item) === normalizedName)) {
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
      const result = await transaction.collection(COLLECTION).add({ data: doc })
      return { ok: true, data: { ...doc, _id: result._id, configId: doc.configId } }
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
   * @returns {Promise<{ok: true, data: object} | {ok: false, code: 'not-found' | 'conflict' | 'duplicate-name'}>}
   */
  async function renameIfVersionAndNameAvailable(
    ownerUid,
    configId,
    expectedVersion,
    name,
    normalizedName,
  ) {
    await ensureCollection()
    await ensureCollection(OWNER_LOCK_COLLECTION)

    return db.runTransaction(async (transaction) => {
      await touchOwnerLock(transaction, ownerUid)
      const configCollection = transaction.collection(COLLECTION)
      const result = await configCollection.where({ ownerUid, configId }).limit(1).get()
      const existing = result.data[0]

      if (!existing) return { ok: false, code: 'not-found' }
      if (existing.version !== expectedVersion) return { ok: false, code: 'conflict' }

      const allConfigs = await configCollection.where({ ownerUid }).get()
      const taken = allConfigs.data.some(
        (item) => item.configId !== configId && getStoredNormalizedName(item) === normalizedName,
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
      await configCollection
        .where({ ownerUid, configId, version: expectedVersion })
        .update({ data: { name, normalizedName, version: updated.version, updatedAt: now } })

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
    await ensureCollection()
    if (typeof expectedVersion !== 'number') return false

    const result = await collection.where({ ownerUid, configId, version: expectedVersion }).remove()
    return result?.stats?.removed === 1
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
    deleteByOwnerAndId,
    touchLastUsed,
  }
}

module.exports = { createRepository, getOwnerLockId }
