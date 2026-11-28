import type { RuntimeMapPlace } from './map-data'
import {
  fitMap,
  focusMap,
  getMapMarkers,
  MAP_HEIGHT,
  MAP_WIDTH,
  mapToScreen,
  minScale,
  panMap,
  screenToMap,
  zoomMap,
  type MapMarker,
  type Point,
  type ViewSize,
} from './viewport'

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D
type IndexedPoint = Point & { id: string }
const CHART_PATH = '/subpkg-world-map/assets/world-chart.jpg'
const HIT_RADIUS = 22

export class WorldChart {
  private readonly context: Context
  private readonly image: WechatMiniprogram.Image
  private imageLoaded = false
  private points: IndexedPoint[] = []
  private names = new Map<string, string>()
  private selected: Point | undefined
  private markers: MapMarker[] = []
  private camera
  private renderedCamera
  private frame: number | undefined
  private disposed = false
  private size: ViewSize

  constructor(
    private readonly canvas: WechatMiniprogram.Canvas,
    size: ViewSize,
  ) {
    this.context = canvas.getContext('2d') as Context
    this.image = canvas.createImage()
    this.camera = fitMap(size)
    this.renderedCamera = this.camera
    this.size = size
    this.resizeCanvas()
  }

  private resizeCanvas(): void {
    const { canvas, size, context } = this
    const ratio = Math.min(wx.getWindowInfo().pixelRatio, 2)
    canvas.width = Math.round(size.width * ratio)
    canvas.height = Math.round(size.height * ratio)
    context.setTransform(canvas.width / size.width, 0, 0, canvas.height / size.height, 0, 0)
  }

  resize(size: ViewSize): void {
    if (size.width === this.size.width && size.height === this.size.height) return
    const point = screenToMap(this.center(), this.camera)
    const zoom = this.zoomLevel
    this.size = size
    this.camera = focusMap(fitMap(size), point, zoom, size)
    this.resizeCanvas()
    this.flush()
  }

  load(onLoad: () => void, onError: () => void): void {
    this.image.onload = () => {
      if (this.disposed) return
      this.imageLoaded = true
      this.flush()
      onLoad()
    }
    this.image.onerror = () => {
      if (!this.disposed) onError()
    }
    this.image.src = CHART_PATH
  }

  destroy(): void {
    this.disposed = true
    if (this.frame !== undefined) this.canvas.cancelAnimationFrame(this.frame)
  }

  setPlaces(places: readonly RuntimeMapPlace[]): void {
    this.markers = []
    this.names = new Map(places.map(({ id, name }) => [id, name]))
    this.points = places.flatMap(({ id, positions, chartPositions }) =>
      (chartPositions ?? positions).map(({ x, y }) => ({ x, y, id })),
    )
    this.flush()
  }

  setSelected(point?: Point): void {
    this.selected = point
    this.draw()
  }

  get zoomLevel(): number {
    return this.camera.scale / minScale(this.size)
  }

  pan(delta: Point): void {
    this.camera = panMap(this.camera, delta, this.size)
    this.draw()
  }

  zoom(factor: number, from = this.center(), to = from): void {
    this.camera = zoomMap(this.camera, factor, from, to, this.size)
    this.draw()
  }

  reset(): void {
    this.camera = fitMap(this.size)
    this.draw()
  }

  locate(point: Point, zoom: number): void {
    this.camera = focusMap(this.camera, point, zoom, this.size)
    this.draw()
  }

  hit(point: Point): { ids: string[]; coordinate: Point } | undefined {
    let nearest: MapMarker | undefined
    let closest = HIT_RADIUS
    for (const marker of this.markers) {
      const distance = Math.hypot(point.x - marker.x, point.y - marker.y)
      if (distance <= closest) {
        closest = distance
        nearest = marker
      }
    }
    if (nearest) return { ids: nearest.ids, coordinate: screenToMap(nearest, this.renderedCamera) }
  }

  private center(): Point {
    return { x: this.size.width / 2, y: this.size.height / 2 }
  }

  flush(): void {
    if (!this.imageLoaded || this.disposed) return
    if (this.frame !== undefined) this.canvas.cancelAnimationFrame(this.frame)
    this.frame = undefined
    this.render()
  }

  private draw(): void {
    if (!this.imageLoaded || this.frame !== undefined) return
    this.frame = this.canvas.requestAnimationFrame(() => {
      this.frame = undefined
      this.render()
    })
  }

  private render(): void {
    const { context, camera, size } = this
    this.renderedCamera = camera
    context.fillStyle = '#172a30'
    context.fillRect(0, 0, size.width, size.height)
    context.drawImage(
      this.image,
      camera.x,
      camera.y,
      MAP_WIDTH * camera.scale,
      MAP_HEIGHT * camera.scale,
    )
    this.markers = getMapMarkers(this.points, camera, size)
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = '600 11px sans-serif'
    for (const marker of this.markers) {
      const clustered = marker.ids.length > 1
      this.circle(marker, clustered ? 13 : 5, clustered ? '#26332f' : '#b99552', '#f5efe0')
      if (!clustered) continue
      context.fillStyle = '#f5efe0'
      context.fillText(String(marker.ids.length), marker.x, marker.y)
    }
    if (this.zoomLevel >= 8) this.drawLabels()
    if (this.selected) {
      const point = mapToScreen(this.selected, camera)
      this.circle(point, 10, '#f5efe0', '#26332f')
      this.circle(point, 4, '#76501a', '#76501a')
    }
  }

  private drawLabels(): void {
    const { context, markers, size } = this
    const labels: Array<{ left: number; right: number; y: number }> = []
    context.textAlign = 'left'
    context.font = '600 12px sans-serif'
    context.lineJoin = 'round'
    context.lineWidth = 3
    context.strokeStyle = '#26332f'
    context.fillStyle = '#f5efe0'
    for (const marker of markers) {
      if (marker.ids.length !== 1 || labels.length >= 18) continue
      const name = this.names.get(marker.ids[0])
      if (!name) continue
      const width = context.measureText(name).width
      const left = marker.x + width + 12 < size.width ? marker.x + 12 : marker.x - width - 12
      const right = left + width
      const { y } = marker
      if (left < 2 || y < 8 || y > size.height - 8) continue
      if (
        markers.some(
          (other) =>
            other !== marker &&
            Math.abs(other.y - y) < 15 &&
            other.x > left - 14 &&
            other.x < right + 14,
        )
      )
        continue
      if (
        labels.some(
          (label) => Math.abs(label.y - y) < 15 && left < label.right + 6 && right > label.left - 6,
        )
      )
        continue
      context.strokeText(name, left, y)
      context.fillText(name, left, y)
      labels.push({ left, right, y })
    }
  }

  private circle(point: Point, radius: number, fill: string, stroke: string): void {
    const { context } = this
    context.beginPath()
    context.arc(point.x, point.y, radius, 0, Math.PI * 2)
    context.fillStyle = fill
    context.fill()
    context.lineWidth = 1.5
    context.strokeStyle = stroke
    context.stroke()
  }
}
