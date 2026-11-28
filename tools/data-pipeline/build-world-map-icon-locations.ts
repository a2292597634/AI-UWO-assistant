import { resolveTradeIconImageId } from '../asset-pipeline/trade-icons'
import type { CanonicalTradeGood } from '../import/types'

export const MAP_ICON_ATLAS_COLUMNS = 12
export const MAP_ICON_ATLAS_ROWS = 12
export const MAP_ICON_ATLAS_CAPACITY = MAP_ICON_ATLAS_COLUMNS * MAP_ICON_ATLAS_ROWS

/** 分別記錄圖集編號、列及行。 */
type Cell = [number, number, number]

export function buildWorldMapIconLocations(
  goods: readonly Pick<CanonicalTradeGood, 'id' | 'iconId' | 'sourceRefs'>[],
  imageIds: readonly string[],
): Record<string, Cell> {
  if (!Array.isArray(imageIds) || imageIds.some((id) => !/^trade[A-Za-z0-9]+$/.test(id))) {
    throw new Error('世界地圖交易品圖集包含無效圖檔 ID')
  }
  const cells = new Map(imageIds.map((id, index) => [id, index]))
  if (cells.size !== imageIds.length) throw new Error('世界地圖交易品圖集包含重複圖檔')
  const locations: Record<string, Cell> = {}
  for (const trade of goods) {
    const index = cells.get(resolveTradeIconImageId(trade))
    if (index === undefined) continue
    const slot = index % MAP_ICON_ATLAS_CAPACITY
    locations[trade.id] = [
      Math.floor(index / MAP_ICON_ATLAS_CAPACITY),
      slot % MAP_ICON_ATLAS_COLUMNS,
      Math.floor(slot / MAP_ICON_ATLAS_COLUMNS),
    ]
  }
  return locations
}
