const { timingSafeEqual } = require('node:crypto')
const { createWorker } = require('./worker')
const { createRepository } = require('./shared/repository')
const { configFromEnvironment } = require('./shared/config')
const generated = require('./reference-data.json')
function runtimeHealth(cloud, wxContext, env) {
  // SDK 會從 getWXContext 排除票據；僅檢查環境變數是否存在，絕不返回值。
  // openapi 是代理，函數存在只代表介面形狀，不代表票據有效或有發送權限。
  return {
    hasAppId: Boolean(wxContext?.APPID),
    hasContextKeys: Boolean(env.WX_CONTEXT_KEYS),
    hasApiToken: Boolean(env.WX_API_TOKEN),
    hasTriggerApiToken: Boolean(env.WX_TRIGGER_API_TOKEN_V0),
    hasSendFunction: typeof cloud.openapi?.subscribeMessage?.send === 'function',
  }
}
function timerRejectionPredicates(event, wxContext, context, env, cloud) {
  const source = typeof wxContext?.SOURCE === 'string' ? wxContext.SOURCE : ''
  // 僅輸出固定白名單布林值；不得加入任何平台原值或巢狀物件。
  return {
    sourceIsWechatTimer: source === 'wx_trigger',
    sourceIsNested: source.includes(','),
    hasUser: Boolean(wxContext?.OPENID),
    fromUser: Boolean(wxContext?.FROM_OPENID),
    appidConfigured: Boolean(env.MAJOR_REMINDER_APPID),
    appidMatches:
      Boolean(env.MAJOR_REMINDER_APPID) && wxContext?.APPID === env.MAJOR_REMINDER_APPID,
    functionNameMatches: context?.function_name === 'major-event-reminder-worker',
    hasRequestId: Boolean(context?.request_id || context?.requestId),
    timeLimitValid:
      Number.isFinite(context?.time_limit_in_ms) &&
      context.time_limit_in_ms > 0 &&
      context.time_limit_in_ms <= 60000,
    eventTypeTimer: event?.Type === 'Timer',
    eventTypeLowercaseTimer: event?.Type === 'timer',
    triggerMatches:
      Boolean(env.MAJOR_REMINDER_TRIGGER_NAME) &&
      event?.TriggerName === env.MAJOR_REMINDER_TRIGGER_NAME,
    eventTimeValid: typeof event?.Time === 'string' && Number.isFinite(Date.parse(event.Time)),
    hasRequestIdSnake: context?.request_id !== undefined,
    hasRequestIdCamel: context?.requestId !== undefined,
    hasTimeLimit: context?.time_limit_in_ms !== undefined,
    ...runtimeHealth(cloud, wxContext, env),
  }
}
function trustedTimer(event, wxContext, context, env) {
  const token = env.MAJOR_REMINDER_TIMER_TOKEN || ''
  const source = typeof wxContext?.SOURCE === 'string' ? wxContext.SOURCE : ''
  if (
    wxContext?.OPENID ||
    wxContext?.FROM_OPENID ||
    (source !== 'wx_trigger' &&
      source.split(',').some((item) => item.trim().startsWith('wx_') || item.trim() === 'scf'))
  )
    return false
  // SOURCE 的「其他」不是 Timer 證明，需平台上下文＋受限調用權限＋私密 CustomArgument。
  if (
    !context ||
    !(context.request_id || context.requestId) ||
    context.function_name !== 'major-event-reminder-worker'
  )
    return false
  if (
    !Number.isFinite(context.time_limit_in_ms) ||
    context.time_limit_in_ms <= 0 ||
    context.time_limit_in_ms > 60000
  )
    return false
  if (
    !env.MAJOR_REMINDER_TRIGGER_NAME ||
    !(event?.Type === 'Timer' || (source === 'wx_trigger' && event?.Type === 'timer')) ||
    event.TriggerName !== env.MAJOR_REMINDER_TRIGGER_NAME
  )
    return false
  // 官方 Time 是 Timer 建立時間，不能用來限制本輪觸發的新鮮度。
  const time = typeof event.Time === 'string' ? Date.parse(event.Time) : NaN
  if (!Number.isFinite(time)) return false
  // 微信 IDE 上傳的官方 Timer 身分來自 SDK 平台環境，不能取自 event。
  // 官方 Message 不承載 SCF 私密參數；僅接受精確來源與配置的 AppID。
  if (source === 'wx_trigger')
    return Boolean(env.MAJOR_REMINDER_APPID) && wxContext.APPID === env.MAJOR_REMINDER_APPID
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(event?.Message || '')) return false
  return timingSafeEqual(Buffer.from(token), Buffer.from(event.Message))
}
function createHandler(cloud, env = process.env, now = () => Math.floor(Date.now() / 1000)) {
  const worker = createWorker(createRepository(cloud.database()), {
    ...generated,
    config: configFromEnvironment(env),
    now,
    send: (payload) => cloud.openapi.subscribeMessage.send(payload),
  })
  return async (event, context) => {
    const wxContext = cloud.getWXContext()
    if (!trustedTimer(event, wxContext, context, env)) {
      console.warn(
        'major-reminder-timer-rejected',
        timerRejectionPredicates(event, wxContext, context, env, cloud),
      )
      return { ok: false, code: 'forbidden', message: '僅接受已配置的可信定時觸發器' }
    }
    const health = runtimeHealth(cloud, wxContext, env)
    // 先驗證可信來源，再只讀檢查平台票據；缺失時不得領取或清理任何任務。
    if (!health.hasApiToken && !health.hasTriggerApiToken)
      return {
        ok: false,
        code: 'wechat-context-unavailable',
        message: '定時觸發缺少微信雲調用上下文，請透過微信開發者工具上傳觸發器',
        data: { runtimeHealth: health },
      }
    try {
      const result = await worker.run()
      const cleanup = await worker.cleanup()
      return { ok: true, data: { ...result, ...cleanup, runtimeHealth: health } }
    } catch {
      // 不輸出 event／token／OpenID 或可能含密鑰的 SDK 例外。
      return { ok: false, code: 'network', message: '本輪排程未完成，請檢查服務端執行紀錄' }
    }
  }
}
module.exports = { trustedTimer, createHandler, runtimeHealth }
