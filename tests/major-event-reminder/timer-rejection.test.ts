import { expect, it, vi } from 'vitest'
import { require } from './helpers'
const { createHandler } = require('../../cloudfunctions/major-event-reminder-worker/handler.js')
it('拒絕日誌僅列白名單布林且不讀寫任務或改變拒絕回應', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  let accesses = 0
  const secret = '敏感原文不應輸出'
  const cloud = {
    database: () => ({
      collection: () => {
        accesses++
        throw new Error(secret)
      },
    }),
    getWXContext: () => ({
      SOURCE: `wx_trigger,scf,${secret}`,
      OPENID: secret,
      FROM_OPENID: secret,
      APPID: secret,
    }),
    openapi: {
      subscribeMessage: {
        send: () => {
          accesses++
          throw new Error(secret)
        },
      },
    },
  }
  try {
    const result = await createHandler(cloud, {
      MAJOR_REMINDER_APPID: secret,
      MAJOR_REMINDER_TRIGGER_NAME: secret,
      MAJOR_REMINDER_TIMER_TOKEN: secret,
      WX_API_TOKEN: secret,
      WX_CONTEXT_KEYS: secret,
    })(
      { Type: secret, TriggerName: secret, Time: secret, Message: secret },
      { function_name: secret, request_id: secret, time_limit_in_ms: secret },
    )
    expect(result).toEqual({
      ok: false,
      code: 'forbidden',
      message: '僅接受已配置的可信定時觸發器',
    })
    expect(accesses).toBe(0)
    expect(warn).toHaveBeenCalledTimes(1)
    const [label, predicates] = warn.mock.calls[0]!
    expect(label).toBe('major-reminder-timer-rejected')
    expect(predicates).toEqual({
      sourceIsWechatTimer: false,
      sourceIsNested: true,
      hasUser: true,
      fromUser: true,
      appidConfigured: true,
      appidMatches: true,
      functionNameMatches: false,
      hasRequestId: true,
      timeLimitValid: false,
      eventTypeTimer: false,
      eventTypeLowercaseTimer: false,
      triggerMatches: true,
      eventTimeValid: false,
      hasRequestIdSnake: true,
      hasRequestIdCamel: false,
      hasTimeLimit: true,
      hasAppId: true,
      hasContextKeys: true,
      hasApiToken: true,
      hasTriggerApiToken: false,
      hasSendFunction: true,
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret)
    expect(Object.values(predicates).every((value) => typeof value === 'boolean')).toBe(true)
  } finally {
    warn.mockRestore()
  }
})
