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

const getRequestId = (context) => {
  const requestId = context && typeof context.requestId === 'string' ? context.requestId.trim() : ''
  return requestId || `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const createSafeServerError = () => ({
  ok: false,
  code: 'network',
  message: '伺服器暫時無法處理請求，請稍後再試',
})

exports.main = async (event, context) => {
  const { action, ...payload } = event ?? {}
  const requestId = getRequestId(context)
  const wxContext = cloud.getWXContext()
  const ownerUid = wxContext.OPENID || null

  console.log(
    `[officer-custom] action=${action} owner=${ownerUid ? ownerUid.slice(0, 8) + '...' : 'null'}`,
  )

  try {
    const result = await service.dispatch(action, payload, ownerUid)
    console.log(`[officer-custom] ${action} requestId=${requestId} result: ok=${result.ok}`)
    return result
  } catch (error) {
    console.error(`[officer-custom] ${action} error requestId=${requestId}`, error)
    return createSafeServerError()
  }
}
