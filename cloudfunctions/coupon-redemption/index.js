const crypto = require('node:crypto')
const cloud = require('wx-server-sdk')
const { resolveWechatIdentity } = require('./wechat-identity')
const { createLineGamesClient } = require('./line-games-client')
const { createCouponRedemptionService } = require('./coupon-redemption-service')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const service = createCouponRedemptionService({ client: createLineGamesClient() })

const getRequesterKey = () => {
  const openid = resolveWechatIdentity(cloud.getWXContext())?.ownerUid || 'anonymous'
  return crypto.createHash('sha256').update(openid).digest('hex').slice(0, 16)
}

exports.main = async (event, context) => {
  const requestId = typeof context?.requestId === 'string' ? context.requestId : 'unknown'
  try {
    const current = cloud.getWXContext()
    if (current.FROM_APPID && !resolveWechatIdentity(current)) {
      return { ok: false, code: 'unknown', message: '無法確認使用者身分，請稍後重試。' }
    }
    const result = await service.dispatch(event, getRequesterKey())
    console.log(
      `[coupon-redemption] requestId=${requestId} result=${result.ok ? result.data.code : result.code}`,
    )
    return result
  } catch (error) {
    console.error(
      `[coupon-redemption] requestId=${requestId} error`,
      error instanceof Error ? error.name : 'unknown',
    )
    return { ok: false, code: 'unknown', message: '結果未確認，請先到官方頁面確認再嘗試。' }
  }
}
