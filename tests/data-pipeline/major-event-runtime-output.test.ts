import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildMajorEventReference,
  normalizeSourceTradeTypeId,
} from '../../tools/data-pipeline/build-major-event-runtime-data'
import type { RuntimeMajorEventReference } from '../../miniprogram/contracts/runtime-data'
import type { CanonicalMajorEventsDataset } from '../../tools/import/types'

const dataset = JSON.parse(
  readFileSync('data/master/major-events.json', 'utf8'),
) as CanonicalMajorEventsDataset
const assetRoot = 'miniprogram/subpkg-trade/assets/major-events'

describe('大流行 runtime 參考資料投影', () => {
  it('normalizes only supported voyage.tw trade type IDs', () => {
    expect(normalizeSourceTradeTypeId('tradetype17')).toBe('17')
    expect(normalizeSourceTradeTypeId('tradetype09')).toBe('09')
    for (const value of ['tradetype1', 'tradetype21', '17']) {
      expect(() => normalizeSourceTradeTypeId(value)).toThrow(value)
    }
  })

  it('preserves source order, maps local emblem paths, and drops source references', () => {
    const reference: RuntimeMajorEventReference = buildMajorEventReference(dataset, assetRoot)

    expect(reference.eventTypes.map((event) => event.id)).toEqual(
      dataset.eventTypes.map((event) => event.id),
    )
    expect(reference.eventTypes[0]?.tradeTypeIds).toEqual(['17', '13', '15'])
    expect(reference.zones.map((zone) => zone.id)).toEqual(dataset.zones.map((zone) => zone.id))
    expect(reference.zones[0]?.iconPath).toBe(
      '/subpkg-trade/assets/major-events/region-zone-37.png',
    )
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

  it('serializes the generated module to stable bytes', () => {
    const first = buildMajorEventReference(dataset, assetRoot)
    const second = buildMajorEventReference(dataset, assetRoot)
    const serialize = (reference: RuntimeMajorEventReference): Buffer =>
      Buffer.from(`module.exports = ${JSON.stringify(reference)}\n`)

    expect(serialize(first)).toEqual(serialize(second))
    expect(readFileSync('miniprogram/subpkg-trade/major-event-reference.js')).toEqual(
      serialize(first),
    )
  })

  it('fails when a canonical zone has no corresponding local emblem file', () => {
    const missingAssetRoot = mkdtempSync(join(tmpdir(), 'uwo-major-event-reference-'))
    try {
      expect(() => buildMajorEventReference(dataset, missingAssetRoot)).toThrow(
        'region-zone-37.png',
      )
    } finally {
      rmSync(missingAssetRoot, { recursive: true, force: true })
    }
  })

  it('rejects a zone icon ID that cannot resolve to a local emblem filename', () => {
    const invalidDataset = structuredClone(dataset)
    invalidDataset.zones[0]!.regionIconId = '../../outside'

    expect(() => buildMajorEventReference(invalidDataset, assetRoot)).toThrow('../../outside')
  })
})
