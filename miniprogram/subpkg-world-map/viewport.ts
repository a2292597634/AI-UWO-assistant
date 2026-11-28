export interface Point {
  x: number
  y: number
}

export interface ViewSize {
  width: number
  height: number
}

export interface Camera extends Point {
  scale: number
}

export interface MapMarker extends Point {
  ids: string[]
}

// 沿用快照的海圖座標系，讓港口、探索點與獨立底圖對齊。
export const MAP_WIDTH = 9972
export const MAP_HEIGHT = 5886
export const MAX_ZOOM = 32
const PRIME_MERIDIAN = 4670
const EQUATOR = 2960
const DEGREES = Math.PI / 180
const MERCATOR_SCALE = MAP_WIDTH / (2 * Math.PI)
const MARKER_GRID = 44

export function projectMapCoordinate(longitude: number, latitude: number, wrap = true): Point {
  const x = PRIME_MERIDIAN + (longitude * MAP_WIDTH) / 360
  const radians = Math.max(-89, Math.min(89, latitude)) * DEGREES
  return {
    x: wrap ? ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH : x,
    y: EQUATOR - MERCATOR_SCALE * Math.asinh(Math.tan(radians)),
  }
}

export function unprojectMapCoordinate({ x, y }: Point) {
  const longitude = ((x - PRIME_MERIDIAN) * 360) / MAP_WIDTH
  return {
    longitude: longitude > 180 ? longitude - 360 : longitude,
    latitude: Math.atan(Math.sinh((EQUATOR - y) / MERCATOR_SCALE)) / DEGREES,
  }
}

export function minScale(size: ViewSize): number {
  return Math.min(size.width / MAP_WIDTH, size.height / MAP_HEIGHT)
}

function constrainAxis(position: number, mapLength: number, viewLength: number): number {
  if (mapLength <= viewLength) return (viewLength - mapLength) / 2
  return Math.min(0, Math.max(viewLength - mapLength, position))
}

function constrain(camera: Camera, size: ViewSize): Camera {
  return {
    x: constrainAxis(camera.x, MAP_WIDTH * camera.scale, size.width),
    y: constrainAxis(camera.y, MAP_HEIGHT * camera.scale, size.height),
    scale: camera.scale,
  }
}

export function fitMap(size: ViewSize): Camera {
  return constrain({ x: 0, y: 0, scale: minScale(size) }, size)
}

export function mapToScreen(point: Point, camera: Camera): Point {
  return { x: point.x * camera.scale + camera.x, y: point.y * camera.scale + camera.y }
}

export function screenToMap(point: Point, camera: Camera): Point {
  return { x: (point.x - camera.x) / camera.scale, y: (point.y - camera.y) / camera.scale }
}

export function panMap(camera: Camera, delta: Point, size: ViewSize): Camera {
  return constrain({ ...camera, x: camera.x + delta.x, y: camera.y + delta.y }, size)
}

export function zoomMap(
  camera: Camera,
  factor: number,
  from: Point,
  to: Point,
  size: ViewSize,
): Camera {
  const point = screenToMap(from, camera)
  const min = minScale(size)
  const scale = Math.min(min * MAX_ZOOM, Math.max(min, camera.scale * factor))
  if (scale === min) return fitMap(size)
  return constrain({ scale, x: to.x - point.x * scale, y: to.y - point.y * scale }, size)
}

export function focusMap(camera: Camera, point: Point, zoom: number, size: ViewSize): Camera {
  return zoomMap(
    camera,
    (minScale(size) * zoom) / camera.scale,
    mapToScreen(point, camera),
    {
      x: size.width / 2,
      y: size.height / 2,
    },
    size,
  )
}

export function getMapMarkers(
  points: readonly (Point & { id: string })[],
  camera: Camera,
  size: ViewSize,
): MapMarker[] {
  const cells = new Map<string, { x: number; y: number; ids: Set<string>; count: number }>()
  for (const point of points) {
    const screen = mapToScreen(point, camera)
    if (screen.x < 0 || screen.y < 0 || screen.x > size.width || screen.y > size.height) continue

    // 網格固定在海圖上，拖動時同組點位不會因越過螢幕網格線而重組。
    const cell = `${Math.floor((point.x * camera.scale) / MARKER_GRID)}:${Math.floor((point.y * camera.scale) / MARKER_GRID)}`
    const previous = cells.get(cell)
    if (previous) {
      previous.x += screen.x
      previous.y += screen.y
      previous.count++
      previous.ids.add(point.id)
    } else {
      cells.set(cell, { ...screen, ids: new Set([point.id]), count: 1 })
    }
  }
  return [...cells.values()].map(({ x, y, count, ids }) => ({
    x: x / count,
    y: y / count,
    ids: [...ids],
  }))
}
