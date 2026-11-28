import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DETAIL_TILE_COLUMNS,
  DETAIL_TILE_ROWS,
} from '../../miniprogram/subpkg-world-map/chart-tile-layout'
import { analyzeMiniProgramPackage } from '../../tools/quality/check-miniprogram-package-size'

const mapPackage = 'miniprogram/subpkg-world-map'

describe('世界地圖離線分包', () => {
  it('保留概覽和執行時需要的每一塊高精度底圖', () => {
    expect(existsSync(join(mapPackage, 'assets/world-chart.jpg'))).toBe(true)
    for (let row = 0; row < DETAIL_TILE_ROWS; row++) {
      for (let col = 0; col < DETAIL_TILE_COLUMNS; col++) {
        const file = join(mapPackage, 'assets/chart-detail', `${row}-${col}.jpg`)
        expect(existsSync(file), file).toBe(true)
      }
    }
  })

  it('使用倉庫編譯估算與工程預留後仍低於單分包限制', () => {
    const size = analyzeMiniProgramPackage({
      projectRoot: process.cwd(),
      miniprogramRoot: mapPackage,
      subpackageRoots: [],
    })
    expect(size.estimatedMainPackageBytes).toBeLessThan(2 * 1024 * 1024)
  })
})
