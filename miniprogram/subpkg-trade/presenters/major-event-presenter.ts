import type { MajorEventOccurrence } from '../domain/major-event-forecast'
import type {
  RuntimeMajorEventReference,
  RuntimeMajorEventZone,
  RuntimeTradeReference,
} from '../../contracts/runtime-data'
import { toGameTimeDate } from '../game-time'
import { getTradeCategoryIconPath } from '../trade-category-icons'

export interface MajorEventCategoryView {
  id: string
  name: string
  iconPath: string
}

export interface MajorEventListViewItem extends MajorEventOccurrence {
  dateKey: string
  dateLabel: string
  timeLabel: string
  minuteLabel: string
  eventColorToken: string
  categories: MajorEventCategoryView[]
}

export interface MajorEventMatrixSlot {
  index: number
  startUnixSeconds: number
  timeLabel: string
  isCurrentHour: boolean
  events: MajorEventListViewItem[]
}

export interface MajorEventMatrixZoneRow {
  zoneId: string
  zoneName: string
  iconPath: string
  slots: MajorEventMatrixSlot[]
}

export interface MajorEventMatrixView {
  segmentStartUnixSeconds: number
  segmentEndUnixSeconds: number
  segmentStartLabel: string
  segmentEndLabel: string
  rows: MajorEventMatrixZoneRow[]
}

export interface MajorEventJourneyTimeGroup {
  timeLabel: string
  events: MajorEventListViewItem[]
}

export interface MajorEventJourneyDayGroup {
  dateKey: string
  dateLabel: string
  timeGroups: MajorEventJourneyTimeGroup[]
}

const EVENT_COLOR_TOKENS: Readonly<Record<string, string>> = {
  pop1: '--uwo-color-event-forest',
  pop2: '--uwo-color-event-sea',
  pop3: '--uwo-color-event-forest',
  pop4: '--uwo-color-event-brass',
  pop5: '--uwo-color-event-rust',
  pop6: '--uwo-color-event-rust',
  pop7: '--uwo-color-event-rust',
  pop8: '--uwo-color-event-brass',
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

const gameDateParts = (unixSeconds: number) => {
  const date = toGameTimeDate(unixSeconds)
  const year = String(date.getUTCFullYear()).padStart(4, '0')
  const month = pad2(date.getUTCMonth() + 1)
  const day = pad2(date.getUTCDate())
  return {
    date,
    dateKey: `${year}-${month}-${day}`,
    dateLabel: `${year}/${month}/${day}`,
  }
}

const dateTimeLabel = (unixSeconds: number): string => {
  const { date, dateLabel } = gameDateParts(unixSeconds)
  return `${dateLabel} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`
}

export const presentMajorEvent = (
  occurrence: MajorEventOccurrence,
  tradeReference: RuntimeTradeReference,
): MajorEventListViewItem => {
  const colorToken = EVENT_COLOR_TOKENS[occurrence.eventTypeId]
  if (colorToken === undefined) {
    throw new Error(`大流行事件缺少色彩 Token：${occurrence.eventTypeId}`)
  }

  const { date, dateKey, dateLabel } = gameDateParts(occurrence.triggerAtUnixSeconds)
  const displayedMinute = Math.round(occurrence.delaySeconds / 60)
  const timeLabel = `${pad2(date.getUTCHours())}:${pad2(displayedMinute)}`
  const minuteLabel = displayedMinute === 0 ? '整點' : `${pad2(displayedMinute)} 分`

  const categories = occurrence.tradeTypeIds.map((categoryId): MajorEventCategoryView => {
    const category = tradeReference.tradeTypes.find((item) => item.id === categoryId)
    const iconPath = getTradeCategoryIconPath(categoryId)
    if (category === undefined || category.name.length === 0 || iconPath === null) {
      throw new Error(`大流行事件 ${occurrence.eventTypeId} 缺少交易品類名稱或圖示：${categoryId}`)
    }
    return { id: category.id, name: category.name, iconPath }
  })

  return {
    ...occurrence,
    dateKey,
    dateLabel,
    timeLabel,
    minuteLabel,
    eventColorToken: colorToken,
    categories,
  }
}

export const presentMajorEventMatrix = (
  occurrences: readonly MajorEventOccurrence[],
  reference: RuntimeMajorEventReference,
  tradeReference: RuntimeTradeReference,
  segmentStartUnixSeconds: number,
  slotCount: number,
  currentHourStartUnixSeconds: number,
): MajorEventMatrixView => {
  if (!Number.isFinite(segmentStartUnixSeconds)) {
    throw new Error(`無效的大流行矩陣段起點：${segmentStartUnixSeconds}`)
  }
  if (!Number.isInteger(slotCount) || slotCount < 1 || slotCount > 7) {
    throw new Error(`大流行矩陣槽數必須介於 1 至 7：${slotCount}`)
  }
  if (!Number.isFinite(currentHourStartUnixSeconds)) {
    throw new Error(`無效的大流行目前時段：${currentHourStartUnixSeconds}`)
  }

  const segmentEndUnixSeconds = segmentStartUnixSeconds + slotCount * 3600
  const rows = reference.zones.map((zone: RuntimeMajorEventZone): MajorEventMatrixZoneRow => ({
    zoneId: zone.id,
    zoneName: zone.name,
    iconPath: zone.iconPath,
    slots: Array.from({ length: slotCount }, (_, index): MajorEventMatrixSlot => {
      const startUnixSeconds = segmentStartUnixSeconds + index * 3600
      const slotEvents = occurrences
        .map((event, originalIndex) => ({ event, originalIndex }))
        .filter(
          ({ event }) =>
            event.zoneId === zone.id &&
            Math.floor((event.triggerAtUnixSeconds - segmentStartUnixSeconds) / 3600) === index,
        )
        .sort(
          (left, right) =>
            left.event.triggerAtUnixSeconds - right.event.triggerAtUnixSeconds ||
            left.originalIndex - right.originalIndex,
        )
        .map(({ event }) => presentMajorEvent(event, tradeReference))

      return {
        index,
        startUnixSeconds,
        timeLabel: dateTimeLabel(startUnixSeconds).slice(-5),
        isCurrentHour: startUnixSeconds === currentHourStartUnixSeconds,
        events: slotEvents,
      }
    }),
  }))

  return {
    segmentStartUnixSeconds,
    segmentEndUnixSeconds,
    segmentStartLabel: dateTimeLabel(segmentStartUnixSeconds),
    segmentEndLabel: dateTimeLabel(segmentEndUnixSeconds),
    rows,
  }
}

export const presentMajorEventJourney = (
  occurrences: readonly MajorEventOccurrence[],
  tradeReference: RuntimeTradeReference,
): MajorEventJourneyDayGroup[] => {
  const sortedOccurrences = occurrences
    .map((event, originalIndex) => ({ event, originalIndex }))
    .sort(
      (left, right) =>
        left.event.triggerAtUnixSeconds - right.event.triggerAtUnixSeconds ||
        left.originalIndex - right.originalIndex,
    )

  const days = new Map<string, MajorEventJourneyDayGroup>()
  for (const { event } of sortedOccurrences) {
    const viewItem = presentMajorEvent(event, tradeReference)
    let day = days.get(viewItem.dateKey)
    if (day === undefined) {
      day = {
        dateKey: viewItem.dateKey,
        dateLabel: viewItem.dateLabel,
        timeGroups: [],
      }
      days.set(viewItem.dateKey, day)
    }

    let timeGroup = day.timeGroups.find((group) => group.timeLabel === viewItem.timeLabel)
    if (timeGroup === undefined) {
      timeGroup = { timeLabel: viewItem.timeLabel, events: [] }
      day.timeGroups.push(timeGroup)
    }
    timeGroup.events.push(viewItem)
  }

  return [...days.values()]
}
