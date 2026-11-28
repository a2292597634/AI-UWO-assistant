import { describe, expect, it } from 'vitest'
import worldMapCalibration from '../../data/master/world-map-calibration.json'
import worldMap from '../../data/master/world-map.json'
import {
  createWorldMapCalibrator,
  type WorldMapCalibration,
} from '../../tools/data-pipeline/world-map-calibration'

const places = [
  { id: 'lisbon', positions: [{ x: 4397, y: 1772 }] },
  { id: 'pacific', positions: [{ x: 24, y: 2960 }] },
]
const calibration = {
  version: 1,
  source: 'Natural Earth 1:10m v5.1.2',
  anchors: [
    { placeId: 'lisbon', longitude: -9.146812, latitude: 38.724669, reference: 'Lisbon' },
    { placeId: 'pacific', longitude: -170, latitude: 0, reference: '接縫測試點' },
  ],
}

describe('世界地圖點位校準', () => {
  it('以公開地理錨點定位可核對的港口，保留遊戲原座標', () => {
    const calibrate = createWorldMapCalibrator(places, calibration)
    const position = Object.freeze({ ...places[0].positions[0] })
    const result = calibrate(position)
    expect(result.precision).toBe('anchor')
    expect(result.x).toBeCloseTo(4416.6333, 3)
    expect(result.y).toBeCloseTo(1795.256, 0)
    expect(position).toEqual({ x: 4397, y: 1772 })
  })

  it('近鄰探索點應往港口校準方向平滑移動，無鄰近錨點時保留來源格網', () => {
    const calibrate = createWorldMapCalibrator(places, calibration)
    const nearby = calibrate({ x: 4427, y: 1782 })
    expect(nearby.precision).toBe('estimated')
    expect(nearby.x).toBeGreaterThan(4442)
    expect(nearby.x).toBeLessThan(4447)
    expect(nearby.y).toBeGreaterThan(1800)
    expect(calibrate({ x: 2000, y: 4800 })).toEqual({ x: 2000, y: 4800, precision: 'source' })
  })

  it('在圖幅左右接縫使用環狀距離與位移', () => {
    const calibrate = createWorldMapCalibrator(places, calibration)
    const seamAnchor = calibrate({ x: 24, y: 2960 })
    expect(seamAnchor).toEqual({ x: 9933, y: 2960, precision: 'anchor' })
    const atLeft = calibrate({ x: 1, y: 2960 })
    const atRight = calibrate({ x: 9971, y: 2960 })
    expect(atRight.precision).toBe('estimated')
    expect(atLeft.precision).toBe('estimated')
    expect(atRight.x).toBeGreaterThan(9900)
    expect(atLeft.x - atRight.x).toBeCloseTo(2, 0)
  })

  it('代表地理錨點只在鄰近範圍參與估算，本身也標為推算', () => {
    const calibrate = createWorldMapCalibrator(places, {
      ...calibration,
      anchors: [{ ...calibration.anchors[0], kind: 'representative' as const }],
    })
    const result = calibrate(places[0].positions[0])
    expect(result.precision).toBe('estimated')
    expect(result.x).toBeCloseTo(4416.6333, 3)
    expect(calibrate({ x: 4597, y: 1772 })).toEqual({ x: 4597, y: 1772, precision: 'source' })
  })

  it('拒絕未知、重複及無效錨點', () => {
    const [lisbon] = calibration.anchors
    for (const anchors of [
      [{ ...lisbon, placeId: 'unknown' }],
      [lisbon, lisbon],
      [{ ...lisbon, latitude: 91 }],
      [{ ...lisbon, latitude: 89 }],
      [{ ...lisbon, longitude: -181 }],
    ]) {
      expect(() => createWorldMapCalibrator(places, { ...calibration, anchors })).toThrow(
        /錨點.*(unknown|lisbon)/,
      )
    }
  })

  it('拒絕同一遊戲座標上的不同地理錨點，包括圖幅接縫的等價座標', () => {
    const seamPlaces = [
      { id: 'lisbon', positions: [{ x: 0, y: 2960 }] },
      { id: 'pacific', positions: [{ x: 9972, y: 2960 }] },
    ]
    expect(() => createWorldMapCalibrator(seamPlaces, calibration)).toThrow(/錨點.*pacific/)
  })

  it('標出格式不完整或遊戲原點無效的錨點', () => {
    const malformed = {
      ...calibration,
      anchors: [null] as unknown as typeof calibration.anchors,
    }
    expect(() => createWorldMapCalibrator(places, malformed)).toThrow(/錨點/)
    expect(() =>
      createWorldMapCalibrator([{ id: 'lisbon', positions: [{ x: 0, y: 0 }] }], {
        ...calibration,
        anchors: calibration.anchors.slice(0, 1),
      }),
    ).toThrow(/錨點.*lisbon/)
  })

  it.each([
    ['馬賽', 4818.83, 1627.12],
    ['熱那亞', 4917.36, 1584.17],
    ['雅典', 5327.36, 1821.0],
    ['江戶', 8541.06, 1900.56],
    ['哈瓦那', 2388.46, 2301.03],
    ['開普敦', 5180.6, 3959.76],
    ['烏納拉斯卡', 57.07, 1182.01],
  ])('實際主資料中的 %s 對齊各地公開地理錨點', (name, x, y) => {
    const calibrate = createWorldMapCalibrator(
      worldMap.places,
      worldMapCalibration as WorldMapCalibration,
    )
    const place = worldMap.places.find((candidate) => candidate.name === name)!
    const point = calibrate(place.positions[0])
    expect(point.precision).toBe('anchor')
    expect(point.x).toBeCloseTo(x, 1)
    expect(point.y).toBeCloseTo(y, 1)
  })

  it.each([
    ['town20112', 8675.88, 2583.97],
    ['town20113', 247.17, 2336.33],
    ['town1105', 4201.41, 2002.8],
    ['town1104', 3973.35, 1857.71],
    ['town14105', 6166.46, 2606.66],
    ['town12109', 4016.14, 2542.1],
    ['discov01c025', 2876.16, 2013.67],
    ['discov19cT118', 9789.5, 3560.34],
    ['discov01a023', 8679.66, 2584.51],
    ['discov06c010', 8679.66, 2584.51],
  ])('島嶼代表點 %s 靠近可核對的地理位置並保留推算標記', (id, x, y) => {
    const calibrate = createWorldMapCalibrator(
      worldMap.places,
      worldMapCalibration as WorldMapCalibration,
    )
    const place = worldMap.places.find((candidate) => candidate.id === id)!
    const point = calibrate(place.positions[0])
    expect(point.precision).toBe('estimated')
    expect(point.x).toBeCloseTo(x, 1)
    expect(point.y).toBeCloseTo(y, 1)
  })
})
