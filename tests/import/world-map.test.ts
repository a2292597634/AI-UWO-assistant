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
const source = `var json_city = ${JSON.stringify({ town1301: city })};\nvar discovery = ${JSON.stringify(discovery)};`
const language = `lang_js[1] = ${JSON.stringify(labels)};`

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
})
