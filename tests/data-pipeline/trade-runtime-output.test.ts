import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildTradeGoodDetails,
  buildTradeGoodsIndex,
  buildTradeReference,
  tradeDetailShard,
  writeTradeRuntimeData,
} from '../../tools/data-pipeline/build-trade-runtime-data'
import type { CanonicalTradeDataset } from '../../tools/import/types'

const dataset = JSON.parse(
  readFileSync('data/master/trade-goods.json', 'utf8'),
) as CanonicalTradeDataset

const makeOutputRoots = (): { root: string; generated: string; subpackage: string } => {
  const root = mkdtempSync(join(tmpdir(), 'uwo-trade-runtime-'))
  const generated = join(root, 'generated')
  const subpackage = join(root, 'subpkg-trade')
  return { root, generated, subpackage }
}

describe('貿易品 runtime 輸出', () => {
  it('builds searchable index, reference data and full details', () => {
    const index = buildTradeGoodsIndex(dataset)
    const reference = buildTradeReference(dataset)
    const details = buildTradeGoodDetails(dataset)
    const wine = index.find((item) => item.id === 'trade0615')

    expect(index).toHaveLength(656)
    expect(wine).toMatchObject({
      id: 'trade0615',
      name: '葡萄酒',
      categoryId: '06',
      salesMode: 'fixed-port',
      salesPortCount: 2,
    })
    expect(reference.ports).toHaveLength(224)
    expect(reference.seasonProfiles).toHaveLength(10)
    expect(reference.seasonNames.s6).toBe('雨季')
    expect(details.trade0615).toMatchObject({
      id: 'trade0615',
      salesPortIds: ['town2201', 'town2203'],
    })
    expect(tradeDetailShard('trade0615')).toBeGreaterThanOrEqual(0)
    expect(tradeDetailShard('trade0615')).toBeLessThan(10)
  })

  it('writes fixed names, ten detail shards and deterministic bytes', () => {
    const first = makeOutputRoots()
    const second = makeOutputRoots()

    try {
      writeTradeRuntimeData(dataset, first.generated, first.subpackage)
      writeTradeRuntimeData(dataset, second.generated, second.subpackage)

      expect(readdirSync(first.generated).sort()).toEqual([])
      expect(readdirSync(first.subpackage).sort()).toEqual([
        'trade-detail-index.js',
        'trade-detail-loaders.js',
        'trade-details-0.js',
        'trade-details-1.js',
        'trade-details-2.js',
        'trade-details-3.js',
        'trade-details-4.js',
        'trade-details-5.js',
        'trade-details-6.js',
        'trade-details-7.js',
        'trade-details-8.js',
        'trade-details-9.js',
        'trade-goods.js',
        'trade-reference.js',
      ])

      for (const filename of readdirSync(first.generated)) {
        expect(readFileSync(join(first.generated, filename))).toEqual(
          readFileSync(join(second.generated, filename)),
        )
      }
      for (const filename of readdirSync(first.subpackage)) {
        expect(readFileSync(join(first.subpackage, filename))).toEqual(
          readFileSync(join(second.subpackage, filename)),
        )
      }
    } finally {
      rmSync(first.root, { recursive: true, force: true })
      rmSync(second.root, { recursive: true, force: true })
    }
  })
})
