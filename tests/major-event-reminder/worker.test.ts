import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { configured, event, load, memoryRepository, reference, require } from './helpers'

const module = existsSync('cloudfunctions/major-event-reminder-worker/worker.js')
  ? require('../../cloudfunctions/major-event-reminder-worker/worker.js')
  : {}
const { createService } = load('service')
async function fixture(leads = [600]) {
  expect(typeof module.createWorker).toBe('function')
  let now = event.triggerAtUnixSeconds - 12000
  const repo = memoryRepository()
  const service = createService(repo, {
    reference,
    fingerprint: 'data-v1',
    config: configured,
    now: () => now,
  })
  const prepared = await service.dispatch(
    'prepare',
    {
      occurrence: {
        zoneId: event.zoneId,
        eventTypeId: event.eventTypeId,
        triggerAtUnixSeconds: event.triggerAtUnixSeconds,
      },
      requestId: 'prepare',
    },
    'owner-a',
  )
  const sessionId = prepared.data.sessionId
  for (const leadSeconds of leads)
    await service.dispatch(
      'authorize',
      { sessionId, leadSeconds, requestId: `auth-${leadSeconds}` },
      'owner-a',
    )
  await service.dispatch('completeAd', { sessionId, requestId: 'ad' }, 'owner-a')
  now = event.triggerAtUnixSeconds - Math.max(...leads)
  const deliveries: object[] = []
  const worker = (
    send = async (payload: object) => {
      deliveries.push(payload)
      return { errcode: 0 }
    },
    fingerprint = 'data-v1',
  ) =>
    module.createWorker(repo, { reference, fingerprint, config: configured, now: () => now, send })
  const jobs = () =>
    [...repo.snapshot().entries()].filter(([key]) => key.startsWith('jobs/')).map(([, row]) => row)
  return {
    repo,
    service,
    worker,
    deliveries,
    jobs,
    sessionId,
    setNow: (value: number) => {
      now = value
    },
  }
}
describe('排程原子領取及未知結果', () => {
  it.each([
    [
      { errCode: -501007, errMsg: 'missing wxCloudApiToken secret owner-a' },
      { reason: 'missing-wx-cloud-api-token', errCode: -501007 },
    ],
    [
      { code: 'ETIMEDOUT', message: 'secret owner-a' },
      { reason: 'network-error', networkCode: 'ETIMEDOUT' },
    ],
    [
      { errCode: 48001, message: 'secret' },
      { reason: 'permission-denied', errCode: 48001 },
    ],
    [
      { errCode: -9, message: 'secret' },
      { reason: 'sdk-error', errCode: -9 },
    ],
    [{ code: 'secret-owner-a', message: 'secret' }, { reason: 'unknown' }],
  ])('例外只保留受限診斷且不改變 unknown 與重試規則 %j', async (error, diagnostic) => {
    const f = await fixture()
    await f
      .worker(async () => {
        throw error
      })
      .run()
    expect(f.jobs()[0]).toMatchObject({
      status: 'unknown',
      attempts: 1,
      resultCode: 'network-unknown',
      deliveryDiagnostic: diagnostic,
    })
    expect(f.jobs()[0]?.deliveryDiagnostic).toEqual(diagnostic)
    await f.worker().run()
    expect(f.jobs()[0]?.attempts).toBe(1)
  })
  it.each([-1, 45009])(
    'sending 中取消後微信回覆 %s 未受理，轉 cancelled 且不再自動重試',
    async (errcode) => {
      const f = await fixture()
      let started!: () => void
      let finish!: (value: { errcode: number }) => void
      const began = new Promise<void>((resolve) => {
        started = resolve
      })
      const running = f
        .worker(async (payload: object) => {
          f.deliveries.push(payload)
          started()
          return new Promise<{ errcode: number }>((resolve) => {
            finish = resolve
          })
        })
        .run()
      await began
      const current = (await f.service.dispatch('list', {}, 'owner-a')).data.subscriptions[0]
      expect(
        (
          await f.service.dispatch(
            'cancel',
            { key: current.key, expectedVersion: current.version, requestId: `cancel-${errcode}` },
            'owner-a',
          )
        ).ok,
      ).toBe(true)
      finish({ errcode })
      await running
      expect(f.jobs()[0]).toMatchObject({ status: 'cancelled', resultCode: errcode })
      expect(
        (await f.service.dispatch('list', {}, 'owner-a')).data.subscriptions[0].slots[2].status,
      ).toBe('cancelled')
      f.setNow(event.triggerAtUnixSeconds - 570)
      await f.worker().run()
      expect(f.deliveries).toHaveLength(1)
    },
  )
  it('sending 中取消後的未知結果仍保持 unknown，不宣稱可撤回或重試', async () => {
    const f = await fixture()
    let started!: () => void
    let rejectSend!: (error: Error) => void
    const began = new Promise<void>((resolve) => {
      started = resolve
    })
    const running = f
      .worker(async () => {
        started()
        return new Promise<{ errcode: number }>((_resolve, reject) => {
          rejectSend = reject
        })
      })
      .run()
    await began
    const current = (await f.service.dispatch('list', {}, 'owner-a')).data.subscriptions[0]
    await f.service.dispatch(
      'cancel',
      { key: current.key, expectedVersion: current.version, requestId: 'cancel-unknown' },
      'owner-a',
    )
    rejectSend(new Error('timeout'))
    await running
    expect(f.jobs()[0]?.status).toBe('unknown')
    await f.worker().run()
    expect(f.deliveries).toHaveLength(0)
  })
  it('真正 SDK 的 errCode 0 為已提交，字串形式的0不可視為成功', async () => {
    const first = await fixture()
    await first.worker(async () => ({ errCode: 0 }) as unknown as { errcode: number }).run()
    expect(first.jobs()[0]?.status).toBe('sent')
    const second = await fixture()
    await second.worker(async () => ({ errcode: '0' }) as unknown as { errcode: number }).run()
    expect(second.jobs()[0]?.status).toBe('unknown')
  })
  it('外部請求一直未返回時有界結束為 unknown，之後不重發', async () => {
    const f = await fixture()
    let attempts = 0
    await module
      .createWorker(f.repo, {
        reference,
        fingerprint: 'data-v1',
        config: configured,
        now: () => event.triggerAtUnixSeconds - 600,
        timeoutMilliseconds: 1,
        send: async () => {
          attempts++
          return new Promise(() => {})
        },
      })
      .run()
    expect(f.jobs()[0]?.status).toBe('unknown')
    await f.worker().run()
    expect(attempts).toBe(1)
    expect(f.deliveries).toHaveLength(0)
  })
  it('已進入 sending 後取消不宣稱撤回，外部成功仍寫回 sent', async () => {
    const f = await fixture()
    let started!: () => void
    let finish!: (value: { errcode: number }) => void
    const began = new Promise<void>((resolve) => {
      started = resolve
    })
    const running = f
      .worker(async () => {
        started()
        return new Promise<{ errcode: number }>((resolve) => {
          finish = resolve
        })
      })
      .run()
    await began
    const current = (await f.service.dispatch('list', {}, 'owner-a')).data.subscriptions[0]
    const cancelled = await f.service.dispatch(
      'cancel',
      { key: current.key, expectedVersion: current.version, requestId: 'cancel-sending' },
      'owner-a',
    )
    expect(cancelled.data.subscription.slots[2].status).toBe('sending')
    finish({ errcode: 0 })
    await running
    expect(f.jobs()[0]?.status).toBe('sent')
  })
  it('重疊執行只取一次，已提交微信不再重送', async () => {
    const f = await fixture()
    await Promise.all([f.worker().run(), f.worker().run()])
    await f.worker().run()
    expect(f.deliveries).toHaveLength(1)
    expect(f.jobs()[0]?.status).toBe('sent')
    expect(f.deliveries[0]).toMatchObject({
      touser: 'owner-a',
      templateId: configured.templateId,
      data: { thing5: { value: '依週期預測，實際狀態以遊戲為準' } },
    })
  })
  it('拋出網路例外為 unknown，後續不盲重試且保留模板鎖', async () => {
    const f = await fixture()
    let attempts = 0
    await f
      .worker(async () => {
        attempts++
        throw new Error('request timed out')
      })
      .run()
    await f.worker().run()
    expect(attempts).toBe(1)
    expect(f.deliveries).toHaveLength(0)
    expect(f.jobs()[0]?.status).toBe('unknown')
    expect(
      [...f.repo.snapshot().entries()].filter(
        ([key, row]) => key.startsWith('locks/') && row.status === 'unknown',
      ),
    ).toHaveLength(1)
  })
  it('sending 租約過期只能轉 unknown，不能再次發送', async () => {
    const f = await fixture()
    await f.repo.transaction(async (tx) => {
      const row = f.jobs()[0]!
      await tx.put('jobs', String(row.id), {
        ...row,
        status: 'sending',
        attemptId: 'old',
        nextRunAt: Number(row.dueAt) - 1,
        leaseUntil: Number(row.dueAt) - 1,
      })
    })
    await f.worker().run()
    expect(f.jobs()[0]?.status).toBe('unknown')
    expect(f.deliveries).toHaveLength(0)
  })
  it('unknown 原 job 不重發，但在可信最長執行期限後不同 job 可繼續', async () => {
    const f = await fixture()
    await f
      .worker(async () => {
        throw new Error('timeout')
      })
      .run()
    const original = f.jobs()[0]!
    await f.repo.transaction(async (tx) => {
      const sub = await tx.get('subscriptions', String(original.subId))
      await tx.put('subscriptions', 'second-sub', {
        ...sub,
        id: 'second-sub',
        slots: (sub!.slots as Record<string, unknown>[]).map((slot) => ({
          ...slot,
          status: slot.leadSeconds === 600 ? 'pending' : slot.status,
        })),
      })
      await tx.put('jobs', 'second-job', {
        ...original,
        id: 'second-job',
        subId: 'second-sub',
        status: 'pending',
        nextRunAt: original.dueAt,
        attemptId: undefined,
      })
    })
    f.setNow(event.triggerAtUnixSeconds - 481)
    await f.worker().run()
    expect(f.deliveries).toHaveLength(0)
    f.setNow(event.triggerAtUnixSeconds - 480)
    await f.worker().run()
    expect(f.deliveries).toHaveLength(1)
    expect(f.jobs().find((job) => job.id === original.id)?.status).toBe('unknown')
    expect(f.jobs().find((job) => job.id === 'second-job')?.status).toBe('sent')
  })
  it('明確未受理的系統繁忙才在窗口內有限退避，43101 寫回失敗', async () => {
    const f = await fixture()
    await f.worker(async () => ({ errcode: -1 })).run()
    expect(f.jobs()[0]).toMatchObject({ status: 'pending', attempts: 1 })
    f.setNow(event.triggerAtUnixSeconds - 570)
    await f.worker(async () => ({ errcode: 43101 })).run()
    expect(f.jobs()[0]).toMatchObject({ status: 'failed', resultCode: 43101 })
    expect(
      (await f.service.dispatch('list', {}, 'owner-a')).data.subscriptions[0].slots[2].status,
    ).toBe('failed')
  })
  it('取消、資料漂移、過期及超過五分鐘窗口全部排除', async () => {
    for (const reason of ['cancelled', 'changed', 'window', 'started']) {
      const f = await fixture()
      if (reason === 'cancelled') {
        const sub = (await f.service.dispatch('list', {}, 'owner-a')).data.subscriptions[0]
        await f.service.dispatch(
          'cancel',
          { key: sub.key, expectedVersion: sub.version, requestId: 'cancel' },
          'owner-a',
        )
      }
      if (reason === 'window') f.setNow(event.triggerAtUnixSeconds - 299)
      if (reason === 'started') f.setNow(event.triggerAtUnixSeconds)
      await f.worker(undefined, reason === 'changed' ? 'data-v2' : 'data-v1').run()
      expect(f.deliveries).toHaveLength(0)
      expect(f.jobs()[0]?.status).toBe(
        reason === 'cancelled' ? 'cancelled' : reason === 'changed' ? 'failed' : 'missed',
      )
    }
  })
  it('同一用戶模板跨場串行，第一項外部呼叫未結束前第二項不發送', async () => {
    const f = await fixture()
    const firstJob = f.jobs()[0]!
    await f.repo.transaction(async (tx) => {
      const sub = await tx.get('subscriptions', String(firstJob.subId))
      await tx.put('subscriptions', 'second-sub', { ...sub, id: 'second-sub' })
      await tx.put('jobs', 'second-job', { ...firstJob, id: 'second-job', subId: 'second-sub' })
    })
    let finish!: (value: { errcode: number }) => void
    let started!: () => void
    const began = new Promise<void>((resolve) => {
      started = resolve
    })
    const run = f
      .worker(async (payload: object) => {
        f.deliveries.push(payload)
        started()
        return new Promise<{ errcode: number }>((resolve) => {
          finish = resolve
        })
      })
      .run()
    await began
    await f.worker().run()
    expect(f.deliveries).toHaveLength(1)
    finish({ errcode: 0 })
    await run
    await f.worker().run()
    expect(f.deliveries).toHaveLength(2)
  })
  it('三十天清理有界，只刪終態；pending、sending、unknown 一律保留', async () => {
    const f = await fixture()
    await f.repo.transaction(async (tx) => {
      for (let n = 0; n < 65; n++) await tx.put('operations', `old-${n}`, { expiresAt: 0 })
      for (const status of ['pending', 'sending', 'unknown', 'sent', 'failed'])
        await tx.put('jobs', status, {
          id: status,
          status,
          expiresAt: 0,
          nextRunAt: Number.MAX_SAFE_INTEGER,
        })
    })
    await f.worker().cleanup()
    const stored = f.repo.snapshot()
    expect([...stored.keys()].filter((key) => key.startsWith('operations/old-'))).toHaveLength(15)
    expect(['pending', 'sending', 'unknown'].every((status) => stored.has(`jobs/${status}`))).toBe(
      true,
    )
    expect(stored.has('jobs/sent')).toBe(false)
    expect(stored.has('jobs/failed')).toBe(false)
  })
  it('缺模板不領取，也不把沒有 errcode 的回覆視為成功', async () => {
    const f = await fixture()
    await module
      .createWorker(f.repo, {
        reference,
        fingerprint: 'data-v1',
        config: { ...configured, templateId: '' },
        now: () => event.triggerAtUnixSeconds - 600,
        send: async () => {
          throw new Error('不應呼叫')
        },
      })
      .run()
    expect(f.jobs()[0]?.status).toBe('pending')
    await f.worker(async () => ({}) as { errcode: number }).run()
    expect(f.jobs()[0]?.status).toBe('unknown')
  })
  it('大量受保護的 unknown 不會擋住後方終態任務的三十天清理', async () => {
    const f = await fixture()
    await f.repo.transaction(async (tx) => {
      for (let n = 0; n < 60; n++)
        await tx.put('jobs', `unknown-${n}`, {
          id: `unknown-${n}`,
          status: 'unknown',
          expiresAt: 0,
        })
      await tx.put('jobs', 'old-sent', { id: 'old-sent', status: 'sent', expiresAt: 1 })
    })
    await f.worker().cleanup()
    expect(f.repo.snapshot().has('jobs/old-sent')).toBe(false)
    expect(
      [...f.repo.snapshot().keys()].filter((key) => key.startsWith('jobs/unknown-')),
    ).toHaveLength(60)
  })
})

/** 真batch服務建立每owner一場、每場只有仍有效600秒槽的合法積壓。 */
async function unknownBacklog(f: Awaited<ReturnType<typeof fixture>>, count: number) {
  const batchTemplates = [10800, 3600, 600].map((leadSeconds, index) => ({
    leadSeconds,
    title: `模板${index}`,
    templateId: ['C', 'D', 'B'][index]!.repeat(43),
    fields: configured.fields,
  }))
  const service = createService(f.repo, {
    reference,
    fingerprint: 'data-v1',
    config: { ...configured, batchTemplates },
    now: () => event.triggerAtUnixSeconds - 700,
  })
  for (let n = 0; n < count; n++) {
    const owner = `registry-owner-${n}`
    const prepared = await service.dispatch(
      'prepareBatch',
      {
        occurrence: {
          zoneId: event.zoneId,
          eventTypeId: event.eventTypeId,
          triggerAtUnixSeconds: event.triggerAtUnixSeconds,
        },
        requestId: 'prepare',
      },
      owner,
    )
    expect(prepared.ok).toBe(true)
    const sessionId = prepared.data.sessionId
    expect(
      (
        await service.dispatch(
          'authorizeBatch',
          { sessionId, templateIds: ['B'.repeat(43)], requestId: 'auth' },
          owner,
        )
      ).ok,
    ).toBe(true)
    expect((await service.dispatch('completeAd', { sessionId, requestId: 'ad' }, owner)).ok).toBe(
      true,
    )
    // 只把佇列排序提前一秒，文件ID、job.id、subId與全部owner/session索引保持真service原值。
    await f.repo.transaction(async (tx) => {
      const original = f.jobs().find((j) => j.ownerUid === owner)!
      await tx.put('jobs', String(original.id), {
        ...original,
        nextRunAt: Number(original.nextRunAt) - 1,
      })
    })
  }
  return f
    .jobs()
    .filter((j) => j.templateId === 'B'.repeat(43))
    .map((j) => ({ id: String(j.id), subId: String(j.subId) }))
}

it('超過50筆未知模板積壓不阻斷後方legacy，且未知pending有界延後', async () => {
  const f = await fixture()
  await unknownBacklog(f, 125)
  expect((await f.worker().run()).claimed).toBe(1)
  expect(f.deliveries).toHaveLength(1)
  const unknown = f.jobs().filter((j) => j.templateId === 'B'.repeat(43))
  expect(unknown.every((j) => j.status === 'pending' && j.attempts === 0)).toBe(true)
  expect(unknown.some((j) => Number(j.nextRunAt) > Number(j.dueAt))).toBe(true)
  expect((await f.worker().run()).claimed).toBe(0)
  expect(f.deliveries).toHaveLength(1)
  f.setNow(event.triggerAtUnixSeconds - 570)
  let restoredSent = 0
  const batchTemplates = [10800, 3600, 600].map((leadSeconds, index) => ({
    leadSeconds,
    title: `模板${index}`,
    templateId: ['C', 'D', 'B'][index]!.repeat(43),
    fields: configured.fields,
  }))
  await module
    .createWorker(f.repo, {
      reference,
      fingerprint: 'data-v1',
      config: { ...configured, batchTemplates },
      now: () => event.triggerAtUnixSeconds - 570,
      send: async () => {
        restoredSent += 1
        return { errcode: 0 }
      },
    })
    .run()
  expect(restoredSent).toBe(50)
  expect(
    f.jobs().filter((j) => j.templateId === 'B'.repeat(43) && j.status === 'sent'),
  ).toHaveLength(50)
}, 15000)

it('缺registry超出發送窗口仍終結missed，不能永久pending阻塞', async () => {
  const f = await fixture()
  const queued = await unknownBacklog(f, 1)
  f.setNow(event.triggerAtUnixSeconds - 600 + 301)
  await f.worker().run()
  expect(f.jobs().find((j) => j.id === queued[0]!.id)?.status).toBe('missed')
  const sub = await f.repo.get('subscriptions', queued[0]!.subId)
  expect(
    (sub!.slots as { leadSeconds: number; status: string }[]).find((s) => s.leadSeconds === 600)
      ?.status,
  ).toBe('missed')
  expect(f.deliveries).toHaveLength(0)
})

it('缺registry領取前重新檢查job與槽，不能改寫並發sending/unknown/sent或新generation', async () => {
  const f = await fixture()
  const queued = await unknownBacklog(f, 7)
  let changed = false
  const repo = {
    ...f.repo,
    scan: async (...args: Parameters<typeof f.repo.scan>) => {
      const rows = await f.repo.scan(...args)
      if (!changed && args[0] === 'jobs' && args[1].status === 'pending') {
        changed = true
        await f.repo.transaction(async (tx) => {
          for (const [n, status] of ['sending', 'unknown', 'sent'].entries()) {
            const job = await tx.get('jobs', queued[n]!.id)
            await tx.put('jobs', queued[n]!.id, { ...job!, status })
            const sub = await tx.get('subscriptions', queued[n + 3]!.subId)
            const slots = sub!.slots as { leadSeconds: number; status: string }[]
            slots.find((s) => s.leadSeconds === 600)!.status = status
            await tx.put('subscriptions', queued[n + 3]!.subId, sub!)
          }
          const sub = await tx.get('subscriptions', queued[6]!.subId)
          const slot = (sub!.slots as { leadSeconds: number; generation: number }[]).find(
            (s) => s.leadSeconds === 600,
          )!
          slot.generation += 1
          await tx.put('subscriptions', queued[6]!.subId, sub!)
        })
      }
      return rows
    },
  }
  await module
    .createWorker(repo, {
      reference,
      fingerprint: 'data-v1',
      config: configured,
      now: () => event.triggerAtUnixSeconds - 600,
      send: async () => ({ errcode: 0 }),
    })
    .run()
  for (const [n, status] of ['sending', 'unknown', 'sent'].entries()) {
    expect((await f.repo.get('jobs', queued[n]!.id))!.status).toBe(status)
    const sub = await f.repo.get('subscriptions', queued[n + 3]!.subId)
    expect(
      (sub!.slots as { leadSeconds: number; status: string }[]).find((s) => s.leadSeconds === 600)!
        .status,
    ).toBe(status)
  }
  const sub = await f.repo.get('subscriptions', queued[6]!.subId)
  expect(
    (sub!.slots as { leadSeconds: number; generation: number }[]).find(
      (s) => s.leadSeconds === 600,
    )!.generation,
  ).toBe(2)
})

it('模板公平掃描具備部署所需複合索引且保留原索引', () => {
  const schema = JSON.parse(
    readFileSync('cloudfunctions/major-event-reminder/database.example.json', 'utf8'),
  )
  const jobs = schema.collections.find((c: { name: string }) => c.name === 'major_reminder_jobs')
  expect(jobs.indexes).toEqual(
    expect.arrayContaining([
      { fields: ['status', 'templateId', 'nextRunAt'], unique: false },
      { fields: ['status', 'nextRunAt'], unique: false },
      { fields: ['subId', 'leadSeconds'], unique: true },
      { fields: ['status', 'expiresAt'], unique: false },
    ]),
  )
})
