/**
 * Custom Officer Repository
 *
 * CloudBase 数据库读写层。所有 owner/status/revision 条件都在服务端组装，
 * 不接受客户端传入的 ownerUid 或 openid。
 */

const COLLECTION = 'custom_officers'
const OWNER_LIMIT_COLLECTION = 'custom_officer_owner_locks'
const PORTRAIT_INTENT_COLLECTION = 'custom_officer_portrait_intents'
const PORTRAIT_LEASE_MS = 86400000
const QUERY_PAGE_SIZE = 100

const getRevisionDocumentId = (submissionId, revision) =>
  `revision_${encodeURIComponent(submissionId)}_${revision}`

const getOwnerLimitDocumentId = (ownerUid) => `owner_${encodeURIComponent(ownerUid)}`

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
  const ownerLimitCollection = db.collection(OWNER_LIMIT_COLLECTION)
  const collectionReady = new Set()

  async function ensureCollection(name = COLLECTION) {
    if (collectionReady.has(name)) return
    try {
      await db.createCollection(name)
    } catch {
      // 集合已存在或正在创建，查询仍可继续。
    }
    collectionReady.add(name)
  }

  async function getAll(filter = {}) {
    await ensureCollection()
    const records = []
    let offset = 0
    while (true) {
      const result = await collection.where(filter).skip(offset).limit(QUERY_PAGE_SIZE).get()
      records.push(...result.data)
      if (result.data.length < QUERY_PAGE_SIZE) return records
      offset += result.data.length
    }
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

  async function getOwnerLimitSeed(ownerUid) {
    const current = await ownerLimitCollection.doc(getOwnerLimitDocumentId(ownerUid)).get()
    if (
      current?.data?.ownerUid === ownerUid &&
      Number.isInteger(current.data.count) &&
      current.data.count >= 0
    ) {
      return current.data.count
    }
    return countLatestByOwner(ownerUid)
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
   * 在 owner 限額鎖文件上以交易方式插入新投稿，避免 count 後 insert 的 TOCTOU 競態。
   * @param {object} record
   * @param {number} maxRecords
   * @returns {Promise<object | null>}
   */
  async function insertIfOwnerBelowLimit(record, maxRecords) {
    await ensureCollection(COLLECTION)
    await ensureCollection(OWNER_LIMIT_COLLECTION)
    const seedCount = await getOwnerLimitSeed(record.ownerUid)
    const lockId = getOwnerLimitDocumentId(record.ownerUid)

    return db.runTransaction(async (transaction) => {
      const lock = transaction.collection(OWNER_LIMIT_COLLECTION).doc(lockId)
      const current = await lock.get()
      const count =
        current?.data?.ownerUid === record.ownerUid && Number.isInteger(current.data.count)
          ? current.data.count
          : seedCount
      if (count >= maxRecords) return null

      const { _id: _ignoredId, ...data } = record
      const result = await transaction.collection(COLLECTION).add({ data })
      await lock.set({
        data: {
          ownerUid: record.ownerUid,
          count: count + 1,
          updatedAt: new Date().toISOString(),
        },
      })
      return { ...data, _id: result._id }
    })
  }

  /**
   * 以 deterministic revision 文件 ID 做一次性插入 CAS，避免并发重提产生
   * 相同 submissionId + revision 的两笔记录。
   * @param {object} record
   * @returns {Promise<object | null>}
   */
  async function insertRevisionIfAbsent(record) {
    await ensureCollection()
    const existing = await findBySubmissionIdAndRevision(record.submissionId, record.revision)
    if (existing) return null

    const documentId = getRevisionDocumentId(record.submissionId, record.revision)
    return db.runTransaction(async (transaction) => {
      const document = transaction.collection(COLLECTION).doc(documentId)
      const current = await document.get()
      if (current?.data) return null

      const { _id: _ignoredId, ...data } = record
      const stored = { ...data, _id: documentId }
      await document.set({ data })
      return stored
    })
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

  // 上傳前保存可恢復的意圖，避免資料庫或儲存故障使本次檔案失去追蹤。
  async function savePortraitIntent(id, intent, leaseToken, now = Date.now()) {
    await ensureCollection(PORTRAIT_INTENT_COLLECTION)
    return db.runTransaction(async (transaction) => {
      const document = transaction.collection(PORTRAIT_INTENT_COLLECTION).doc(id)
      const current = (await document.get()).data
      if (leaseToken) {
        if (!current || current.leaseToken !== leaseToken || current.leaseUntil <= now) return null
      } else if (current) return null
      const { _id: _ignoredId, ...data } = { ...current, ...intent }
      await document.set({ data })
      return { ...data, _id: id }
    })
  }

  async function claimPortraitIntent(id, leaseToken, now) {
    return db.runTransaction(async (transaction) => {
      const document = transaction.collection(PORTRAIT_INTENT_COLLECTION).doc(id)
      const current = (await document.get()).data
      if (!current || current.cleanupAfter >= now || current.leaseUntil > now) return null
      const { _id: _ignoredId, ...data } = {
        ...current,
        leaseToken,
        leaseUntil: now + PORTRAIT_LEASE_MS,
        cleanupAfter: now + PORTRAIT_LEASE_MS,
      }
      await document.set({ data })
      return { ...data, _id: id }
    })
  }

  async function removePortraitIntent(id, leaseToken, now = Date.now()) {
    return db.runTransaction(async (transaction) => {
      const document = transaction.collection(PORTRAIT_INTENT_COLLECTION).doc(id)
      const current = (await document.get()).data
      if (!current || !leaseToken || current.leaseToken !== leaseToken || current.leaseUntil <= now)
        return false
      await document.remove()
      return true
    })
  }

  async function listDuePortraitIntents(now) {
    await ensureCollection(PORTRAIT_INTENT_COLLECTION)
    const result = await db
      .collection(PORTRAIT_INTENT_COLLECTION)
      .where({ cleanupAfter: db.command.lt(now) })
      .orderBy('cleanupAfter', 'asc')
      .limit(20)
      .get()
    return result.data
  }

  async function isPortraitReferenced(intent) {
    await ensureCollection()
    if (intent.fileID) {
      const result = await collection
        .where({ 'formData.portraitFileId': intent.fileID })
        .limit(1)
        .get()
      return result.data.length > 0
    }
    // 上傳回應或記錄 fileID 的寫入可能中斷；路徑仍能識別已提交的同次圖片。
    const record = await findBySubmissionIdAndRevision(intent.submissionId, intent.revision)
    return Boolean(record?.formData?.portraitFileId?.endsWith('/' + intent.cloudPath))
  }

  return {
    listByOwner,
    listLatestByStatus,
    findBySubmissionIdAndRevision,
    findLatestBySubmissionId,
    countLatestByOwner,
    insert,
    insertIfOwnerBelowLimit,
    insertRevisionIfAbsent,
    updateIfRevision,
    savePortraitIntent,
    claimPortraitIntent,
    removePortraitIntent,
    listDuePortraitIntents,
    isPortraitReferenced,
  }
}

module.exports = { createRepository }
