import type { MajorEventOccurrence } from '../domain/major-event-forecast'
import type {
  RuntimeMajorEventReference,
  RuntimeMajorEventZone,
  RuntimeTradeReference,
} from '../../contracts/runtime-data'
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
  utcOffsetLabel: string
  eventColorToken: string
  categories: MajorEventCategoryView[]
}

export interface MajorEventMatrixSlot {
  index: number
  startUnixSeconds: number
  timeLabel: string
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

const localDateParts = (unixSeconds: number) => {
  const date = new Date(unixSeconds * 1000)
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`無效的大流行觸發時間：${unixSeconds}`)
  }
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())
  return {
    date,
    dateKey: `${year}-${month}-${day}`,
    dateLabel: `${year}/${month}/${day}`,
  }
}

const localTimeLabel = (date: Date, minute: number): string =>
  `${pad2(date.getHours())}:${pad2(minute)}`

const utcOffsetLabel = (date: Date): string => {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absoluteMinutes = Math.abs(offsetMinutes)
  return `UTC${sign}${pad2(Math.floor(absoluteMinutes / 60))}:${pad2(absoluteMinutes % 60)}`
}

export const isRepeatedLocalWallTime = (unixSeconds: number): boolean => {
  const target = new Date(unixSeconds * 1000)
  if (!Number.isFinite(target.getTime())) return false

  const targetParts = [
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
    target.getHours(),
    target.getMinutes(),
    target.getSeconds(),
    target.getMilliseconds(),
  ]
  const wallClockTimestamp = Date.UTC(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
    target.getHours(),
    target.getMinutes(),
    target.getSeconds(),
    target.getMilliseconds(),
  )
  const offsetCandidates = new Set<number>()
  const searchRadiusMilliseconds = 4 * 60 * 60 * 1000
  const sampleIntervalMilliseconds = 15 * 60 * 1000

  for (
    let offset = -searchRadiusMilliseconds;
    offset <= searchRadiusMilliseconds;
    offset += sampleIntervalMilliseconds
  ) {
    offsetCandidates.add(new Date(target.getTime() + offset).getTimezoneOffset())
  }

  for (const offsetMinutes of offsetCandidates) {
    if (offsetMinutes === target.getTimezoneOffset()) continue
    const candidate = new Date(wallClockTimestamp + offsetMinutes * 60 * 1000)
    if (
      candidate.getFullYear() === targetParts[0] &&
      candidate.getMonth() === targetParts[1] &&
      candidate.getDate() === targetParts[2] &&
      candidate.getHours() === targetParts[3] &&
      candidate.getMinutes() === targetParts[4] &&
      candidate.getSeconds() === targetParts[5] &&
      candidate.getMilliseconds() === targetParts[6] &&
      candidate.getTimezoneOffset() !== target.getTimezoneOffset()
    ) {
      return true
    }
  }

  return false
}

const dateTimeLabel = (unixSeconds: number): string => {
  const { date, dateLabel } = localDateParts(unixSeconds)
  return `${dateLabel} ${localTimeLabel(date, date.getMinutes())}`
}

export const presentMajorEvent = (
  occurrence: MajorEventOccurrence,
  tradeReference: RuntimeTradeReference,
): MajorEventListViewItem => {
  const colorToken = EVENT_COLOR_TOKENS[occurrence.eventTypeId]
  if (colorToken === undefined) {
    throw new Error(`大流行事件缺少色彩 Token：${occurrence.eventTypeId}`)
  }

  const { date, dateKey, dateLabel } = localDateParts(occurrence.triggerAtUnixSeconds)
  const displayedMinute = Math.round(occurrence.delaySeconds / 60)
  const timeLabel = localTimeLabel(date, displayedMinute)
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
    utcOffsetLabel: utcOffsetLabel(date),
    eventColorToken: colorToken,
    categories,
  }
}

export const presentMajorEventMatrix = (
  occurrences: readonly MajorEventOccurrence[],
  reference: RuntimeMajorEventReference,
  tradeReference: RuntimeTradeReference,
  segmentStartUnixSeconds: number,
): MajorEventMatrixView => {
  if (!Number.isFinite(segmentStartUnixSeconds)) {
    throw new Error(`無效的大流行矩陣段起點：${segmentStartUnixSeconds}`)
  }

  const segmentEndUnixSeconds = segmentStartUnixSeconds + 6 * 3600
  const rows = reference.zones.map((zone: RuntimeMajorEventZone): MajorEventMatrixZoneRow => ({
    zoneId: zone.id,
    zoneName: zone.name,
    iconPath: zone.iconPath,
    slots: Array.from({ length: 6 }, (_, index): MajorEventMatrixSlot => {
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
