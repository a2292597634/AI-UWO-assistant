import { expect, it } from 'vitest'
import { require } from './helpers'
const {
  trustedTimer,
  createHandler,
} = require('../../cloudfunctions/major-event-reminder-worker/handler.js')
const env = {
  MAJOR_REMINDER_APPID: 'wx8f961bcd8b26996a',
  MAJOR_REMINDER_TRIGGER_NAME: 'major-reminder-minute',
  MAJOR_REMINDER_TIMER_TOKEN: 'a'.repeat(64),
}
const timer = {
  Type: 'Timer',
  TriggerName: 'major-reminder-minute',
  Time: '2026-10-29T00:00:00Z',
  Message: '',
}
const platform = {
  request_id: 'platform-request',
  function_name: 'major-event-reminder-worker',
  time_limit_in_ms: 60000,
}
const wxTimer = { SOURCE: 'wx_trigger', APPID: 'wx8f961bcd8b26996a' }

it('精確微信 Timer 不要求官方 Message 等於 SCF 私密參數', () => {
  expect(trustedTimer(timer, wxTimer, platform, env)).toBe(true)
  expect(trustedTimer({ ...timer, Message: 'official-message' }, wxTimer, platform, env)).toBe(true)
})
it('拒絕微信身分、巢狀調用鏈、錯誤 AppID 與偽造 event context', () => {
  for (const wx of [
    { ...wxTimer, OPENID: 'owner' },
    { ...wxTimer, FROM_OPENID: 'owner' },
    { ...wxTimer, APPID: 'other' },
    { SOURCE: 'wx_trigger' },
    ...[
      'wx_client',
      'wx_devtools',
      'wx_http',
      'wx_trigger,scf',
      'scf,wx_trigger',
      ' wx_trigger',
      'wx_trigger ',
    ].map((SOURCE) => ({ ...wxTimer, SOURCE })),
  ])
    expect(
      trustedTimer({ ...timer, Message: env.MAJOR_REMINDER_TIMER_TOKEN }, wx, platform, env),
    ).toBe(false)
  expect(trustedTimer(timer, wxTimer, platform, { ...env, MAJOR_REMINDER_APPID: '' })).toBe(false)
  expect(trustedTimer({ ...timer, tcbContext: wxTimer, context: platform }, {}, {}, env)).toBe(
    false,
  )
  expect(
    trustedTimer(
      { ...timer, Message: env.MAJOR_REMINDER_TIMER_TOKEN },
      { FROM_OPENID: 'owner' },
      platform,
      env,
    ),
  ).toBe(false)
})
it('微信 Timer 仍要求完整平台上下文與固定 Timer envelope', () => {
  for (const context of [
    {},
    { ...platform, request_id: '' },
    { ...platform, function_name: 'other' },
    { ...platform, time_limit_in_ms: 60001 },
    { ...platform, time_limit_in_ms: 0 },
  ])
    expect(trustedTimer(timer, wxTimer, context, env)).toBe(false)
  for (const event of [
    { ...timer, Type: 'Request' },
    { ...timer, TriggerName: 'other' },
    { ...timer, Time: 'invalid' },
  ])
    expect(trustedTimer(event, wxTimer, platform, env)).toBe(false)
})
it.each([{}, { WX_API_TOKEN: '' }, { WX_TRIGGER_API_TOKEN_V0: '' }])(
  '可信 SCF 無微信票據時不查詢、不清理、不領取任務 %j',
  async (tokens) => {
    let reads = 0
    const cloud = {
      database: () => ({
        collection: () => {
          reads++
          throw new Error('不應讀取任務')
        },
      }),
      getWXContext: () => ({}),
      openapi: {
        subscribeMessage: {
          send: () => {
            throw new Error('不應發送')
          },
        },
      },
    }
    const result = await createHandler(cloud, { ...env, ...tokens })(
      { ...timer, Message: env.MAJOR_REMINDER_TIMER_TOKEN },
      platform,
    )
    expect(result).toMatchObject({
      ok: false,
      code: 'wechat-context-unavailable',
      data: { runtimeHealth: { hasApiToken: false, hasTriggerApiToken: false } },
    })
    expect(reads).toBe(0)
  },
)
it.each([{ WX_API_TOKEN: 'ticket' }, { WX_TRIGGER_API_TOKEN_V0: 'ticket' }])(
  '微信 Timer 有平台票據時可執行空佇列 %j',
  async (tokens) => {
    const query = {
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      get: async () => ({ data: [] }),
    }
    const cloud = {
      database: () => ({ collection: () => query, command: { lte: (value: number) => value } }),
      getWXContext: () => wxTimer,
      openapi: {
        subscribeMessage: {
          send: () => {
            throw new Error('空佇列不應發送')
          },
        },
      },
    }
    expect(await createHandler(cloud, { ...env, ...tokens })(timer, platform)).toMatchObject({
      ok: true,
      data: { runtimeHealth: { hasAppId: true } },
    })
  },
)
it('微信 Timer 缺票據仍只回健康診斷，客戶端偽造 event 身分不能取得健康', async () => {
  const cloud = { database: () => ({}), getWXContext: () => wxTimer }
  expect(await createHandler(cloud, env)(timer, platform)).toMatchObject({
    ok: false,
    code: 'wechat-context-unavailable',
  })
  const client = { ...cloud, getWXContext: () => ({ SOURCE: 'wx_client', OPENID: 'owner' }) }
  const result = await createHandler(client, { ...env, WX_API_TOKEN: 'ticket' })(
    {
      ...timer,
      SOURCE: 'wx_trigger',
      APPID: env.MAJOR_REMINDER_APPID,
      tcbContext: wxTimer,
      Message: env.MAJOR_REMINDER_TIMER_TOKEN,
    },
    platform,
  )
  expect(result).toMatchObject({ ok: false, code: 'forbidden' })
  expect(result).not.toHaveProperty('data')
})
