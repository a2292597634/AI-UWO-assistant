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
import type { RuntimeAssetUrlManifest } from '../../tools/data-pipeline/build-runtime-data'
import type { AssetDependencyIndex } from '../../tools/data-pipeline/asset-dependencies'
import type { CanonicalTradeDataset } from '../../tools/import/types'

const dataset = JSON.parse(
  readFileSync('data/master/trade-goods.json', 'utf8'),
) as CanonicalTradeDataset
const dependencies = JSON.parse(
  readFileSync('data/assets/asset-dependencies.json', 'utf8'),
) as AssetDependencyIndex
const wineDataset: CanonicalTradeDataset = {
  ...dataset,
  tradeGoods: dataset.tradeGoods.filter((trade) => trade.id === 'trade0615'),
}

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
      iconPath: '/subpkg-assets-0/imgs/trade_trade0615.png',
    })
    expect(reference.ports).toHaveLength(224)
    expect(reference.seasonProfiles).toHaveLength(10)
    expect(reference.seasonNames.s6).toBe('雨季')
    expect(details.trade0615).toMatchObject({
      id: 'trade0615',
      salesPortIds: ['town2201', 'town2203'],
      iconPath: '/subpkg-assets-0/imgs/trade_trade0615.png',
    })
    expect(index.find((item) => item.id === 'trade18T903')).toMatchObject({
      iconPath: '/subpkg-assets-0/imgs/trade_trade1817.png',
    })
    expect(tradeDetailShard('trade0615')).toBeGreaterThanOrEqual(0)
    expect(tradeDetailShard('trade0615')).toBeLessThan(10)
  })

  it('rejects a dependency index that omits the trade mapping', () => {
    const incompleteDependencies = structuredClone(dependencies)
    delete incompleteDependencies.tradeIcons.trade0615

    expect(() => buildTradeGoodsIndex(wineDataset, incompleteDependencies)).toThrow(
      '貿易品圖示依賴缺失或路徑為空：trade0615',
    )
    expect(() => buildTradeGoodDetails(wineDataset, incompleteDependencies)).toThrow(
      '貿易品圖示依賴缺失或路徑為空：trade0615',
    )
  })

  it('rejects a dependency index whose trade path is empty', () => {
    const incompleteDependencies = structuredClone(dependencies)
    incompleteDependencies.tradeIcons.trade0615 = {
      ...incompleteDependencies.tradeIcons.trade0615!,
      path: '',
    }

    expect(() => buildTradeGoodsIndex(wineDataset, incompleteDependencies)).toThrow(
      '貿易品圖示依賴缺失或路徑為空：trade0615',
    )
    expect(() => buildTradeGoodDetails(wineDataset, incompleteDependencies)).toThrow(
      '貿易品圖示依賴缺失或路徑為空：trade0615',
    )
  })

  it('resolves dependency paths through the published asset manifest', () => {
    const mappedDependencies = structuredClone(dependencies)
    mappedDependencies.tradeIcons.trade0615 = {
      path: '/subpkg-assets-0/imgs/trade_mapped-wine.png',
      root: 'subpkg-assets-0',
    }
    const manifest: RuntimeAssetUrlManifest = {
      releaseId: 'release-test',
      cdnOrigin: 'https://uwo-test.tcb.qcloud.la',
      assets: [
        {
          filename: 'trade_mapped-wine.png',
          publicUrl: 'https://uwo-test.tcb.qcloud.la/assets/release-test/trade_mapped-wine.png',
        },
      ],
    }

    expect(buildTradeGoodsIndex(wineDataset, mappedDependencies, manifest)[0]?.iconPath).toBe(
      'https://uwo-test.tcb.qcloud.la/assets/release-test/trade_mapped-wine.png',
    )
    expect(
      buildTradeGoodDetails(wineDataset, mappedDependencies, manifest).trade0615?.iconPath,
    ).toBe('https://uwo-test.tcb.qcloud.la/assets/release-test/trade_mapped-wine.png')
    expect(() =>
      buildTradeGoodsIndex(wineDataset, mappedDependencies, { ...manifest, assets: [] }),
    ).toThrow('published asset manifest is missing trade_mapped-wine.png')
    expect(() =>
      buildTradeGoodDetails(wineDataset, mappedDependencies, {
        ...manifest,
        assets: [
          {
            filename: 'trade_mapped-wine.png',
            publicUrl: 'https://example.com/trade_mapped-wine.png',
          },
        ],
      }),
    ).toThrow('asset publicUrl is outside the configured CloudBase CDN release')
  })

  it('writes fixed names, ten detail shards and deterministic bytes', () => {
    const first = makeOutputRoots()
    const second = makeOutputRoots()

    try {
      writeTradeRuntimeData(dataset, first.generated, first.subpackage, dependencies)
      writeTradeRuntimeData(dataset, second.generated, second.subpackage, dependencies)

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
      expect(readFileSync(join(first.subpackage, 'trade-goods.js'), 'utf8')).toContain(
        '"iconPath":"/subpkg-assets-0/imgs/trade_trade1817.png"',
      )
    } finally {
      rmSync(first.root, { recursive: true, force: true })
      rmSync(second.root, { recursive: true, force: true })
    }
  })
})
