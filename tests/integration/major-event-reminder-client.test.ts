import { forecastMajorEvents } from '../../miniprogram/subpkg-trade/domain/major-event-forecast'
import type { RuntimeMajorEventReference } from '../../miniprogram/contracts/runtime-data'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMajorEventReminderService } from '../../miniprogram/runtime/major-event-reminder-service'
import { createMajorEventReminderPlatform } from '../../miniprogram/runtime/major-event-reminder-platform'
import {
  createMajorEventReminderController,
  type ReminderLocalOperation,
} from '../../miniprogram/subpkg-trade/controllers/major-event-reminder-controller'
import {
  configured,
  event,
  load,
  memoryRepository,
  reference,
} from '../major-event-reminder/helpers'
const nextEvent = (now: number) =>
  forecastMajorEvents(reference as RuntimeMajorEventReference, {
    nowUnixSeconds: now,
    horizonHours: 168,
  }).find((item) => item.triggerAtUnixSeconds > now + 10800 && item.key !== event.key)!
const templates = ([10800, 3600, 600] as const).map((leadSeconds, i) => ({
  leadSeconds,
  templateId: String(i + 1).repeat(43),
  title: `標題${i}`,
  fields: [
    { source: 'start', key: 'time1', type: 'time' },
    { source: 'activity', key: 'thing1', type: 'thing' },
  ],
}))
afterEach(() => vi.unstubAllGlobals())
function setup(offset = 12000) {
  let now = event.triggerAtUnixSeconds - offset,
    serial = 0,
    saved: ReminderLocalOperation | null = null,
    lose = false,
    dropBefore = false
  const repository = memoryRepository()
  const backend = load('service').createService(repository, {
    reference,
    config: { ...configured, batchTemplates: templates },
    fingerprint: 'client-local',
    now: () => now,
  })
  const order: string[] = [],
    ids: string[] = []
  const wxStub = {
    requestSubscribeMessage: vi.fn(({ tmplIds, success }) => {
      order.push('native')
      success(Object.fromEntries(tmplIds.map((id: string) => [id, 'accept'])))
    }),
    cloud: {
      callFunction: async ({ data }: { data: Record<string, unknown> }) => {
        const { action, ...input } = data
        order.push(String(action))
        if (action === 'completeAd' && dropBefore) {
          dropBefore = false
          ids.push(String(input.requestId))
          throw Error('請求未抵服務端')
        }
        const result = await backend.dispatch(action, input, 'client-owner')
        if (action === 'completeAd') {
          ids.push(String(input.requestId))
          if (lose) {
            lose = false
            throw Error('回程中斷')
          }
        }
        return { result }
      },
    },
  }
  vi.stubGlobal('wx', wxStub)
  const ad = vi.fn(async () => true)
  const create = () => {
    const platform = createMajorEventReminderPlatform()
    return createMajorEventReminderController({
      service: createMajorEventReminderService(),
      platform: { ...platform, watchAd: ad },
      storage: {
        read: () => saved,
        write: (v) => {
          saved = v ? structuredClone(v) : null
        },
      },
      now: () => now,
      requestId: () => `client-${++serial}`,
      onChange: () => {},
    })
  }
  return {
    repository,
    backend,
    drop: () => {
      dropBefore = true
    },
    create,
    ad,
    order,
    ids,
    wxStub,
    setTime: (v: number) => {
      now = v
    },
    lose: () => {
      lose = true
    },
    storage: {
      read: () => saved,
      write: (v: ReminderLocalOperation) => {
        saved = v
      },
    },
    jobs: () => [...repository.snapshot()].filter(([k]) => k.startsWith('jobs/')).map(([, v]) => v),
  }
}
describe('單開關前後端真本地交易整合', () => {
  it.each([
    ['legacy', true],
    ['legacy', false],
    ['batch', true],
    ['batch', false],
  ] as const)('%s adFinished原prepare已記錄=%s，確定過期退役收據不鎖B', async (mode, recorded) => {
    const e = setup()
    const prepare = mode === 'batch' ? 'prepareBatch' : 'prepare'
    if (recorded)
      expect(
        (
          await e.backend.dispatch(
            prepare,
            { occurrence: event, requestId: 'original-p' },
            'client-owner',
          )
        ).ok,
      ).toBe(true)
    e.storage.write({
      version: 1,
      ...(mode === 'batch' ? { mode: 'batch' as const } : {}),
      occurrence: event,
      prepareRequestId: 'original-p',
      sessionId: null,
      adFinished: true,
      pending: null,
    })
    e.setTime(event.triggerAtUnixSeconds + 1)
    const c = e.create()
    await c.refresh()
    expect(c.state.ready).toBe(true)
    expect(c.state.unconfirmed).toBe(false)
    expect(e.storage.read()).toMatchObject({
      adFinished: false,
      pending: null,
      receipts: [
        {
          occurrence: expect.objectContaining({
            zoneId: event.zoneId,
            eventTypeId: event.eventTypeId,
            triggerAtUnixSeconds: event.triggerAtUnixSeconds,
          }),
          prepareRequestId: 'original-p',
        },
      ],
    })
    c.destroy()
    const next = e.create()
    await next.refresh()
    expect(next.state.ready).toBe(true)
    const b = nextEvent(event.triggerAtUnixSeconds)
    const pending = next.toggle(b)
    expect(e.order[e.order.length - 1]).toBe('native')
    await pending
    expect(next.isChecked(b.key)).toBe(true)
    expect(e.ad).toHaveBeenCalledOnce()
    expect(e.wxStub.requestSubscribeMessage).toHaveBeenCalledOnce()
    expect(e.storage.read()).toMatchObject({ receipts: [{ prepareRequestId: 'original-p' }] })
  })
  it('完整ad請求未抵後端，跨開始後確定expired；同ID已重放且B不能借A廣告', async () => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    e.drop()
    await c.toggle(event)
    expect(c.state.unconfirmed).toBe(true)
    const original = e.storage.read()!
    c.destroy()
    e.setTime(event.triggerAtUnixSeconds + 1)
    const next = e.create()
    await next.refresh()
    expect(next.state.ready).toBe(true)
    expect(e.ids).toEqual([original.pending!.input.requestId, original.pending!.input.requestId])
    await next.toggle(nextEvent(event.triggerAtUnixSeconds))
    expect(e.ad).toHaveBeenCalledTimes(2)
    expect(e.wxStub.requestSubscribeMessage).toHaveBeenCalledTimes(2)
  })
  it('同場仍有效的stale-session保留完整ad收據，新授權新session後免重看', async () => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    e.drop()
    await c.toggle(event)
    const list = await e.backend.dispatch('list', {}, 'client-owner')
    expect(
      (
        await e.backend.dispatch(
          'cancel',
          {
            key: event.key,
            expectedVersion: list.data.subscriptions[0].version,
            requestId: 'external-cancel',
          },
          'client-owner',
        )
      ).ok,
    ).toBe(true)
    c.destroy()
    const next = e.create()
    await next.refresh()
    expect(next.state.ready).toBe(true)
    expect(next.state.unconfirmed).toBe(false)
    expect(e.storage.read()).toMatchObject({
      receipts: [
        {
          occurrence: expect.objectContaining({ triggerAtUnixSeconds: event.triggerAtUnixSeconds }),
        },
      ],
    })
    await next.toggle(event)
    expect(next.isChecked(event.key)).toBe(true)
    expect(e.ad).toHaveBeenCalledOnce()
    expect(e.wxStub.requestSubscribeMessage).toHaveBeenCalledTimes(2)
    expect(e.jobs()).toHaveLength(3)
  })
  it('一次原生三模板accept，一次完整ad，產生三個各自模板job；取消再開免重看', async () => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    e.order.length = 0
    const p = c.toggle(event)
    expect(e.order).toEqual(['native'])
    expect(c.isChecked(event.key)).toBe(false)
    await p
    expect(e.wxStub.requestSubscribeMessage).toHaveBeenCalledOnce()
    expect(e.ad).toHaveBeenCalledOnce()
    expect(c.isChecked(event.key)).toBe(true)
    expect(
      e
        .jobs()
        .map((j) => [j.leadSeconds, j.templateId])
        .sort(),
    ).toEqual(templates.map((t) => [t.leadSeconds, t.templateId]).sort())
    await c.toggle(event)
    expect(c.isChecked(event.key)).toBe(false)
    expect(e.wxStub.requestSubscribeMessage).toHaveBeenCalledOnce()
    await c.toggle(event)
    expect(c.isChecked(event.key)).toBe(true)
    expect(e.ad).toHaveBeenCalledOnce()
    expect(e.jobs()).toHaveLength(3)
  })
  it('未確認廣告按相同request重放，不增加job、不再要求微信或ad', async () => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    e.lose()
    await c.toggle(event)
    expect(c.state.unconfirmed).toBe(true)
    expect(c.isChecked(event.key)).toBe(false)
    c.destroy()
    const next = e.create()
    await next.refresh()
    expect(next.isChecked(event.key)).toBe(true)
    expect(e.ids).toHaveLength(2)
    expect(e.ids[0]).toBe(e.ids[1])
    expect(e.jobs()).toHaveLength(3)
    expect(e.ad).toHaveBeenCalledOnce()
    expect(e.wxStub.requestSubscribeMessage).toHaveBeenCalledOnce()
  })
  it('廣告跨過3h只建2job；所有時點跨過亦保存廣告並允許另一場', async () => {
    const e = setup(10810),
      c = e.create()
    await c.refresh()
    e.ad.mockImplementationOnce(async () => {
      e.setTime(event.triggerAtUnixSeconds - 10780)
      return true
    })
    await c.toggle(event)
    expect(c.state.subscription?.adCompleted).toBe(true)
    expect(e.jobs()).toHaveLength(2)
    expect(c.state.message).toContain('2 次')
    const other = nextEvent(event.triggerAtUnixSeconds)
    e.ad.mockImplementationOnce(async () => {
      e.setTime(other.triggerAtUnixSeconds - 500)
      return true
    })
    await c.toggle(other)
    expect(c.state.subscription?.adCompleted).toBe(true)
    expect(c.state.unconfirmed).toBe(false)
    await c.toggle(nextEvent(other.triggerAtUnixSeconds))
    expect(e.ad).toHaveBeenCalledTimes(3)
  })
  it.each(['prepare', 'authorize', 'completeAd', 'activate', 'cancel'] as const)(
    'v1 %s pending以舊API及同request重放',
    async (action) => {
      const e = setup()
      const call = (a: string, input: unknown) => e.backend.dispatch(a, input, 'client-owner')
      const prepared = await call('prepare', { occurrence: event, requestId: 'legacy-p' })
      const sessionId = prepared.data.sessionId
      await call('authorize', { sessionId, leadSeconds: 10800, requestId: 'legacy-a' })
      if (action === 'activate' || action === 'cancel')
        await call('completeAd', { sessionId, requestId: 'legacy-ad' })
      if (action === 'activate')
        await call('cancel', {
          key: event.key,
          expectedVersion: (await call('list', {})).data.subscriptions[0].version,
          requestId: 'legacy-c',
        })
      const input =
        action === 'prepare'
          ? { occurrence: event, requestId: 'legacy-p' }
          : action === 'authorize'
            ? { sessionId, leadSeconds: 10800, requestId: 'legacy-a' }
            : action === 'cancel'
              ? {
                  key: event.key,
                  expectedVersion: (await call('list', {})).data.subscriptions[0].version,
                  requestId: 'legacy-c',
                }
              : { sessionId, requestId: 'legacy-ad' }
      e.storage.write({
        version: 1,
        occurrence: event,
        prepareRequestId: 'legacy-p',
        sessionId,
        adFinished: action === 'completeAd',
        pending: { action, input } as never,
      })
      const c = e.create()
      await c.refresh()
      expect(c.state.unconfirmed).toBe(false)
      expect(e.order[0]).toBe(action)
      expect(e.ad).not.toHaveBeenCalled()
      expect(e.wxStub.requestSubscribeMessage).not.toHaveBeenCalled()
      expect(e.storage.read()?.pending).toBeNull()
    },
  )
  it('v1單獨adFinished完整保存跨過時點權益，不鎖死另一場', async () => {
    const e = setup(10810)
    const call = (a: string, input: unknown) => e.backend.dispatch(a, input, 'client-owner')
    const prepared = await call('prepare', { occurrence: event, requestId: 'legacy-p' })
    const sessionId = prepared.data.sessionId
    await call('authorize', { sessionId, leadSeconds: 10800, requestId: 'legacy-a' })
    e.storage.write({
      version: 1,
      occurrence: event,
      prepareRequestId: 'legacy-p',
      sessionId,
      adFinished: true,
      pending: null,
    })
    e.setTime(event.triggerAtUnixSeconds - 500)
    const c = e.create()
    await c.refresh()
    expect(c.state.subscription?.adCompleted).toBe(true)
    expect(c.state.unconfirmed).toBe(false)
    expect(e.jobs()).toHaveLength(0)
    await c.toggle(nextEvent(event.triggerAtUnixSeconds))
    expect(e.ad).toHaveBeenCalledOnce()
  })
})
