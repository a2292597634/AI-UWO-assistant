/** 航海士資料錯誤回報 CloudBase 儲存庫。 */

const COLLECTION = 'officer_error_reports'
const QUERY_PAGE_SIZE = 100

const newestFirst = (records) =>
  [...records].sort((left, right) =>
    String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')),
  )

function createErrorReportRepository(db) {
  const collection = db.collection(COLLECTION)
  let collectionReady = false

  async function ensureCollection() {
    if (collectionReady) return
    try {
      await db.createCollection(COLLECTION)
    } catch {
      // 集合已存在或同時由其他請求建立時，後續查詢仍可繼續。
    }
    collectionReady = true
  }

  async function getAll(filter) {
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

  async function findByReportId(reportId) {
    return (await getAll({ reportId }))[0] ?? null
  }

  async function listByOwner(ownerOpenId) {
    return newestFirst(await getAll({ ownerOpenId }))
  }

  async function listByStatus(status) {
    return newestFirst(await getAll({ status }))
  }

  async function updateIfCurrent(reportId, revision, updatedAt, patch) {
    await ensureCollection()
    const result = await collection.where({ reportId, revision, updatedAt }).update({
      data: {
        ...patch,
        revision: revision + 1,
        updatedAt: new Date().toISOString(),
      },
    })
    if (!result.stats || result.stats.updated !== 1) return null
    return findByReportId(reportId)
  }

  return { insert, findByReportId, listByOwner, listByStatus, updateIfCurrent }
}

module.exports = { createErrorReportRepository }
