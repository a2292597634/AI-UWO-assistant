const { createService } = require('./service')
const { createRepository } = require('./repository')
const { configFromEnvironment } = require('./config')
const generated = require('./reference-data.json')
function createHandler(cloud, env = process.env) {
  const service = createService(createRepository(cloud.database()), {
    ...generated,
    config: configFromEnvironment(env),
    allowDirect: env.MAJOR_REMINDER_ALLOW_DIRECT === 'true',
  })
  return async (event) => {
    // 必須在每次呼叫時取得微信上下文，不接受 payload 的 owner、收件者或訊息正文。
    const wxContext = cloud.getWXContext()
    const owner = wxContext.OPENID || null
    // 微信平台會附加 userInfo、tcbContext；僅剝離這兩個欄位，身分仍只取可信上下文。
    const {
      action,
      userInfo: _platformUserInfo,
      tcbContext: _platformTcbContext,
      ...input
    } = event || {}
    if (
      action === 'activateAuthorized' &&
      (wxContext.APPID !== 'wx8f961bcd8b26996a' ||
        [wxContext.FROM_APPID, wxContext.FROM_OPENID].some(
          (value) => value !== undefined && value !== '',
        ))
    )
      return { ok: false, code: 'unauthorized', message: '請從舊版小程序直接操作提醒' }
    return service.dispatch(action, input, owner)
  }
}
module.exports = { createHandler }
