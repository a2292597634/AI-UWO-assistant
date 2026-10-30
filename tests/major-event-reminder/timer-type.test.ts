import { expect, it } from 'vitest'
import { require } from './helpers'
const { trustedTimer } = require('../../cloudfunctions/major-event-reminder-worker/handler.js')
const env = {
  MAJOR_REMINDER_APPID: 'wx8f961bcd8b26996a',
  MAJOR_REMINDER_TRIGGER_NAME: 'minute',
  MAJOR_REMINDER_TIMER_TOKEN: 'a'.repeat(64),
}
const event = {
  Type: 'timer',
  TriggerName: 'minute',
  Time: '2026-10-30T00:00:00Z',
  Message: env.MAJOR_REMINDER_TIMER_TOKEN,
}
const context = {
  request_id: 'platform',
  function_name: 'major-event-reminder-worker',
  time_limit_in_ms: 60000,
}
const wx = { SOURCE: 'wx_trigger', APPID: env.MAJOR_REMINDER_APPID }
it('精確微信 Timer 接受小寫 timer，普通 SCF 仍只接受大寫 Timer', () => {
  expect(trustedTimer(event, wx, context, env)).toBe(true)
  expect(trustedTimer(event, {}, context, env)).toBe(false)
  expect(trustedTimer({ ...event, Type: 'Timer' }, wx, context, env)).toBe(true)
  expect(trustedTimer({ ...event, Type: 'Timer' }, {}, context, env)).toBe(true)
})
it('小寫 timer 不放寬微信身分、平台上下文或其他 Timer 欄位', () => {
  for (const identity of [
    { ...wx, SOURCE: 'wx_client' },
    { ...wx, SOURCE: 'wx_trigger,scf' },
    { ...wx, APPID: 'other' },
    { ...wx, OPENID: 'owner' },
    { ...wx, FROM_OPENID: 'owner' },
  ])
    expect(trustedTimer(event, identity, context, env)).toBe(false)
  for (const Type of ['TIMER', ' timer', 'timer ', 'Timer?', '', null, 1])
    expect(trustedTimer({ ...event, Type }, wx, context, env)).toBe(false)
  expect(trustedTimer(event, wx, { ...context, time_limit_in_ms: 60001 }, env)).toBe(false)
  expect(trustedTimer({ ...event, TriggerName: 'other' }, wx, context, env)).toBe(false)
  expect(trustedTimer({ ...event, Time: 'invalid' }, wx, context, env)).toBe(false)
})
