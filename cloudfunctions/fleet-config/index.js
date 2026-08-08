/**
 * Fleet Config Cloud Function Entry Point
 */

const cloud = require('wx-server-sdk')
const {
  createFleetConfigService,
  getRequestId,
  logServerError,
  createSafeServerError,
} = require('./fleet-config-service')
const { createRepository } = require('./fleet-config-repository')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const repo = createRepository(db)
const service = createFleetConfigService(repo)

exports.main = async (event, context) => {
  const { action, ...payload } = event ?? {}
  const requestId = getRequestId(context)

  try {
    const wxContext = cloud.getWXContext()
    const ownerUid = wxContext.OPENID || null
    console.log(
      `[fleet-config] action=${action} owner=${ownerUid ? ownerUid.slice(0, 8) + '...' : 'null'}`,
    )
    const result = await service.dispatch(action, payload, ownerUid)
    console.log(`[fleet-config] ${action} requestId=${requestId} result: ok=${result.ok}`)
    return result
  } catch (error) {
    logServerError(action, requestId, error)
    return createSafeServerError()
  }
}
