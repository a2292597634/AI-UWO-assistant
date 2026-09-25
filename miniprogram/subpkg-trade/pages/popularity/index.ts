import { findNextMajorEvent, forecastMajorEvents } from '../../domain/major-event-forecast'
import {
  isRepeatedLocalWallTime,
  presentMajorEvent,
  presentMajorEventJourney,
  presentMajorEventMatrix,
} from '../../presenters/major-event-presenter'
import type {
  MajorEventJourneyDayGroup,
  MajorEventListViewItem,
  MajorEventMatrixView,
} from '../../presenters/major-event-presenter'
import { getMajorEventReference } from '../../runtime/major-event-data-store'
import { getTradeReference } from '../../runtime/trade-data-store'
import type {
  RuntimeMajorEventReference,
  RuntimeTradeReference,
} from '../../../contracts/runtime-data'

interface MajorEventDateOption {
  dateKey: string
  label: string
}

interface MajorEventFilterOption {
  id: string
  name: string
}

interface MajorEventPageItem extends MajorEventListViewItem {
  accessibilityLabel: string
  isExactHour: boolean
  zoneIconPath: string
  zoneIconFailed: boolean
  categories: Array<MajorEventListViewItem['categories'][number] & { iconFailed: boolean }>
}

interface MajorEventPageMatrix extends Omit<MajorEventMatrixView, 'rows'> {
  rows: Array<
    Omit<MajorEventMatrixView['rows'][number], 'slots'> & {
      iconFailed: boolean
      slots: Array<
        Omit<MajorEventMatrixView['rows'][number]['slots'][number], 'events'> & {
          events: MajorEventPageItem[]
        }
      >
    }
  >
}

interface MajorEventPageJourney extends Omit<MajorEventJourneyDayGroup, 'timeGroups'> {
  timeGroups: Array<
    Omit<MajorEventJourneyDayGroup['timeGroups'][number], 'events'> & {
      events: MajorEventPageItem[]
    }
  >
}

interface MajorEventPageData {
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
  zoneFilterLabel: string
  eventFilterLabel: string
  zoneOptions: MajorEventFilterOption[]
  eventTypeOptions: MajorEventFilterOption[]
  eventItems: MajorEventPageItem[]
  matrix: MajorEventPageMatrix | null
  journey: MajorEventPageJourney[]
  summaryLabel: string
  sourceVerifiedLabel: string
  emptyMessage: string | null
  pageError: string | null
  detailEventSnapshot: MajorEventPageItem | null
  showDetailUtcOffset: boolean
  nextOccurrenceResult: MajorEventPageItem | null
  nextOccurrenceSearched: boolean
  nextOccurrenceMessage: string | null
  failedRegionIconIds: string[]
  failedCategoryIconIds: string[]
}

interface MajorEventPageController {
  data: MajorEventPageData
  setData(update: Partial<MajorEventPageData>): void
}

interface MajorEventPageConfig {
  data: MajorEventPageData
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
  onDetailSheetTap(): void
  onNextOccurrenceTap(): void
  onRegionIconError(event: WechatMiniprogram.BaseEvent): void
  onCategoryIconError(event: WechatMiniprogram.BaseEvent): void
}

interface MajorEventPageContext extends MajorEventPageController {
  majorEventReference: RuntimeMajorEventReference | null
  tradeReference: RuntimeTradeReference | null
  minuteTimer: ReturnType<typeof setTimeout> | null
}

const SEGMENT_HOURS = 6
const ERROR_MESSAGE = '大流行資料暫時無法載入，請更新小程序後再試'
const EMPTY_HORIZON_MESSAGE = '所選範圍內沒有符合條件的大流行預測'

const getEventDataset = (event: WechatMiniprogram.BaseEvent): Record<string, unknown> => {
  const dataset = (event as { currentTarget?: { dataset?: unknown } } | undefined)?.currentTarget
    ?.dataset
  return dataset !== null && typeof dataset === 'object' && !Array.isArray(dataset)
    ? (dataset as Record<string, unknown>)
    : {}
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

const toLocalDateOption = (date: Date): MajorEventDateOption => {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())
  return {
    dateKey: `${year}-${month}-${day}`,
    label: `${year}/${month}/${day}`,
  }
}

const buildLocalDateOptions = (
  nowUnixSeconds: number,
  horizonHours: number,
): MajorEventDateOption[] => {
  const endUnixSeconds = nowUnixSeconds + horizonHours * 3600
  const cursor = new Date(nowUnixSeconds * 1000)
  cursor.setHours(0, 0, 0, 0)
  const dates: MajorEventDateOption[] = []

  while (cursor.getTime() / 1000 < endUnixSeconds) {
    const nextDay = new Date(cursor)
    nextDay.setDate(nextDay.getDate() + 1)
    if (nextDay.getTime() / 1000 > nowUnixSeconds) dates.push(toLocalDateOption(cursor))
    cursor.setTime(nextDay.getTime())
  }

  return dates
}

const localDateBounds = (dateKey: string): { start: number; end: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const startDate = new Date(year, month - 1, day)
  const endDate = new Date(year, month - 1, day + 1)
  return {
    start: startDate.getTime() / 1000,
    end: endDate.getTime() / 1000,
  }
}

const firstSegmentForLocalDate = (
  dateKey: string,
  nowUnixSeconds: number,
  horizonHours: number,
): number => {
  const bounds = localDateBounds(dateKey)
  if (bounds === null) return 0
  const segmentCount = horizonHours / SEGMENT_HOURS
  for (let index = 0; index < segmentCount; index += 1) {
    const start = nowUnixSeconds + index * SEGMENT_HOURS * 3600
    const end = start + SEGMENT_HOURS * 3600
    if (start < bounds.end && end > bounds.start) return index
  }
  return 0
}

const validateMajorEventReference = (value: unknown): RuntimeMajorEventReference => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('大流行 Runtime 參照資料不是物件')
  }
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.eventTypes) || record.eventTypes.length !== 8) {
    throw new Error('大流行 Runtime 參照資料必須包含八種事件')
  }
  if (!Array.isArray(record.zones) || record.zones.length !== 18) {
    throw new Error('大流行 Runtime 參照資料必須包含十八個海域')
  }
  if (
    typeof record.anchorEpochSeconds !== 'number' ||
    !Number.isFinite(record.anchorEpochSeconds)
  ) {
    throw new Error('大流行 Runtime 參照資料缺少有效計算錨點')
  }
  const sourceVerifiedOn = record.sourceVerifiedOn
  const sourceVerifiedDate =
    typeof sourceVerifiedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sourceVerifiedOn)
      ? new Date(`${sourceVerifiedOn}T00:00:00.000Z`)
      : null
  if (
    sourceVerifiedDate === null ||
    !Number.isFinite(sourceVerifiedDate.getTime()) ||
    sourceVerifiedDate.toISOString().slice(0, 10) !== sourceVerifiedOn
  ) {
    throw new Error('大流行 Runtime 參照資料缺少來源核對日期')
  }

  for (const item of record.eventTypes) {
    if (
      item === null ||
      typeof item !== 'object' ||
      typeof (item as Record<string, unknown>).id !== 'string' ||
      typeof (item as Record<string, unknown>).name !== 'string' ||
      !Number.isInteger((item as Record<string, unknown>).periodHours) ||
      Number((item as Record<string, unknown>).periodHours) < 1 ||
      !Array.isArray((item as Record<string, unknown>).tradeTypeIds)
    ) {
      throw new Error('大流行 Runtime 事件資料格式無效')
    }
  }
  for (const item of record.zones) {
    const zone =
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null
    if (
      zone === null ||
      typeof zone.id !== 'string' ||
      typeof zone.name !== 'string' ||
      !Number.isInteger(zone.phaseHours) ||
      !Number.isInteger(zone.delaySeconds) ||
      typeof zone.iconPath !== 'string' ||
      !zone.iconPath.startsWith('/subpkg-trade/assets/major-events/')
    ) {
      throw new Error('大流行 Runtime 海域資料格式無效')
    }
  }
  return value as RuntimeMajorEventReference
}

const validateTradeReference = (value: unknown): RuntimeTradeReference => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('交易品 Runtime 參照資料不是物件')
  }
  const tradeTypes = (value as { tradeTypes?: unknown }).tradeTypes
  if (
    !Array.isArray(tradeTypes) ||
    tradeTypes.some(
      (item) =>
        item === null ||
        typeof item !== 'object' ||
        typeof (item as Record<string, unknown>).id !== 'string' ||
        typeof (item as Record<string, unknown>).name !== 'string',
    )
  ) {
    throw new Error('交易品 Runtime 類別資料格式無效')
  }
  return value as RuntimeTradeReference
}

const pageItem = (
  item: MajorEventListViewItem,
  reference: RuntimeMajorEventReference,
  failedRegionIds: ReadonlySet<string>,
  failedCategoryIds: ReadonlySet<string>,
): MajorEventPageItem => {
  const zone = reference.zones.find((candidate) => candidate.id === item.zoneId)
  return {
    ...item,
    accessibilityLabel: `${item.zoneName}，${item.eventTypeName}，${item.dateLabel} ${item.timeLabel} ${item.minuteLabel}`,
    isExactHour: item.minuteLabel === '整點',
    zoneIconPath: zone?.iconPath ?? '/subpkg-trade/assets/major-events/compass-rose.png',
    zoneIconFailed: failedRegionIds.has(item.zoneId),
    categories: item.categories.map((category) => ({
      ...category,
      iconFailed: failedCategoryIds.has(category.id),
    })),
  }
}

const copyEventSnapshot = (item: MajorEventPageItem): MajorEventPageItem => ({
  ...item,
  categories: item.categories.map((category) => ({ ...category })),
})

const pageMatrix = (
  matrix: MajorEventMatrixView,
  reference: RuntimeMajorEventReference,
  selectedZoneId: string | null,
  failedRegionIds: ReadonlySet<string>,
  failedCategoryIds: ReadonlySet<string>,
): MajorEventPageMatrix => ({
  ...matrix,
  rows: (() => {
    const selectedRows = matrix.rows.filter(
      (row) => selectedZoneId === null || selectedZoneId === row.zoneId,
    )
    return (selectedRows.length > 0 ? selectedRows : matrix.rows).map((row) => ({
      ...row,
      iconFailed: failedRegionIds.has(row.zoneId),
      slots: row.slots.map((slot) => ({
        ...slot,
        events: slot.events.map((item) =>
          pageItem(item, reference, failedRegionIds, failedCategoryIds),
        ),
      })),
    }))
  })(),
})

const pageJourney = (
  journey: MajorEventJourneyDayGroup[],
  reference: RuntimeMajorEventReference,
  failedRegionIds: ReadonlySet<string>,
  failedCategoryIds: ReadonlySet<string>,
): MajorEventPageJourney[] =>
  journey.map((day) => ({
    ...day,
    timeGroups: day.timeGroups.map((group) => ({
      ...group,
      events: group.events.map((item) =>
        pageItem(item, reference, failedRegionIds, failedCategoryIds),
      ),
    })),
  }))

const emptyHorizonMessage = (
  horizonHours: number,
  zoneId: string | null,
  eventTypeId: string | null,
  reference: RuntimeMajorEventReference,
): string => {
  const zoneName = reference.zones.find((zone) => zone.id === zoneId)?.name
  const eventTypeName = reference.eventTypes.find((event) => event.id === eventTypeId)?.name
  if (zoneId !== null && eventTypeId !== null) {
    return `未來 ${horizonHours} 小時內，${zoneName ?? zoneId}沒有${eventTypeName ?? eventTypeId}預測`
  }
  if (zoneId !== null) return `未來 ${horizonHours} 小時內，${zoneName ?? zoneId}海域沒有大流行預測`
  if (eventTypeName) return `未來 ${horizonHours} 小時內，沒有符合「${eventTypeName}」的預測`
  return EMPTY_HORIZON_MESSAGE
}

const refreshPage = (
  page: MajorEventPageContext,
  nowUnixSeconds = Math.floor(Date.now() / 1000),
): void => {
  const reference = page.majorEventReference
  const trade = page.tradeReference
  if (reference === null || trade === null) {
    page.setData({ pageError: ERROR_MESSAGE, matrix: null, journey: [], eventItems: [] })
    return
  }

  try {
    const now = Math.floor(nowUnixSeconds)
    const dates = buildLocalDateOptions(now, page.data.horizonHours)
    const dateStillAvailable = dates.some((date) => date.dateKey === page.data.selectedDateKey)
    const selectedDateKey = dateStillAvailable
      ? page.data.selectedDateKey
      : (dates[0]?.dateKey ?? '')
    const segmentCount = page.data.horizonHours / SEGMENT_HOURS
    const segmentIndex = dateStillAvailable
      ? Math.min(Math.max(page.data.segmentIndex, 0), segmentCount - 1)
      : 0
    const occurrences = forecastMajorEvents(reference, {
      nowUnixSeconds: now,
      horizonHours: page.data.horizonHours,
      zoneId: page.data.selectedZoneId,
      eventTypeId: page.data.selectedEventTypeId,
    })
    const failedCategories = new Set(page.data.failedCategoryIconIds)
    const failedRegions = new Set(page.data.failedRegionIconIds)
    const segmentStartUnixSeconds = now + segmentIndex * SEGMENT_HOURS * 3600
    const matrix = pageMatrix(
      presentMajorEventMatrix(occurrences, reference, trade, segmentStartUnixSeconds),
      reference,
      page.data.selectedZoneId,
      failedRegions,
      failedCategories,
    )
    const journey = pageJourney(
      presentMajorEventJourney(occurrences, trade),
      reference,
      failedRegions,
      failedCategories,
    )
    const eventItems = occurrences.map((event) =>
      pageItem(presentMajorEvent(event, trade), reference, failedRegions, failedCategories),
    )
    const zoneCount = new Set(occurrences.map((event) => event.zoneId)).size
    const summaryLabel = `未來 ${page.data.horizonHours} 小時 · ${occurrences.length} 筆預測 · ${zoneCount}/${reference.zones.length} 海域`

    page.setData({
      nowUnixSeconds: now,
      dateOptions: dates,
      selectedDateKey,
      segmentIndex,
      segmentCount,
      eventItems,
      matrix,
      journey,
      summaryLabel,
      sourceVerifiedLabel: reference.sourceVerifiedOn.replace(/-/g, '/'),
      emptyMessage:
        occurrences.length === 0
          ? emptyHorizonMessage(
              page.data.horizonHours,
              page.data.selectedZoneId,
              page.data.selectedEventTypeId,
              reference,
            )
          : null,
      pageError: null,
      zoneOptions: [
        { id: '', name: '全部海域' },
        ...reference.zones.map((zone) => ({ id: zone.id, name: zone.name })),
      ],
      eventTypeOptions: [
        { id: '', name: '全部類型' },
        ...reference.eventTypes.map((event) => ({ id: event.id, name: event.name })),
      ],
      zoneFilterLabel:
        reference.zones.find((zone) => zone.id === page.data.selectedZoneId)?.name ?? '全部海域',
      eventFilterLabel:
        reference.eventTypes.find((event) => event.id === page.data.selectedEventTypeId)?.name ??
        '全部類型',
    })
  } catch {
    page.setData({
      eventItems: [],
      matrix: null,
      journey: [],
      emptyMessage: null,
      pageError: ERROR_MESSAGE,
    })
  }
}

const clearMinuteTimer = (page: MajorEventPageContext): void => {
  if (page.minuteTimer !== null) clearTimeout(page.minuteTimer)
  page.minuteTimer = null
}

const scheduleMinuteRefresh = (page: MajorEventPageContext): void => {
  clearMinuteTimer(page)
  const delay = 60_000 - (Date.now() % 60_000)
  page.minuteTimer = setTimeout(() => {
    page.minuteTimer = null
    refreshPage(page)
    scheduleMinuteRefresh(page)
  }, delay)
}

const updateIconFallbacks = (page: MajorEventPageContext): void => {
  const failedCategories = new Set(page.data.failedCategoryIconIds)
  const failedRegions = new Set(page.data.failedRegionIconIds)
  const replaceItem = (item: MajorEventPageItem): MajorEventPageItem =>
    pageItem(
      item,
      page.majorEventReference as RuntimeMajorEventReference,
      failedRegions,
      failedCategories,
    )
  const matrix = page.data.matrix
    ? {
        ...page.data.matrix,
        rows: page.data.matrix.rows.map((row) => ({
          ...row,
          iconFailed: failedRegions.has(row.zoneId),
          slots: row.slots.map((slot) => ({
            ...slot,
            events: slot.events.map(replaceItem),
          })),
        })),
      }
    : null
  const journey = page.data.journey.map((day) => ({
    ...day,
    timeGroups: day.timeGroups.map((group) => ({
      ...group,
      events: group.events.map(replaceItem),
    })),
  }))
  page.setData({
    matrix,
    journey,
    eventItems: page.data.eventItems.map(replaceItem),
    detailEventSnapshot:
      page.data.detailEventSnapshot === null ? null : replaceItem(page.data.detailEventSnapshot),
    nextOccurrenceResult:
      page.data.nextOccurrenceResult === null ? null : replaceItem(page.data.nextOccurrenceResult),
  })
}

Page({
  data: {
    activeView: 'matrix',
    horizonHours: 72,
    nowUnixSeconds: 0,
    selectedDateKey: '',
    dateOptions: [],
    segmentIndex: 0,
    segmentCount: 12,
    selectedZoneId: null,
    selectedEventTypeId: null,
    openFilterMenu: null,
    zoneFilterLabel: '全部海域',
    eventFilterLabel: '全部類型',
    zoneOptions: [],
    eventTypeOptions: [],
    eventItems: [],
    matrix: null,
    journey: [],
    summaryLabel: '',
    sourceVerifiedLabel: '',
    emptyMessage: null,
    pageError: null,
    detailEventSnapshot: null,
    showDetailUtcOffset: false,
    nextOccurrenceResult: null,
    nextOccurrenceSearched: false,
    nextOccurrenceMessage: null,
    failedRegionIconIds: [],
    failedCategoryIconIds: [],
  } as MajorEventPageData,

  onLoad() {
    const page = this as unknown as MajorEventPageContext
    page.majorEventReference = null
    page.tradeReference = null
    page.minuteTimer = null
    try {
      page.majorEventReference = validateMajorEventReference(getMajorEventReference())
      page.tradeReference = validateTradeReference(getTradeReference())
      wx.setNavigationBarTitle({ title: '大流行預測' })
      refreshPage(page)
    } catch {
      page.setData({
        pageError: ERROR_MESSAGE,
        eventItems: [],
        matrix: null,
        journey: [],
        emptyMessage: null,
      })
    }
  },

  onShow() {
    const page = this as unknown as MajorEventPageContext
    if (page.majorEventReference === null || page.tradeReference === null) return
    refreshPage(page)
    scheduleMinuteRefresh(page)
  },

  onHide() {
    clearMinuteTimer(this as unknown as MajorEventPageContext)
  },

  async onPullDownRefresh() {
    const page = this as unknown as MajorEventPageContext
    try {
      if (page.majorEventReference !== null && page.tradeReference !== null) refreshPage(page)
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  onHorizonTap(event: WechatMiniprogram.BaseEvent) {
    const horizonHours = Number(getEventDataset(event).horizonHours)
    if (horizonHours !== 24 && horizonHours !== 72 && horizonHours !== 168) return
    const page = this as unknown as MajorEventPageContext
    page.setData({
      horizonHours,
      segmentCount: horizonHours / SEGMENT_HOURS,
      segmentIndex: 0,
      selectedDateKey: '',
      nextOccurrenceSearched: false,
      nextOccurrenceResult: null,
      nextOccurrenceMessage: null,
      openFilterMenu: null,
    })
    refreshPage(page)
  },

  onViewTap(event: WechatMiniprogram.BaseEvent) {
    const view = getEventDataset(event).view
    if (view === 'matrix' || view === 'journey') {
      const page = this as unknown as MajorEventPageContext
      page.setData({ activeView: view, openFilterMenu: null })
    }
  },

  onDateTap(event: WechatMiniprogram.BaseEvent) {
    const page = this as unknown as MajorEventPageContext
    const dateKey = getEventDataset(event).dateKey
    if (
      typeof dateKey !== 'string' ||
      !page.data.dateOptions.some((date) => date.dateKey === dateKey)
    ) {
      return
    }
    page.setData({
      selectedDateKey: dateKey,
      segmentIndex: firstSegmentForLocalDate(
        dateKey,
        page.data.nowUnixSeconds,
        page.data.horizonHours,
      ),
    })
    refreshPage(page, page.data.nowUnixSeconds)
  },

  onSegmentTap(event: WechatMiniprogram.BaseEvent) {
    const page = this as unknown as MajorEventPageContext
    const delta = Number(getEventDataset(event).delta)
    if (!Number.isInteger(delta) || delta === 0) return
    const segmentIndex = Math.min(
      Math.max(page.data.segmentIndex + delta, 0),
      page.data.segmentCount - 1,
    )
    page.setData({ segmentIndex })
    refreshPage(page, page.data.nowUnixSeconds)
  },

  onAreaFilterTap(event: WechatMiniprogram.BaseEvent) {
    const page = this as unknown as MajorEventPageContext
    const dataset = getEventDataset(event)
    if (typeof dataset.zoneId !== 'string') {
      page.setData({
        openFilterMenu: page.data.openFilterMenu === 'zone' ? null : 'zone',
      })
      return
    }
    const zoneId = dataset.zoneId === '' ? null : dataset.zoneId
    page.setData({
      selectedZoneId: zoneId,
      openFilterMenu: null,
      nextOccurrenceSearched: false,
      nextOccurrenceResult: null,
      nextOccurrenceMessage: null,
    })
    refreshPage(page)
  },

  onEventFilterTap(event: WechatMiniprogram.BaseEvent) {
    const page = this as unknown as MajorEventPageContext
    const dataset = getEventDataset(event)
    if (typeof dataset.eventTypeId !== 'string') {
      page.setData({
        openFilterMenu: page.data.openFilterMenu === 'eventType' ? null : 'eventType',
      })
      return
    }
    const eventTypeId = dataset.eventTypeId === '' ? null : dataset.eventTypeId
    page.setData({
      selectedEventTypeId: eventTypeId,
      openFilterMenu: null,
      nextOccurrenceSearched: false,
      nextOccurrenceResult: null,
      nextOccurrenceMessage: null,
    })
    refreshPage(page)
  },

  onEventTap(event: WechatMiniprogram.BaseEvent) {
    const page = this as unknown as MajorEventPageContext
    const eventKey = getEventDataset(event).eventKey
    if (typeof eventKey !== 'string') return
    const selected =
      page.data.eventItems.find((item) => item.key === eventKey) ??
      (page.data.nextOccurrenceResult?.key === eventKey ? page.data.nextOccurrenceResult : null)
    if (selected === null || selected === undefined) return
    page.setData({
      detailEventSnapshot: copyEventSnapshot(selected),
      showDetailUtcOffset: isRepeatedLocalWallTime(selected.triggerAtUnixSeconds),
    })
  },

  onCloseDetail() {
    const page = this as unknown as MajorEventPageContext
    page.setData({
      detailEventSnapshot: null,
      showDetailUtcOffset: false,
    })
  },

  onDetailSheetTap() {},

  onNextOccurrenceTap() {
    const page = this as unknown as MajorEventPageContext
    if (
      page.majorEventReference === null ||
      page.tradeReference === null ||
      page.data.selectedZoneId === null ||
      page.data.selectedEventTypeId === null
    ) {
      page.setData({
        nextOccurrenceSearched: false,
        nextOccurrenceResult: null,
        nextOccurrenceMessage: null,
      })
      return
    }
    try {
      const occurrence = findNextMajorEvent(page.majorEventReference, {
        nowUnixSeconds: page.data.nowUnixSeconds,
        zoneId: page.data.selectedZoneId,
        eventTypeId: page.data.selectedEventTypeId,
      })
      page.setData({
        nextOccurrenceResult:
          occurrence === null
            ? null
            : pageItem(
                presentMajorEvent(occurrence, page.tradeReference),
                page.majorEventReference,
                new Set(page.data.failedRegionIconIds),
                new Set(page.data.failedCategoryIconIds),
              ),
        nextOccurrenceSearched: true,
        nextOccurrenceMessage: occurrence === null ? '約 16 天內沒有符合條件的預測' : null,
      })
    } catch {
      page.setData({
        pageError: ERROR_MESSAGE,
        nextOccurrenceResult: null,
        nextOccurrenceSearched: false,
      })
    }
  },

  onRegionIconError(event: WechatMiniprogram.BaseEvent) {
    const page = this as unknown as MajorEventPageContext
    const zoneId = getEventDataset(event).zoneId
    if (typeof zoneId !== 'string' || page.data.failedRegionIconIds.includes(zoneId)) return
    page.setData({ failedRegionIconIds: [...page.data.failedRegionIconIds, zoneId] })
    updateIconFallbacks(page)
  },

  onCategoryIconError(event: WechatMiniprogram.BaseEvent) {
    const page = this as unknown as MajorEventPageContext
    const categoryId = getEventDataset(event).categoryId
    if (typeof categoryId !== 'string' || page.data.failedCategoryIconIds.includes(categoryId)) {
      return
    }
    page.setData({ failedCategoryIconIds: [...page.data.failedCategoryIconIds, categoryId] })
    updateIconFallbacks(page)
  },
} satisfies MajorEventPageConfig)
