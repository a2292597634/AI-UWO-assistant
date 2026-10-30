import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type {
  MajorEventPageConfig,
  MajorEventPageData,
} from '../../miniprogram/subpkg-trade/pages/popularity/index'
import { configured, load, memoryRepository, reference } from '../major-event-reminder/helpers'
let definition: MajorEventPageConfig
const wxStub = {
  setNavigationBarTitle: vi.fn(),
  stopPullDownRefresh: vi.fn(),
  getStorageSync: vi.fn(() => null),
  setStorageSync: vi.fn(),
  requestSubscribeMessage: vi.fn(),
  createRewardedVideoAd: vi.fn(),
  showToast: vi.fn(),
  showModal: vi.fn(({ success }) => success({ confirm: true })),
  cloud: {
    callFunction: vi.fn(async ({ data }) => ({
      result: {
        ok: true,
        data:
          data.action === 'getBatchConfig'
            ? {
                enabled: false,
                reason: '尚未配置有效的微信訂閱消息模板',
                templates: [],
                adUnitId: 'adunit-test',
              }
            : { subscriptions: [] },
      },
    })),
  },
}
const defaultCloud = wxStub.cloud.callFunction.getMockImplementation()!
const event = (key: string): WechatMiniprogram.BaseEvent =>
  ({ currentTarget: { dataset: { eventKey: key } } }) as never
const page = () => {
  const p = Object.create(definition) as MajorEventPageConfig & {
    reminderController:
      | import('../../miniprogram/subpkg-trade/controllers/major-event-reminder-controller').MajorEventReminderController
      | null
    setData(data: Partial<MajorEventPageData>): void
  }
  p.data = structuredClone(definition.data)
  p.setData = (data) => Object.assign(p.data, data)
  return p
}
beforeAll(async () => {
  vi.stubGlobal('wx', wxStub)
  vi.stubGlobal('Page', (config: MajorEventPageConfig) => {
    definition = config
  })
  await import('../../miniprogram/subpkg-trade/pages/popularity/index')
})
beforeEach(() => {
  vi.clearAllMocks()
  wxStub.cloud.callFunction.mockImplementation(defaultCloud)
  wxStub.getStorageSync.mockReturnValue(null)
  wxStub.setStorageSync.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-29T12:00:00+08:00'))
})
afterEach(() => vi.useRealTimers())
describe('提醒頁面單開關接線', () => {
  it('通知三 query 必須符合權威日程，超出目前列表的同場仍可打開', () => {
    const p = page()
    p.onLoad()
    p.onViewTap({ currentTarget: { dataset: { view: 'type' } } } as never)
    const baseline = page()
    baseline.onLoad()
    const item = p.data.nextEvents.find(
      (candidate) => !baseline.data.eventItems.some((listed) => listed.key === candidate.key),
    )!
    expect(item).toBeDefined()
    const q = {
      zoneId: item.zoneId,
      eventTypeId: item.eventTypeId,
      triggerAtUnixSeconds: String(item.triggerAtUnixSeconds),
    }
    const linked = page()
    linked.onLoad(q)
    expect(linked.data.eventItems.some((listed) => listed.key === item.key)).toBe(false)
    expect(linked.data.detailEventSnapshot?.key).toBe(item.key)
    const invalid = page()
    invalid.onLoad({ ...q, triggerAtUnixSeconds: String(item.triggerAtUnixSeconds + 1) })
    expect(invalid.data.detailEventSnapshot).toBeNull()
    const malformed = page()
    malformed.onLoad({ ...q, triggerAtUnixSeconds: '1e9' })
    expect(malformed.data.detailEventSnapshot).toBeNull()
    for (const instance of [p, baseline, linked, invalid, malformed]) instance.onUnload()
  })
  it('舊A完整ad確定expired退役後開關可用，B一次授權及新ad，不借A權益', async () => {
    const templates = ([10800, 3600, 600] as const).map((leadSeconds, i) => ({
      leadSeconds,
      templateId: String(i + 1).repeat(43),
      title: `標題${i}`,
      fields: [
        { source: 'start', key: 'time1', type: 'time' },
        { source: 'activity', key: 'thing1', type: 'thing' },
      ],
    }))
    const now = Math.floor(Date.now() / 1000)
    let saved:
      | import('../../miniprogram/subpkg-trade/controllers/major-event-reminder-controller').ReminderLocalOperation
      | null = {
      version: 1,
      mode: 'batch',
      occurrence: { zoneId: 'zone_1', eventTypeId: 'pop1', triggerAtUnixSeconds: now - 1 },
      prepareRequestId: 'a-prepare',
      sessionId: 'a-session',
      adFinished: true,
      pending: { action: 'completeAd', input: { sessionId: 'a-session', requestId: 'a-complete' } },
    }
    wxStub.getStorageSync.mockImplementation(() => saved as never)
    wxStub.setStorageSync.mockImplementation((_key, value) => {
      saved = structuredClone(value)
    })
    const backend = load('service').createService(memoryRepository(), {
      reference,
      config: { ...configured, batchTemplates: templates },
      fingerprint: 'page-recovery',
      now: () => now,
    })
    wxStub.cloud.callFunction.mockImplementation(async ({ data }) => {
      const { action, ...input } = data
      if (action === 'completeAd' && input.sessionId === 'a-session')
        return { result: { ok: false, code: 'expired', message: '本場大流行已開始' } } as never
      return { result: await backend.dispatch(action, input, 'page-recovery-owner') }
    })
    wxStub.requestSubscribeMessage.mockImplementation(({ tmplIds, success }) =>
      success(Object.fromEntries(tmplIds.map((id: string) => [id, 'accept']))),
    )
    let close!: (value: { isEnded: boolean }) => void
    wxStub.createRewardedVideoAd.mockReturnValue({
      show: async () => {},
      load: async () => {},
      onClose: (f: typeof close) => {
        close = f
      },
      offClose: () => {},
      onError: () => {},
      offError: () => {},
      destroy: () => {},
    })
    const first = page()
    first.onLoad()
    await first.reminderController!.refresh()
    expect(first.data.reminderBusy).toBe(false)
    first.onUnload()
    const p = page()
    p.onLoad()
    await p.reminderController!.refresh()
    expect(p.data.reminderBusy).toBe(false)
    p.onViewTap({ currentTarget: { dataset: { view: 'type' } } } as never)
    const b = p.data.nextEvents.find((item) => item.triggerAtUnixSeconds > now + 10800)!
    const pending = p.onReminderTap(event(b.key))
    expect(wxStub.requestSubscribeMessage).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(0)
    expect(close).toBeDefined()
    close({ isEnded: true })
    await pending
    expect(wxStub.createRewardedVideoAd).toHaveBeenCalledTimes(2)
    expect(p.data.reminderChecks[b.key]).toBe(true)
    expect(saved).toMatchObject({
      receipts: [{ prepareRequestId: 'a-prepare', completionRequestId: 'a-complete' }],
    })
    p.onUnload()
  })
  it('無配置點擊只Toast，列表和詳情保持可用，無自建面板', async () => {
    const p = page()
    p.onLoad()
    await p.reminderController!.refresh()
    p.onViewTap({ currentTarget: { dataset: { view: 'type' } } } as never)
    const item = p.data.nextEvents[0]!
    await p.onReminderTap(event(item.key))
    expect(wxStub.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('尚未配置') }),
    )
    expect(p.data.detailEventSnapshot).toBeNull()
    expect(wxStub.requestSubscribeMessage).not.toHaveBeenCalled()
    expect(wxStub.createRewardedVideoAd).not.toHaveBeenCalled()
    p.onEventTap(event(item.key))
    await p.onReminderTap(event(item.key))
    expect(p.data.detailEventSnapshot?.key).toBe(item.key)
    expect(p.data.pageError).toBeNull()
    p.onUnload()
  })
  it('三處catchtap保持兩行原排版，無面板或自建授權／廣告按鈕', () => {
    const wxml = readFileSync('miniprogram/subpkg-trade/pages/popularity/index.wxml', 'utf8')
    expect(wxml.match(/catchtap="onReminderTap"/g)).toHaveLength(3)
    expect(wxml.match(/reminder-toggle--ready/g)).toHaveLength(3)
    expect(wxml).not.toContain('reminder-sheet')
    expect(wxml).not.toContain('onReminderAuthorize')
    expect(wxml).not.toContain('onReminderWatchAd')
    expect(wxml).not.toContain('最近一場')
    expect(wxml).toContain('major-events-next__clock')
    expect(wxml).toContain('major-events-next__date')
  })
  it('未部署傳輸失敗Toast保留查詢，不請求原生廣告／授權', async () => {
    wxStub.cloud.callFunction.mockRejectedValue(new Error('function not found'))
    const p = page()
    p.onLoad()
    await p.reminderController!.refresh()
    await p.onReminderTap(event(p.data.eventItems[0]!.key))
    expect(wxStub.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('暫時無法確認') }),
    )
    expect(p.data.eventItems.length).toBeGreaterThan(0)
    expect(p.data.pageError).toBeNull()
    expect(wxStub.createRewardedVideoAd).not.toHaveBeenCalled()
    p.onUnload()
  })
  it('一次點擊先原生授權再完整廣告確認；直接取消無Modal，詳情快照不變', async () => {
    const templates = ([10800, 3600, 600] as const).map((leadSeconds, i) => ({
      leadSeconds,
      templateId: String(i + 1).repeat(43),
      title: `標題${i}`,
      fields: [
        { source: 'start', key: 'time1', type: 'time' },
        { source: 'activity', key: 'thing1', type: 'thing' },
      ],
    }))
    const backend = load('service').createService(memoryRepository(), {
      reference,
      config: { ...configured, batchTemplates: templates },
      fingerprint: 'page-local',
      now: () => Math.floor(Date.now() / 1000),
    })
    const order: string[] = []
    wxStub.cloud.callFunction.mockImplementation(async ({ data }) => {
      const { action, ...input } = data
      order.push(action)
      return { result: await backend.dispatch(action, input, 'page-owner') }
    })
    wxStub.requestSubscribeMessage.mockImplementation(({ tmplIds, success }) => {
      order.push('native')
      success(Object.fromEntries(tmplIds.map((id: string) => [id, 'accept'])))
    })
    let close!: (v: { isEnded: boolean }) => void
    wxStub.createRewardedVideoAd.mockReturnValue({
      show: async () => {},
      load: async () => {},
      onClose: (f: typeof close) => {
        close = f
      },
      offClose: () => {},
      onError: () => {},
      offError: () => {},
      destroy: () => {},
    })
    const p = page()
    p.onLoad()
    await p.reminderController!.refresh()
    p.onViewTap({ currentTarget: { dataset: { view: 'type' } } } as never)
    const item = p.data.nextEvents.find((i) => i.triggerAtUnixSeconds > Date.now() / 1000 + 10800)!
    order.length = 0
    const pending = p.onReminderTap(event(item.key))
    expect(order).toEqual(['native'])
    expect(p.data.reminderChecks[item.key]).not.toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    close({ isEnded: true })
    await pending
    expect(p.data.reminderChecks[item.key]).toBe(true)
    p.onEventTap(event(item.key))
    await p.onReminderTap(event(item.key))
    expect(p.data.reminderChecks[item.key]).toBe(false)
    expect(p.data.detailEventSnapshot?.key).toBe(item.key)
    expect(wxStub.showModal).not.toHaveBeenCalled()
    expect(wxStub.requestSubscribeMessage).toHaveBeenCalledOnce()
    p.onUnload()
  })
})
