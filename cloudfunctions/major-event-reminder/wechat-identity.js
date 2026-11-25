/** 僅讀取 SDK 每次呼叫的可信上下文；新帳號採獨立 owner，不改綁舊資料。 */
function resolveWechatIdentity(context) {
  if (!context || typeof context !== 'object') return null
  const resourceAppId = 'wx8f961bcd8b26996a'
  const consumerAppId = 'wxd0bc7afdc9cd334a'
  const nativeEnvironment = 'uwo-staging-d4guwh8hyd3932655'
  const text = (value) => typeof value === 'string' && value.length > 0 && value.length <= 100
  if (context.APPID === consumerAppId || context.ENV === nativeEnvironment) {
    if (
      context.APPID !== consumerAppId ||
      context.ENV !== nativeEnvironment ||
      !['wx_client', 'wx_devtools'].includes(context.SOURCE) ||
      ![undefined, ''].includes(context.FROM_APPID) ||
      ![undefined, ''].includes(context.FROM_OPENID) ||
      !text(context.OPENID)
    )
      return null
    return {
      appId: consumerAppId,
      openId: context.OPENID,
      ownerUid: consumerAppId + ':' + context.OPENID,
      shared: false,
    }
  }
  if (context.FROM_APPID || context.FROM_OPENID) {
    if (
      context.APPID !== resourceAppId ||
      context.FROM_APPID !== consumerAppId ||
      context.ENV !== 'cloud1-d7gxfuxfe813b4eaa' ||
      !['wx_client', 'wx_devtools'].includes(context.SOURCE) ||
      !text(context.FROM_OPENID)
    )
      return null
    return {
      appId: consumerAppId,
      openId: context.FROM_OPENID,
      ownerUid: consumerAppId + ':' + context.FROM_OPENID,
      shared: true,
    }
  }
  // 原服務的原生呼叫及服務端同步通道維持既有身份行為。
  return text(context.OPENID)
    ? {
        appId: context.APPID || resourceAppId,
        openId: context.OPENID,
        ownerUid: context.OPENID,
        shared: false,
      }
    : null
}
module.exports = { resolveWechatIdentity }
