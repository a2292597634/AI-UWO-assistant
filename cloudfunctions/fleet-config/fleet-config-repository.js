/**
 * Fleet Config Repository
 *
 * CloudBase database read/write layer. All queries include the server-derived
 * ownerUid condition. Never accepts ownerUid or openid from the client payload.
 */

const COLLECTION = 'fleet_configs'

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
  let collectionReady = false

  async function ensureCollection() {
    if (collectionReady) return
    try {
      await db.createCollection(COLLECTION)
    } catch (error) {
      if (!isCollectionAlreadyExistsError(error)) throw error
    }
    collectionReady = true
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
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      version: 1,
    }
    const result = await collection.add({ data: doc })
    return { ...doc, _id: result._id, configId: doc.configId }
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
    updateIfVersion,
    deleteByOwnerAndId,
    touchLastUsed,
  }
}

module.exports = { createRepository }
