/** 精確集合與有界查詢；所有寫入由 CloudBase 交易執行。worker 副本由工具生成。 */
const COLLECTIONS = Object.fromEntries(
  ['owners', 'subscriptions', 'sessions', 'operations', 'jobs', 'locks'].map((name) => [
    name,
    `major_reminder_${name}`,
  ]),
)
function collectionName(name) {
  if (!Object.hasOwn(COLLECTIONS, name)) throw new Error('不允許的提醒集合')
  return COLLECTIONS[name]
}
function createRepository(db) {
  const document = (client, name, id) => {
    if (typeof id !== 'string' || !id || id.length > 200) throw new Error('無效的提醒文件編號')
    return client.collection(collectionName(name)).doc(id)
  }
  const get = async (client, name, id) => {
    let result
    try {
      result = await document(client, name, id).get()
    } catch (error) {
      // PG 將文件缺失歸入通用系統錯誤，須同時核對操作與精確原因。
      if (
        error?.errCode === -501001 &&
        error.message === 'document.get:fail -501001 resource system error. Document not found'
      )
        return null
      // 舊環境的 SDK 缺失訊息須比對當次查詢的文件 ID。
      if (
        (error?.errCode === -1 || error?.errCode === '-1') &&
        error?.message === `document.get:fail document with _id ${id} does not exist`
      )
        return null
      throw error
    }
    const data = result?.data
    // CloudBase SDK 對不存在文件可能回傳空陣列、null 或沒有 data。
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      Object.keys(data).every((key) => key === '_id')
    )
      return null
    const { _id: _ignored, ...record } = data
    return record
  }
  return {
    get: (name, id) => get(db, name, id),
    transaction: (fn) =>
      db.runTransaction((transaction) =>
        fn({
          get: (name, id) => get(transaction, name, id),
          put: (name, id, record) => {
            const { _id: _ignored, ...data } = record
            return document(transaction, name, id).set({ data })
          },
          remove: (name, id) => document(transaction, name, id).remove(),
        }),
      ),
    scan: async (name, filter, order, limit) => {
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !['nextRunAt', 'expiresAt'].includes(order)
      )
        throw new Error('提醒掃描範圍無效')
      const where = Object.fromEntries(
        Object.entries(filter).map(([key, value]) => [
          key,
          value && typeof value === 'object' && Object.hasOwn(value, 'lte')
            ? db.command.lte(value.lte)
            : value,
        ]),
      )
      const result = await db
        .collection(collectionName(name))
        .where(where)
        .orderBy(order, 'asc')
        .limit(limit)
        .get()
      return result.data || []
    },
  }
}
module.exports = { createRepository, COLLECTIONS }
