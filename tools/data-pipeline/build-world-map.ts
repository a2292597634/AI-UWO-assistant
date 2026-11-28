import {
  MAP_LAYERS,
  type MapCoordinateResources,
  type MapPortGood,
  type MapTradeQuantity,
  type MapTradeQuantityReference,
  type RuntimeMapPlace,
  type WorldMapData,
} from '../../miniprogram/subpkg-world-map/map-data'
import { MAP_HEIGHT, MAP_WIDTH, type Point } from '../../miniprogram/subpkg-world-map/viewport'

const isNonEmptyText = (value: unknown): value is string =>
  typeof value === 'string' && Boolean(value.trim())

const isTextList = (values: unknown): values is string[] =>
  Array.isArray(values) && values.length > 0 && values.every(isNonEmptyText)

const isQuantity = (value: number) => Number.isSafeInteger(value) && value > 0

function isCoordinateResourceList(
  groups: MapCoordinateResources[] | undefined,
  positions: Point[],
) {
  return (
    groups === undefined ||
    (Array.isArray(groups) &&
      groups.every(
        (group) =>
          group?.position &&
          positions.some(({ x, y }) => x === group.position.x && y === group.position.y) &&
          Array.isArray(group.items) &&
          group.items.length > 0 &&
          group.items.every((item) => isNonEmptyText(item?.id) && isNonEmptyText(item?.name)),
      ))
  )
}

export function buildWorldMapPlaces(
  data: WorldMapData,
  ports: readonly { id: string; name: string }[],
  tradeGoods: readonly { id: string; name: string; salesPortIds: string[] }[],
): RuntimeMapPlace[] {
  if (
    !data ||
    typeof data.sourceSnapshot !== 'string' ||
    !data.sourceSnapshot.trim() ||
    !Array.isArray(data.places) ||
    !data.places.length
  ) {
    throw new Error('世界地圖資料缺少來源快照或點位')
  }
  const names = new Map(ports.map(({ id, name }) => [id, name]))
  const tradeNames = new Map(tradeGoods.map(({ id, name }) => [id, name]))
  const goodsByPort = new Map<string, MapPortGood[]>()
  for (const { id, name, salesPortIds } of tradeGoods) {
    for (const portId of salesPortIds) {
      const goods = goodsByPort.get(portId) ?? []
      goods.push({ id, name })
      goodsByPort.set(portId, goods)
    }
  }

  const ids = new Set<string>()
  const barterIds = new Set<string>()
  const layers = new Set(MAP_LAYERS.map(({ id }) => id))
  const resolveTrade = (trade: MapTradeQuantityReference, barterId: string): MapTradeQuantity => {
    const name = tradeNames.get(trade?.id)
    if (!name || !isQuantity(trade.quantity)) {
      throw new Error(`換貨方案的交易品或數量無效：${barterId} / ${trade?.id}`)
    }
    return { ...trade, name }
  }
  return data.places.map(({ purchaseConditions, barters, ...place }) => {
    const { id, name, layer, positions } = place
    if (
      typeof id !== 'string' ||
      !id.trim() ||
      ids.has(id) ||
      typeof name !== 'string' ||
      !name.trim() ||
      !layers.has(layer) ||
      !Array.isArray(positions) ||
      !positions.length ||
      positions.some(
        ({ x, y }) =>
          !Number.isInteger(x) ||
          !Number.isInteger(y) ||
          x < 0 ||
          x > MAP_WIDTH ||
          y < 0 ||
          y > MAP_HEIGHT ||
          (x === 0 && y === 0),
      )
    ) {
      throw new Error(`無效的世界地圖點位：${id}`)
    }
    const { region, category, method, belief, languages, rank, resources, discoveries } = place
    if (
      [region, category, method, belief].some(
        (value) => value !== undefined && typeof value !== 'string',
      ) ||
      (languages !== undefined &&
        (!Array.isArray(languages) || languages.some((value) => typeof value !== 'string'))) ||
      (rank !== undefined && (!Number.isInteger(rank) || rank < 1)) ||
      !isCoordinateResourceList(resources, positions) ||
      !isCoordinateResourceList(discoveries, positions) ||
      (discoveries !== undefined && layer !== 'village')
    ) {
      throw new Error(`無效的世界地圖詳情欄位：${id}`)
    }
    ids.add(id)
    if (barters !== undefined) {
      if (layer !== 'village' || !Array.isArray(barters)) {
        throw new Error(`無效的世界地圖換貨方案：${id}`)
      }
      return {
        ...place,
        barters: barters.map((barter) => {
          if (
            !isNonEmptyText(barter?.id) ||
            barterIds.has(barter.id) ||
            !Array.isArray(barter.requirements) ||
            !barter.requirements.length ||
            (barter.conditions !== undefined && !isTextList(barter.conditions)) ||
            (barter.maxQuantity !== undefined && !isQuantity(barter.maxQuantity))
          ) {
            throw new Error(`無效的世界地圖換貨方案：${id} / ${barter?.id}`)
          }
          barterIds.add(barter.id)
          return {
            ...barter,
            product: resolveTrade(barter.product, barter.id),
            requirements: barter.requirements.map((trade) => resolveTrade(trade, barter.id)),
          }
        }),
      }
    }
    if (layer !== 'port') return place
    const portName = names.get(id)
    if (!portName) throw new Error(`世界地圖港口未對應交易品港口資料：${id}`)
    const goods = goodsByPort.get(id) ?? []
    if (purchaseConditions === undefined) return { ...place, name: portName, goods }
    if (
      !purchaseConditions ||
      typeof purchaseConditions !== 'object' ||
      Array.isArray(purchaseConditions) ||
      Object.entries(purchaseConditions).some(
        ([id, conditions]) => !isTextList(conditions) || !goods.some((good) => good.id === id),
      )
    ) {
      throw new Error(`港口購買條件未對應販售貨表：${id}`)
    }
    return {
      ...place,
      name: portName,
      goods: goods.map((good) => {
        const conditions = purchaseConditions[good.id]
        return conditions ? { ...good, conditions } : good
      }),
    }
  })
}
