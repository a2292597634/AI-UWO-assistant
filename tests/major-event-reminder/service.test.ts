import { describe, expect, it } from 'vitest'
import { configured, event, load, memoryRepository, reference } from './helpers'
import { forecastMajorEvents } from '../../miniprogram/subpkg-trade/domain/major-event-forecast'
import type { RuntimeMajorEventReference } from '../../miniprogram/contracts/runtime-data'

const module = load('service')
function fixture(config = configured) {
  expect(typeof module.createService).toBe('function')
  let now = event.triggerAtUnixSeconds - 12000
  const repo = memoryRepository()
  const service = module.createService(repo, {
    reference,
    fingerprint: 'data-v1',
    config,
    now: () => now,
  })
  const call = (action: string, input: object = {}, owner = 'owner-a') =>
    service.dispatch(action, input, owner)
  return {
    repo,
    service,
    call,
    setNow: (value: number) => {
      now = value
    },
  }
}
async function prepared(f: ReturnType<typeof fixture>, requestId = 'prepare-1') {
  const result = await f.call('prepare', {
    occurrence: {
      zoneId: event.zoneId,
      eventTypeId: event.eventTypeId,
      triggerAtUnixSeconds: event.triggerAtUnixSeconds,
    },
    requestId,
  })
  expect(result.ok).toBe(true)
  return result.data
}

describe('服務端訂閱交易', () => {
  it('授權時點跨過後仍保存完整廣告，重放原操作且不補過期job', async () => {
    const f = fixture()
    const input = await prepared(f)
    await f.call('authorize', {
      sessionId: input.sessionId,
      leadSeconds: 10800,
      requestId: 'cross-auth',
    })
    f.setNow(event.triggerAtUnixSeconds - 10780)
    const adInput = { sessionId: input.sessionId, requestId: 'cross-ad' }
    const completed = await f.call('completeAd', adInput)
    expect(completed.ok).toBe(true)
    expect(completed.data.subscription.adCompleted).toBe(true)
    expect(await f.call('completeAd', adInput)).toEqual(completed)
    expect([...f.repo.snapshot().keys()].filter((k) => k.startsWith('jobs/'))).toHaveLength(0)
    expect(
      (await f.call('activate', { sessionId: input.sessionId, requestId: 'cross-empty' })).code,
    ).toBe('authorization-required')
  })
  it.each(['authorize', 'activate'])(
    '恢復 %s 被其他 prepare 修剪後仍檢查20場，釋出名額才可免廣告恢復並完整列出',
    async (action) => {
      const f = fixture()
      const first = await prepared(f)
      await f.call('authorize', {
        sessionId: first.sessionId,
        leadSeconds: 600,
        requestId: 'auth-a',
      })
      const opened = await f.call('completeAd', { sessionId: first.sessionId, requestId: 'ad-a' })
      await f.call('cancel', {
        key: first.subscription.key,
        expectedVersion: opened.data.subscription.version,
        requestId: 'cancel-a',
      })
      const restored = await prepared(f, 'prepare-a-restored')
      const otherEvents = forecastMajorEvents(reference as RuntimeMajorEventReference, {
        nowUnixSeconds: event.triggerAtUnixSeconds,
        horizonHours: 168,
      })
        .filter((item) => item.key !== first.subscription.key)
        .slice(0, 20)
      const others = []
      for (const [n, occurrence] of otherEvents.entries()) {
        const result = await f.call('prepare', { occurrence, requestId: `other-${n}` })
        expect(result.ok).toBe(true)
        others.push(result.data.subscription)
      }
      const input =
        action === 'authorize'
          ? { sessionId: restored.sessionId, leadSeconds: 600, requestId: 'recover-a' }
          : { sessionId: restored.sessionId, requestId: 'recover-a' }
      expect((await f.call(action, input)).code).toBe('limit')
      const storedA = [...f.repo.snapshot().entries()].find(
        ([key, row]) => key.startsWith('subscriptions/') && row.key === first.subscription.key,
      )![1]
      expect(storedA.adCompleted).toBe(true)
      expect(
        (storedA.slots as { status: string }[]).some((slot) =>
          ['authorized', 'pending'].includes(slot.status),
        ),
      ).toBe(false)
      await f.call('cancel', {
        key: others[0].key,
        expectedVersion: others[0].version,
        requestId: 'release-one',
      })
      const recovered = await f.call(action, input)
      expect(recovered.ok).toBe(true)
      expect(recovered.data.subscription.adCompleted).toBe(true)
      expect(
        (await f.call('activate', { sessionId: restored.sessionId, requestId: 'activate-a-final' }))
          .ok,
      ).toBe(true)
      const index = [...f.repo.snapshot().entries()].find(([key]) => key.startsWith('owners/'))![1]
      expect(index.active).toHaveLength(20)
      const active = index.active as string[]
      const unfinished = [...f.repo.snapshot().entries()].filter(
        ([key, row]) =>
          key.startsWith('subscriptions/') &&
          (row.slots as { status: string }[]).some((slot) =>
            ['unsubscribed', 'authorized', 'pending', 'sending', 'unknown'].includes(slot.status),
          ),
      )
      expect(unfinished).toHaveLength(20)
      expect(unfinished.every(([key]) => active.includes(key.slice('subscriptions/'.length)))).toBe(
        true,
      )
      const listed = (await f.call('list')).data.subscriptions as { key: string }[]
      expect(unfinished.every(([, row]) => listed.some((sub) => sub.key === row.key))).toBe(true)
    },
  )
  it('缺模板或欄位無效時停用，不能 prepare 或 completeAd 繞過', async () => {
    for (const config of [
      { ...configured, templateId: '' },
      { ...configured, fields: [] },
      { ...configured, fields: configured.fields.map((f) => ({ ...f, key: 'thing1' })) },
    ]) {
      const f = fixture(config)
      expect((await f.call('getConfig')).data).toMatchObject({ enabled: false })
      expect((await f.call('prepare', { occurrence: event, requestId: 'disabled-1' })).code).toBe(
        'disabled',
      )
      expect(
        (await f.call('completeAd', { sessionId: 'fake', requestId: 'disabled-2' })).code,
      ).toBe('disabled')
      expect(f.repo.snapshot().size).toBe(0)
    }
  })
  it('同 requestId 重放完全一致，部分授權一次只綁一個提前量', async () => {
    const f = fixture()
    const input = await prepared(f)
    const payload = { sessionId: input.sessionId, leadSeconds: 3600, requestId: 'auth-1' }
    const first = await f.call('authorize', payload)
    expect(await f.call('authorize', payload)).toEqual(first)
    expect(first.data.subscription.slots.map((slot: { status: string }) => slot.status)).toEqual([
      'unsubscribed',
      'authorized',
      'unsubscribed',
    ])
    const active = await f.call('completeAd', { sessionId: input.sessionId, requestId: 'ad-1' })
    expect(active.data.subscription.adCompleted).toBe(true)
    expect(active.data.subscription.slots.map((slot: { status: string }) => slot.status)).toEqual([
      'unsubscribed',
      'pending',
      'unsubscribed',
    ])
    expect([...f.repo.snapshot().keys()].filter((key) => key.startsWith('jobs/'))).toHaveLength(1)
    expect(await f.call('completeAd', { sessionId: input.sessionId, requestId: 'ad-1' })).toEqual(
      active,
    )
  })
  it('owner 不能偽造或讀取別人的 session、key 與 requestId', async () => {
    const f = fixture()
    const input = await prepared(f)
    expect((await f.call('list', {}, 'owner-b')).data.subscriptions).toEqual([])
    expect(
      (
        await f.call(
          'authorize',
          { sessionId: input.sessionId, leadSeconds: 600, requestId: 'auth-other' },
          'owner-b',
        )
      ).ok,
    ).toBe(false)
    expect(
      (
        await f.call(
          'cancel',
          { key: input.subscription.key, expectedVersion: 1, requestId: 'cancel-other' },
          'owner-b',
        )
      ).ok,
    ).toBe(false)
    expect(
      (await f.call('prepare', { occurrence: event, requestId: 'owner-inject', owner: 'owner-b' }))
        .ok,
    ).toBe(false)
    expect((await f.call('list', {}, '')).ok).toBe(false)
  })
  it('相同 requestId 不能換場或換 action', async () => {
    const f = fixture()
    const input = await prepared(f)
    expect(
      (
        await f.call('authorize', {
          sessionId: input.sessionId,
          leadSeconds: 600,
          requestId: 'prepare-1',
        })
      ).code,
    ).toBe('request-conflict')
  })
  it('取消須核對版本，原子撤銷尚未發送任務；重新 prepare 可免廣告恢復', async () => {
    const f = fixture()
    const input = await prepared(f)
    await f.call('authorize', { sessionId: input.sessionId, leadSeconds: 600, requestId: 'auth-1' })
    const active = await f.call('completeAd', { sessionId: input.sessionId, requestId: 'ad-1' })
    expect(
      (
        await f.call('cancel', {
          key: input.subscription.key,
          expectedVersion: 1,
          requestId: 'cancel-stale',
        })
      ).code,
    ).toBe('version-conflict')
    const cancelled = await f.call('cancel', {
      key: input.subscription.key,
      expectedVersion: active.data.subscription.version,
      requestId: 'cancel-1',
    })
    expect(cancelled.data.subscription.slots[2].status).toBe('cancelled')
    expect(
      (await f.call('activate', { sessionId: input.sessionId, requestId: 'old-session' })).code,
    ).toBe('stale-session')
    const next = await prepared(f, 'prepare-2')
    const recovered = await f.call('activate', {
      sessionId: next.sessionId,
      requestId: 'activate-2',
    })
    expect(recovered.data.subscription.adCompleted).toBe(true)
    expect(recovered.data.subscription.slots[2].status).toBe('pending')
    expect([...f.repo.snapshot().keys()].filter((key) => key.startsWith('jobs/'))).toHaveLength(1)
  })
  it('activate 不可替代廣告，沒有授權不能記錄廣告完成，精確到期不可新授權', async () => {
    const f = fixture()
    const input = await prepared(f)
    expect(
      (await f.call('activate', { sessionId: input.sessionId, requestId: 'activate-1' })).code,
    ).toBe('ad-required')
    expect(
      (await f.call('completeAd', { sessionId: input.sessionId, requestId: 'ad-1' })).code,
    ).toBe('authorization-required')
    f.setNow(event.triggerAtUnixSeconds - 600)
    expect(
      (
        await f.call('authorize', {
          sessionId: input.sessionId,
          leadSeconds: 600,
          requestId: 'late-auth',
        })
      ).code,
    ).toBe('missed')
  })
  it('資料指紋變更使舊 session 失效，不讓舊廣告權益移到新場', async () => {
    const f = fixture()
    const input = await prepared(f)
    const changed = module.createService(f.repo, {
      reference,
      fingerprint: 'data-v2',
      config: configured,
      now: () => event.triggerAtUnixSeconds - 12000,
    })
    expect(
      (
        await changed.dispatch(
          'authorize',
          { sessionId: input.sessionId, leadSeconds: 600, requestId: 'changed' },
          'owner-a',
        )
      ).code,
    ).toBe('data-changed')
  })
  it('併發重放 prepare 只建立一個 session 與一場訂閱', async () => {
    const f = fixture()
    const input = {
      occurrence: {
        zoneId: event.zoneId,
        eventTypeId: event.eventTypeId,
        triggerAtUnixSeconds: event.triggerAtUnixSeconds,
      },
      requestId: 'concurrent',
    }
    const results = await Promise.all(Array.from({ length: 5 }, () => f.call('prepare', input)))
    expect(results.every((r) => JSON.stringify(r) === JSON.stringify(results[0]))).toBe(true)
    expect([...f.repo.snapshot().keys()].filter((key) => key.startsWith('sessions/'))).toHaveLength(
      1,
    )
  })
})
