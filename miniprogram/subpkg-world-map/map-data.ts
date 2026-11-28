import type { Point } from './viewport'

export const MAP_LAYERS = [
  { id: 'port', label: '港口' },
  { id: 'land', label: '陸地' },
  { id: 'sea', label: '海上' },
  { id: 'village', label: '村莊' },
  { id: 'fishing', label: '釣魚' },
] as const

export type MapLayer = (typeof MAP_LAYERS)[number]['id']

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
}

export interface WorldMapData {
  sourceSnapshot: string
  places: MapPlace[]
}

export interface RuntimeMapPlace extends MapPlace {
  goods?: Array<{ id: string; name: string }>
}
