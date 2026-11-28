import { WorldChart } from '../../chart'
import {
  describeMapPlace,
  getWorldMapLayer,
  presentWorldMapDetail,
  selectWorldMapPosition,
  type WorldMapDetailView,
} from '../../detail-presenter'
import { MAP_LAYERS, type MapLayer, type RuntimeMapPlace } from '../../map-data'
import { getTradeThumbnail } from '../../trade-thumbnails'
import { MAX_ZOOM, type Point } from '../../viewport'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const places = require('../../generated/places') as RuntimeMapPlace[]
const placesById = new Map(places.map((place) => [place.id, place]))
const MATCH_LIMIT = 40
const MAP_PATH = '#world-chart'

type Touch = WechatMiniprogram.TouchDetail | WechatMiniprogram.TouchCanvasDetail
type TouchEvent = WechatMiniprogram.Touch<Record<string, never>, Touch>
type PointChoice = { id: string; name: string; caption: string }

interface Gesture {
  points: Point[]
  start?: Point
  moved: boolean
  startedAt: number
}

interface ChartState {
  chart?: WorldChart
  origin: Point
  gesture?: Gesture
}

function choices(result: readonly RuntimeMapPlace[]): PointChoice[] {
  return result.map((place) => ({
    id: place.id,
    name: place.name,
    caption: describeMapPlace(place),
  }))
}

function center(points: Point[]): Point {
  if (points.length < 2) return points[0]
  return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

Page({
  data: {
    layers: MAP_LAYERS,
    layer: 'port' as MapLayer,
    zoom: 1,
    maxZoom: MAX_ZOOM,
    status: 'loading',
    query: '',
    matches: [] as PointChoice[],
    matchCount: 0,
    nearby: [] as PointChoice[],
    detail: null as WorldMapDetailView | null,
  },

  state: undefined as ChartState | undefined,
  nearbyOrigin: undefined as Point | undefined,

  onReady() {
    this.initializeChart()
  },

  onResize() {
    this.measureViewport()
  },

  onUnload() {
    this.state?.chart?.destroy()
    this.state = undefined
  },

  initializeChart() {
    this.state?.chart?.destroy()
    const state: ChartState = { origin: { x: 0, y: 0 } }
    this.state = state
    this.setData({ status: 'loading', zoom: 1 }, () => this.measureViewport())
  },

  measureViewport() {
    const state = this.state
    if (!state) return
    wx.createSelectorQuery()
      .select(MAP_PATH)
      .fields({ node: true, size: true, rect: true })
      .exec((results) => {
        const target = results?.[0] as
          | (WechatMiniprogram.BoundingClientRectCallbackResult & {
              node?: WechatMiniprogram.Canvas
            })
          | null
        if (this.state !== state) return
        if (!target?.node || !target.width || !target.height) {
          if (!state.chart) this.setData({ status: 'error' })
          return
        }
        try {
          state.origin = { x: target.left, y: target.top }
          const size = { width: target.width, height: target.height }
          if (state.chart) {
            state.chart.resize(size)
            return
          }
          const chart = new WorldChart(target.node, size)
          state.chart = chart
          chart.setPlaces(getWorldMapLayer(places, this.data.layer))
          chart.load(
            () => {
              if (this.state === state)
                this.setData({ status: 'ready' }, () => this.measureViewport())
            },
            () => {
              if (this.state === state) this.setData({ status: 'error' })
            },
          )
        } catch {
          this.setData({ status: 'error' })
        }
      })
  },

  onLayerTap(event: WechatMiniprogram.BaseEvent) {
    const layer = event.currentTarget.dataset.layer as MapLayer
    if (!MAP_LAYERS.some(({ id }) => id === layer)) return
    this.closePanels()
    this.setData({ layer })
    this.state?.chart?.setPlaces(getWorldMapLayer(places, layer))
  },

  onSearch(event: WechatMiniprogram.Input) {
    const query = event.detail.value
    const value = query.trim().toLowerCase()
    const matches = value ? places.filter((place) => place.name.toLowerCase().includes(value)) : []
    this.setData(
      {
        query,
        matches: choices(matches.slice(0, MATCH_LIMIT)),
        matchCount: matches.length,
        nearby: [],
        detail: null,
      },
      () => this.measureViewport(),
    )
    this.state?.chart?.setSelected()
  },

  onResultTap(event: WechatMiniprogram.BaseEvent) {
    const place = placesById.get(event.currentTarget.dataset.id)
    const chart = this.state?.chart
    if (!place || !chart) return
    wx.hideKeyboard()
    const position = selectWorldMapPosition(
      place,
      this.data.nearby.length ? this.nearbyOrigin : undefined,
    )
    if (this.data.layer !== place.layer) {
      this.setData({ layer: place.layer })
      chart.setPlaces(getWorldMapLayer(places, place.layer))
    }
    chart.locate(position.chart, Math.max(12, chart.zoomLevel))
    this.updateZoom()
    this.showDetails(place, position)
  },

  closePanels() {
    this.nearbyOrigin = undefined
    this.setData(
      {
        query: '',
        matches: [],
        matchCount: 0,
        nearby: [],
        detail: null,
      },
      () => this.measureViewport(),
    )
    this.state?.chart?.setSelected()
  },

  showDetails(place: RuntimeMapPlace, position: ReturnType<typeof selectWorldMapPosition>) {
    this.nearbyOrigin = undefined
    this.setData(
      {
        query: '',
        matches: [],
        matchCount: 0,
        nearby: [],
        detail: presentWorldMapDetail(place, position, getTradeThumbnail),
      },
      () => this.measureViewport(),
    )
    this.state?.chart?.setSelected(position.chart)
  },

  onTradeTap(event: WechatMiniprogram.BaseEvent) {
    const tradeId = event.currentTarget.dataset.tradeId
    if (typeof tradeId !== 'string' || !/^trade[A-Za-z0-9]+$/.test(tradeId)) return
    wx.navigateTo({ url: `/subpkg-trade/pages/detail/index?id=${encodeURIComponent(tradeId)}` })
  },

  updateZoom() {
    const chart = this.state?.chart
    if (!chart) return
    // 手勢結束時同步提交最後一幀，避免下一次點按落到舊視窗的標記。
    chart.flush()
    this.setData({ zoom: Math.round(chart.zoomLevel * 10) / 10 })
  },

  onZoomIn() {
    this.state?.chart?.zoom(2)
    this.updateZoom()
  },

  onZoomOut() {
    this.state?.chart?.zoom(0.5)
    this.updateZoom()
  },

  onReset() {
    this.closePanels()
    this.state?.chart?.reset()
    this.updateZoom()
  },

  touchPoints(touches: Touch[]): Point[] {
    const origin = this.state?.origin ?? { x: 0, y: 0 }
    return touches
      .slice(0, 2)
      .map((touch) =>
        'clientX' in touch
          ? { x: touch.clientX - origin.x, y: touch.clientY - origin.y }
          : { x: touch.x, y: touch.y },
      )
  },

  onTouchStart(event: TouchEvent) {
    const state = this.state
    if (!state) return
    const points = this.touchPoints(event.touches)
    state.gesture = { points, start: points[0], moved: points.length > 1, startedAt: Date.now() }
  },

  onTouchMove(event: TouchEvent) {
    const state = this.state
    const gesture = state?.gesture
    const chart = state?.chart
    if (!gesture || !chart) return
    const next = this.touchPoints(event.touches)
    if (!next.length) return
    const previous = gesture.points
    if (previous.length === next.length) {
      if (next.length === 2) {
        const factor = distance(next[0], next[1]) / Math.max(1, distance(previous[0], previous[1]))
        chart.zoom(factor, center(previous), center(next))
        gesture.moved = true
      } else if (gesture.start && (gesture.moved || distance(gesture.start, next[0]) > 5)) {
        const from = gesture.moved ? previous[0] : gesture.start
        chart.pan({ x: next[0].x - from.x, y: next[0].y - from.y })
        gesture.moved = true
      }
    }
    gesture.points = next
  },

  onTouchEnd(event: TouchEvent) {
    const state = this.state
    if (!state?.gesture) return
    if (event.touches.length) {
      state.gesture.points = this.touchPoints(event.touches)
      state.gesture.moved = true
      return
    }
    const { moved, start, startedAt } = state.gesture
    state.gesture = undefined
    if (moved) this.updateZoom()
    const point = this.touchPoints(event.changedTouches)[0]
    if (!moved && start && point && distance(start, point) <= 5 && Date.now() - startedAt < 500) {
      this.selectMapPoint(point)
    }
  },

  onTouchCancel() {
    if (!this.state) return
    this.state.gesture = undefined
    this.updateZoom()
  },

  selectMapPoint(point: Point) {
    const chart = this.state?.chart
    if (!chart || this.data.status !== 'ready') return
    const marker = chart.hit(point)
    this.closePanels()
    if (!marker) return
    const { coordinate } = marker
    const members = marker.ids.flatMap((id) => {
      const place = placesById.get(id)
      return place ? [place] : []
    })
    if (members.length === 1) {
      this.showDetails(members[0], selectWorldMapPosition(members[0], coordinate))
    } else if (chart.zoomLevel < MAX_ZOOM - 0.01) {
      chart.locate(coordinate, Math.min(MAX_ZOOM, Math.max(4, chart.zoomLevel * 2.5)))
      this.updateZoom()
    } else {
      this.nearbyOrigin = coordinate
      this.setData({ nearby: choices(members) }, () => this.measureViewport())
    }
  },
})
