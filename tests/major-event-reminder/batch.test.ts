import { describe, expect, it } from 'vitest'
import { configured, event, load, memoryRepository, reference, require } from './helpers'

const { createService } = load('service')
const configModule = load('config')
const { createWorker } = require('../../cloudfunctions/major-event-reminder-worker/worker.js')
const leads = [10800, 3600, 600]
const templates = leads.map((leadSeconds, index) => ({
  leadSeconds,
  templateId: String(index + 1).repeat(43),
  title: ['活动参与通知', '新活动提醒', '会员活动提醒'][index],
  fields: [
    { source: 'start', key: ['time3', 'time2', 'time4'][index], type: 'time' },
    { source: 'activity', key: ['thing1', 'thing10', 'thing1'][index], type: 'thing' },
  ],
}))
const batchConfig = { ...configured, batchTemplates: templates }
const occurrence = {
  zoneId: event.zoneId,
  eventTypeId: event.eventTypeId,
  triggerAtUnixSeconds: event.triggerAtUnixSeconds,
}
function fixture(config = batchConfig) {
  let time = event.triggerAtUnixSeconds - 12000
  const repo = memoryRepository()
  const service = createService(repo, { config, reference, fingerprint: 'v1', now: () => time })
  return {
    repo,
    call: (action: string, input = {}, owner = 'a') => service.dispatch(action, input, owner),
    setTime: (value: number) => {
      time = value
    },
    worker: (workerConfig = config, send = async (_input: unknown) => ({ errcode: 0 })) =>
      createWorker(repo, {
        config: workerConfig,
        reference,
        fingerprint: 'v1',
        now: () => time,
        send,
      }),
  }
}
async function prepare(f: ReturnType<typeof fixture>, action = 'prepareBatch', requestId = 'p') {
  const result = await f.call(action, { occurrence, requestId })
  expect(result.ok).toBe(true)
  return result.data.sessionId as string
}
async function authorize(f: ReturnType<typeof fixture>, sessionId: string, requestId = 'a') {
  return f.call('authorizeBatch', {
    sessionId,
    templateIds: templates.map((t) => t.templateId),
    requestId,
  })
}
const jobs = (f: ReturnType<typeof fixture>) =>
  [...f.repo.snapshot()].filter(([key]) => key.startsWith('jobs/')).map(([, value]) => value)

describe('單開關批次後端與舊契約相容', () => {
  it('新增配置只公開三模板且舊配置精確四鍵，環境解析 registry', async () => {
    const f = fixture()
    expect(await f.call('getBatchConfig')).toEqual({
      ok: true,
      data: {
        enabled: true,
        reason: null,
        adUnitId: configModule.AD_UNIT_ID,
        templates: templates.map(({ leadSeconds, templateId, title }) => ({
          leadSeconds,
          templateId,
          title,
        })),
      },
    })
    expect(Object.keys((await f.call('getConfig')).data).sort()).toEqual([
      'adUnitId',
      'enabled',
      'reason',
      'templateId',
    ])
    expect(
      configModule.configFromEnvironment({
        MAJOR_REMINDER_BATCH_TEMPLATES: JSON.stringify(templates),
      }).batchTemplates,
    ).toEqual(templates)
  })
  it('拒絕無效或重複 registry 且不阻斷 legacy config', async () => {
    for (const batchTemplates of [
      null,
      [],
      templates.slice(1),
      [templates[0], templates[0], templates[2]],
      templates.map((t) => ({ ...t, title: '同名' })),
      templates.map((t) => ({ ...t, fields: [] })),
    ]) {
      const f = fixture({ ...configured, batchTemplates } as typeof batchConfig)
      expect((await f.call('getBatchConfig')).data).toMatchObject({ enabled: false, templates: [] })
      expect((await f.call('getConfig')).data.enabled).toBe(true)
    }
  })
  it('同ID字段衝突停用batch，legacy解析仍使用primary', async () => {
    const f = fixture({ ...batchConfig, templateId: templates[0]!.templateId })
    expect((await f.call('getBatchConfig')).data.enabled).toBe(false)
    expect(
      configModule.resolveJobConfig(
        { ...batchConfig, templateId: templates[0]!.templateId },
        templates[0]!.templateId,
      ).fields,
    ).toEqual(configured.fields)
  })
  it('完整接受原子綁定三槽，廣告後三job各自模板；重放不新增，DTO不洩漏綁定', async () => {
    const f = fixture()
    const sessionId = await prepare(f)
    const auth = await authorize(f, sessionId)
    expect(auth.ok).toBe(true)
    expect(await authorize(f, sessionId)).toEqual(auth)
    expect(jobs(f)).toHaveLength(0)
    const result = await f.call('completeAd', { sessionId, requestId: 'ad' })
    expect(result.ok).toBe(true)
    expect(Object.keys(result.data.subscription).sort()).toEqual([
      'adCompleted',
      'key',
      'slots',
      'version',
    ])
    expect(jobs(f).map((j) => j.templateId)).toEqual(templates.map((t) => t.templateId))
    expect(await f.call('completeAd', { sessionId, requestId: 'ad' })).toEqual(result)
    expect(jobs(f)).toHaveLength(3)
    const sub = [...f.repo.snapshot()].find(([key]) => key.startsWith('subscriptions/'))![1]
    expect((sub.slots as { templateId: string }[]).map((s) => s.templateId)).toEqual(
      templates.map((t) => t.templateId),
    )
  })
  it('拒絕不完整、未知、重複授權與跨owner/session mode且不改槽', async () => {
    const f = fixture()
    const sessionId = await prepare(f)
    for (const [i, templateIds] of [
      [templates[0]!.templateId],
      ['unknown'],
      [templates[0]!.templateId, templates[0]!.templateId],
      null,
    ].entries()) {
      expect(
        (await f.call('authorizeBatch', { sessionId, templateIds, requestId: `bad${i}` })).ok,
      ).toBe(false)
    }
    expect(
      (
        await f.call(
          'authorizeBatch',
          { sessionId, templateIds: templates.map((t) => t.templateId), requestId: 'owner' },
          'b',
        )
      ).ok,
    ).toBe(false)
    expect(
      (await f.call('authorize', { sessionId, leadSeconds: 600, requestId: 'legacy-on-batch' })).ok,
    ).toBe(false)
    const legacy = await prepare(f, 'prepare', 'legacy')
    expect((await authorize(f, legacy)).ok).toBe(false)
    expect(jobs(f)).toHaveLength(0)
    expect(
      (await f.call('list')).data.subscriptions[0].slots.every(
        (s: { status: string }) => s.status === 'unsubscribed',
      ),
    ).toBe(true)
  })
  it('過期已知ID可忽略，不補發；跨過時點廣告仍保存權益', async () => {
    const f = fixture()
    const sessionId = await prepare(f)
    f.setTime(event.triggerAtUnixSeconds - 10000)
    expect(
      (
        await f.call('authorizeBatch', {
          sessionId,
          templateIds: templates.slice(1).map((t) => t.templateId),
          requestId: 'late',
        })
      ).ok,
    ).toBe(true)
    f.setTime(event.triggerAtUnixSeconds - 500)
    const result = await f.call('completeAd', { sessionId, requestId: 'ad' })
    expect(result.ok).toBe(true)
    expect(result.data.subscription.adCompleted).toBe(true)
    expect(jobs(f)).toHaveLength(0)
  })
  it('legacy流程及無綁定slot仍用primary，新registry缺失不破壞新pending', async () => {
    const f = fixture()
    const legacy = await prepare(f, 'prepare')
    await f.call('authorize', { sessionId: legacy, leadSeconds: 10800, requestId: 'la' })
    await f.call('completeAd', { sessionId: legacy, requestId: 'lad' })
    f.setTime(event.triggerAtUnixSeconds - 10800)
    const sent: unknown[] = []
    expect(
      (
        await f
          .worker({ ...configured, batchTemplates: [] } as typeof batchConfig, async (input) => {
            sent.push(input)
            return { errcode: 0 }
          })
          .run()
      ).claimed,
    ).toBe(1)
    expect(sent).toMatchObject([
      { templateId: configured.templateId, data: { time3: expect.anything() } },
    ])
    const b = fixture()
    const sessionId = await prepare(b)
    await authorize(b, sessionId)
    await b.call('completeAd', { sessionId, requestId: 'ad' })
    b.setTime(event.triggerAtUnixSeconds - 10800)
    expect(
      (await b.worker({ ...configured, batchTemplates: [] } as typeof batchConfig).run()).claimed,
    ).toBe(0)
    expect(jobs(b).every((j) => j.status === 'pending')).toBe(true)
  })
  it('worker按job模板發送三欄位組並保留未知不重送及取消epoch', async () => {
    const f = fixture()
    const sessionId = await prepare(f)
    await authorize(f, sessionId)
    await f.call('completeAd', { sessionId, requestId: 'ad' })
    const sent: { templateId: string; data: object }[] = []
    const worker = f.worker(batchConfig, async (input) => {
      sent.push(input as (typeof sent)[number])
      return { errcode: 0 }
    })
    for (const lead of leads) {
      f.setTime(event.triggerAtUnixSeconds - lead)
      await worker.run()
    }
    expect(sent.map((s) => s.templateId)).toEqual(templates.map((t) => t.templateId))
    expect(sent.map((s) => Object.keys(s.data).sort())).toEqual([
      ['thing1', 'time3'],
      ['thing10', 'time2'],
      ['thing1', 'time4'],
    ])
    expect((await worker.run()).claimed).toBe(0)
  })
})

it('batch會話不可借舊單時點授權繞過完整授權；保留既有權益與槽', async () => {
  const f = fixture()
  const legacy = await prepare(f, 'prepare', 'legacy')
  await f.call('authorize', { sessionId: legacy, leadSeconds: 600, requestId: 'legacy-auth' })
  const sessionId = await prepare(f, 'prepareBatch', 'batch')
  expect((await f.call('completeAd', { sessionId, requestId: 'bypass' })).code).toBe(
    'authorization-required',
  )
  expect(jobs(f)).toHaveLength(0)
})

it('batch重新授權保護pending/sending/unknown/sent，取消後重綁generation，舊session失效', async () => {
  const f = fixture()
  const sessionId = await prepare(f)
  await authorize(f, sessionId)
  const opened = await f.call('completeAd', { sessionId, requestId: 'ad' })
  const initial = jobs(f)
  const other = await prepare(f, 'prepareBatch', 'another')
  await authorize(f, other, 'again')
  expect(jobs(f)).toEqual(initial)
  const subEntry = [...f.repo.snapshot()].find(([key]) => key.startsWith('subscriptions/'))!
  for (const status of ['sending', 'unknown', 'sent']) {
    await f.repo.transaction(async (tx) => {
      const sub = await tx.get('subscriptions', subEntry[0].split('/')[1]!)
      const slots = sub!.slots as { status: string }[]
      for (const slot of slots) slot.status = status
      sub!.cleanupEligible = status === 'sent'
      await tx.put('subscriptions', subEntry[0].split('/')[1]!, sub!)
    })
    const before = f.repo.snapshot()
    expect((await authorize(f, other, `protected-${status}`)).ok).toBe(true)
    expect(await f.repo.get('subscriptions', subEntry[0].split('/')[1]!)).toEqual(
      before.get(subEntry[0]),
    )
  }
  // 恢復pending以核對取消及generation；終態本身不重送。
  await f.repo.transaction(async (tx) => {
    await tx.put('subscriptions', subEntry[0].split('/')[1]!, {
      ...subEntry[1],
      version: opened.data.subscription.version,
    })
  })
  expect(
    (
      await f.call('cancel', {
        key: opened.data.subscription.key,
        expectedVersion: opened.data.subscription.version,
        requestId: 'cancel',
      })
    ).ok,
  ).toBe(true)
  expect((await authorize(f, sessionId, 'stale')).code).toBe('stale-session')
  const fresh = await prepare(f, 'prepareBatch', 'fresh')
  await authorize(f, fresh, 'fresh-auth')
  await f.call('activate', { sessionId: fresh, requestId: 'restore' })
  expect(jobs(f).every((j) => j.generation === 2)).toBe(true)
})

it('批次worker外部未知不重送，取消後其餘pending不可發送', async () => {
  const f = fixture()
  const sessionId = await prepare(f)
  await authorize(f, sessionId)
  await f.call('completeAd', { sessionId, requestId: 'ad' })
  f.setTime(event.triggerAtUnixSeconds - 10800)
  let sent = 0
  const worker = f.worker(batchConfig, async () => {
    sent += 1
    throw new Error('未知網路結果')
  })
  await worker.run()
  await worker.run()
  expect(sent).toBe(1)
  expect(jobs(f)[0]!.status).toBe('unknown')
  const sub = (await f.call('list')).data.subscriptions[0]
  await f.call('cancel', { key: sub.key, expectedVersion: sub.version, requestId: 'cancel' })
  f.setTime(event.triggerAtUnixSeconds - 600)
  await worker.run()
  expect(sent).toBe(1)
  expect(jobs(f).map((j) => j.status)).toEqual(['unknown', 'cancelled', 'cancelled'])
})

it('批次prepare與authorize都守護20場限制，過期session與request衝突拒絕', async () => {
  const { forecastMajorEvents } =
    await import('../../miniprogram/subpkg-trade/domain/major-event-forecast')
  const f = fixture()
  const sessionId = await prepare(f)
  const otherEvents = forecastMajorEvents(reference, {
    nowUnixSeconds: event.triggerAtUnixSeconds - 12000,
    horizonHours: 168,
  })
    .filter(
      (item) => item.key !== `${event.zoneId}:${event.eventTypeId}:${event.triggerAtUnixSeconds}`,
    )
    .slice(0, 20)
  for (const [i, other] of otherEvents.entries()) {
    const result = await f.call('prepareBatch', { occurrence: other, requestId: `other-${i}` })
    expect(result.ok).toBe(i < 19)
    if (i === 19) expect(result.code).toBe('limit')
  }
  expect((await f.call('prepareBatch', { occurrence, requestId: 'other-0' })).code).toBe(
    'request-conflict',
  )
  const sessionEntry = [...f.repo.snapshot()].find(([key]) => key === `sessions/${sessionId}`)![1]
  // 模擬owner索引已因另一輪prepare修剪此場，但仍保留其session供恢復。
  await f.repo.transaction(async (tx) => {
    const { hash } = load('service')
    const owner = await tx.get('owners', hash('a'))
    owner!.active = (owner!.active as string[]).filter((id) => id !== sessionEntry.subId)
    await tx.put('owners', hash('a'), owner!)
  })
  expect(
    (await f.call('prepareBatch', { occurrence: otherEvents[19], requestId: 'fill' })).ok,
  ).toBe(true)
  expect((await authorize(f, sessionId)).code).toBe('limit')
  f.setTime(event.triggerAtUnixSeconds)
  expect((await authorize(f, sessionId, 'expired')).code).toBe('expired')
})

it('有效batch不依賴legacy配置啟用，但不允許停用legacy會話繞道', async () => {
  const f = fixture({ ...batchConfig, templateId: '' })
  expect((await f.call('getBatchConfig')).data.enabled).toBe(true)
  expect((await f.call('getConfig')).data.enabled).toBe(false)
  const sessionId = await prepare(f)
  expect((await authorize(f, sessionId)).ok).toBe(true)
  expect((await f.call('completeAd', { sessionId, requestId: 'ad' })).ok).toBe(true)
  expect(jobs(f)).toHaveLength(3)
})

it('真模板範例與primary重合時相容，無效registry JSON不影響legacy', async () => {
  const { readFileSync } = await import('node:fs')
  const example = JSON.parse(
    readFileSync('cloudfunctions/major-event-reminder/config.example.json', 'utf8'),
  )
  const config = configModule.configFromEnvironment({
    ...example,
    MAJOR_REMINDER_MINIPROGRAM_STATE: 'developer',
  })
  expect(configModule.validateBatchConfig(config).enabled).toBe(true)
  expect(
    config.batchTemplates.map((t: { fields: { key: string }[] }) => t.fields.map((f) => f.key)),
  ).toEqual([
    ['time3', 'thing1'],
    ['time2', 'thing10'],
    ['time4', 'thing1'],
  ])
  for (const raw of ['{', 'null', 'false', '[]']) {
    const invalid = configModule.configFromEnvironment({
      ...example,
      MAJOR_REMINDER_MINIPROGRAM_STATE: 'developer',
      MAJOR_REMINDER_BATCH_TEMPLATES: raw,
    })
    expect(configModule.validateBatchConfig(invalid)).toMatchObject({
      enabled: false,
      templates: [],
    })
    expect(configModule.validateConfig(invalid).enabled).toBe(true)
  }
})

it.each([30, 301])('registry空窗延後後於%s秒恢復，窗口內可發且窗口外不補', async (delay) => {
  const f = fixture()
  const sessionId = await prepare(f)
  await authorize(f, sessionId)
  await f.call('completeAd', { sessionId, requestId: 'ad' })
  f.setTime(event.triggerAtUnixSeconds - 10800)
  await f.worker({ ...configured, batchTemplates: [] } as typeof batchConfig).run()
  expect(jobs(f)[0]!.status).toBe('pending')
  expect(Number(jobs(f)[0]!.nextRunAt)).toBeGreaterThan(event.triggerAtUnixSeconds - 10800)
  f.setTime(event.triggerAtUnixSeconds - 10800 + delay)
  const sent: unknown[] = []
  await f
    .worker(batchConfig, async (input) => {
      sent.push(input)
      return { errcode: 0 }
    })
    .run()
  expect(jobs(f)[0]!.status).toBe(delay <= 300 ? 'sent' : 'missed')
  expect(sent).toHaveLength(delay <= 300 ? 1 : 0)
})
