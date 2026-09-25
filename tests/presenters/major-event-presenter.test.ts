import { describe, expect, it, vi } from 'vitest'
import {
  presentMajorEvent,
  presentMajorEventJourney,
  presentMajorEventMatrix,
} from '../../miniprogram/subpkg-trade/presenters/major-event-presenter'
import type { MajorEventOccurrence } from '../../miniprogram/subpkg-trade/domain/major-event-forecast'
import { getMajorEventReference } from '../../miniprogram/subpkg-trade/runtime/major-event-data-store'
import { getTradeReference } from '../../miniprogram/subpkg-trade/runtime/trade-data-store'
import { getTradeCategoryIconPath } from '../../miniprogram/subpkg-trade/trade-category-icons'

const eventReference = getMajorEventReference()
const tradeReference = getTradeReference()

const occurrence = (overrides: Partial<MajorEventOccurrence> = {}): MajorEventOccurrence => ({
  key: 'zone_37:pop1:1790255190',
  eventTypeId: 'pop1',
  eventTypeName: '奢侈',
  zoneId: 'zone_37',
  zoneName: '北海',
  tradeTypeIds: ['17'],
  triggerAtUnixSeconds: Date.parse('2026-09-24T05:06:30Z') / 1000,
  delaySeconds: 390,
  ...overrides,
})

describe('大流行 Presenter', () => {
  it('resolves normalized category IDs through the shared name and icon sources', () => {
    const view = presentMajorEvent(occurrence(), tradeReference)

    expect(view.categories).toEqual([
      {
        id: '17',
        name: '香料',
        iconPath: '/subpkg-trade/assets/category-icons/17.png',
      },
    ])
    expect(getTradeCategoryIconPath('17')).toBe(view.categories[0]?.iconPath)
  })

  it('resolves every category used by the eight source event mappings', () => {
    const categoryIds = [
      ...new Set(eventReference.eventTypes.flatMap((event) => event.tradeTypeIds)),
    ].sort()
    const view = presentMajorEvent(occurrence({ tradeTypeIds: categoryIds }), tradeReference)

    expect(categoryIds).toHaveLength(20)
    expect(view.categories.map((category) => category.id)).toEqual(categoryIds)
    expect(
      view.categories.every(
        (category) => category.iconPath === getTradeCategoryIconPath(category.id),
      ),
    ).toBe(true)
    expect(view.categories.every((category) => category.name.length > 0)).toBe(true)
  })

  it.each([
    ['pop1', '--uwo-color-event-forest'],
    ['pop2', '--uwo-color-event-sea'],
    ['pop3', '--uwo-color-event-forest'],
    ['pop4', '--uwo-color-event-brass'],
    ['pop5', '--uwo-color-event-rust'],
    ['pop6', '--uwo-color-event-rust'],
    ['pop7', '--uwo-color-event-rust'],
    ['pop8', '--uwo-color-event-brass'],
  ])('maps %s to its approved event color token', (eventTypeId, eventColorToken) => {
    expect(presentMajorEvent(occurrence({ eventTypeId }), tradeReference).eventColorToken).toBe(
      eventColorToken,
    )
  })

  it('rounds source delay to the displayed minute and marks exact-hour events', () => {
    const delayed = presentMajorEvent(
      occurrence({
        triggerAtUnixSeconds: Date.parse('2026-09-24T05:06:30Z') / 1000,
        delaySeconds: 390,
      }),
      tradeReference,
    )
    const exactHour = presentMajorEvent(
      occurrence({
        triggerAtUnixSeconds: Date.parse('2026-09-24T05:00:00Z') / 1000,
        delaySeconds: 0,
      }),
      tradeReference,
    )

    expect(delayed.timeLabel).toBe('13:07')
    expect(delayed.minuteLabel).toBe('07 分')
    expect(exactHour.timeLabel).toBe('13:00')
    expect(exactHour.minuteLabel).toBe('整點')
  })

  it('derives the UTC+8 date and hour from the absolute trigger time across midnight', () => {
    const view = presentMajorEvent(
      occurrence({
        triggerAtUnixSeconds: Date.parse('2026-09-24T16:06:30Z') / 1000,
        delaySeconds: 390,
      }),
      tradeReference,
    )

    expect(view.dateKey).toBe('2026-09-25')
    expect(view.dateLabel).toBe('2026/09/25')
    expect(view.timeLabel).toBe('00:07')
  })

  it('formats event time in UTC+8 regardless of the device time zone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    try {
      const view = presentMajorEvent(
        occurrence({
          triggerAtUnixSeconds: Date.parse('2026-09-25T03:04:00Z') / 1000,
          delaySeconds: 240,
        }),
        tradeReference,
      )

      expect(view).toMatchObject({
        dateKey: '2026-09-25',
        dateLabel: '2026/09/25',
        timeLabel: '11:04',
      })
      expect(view).not.toHaveProperty('utcOffsetLabel')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('throws a useful error when a category name or shared icon is missing', () => {
    const withoutCategoryName = {
      ...tradeReference,
      tradeTypes: tradeReference.tradeTypes.filter((category) => category.id !== '17'),
    }
    const categoryWithoutIcon = {
      ...tradeReference,
      tradeTypes: [
        ...tradeReference.tradeTypes,
        { id: '99', name: '測試分類', peakSeasonIds: [], lowSeasonIds: [] },
      ],
    }
    expect(() => presentMajorEvent(occurrence(), withoutCategoryName)).toThrow(/pop1.*17/)
    expect(() =>
      presentMajorEvent(occurrence({ tradeTypeIds: ['99'] }), categoryWithoutIcon),
    ).toThrow(/pop1.*99/)
  })

  it('groups seven aligned hour slots by zone and marks the current hour', () => {
    const segmentStart = Date.parse('2026-09-24T05:00:00Z') / 1000
    const matrix = presentMajorEventMatrix(
      [
        occurrence({
          key: `zone_37:pop1:${segmentStart + 5 * 3600 + 15}`,
          triggerAtUnixSeconds: segmentStart + 5 * 3600 + 15,
        }),
        occurrence({
          key: `zone_37:pop1:${segmentStart + 60}`,
          triggerAtUnixSeconds: segmentStart + 60,
        }),
        occurrence({
          key: `zone_37:pop1:${segmentStart + 30}`,
          triggerAtUnixSeconds: segmentStart + 30,
        }),
      ],
      [],
      eventReference,
      tradeReference,
      segmentStart,
      7,
      segmentStart,
    )

    expect(matrix.segmentStartLabel).toBe('2026/09/24 13:00')
    expect(matrix.segmentEndLabel).toBe('2026/09/24 20:00')
    expect(matrix.rows).toHaveLength(18)
    expect(matrix.rows[0]).toMatchObject({
      zoneId: 'zone_37',
      zoneName: '北海',
      iconPath: '/subpkg-trade/assets/major-events/region-zone-37.png',
    })
    expect(matrix.rows[0]?.slots).toHaveLength(7)
    expect(matrix.rows[0]?.slots.map((slot) => slot.timeLabel)).toEqual([
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
      '19:00',
    ])
    expect(matrix.rows[0]?.slots.map((slot) => slot.isCurrentHour)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
    expect(matrix.rows[0]?.slots[0]?.events.map((event) => event.triggerAtUnixSeconds)).toEqual([
      segmentStart + 30,
      segmentStart + 60,
    ])
    expect(matrix.rows[0]?.slots[1]?.events).toEqual([])
    expect(matrix.rows[0]?.slots[5]?.events).toHaveLength(1)
    expect(matrix.rows[0]?.slots[0]?.events[0]?.categories[0]?.iconPath).toBe(
      '/subpkg-trade/assets/category-icons/17.png',
    )
  })

  it('rejects a matrix segment outside the one-to-seven slot range', () => {
    const segmentStart = Date.parse('2026-09-24T05:00:00Z') / 1000
    expect(() =>
      presentMajorEventMatrix(
        [],
        [],
        eventReference,
        tradeReference,
        segmentStart,
        0,
        segmentStart,
      ),
    ).toThrow(/槽數/)
    expect(() =>
      presentMajorEventMatrix(
        [],
        [],
        eventReference,
        tradeReference,
        segmentStart,
        8,
        segmentStart,
      ),
    ).toThrow(/槽數/)
  })

  it('places a possible ongoing event in the current slot without changing future events', () => {
    const nowUnixSeconds = Date.parse('2026-09-25T10:47:00+08:00') / 1000
    const currentHourStart = Date.parse('2026-09-25T10:00:00+08:00') / 1000
    const candidate = occurrence({
      key: 'zone_34:pop5:1790298390',
      eventTypeId: 'pop5',
      eventTypeName: '戰爭',
      zoneId: 'zone_34',
      zoneName: '北極海',
      triggerAtUnixSeconds: Date.parse('2026-09-25T09:06:30+08:00') / 1000,
      delaySeconds: 390,
    })
    const future = occurrence({
      key: 'zone_53:pop1:1790305440',
      eventTypeId: 'pop1',
      eventTypeName: '奢侈',
      zoneId: 'zone_53',
      zoneName: '東亞',
      triggerAtUnixSeconds: Date.parse('2026-09-25T11:04:00+08:00') / 1000,
      delaySeconds: 240,
    })
    const matrix = presentMajorEventMatrix(
      [future],
      [candidate],
      eventReference,
      tradeReference,
      currentHourStart,
      7,
      currentHourStart,
    )

    expect(matrix.headerSlots).toHaveLength(7)
    expect(matrix.headerSlots[0]).toMatchObject({ timeLabel: '10:00', isCurrentHour: true })
    expect(matrix.rows.find((row) => row.zoneId === 'zone_34')?.slots[0]?.events).toMatchObject([
      expect.objectContaining({ eventTypeId: 'pop5', isOngoingCandidate: true }),
    ])
    expect(matrix.rows.find((row) => row.zoneId === 'zone_53')?.slots[1]?.events).toMatchObject([
      expect.objectContaining({ eventTypeId: 'pop1', isOngoingCandidate: false }),
    ])
    expect(matrix.rows.find((row) => row.zoneId === 'zone_34')?.slots[1]?.events).toEqual([])
    expect(nowUnixSeconds).toBeGreaterThan(candidate.triggerAtUnixSeconds)
  })

  it('keeps at most two combined current-slot event types in source priority order', () => {
    const segmentStart = Date.parse('2026-09-25T10:00:00+08:00') / 1000
    const event = (eventTypeId: string, triggerAtUnixSeconds: number): MajorEventOccurrence => {
      const sourceType = eventReference.eventTypes.find((item) => item.id === eventTypeId)
      if (sourceType === undefined) throw new Error(`missing event type ${eventTypeId}`)
      return occurrence({
        key: `zone_37:${eventTypeId}:${triggerAtUnixSeconds}`,
        eventTypeId,
        eventTypeName: sourceType.name,
        triggerAtUnixSeconds,
        tradeTypeIds: sourceType.tradeTypeIds,
      })
    }
    const matrix = presentMajorEventMatrix(
      [event('pop5', segmentStart + 1800), event('pop4', segmentStart + 2400)],
      [event('pop1', segmentStart - 1800), event('pop2', segmentStart - 1200)],
      eventReference,
      tradeReference,
      segmentStart,
      7,
      segmentStart,
    )

    expect(matrix.rows[0]?.slots[0]?.events.map((item) => item.eventTypeId)).toEqual([
      'pop1',
      'pop2',
    ])
  })

  it('groups journey rows by local date and shares same-minute time headings', () => {
    const sameDateFirst = occurrence({
      triggerAtUnixSeconds: Date.parse('2026-09-24T05:06:30Z') / 1000,
    })
    const sameDateSecond = occurrence({
      key: 'zone_41:pop2:1790255190',
      eventTypeId: 'pop2',
      eventTypeName: '繁榮',
      zoneId: 'zone_41',
      zoneName: '東地中海',
      triggerAtUnixSeconds: Date.parse('2026-09-24T05:06:30Z') / 1000,
    })
    const nextDate = occurrence({
      key: 'zone_37:pop1:1790299590',
      triggerAtUnixSeconds: Date.parse('2026-09-24T16:06:30Z') / 1000,
    })
    const journey = presentMajorEventJourney(
      [nextDate, sameDateSecond, sameDateFirst],
      tradeReference,
    )

    expect(journey.map((day) => day.dateKey)).toEqual(['2026-09-24', '2026-09-25'])
    expect(journey[0]?.timeGroups).toHaveLength(1)
    expect(journey[0]?.timeGroups[0]).toMatchObject({
      timeLabel: '13:07',
      events: [
        expect.objectContaining({ eventTypeId: 'pop2' }),
        expect.objectContaining({ eventTypeId: 'pop1' }),
      ],
    })
    expect(journey[1]?.timeGroups[0]?.events[0]?.timeLabel).toBe('00:07')
  })
})
