import {
  MAP_HEIGHT,
  MAP_WIDTH,
  projectMapCoordinate,
  type Point,
} from '../../miniprogram/subpkg-world-map/viewport'

export interface WorldMapCalibration {
  version: number
  source: string
  anchors: readonly {
    placeId: string
    longitude: number
    latitude: number
    reference: string
    kind?: 'representative'
  }[]
}

export interface WorldMapCalibrationPoint extends Point {
  precision: 'anchor' | 'estimated' | 'source'
}

function wrapX(x: number): number {
  return ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH
}

function wrappedDeltaX(x: number): number {
  return wrapX(x + MAP_WIDTH / 2) - MAP_WIDTH / 2
}

function isInMap(point: Point): boolean {
  return point.x >= 0 && point.x <= MAP_WIDTH && point.y >= 0 && point.y <= MAP_HEIGHT
}

export function createWorldMapCalibrator(
  places: readonly { id: string; positions: readonly Point[] }[],
  calibration: WorldMapCalibration,
): (point: Point) => WorldMapCalibrationPoint {
  if (
    calibration?.version !== 1 ||
    typeof calibration.source !== 'string' ||
    !calibration.source.trim() ||
    !Array.isArray(calibration.anchors) ||
    !calibration.anchors.length
  ) {
    throw new Error('世界地圖校準缺少有效版本、來源或錨點')
  }
  const positionsById = new Map(places.map(({ id, positions }) => [id, positions]))
  const usedIds = new Set<string>()
  const usedPositions = new Set<string>()
  const anchors = calibration.anchors.map((anchor, index) => {
    if (typeof anchor?.placeId !== 'string' || !anchor.placeId.trim()) {
      throw new Error(`世界地圖校準錨點缺少點位識別碼：第 ${index + 1} 筆`)
    }
    const { placeId, longitude, latitude, reference, kind } = anchor
    if (usedIds.has(placeId)) throw new Error(`世界地圖校準錨點重複：${placeId}`)
    const positions = positionsById.get(placeId)
    const source = positions?.[0]
    if (
      positions?.length !== 1 ||
      !source ||
      !Number.isInteger(source.x) ||
      !Number.isInteger(source.y) ||
      !isInMap(source) ||
      (source.x === 0 && source.y === 0)
    ) {
      throw new Error(`世界地圖校準錨點缺少唯一有效的遊戲座標：${placeId}`)
    }
    const positionKey = `${wrapX(source.x)}:${source.y}`
    if (usedPositions.has(positionKey))
      throw new Error(`世界地圖校準錨點的遊戲座標重複：${placeId}`)
    if (
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180 ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      typeof reference !== 'string' ||
      !reference.trim() ||
      (kind !== undefined && kind !== 'representative')
    ) {
      throw new Error(`世界地圖校準錨點包含無效的經緯度、參考來源或類型：${placeId}`)
    }
    const target = projectMapCoordinate(longitude, latitude)
    if (!isInMap(target)) throw new Error(`世界地圖校準錨點的投影超出海圖：${placeId}`)
    usedIds.add(placeId)
    usedPositions.add(positionKey)

    const dx = wrappedDeltaX(target.x - source.x)
    const dy = target.y - source.y
    const shift = Math.hypot(dx, dy)
    // 大幅移動的錨點只影響更近的範圍，避免局部變形擴散到遠處。
    const extent = 500 / (1 + Math.max(0, shift - 70) / 100)
    // 代表點只確認島嶼或區域，避免把選定港址的偏移套用到其他島嶼。
    const radius = kind === 'representative' ? Math.min(140, extent) : extent
    const precision = kind === 'representative' ? ('estimated' as const) : ('anchor' as const)
    return { source, target, dx, dy, radius, precision }
  })

  return (point) => {
    let offsetX = 0
    let offsetY = 0
    // 原座標本身佔一份權重。靠近影響範圍邊界時，推算座標會平滑回到遊戲格網。
    let weightTotal = 1
    for (const { source, target, dx, dy, radius, precision } of anchors) {
      const distance = Math.hypot(wrappedDeltaX(point.x - source.x), point.y - source.y)
      if (distance === 0) return { ...target, precision }
      if (distance >= radius) continue

      const ratio = distance / radius
      const weight = ((1 - ratio * ratio) / ratio) ** 2
      offsetX += dx * weight
      offsetY += dy * weight
      weightTotal += weight
    }
    if (weightTotal === 1) return { ...point, precision: 'source' }
    return {
      x: wrapX(point.x + offsetX / weightTotal),
      y: Math.max(0, Math.min(MAP_HEIGHT, point.y + offsetY / weightTotal)),
      precision: 'estimated',
    }
  }
}
