import { existsSync, readFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configured, event, require } from './helpers'

const target = 'cloudfunctions/major-event-reminder-worker/handler.js'
const handler = existsSync(target)
  ? require('../../cloudfunctions/major-event-reminder-worker/handler.js')
  : {}
describe('可信排程與部署隔離', () => {
  it('接受長期存在的可信 Timer，拒絕客戶端偽造或缺少可信上下文', () => {
    expect(typeof handler.trustedTimer).toBe('function')
    const now = 1793200000
    const secret = 'a'.repeat(64)
    const env = {
      MAJOR_REMINDER_TIMER_TOKEN: secret,
      MAJOR_REMINDER_TRIGGER_NAME: 'major-reminder-minute',
    }
    const event = {
      Type: 'Timer',
      TriggerName: env.MAJOR_REMINDER_TRIGGER_NAME,
      Time: new Date(now * 1000).toISOString(),
      Message: secret,
    }
    const context = {
      request_id: 'request-platform',
      function_name: 'major-event-reminder-worker',
      time_limit_in_ms: 60000,
    }
    expect(handler.trustedTimer(event, {}, context, env, now)).toBe(true)
    for (const wx of [
      { OPENID: 'owner-a' },
      { SOURCE: 'wx_client' },
      { SOURCE: 'wx_client,scf' },
      { SOURCE: 'scf' },
      { SOURCE: 'wx_devtools' },
      { SOURCE: 'wx_http' },
    ])
      expect(handler.trustedTimer(event, wx, context, env, now)).toBe(false)
    expect(handler.trustedTimer({ ...event, Message: 'fake' }, {}, context, env, now)).toBe(false)
    expect(handler.trustedTimer(event, {}, {}, env, now)).toBe(false)
    expect(handler.trustedTimer(event, {}, context, {}, now)).toBe(false)
    expect(
      handler.trustedTimer(event, {}, { ...context, time_limit_in_ms: 120000 }, env, now),
    ).toBe(false)
    expect(handler.trustedTimer({ ...event, TriggerName: 'other' }, {}, context, env, now)).toBe(
      false,
    )
    expect(handler.trustedTimer(event, {}, context, env, now + 3600)).toBe(true)
    expect(handler.trustedTimer(event, {}, context, env, now + 365 * 86400)).toBe(true)
    expect(handler.trustedTimer({ ...event, Time: 'invalid' }, {}, context, env, now)).toBe(false)
  })
  it('兩個包的相對 require 不依賴包外路徑，僅 SDK 與 Node 內建可外部引用', () => {
    for (const name of ['major-event-reminder', 'major-event-reminder-worker']) {
      expect(existsSync(`cloudfunctions/${name}/index.js`)).toBe(true)
      const root = mkdtempSync(join(tmpdir(), `uwo-isolated-${name}-`))
      try {
        cpSync(`cloudfunctions/${name}`, root, { recursive: true })
        function walk(path: string) {
          const text = readFileSync(path, 'utf8')
          for (const [, dependency] of text.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
            if (dependency!.startsWith('.')) {
              const resolved = require.resolve(resolve(path, '..', dependency!))
              expect(resolved.startsWith(root)).toBe(true)
              if (resolved.endsWith('.js')) walk(resolved)
            } else
              expect(dependency === 'wx-server-sdk' || dependency?.startsWith('node:')).toBe(true)
          }
        }
        walk(join(root, 'index.js'))
        expect(
          JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages['']
            .dependencies['wx-server-sdk'],
        ).toBe('4.0.2')
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })
})

// 使用真實 handler、service、repository，僅以記憶體替代外部 CloudBase 儲存。
function businessEntry(extraEnvironment = {}) {
  const records = new Map<string, Record<string, unknown>>()
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ data: records.get(`${name}/${id}`) ?? [] }),
        set: async ({ data }: { data: Record<string, unknown> }) => {
          records.set(`${name}/${id}`, structuredClone(data))
        },
        remove: async () => {
          records.delete(`${name}/${id}`)
        },
      }),
    }),
    runTransaction: async (fn: (client: unknown) => Promise<unknown>): Promise<unknown> => fn(db),
  }
  let openid: string | undefined = 'owner-a'
  const { createHandler } = require('../../cloudfunctions/major-event-reminder/handler.js')
  return {
    handle: createHandler(
      { database: () => db, getWXContext: () => ({ OPENID: openid }) },
      {
        MAJOR_REMINDER_TEMPLATE_ID: configured.templateId,
        MAJOR_REMINDER_TEMPLATE_FIELDS: JSON.stringify(configured.fields),
        MAJOR_REMINDER_MINIPROGRAM_STATE: configured.miniprogramState,
        ...extraEnvironment,
      },
    ),
    setOwner: (value: string | undefined) => {
      openid = value
    },
    records,
  }
}

describe('業務入口的平台附加欄位與可信身分', () => {
  afterEach(() => vi.useRealTimers())
  it.each([{ userInfo: {} }, { tcbContext: {} }, { userInfo: {}, tcbContext: {} }])(
    '相容平台附加欄位組合 %j，缺可信身分仍不可列出提醒',
    async (platformFields) => {
      const { handle, setOwner } = businessEntry()
      expect(await handle({ action: 'getConfig', ...platformFields })).toMatchObject({ ok: true })
      setOwner(undefined)
      expect(await handle({ action: 'list', ...platformFields })).toMatchObject({
        ok: false,
        code: 'unauthorized',
      })
    },
  )
  it('平台 userInfo 與 tcbContext 不阻止配置與本人 prepare/list，且不能改寫上下文身分', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1793200000 * 1000)
    const { handle, setOwner, records } = businessEntry()
    const userInfo = { openId: 'forged-owner', appId: 'platform-app' }
    const tcbContext = { OPENID: 'forged-owner', ENV: 'forged-env' }
    expect(await handle({ action: 'getConfig', userInfo, tcbContext })).toMatchObject({
      ok: true,
      data: { enabled: true },
    })
    const prepared = await handle({
      action: 'prepare',
      occurrence: {
        zoneId: event.zoneId,
        eventTypeId: event.eventTypeId,
        triggerAtUnixSeconds: event.triggerAtUnixSeconds,
      },
      requestId: 'entry-prepare',
      userInfo,
      tcbContext,
    })
    expect(prepared).toMatchObject({ ok: true, data: { sessionId: expect.any(String) } })
    expect(
      [...records.values()]
        .filter((row) => 'ownerUid' in row)
        .every((row) => row.ownerUid === 'owner-a'),
    ).toBe(true)
    expect(await handle({ action: 'list', userInfo, tcbContext })).toMatchObject({
      ok: true,
      data: { subscriptions: [prepared.data.subscription] },
    })
    setOwner('owner-b')
    expect(await handle({ action: 'list', userInfo: { openId: 'owner-a' }, tcbContext })).toEqual({
      ok: true,
      data: { subscriptions: [] },
    })
    setOwner(undefined)
    for (const action of ['list', 'prepare'])
      expect(
        await handle({ action, userInfo: { openId: 'owner-a', OPENID: 'owner-a' }, tcbContext }),
      ).toMatchObject({ ok: false, code: 'unauthorized' })
  })
  it('仍拒絕未知業務欄位與直接偽造 owner 或 OPENID', async () => {
    const { handle } = businessEntry()
    for (const extra of [{ unknown: true }, { owner: 'owner-b' }, { OPENID: 'owner-b' }])
      expect(
        await handle({ action: 'getConfig', userInfo: {}, tcbContext: {}, ...extra }),
      ).toMatchObject({
        ok: false,
        code: 'invalid-input',
      })
  })
})

it('batch入口使用環境registry、可信owner及精確payload，保留舊配置四鍵', async () => {
  vi.useFakeTimers()
  try {
    vi.setSystemTime((event.triggerAtUnixSeconds - 12000) * 1000)
    const example = JSON.parse(
      readFileSync('cloudfunctions/major-event-reminder/config.example.json', 'utf8'),
    )
    const { handle, setOwner, records } = businessEntry({
      MAJOR_REMINDER_BATCH_TEMPLATES: example.MAJOR_REMINDER_BATCH_TEMPLATES,
    })
    const configuration = await handle({ action: 'getBatchConfig', userInfo: { openId: 'forged' } })
    expect(configuration.data.enabled).toBe(true)
    expect(configuration.data.templates.map((t: { leadSeconds: number }) => t.leadSeconds)).toEqual(
      [10800, 3600, 600],
    )
    expect(
      configuration.data.templates.every(
        (t: object) => Object.keys(t).sort().join(',') === 'leadSeconds,templateId,title',
      ),
    ).toBe(true)
    expect(Object.keys((await handle({ action: 'getConfig' })).data).sort()).toEqual([
      'adUnitId',
      'enabled',
      'reason',
      'templateId',
    ])
    expect((await handle({ action: 'getBatchConfig', owner: 'forged' })).code).toBe('invalid-input')
    const prepared = await handle({
      action: 'prepareBatch',
      occurrence: {
        zoneId: event.zoneId,
        eventTypeId: event.eventTypeId,
        triggerAtUnixSeconds: event.triggerAtUnixSeconds,
      },
      requestId: 'batch-p',
      tcbContext: { OPENID: 'forged' },
    })
    expect(prepared.ok).toBe(true)
    const input = {
      action: 'authorizeBatch',
      sessionId: prepared.data.sessionId,
      templateIds: configuration.data.templates.map((t: { templateId: string }) => t.templateId),
      requestId: 'batch-a',
    }
    setOwner('other')
    expect((await handle(input)).code).toBe('not-found')
    setOwner('owner-a')
    expect((await handle(input)).ok).toBe(true)
    expect(
      [...records.values()]
        .filter((row) => 'ownerUid' in row)
        .every((row) => row.ownerUid === 'owner-a'),
    ).toBe(true)
    setOwner(undefined)
    expect((await handle({ action: 'getBatchConfig' })).ok).toBe(true)
    expect((await handle(input)).code).toBe('unauthorized')
  } finally {
    vi.useRealTimers()
  }
})
