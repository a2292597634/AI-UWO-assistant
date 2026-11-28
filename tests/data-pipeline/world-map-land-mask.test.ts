import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import type { MapChartPosition } from '../../miniprogram/subpkg-world-map/map-data'
import type { Point } from '../../miniprogram/subpkg-world-map/viewport'
import {
  buildWorldMapLandMask,
  createWorldMapLandCheck,
  preserveWorldMapSurface,
} from '../../tools/data-pipeline/world-map-land-mask'

const rasterWidth = 2493
const rasterHeight = 1472
const rasterSize = rasterWidth * rasterHeight

describe('世界地圖陸水遮罩', () => {
  it('在固定海圖格網壓縮、讀回陸地像素，並保留底部未滿四點的格子', () => {
    const pixels = new Uint8Array(rasterSize)
    pixels[rasterWidth + 2] = 128
    pixels[rasterWidth + 3] = 127
    pixels[rasterSize - 1] = 255
    const mask = buildWorldMapLandMask(pixels)
    expect(mask).toMatchObject({ width: 2493, height: 1472, step: 4 })
    expect(mask.bits.length).toBeLessThan(4_000)
    const isLand = createWorldMapLandCheck(mask)
    expect(isLand({ x: 8, y: 4 })).toBe(true)
    expect(isLand({ x: 11.9, y: 7.9 })).toBe(true)
    expect(isLand({ x: 12, y: 4 })).toBe(false)
    expect(isLand({ x: 9971, y: 5885 })).toBe(true)
    expect(isLand({ x: 9972, y: 5885 })).toBe(false)
    expect(isLand({ x: 9971, y: 5886 })).toBe(false)
    expect(isLand({ x: -1, y: 5 })).toBe(false)
    expect(isLand({ x: 5, y: Number.NaN })).toBe(false)
  })

  it('拒絕尺寸與海圖格網不符的灰階圖', () => {
    expect(() => buildWorldMapLandMask(new Uint8Array(rasterSize - 1))).toThrow(/灰階/)
  })

  it('拒絕尺寸錯誤、編碼損壞、附加資料及位元長度不符的遮罩', () => {
    const mask = buildWorldMapLandMask(new Uint8Array(rasterSize))
    const appendedData = Buffer.concat([Buffer.from(mask.bits, 'base64'), Buffer.of(255)])
    const compressedShort = deflateSync(Buffer.alloc(rasterSize / 8 - 1))
    const compressedLong = deflateSync(Buffer.alloc(rasterSize / 8 + 1))
    const invalidMasks = [
      { ...mask, width: 2492 },
      { ...mask, height: 1471 },
      { ...mask, step: 8 },
      { ...mask, bits: mask.bits + '\n' },
      { ...mask, bits: 'AAAA' },
      { ...mask, bits: appendedData.toString('base64') },
      { ...mask, bits: compressedShort.toString('base64') },
      { ...mask, bits: compressedLong.toString('base64') },
    ]
    for (const invalid of invalidMasks) {
      expect(() => createWorldMapLandCheck(invalid)).toThrow(/遮罩/)
    }
  })

  const land = { x: 200, y: 100 }
  const water = { x: 300, y: 100 }
  const isLand = ({ x }: Point) => x < 250
  const estimatedLand: MapChartPosition = { ...land, precision: 'estimated' }
  const estimatedWater: MapChartPosition = { ...water, precision: 'estimated' }

  it.each(['land', 'village'] as const)('%s 從陸地推算至水面時保留來源', (layer) => {
    expect(preserveWorldMapSurface(layer, land, estimatedWater, isLand)).toEqual({
      ...land,
      precision: 'source',
    })
  })

  it.each(['sea', 'fishing'] as const)('%s 從水面推算至陸地時保留來源', (layer) => {
    expect(preserveWorldMapSurface(layer, water, estimatedLand, isLand)).toEqual({
      ...water,
      precision: 'source',
    })
  })

  it('保留不跨越陸水的推算、原點不符類別的推算及港口推算', () => {
    const anotherLand: MapChartPosition = { x: 220, y: 100, precision: 'estimated' }
    expect(preserveWorldMapSurface('land', land, anotherLand, isLand)).toBe(anotherLand)
    expect(preserveWorldMapSurface('land', water, estimatedWater, isLand)).toBe(estimatedWater)
    expect(preserveWorldMapSurface('sea', land, estimatedLand, isLand)).toBe(estimatedLand)
    expect(preserveWorldMapSurface('port', land, estimatedWater, isLand)).toBe(estimatedWater)
  })

  it('保留已確認錨點與原始結果，不把圖幅邊界誤判為水面', () => {
    const anchor: MapChartPosition = { ...water, precision: 'anchor' }
    const fromSource: MapChartPosition = { ...water, precision: 'source' }
    expect(preserveWorldMapSurface('land', land, anchor, isLand)).toBe(anchor)
    expect(preserveWorldMapSurface('land', land, fromSource, isLand)).toBe(fromSource)
    for (const boundary of [
      { x: 0, y: 100 },
      { x: 9972, y: 100 },
      { x: 300, y: 0 },
      { x: 300, y: 5886 },
    ]) {
      const estimatedBoundary: MapChartPosition = { ...boundary, precision: 'estimated' }
      expect(preserveWorldMapSurface('land', land, estimatedBoundary, isLand)).toBe(
        estimatedBoundary,
      )
      expect(preserveWorldMapSurface('sea', boundary, estimatedLand, isLand)).toBe(estimatedLand)
    }
  })
})
