import { getDetailChartTiles, type DetailChartTile } from './chart-tile-layout'
import { mapToScreen, type Camera, type ViewSize } from './viewport'

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D
const TILE_DIRECTORY = '/subpkg-world-map/assets/chart-detail'
const MAX_CONCURRENT_TILE_LOADS = 2
const TILE_CACHE_MARGIN = 1

export class WorldChartDetail {
  private visible: DetailChartTile[] = []
  private readonly loaded = new Map<string, WechatMiniprogram.Image>()
  private readonly loading = new Set<string>()
  private readonly failed = new Set<string>()
  private disposed = false

  constructor(
    private readonly canvas: WechatMiniprogram.Canvas,
    private readonly repaint: () => void,
  ) {}

  destroy(): void {
    this.disposed = true
    this.visible = []
    this.loaded.clear()
  }

  render(context: Context, camera: Camera, size: ViewSize): void {
    if (this.disposed) return
    // 雙指在門檻附近微調時，保留已解碼的瓦片，避免反覆切換底圖。
    this.visible = getDetailChartTiles(camera, size, this.visible.length > 0)
    const visibleKeys = new Set(this.visible.map(({ key }) => key))
    if (visibleKeys.size === 0) {
      this.loaded.clear()
      return
    }

    // 留一塊剛滑出的圖。縮回全圖時釋出已解碼的高精度圖片。
    const outside = [...this.loaded.keys()].filter((key) => !visibleKeys.has(key))
    for (const key of outside.slice(0, Math.max(0, outside.length - TILE_CACHE_MARGIN))) {
      this.loaded.delete(key)
    }
    for (const tile of this.visible) {
      const image = this.loaded.get(tile.key)
      if (!image) continue
      const { x, y } = mapToScreen(tile, camera)
      context.drawImage(image, x, y, tile.width * camera.scale, tile.height * camera.scale)
    }
    this.loadVisible()
  }

  private loadVisible(): void {
    for (const tile of this.visible) {
      if (this.loading.size >= MAX_CONCURRENT_TILE_LOADS) break
      const { key } = tile
      if (this.loaded.has(key) || this.loading.has(key) || this.failed.has(key)) continue
      this.load(key)
    }
  }

  private load(key: string): void {
    this.loading.add(key)
    const image = this.canvas.createImage()
    image.onload = () => {
      this.loading.delete(key)
      if (this.disposed) return
      if (this.visible.some((tile) => tile.key === key)) {
        this.loaded.set(key, image)
        this.repaint()
      }
      this.loadVisible()
    }
    image.onerror = () => {
      this.loading.delete(key)
      if (this.disposed) return
      // 概覽底圖已在下層繪製。單一圖片失敗也能繼續拖動與查詢點位。
      this.failed.add(key)
      this.loadVisible()
    }
    image.src = `${TILE_DIRECTORY}/${key}.jpg`
  }
}
