import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  MapBarterReference,
  MapCoordinateResources,
  MapItem,
  MapLayer,
  MasterMapPlace,
  WorldMapData,
} from '../../miniprogram/subpkg-world-map/map-data'
import { MAP_HEIGHT, MAP_WIDTH, type Point } from '../../miniprogram/subpkg-world-map/viewport'
import { extractJsAssignment, parseLanguageMap } from './parse-languages'

const SNAPSHOT = 'voyage-tw-2026052501-trade-20260904'

interface SourcePort {
  x?: string | number
  y?: string | number
  pz?: string
  l?: string[]
  be?: string
}

interface SourceDiscovery extends SourcePort {
  xy2?: string[]
  m?: string
  t2?: string
  d?: string
  r?: string
  b?: Record<string, string>
}

interface SourcePurchaseRequirements {
  mem?: string
  mlv?: string
  job?: string
  job_n?: string
  boss?: string
  inv?: string
  exc?: string
  note?: string
}

interface SourceTrade {
  exc?: string
  req?: Record<string, SourcePurchaseRequirements | []>
}

const barterSkillKeys = ['menu235', 'menu236', 'menu237', 'menu238'] as const

type SourceBarter = Partial<Record<(typeof barterSkillKeys)[number], number>> & {
  v: string
  t: string
  f: string | null
  s: string | null
  c: Record<string, number>
  m: number
  n: number
  nb: number
}

const methods: Record<string, [MapLayer, string]> = {
  search: ['land', '陸地探索'],
  search_sea: ['sea', '海上探索'],
  village: ['village', '村莊'],
  search_vil: ['village', '村莊探索'],
  fish: ['fishing', '釣魚'],
  quest: ['sea', '委託'],
  chronicle: ['sea', '年代記'],
  clues: ['sea', '線索'],
}

const positionKey = ({ x, y }: Point) => `${x}_${y}`

function getPositions(source: SourceDiscovery): Point[] {
  const pairs = [[source.x, source.y], ...(source.xy2 ?? []).map((pair) => pair.split('_'))]
  const positions = new Map<string, Point>()
  for (const [a, b] of pairs) {
    if (a === '' || b === '') continue
    const x = Number(a)
    const y = Number(b)
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x > MAP_WIDTH ||
      y < 0 ||
      y > MAP_HEIGHT ||
      (x === 0 && y === 0)
    )
      continue
    const position = { x, y }
    positions.set(positionKey(position), position)
  }
  return [...positions.values()]
}

function zipCoordinateResources(
  positions: Point[],
  byPosition: ReadonlyMap<string, MapItem[]>,
): MapCoordinateResources[] | undefined {
  const groups = positions.flatMap((position) => {
    const items = byPosition.get(positionKey(position))
    return items?.length ? [{ position, items }] : []
  })
  return groups.length ? groups : undefined
}

export function importWorldMap(json: string, language: string): WorldMapData {
  const localized = parseLanguageMap([language])
  const label = (id?: string) =>
    id ? localized[id]?.replace(/<br\s*\/?\s*>/gi, ' ').trim() : undefined
  const requiredLabel = (id: string) => {
    const name = label(id)
    if (!name) throw new Error(`世界地圖詳情缺少名稱：${id}`)
    return name
  }
  const ports = extractJsAssignment<Record<string, SourcePort>>(json, 'json_city')
  const discoveries = extractJsAssignment<Record<string, SourceDiscovery>>(json, 'discovery')
  const cityTrades = extractJsAssignment<Record<string, string[]>>(json, 'city_trades')
  const trades = extractJsAssignment<Record<string, SourceTrade>>(json, 'trades')
  const zones = extractJsAssignment<Record<string, { r?: string[] }>>(json, 'discov_zone')
  const barters = extractJsAssignment<Record<string, SourceBarter>>(json, 'barter_arr')
  const resourcesAt = new Map(
    Object.entries(zones).flatMap(([key, zone]) =>
      zone.r?.length ? [[key, zone.r.map((id) => ({ id, name: requiredLabel(id) }))] as const] : [],
    ),
  )
  const villageDiscoveriesAt = new Map<string, MapItem[]>()
  for (const [id, record] of Object.entries(discoveries)) {
    if (record.m !== 'search_vil') continue
    for (const position of getPositions(record)) {
      const key = positionKey(position)
      const items = villageDiscoveriesAt.get(key) ?? []
      items.push({ id, name: requiredLabel(id) })
      villageDiscoveriesAt.set(key, items)
    }
  }
  const importedBarters = new Set<string>()
  const places: MasterMapPlace[] = []
  for (const [id, port] of Object.entries(ports)) {
    const name = label(id)
    const positions = getPositions(port)
    if (!name || !positions.length) throw new Error(`港口資料缺少名稱或座標：${id}`)
    const purchaseConditions: Record<string, string[]> = {}
    for (const tradeId of cityTrades[id] ?? []) {
      const trade = trades[tradeId]
      if (!trade) throw new Error(`港口販售貨表未對應交易品：${id} / ${tradeId}`)
      const conditions: string[] = []
      if (trade.exc === 'guild') conditions.push(requiredLabel('menu146'))
      if (trade.exc === 'zone') conditions.push(requiredLabel('menu147'))
      const requirements = trade.req?.[id]
      if (requirements && !Array.isArray(requirements)) {
        const { mem, mlv, job, job_n: jobCount, boss, inv, exc, note } = requirements
        if (mem && mlv) conditions.push(`${requiredLabel(mem)} Lv.${mlv}`)
        if (job)
          conditions.push(`${requiredLabel(job)}${Number(jobCount) > 1 ? ` ×${jobCount}` : ''}`)
        if (boss) conditions.push(requiredLabel(boss))
        if (inv)
          conditions.push(
            `${requiredLabel('menu28')} ${label(inv) ?? inv} ${requiredLabel('menu30')}`,
          )
        if (exc) conditions.push(requiredLabel(exc))
        if (note) conditions.push(requiredLabel(note))
      }
      if (conditions.length) purchaseConditions[tradeId] = [...new Set(conditions)]
    }
    places.push({
      id,
      name,
      positions,
      layer: 'port',
      region: label(`zone_${port.pz}`),
      languages: port.l?.map(label).filter((name): name is string => Boolean(name)),
      belief: label(port.be),
      purchaseConditions: Object.keys(purchaseConditions).length ? purchaseConditions : undefined,
    })
  }
  for (const [id, record] of Object.entries(discoveries)) {
    const positions = getPositions(record)
    if (!positions.length) continue
    const name = label(id) ?? label(record.d)
    if (!name) throw new Error(`探索點缺少名稱：${id}`)
    const method = record.m ?? 'search_sea'
    if (!Object.prototype.hasOwnProperty.call(methods, method))
      throw new Error(`未知探索方式：${id} / ${method}`)
    const [layer, methodLabel] = methods[method]
    const villageBarters: MapBarterReference[] = []
    for (const [barterId, villageId] of Object.entries(record.b ?? {})) {
      const barter = barters[barterId]
      if (!barter || method !== 'village' || villageId !== id || barter.v !== id) {
        throw new Error(`換貨方案的來源村莊不符：${id} / ${barterId}`)
      }
      const { t, f, s, c, m, n, nb } = barter
      // 來源地圖以向下取整的 n × nb 顯示每次基本換得量，m 為明載的單次上限。
      const product = { id: t, quantity: Math.floor(n * nb) }
      const requirements = Object.entries(c).map(([id, quantity]) => ({ id, quantity }))
      const conditions = [f, s].flatMap((key) => (key ? [requiredLabel(key)] : []))
      for (const key of barterSkillKeys) {
        const value = barter[key]
        if (value !== undefined) conditions.push(`${requiredLabel(key)} ${value}`)
      }
      villageBarters.push({
        id: barterId,
        product,
        requirements,
        conditions: conditions.length ? conditions : undefined,
        maxQuantity: m > 0 ? m : undefined,
      })
      importedBarters.add(barterId)
    }
    places.push({
      id,
      name,
      positions,
      layer,
      method: methodLabel,
      category: label(record.t2),
      rank: Number(record.r) || undefined,
      resources: zipCoordinateResources(positions, resourcesAt),
      discoveries:
        layer === 'village' ? zipCoordinateResources(positions, villageDiscoveriesAt) : undefined,
      barters: villageBarters.length ? villageBarters : undefined,
    })
  }
  const unplacedBarters = Object.keys(barters).filter((id) => !importedBarters.has(id))
  if (unplacedBarters.length)
    throw new Error(`換貨方案缺少可定位村莊：${unplacedBarters.join('、')}`)
  return { sourceSnapshot: SNAPSHOT, places }
}

if (process.argv[1]?.endsWith('import-world-map.ts')) {
  const output = process.argv[2]
  if (!output) throw new Error('請提供新候選 JSON 的輸出位置')
  const source = join('archive', SNAPSHOT, 'raw-data')
  const data = importWorldMap(
    readFileSync(join(source, 'json.js'), 'utf8'),
    readFileSync(join(source, 'lang_1.js'), 'utf8'),
  )
  writeFileSync(output, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
  console.log(`寫入 ${data.places.length} 筆有座標的港口與探索資料`)
}
