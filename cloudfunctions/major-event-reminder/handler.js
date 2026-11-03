const { createService } = require('./service')
const { createRepository } = require('./repository')
const { configFromEnvironment } = require('./config')
const generated = require('./reference-data.json')
const { resolveWechatIdentity } = require('./wechat-identity')
function createHandler(cloud, env = process.env) {
  const service = createService(createRepository(cloud.database()), {
    ...generated,
    config: configFromEnvironment(env),
    allowDirect: env.MAJOR_REMINDER_ALLOW_DIRECT === 'true',
  })
  return async (event) => {
    // 必須在每次呼叫時取得微信上下文，不接受 payload 的 owner、收件者或訊息正文。
    const current = cloud.getWXContext()
    const identity = resolveWechatIdentity(current)
    const owner = identity?.ownerUid || null
    // 微信平台會附加 userInfo、tcbContext；僅剝離這兩個欄位，身分仍只取可信上下文。
    const {
      action,
      userInfo: _platformUserInfo,
      tcbContext: _platformTcbContext,
      ...input
    } = event || {}
    if (current.FROM_APPID && !identity)
      return { ok: false, code: 'unauthorized', message: '無法確認小程序身分' }
    if (identity?.shared) {
      const reason = '新小程序提醒服務尚未完成設定'
      if (action === 'getConfig')
        return { ok: true, data: { enabled: false, reason, templateId: '', adUnitId: '' } }
      if (action === 'getBatchConfig')
        return { ok: true, data: { enabled: false, reason, templates: [], adUnitId: '' } }
      if (!['list', 'cancel'].includes(action))
        return { ok: false, code: 'disabled', message: reason }
    }
    if (
      action === 'activateAuthorized' &&
      (current.APPID !== 'wx8f961bcd8b26996a' ||
        [current.FROM_APPID, current.FROM_OPENID].some(
          (value) => value !== undefined && value !== '',
        ))
    ) {
      console.warn(
        'major-reminder-direct-rejected ' +
          JSON.stringify({
            oldAppIdMatches: current.APPID === 'wx8f961bcd8b26996a',
            hasAppId: typeof current.APPID === 'string' && current.APPID.length > 0,
            fromAppIdPresent: Object.hasOwn(current, 'FROM_APPID'),
            fromAppIdEmpty: current.FROM_APPID === '',
            fromOpenIdPresent: Object.hasOwn(current, 'FROM_OPENID'),
            fromOpenIdEmpty: current.FROM_OPENID === '',
            sourceClient: current.SOURCE === 'wx_client',
            sourceDevtools: current.SOURCE === 'wx_devtools',
          }),
      )
      return { ok: false, code: 'unauthorized', message: '請從舊版小程序直接操作提醒' }
    }
    return service.dispatch(action, input, owner)
  }
}
module.exports = { createHandler }
