import type { Point } from './viewport'

export const MAP_LAYERS = [
  { id: 'port', label: '港口' },
  { id: 'land', label: '陸地' },
  { id: 'sea', label: '海上' },
  { id: 'village', label: '村莊' },
  { id: 'fishing', label: '釣魚' },
] as const

export type MapLayer = (typeof MAP_LAYERS)[number]['id']

export type MapChartPosition = Point & { precision: 'anchor' | 'estimated' | 'source' }

export interface MapItem {
  id: string
  name: string
}

export interface MapCoordinateResources {
  position: Point
  items: MapItem[]
}

export interface MapPlace {
  id: string
  name: string
  layer: MapLayer
  positions: Point[]
  region?: string
  languages?: string[]
  belief?: string
  category?: string
  method?: string
  rank?: number
  resources?: MapCoordinateResources[]
  discoveries?: MapCoordinateResources[]
}

export interface MapPortGood extends MapItem {
  conditions?: string[]
}

export interface MapTradeQuantityReference {
  id: string
  quantity: number
}

export type MapTradeQuantity = MapItem & MapTradeQuantityReference

export interface MapBarterReference {
  id: string
  product: MapTradeQuantityReference
  requirements: MapTradeQuantityReference[]
  conditions?: string[]
  maxQuantity?: number
}

export interface MapBarter extends MapBarterReference {
  product: MapTradeQuantity
  requirements: MapTradeQuantity[]
}

export interface MasterMapPlace extends MapPlace {
  purchaseConditions?: Record<string, string[]>
  barters?: MapBarterReference[]
}

export interface WorldMapData {
  sourceSnapshot: string
  places: MasterMapPlace[]
}

export interface RuntimeMapPlace extends MapPlace {
  chartPositions?: MapChartPosition[]
  goods?: MapPortGood[]
  barters?: MapBarter[]
}
