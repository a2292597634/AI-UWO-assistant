import { forecastMajorEvents, forecastOngoingMajorEvents } from '../../domain/major-event-forecast'
import { gameHourStartUnixSeconds } from '../../game-time'
import {
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

interface MajorEventPageItem extends MajorEventListViewItem {
  accessibilityLabel: string
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
  segmentIndex: number
  segmentCount: number
  eventItems: MajorEventPageItem[]
  matrix: MajorEventPageMatrix | null
  journey: MajorEventPageJourney[]
  summaryLabel: string
  sourceVerifiedLabel: string
  emptyMessage: string | null
  pageError: string | null
  detailEventSnapshot: MajorEventPageItem | null
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
  onSegmentTap(event: WechatMiniprogram.BaseEvent): void
  onEventTap(event: WechatMiniprogram.BaseEvent): void
  onCloseDetail(): void
  onDetailSheetTap(): void
  onRegionIconError(event: WechatMiniprogram.BaseEvent): void
  onCategoryIconError(event: WechatMiniprogram.BaseEvent): void
}

interface MajorEventPageContext extends MajorEventPageController {
  majorEventReference: RuntimeMajorEventReference | null
  tradeReference: RuntimeTradeReference | null
  minuteTimer: ReturnType<typeof setTimeout> | null
}

const SLOTS_PER_MATRIX_SEGMENT = 7
const SECONDS_PER_HOUR = 3600
const ERROR_MESSAGE = '大流行資料暫時無法載入，請更新小程序後再試'
const EMPTY_HORIZON_MESSAGE = '所選範圍內沒有大流行日程'

const getEventDataset = (event: WechatMiniprogram.BaseEvent): Record<string, unknown> => {
  const dataset = (event as { currentTarget?: { dataset?: unknown } } | undefined)?.currentTarget
    ?.dataset
  return dataset !== null && typeof dataset === 'object' && !Array.isArray(dataset)
    ? (dataset as Record<string, unknown>)
    : {}
}

const totalMatrixSlotCount = (nowUnixSeconds: number, horizonHours: number): number =>
  Math.ceil(
    (nowUnixSeconds + horizonHours * SECONDS_PER_HOUR - gameHourStartUnixSeconds(nowUnixSeconds)) /
      SECONDS_PER_HOUR,
  )

const matrixSegmentCount = (nowUnixSeconds: number, horizonHours: number): number =>
  Math.ceil(totalMatrixSlotCount(nowUnixSeconds, horizonHours) / SLOTS_PER_MATRIX_SEGMENT)

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
  failedRegionIds: ReadonlySet<string>,
  failedCategoryIds: ReadonlySet<string>,
): MajorEventPageMatrix => ({
  ...matrix,
  rows: matrix.rows
    .filter((row) => row.slots.some((slot) => slot.events.length > 0))
    .map((row) => ({
      ...row,
      iconFailed: failedRegionIds.has(row.zoneId),
      slots: row.slots.map((slot) => ({
        ...slot,
        events: slot.events.map((item) =>
          pageItem(item, reference, failedRegionIds, failedCategoryIds),
        ),
      })),
    })),
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

const refreshPage = (
  page: MajorEventPageContext,
  nowUnixSeconds = Math.floor(Date.now() / 1000),
): void => {
  const reference = page.majorEventReference
  const trade = page.tradeReference
  if (reference === null || trade === null) {
    page.setData({
      pageError: ERROR_MESSAGE,
      matrix: null,
      journey: [],
      eventItems: [],
    })
    return
  }

  try {
    const now = Math.floor(nowUnixSeconds)
    const totalSlotCount = totalMatrixSlotCount(now, page.data.horizonHours)
    const segmentCount = Math.ceil(totalSlotCount / SLOTS_PER_MATRIX_SEGMENT)
    const segmentIndex = Math.min(Math.max(page.data.segmentIndex, 0), segmentCount - 1)
    const occurrences = forecastMajorEvents(reference, {
      nowUnixSeconds: now,
      horizonHours: page.data.horizonHours,
      zoneId: null,
      eventTypeId: null,
    })
    const ongoingOccurrences = forecastOngoingMajorEvents(reference, {
      nowUnixSeconds: now,
      zoneId: null,
      eventTypeId: null,
    })
    const failedCategories = new Set(page.data.failedCategoryIconIds)
    const failedRegions = new Set(page.data.failedRegionIconIds)
    const rangeStartUnixSeconds = gameHourStartUnixSeconds(now)
    const slotOffset = segmentIndex * SLOTS_PER_MATRIX_SEGMENT
    const slotCount = Math.min(SLOTS_PER_MATRIX_SEGMENT, totalSlotCount - slotOffset)
    const segmentStartUnixSeconds = rangeStartUnixSeconds + slotOffset * SECONDS_PER_HOUR
    const matrix = pageMatrix(
      presentMajorEventMatrix(
        occurrences,
        ongoingOccurrences,
        reference,
        trade,
        segmentStartUnixSeconds,
        slotCount,
        rangeStartUnixSeconds,
      ),
      reference,
      failedRegions,
      failedCategories,
    )
    const journey = pageJourney(
      presentMajorEventJourney(occurrences, trade),
      reference,
      failedRegions,
      failedCategories,
    )
    const ongoingKeys = new Set(ongoingOccurrences.map((event) => event.key))
    const eventItems = [...ongoingOccurrences, ...occurrences]
      .sort((left, right) => left.triggerAtUnixSeconds - right.triggerAtUnixSeconds)
      .map((event) =>
        pageItem(
          presentMajorEvent(event, trade, ongoingKeys.has(event.key)),
          reference,
          failedRegions,
          failedCategories,
        ),
      )
    const zoneCount = new Set(occurrences.map((event) => event.zoneId)).size
    const summaryLabel = `未來 ${page.data.horizonHours} 小時 · ${occurrences.length} 項日程 · ${zoneCount}/${reference.zones.length} 個海域`

    page.setData({
      nowUnixSeconds: now,
      segmentIndex,
      segmentCount,
      eventItems,
      matrix,
      journey,
      summaryLabel,
      sourceVerifiedLabel: reference.sourceVerifiedOn.replace(/-/g, '/'),
      emptyMessage: occurrences.length === 0 ? EMPTY_HORIZON_MESSAGE : null,
      pageError: null,
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
  })
}

Page({
  data: {
    activeView: 'matrix',
    horizonHours: 72,
    nowUnixSeconds: 0,
    segmentIndex: 0,
    segmentCount: 11,
    eventItems: [],
    matrix: null,
    journey: [],
    summaryLabel: '',
    sourceVerifiedLabel: '',
    emptyMessage: null,
    pageError: null,
    detailEventSnapshot: null,
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
      wx.setNavigationBarTitle({ title: '大流行時刻表' })
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
      segmentCount: matrixSegmentCount(page.data.nowUnixSeconds, horizonHours),
      segmentIndex: 0,
    })
    refreshPage(page)
  },

  onViewTap(event: WechatMiniprogram.BaseEvent) {
    const view = getEventDataset(event).view
    if (view === 'matrix' || view === 'journey') {
      const page = this as unknown as MajorEventPageContext
      page.setData({ activeView: view })
    }
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

  onEventTap(event: WechatMiniprogram.BaseEvent) {
    const page = this as unknown as MajorEventPageContext
    const eventKey = getEventDataset(event).eventKey
    if (typeof eventKey !== 'string') return
    const selected = page.data.eventItems.find((item) => item.key === eventKey)
    if (selected === null || selected === undefined) return
    page.setData({
      detailEventSnapshot: copyEventSnapshot(selected),
    })
  },

  onCloseDetail() {
    const page = this as unknown as MajorEventPageContext
    page.setData({
      detailEventSnapshot: null,
    })
  },

  onDetailSheetTap() {},

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
