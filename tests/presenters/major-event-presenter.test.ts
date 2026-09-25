import { describe, expect, it, vi } from 'vitest'
import {
  isRepeatedLocalWallTime,
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

const unixSeconds = (date: Date): number => Math.floor(date.getTime() / 1000)

const occurrence = (overrides: Partial<MajorEventOccurrence> = {}): MajorEventOccurrence => ({
  key: 'zone_37:pop1:1790255190',
  eventTypeId: 'pop1',
  eventTypeName: '奢侈',
  zoneId: 'zone_37',
  zoneName: '北海',
  tradeTypeIds: ['17'],
  triggerAtUnixSeconds: unixSeconds(new Date(2026, 8, 24, 13, 6, 30)),
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
        triggerAtUnixSeconds: unixSeconds(new Date(2026, 8, 24, 13, 6, 30)),
        delaySeconds: 390,
      }),
      tradeReference,
    )
    const exactHour = presentMajorEvent(
      occurrence({
        triggerAtUnixSeconds: unixSeconds(new Date(2026, 8, 24, 13, 0, 0)),
        delaySeconds: 0,
      }),
      tradeReference,
    )

    expect(delayed.timeLabel).toBe('13:07')
    expect(delayed.minuteLabel).toBe('07 分')
    expect(exactHour.timeLabel).toBe('13:00')
    expect(exactHour.minuteLabel).toBe('整點')
  })

  it('derives local date and hour from the absolute trigger time across midnight', () => {
    const view = presentMajorEvent(
      occurrence({
        triggerAtUnixSeconds: unixSeconds(new Date(2026, 8, 25, 0, 6, 30)),
        delaySeconds: 390,
      }),
      tradeReference,
    )

    expect(view.dateKey).toBe('2026-09-25')
    expect(view.dateLabel).toBe('2026/09/25')
    expect(view.timeLabel).toBe('00:07')
    expect(view.utcOffsetLabel).toMatch(/^UTC[+-]\d{2}:\d{2}$/)
  })

  it('detects a repeated local DST time from the event timestamp alone', () => {
    vi.stubEnv('TZ', 'America/New_York')
    try {
      const firstOneThirty = Date.UTC(2026, 10, 1, 5, 30) / 1000
      const secondOneThirty = Date.UTC(2026, 10, 1, 6, 30) / 1000
      const uniqueTwoThirty = Date.UTC(2026, 10, 1, 7, 30) / 1000

      expect(isRepeatedLocalWallTime(firstOneThirty)).toBe(true)
      expect(isRepeatedLocalWallTime(secondOneThirty)).toBe(true)
      expect(isRepeatedLocalWallTime(uniqueTwoThirty)).toBe(false)
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

  it('groups six forecast-hour slots by zone and preserves empty slots', () => {
    const segmentStart = unixSeconds(new Date(2026, 8, 24, 13, 0, 0))
    const matrix = presentMajorEventMatrix(
      [
        occurrence({ triggerAtUnixSeconds: segmentStart + 5 * 3600 + 15 }),
        occurrence({ triggerAtUnixSeconds: segmentStart + 60 }),
        occurrence({ triggerAtUnixSeconds: segmentStart + 30 }),
      ],
      eventReference,
      tradeReference,
      segmentStart,
    )

    expect(matrix.segmentStartLabel).toBe('2026/09/24 13:00')
    expect(matrix.segmentEndLabel).toBe('2026/09/24 19:00')
    expect(matrix.rows).toHaveLength(18)
    expect(matrix.rows[0]).toMatchObject({
      zoneId: 'zone_37',
      zoneName: '北海',
      iconPath: '/subpkg-trade/assets/major-events/region-zone-37.png',
    })
    expect(matrix.rows[0]?.slots).toHaveLength(6)
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

  it('groups journey rows by local date and shares same-minute time headings', () => {
    const sameDateFirst = occurrence({
      triggerAtUnixSeconds: unixSeconds(new Date(2026, 8, 24, 13, 6, 30)),
    })
    const sameDateSecond = occurrence({
      key: 'zone_41:pop2:1790255190',
      eventTypeId: 'pop2',
      eventTypeName: '繁榮',
      zoneId: 'zone_41',
      zoneName: '東地中海',
      triggerAtUnixSeconds: unixSeconds(new Date(2026, 8, 24, 13, 6, 30)),
    })
    const nextDate = occurrence({
      key: 'zone_37:pop1:1790299590',
      triggerAtUnixSeconds: unixSeconds(new Date(2026, 8, 25, 0, 6, 30)),
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
