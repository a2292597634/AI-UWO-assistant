/**
 * Fleet Config Cloud Function Entry Point
 */

const cloud = require('wx-server-sdk')
const { createFleetConfigService } = require('./fleet-config-service')
const { createRepository } = require('./fleet-config-repository')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const repo = createRepository(db)
const service = createFleetConfigService(repo)

exports.main = async (event, _context) => {
  const { action, ...payload } = event ?? {}
  const wxContext = cloud.getWXContext()
  const ownerUid = wxContext.OPENID || null

  console.log(
    `[fleet-config] action=${action} owner=${ownerUid ? ownerUid.slice(0, 8) + '...' : 'null'}`,
  )

  try {
    const result = await service.dispatch(action, payload, ownerUid)
    console.log(`[fleet-config] ${action} result: ok=${result.ok}`)
    return result
  } catch (error) {
    console.error(`[fleet-config] ${action} error:`, error)
    return {
      ok: false,
      code: 'network',
      message: `Server error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
