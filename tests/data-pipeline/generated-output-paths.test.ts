import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import {
  DATA_GENERATION_OUTPUT_PATHS,
  getMaintenanceRollbackPaths,
} from '../../tools/data-pipeline/generated-output-paths'

describe('統一生成輸出集合', () => {
  it('精確涵蓋所有分片與 fleet，不包含人工頁面目錄', () => {
    const expected = [
      'miniprogram/generated',
      'miniprogram/subpkg-fleet/generated/fleet-officers.js',
      'miniprogram/subpkg-detail/detail-index.js',
      'miniprogram/subpkg-detail/detail-loaders.js',
      'miniprogram/subpkg-trade/trade-detail-index.js',
      'miniprogram/subpkg-trade/trade-detail-loaders.js',
      'miniprogram/subpkg-trade/trade-goods.js',
      'miniprogram/subpkg-trade/trade-reference.js',
      'miniprogram/subpkg-trade/major-event-reference.js',
      'miniprogram/subpkg-maintenance/maintenance-officers.js',
      'cloudfunctions/officer-custom/reference-data.json',
      'cloudfunctions/officer-maintenance/reference-data.json',
      'data/assets/asset-dependencies.json',
      ...Array.from({ length: 10 }, (_, n) => `miniprogram/subpkg-detail/details-${n}.js`),
      ...Array.from({ length: 10 }, (_, n) => `miniprogram/subpkg-trade/trade-details-${n}.js`),
    ]
    expect([...DATA_GENERATION_OUTPUT_PATHS].sort()).toEqual(expected.sort())
    expect(DATA_GENERATION_OUTPUT_PATHS).not.toContain('miniprogram/subpkg-detail')
    expect(DATA_GENERATION_OUTPUT_PATHS).not.toContain('miniprogram/subpkg-trade')
    expect(new Set(DATA_GENERATION_OUTPUT_PATHS).size).toBe(DATA_GENERATION_OUTPUT_PATHS.length)
  })
  it('正式回復集合加 staging 與 manifest，全部位於指定副本內', () => {
    const root = join(process.cwd(), 'artifacts', 'isolated')
    expect(getMaintenanceRollbackPaths(root)).toEqual(
      [
        ...DATA_GENERATION_OUTPUT_PATHS,
        'data/assets/staging',
        'data/assets/cloudbase-manifest.json',
      ].map((path) => join(root, path)),
    )
  })
})
