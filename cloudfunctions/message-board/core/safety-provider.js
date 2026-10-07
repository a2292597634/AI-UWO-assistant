function createSafetyProvider(cloud, appId) {
  const security = cloud.openapi({ appid: appId }).security
  return {
    available() {
      return (
        ['wx_client', 'wx_devtools'].includes(cloud.getWXContext()?.SOURCE) ||
        !!process.env.WX_TRIGGER_API_TOKEN_V0
      )
    },
    async checkText(content, scene, openid) {
      const result = await security.msgSecCheck({ content, openid, version: 2, scene })
      return { errCode: result.errCode ?? result.errcode, suggest: result.result?.suggest }
    },
    async checkImage(mediaUrl, openid) {
      const result = await security.mediaCheckAsync({
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
