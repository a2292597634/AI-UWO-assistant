import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MapLayer, MapPlace, WorldMapData } from '../../miniprogram/subpkg-world-map/map-data'
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
    positions.set(`${x}_${y}`, { x, y })
  }
  return [...positions.values()]
}

export function importWorldMap(json: string, language: string): WorldMapData {
  const localized = parseLanguageMap([language])
  const label = (id?: string) =>
    id ? localized[id]?.replace(/<br\s*\/?\s*>/gi, ' ').trim() : undefined
  const ports = extractJsAssignment<Record<string, SourcePort>>(json, 'json_city')
  const discoveries = extractJsAssignment<Record<string, SourceDiscovery>>(json, 'discovery')
  const places: MapPlace[] = []
  for (const [id, port] of Object.entries(ports)) {
    const name = label(id)
    const positions = getPositions(port)
    if (!name || !positions.length) throw new Error(`港口資料缺少名稱或座標：${id}`)
    places.push({
      id,
      name,
      positions,
      layer: 'port',
      region: label(`zone_${port.pz}`),
      languages: port.l?.map(label).filter((name): name is string => Boolean(name)),
      belief: label(port.be),
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
    places.push({
      id,
      name,
      positions,
      layer,
      method: methodLabel,
      category: label(record.t2),
      rank: Number(record.r) || undefined,
    })
  }
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
