import {
  MAP_LAYERS,
  type MapChartPosition,
  type MapCoordinateResources,
  type MapItem,
  type MapLayer,
  type RuntimeMapPlace,
} from './map-data'
import type { TradeThumbnail } from './trade-thumbnails'
import { type Point, unprojectMapCoordinate } from './viewport'

const layerNames = new Map(MAP_LAYERS.map(({ id, label }) => [id, label]))
const positionKey = ({ x, y }: Point) => `${x}_${y}`

const accuracyLabels: Record<MapChartPosition['precision'], string> = {
  anchor: '地理對照位置',
  estimated: '推算位置',
  source: '原始海圖位置',
}

interface SelectedPosition {
  source: Point
  chart: MapChartPosition
}

const chartPositionAt = (place: RuntimeMapPlace, index: number): MapChartPosition =>
  place.chartPositions?.[index] ?? { ...place.positions[index], precision: 'source' }

export function selectWorldMapPosition(place: RuntimeMapPlace, nearby?: Point): SelectedPosition {
  let index = 0
  if (nearby) {
    let nearest = Infinity
    for (let candidate = 0; candidate < place.positions.length; candidate++) {
      const { x, y } = chartPositionAt(place, candidate)
      const distance = Math.hypot(nearby.x - x, nearby.y - y)
      if (distance < nearest) {
        index = candidate
        nearest = distance
      }
    }
  }
  return { source: place.positions[index], chart: chartPositionAt(place, index) }
}

export function getWorldMapLayer(
  places: readonly RuntimeMapPlace[],
  layer: MapLayer,
): RuntimeMapPlace[] {
  const members = places.filter((place) => place.layer === layer)
  if (layer !== 'village') return members

  // 同址的發現物由村莊卡片列出。只隱藏已被村莊涵蓋的那個座標。
  const villages = new Set(
    members
      .filter(({ method }) => method === '村莊')
      .flatMap(({ positions }) => positions.map(positionKey)),
  )
  return members.flatMap((place) => {
    if (place.method !== '村莊探索') return [place]
    const indexes = place.positions
      .map((position, index) => ({ position, index }))
      .filter(({ position }) => !villages.has(positionKey(position)))
    if (!indexes.length) return []
    return [
      {
        ...place,
        positions: indexes.map(({ position }) => position),
        chartPositions: indexes.map(({ index }) => chartPositionAt(place, index)),
      },
    ]
  })
}

export function describeMapPlace(place: RuntimeMapPlace): string {
  return [...new Set([place.method ?? layerNames.get(place.layer), place.region ?? place.category])]
    .filter(Boolean)
    .join(' · ')
}

function atPosition(records: MapCoordinateResources[] | undefined, position: Point): MapItem[] {
  return (
    records?.find(
      ({ position: candidate }) => candidate.x === position.x && candidate.y === position.y,
    )?.items ?? []
  )
}

export function presentWorldMapDetail(
  place: RuntimeMapPlace,
  { source, chart }: SelectedPosition,
  thumbnail: (id: string) => TradeThumbnail | null,
) {
  const { latitude, longitude } = unprojectMapCoordinate(chart)
  const lat = `${latitude >= 0 ? '北緯' : '南緯'} ${Math.abs(latitude).toFixed(2)}°`
  const lon = `${longitude >= 0 ? '東經' : '西經'} ${Math.abs(longitude).toFixed(2)}°`
  const rank = place.rank ? ` · ${place.rank} 級` : ''
  const withIcon = <T extends MapItem>(item: T) => ({ ...item, icon: thumbnail(item.id) })
  return {
    id: place.id,
    title: place.name,
    layer: place.layer,
    caption: describeMapPlace(place) + rank,
    coordinates: `${lat} · ${lon}`,
    sourceCoordinates: `X ${source.x} · Y ${source.y}`,
    accuracy: accuracyLabels[chart.precision],
    languages: place.languages?.join('、') ?? '',
    belief: place.belief ?? '',
    resources: atPosition(place.resources, source),
    discoveries: atPosition(place.discoveries, source),
    goods: (place.goods ?? []).map((good) => ({
      ...withIcon(good),
      conditions: good.conditions?.join('、') ?? '',
    })),
    barters: (place.barters ?? []).map((exchange) => ({
      ...exchange,
      product: withIcon(exchange.product),
      requirements: exchange.requirements.map(withIcon),
      conditions: exchange.conditions?.join('、') ?? '',
    })),
  }
}

export type WorldMapDetailView = ReturnType<typeof presentWorldMapDetail>
