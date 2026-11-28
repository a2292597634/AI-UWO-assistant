import { WorldChart } from '../../chart'
import { MAP_LAYERS, type MapLayer, type RuntimeMapPlace } from '../../map-data'
import { MAX_ZOOM, unprojectMapCoordinate, type Point } from '../../viewport'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const places = require('../../generated/places') as RuntimeMapPlace[]
const placesById = new Map(places.map((place) => [place.id, place]))
const layerLabels = new Map(MAP_LAYERS.map(({ id, label }) => [id, label]))
const MATCH_LIMIT = 40
const MAP_PATH = '#world-chart'

type Touch = WechatMiniprogram.TouchDetail | WechatMiniprogram.TouchCanvasDetail
type TouchEvent = WechatMiniprogram.Touch<Record<string, never>, Touch>
type PointChoice = { id: string; name: string; caption: string }
type PlaceDetails = {
  title: string
  caption: string
  coordinates: string
  languages: string
  belief: string
  goods: NonNullable<RuntimeMapPlace['goods']>
}

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

function describe(place: RuntimeMapPlace): string {
  return [place.method ?? layerLabels.get(place.layer), place.region ?? place.category]
    .filter(Boolean)
    .join(' · ')
}

function choices(result: readonly RuntimeMapPlace[]): PointChoice[] {
  return result.map((place) => ({ id: place.id, name: place.name, caption: describe(place) }))
}

function getDetails(place: RuntimeMapPlace, point: Point): PlaceDetails {
  const { latitude, longitude } = unprojectMapCoordinate(point)
  const lat = `${latitude >= 0 ? '北緯' : '南緯'} ${Math.abs(latitude).toFixed(2)}°`
  const lon = `${longitude >= 0 ? '東經' : '西經'} ${Math.abs(longitude).toFixed(2)}°`
  const rank = place.rank ? ` · ${place.rank} 級` : ''
  return {
    title: place.name,
    caption: describe(place) + rank,
    coordinates: `${lat} · ${lon}`,
    languages: place.languages?.join('、') ?? '',
    belief: place.belief ?? '',
    goods: place.goods ?? [],
  }
}

function center(points: Point[]): Point {
  if (points.length < 2) return points[0]
  return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function nearestPosition(place: RuntimeMapPlace, point: Point): Point {
  return place.positions.reduce((nearest, candidate) =>
    distance(candidate, point) < distance(nearest, point) ? candidate : nearest,
  )
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
    detail: null as PlaceDetails | null,
    showGoods: false,
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
          chart.setPlaces(places.filter((place) => place.layer === this.data.layer))
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
    if (!layerLabels.has(layer)) return
    this.closePanels()
    this.setData({ layer })
    this.state?.chart?.setPlaces(places.filter((place) => place.layer === layer))
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
    const point =
      this.nearbyOrigin && this.data.nearby.length
        ? nearestPosition(place, this.nearbyOrigin)
        : place.positions[0]
    if (this.data.layer !== place.layer) {
      this.setData({ layer: place.layer })
      chart.setPlaces(places.filter((candidate) => candidate.layer === place.layer))
    }
    chart.locate(point, Math.max(12, chart.zoomLevel))
    this.updateZoom()
    this.showDetails(place, point)
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
        showGoods: false,
      },
      () => this.measureViewport(),
    )
    this.state?.chart?.setSelected()
  },

  showDetails(place: RuntimeMapPlace, point: Point) {
    this.nearbyOrigin = undefined
    this.setData(
      {
        query: '',
        matches: [],
        matchCount: 0,
        nearby: [],
        detail: getDetails(place, point),
        showGoods: false,
      },
      () => this.measureViewport(),
    )
    this.state?.chart?.setSelected(point)
  },

  toggleGoods() {
    this.setData({ showGoods: !this.data.showGoods }, () => this.measureViewport())
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
      this.showDetails(members[0], nearestPosition(members[0], coordinate))
    } else if (chart.zoomLevel < MAX_ZOOM - 0.01) {
      chart.locate(coordinate, Math.min(MAX_ZOOM, Math.max(4, chart.zoomLevel * 2.5)))
      this.updateZoom()
    } else {
      this.nearbyOrigin = coordinate
      this.setData({ nearby: choices(members) }, () => this.measureViewport())
    }
  },
})
