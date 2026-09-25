import type {
  RuntimeMajorEventReference,
  RuntimeMajorEventType,
  RuntimeMajorEventZone,
} from '../../contracts/runtime-data'

export interface MajorEventForecastQuery {
  nowUnixSeconds: number
  horizonHours: 24 | 72 | 168
  zoneId?: string | null
  eventTypeId?: string | null
}

export interface MajorEventOccurrence {
  key: string
  eventTypeId: string
  eventTypeName: string
  zoneId: string
  zoneName: string
  tradeTypeIds: string[]
  triggerAtUnixSeconds: number
  delaySeconds: number
}

const MAX_OVERLAPPING_EVENT_TYPES = 2
const NEXT_EVENT_SEARCH_HOURS = 379

interface MajorEventWindowQuery {
  nowUnixSeconds: number
  horizonHours: number
  zoneId?: string | null
  eventTypeId?: string | null
}

const compareOccurrences = (
  zoneOrder: ReadonlyMap<string, number>,
  eventOrder: ReadonlyMap<string, number>,
  left: MajorEventOccurrence,
  right: MajorEventOccurrence,
): number => {
  const timeDifference = left.triggerAtUnixSeconds - right.triggerAtUnixSeconds
  if (timeDifference !== 0) return timeDifference
  const zoneDifference =
    (zoneOrder.get(left.zoneId) ?? Number.MAX_SAFE_INTEGER) -
    (zoneOrder.get(right.zoneId) ?? Number.MAX_SAFE_INTEGER)
  if (zoneDifference !== 0) return zoneDifference
  return (
    (eventOrder.get(left.eventTypeId) ?? Number.MAX_SAFE_INTEGER) -
    (eventOrder.get(right.eventTypeId) ?? Number.MAX_SAFE_INTEGER)
  )
}

const forecastWithinHours = (
  reference: RuntimeMajorEventReference,
  query: MajorEventWindowQuery,
): MajorEventOccurrence[] => {
  if (!Number.isFinite(query.nowUnixSeconds)) {
    throw new Error('大流行預測時間必須是有限的 Unix 秒數。')
  }

  const startAt = query.nowUnixSeconds
  const endAt = startAt + query.horizonHours * 3600
  const pHour = Math.floor((startAt - reference.anchorEpochSeconds) / 3600)
  const zoneOrder = new Map(reference.zones.map((zone, index) => [zone.id, index]))
  const eventOrder = new Map(reference.eventTypes.map((event, index) => [event.id, index]))
  const occurrences: MajorEventOccurrence[] = []

  for (const zone of reference.zones) {
    if (query.zoneId && query.zoneId !== zone.id) continue

    for (let iHour = 0; iHour <= query.horizonHours; iHour += 1) {
      const sourceHour = pHour + 401 * zone.phaseHours + iHour
      let matchedEventTypes = 0

      for (const eventType of reference.eventTypes) {
        if (sourceHour % eventType.periodHours !== 0) continue
        matchedEventTypes += 1
        if (matchedEventTypes > MAX_OVERLAPPING_EVENT_TYPES) break

        const triggerAtUnixSeconds =
          reference.anchorEpochSeconds + (pHour + iHour) * 3600 + zone.delaySeconds
        if (triggerAtUnixSeconds < startAt || triggerAtUnixSeconds >= endAt) continue
        if (query.eventTypeId && query.eventTypeId !== eventType.id) continue

        occurrences.push(toOccurrence(zone, eventType, triggerAtUnixSeconds))
      }
    }
  }

  occurrences.sort((left, right) => compareOccurrences(zoneOrder, eventOrder, left, right))
  return occurrences
}

export const forecastMajorEvents = (
  reference: RuntimeMajorEventReference,
  query: MajorEventForecastQuery,
): MajorEventOccurrence[] => {
  if (![24, 72, 168].includes(query.horizonHours)) {
    throw new Error(`不支援的大流行預測範圍：${query.horizonHours}`)
  }
  return forecastWithinHours(reference, query)
}

const toOccurrence = (
  zone: RuntimeMajorEventZone,
  eventType: RuntimeMajorEventType,
  triggerAtUnixSeconds: number,
): MajorEventOccurrence => ({
  key: `${zone.id}:${eventType.id}:${triggerAtUnixSeconds}`,
  eventTypeId: eventType.id,
  eventTypeName: eventType.name,
  zoneId: zone.id,
  zoneName: zone.name,
  tradeTypeIds: [...eventType.tradeTypeIds],
  triggerAtUnixSeconds,
  delaySeconds: zone.delaySeconds,
})

export const findNextMajorEvent = (
  reference: RuntimeMajorEventReference,
  query: Omit<MajorEventForecastQuery, 'horizonHours'>,
): MajorEventOccurrence | null => {
  const [next] = forecastWithinHours(reference, {
    ...query,
    horizonHours: NEXT_EVENT_SEARCH_HOURS,
  })
  return next ?? null
}
