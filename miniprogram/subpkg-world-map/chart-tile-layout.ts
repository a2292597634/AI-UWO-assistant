import {
  MAP_HEIGHT,
  MAP_WIDTH,
  minScale,
  screenToMap,
  type Camera,
  type ViewSize,
} from './viewport'

export const DETAIL_TILE_COLUMNS = 6
export const DETAIL_TILE_ROWS = 4
export const DETAIL_TILE_MIN_ZOOM = 6
const DETAIL_TILE_EXIT_ZOOM = 5.5
const tileWidth = MAP_WIDTH / DETAIL_TILE_COLUMNS
const tileHeight = MAP_HEIGHT / DETAIL_TILE_ROWS
const boundaryTolerance = 1e-8

export interface DetailChartTile {
  key: string
  row: number
  col: number
  x: number
  y: number
  width: number
  height: number
}

export function getDetailChartTiles(
  camera: Camera,
  size: ViewSize,
  detailAlreadyVisible = false,
): DetailChartTile[] {
  const threshold = detailAlreadyVisible ? DETAIL_TILE_EXIT_ZOOM : DETAIL_TILE_MIN_ZOOM
  if (camera.scale < minScale(size) * threshold) return []
  const topLeft = screenToMap({ x: 0, y: 0 }, camera)
  const bottomRight = screenToMap({ x: size.width, y: size.height }, camera)
  const firstCol = Math.max(0, Math.floor(topLeft.x / tileWidth + boundaryTolerance))
  const firstRow = Math.max(0, Math.floor(topLeft.y / tileHeight + boundaryTolerance))
  const colEnd = Math.min(
    DETAIL_TILE_COLUMNS,
    Math.ceil(bottomRight.x / tileWidth - boundaryTolerance),
  )
  const rowEnd = Math.min(
    DETAIL_TILE_ROWS,
    Math.ceil(bottomRight.y / tileHeight - boundaryTolerance),
  )
  const tiles: DetailChartTile[] = []
  for (let row = firstRow; row < rowEnd; row++) {
    for (let col = firstCol; col < colEnd; col++) {
      tiles.push({
        key: `${row}-${col}`,
        row,
        col,
        x: col * tileWidth,
        y: row * tileHeight,
        width: tileWidth,
        height: tileHeight,
      })
    }
  }

  const center = screenToMap({ x: size.width / 2, y: size.height / 2 }, camera)
  const distance = (tile: DetailChartTile) =>
    Math.hypot(tile.x + tile.width / 2 - center.x, tile.y + tile.height / 2 - center.y)
  return tiles.sort((left, right) => distance(left) - distance(right))
}
