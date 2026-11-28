import { expect, it, vi } from 'vitest'
import {
  DETAIL_TILE_COLUMNS,
  DETAIL_TILE_MIN_ZOOM,
  DETAIL_TILE_ROWS,
  getDetailChartTiles,
} from '../../miniprogram/subpkg-world-map/chart-tile-layout'
import { WorldChartDetail } from '../../miniprogram/subpkg-world-map/chart-detail'
import {
  fitMap,
  MAP_HEIGHT,
  MAP_WIDTH,
  minScale,
} from '../../miniprogram/subpkg-world-map/viewport'

const size = { width: 360, height: 500 }
const tileWidth = MAP_WIDTH / DETAIL_TILE_COLUMNS
const tileHeight = MAP_HEIGHT / DETAIL_TILE_ROWS

it('全圖不請求高精度素材，放大後只讀已與視窗相交的格位', () => {
  expect(getDetailChartTiles(fitMap(size), size)).toEqual([])
  const scale = minScale(size) * DETAIL_TILE_MIN_ZOOM
  expect(getDetailChartTiles({ x: -tileWidth * scale, y: 0, scale }, size)).toEqual([
    expect.objectContaining({
      row: 0,
      col: 1,
      x: tileWidth,
      y: 0,
      width: tileWidth,
      height: tileHeight,
    }),
    expect.objectContaining({ row: 1, col: 1, x: tileWidth, y: tileHeight }),
  ])
})

it('修剪越界的格位，也不漏掉最右下的海岸', () => {
  const scale = minScale(size) * 26
  const x = size.width - MAP_WIDTH * scale
  const y = size.height - MAP_HEIGHT * scale
  expect(getDetailChartTiles({ x, y, scale }, size)).toEqual([
    expect.objectContaining({ row: DETAIL_TILE_ROWS - 1, col: DETAIL_TILE_COLUMNS - 1 }),
  ])
})

it('用低清底圖等待瓦片，在圖片就緒後重繪，失敗或離開頁面不持續重試', () => {
  const images: Array<{ onload?: () => void; onerror?: () => void; src?: string }> = []
  const canvas = {
    createImage: () => {
      const image = {}
      images.push(image)
      return image
    },
  } as unknown as WechatMiniprogram.Canvas
  const drawImage = vi.fn()
  const context = {
    drawImage,
  } as unknown as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D
  const repaint = vi.fn()
  const detail = new WorldChartDetail(canvas, repaint)
  const camera = { x: 0, y: 0, scale: minScale(size) * DETAIL_TILE_MIN_ZOOM }

  detail.render(context, camera, size)
  expect(images.map(({ src }) => src)).toEqual([
    '/subpkg-world-map/assets/chart-detail/0-0.jpg',
    '/subpkg-world-map/assets/chart-detail/1-0.jpg',
  ])
  expect(drawImage).not.toHaveBeenCalled()

  images[0].onload?.()
  images[1].onerror?.()
  expect(repaint).toHaveBeenCalledTimes(1)
  detail.render(context, camera, size)
  expect(drawImage).toHaveBeenCalledWith(
    images[0],
    0,
    0,
    tileWidth * camera.scale,
    tileHeight * camera.scale,
  )
  expect(images).toHaveLength(2)
  drawImage.mockClear()
  const nearThreshold = { ...camera, scale: camera.scale * 0.995 }
  detail.render(context, nearThreshold, size)
  expect(drawImage).toHaveBeenCalledWith(
    images[0],
    0,
    0,
    tileWidth * nearThreshold.scale,
    tileHeight * nearThreshold.scale,
  )
  const requestCount = images.length
  detail.render(context, fitMap(size), size)
  detail.destroy()
  detail.render(context, camera, size)
  expect(images).toHaveLength(requestCount)
})
