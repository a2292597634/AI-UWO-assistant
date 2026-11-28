import { describe, expect, it } from 'vitest'
import { importWorldMap } from '../../tools/import/import-world-map'
import { buildWorldMapPlaces } from '../../tools/data-pipeline/build-world-map'

const city = { x: 4397, y: 1772, pz: '37', l: ['lang10'], be: 'menu103' }
const discovery = {
  discov001: { x: 14, y: 400, xy2: ['14_400', '0_401'], m: 'fish', t2: 'disfav15', r: '4' },
  discov002: { x: 200, y: 500, d: 'discov001', m: 'clues' },
  discov003: { m: 'quest' },
}
const labels = {
  town1301: '里斯本',
  zone_37: '北海',
  lang10: '葡萄牙語',
  menu103: '基督宗教',
  discov001: '飛魚',
  disfav15: '魚類',
}
const source = `var json_city = ${JSON.stringify({ town1301: city })};\nvar discovery = ${JSON.stringify(discovery)};\nvar city_trades = {};\nvar trades = {};\nvar discov_zone = {};\nvar barter_arr = {};`
const language = `lang_js[1] = ${JSON.stringify(labels)};`

const detailsSource = [
  ['json_city', { town1301: city }],
  ['city_trades', { town1301: ['trade01', 'trade02'] }],
  [
    'trades',
    {
      trade01: { req: { town1301: { mem: 'menu41', mlv: '3', inv: '18' } } },
      trade02: { req: { town1302: { inv: '36' } } },
      trade03: {},
    },
  ],
  [
    'discovery',
    {
      village01: { x: 200, y: 500, xy2: ['0_501'], m: 'village', b: { barter01: 'village01' } },
      village02: { x: 300, y: 500, m: 'village' },
      villageFinding: { x: 200, y: 500, xy2: ['300_500'], m: 'search_vil' },
    },
  ],
  [
    'discov_zone',
    {
      '0_501': { r: ['itemres01'] },
      '300_501': { r: ['itemres01'] },
    },
  ],
  [
    'barter_arr',
    {
      barter01: {
        v: 'village01',
        t: 'trade03',
        f: 'menu175',
        s: 'menu173',
        c: { trade01: 5, trade02: 2 },
        m: 80,
        n: 3,
        nb: 1.5,
        menu237: 23,
      },
    },
  ],
]
  .map(([key, value]) => `var ${key} = ${JSON.stringify(value)};`)
  .join('\n')
const detailsLanguage = `lang_js[1] = ${JSON.stringify({
  ...labels,
  village01: '甲村',
  village02: '乙村',
  villageFinding: '中美貘',
  itemres01: '文具組',
  menu28: '投資',
  menu30: '萬',
  menu41: '商業',
  menu173: '暴風',
  menu175: '友好',
  menu237: '協商戰略',
})};`
const detailsPorts = [{ id: 'town1301', name: '里斯本港' }]
const detailsGoods = [
  { id: 'trade01', name: '鹽', salesPortIds: ['town1301'] },
  { id: 'trade02', name: '羊毛', salesPortIds: ['town1301'] },
  { id: 'trade03', name: '海螺珍珠', salesPortIds: [] },
]

describe('世界地圖資料', () => {
  it('保留可定位記錄、同項多個座標及線索對應名稱', () => {
    const data = importWorldMap(source, language)
    expect(data.places).toEqual([
      expect.objectContaining({
        id: 'town1301',
        name: '里斯本',
        region: '北海',
        languages: ['葡萄牙語'],
        belief: '基督宗教',
      }),
      expect.objectContaining({
        id: 'discov001',
        name: '飛魚',
        layer: 'fishing',
        category: '魚類',
        rank: 4,
        positions: [
          { x: 14, y: 400 },
          { x: 0, y: 401 },
        ],
      }),
      expect.objectContaining({ id: 'discov002', name: '飛魚', layer: 'sea', method: '線索' }),
    ])
  })

  it('以主資料港口名稱與販售關係生成資料，並拒絕超出海圖的座標', () => {
    const data = importWorldMap(source, language)
    const ports = [{ id: 'town1301', name: '里斯本港' }]
    const goods = [{ id: 'trade01', name: '鹽', salesPortIds: ['town1301'] }]
    expect(buildWorldMapPlaces(data, ports, goods)[0]).toMatchObject({
      name: '里斯本港',
      goods: [{ id: 'trade01', name: '鹽' }],
    })
    data.places[0].positions[0].x = 10000
    expect(() => buildWorldMapPlaces(data, ports, goods)).toThrow('town1301')
  })

  it('拒絕空地圖與無法顯示的詳情欄位', () => {
    const data = importWorldMap(source, language)
    const ports = [{ id: 'town1301', name: '里斯本' }]
    expect(() => buildWorldMapPlaces({ ...data, places: [] }, ports, [])).toThrow('缺少')
    const [port] = data.places
    Object.assign(port, { languages: '葡萄牙語' })
    expect(() => buildWorldMapPlaces(data, ports, [])).toThrow('詳情欄位')
  })

  it('展示在該港販售的交易品及其本港購買條件', () => {
    const data = importWorldMap(detailsSource, detailsLanguage)
    const [port] = buildWorldMapPlaces(data, detailsPorts, detailsGoods)
    expect(port.goods).toEqual([
      { id: 'trade01', name: '鹽', conditions: ['商業 Lv.3', '投資 18 萬'] },
      { id: 'trade02', name: '羊毛' },
    ])
  })

  it('只在與原始座標匹配的位置提供採集物及村莊發現物', () => {
    const data = importWorldMap(detailsSource, detailsLanguage)
    const places = buildWorldMapPlaces(data, detailsPorts, detailsGoods)
    expect(places[1]).toMatchObject({
      id: 'village01',
      positions: [
        { x: 200, y: 500 },
        { x: 0, y: 501 },
      ],
      resources: [{ position: { x: 0, y: 501 }, items: [{ id: 'itemres01', name: '文具組' }] }],
      discoveries: [
        { position: { x: 200, y: 500 }, items: [{ id: 'villageFinding', name: '中美貘' }] },
      ],
    })
    expect(places[2]).toMatchObject({
      id: 'village02',
      discoveries: [
        { position: { x: 300, y: 500 }, items: [{ id: 'villageFinding', name: '中美貘' }] },
      ],
    })
    expect(places[2].resources).toBeUndefined()
    expect(places[3].discoveries).toEqual([
      { position: { x: 200, y: 500 }, items: [{ id: 'villageFinding', name: '中美貘' }] },
      { position: { x: 300, y: 500 }, items: [{ id: 'villageFinding', name: '中美貘' }] },
    ])
  })

  it('以主資料交易品名稱生成村莊換貨材料、實得量與可核實條件', () => {
    const data = importWorldMap(detailsSource, detailsLanguage)
    const [, village] = buildWorldMapPlaces(data, detailsPorts, detailsGoods)
    expect(village.barters).toEqual([
      {
        id: 'barter01',
        product: { id: 'trade03', name: '海螺珍珠', quantity: 4 },
        requirements: [
          { id: 'trade01', name: '鹽', quantity: 5 },
          { id: 'trade02', name: '羊毛', quantity: 2 },
        ],
        conditions: ['友好', '暴風', '協商戰略 23'],
        maxQuantity: 80,
      },
    ])
  })

  it('略過來源沒有記錄的換貨上限', () => {
    const data = importWorldMap(detailsSource.replace('"m":80', '"m":0'), detailsLanguage)
    const [, village] = buildWorldMapPlaces(data, detailsPorts, detailsGoods)
    expect(village.barters).toHaveLength(1)
    expect(village.barters?.[0].maxQuantity).toBeUndefined()
  })

  it('拒絕將來源村莊不符的換貨方案寫進候選', () => {
    expect(() =>
      importWorldMap(detailsSource.replace('"v":"village01"', '"v":"village02"'), detailsLanguage),
    ).toThrow('barter01')
  })

  it('拒絕生成交易品主資料不存在的換貨方案', () => {
    const data = importWorldMap(detailsSource, detailsLanguage)
    expect(() => buildWorldMapPlaces(data, detailsPorts, detailsGoods.slice(0, 2))).toThrow(
      'trade03',
    )
  })

  it('拒絕生成原點座標不符的採集物清單', () => {
    const data = importWorldMap(detailsSource, detailsLanguage)
    const village = data.places[1]
    Object.assign(village, {
      resources: [{ position: { x: 200, y: 501 }, items: [{ id: 'itemres01', name: '文具組' }] }],
    })
    expect(() => buildWorldMapPlaces(data, detailsPorts, detailsGoods)).toThrow('village01')
  })
})
