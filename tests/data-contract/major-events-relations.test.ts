import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateMajorEvents } from '../../tools/data-audit/validate-major-events'
import type { CanonicalMajorEventsDataset, CanonicalTradeDataset } from '../../tools/import/types'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

const majorEvents = readJson<CanonicalMajorEventsDataset>('data/master/major-events.json')
const tradeDataset = readJson<CanonicalTradeDataset>('data/master/trade-goods.json')

const expectedEventTypes = [
  {
    id: 'pop1',
    name: '奢侈',
    periodHours: 379,
    tradeTypeIds: ['tradetype17', 'tradetype13', 'tradetype15'],
  },
  {
    id: 'pop2',
    name: '繁榮',
    periodHours: 337,
    tradeTypeIds: ['tradetype18', 'tradetype16', 'tradetype14'],
  },
  {
    id: 'pop3',
    name: '開發',
    periodHours: 311,
    tradeTypeIds: ['tradetype09', 'tradetype08', 'tradetype03', 'tradetype06'],
  },
  {
    id: 'pop4',
    name: '贊助',
    periodHours: 269,
    tradeTypeIds: ['tradetype10', 'tradetype13', 'tradetype14'],
  },
  {
    id: 'pop5',
    name: '戰爭',
    periodHours: 241,
    tradeTypeIds: ['tradetype03', 'tradetype20', 'tradetype19'],
  },
  {
    id: 'pop6',
    name: '洪水',
    periodHours: 223,
    tradeTypeIds: ['tradetype09', 'tradetype01', 'tradetype12'],
  },
  {
    id: 'pop7',
    name: '傳染病',
    periodHours: 199,
    tradeTypeIds: ['tradetype11', 'tradetype04', 'tradetype05'],
  },
  {
    id: 'pop8',
    name: '節慶',
    periodHours: 179,
    tradeTypeIds: ['tradetype07', 'tradetype01', 'tradetype02'],
  },
] as const

const expectedZones = [
  ['zone_37', '北海', 0, 0],
  ['zone_41', '東地中海', -1, 60],
  ['zone_57', '南歐&西地中海', -2, 0],
  ['zone_21', '西非', -3, 60],
  ['zone_22', '南非', -4, 60],
  ['zone_23', '東非', -5, 180],
  ['zone_58', '阿拉伯&西印度', -6, 180],
  ['zone_59', '東印度&印度支那', -7, 240],
  ['zone_50', '南亞', -8, 240],
  ['zone_53', '東亞', -9, 240],
  ['zone_54', '東北亞', -10, 300],
  ['zone_33', '大洋洲', -11, 360],
  ['zone_63', '大洋洲東部', -12, 360],
  ['zone_34', '北極海', -13, 390],
  ['zone_18', '西南美', -14, 600],
  ['zone_60', '美東', -15, 600],
  ['zone_20', '西北美', -16, 480],
  ['zone_55', '太平洋', -17, 420],
] as const

describe('major-events cross-file relationships', () => {
  it('preserves source metadata and event order, names, periods, and category priority', () => {
    expect(majorEvents).toMatchObject({
      sourceSnapshot: 'voyage-tw-2026052501-trade-20260904',
      sourceVersion: '2026052501',
      sourceManifestSha256: 'ccb1a0d53adf9d07322ee68c19cb2f1a772b76aeac660e30bd4c0ca72b3f5064',
      anchorEpochSeconds: 1670889600,
    })
    expect(
      majorEvents.eventTypes.map(({ id, name, periodHours, tradeTypeIds }) => ({
        id,
        name,
        periodHours,
        tradeTypeIds,
      })),
    ).toEqual(expectedEventTypes)
  })

  it('maps every affected category to the existing trade type master', () => {
    const mappedIds = majorEvents.eventTypes.flatMap((event) => event.tradeTypeIds)
    const categoryIds = [...new Set(mappedIds)].sort()
    const expectedIds = Array.from(
      { length: 20 },
      (_, index) => `tradetype${String(index + 1).padStart(2, '0')}`,
    )

    expect(categoryIds).toEqual(expectedIds)
    expect(
      categoryIds.map((id) =>
        tradeDataset.tradeTypes.some((tradeType) => tradeType.id === id.slice(9)),
      ),
    ).not.toContain(false)
  })

  it('preserves every zone source row and resolves its local badge asset', () => {
    expect(
      majorEvents.zones.map(({ id, name, phaseHours, delaySeconds }) => [
        id,
        name,
        phaseHours,
        delaySeconds,
      ]),
    ).toEqual(expectedZones)

    for (const zone of majorEvents.zones) {
      expect(zone.regionIconId).toBe(zone.id)
      expect(zone.sourceRefs.voyageTw).toContain(`json.js:pop_zone.${zone.id}`)
      expect(zone.sourceRefs.voyageTw).toContain(`lang_1.js:${zone.id}`)
      const assetName = zone.regionIconId.replace(/^zone_/, 'region-zone-') + '.png'
      expect(existsSync(`miniprogram/subpkg-trade/assets/major-events/${assetName}`)).toBe(true)
    }
  })

  it('rejects changed priority, unknown categories, incorrect source rows, and missing assets', () => {
    expect(validateMajorEvents(majorEvents, tradeDataset)).toEqual([])

    const reordered = structuredClone(majorEvents)
    reordered.eventTypes.reverse()
    expect(validateMajorEvents(reordered, tradeDataset)).toContainEqual(
      expect.objectContaining({ code: 'MAJOR_EVENT_SOURCE_ORDER', path: '/eventTypes/0/id' }),
    )

    const unknownCategory = structuredClone(majorEvents)
    unknownCategory.eventTypes[0]!.tradeTypeIds[0] = 'tradetype99'
    expect(validateMajorEvents(unknownCategory, tradeDataset)).toContainEqual(
      expect.objectContaining({
        code: 'UNKNOWN_MAJOR_EVENT_TRADE_TYPE',
        path: '/eventTypes/0/tradeTypeIds/0',
      }),
    )

    const wrongZone = structuredClone(majorEvents)
    wrongZone.zones[0]!.delaySeconds = 1
    expect(validateMajorEvents(wrongZone, tradeDataset)).toContainEqual(
      expect.objectContaining({
        code: 'MAJOR_EVENT_SOURCE_ROW_MISMATCH',
        path: '/zones/0/delaySeconds',
      }),
    )

    const missingAsset = structuredClone(majorEvents)
    missingAsset.zones[0]!.regionIconId = 'zone_999'
    expect(validateMajorEvents(missingAsset, tradeDataset)).toContainEqual(
      expect.objectContaining({
        code: 'UNKNOWN_MAJOR_EVENT_REGION_ICON',
        path: '/zones/0/regionIconId',
      }),
    )
  })

  it('reports absent top-level collections without throwing', () => {
    const missingCollections = structuredClone(majorEvents) as Partial<CanonicalMajorEventsDataset>
    delete missingCollections.eventTypes
    delete missingCollections.zones

    expect(
      validateMajorEvents(missingCollections as CanonicalMajorEventsDataset, tradeDataset),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MAJOR_EVENT_TYPE_COUNT',
          path: '/eventTypes',
          observedValue: 0,
        }),
        expect.objectContaining({
          code: 'MAJOR_EVENT_ZONE_COUNT',
          path: '/zones',
          observedValue: 0,
        }),
      ]),
    )
  })
})
