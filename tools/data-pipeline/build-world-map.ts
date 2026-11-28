import {
  MAP_LAYERS,
  type RuntimeMapPlace,
  type WorldMapData,
} from '../../miniprogram/subpkg-world-map/map-data'
import { MAP_HEIGHT, MAP_WIDTH } from '../../miniprogram/subpkg-world-map/viewport'

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
  const goodsByPort = new Map<string, Array<{ id: string; name: string }>>()
  for (const { id, name, salesPortIds } of tradeGoods) {
    for (const portId of salesPortIds) {
      const goods = goodsByPort.get(portId) ?? []
      goods.push({ id, name })
      goodsByPort.set(portId, goods)
    }
  }

  const ids = new Set<string>()
  const layers = new Set(MAP_LAYERS.map(({ id }) => id))
  return data.places.map((place) => {
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
    const { region, category, method, belief, languages, rank } = place
    if (
      [region, category, method, belief].some(
        (value) => value !== undefined && typeof value !== 'string',
      ) ||
      (languages !== undefined &&
        (!Array.isArray(languages) || languages.some((value) => typeof value !== 'string'))) ||
      (rank !== undefined && (!Number.isInteger(rank) || rank < 1))
    ) {
      throw new Error(`無效的世界地圖詳情欄位：${id}`)
    }
    ids.add(id)
    if (layer !== 'port') return place
    const portName = names.get(id)
    if (!portName) throw new Error(`世界地圖港口未對應交易品港口資料：${id}`)
    return { ...place, name: portName, goods: goodsByPort.get(id) ?? [] }
  })
}
