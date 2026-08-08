/**
 * Custom Officer Cloud Function Entry Point
 *
 * 处理自定义航海士提交（新增/列表）。
 * ownerUid 从 wxContext.OPENID 获取，不信任客户端传入。
 */

const cloud = require('wx-server-sdk')
const { createOfficerCustomService } = require('./officer-custom-service')
const { createRepository } = require('./officer-custom-repository')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const repo = createRepository(db)
const service = createOfficerCustomService(repo, cloud)

exports.main = async (event, _context) => {
  const { action, ...payload } = event ?? {}
  const wxContext = cloud.getWXContext()
  const ownerUid = wxContext.OPENID || null

  console.log(
    `[officer-custom] action=${action} owner=${ownerUid ? ownerUid.slice(0, 8) + '...' : 'null'}`,
  )

  try {
    const result = await service.dispatch(action, payload, ownerUid)
    console.log(`[officer-custom] ${action} result: ok=${result.ok}`)
    return result
  } catch (error) {
    console.error(`[officer-custom] ${action} error:`, error)
    return {
      ok: false,
      code: 'network',
      message: `伺服器錯誤: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
