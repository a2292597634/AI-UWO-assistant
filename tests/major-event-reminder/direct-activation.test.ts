import { afterEach, describe, expect, it, vi } from 'vitest'
import { configured, event, load, memoryRepository, reference, require } from './helpers'
import { forecastMajorEvents } from '../../miniprogram/subpkg-trade/domain/major-event-forecast'

const { createService, hash } = load('service')
const { createHandler } = load('handler')
const { createWorker } = require('../../cloudfunctions/major-event-reminder-worker/worker.js')
const templates = [10800, 3600, 600].map((leadSeconds, index) => ({
  leadSeconds,
  templateId: String(index + 1).repeat(43),
  title: ['活動參與通知', '新活動提醒', '會員活動提醒'][index],
  fields: configured.fields,
}))
const config = { ...configured, batchTemplates: templates }
const occurrence = {
  zoneId: event.zoneId,
  eventTypeId: event.eventTypeId,
  triggerAtUnixSeconds: event.triggerAtUnixSeconds,
}
function fixture(allowDirect: boolean | undefined = true) {
  let time = event.triggerAtUnixSeconds - 12000
  const repo = memoryRepository()
  const service = createService(repo, {
    config,
    reference,
    fingerprint: 'v1',
    ...(allowDirect === undefined ? {} : { allowDirect }),
    now: () => time,
  })
  return {
    repo,
    call: (action: string, input = {}, owner = 'a') => service.dispatch(action, input, owner),
    worker: (send: (input: unknown) => Promise<unknown>) =>
      createWorker(repo, {
        config,
        reference,
        fingerprint: 'v1',
        now: () => time,
        send,
      }),
    setTime: (value: number) => {
      time = value
    },
  }
}
async function prepare(f: ReturnType<typeof fixture>, action = 'prepareBatch', requestId = 'p') {
  const result = await f.call(action, { occurrence, requestId })
  expect(result.ok).toBe(true)
  return result.data.sessionId as string
}
async function authorize(f: ReturnType<typeof fixture>, sessionId: string, requestId = 'a') {
  expect(
    (
      await f.call('authorizeBatch', {
        sessionId,
        templateIds: templates.map((t) => t.templateId),
        requestId,
      })
    ).ok,
  ).toBe(true)
}
const rows = (f: ReturnType<typeof fixture>, collection: string) =>
  [...f.repo.snapshot()].filter(([key]) => key.startsWith(`${collection}/`))
const direct = (f: ReturnType<typeof fixture>, sessionId: string, requestId = 'direct') =>
  f.call('activateAuthorized', { sessionId, requestId })

describe('舊號無廣告批次開通', () => {
  it('完整授權直接建立三個任務，保持 DTO 並且不寫廣告權益', async () => {
    const f = fixture()
    const sessionId = await prepare(f)
    await authorize(f, sessionId)
    const result = await direct(f, sessionId)
    expect(result).toMatchObject({ ok: true, data: { subscription: { adCompleted: false } } })
    expect(Object.keys(result.data.subscription).sort()).toEqual([
      'adCompleted',
      'key',
      'slots',
      'version',
    ])
    expect(rows(f, 'jobs').map(([, job]) => [job.templateId, job.status])).toEqual(
      templates.map((t) => [t.templateId, 'pending']),
    )
    expect(rows(f, 'subscriptions')[0]![1].adCompleted).toBe(false)
    expect((await f.call('activate', { sessionId, requestId: 'old-activate' })).code).toBe(
      'ad-required',
    )
  })
  it.each([false, undefined])('開關 %s 不允許新 action 且沒有寫入', async (allowDirect) => {
    // undefined 明確省略 options，驗證預設關閉。
    const f = fixture(allowDirect === undefined ? false : allowDirect)
    const repo = f.repo
    const service = createService(repo, {
      config,
      reference,
      fingerprint: 'v1',
      ...(allowDirect === undefined ? {} : { allowDirect }),
    })
    expect(
      (await service.dispatch('activateAuthorized', { sessionId: 'x', requestId: 'x' }, 'a')).code,
    ).toBe('disabled')
    expect(repo.snapshot().size).toBe(0)
  })
  it('未完整批次授權不能借舊單槽授權或 legacy session 開通', async () => {
    const f = fixture()
    const legacy = await prepare(f, 'prepare')
    await f.call('authorize', { sessionId: legacy, leadSeconds: 600, requestId: 'legacy-auth' })
    expect((await direct(f, legacy)).code).toBe('invalid-session')
    const batch = await prepare(f, 'prepareBatch', 'batch')
    expect((await direct(f, batch)).code).toBe('authorization-required')
    expect(rows(f, 'jobs')).toHaveLength(0)
  })
  it.each(['authorized', 'templateId'])('批次授權標記不能取代有效槽位 %s 校驗', async (field) => {
    const f = fixture()
    const sessionId = await prepare(f)
    await authorize(f, sessionId)
    const [key, sub] = rows(f, 'subscriptions')[0]!
    const slots = sub.slots as Record<string, unknown>[]
    slots[0]![field] = field === 'authorized' ? false : configured.templateId
    await f.repo.transaction(async (tx) => {
      await tx.put('subscriptions', key.split('/')[1]!, sub)
    })
    const before = f.repo.snapshot()
    expect((await direct(f, sessionId)).code).toBe('authorization-required')
    expect(f.repo.snapshot()).toEqual(before)
  })
  it.each(['pending', 'sending', 'unknown', 'sent'])(
    '保留 legacy %s 槽與任務，同次完整批次授權可開其餘新槽',
    async (status) => {
      const f = fixture()
      const legacy = await prepare(f, 'prepare')
      await f.call('authorize', { sessionId: legacy, leadSeconds: 600, requestId: 'legacy-auth' })
      await f.call('completeAd', { sessionId: legacy, requestId: 'legacy-ad' })
      const [jobKey, oldJob] = rows(f, 'jobs')[0]!
      const [subKey, sub] = rows(f, 'subscriptions')[0]!
      await f.repo.transaction(async (tx) => {
        const slots = sub.slots as { leadSeconds: number; status: string }[]
        slots.find((slot) => slot.leadSeconds === 600)!.status = status
        await tx.put('subscriptions', subKey.split('/')[1]!, sub)
        await tx.put('jobs', jobKey.split('/')[1]!, { ...oldJob, status })
      })
      const protectedJob = await f.repo.get('jobs', jobKey.split('/')[1]!)
      const protectedSlot = structuredClone(
        (sub.slots as { leadSeconds: number }[]).find((slot) => slot.leadSeconds === 600),
      )
      const sessionId = await prepare(f, 'prepareBatch', 'batch')
      expect(
        (
          await f.call('authorizeBatch', {
            sessionId,
            templateIds: templates.slice(0, 2).map((t) => t.templateId),
            requestId: 'partial',
          })
        ).code,
      ).toBe('authorization-required')
      expect((await direct(f, sessionId, 'before-full-auth')).code).toBe('authorization-required')
      await authorize(f, sessionId, 'full-auth')
      expect((await direct(f, sessionId)).ok).toBe(true)
      expect(await f.repo.get('jobs', jobKey.split('/')[1]!)).toEqual(protectedJob)
      expect(
        (
          (await f.repo.get('subscriptions', subKey.split('/')[1]!))!.slots as {
            leadSeconds: number
          }[]
        ).find((slot) => slot.leadSeconds === 600),
      ).toEqual(protectedSlot)
      expect(
        rows(f, 'jobs')
          .filter(([, job]) => job.leadSeconds !== 600)
          .map(([, job]) => [job.templateId, job.status]),
      ).toEqual([
        [templates[0]!.templateId, 'pending'],
        [templates[1]!.templateId, 'pending'],
      ])
    },
  )
  it('併發同 requestId 只開通一次；換 action 衝突且多次開通不重建 pending', async () => {
    const f = fixture()
    const sessionId = await prepare(f)
    await authorize(f, sessionId)
    const results = await Promise.all(Array.from({ length: 5 }, () => direct(f, sessionId)))
    expect(results[0].ok).toBe(true)
    expect(results.every((result) => JSON.stringify(result) === JSON.stringify(results[0]))).toBe(
      true,
    )
    const jobs = rows(f, 'jobs')
    f.setTime(event.triggerAtUnixSeconds - 11900)
    expect((await direct(f, sessionId, 'another')).ok).toBe(true)
    expect(rows(f, 'jobs')).toEqual(jobs)
    expect((await f.call('completeAd', { sessionId, requestId: 'direct' })).code).toBe(
      'request-conflict',
    )
  })
  it('owner、指紋、取消 epoch 與場次到期均不能借道', async () => {
    const f = fixture()
    const sessionId = await prepare(f)
    await authorize(f, sessionId)
    expect((await f.call('activateAuthorized', { sessionId, requestId: 'other' }, 'b')).code).toBe(
      'not-found',
    )
    const changed = createService(f.repo, {
      config,
      reference,
      fingerprint: 'v2',
      allowDirect: true,
      now: () => event.triggerAtUnixSeconds - 12000,
    })
    expect(
      (await changed.dispatch('activateAuthorized', { sessionId, requestId: 'changed' }, 'a')).code,
    ).toBe('data-changed')
    const opened = await direct(f, sessionId)
    await f.call('cancel', {
      key: opened.data.subscription.key,
      expectedVersion: opened.data.subscription.version,
      requestId: 'cancel',
    })
    expect((await direct(f, sessionId, 'stale')).code).toBe('stale-session')
    const fresh = await prepare(f, 'prepareBatch', 'fresh')
    expect((await direct(f, fresh, 'no-reauth')).code).toBe('authorization-required')
    await authorize(f, fresh, 'reauth')
    expect((await direct(f, fresh, 'restore')).ok).toBe(true)
    expect(rows(f, 'jobs').every(([, job]) => job.generation === 2)).toBe(true)
    f.setTime(event.triggerAtUnixSeconds)
    expect((await direct(f, fresh, 'expired')).code).toBe('expired')
  })
  it('授權後跨過提醒時點不補發；全部錯過則拒絕', async () => {
    const f = fixture()
    const sessionId = await prepare(f)
    await authorize(f, sessionId)
    f.setTime(event.triggerAtUnixSeconds - 10000)
    expect((await direct(f, sessionId)).ok).toBe(true)
    expect(rows(f, 'jobs').map(([, job]) => job.leadSeconds)).toEqual([3600, 600])
    f.setTime(event.triggerAtUnixSeconds - 500)
    expect((await direct(f, sessionId, 'all-missed')).code).toBe('authorization-required')
  })
  it('session 自身過期時拒絕開通，即使場次與時點尚未開始', async () => {
    const f = fixture()
    const sessionId = await prepare(f)
    await authorize(f, sessionId)
    await f.repo.transaction(async (tx) => {
      const session = await tx.get('sessions', sessionId)
      await tx.put('sessions', sessionId, {
        ...session!,
        expiresAt: event.triggerAtUnixSeconds - 12000,
      })
    })
    const before = f.repo.snapshot()
    expect((await direct(f, sessionId)).code).toBe('expired')
    expect(f.repo.snapshot()).toEqual(before)
  })
  it.each(['sent', 'sending', 'unknown'])('保留舊廣告權益且不重建 %s job', async (status) => {
    const f = fixture()
    const sessionId = await prepare(f)
    await authorize(f, sessionId)
    await f.call('completeAd', { sessionId, requestId: 'ad' })
    const [key, job] = rows(f, 'jobs')[0]!
    await f.repo.transaction(async (tx) => {
      await tx.put('jobs', key.split('/')[1]!, { ...job, status })
      const [subKey, sub] = rows(f, 'subscriptions')[0]!
      // 模擬槽位仍待恢復，但舊任務已進入不可重送狀態；以任務終態優先。
      ;(sub.slots as { status: string }[])[0]!.status = 'authorized'
      await tx.put('subscriptions', subKey.split('/')[1]!, sub)
    })
    const before = rows(f, 'jobs')
    const result = await direct(f, sessionId)
    expect(result).toMatchObject({ ok: true, data: { subscription: { adCompleted: true } } })
    expect(rows(f, 'jobs')).toEqual(before)
    expect(result.data.subscription.slots[0].status).toBe(status)
  })
  it('被索引修剪的已授權流程不能突破20場上限', async () => {
    const f = fixture()
    const sessionId = await prepare(f)
    await authorize(f, sessionId)
    const subId = rows(f, 'subscriptions')[0]![0].split('/')[1]!
    await f.repo.transaction(async (tx) => {
      const owner = await tx.get('owners', hash('a'))
      owner!.active = []
      await tx.put('owners', hash('a'), owner!)
    })
    const others = forecastMajorEvents(reference, {
      nowUnixSeconds: event.triggerAtUnixSeconds - 12000,
      horizonHours: 168,
    })
      .filter((item) => item.key !== rows(f, 'subscriptions')[0]![1].key)
      .slice(0, 20)
    for (const [i, other] of others.entries())
      expect(
        (await f.call('prepareBatch', { occurrence: other, requestId: `other-${i}` })).ok,
      ).toBe(true)
    expect((await direct(f, sessionId)).code).toBe('limit')
    expect(rows(f, 'jobs')).toHaveLength(0)
    expect((await f.repo.get('owners', hash('a')))!.active).not.toContain(subId)
  })
})

describe('無廣告任務端到端發送與授權隔離', () => {
  async function opened() {
    const f = fixture()
    const sessionId = await prepare(f)
    await authorize(f, sessionId)
    expect((await direct(f, sessionId)).ok).toBe(true)
    f.setTime(event.triggerAtUnixSeconds - 10800)
    return { ...f, sessionId }
  }
  it('真service開通後T-3h由worker實際送出一次，保持廣告未完成', async () => {
    const f = await opened()
    const sent: unknown[] = []
    const worker = f.worker(async (input) => {
      sent.push(input)
      return { errcode: 0 }
    })
    expect((await worker.run()).claimed).toBe(1)
    expect(sent).toMatchObject([{ touser: 'a', templateId: templates[0]!.templateId }])
    expect(rows(f, 'jobs')[0]![1]).toMatchObject({
      status: 'sent',
      activationMode: 'authorization-only',
      activationEpoch: 1,
    })
    expect(rows(f, 'jobs').every(([, job]) => job.activationMode === 'authorization-only')).toBe(
      true,
    )
    expect(rows(f, 'subscriptions')[0]![1].adCompleted).toBe(false)
    await worker.run()
    expect(sent).toHaveLength(1)
  })
  it('legacy廣告開通不加新標記且仍可發送', async () => {
    const f = fixture()
    const sessionId = await prepare(f)
    await authorize(f, sessionId)
    await f.call('completeAd', { sessionId, requestId: 'ad' })
    expect(
      rows(f, 'jobs').every(
        ([, job]) =>
          !Object.prototype.hasOwnProperty.call(job, 'activationMode') &&
          !Object.prototype.hasOwnProperty.call(job, 'activationEpoch'),
      ),
    ).toBe(true)
    f.setTime(event.triggerAtUnixSeconds - 10800)
    const sent: unknown[] = []
    expect(
      (
        await f
          .worker(async (input) => {
            sent.push(input)
            return { errcode: 0 }
          })
          .run()
      ).claimed,
    ).toBe(1)
    expect(sent).toHaveLength(1)
  })
  it.each([undefined, 'other-mode'])('廣告未完成且標記為%s時不可送出', async (activationMode) => {
    const f = await opened()
    const [key, job] = rows(f, 'jobs')[0]!
    await f.repo.transaction(async (tx) => {
      const modified = { ...job, activationMode }
      if (activationMode === undefined) delete modified.activationMode
      await tx.put('jobs', key.split('/')[1]!, modified)
    })
    const sent: unknown[] = []
    expect(
      (
        await f
          .worker(async (input) => {
            sent.push(input)
            return { errcode: 0 }
          })
          .run()
      ).claimed,
    ).toBe(0)
    expect(sent).toHaveLength(0)
    expect((await f.repo.get('jobs', key.split('/')[1]!))!.status).toBe('cancelled')
  })
  it.each(['authorized', 'template', 'epoch', 'generation', 'due', 'occurrence', 'subId'])(
    'direct模式%s失配即使有舊廣告權益也不可發送',
    async (mismatch) => {
      const f = await opened()
      const [subKey, sub] = rows(f, 'subscriptions')[0]!
      sub.adCompleted = true
      const slot = (sub.slots as Record<string, unknown>[])[0]!
      if (mismatch === 'authorized') slot.authorized = false
      if (mismatch === 'template') slot.templateId = configured.templateId
      if (mismatch === 'epoch') sub.epoch = 2
      if (mismatch === 'generation') slot.generation = 2
      if (mismatch === 'due') slot.dueAtUnixSeconds = Number(slot.dueAtUnixSeconds) + 1
      if (mismatch === 'occurrence')
        sub.occurrence = {
          ...(sub.occurrence as object),
          triggerAtUnixSeconds: event.triggerAtUnixSeconds + 1,
        }
      if (mismatch === 'subId') sub.id = 'different-sub'
      await f.repo.transaction(async (tx) => {
        await tx.put('subscriptions', subKey.split('/')[1]!, sub)
      })
      const sent: unknown[] = []
      expect(
        (
          await f
            .worker(async (input) => {
              sent.push(input)
              return { errcode: 0 }
            })
            .run()
        ).claimed,
      ).toBe(0)
      expect(sent).toHaveLength(0)
      expect(rows(f, 'jobs')[0]![1].status).toBe('cancelled')
    },
  )
  it('取消後舊generation不發送，完整重授權只建立新epoch任務', async () => {
    const f = await opened()
    const current = (await f.call('list')).data.subscriptions[0]
    await f.call('cancel', {
      key: current.key,
      expectedVersion: current.version,
      requestId: 'cancel',
    })
    const sent: unknown[] = []
    const worker = f.worker(async (input) => {
      sent.push(input)
      return { errcode: 0 }
    })
    expect((await worker.run()).claimed).toBe(0)
    expect(sent).toHaveLength(0)
    // 開回提醒時3小時已到，不補此槽；只讓1小時與10分鐘任務使用新epoch。
    const fresh = await prepare(f, 'prepareBatch', 'fresh')
    await authorize(f, fresh, 'fresh-auth')
    expect((await direct(f, fresh, 'fresh-direct')).ok).toBe(true)
    const newJobs = rows(f, 'jobs').filter(([, job]) => job.status === 'pending')
    expect(
      newJobs.map(([, job]) => [job.leadSeconds, job.generation, job.activationEpoch]),
    ).toEqual([
      [3600, 2, 2],
      [600, 2, 2],
    ])
    f.setTime(event.triggerAtUnixSeconds - 3600)
    expect((await worker.run()).claimed).toBe(1)
    expect(sent).toMatchObject([{ templateId: templates[1]!.templateId }])
  })
  it('無廣告模式外部結果未知仍不可重送', async () => {
    const f = await opened()
    let sends = 0
    const worker = f.worker(async () => {
      sends += 1
      throw new Error('未知網路結果')
    })
    await worker.run()
    await worker.run()
    expect(sends).toBe(1)
    expect(rows(f, 'jobs')[0]![1].status).toBe('unknown')
  })
})

describe('新 action 僅允許可信舊號直接調用', () => {
  afterEach(() => vi.useRealTimers())
  function entry(wxContext: Record<string, unknown>, allow = 'true') {
    const records = new Map<string, Record<string, unknown>>()
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => ({ data: records.get(`${name}/${id}`) ?? [] }),
          set: async ({ data }: { data: Record<string, unknown> }) => {
            records.set(`${name}/${id}`, structuredClone(data))
          },
        }),
      }),
      runTransaction: async (fn: (client: unknown) => Promise<unknown>): Promise<unknown> => fn(db),
    }
    return createHandler(
      { database: () => db, getWXContext: () => wxContext },
      {
        MAJOR_REMINDER_ALLOW_DIRECT: allow,
        MAJOR_REMINDER_TEMPLATE_ID: configured.templateId,
        MAJOR_REMINDER_TEMPLATE_FIELDS: JSON.stringify(configured.fields),
        MAJOR_REMINDER_BATCH_TEMPLATES: JSON.stringify(templates),
        MAJOR_REMINDER_MINIPROGRAM_STATE: configured.miniprogramState,
      },
    )
  }
  it.each([{}, { FROM_APPID: '', FROM_OPENID: '' }])(
    '可信舊AppID原生空跨帳號欄位也可開通：%j',
    async (sourceFields) => {
      vi.useFakeTimers()
      vi.setSystemTime((event.triggerAtUnixSeconds - 12000) * 1000)
      const handle = entry({ APPID: 'wx8f961bcd8b26996a', OPENID: 'a', ...sourceFields })
      const prepared = await handle({ action: 'prepareBatch', occurrence, requestId: 'p' })
      const sessionId = prepared.data.sessionId
      expect(
        (
          await handle({
            action: 'authorizeBatch',
            sessionId,
            templateIds: templates.map((t) => t.templateId),
            requestId: 'a',
          })
        ).ok,
      ).toBe(true)
      expect(
        await handle({
          action: 'activateAuthorized',
          sessionId,
          requestId: 'direct',
          userInfo: { appId: 'forged' },
          tcbContext: { FROM_APPID: 'forged' },
        }),
      ).toMatchObject({ ok: true, data: { subscription: { adCompleted: false } } })
    },
  )
  it.each([
    { APPID: 'new-app', OPENID: 'a' },
    { OPENID: 'a' },
    { APPID: 'wx8f961bcd8b26996a', OPENID: 'a', FROM_APPID: 'new-app' },
    { APPID: 'wx8f961bcd8b26996a', OPENID: 'a', FROM_APPID: '', FROM_OPENID: 'foreign-owner' },
    { APPID: 'wx8f961bcd8b26996a', OPENID: 'a', FROM_APPID: null },
  ])('拒絕共享或缺失可信舊號來源 %j，舊 action 不受新限制', async (context) => {
    const handle = entry(context)
    expect(
      await handle({
        action: 'activateAuthorized',
        sessionId: 'x',
        requestId: 'x',
        userInfo: { appId: 'wx8f961bcd8b26996a' },
        tcbContext: { APPID: 'wx8f961bcd8b26996a' },
      }),
    ).toMatchObject({ ok: false, code: 'unauthorized' })
    if (context.FROM_APPID) {
      expect(await handle({ action: 'getBatchConfig' })).toMatchObject({
        ok: false,
        code: 'unauthorized',
      })
      expect(await handle({ action: 'list' })).toMatchObject({ ok: false, code: 'unauthorized' })
    } else {
      expect((await handle({ action: 'getBatchConfig' })).ok).toBe(true)
      if (context.FROM_OPENID)
        expect(await handle({ action: 'list' })).toMatchObject({ ok: false, code: 'unauthorized' })
      else expect((await handle({ action: 'list' })).ok).toBe(true)
    }
  })
  it('共享新號仍停用提醒且不得借用舊身份', async () => {
    const handle = entry({
      APPID: 'wx8f961bcd8b26996a',
      FROM_APPID: 'wxd0bc7afdc9cd334a',
      FROM_OPENID: 'new-owner',
      ENV: 'cloud1-d7gxfuxfe813b4eaa',
      SOURCE: 'wx_client',
    })
    expect(await handle({ action: 'getBatchConfig' })).toMatchObject({
      ok: true,
      data: { enabled: false, templates: [] },
    })
    expect(
      await handle({
        action: 'activateAuthorized',
        sessionId: 'old-session',
        requestId: 'new-direct',
      }),
    ).toMatchObject({ ok: false, code: 'disabled' })
    expect(await handle({ action: 'list' })).toMatchObject({
      ok: true,
      data: { subscriptions: [] },
    })
  })
  it.each(['', 'false', 'TRUE'])('環境開關 %s 不開啟直接激活', async (allow) => {
    expect(
      await entry(
        { APPID: 'wx8f961bcd8b26996a', OPENID: 'a' },
        allow,
      )({ action: 'activateAuthorized', sessionId: 'x', requestId: 'x' }),
    ).toMatchObject({ ok: false, code: 'disabled' })
  })
})
