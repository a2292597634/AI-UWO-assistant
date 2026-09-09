/**
 * 航海士維護工單 CloudBase 儲存庫。
 *
 * 所有條件更新均同時比對工單 ID、revision 與 updatedAt，避免較舊畫面
 * 覆蓋任何後續保存的工單內容。
 */

const COLLECTION = 'officer_maintenance_work_orders'
const QUERY_PAGE_SIZE = 100

const sortNewestFirst = (records) =>
  [...records].sort((left, right) => {
    const timeComparison = String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? ''))
    return timeComparison || (right.revision ?? 0) - (left.revision ?? 0)
  })

function createRepository(db) {
  const collection = db.collection(COLLECTION)
  let collectionReady = false

  async function ensureCollection() {
    if (collectionReady) return
    try {
      await db.createCollection(COLLECTION)
    } catch {
      // 集合已存在或正由另一個請求建立時，後續查詢仍可繼續。
    }
    collectionReady = true
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

  async function insert(record) {
    await ensureCollection()
    const now = new Date().toISOString()
    const stored = {
      ...record,
      createdAt: record.createdAt ?? now,
      updatedAt: record.updatedAt ?? now,
      revision: record.revision ?? 1,
    }
    const result = await collection.add({ data: stored })
    return { ...stored, _id: result._id }
  }

  async function findByWorkOrderId(workOrderId) {
    const records = await getAll({ workOrderId })
    return records[0] ?? null
  }

  async function findByOwnerAndIdempotencyKey(ownerUid, idempotencyKey) {
    const records = await getAll({ ownerUid, idempotencyKey })
    return records[0] ?? null
  }

  async function listByOwner(ownerUid) {
    return sortNewestFirst(await getAll({ ownerUid }))
  }

  async function listByStatus(status) {
    return sortNewestFirst(await getAll({ status }))
  }

  /**
   * 以 workOrderId、revision、updatedAt 三欄執行 compare-and-swap。
   * revision 只由儲存庫遞增，呼叫端無法指定下一個版本。
   */
  async function updateIfCurrent(workOrderId, revision, updatedAt, patch) {
    await ensureCollection()
    const nextUpdatedAt = new Date().toISOString()
    const result = await collection.where({ workOrderId, revision, updatedAt }).update({
      data: { ...patch, revision: revision + 1, updatedAt: nextUpdatedAt },
    })
    if (!result.stats || result.stats.updated !== 1) return null
    return findByWorkOrderId(workOrderId)
  }

  return {
    insert,
    findByWorkOrderId,
    findByOwnerAndIdempotencyKey,
    listByOwner,
    listByStatus,
    updateIfCurrent,
  }
}

module.exports = { createRepository }
