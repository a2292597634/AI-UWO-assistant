const { createService } = require('./service')
const { createRepository } = require('./repository')
const { configFromEnvironment } = require('./config')
const generated = require('./reference-data.json')
function createHandler(cloud, env = process.env) {
  const service = createService(createRepository(cloud.database()), {
    ...generated,
    config: configFromEnvironment(env),
  })
  return async (event) => {
    // 必須在每次呼叫時取得微信上下文，不接受 payload 的 owner、收件者或訊息正文。
    const owner = cloud.getWXContext().OPENID || null
    // 微信平台會附加 userInfo、tcbContext；僅剝離這兩個欄位，身分仍只取可信上下文。
    const {
      action,
      userInfo: _platformUserInfo,
      tcbContext: _platformTcbContext,
      ...input
    } = event || {}
    return service.dispatch(action, input, owner)
  }
}
module.exports = { createHandler }
