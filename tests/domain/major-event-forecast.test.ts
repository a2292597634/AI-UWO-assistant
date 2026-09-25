import { describe, expect, it } from 'vitest'
import {
  findNextMajorEvent,
  forecastMajorEvents,
  forecastOngoingMajorEvents,
} from '../../miniprogram/subpkg-trade/domain/major-event-forecast'
import { getMajorEventReference } from '../../miniprogram/subpkg-trade/runtime/major-event-data-store'
import type {
  RuntimeMajorEventReference,
  RuntimeMajorEventType,
  RuntimeMajorEventZone,
} from '../../miniprogram/contracts/runtime-data'

const ANCHOR = 1670889600
const sourceReference = getMajorEventReference()

const withFixture = (
  options: {
    eventTypes?: RuntimeMajorEventType[]
    zones?: RuntimeMajorEventZone[]
  } = {},
): RuntimeMajorEventReference => ({
  ...sourceReference,
  anchorEpochSeconds: ANCHOR,
  eventTypes: options.eventTypes ?? sourceReference.eventTypes,
  zones: options.zones ?? [
    {
      id: 'zone_test',
      name: '測試海域',
      phaseHours: 0,
      delaySeconds: 0,
      iconPath: '/subpkg-trade/assets/major-events/region-zone-test.png',
    },
  ],
})

const onlyEvent = (eventTypeId: string): RuntimeMajorEventType[] =>
  sourceReference.eventTypes.filter((event) => event.id === eventTypeId)

const onlyZone = (delaySeconds = 0, phaseHours = 0): RuntimeMajorEventZone[] => [
  {
    id: 'zone_test',
    name: '測試海域',
    phaseHours,
    delaySeconds,
    iconPath: '/subpkg-trade/assets/major-events/region-zone-test.png',
  },
]

describe('大流行預測 Domain', () => {
  it('returns the Arctic War as a possible ongoing candidate for the supplied UTC+8 sample', () => {
    const nowUnixSeconds = Date.parse('2026-09-25T10:47:00+08:00') / 1000
    const candidates = forecastOngoingMajorEvents(sourceReference, { nowUnixSeconds })
    const arcticWar = candidates.find(
      (event) => event.zoneId === 'zone_34' && event.eventTypeId === 'pop5',
    )

    expect(arcticWar?.triggerAtUnixSeconds).toBe(Date.parse('2026-09-25T09:06:30+08:00') / 1000)
    expect(candidates.every((event) => event.triggerAtUnixSeconds < nowUnixSeconds)).toBe(true)
    expect(candidates.every((event) => event.triggerAtUnixSeconds > nowUnixSeconds - 7200)).toBe(
      true,
    )
    expect(
      forecastOngoingMajorEvents(sourceReference, {
        nowUnixSeconds,
        zoneId: 'zone_34',
        eventTypeId: 'pop5',
      }),
    ).toEqual([arcticWar])
  })

  it('excludes candidates at the two-hour cutoff while retaining the event one second before it', () => {
    const event = onlyEvent('pop1')[0]
    if (event === undefined) throw new Error('expected pop1 in runtime reference')
    const reference = withFixture({
      eventTypes: [{ ...event, periodHours: 379 }],
      zones: onlyZone(),
    })

    const oneSecondBeforeCutoff = forecastOngoingMajorEvents(reference, {
      nowUnixSeconds: ANCHOR + 7199,
    })
    const exactlyAtCutoff = forecastOngoingMajorEvents(reference, {
      nowUnixSeconds: ANCHOR + 7200,
    })

    expect(oneSecondBeforeCutoff.map((item) => item.triggerAtUnixSeconds)).toEqual([ANCHOR])
    expect(exactlyAtCutoff.map((item) => item.triggerAtUnixSeconds)).not.toContain(ANCHOR)
  })

  it('matches the supplied game schedule sample and excludes an already-triggered event', () => {
    const reference = sourceReference
    const nowUnixSeconds = Date.parse('2026-09-25T10:47:00+08:00') / 1000
    const current = forecastMajorEvents(reference, {
      nowUnixSeconds,
      horizonHours: 24,
    })
    const expectedStarts = [
      ['zone_53', 'pop1', '2026-09-25T11:04:00+08:00'],
      ['zone_54', 'pop5', '2026-09-25T11:05:00+08:00'],
      ['zone_59', 'pop5', '2026-09-25T13:04:00+08:00'],
      ['zone_22', 'pop5', '2026-09-25T15:01:00+08:00'],
    ] as const

    for (const [zoneId, eventTypeId, triggerAt] of expectedStarts) {
      expect(current).toContainEqual(
        expect.objectContaining({
          zoneId,
          eventTypeId,
          triggerAtUnixSeconds: Date.parse(triggerAt) / 1000,
        }),
      )
    }

    const earlier = forecastMajorEvents(reference, {
      nowUnixSeconds: nowUnixSeconds - 3 * 3600,
      horizonHours: 24,
      zoneId: 'zone_34',
      eventTypeId: 'pop5',
    })
    const alreadyTriggered = earlier.find(
      (event) => event.triggerAtUnixSeconds === Date.parse('2026-09-25T09:06:30+08:00') / 1000,
    )
    expect(alreadyTriggered).toBeDefined()
    expect(current).not.toContainEqual(alreadyTriggered)
    expect(current.every((event) => event.triggerAtUnixSeconds >= nowUnixSeconds)).toBe(true)
  })

  it.each(sourceReference.eventTypes.map(({ id, periodHours }) => ({ id, periodHours })))(
    '按來源週期計算 $id 命中，前後相鄰小時不誤判',
    ({ id, periodHours }) => {
      const reference = withFixture({ eventTypes: onlyEvent(id) })
      const beforeNow = ANCHOR + (periodHours - 1) * 3600
      const onNow = ANCHOR + periodHours * 3600
      const afterNow = ANCHOR + (periodHours + 1) * 3600

      const before = forecastMajorEvents(reference, {
        nowUnixSeconds: beforeNow,
        horizonHours: 24,
      })
      const on = forecastMajorEvents(reference, { nowUnixSeconds: onNow, horizonHours: 24 })
      const after = forecastMajorEvents(reference, {
        nowUnixSeconds: afterNow,
        horizonHours: 24,
      })

      expect(before.map((event) => event.triggerAtUnixSeconds)).toEqual([onNow])
      expect(on.map((event) => event.triggerAtUnixSeconds)).toEqual([onNow])
      expect(after).toEqual([])
    },
  )

  it('keeps at most two overlapping types in their source priority order', () => {
    const events = forecastMajorEvents(withFixture(), {
      nowUnixSeconds: ANCHOR,
      horizonHours: 24,
    })

    expect(events.map((event) => event.eventTypeId)).toEqual(['pop1', 'pop2'])
  })

  it('includes a delayed current-hour event before its trigger and excludes it after', () => {
    const reference = withFixture({ eventTypes: onlyEvent('pop8'), zones: onlyZone(300) })
    const before = forecastMajorEvents(reference, {
      nowUnixSeconds: ANCHOR + 299,
      horizonHours: 24,
    })
    const after = forecastMajorEvents(reference, {
      nowUnixSeconds: ANCHOR + 301,
      horizonHours: 24,
    })

    expect(before[0]?.triggerAtUnixSeconds).toBe(ANCHOR + 300)
    expect(after).toEqual([])
  })

  it('uses a left-closed, right-open window for non-hour-aligned now values', () => {
    const atNow = withFixture({
      eventTypes: [{ ...onlyEvent('pop1')[0]!, periodHours: 24 }],
      zones: onlyZone(300),
    })
    const events = forecastMajorEvents(atNow, {
      nowUnixSeconds: ANCHOR + 300,
      horizonHours: 24,
    })

    expect(events.map((event) => event.triggerAtUnixSeconds)).toEqual([ANCHOR + 300])
  })

  it('checks the horizon-index candidate when its delay moves the trigger inside the window', () => {
    const inside = withFixture({
      eventTypes: [{ ...onlyEvent('pop1')[0]!, periodHours: 24 }],
      zones: onlyZone(299),
    })
    const events = forecastMajorEvents(inside, {
      nowUnixSeconds: ANCHOR + 300,
      horizonHours: 24,
    })

    expect(events).toHaveLength(1)
    expect(events[0]?.triggerAtUnixSeconds).toBe(ANCHOR + 24 * 3600 + 299)
  })

  it('applies zone and event filters together', () => {
    const reference = withFixture({
      eventTypes: sourceReference.eventTypes.slice(0, 2).map((event) => ({
        ...event,
        periodHours: 24,
      })),
      zones: [...onlyZone(), { ...onlyZone()[0]!, id: 'zone_second', name: '第二海域' }],
    })
    const events = forecastMajorEvents(reference, {
      nowUnixSeconds: ANCHOR,
      horizonHours: 24,
      zoneId: 'zone_second',
      eventTypeId: 'pop2',
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ zoneId: 'zone_second', eventTypeId: 'pop2' })
  })

  it('finds the next event up to the 379-hour limit and returns null when filtered out', () => {
    const longestPeriod = withFixture({
      eventTypes: [{ ...onlyEvent('pop1')[0]!, periodHours: 379 }],
    })
    const next = findNextMajorEvent(longestPeriod, { nowUnixSeconds: ANCHOR + 1 })

    expect(next?.triggerAtUnixSeconds).toBe(ANCHOR + 379 * 3600)
    expect(
      findNextMajorEvent(longestPeriod, {
        nowUnixSeconds: ANCHOR + 1,
        eventTypeId: 'missing-event',
      }),
    ).toBeNull()
  })

  it('returns stable keys and sorts equal-time rows by source zone and event order', () => {
    const reference = withFixture({
      eventTypes: sourceReference.eventTypes.slice(0, 2).map((event) => ({
        ...event,
        periodHours: 24,
      })),
      zones: [...onlyZone(), { ...onlyZone()[0]!, id: 'zone_second', name: '第二海域' }],
    })
    const events = forecastMajorEvents(reference, {
      nowUnixSeconds: ANCHOR,
      horizonHours: 24,
    })

    expect(events.map(({ zoneId, eventTypeId }) => `${zoneId}:${eventTypeId}`)).toEqual([
      'zone_test:pop1',
      'zone_test:pop2',
      'zone_second:pop1',
      'zone_second:pop2',
    ])
    expect(events[0]?.key).toBe(`zone_test:pop1:${ANCHOR}`)
    expect(new Set(events.map((event) => event.key)).size).toBe(events.length)
  })
})
