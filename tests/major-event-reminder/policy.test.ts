import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { forecastMajorEvents } from '../../miniprogram/subpkg-trade/domain/major-event-forecast'
import type { RuntimeMajorEventReference } from '../../miniprogram/contracts/runtime-data'

const require = createRequire(import.meta.url)
const file = '../../cloudfunctions/major-event-reminder/policy.js'
const policy = existsSync('cloudfunctions/major-event-reminder/policy.js') ? require(file) : {}
const reference = JSON.parse(readFileSync('data/master/major-events.json', 'utf8'))

describe('提醒時點及權威日程', () => {
  it('精確時點不再辦理，只允許嚴格未來的提前量', () => {
    expect(typeof policy.availableLeads).toBe('function')
    const eventStart = 1800000000
    expect(policy.availableLeads(eventStart - 3600, eventStart)).toEqual([600])
    expect(policy.availableLeads(eventStart - 10801, eventStart)).toEqual([10800, 3600, 600])
    expect(policy.availableLeads(eventStart, eventStart)).toEqual([])
  })
  it('與前端跨海域、延遲、跨日的所有預測一致，拒絕偽造秒數或類型', () => {
    expect(typeof policy.validOccurrence).toBe('function')
    const events = forecastMajorEvents(reference as RuntimeMajorEventReference, {
      nowUnixSeconds: 1793200000,
      horizonHours: 168,
    })
    expect(events.length).toBeGreaterThan(50)
    for (const event of events) {
      expect(policy.validOccurrence(reference, event)).toBe(true)
      expect(
        policy.validOccurrence(reference, {
          ...event,
          triggerAtUnixSeconds: event.triggerAtUnixSeconds + 1,
        }),
      ).toBe(false)
      expect(policy.validOccurrence(reference, { ...event, eventTypeId: 'fake' })).toBe(false)
    }
  })
  it('同時最多前兩類，先截斷再篩選', () => {
    expect(typeof policy.validOccurrence).toBe('function')
    const start = reference.anchorEpochSeconds
    expect(
      policy.validOccurrence(reference, {
        zoneId: 'zone_37',
        eventTypeId: 'pop1',
        triggerAtUnixSeconds: start,
      }),
    ).toBe(true)
    expect(
      policy.validOccurrence(reference, {
        zoneId: 'zone_37',
        eventTypeId: 'pop2',
        triggerAtUnixSeconds: start,
      }),
    ).toBe(true)
    expect(
      policy.validOccurrence(reference, {
        zoneId: 'zone_37',
        eventTypeId: 'pop3',
        triggerAtUnixSeconds: start,
      }),
    ).toBe(false)
  })
})
