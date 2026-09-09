/** 航海士維護工單雲函數入口。OpenID 一律由 CloudBase context 取得。 */

const cloud = require('wx-server-sdk')
const { createRepository } = require('./repository')
const { createOfficerMaintenanceService } = require('./service')
const { uploadPortrait } = require('./portrait-upload')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const parseOpenIds = (value) =>
  new Set(
    (typeof value === 'string' ? value : '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )

const loadReferenceData = () => {
  try {
    return require('./reference-data.json')
  } catch {
    // 參考資料由後續資料生成流程寫入；未就緒時採空 allow-list，安全地拒絕寫入。
    return {}
  }
}

const configuredAdminOpenIds = new Set([
  ...parseOpenIds(process.env.OFFICER_MAINTENANCE_ADMIN_OPENIDS),
  // 舊投稿與維護工作台共用產品管理員白名單，避免既有管理員突然失去審核入口。
  ...parseOpenIds(process.env.OFFICER_ADMIN_OPENIDS),
])
const configuredSyncToken = asTrimmedToken(
  process.env.OFFICER_MAINTENANCE_SYNC_TOKEN || process.env.OFFICER_SYNC_TOKEN,
)

const repo = createRepository(cloud.database())
const service = createOfficerMaintenanceService(repo, {
  adminOpenIds: configuredAdminOpenIds,
  syncToken: configuredSyncToken,
  referenceData: loadReferenceData(),
  uploadPortrait,
  cloud,
})

function asTrimmedToken(value) {
  return typeof value === 'string' ? value.trim() : ''
}

exports.main = async (event, context) => {
  const { action, ...payload } = event ?? {}
  const requestId = asTrimmedToken(context?.requestId) || `req-${Date.now().toString(36)}`
  try {
    const openid = cloud.getWXContext().OPENID || null
    const result = await service.dispatch(action, payload, openid)
    console.log(`[officer-maintenance] action=${action} requestId=${requestId} ok=${result.ok}`)
    return result
  } catch (error) {
    console.error(`[officer-maintenance] action=${action} requestId=${requestId}`, error)
    return { ok: false, code: 'network', message: '伺服器暫時無法處理請求，請稍後再試' }
  }
}
