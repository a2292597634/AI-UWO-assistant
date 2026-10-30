import { expect, it } from 'vitest'
import { require } from './helpers'
const { runtimeHealth } = require('../../cloudfunctions/major-event-reminder-worker/handler.js')

it('沒有到期任務的可信 Timer 仍回傳健康布林值，未授權不回傳', async () => {
  const { createHandler } = require('../../cloudfunctions/major-event-reminder-worker/handler.js')
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    get: async () => ({ data: [] }),
  }
  const cloud = {
    database: () => ({ collection: () => query, command: { lte: (value: number) => value } }),
    getWXContext: () => ({ APPID: 'secret' }),
    openapi: {
      subscribeMessage: {
        send() {
          throw new Error('不應發送')
        },
      },
    },
  }
  const env = {
    MAJOR_REMINDER_TIMER_TOKEN: 'a'.repeat(64),
    MAJOR_REMINDER_TRIGGER_NAME: 'minute',
    WX_API_TOKEN: 'secret',
  }
  const handle = createHandler(cloud, env)
  const event = {
    Type: 'Timer',
    TriggerName: 'minute',
    Message: env.MAJOR_REMINDER_TIMER_TOKEN,
    Time: '2026-10-30T00:00:00Z',
  }
  const context = {
    request_id: 'platform',
    function_name: 'major-event-reminder-worker',
    time_limit_in_ms: 60000,
  }
  expect((await handle(event, context)).data.runtimeHealth).toMatchObject({
    hasApiToken: true,
    hasAppId: true,
  })
  expect(await handle({ ...event, Message: 'invalid' }, context)).not.toHaveProperty('data')
})

it('健康快照只返回已核對 SDK 來源的布林值，不宣稱代理代表權限', () => {
  expect(typeof runtimeHealth).toBe('function')
  expect(
    runtimeHealth(
      { openapi: { subscribeMessage: { send() {} } } },
      { APPID: 'secret' },
      {
        WX_API_TOKEN: 'secret',
        WX_TRIGGER_API_TOKEN_V0: 'secret',
        WX_CONTEXT_KEYS: 'secret',
      },
    ),
  ).toEqual({
    hasAppId: true,
    hasContextKeys: true,
    hasApiToken: true,
    hasTriggerApiToken: true,
    hasSendFunction: true,
  })
  expect(runtimeHealth({}, {}, {})).toEqual({
    hasAppId: false,
    hasContextKeys: false,
    hasApiToken: false,
    hasTriggerApiToken: false,
    hasSendFunction: false,
  })
})
