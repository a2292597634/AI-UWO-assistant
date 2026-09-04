/**
 * Custom Officer Repository
 *
 * CloudBase 数据库读写层。所有 owner/status/revision 条件都在服务端组装，
 * 不接受客户端传入的 ownerUid 或 openid。
 */

const COLLECTION = 'custom_officers'

const sortNewestFirst = (records) =>
  [...records].sort((left, right) => {
    const leftTime = left.createdAt ?? ''
    const rightTime = right.createdAt ?? ''
    if (leftTime !== rightTime) return rightTime.localeCompare(leftTime)
    return (right.revision ?? 0) - (left.revision ?? 0)
  })

const latestPerSubmission = (records) => {
  const latest = new Map()
  for (const record of records) {
    const current = latest.get(record.submissionId)
    if (!current || (current.revision ?? 0) < (record.revision ?? 0)) {
      latest.set(record.submissionId, record)
    }
  }
  return sortNewestFirst([...latest.values()])
}

/** @param {object} db CloudBase database instance */
function createRepository(db) {
  const collection = db.collection(COLLECTION)
  let collectionReady = false

  async function ensureCollection() {
    if (collectionReady) return
    try {
      await db.createCollection(COLLECTION)
    } catch {
      // 集合已存在或正在创建，查询仍可继续。
    }
    collectionReady = true
  }

  async function getAll(filter = {}) {
    await ensureCollection()
    const result = await collection.where(filter).get()
    return result.data
  }

  /** @param {string} ownerUid */
  async function listByOwner(ownerUid) {
    return latestPerSubmission(await getAll({ ownerUid }))
  }

  /** @param {string} status */
  async function listLatestByStatus(status) {
    return latestPerSubmission(await getAll({})).filter((record) => record.status === status)
  }

  /** @param {string} submissionId @param {number} revision */
  async function findBySubmissionIdAndRevision(submissionId, revision) {
    const records = await getAll({ submissionId, revision })
    return records[0] ?? null
  }

  /** @param {string} submissionId */
  async function findLatestBySubmissionId(submissionId) {
    return latestPerSubmission(await getAll({ submissionId }))[0] ?? null
  }

  /** @param {string} ownerUid */
  async function countLatestByOwner(ownerUid) {
    return (await listByOwner(ownerUid)).length
  }

  /** @param {object} record */
  async function insert(record) {
    await ensureCollection()
    const now = new Date().toISOString()
    const doc = {
      ...record,
      createdAt: record.createdAt ?? now,
      updatedAt: record.updatedAt ?? now,
      status: record.status ?? 'pending',
      revision: record.revision ?? 1,
    }
    const result = await collection.add({ data: doc })
    return { ...doc, _id: result._id }
  }

  /**
   * 以 submissionId、revision 和 updatedAt 做条件更新，避免覆盖较新版本。
   * @param {string} submissionId
   * @param {number} revision
   * @param {string} updatedAt
   * @param {object} patch
   */
  async function updateIfRevision(submissionId, revision, updatedAt, patch) {
    await ensureCollection()
    const nextUpdatedAt = new Date().toISOString()
    const result = await collection.where({ submissionId, revision, updatedAt }).update({
      data: { ...patch, updatedAt: nextUpdatedAt },
    })
    if (!result.stats || result.stats.updated !== 1) return null
    const updated = await findBySubmissionIdAndRevision(submissionId, revision)
    return updated
  }

  return {
    listByOwner,
    listLatestByStatus,
    findBySubmissionIdAndRevision,
    findLatestBySubmissionId,
    countLatestByOwner,
    insert,
    updateIfRevision,
  }
}

module.exports = { createRepository }
