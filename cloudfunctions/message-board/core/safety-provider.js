function createSafetyProvider(cloud, appId, additionalAppIds = []) {
  const allowed = new Set([appId, ...additionalAppIds.filter((id) => id === 'wxd0bc7afdc9cd334a')])
  const securityFor = (ownerAppId) => {
    if (!allowed.has(ownerAppId)) throw new Error('安全檢查的來源 AppID 不受支援')
    return cloud.openapi({ appid: ownerAppId }).security
  }
  return {
    available(ownerAppId = appId) {
      return (
        allowed.has(ownerAppId) &&
        (['wx_client', 'wx_devtools'].includes(cloud.getWXContext()?.SOURCE) ||
          !!process.env.WX_TRIGGER_API_TOKEN_V0)
      )
    },
    async checkText(content, scene, openid, ownerAppId = appId) {
      const result = await securityFor(ownerAppId).msgSecCheck({
        content,
        openid,
        version: 2,
        scene,
      })
      return { errCode: result.errCode ?? result.errcode, suggest: result.result?.suggest }
    },
    async checkImage(mediaUrl, openid, ownerAppId = appId) {
      const result = await securityFor(ownerAppId).mediaCheckAsync({
        mediaUrl,
        openid,
        version: 2,
        scene: 1,
        mediaType: 2,
      })
      return {
        errCode: result.errCode ?? result.errcode,
        traceId: result.traceId ?? result.trace_id,
      }
    },
  }
}
module.exports = { createSafetyProvider }
