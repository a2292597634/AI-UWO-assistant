import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  RuntimeMajorEventReference,
  RuntimeTradeReference,
} from '../../miniprogram/contracts/runtime-data'
import type { MajorEventListViewItem } from '../../miniprogram/subpkg-trade/presenters/major-event-presenter'

const storeMocks = vi.hoisted(() => ({
  getMajorEventReference: vi.fn(),
  getTradeReference: vi.fn(),
}))
const ANCHOR = 1670889600

vi.mock('../../miniprogram/subpkg-trade/runtime/major-event-data-store', () => ({
  getMajorEventReference: storeMocks.getMajorEventReference,
}))
vi.mock('../../miniprogram/subpkg-trade/runtime/trade-data-store', () => ({
  getTradeReference: storeMocks.getTradeReference,
}))

interface MajorEventDateOption {
  dateKey: string
  label: string
}

interface MajorEventPageState {
  activeView: 'matrix' | 'journey'
  horizonHours: 24 | 72 | 168
  nowUnixSeconds: number
  selectedDateKey: string
  dateOptions: MajorEventDateOption[]
  segmentIndex: number
  segmentCount: number
  selectedZoneId: string | null
  selectedEventTypeId: string | null
  openFilterMenu: 'zone' | 'eventType' | null
  eventItems: MajorEventListViewItem[]
  pageError: string | null
  detailEventSnapshot: MajorEventListViewItem | null
  nextOccurrenceResult: MajorEventListViewItem | null
  nextOccurrenceSearched: boolean
  nextOccurrenceMessage: string | null
  failedRegionIconIds: string[]
  failedCategoryIconIds: string[]
  emptyMessage: string | null
  matrix: {
    rows: Array<{
      zoneId: string
      iconFailed: boolean
      slots: Array<{
        startUnixSeconds: number
        timeLabel: string
        isCurrentHour: boolean
        events: Array<{ key: string; triggerAtUnixSeconds: number }>
      }>
    }>
  } | null
  journey: Array<{
    timeGroups: Array<{
      events: Array<{ key: string; categories: Array<{ id: string; iconFailed: boolean }> }>
    }>
  }>
  summaryLabel: string
  sourceVerifiedLabel: string
}

interface MajorEventPageConfig {
  data: MajorEventPageState
  onLoad(): void
  onShow(): void
  onHide(): void
  onPullDownRefresh(): Promise<void>
  onHorizonTap(event: WechatMiniprogram.BaseEvent): void
  onViewTap(event: WechatMiniprogram.BaseEvent): void
  onDateTap(event: WechatMiniprogram.BaseEvent): void
  onSegmentTap(event: WechatMiniprogram.BaseEvent): void
  onAreaFilterTap(event: WechatMiniprogram.BaseEvent): void
  onEventFilterTap(event: WechatMiniprogram.BaseEvent): void
  onEventTap(event: WechatMiniprogram.BaseEvent): void
  onCloseDetail(): void
  onNextOccurrenceTap(): void
  onRegionIconError(event: WechatMiniprogram.BaseEvent): void
  onCategoryIconError(event: WechatMiniprogram.BaseEvent): void
}

interface MajorEventPageInstance extends MajorEventPageConfig {
  setData(update: Partial<MajorEventPageState>): void
}

const createRequireFromTest = createRequire(import.meta.url)
const reference = createRequireFromTest(
  '../../miniprogram/subpkg-trade/major-event-reference.js',
) as RuntimeMajorEventReference
const tradeReference = createRequireFromTest(
  '../../miniprogram/subpkg-trade/trade-reference.js',
) as RuntimeTradeReference

let pageDefinition: MajorEventPageConfig
const wxStub = {
  setNavigationBarTitle: vi.fn(),
  stopPullDownRefresh: vi.fn(),
}

const createPageInstance = (): MajorEventPageInstance => {
  const page = Object.create(pageDefinition) as MajorEventPageInstance
  page.data = structuredClone(pageDefinition.data)
  page.setData = (update) => Object.assign(page.data, update)
  return page
}

const pageEvent = (dataset: Record<string, unknown> = {}): WechatMiniprogram.BaseEvent =>
  ({ currentTarget: { dataset } }) as never

beforeAll(async () => {
  vi.stubGlobal('Page', (config: MajorEventPageConfig) => {
    pageDefinition = config
  })
  vi.stubGlobal('wx', wxStub)
  await import('../../miniprogram/subpkg-trade/pages/popularity/index')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(ANCHOR * 1000))
  storeMocks.getMajorEventReference.mockReturnValue(structuredClone(reference))
  storeMocks.getTradeReference.mockReturnValue(structuredClone(tradeReference))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('大流行預測頁控制器', () => {
  it('loads local references and starts with the three-day matrix', () => {
    const page = createPageInstance()

    page.onLoad()

    expect(page.data.activeView).toBe('matrix')
    expect(page.data.horizonHours).toBe(72)
    expect(page.data.segmentCount).toBe(11)
    expect(page.data.nowUnixSeconds).toBe(Math.floor(Date.now() / 1000))
    expect(page.data.eventItems.length).toBeGreaterThan(0)
    expect(page.data.pageError).toBeNull()
    expect(page.data.summaryLabel).toContain('未來 72 小時')
    expect(page.data.sourceVerifiedLabel).toBe('2026/09/24')
    expect(wxStub.setNavigationBarTitle).toHaveBeenCalledWith({ title: '大流行預測' })
  })

  it('builds date options in UTC+8 regardless of the device time zone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    try {
      vi.setSystemTime(new Date(Date.parse('2026-09-25T10:47:00+08:00')))
      const page = createPageInstance()

      page.onLoad()

      expect(page.data.dateOptions[0]).toEqual({
        dateKey: '2026-09-25',
        label: '2026/09/25',
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    ['missing', null],
    ['invalid', { ...reference, zones: [] }],
    ['impossible source date', { ...reference, sourceVerifiedOn: '2026-02-30' }],
  ])('shows a data error for %s runtime references', (_kind, runtimeReference) => {
    storeMocks.getMajorEventReference.mockReturnValue(runtimeReference)
    const page = createPageInstance()

    page.onLoad()

    expect(page.data.pageError).toBe('大流行資料暫時無法載入，請更新小程序後再試')
    expect(page.data.matrix).toBeNull()
    expect(page.data.eventItems).toEqual([])
  })

  it('refreshes at the next local minute and clears its timer when hidden', () => {
    vi.setSystemTime(new Date((ANCHOR + 30) * 1000))
    const page = createPageInstance()
    page.onLoad()
    page.onShow()

    expect(page.data.nowUnixSeconds).toBe(ANCHOR + 30)
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(30_000)
    expect(page.data.nowUnixSeconds).toBe(ANCHOR + 60)

    page.onHide()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops native pull-to-refresh in the finally path', async () => {
    const page = createPageInstance()
    page.onLoad()

    await page.onPullDownRefresh()

    expect(wxStub.stopPullDownRefresh).toHaveBeenCalledOnce()
    expect(page.data.pageError).toBeNull()
  })

  it('rebuilds four, eleven, and twenty-four seven-slot segments for each horizon', () => {
    const page = createPageInstance()
    page.onLoad()

    page.onHorizonTap(pageEvent({ horizonHours: '24' }))
    expect(page.data.horizonHours).toBe(24)
    expect(page.data.segmentCount).toBe(4)
    expect(page.data.dateOptions.length).toBeGreaterThanOrEqual(1)

    page.onHorizonTap(pageEvent({ horizonHours: '72' }))
    expect(page.data.segmentCount).toBe(11)

    page.onHorizonTap(pageEvent({ horizonHours: '168' }))
    expect(page.data.horizonHours).toBe(168)
    expect(page.data.segmentCount).toBe(24)
    expect(page.data.dateOptions.length).toBeGreaterThanOrEqual(7)
    expect(page.data.dateOptions.length).toBeLessThanOrEqual(8)
  })

  it('shows seven whole-hour columns from the current UTC+8 hour and only future triggers', () => {
    const nowUnixSeconds = Date.parse('2026-09-25T10:47:00+08:00') / 1000
    vi.setSystemTime(new Date(nowUnixSeconds * 1000))
    const page = createPageInstance()

    page.onLoad()

    const slots = page.data.matrix?.rows[0]?.slots
    expect(slots).toHaveLength(7)
    expect(slots?.map((slot) => slot.timeLabel)).toEqual([
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
    ])
    expect(slots?.map((slot) => slot.isCurrentHour)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
    expect(
      page.data.eventItems.every((event) => event.triggerAtUnixSeconds >= nowUnixSeconds),
    ).toBe(true)
    expect(page.data.eventItems.find((event) => event.zoneId === 'zone_53')).toMatchObject({
      eventTypeId: 'pop1',
      timeLabel: '11:04',
    })
    expect(page.data.eventItems.find((event) => event.zoneId === 'zone_54')).toMatchObject({
      eventTypeId: 'pop5',
      timeLabel: '11:05',
    })
  })

  it('splits an aligned twenty-four-hour range into non-overlapping hour slots', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onHorizonTap(pageEvent({ horizonHours: '24' }))

    const starts: number[] = []
    for (let index = 0; index < page.data.segmentCount; index += 1) {
      starts.push(...(page.data.matrix?.rows[0]?.slots.map((slot) => slot.startUnixSeconds) ?? []))
      if (index + 1 < page.data.segmentCount) page.onSegmentTap(pageEvent({ delta: '1' }))
    }

    expect(starts).toHaveLength(24)
    expect(new Set(starts).size).toBe(24)
    expect(starts).toEqual(Array.from({ length: 24 }, (_, index) => ANCHOR + index * 3600))
  })

  it('jumps to the first intersecting segment and keeps filters when changing views', () => {
    vi.setSystemTime(new Date(Date.parse('2026-09-25T10:47:00+08:00')))
    const page = createPageInstance()
    page.onLoad()
    page.onAreaFilterTap(pageEvent({ zoneId: 'zone_37' }))
    page.onEventFilterTap(pageEvent({ eventTypeId: 'pop1' }))
    page.onSegmentTap(pageEvent({ delta: '1' }))

    const targetDate = page.data.dateOptions[2]
    if (targetDate === undefined) throw new Error('expected at least three local date options')
    page.onDateTap(pageEvent({ dateKey: targetDate.dateKey }))
    expect(page.data.selectedDateKey).toBe(targetDate.dateKey)
    expect(page.data.segmentIndex).toBe(5)

    page.onViewTap(pageEvent({ view: 'journey' }))
    expect(page.data.activeView).toBe('journey')
    expect(page.data.selectedZoneId).toBe('zone_37')
    expect(page.data.selectedEventTypeId).toBe('pop1')

    page.onViewTap(pageEvent({ view: 'matrix' }))
    expect(page.data.activeView).toBe('matrix')
    expect(page.data.selectedZoneId).toBe('zone_37')
    expect(page.data.selectedEventTypeId).toBe('pop1')
  })

  it('opens app-owned filter menus and applies the selected zone and event type', () => {
    const page = createPageInstance()
    page.onLoad()

    page.onAreaFilterTap(pageEvent())
    expect(page.data.openFilterMenu).toBe('zone')
    page.onAreaFilterTap(pageEvent({ zoneId: 'zone_37' }))
    expect(page.data.selectedZoneId).toBe('zone_37')
    expect(page.data.openFilterMenu).toBeNull()

    page.onEventFilterTap(pageEvent())
    expect(page.data.openFilterMenu).toBe('eventType')
    page.onEventFilterTap(pageEvent({ eventTypeId: 'pop1' }))
    expect(page.data.selectedEventTypeId).toBe('pop1')
    expect(page.data.openFilterMenu).toBeNull()
  })

  it('shows a next-event result only after both filters are selected', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onNextOccurrenceTap()
    expect(page.data.nextOccurrenceSearched).toBe(false)
    expect(page.data.nextOccurrenceResult).toBeNull()

    page.onAreaFilterTap(pageEvent({ zoneId: 'zone_37' }))
    page.onEventFilterTap(pageEvent({ eventTypeId: 'pop1' }))
    page.onNextOccurrenceTap()
    expect(page.data.nextOccurrenceSearched).toBe(true)
    expect(page.data.nextOccurrenceResult).not.toBeNull()
  })

  it('shows a clear no-result message when no matching event occurs within 379 hours', () => {
    vi.setSystemTime(new Date((ANCHOR + 1) * 1000))
    const noNext = structuredClone(reference)
    const event = noNext.eventTypes.find((item) => item.id === 'pop1')
    if (event === undefined) throw new Error('expected pop1 in runtime reference')
    event.periodHours = 10000
    storeMocks.getMajorEventReference.mockReturnValue(noNext)
    const page = createPageInstance()
    page.onLoad()
    page.onAreaFilterTap(pageEvent({ zoneId: 'zone_37' }))
    page.onEventFilterTap(pageEvent({ eventTypeId: 'pop1' }))

    page.onNextOccurrenceTap()

    expect(page.data.nextOccurrenceSearched).toBe(true)
    expect(page.data.nextOccurrenceResult).toBeNull()
    expect(page.data.nextOccurrenceMessage).toContain('約 16 天')
  })

  it('keeps a detail snapshot after a minute refresh and closes without losing filters', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onAreaFilterTap(pageEvent({ zoneId: 'zone_37' }))
    page.onEventFilterTap(pageEvent({ eventTypeId: 'pop1' }))
    const selected = page.data.eventItems[0]
    if (selected === undefined) throw new Error('expected a matching event for details')

    const structuredCloneOriginal = globalThis.structuredClone
    vi.stubGlobal('structuredClone', undefined)
    try {
      page.onEventTap(pageEvent({ eventKey: selected.key }))
    } finally {
      vi.stubGlobal('structuredClone', structuredCloneOriginal)
    }
    const snapshot = structuredClone(page.data.detailEventSnapshot)
    expect(page.data.detailEventSnapshot).not.toBe(selected)
    expect(page.data.detailEventSnapshot?.categories).not.toBe(selected.categories)
    vi.setSystemTime(new Date((ANCHOR + 30) * 1000))
    page.onShow()
    vi.advanceTimersByTime(30_000)

    expect(page.data.detailEventSnapshot).toEqual(snapshot)
    page.onCloseDetail()
    expect(page.data.detailEventSnapshot).toBeNull()
    expect(page.data.selectedZoneId).toBe('zone_37')
    expect(page.data.selectedEventTypeId).toBe('pop1')
  })

  it('keeps event details independent of device timezone offset badges', () => {
    const page = createPageInstance()
    page.onLoad()
    const selected = page.data.eventItems[0]
    if (selected === undefined) throw new Error('expected a forecast event')

    page.onEventTap(pageEvent({ eventKey: selected.key }))

    expect(page.data.detailEventSnapshot).toMatchObject({
      key: selected.key,
      dateKey: selected.dateKey,
      timeLabel: selected.timeLabel,
    })
    expect(page.data).not.toHaveProperty('showDetailUtcOffset')
  })

  it('marks failed region and category icons and keeps their text labels available', () => {
    const page = createPageInstance()
    page.onLoad()
    const item = page.data.eventItems[0]
    if (item === undefined) throw new Error('expected a forecast event')

    page.onRegionIconError(pageEvent({ zoneId: item.zoneId }))
    page.onCategoryIconError(pageEvent({ categoryId: item.categories[0]?.id }))

    expect(page.data.failedRegionIconIds).toContain(item.zoneId)
    expect(page.data.failedCategoryIconIds).toContain(item.categories[0]?.id)
    expect(page.data.matrix?.rows.find((row) => row.zoneId === item.zoneId)?.iconFailed).toBe(true)
    expect(page.data.eventItems[0]?.categories[0]?.name).toBe(item.categories[0]?.name)
  })

  it('retains filters and reports a deliberate empty state', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onAreaFilterTap(pageEvent({ zoneId: 'zone_999' }))

    expect(page.data.eventItems).toEqual([])
    expect(page.data.emptyMessage).toContain('海域')
    expect(page.data.selectedZoneId).toBe('zone_999')
  })
})

describe('大流行預測頁 markup contract', () => {
  const pageDirectory = resolve('miniprogram/subpkg-trade/pages/popularity')
  const wxml = readFileSync(resolve(pageDirectory, 'index.wxml'), 'utf8')
  const wxss = readFileSync(resolve(pageDirectory, 'index.wxss'), 'utf8')

  it('renders the approved matrix, journey, local assets, and accessible event actions', () => {
    expect(wxml).toContain('major-events-page')
    expect(wxml).toContain('matrix__slot')
    expect(wxml).toContain('matrix__zone-row')
    expect(wxml).toContain('journey__time-group')
    expect(wxml).toContain('major-events-filter-menu')
    expect(wxml).toContain('data-zone-id')
    expect(wxml).toContain('data-event-type-id')
    expect(wxml).toContain('aria-expanded')
    expect(wxml).toContain('data-event-key')
    expect(wxml).toContain('binderror="onRegionIconError"')
    expect(wxml).toContain('binderror="onCategoryIconError"')
    expect(wxml).toContain('aria-label="{{eventItem.accessibilityLabel}}"')
    expect(wxml).toContain('東八區時間')
    expect(wxml).toContain('依東八區日期排序')
    expect(wxml).not.toContain('依裝置時間')
    expect(wxml).toContain('{{eventItem.eventTypeName}}</text>')
    expect(wxml).toContain('headerSlot.isCurrentHour')
    expect(wxml).toContain('slot.isCurrentHour')
    expect(wxml).not.toContain('major-event-tag__time')
    expect(wxml).not.toContain('major-event-tag__exact-hour')
    const matrixMarkup = wxml.slice(
      wxml.indexOf('class="matrix-section"'),
      wxml.indexOf('class="journey-section"'),
    )
    expect(matrixMarkup).not.toContain('{{eventItem.timeLabel}} {{eventItem.minuteLabel}}')
    expect(matrixMarkup).not.toContain('eventItem.eventColorToken')
    expect(matrixMarkup).not.toContain('matrix__empty-mark')
    expect(matrixMarkup).toMatch(
      /class="matrix__event-target"[\s\S]*?bindtap="onEventTap"[\s\S]*?role="button"/,
    )
    expect(wxml).toContain('style="color: var({{eventItem.eventColorToken}})"')
    expect(wxml).toContain('style="color: var({{detailEventSnapshot.eventColorToken}})"')
    expect(wxml).not.toContain('showDetailUtcOffset')
    expect(wxml).toContain('aria-hidden="true"')
    expect(wxml).toContain(
      '時刻表為週期預測；城鎮活動優先時大流行可能不發生；同時最多兩種，預算耗盡或滿兩小時即結束。',
    )
    expect(wxml).toContain('本頁預測觸發時刻，不預測持續時間。')
    expect(wxss).toContain('var(--uwo-color-canvas)')
    expect(wxss).toContain('88rpx')
    expect(wxss).toContain('env(safe-area-inset-bottom)')
    expect(wxss).toContain('paper-chart-tile.png')
    expect(wxss).toContain('overflow-x: hidden')
    expect(wxss).toContain('.matrix-scroll')
    expect(wxss).toContain('.matrix__event-tag')
    expect(wxss).toContain('.matrix__slot--current')
    expect(wxss).toContain('.matrix__slot-head--current')
    expect(wxss).not.toContain('.matrix__empty-mark')
    expect(wxss).toMatch(/\.matrix__event-target\s*{[^}]*min-height:\s*88rpx/s)
    expect(wxss).toMatch(/\.matrix__event-tag\s*{[^}]*min-height:\s*40rpx/s)
    expect(wxss).toContain('var(--uwo-color-event-schedule-green)')
    expect(wxss).toContain('var(--uwo-color-time-current-hour)')
    expect(wxss).toContain('.major-event-tag__name')
    expect(wxss).not.toContain('.major-event-tag__time')
    expect(wxss).not.toContain('.major-event-tag__exact-hour')
    expect(wxss).toContain('text-overflow: ellipsis')
    expect(wxss).toContain('width: 832rpx')
  })
})
