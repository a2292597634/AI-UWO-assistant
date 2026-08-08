/**
 * Custom Officer Repository
 *
 * CloudBase 数据库读写层。所有查询包含服务端 ownerUid 条件。
 * 绝不接受客户端传来的 ownerUid 或 openid。
 */

const COLLECTION = 'custom_officers'

/**
 * @param {object} db - CloudBase database instance from cloud.database()
 */
function createRepository(db) {
  const collection = db.collection(COLLECTION)

  let collectionReady = false

  async function ensureCollection() {
    if (collectionReady) return
    try {
      await db.createCollection(COLLECTION)
    } catch {
      // 集合已存在或正在创建，忽略
    }
    collectionReady = true
  }

  /**
   * 按 owner 列出所有自定义航海士
   * @param {string} ownerUid
   * @returns {Promise<object[]>}
   */
  async function listByOwner(ownerUid) {
    await ensureCollection()
    const result = await collection.where({ ownerUid }).get()
    return result.data.sort((a, b) => {
      const aTime = a.createdAt ?? ''
      const bTime = b.createdAt ?? ''
      return bTime.localeCompare(aTime)
    })
  }

  /**
   * 按 officerId 查找（全局唯一性检查）
   * @param {string} officerId
   * @returns {Promise<object|null>}
   */
  async function findByOfficerId(officerId) {
    await ensureCollection()
    const result = await collection.where({ officerId }).limit(1).get()
    return result.data.length > 0 ? result.data[0] : null
  }

  /**
   * 按 owner 统计提交数量
   * @param {string} ownerUid
   * @returns {Promise<number>}
   */
  async function countByOwner(ownerUid) {
    await ensureCollection()
    const result = await collection.where({ ownerUid }).count()
    return result.total
  }

  /**
   * 插入新的自定义航海士记录
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
      status: 'pending', // pending / approved / rejected
    }
    const result = await collection.add({ data: doc })
    return { ...doc, _id: result._id }
  }

  /**
   * 查询所有自定义航海士（用于运行时合并，不区分 owner）
   * @returns {Promise<object[]>}
   */
  async function listAll() {
    await ensureCollection()
    const result = await collection.where({ status: 'pending' }).get()
    // Also get approved ones
    const approvedResult = await collection.where({ status: 'approved' }).get()
    return [...result.data, ...approvedResult.data]
  }

  return {
    listByOwner,
    findByOfficerId,
    countByOwner,
    insert,
    listAll,
  }
}

module.exports = { createRepository }
