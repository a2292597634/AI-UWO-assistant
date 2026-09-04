/**
 * 航海士资料投稿 Cloud Function 入口。
 *
 * 投稿者与小程序管理员的身份均来自 wxContext.OPENID；客户端传入的
 * ownerUid、isAdmin、reviewerUid 等字段不会参与权限判断。
 */

const referenceData = require('./reference-data.json')
const cloud = require('wx-server-sdk')
const { createOfficerCustomService } = require('./officer-custom-service')
const { createRepository } = require('./officer-custom-repository')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const repo = createRepository(db)

const parseOpenIds = (value) =>
  new Set(
    (typeof value === 'string' ? value : '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )

const adminOpenIds = parseOpenIds(process.env.OFFICER_ADMIN_OPENIDS)
const syncToken =
  typeof process.env.OFFICER_SYNC_TOKEN === 'string' ? process.env.OFFICER_SYNC_TOKEN.trim() : ''

const service = createOfficerCustomService(repo, cloud, {
  adminOpenIds,
  syncToken,
  referenceData,
})

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
