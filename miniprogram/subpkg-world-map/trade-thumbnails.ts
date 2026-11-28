interface TradeIconAtlas {
  columns: number
  rows: number
  cells: Record<string, [number, number, number] | undefined>
}

export interface TradeThumbnail {
  path: string
  style: string
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const atlas = require('./generated/trade-icons') as TradeIconAtlas
const TRADE_THUMBNAIL_SIZE = 64

export function getTradeThumbnail(id: string): TradeThumbnail | null {
  const cell = atlas.cells[id]
  if (!cell) return null

  const [sheet, col, row] = cell
  const size = TRADE_THUMBNAIL_SIZE
  return {
    path: `/subpkg-world-map/assets/trade-atlas/trade-icons-${sheet}.png`,
    style: `width:${size * atlas.columns}rpx;height:${size * atlas.rows}rpx;left:${-size * col}rpx;top:${-size * row}rpx;`,
  }
}
