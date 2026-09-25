import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getMajorEventReference } from '../../miniprogram/subpkg-trade/runtime/major-event-data-store'
import type { CanonicalMajorEventsDataset } from '../../tools/import/types'

const dataset = JSON.parse(
  readFileSync('data/master/major-events.json', 'utf8'),
) as CanonicalMajorEventsDataset

describe('大流行 runtime contract', () => {
  it('exposes offline reference data with ordered IDs and shared local emblem paths', () => {
    const reference = getMajorEventReference()

    expect(getMajorEventReference()).toBe(reference)
    expect(reference.eventTypes).toHaveLength(8)
    expect(reference.zones).toHaveLength(18)
    expect(reference.eventTypes.map((event) => event.id)).toEqual(
      dataset.eventTypes.map((event) => event.id),
    )
    expect(reference.zones.map((zone) => zone.id)).toEqual(dataset.zones.map((zone) => zone.id))
    expect(
      reference.zones.every((zone) =>
        zone.iconPath.startsWith('/subpkg-trade/assets/major-events/'),
      ),
    ).toBe(true)
  })

  it('retains version metadata while excluding maintenance-only source references', () => {
    const reference = getMajorEventReference()

    expect(reference).toMatchObject({
      sourceSnapshot: dataset.sourceSnapshot,
      sourceVersion: dataset.sourceVersion,
      sourceManifestSha256: dataset.sourceManifestSha256,
      sourceVerifiedOn: dataset.sourceVerifiedOn,
      anchorEpochSeconds: dataset.anchorEpochSeconds,
    })
    expect(JSON.stringify(reference)).not.toContain('sourceRefs')
    expect(JSON.stringify(reference)).not.toContain('voyage.tw')
  })
})
