import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  buildWorldMapIconLocations,
  MAP_ICON_ATLAS_COLUMNS,
  MAP_ICON_ATLAS_ROWS,
} from '../../tools/data-pipeline/build-world-map-icon-locations'
import { renderTradeAtlas } from '../../tools/ui-assets/build-world-map-trade-atlas'

describe('世界地圖的交易品縮圖', () => {
  it('同一圖檔的多個商品共用格位，跨圖集後從第一格開始', () => {
    const capacity = MAP_ICON_ATLAS_COLUMNS * MAP_ICON_ATLAS_ROWS
    const images = Array.from({ length: capacity + 1 }, (_, i) => `trade${i}`)
    expect(
      buildWorldMapIconLocations(
        [
          { id: 'trade-a', iconId: 'trade1', sourceRefs: { voyageTw: 'trade2' } },
          { id: 'trade-b', iconId: null, sourceRefs: { voyageTw: 'trade1' } },
          { id: 'trade-c', iconId: null, sourceRefs: { voyageTw: `trade${capacity}` } },
          { id: 'trade-d', iconId: null, sourceRefs: { voyageTw: 'trade-new' } },
        ],
        images,
      ),
    ).toEqual({ 'trade-a': [0, 1, 0], 'trade-b': [0, 1, 0], 'trade-c': [1, 0, 0] })
    expect(() => buildWorldMapIconLocations([], ['trade1', 'trade1'])).toThrow('重複')
  })

  it('在透明格位中保留對應品項的像素，重建圖集結果相同', async () => {
    const swatch = (color: string) =>
      sharp({ create: { width: 22, height: 22, channels: 4, background: color } })
        .png()
        .toBuffer()
    const inputs = await Promise.all([swatch('#dd1700'), swatch('#1b662e')])
    const first = await renderTradeAtlas(inputs)
    expect(await renderTradeAtlas(inputs)).toEqual(first)
    const { data, info } = await sharp(first)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const pixel = (x: number, y: number) => {
      const start = (y * info.width + x) * info.channels
      return [...data.subarray(start, start + 4)]
    }
    const step = info.width / MAP_ICON_ATLAS_COLUMNS
    expect(info.height).toBe(step * MAP_ICON_ATLAS_ROWS)
    expect(pixel(0, 0)[3]).toBe(0)
    expect(pixel(step / 2, step / 2)).toEqual([221, 23, 0, 255])
    expect(pixel(step * 1.5, step / 2)).toEqual([27, 102, 46, 255])
  })
})
