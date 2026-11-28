import { describe, expect, it } from 'vitest'
import {
  fitMap,
  focusMap,
  getMapMarkers,
  mapToScreen,
  panMap,
  projectMapCoordinate,
  unprojectMapCoordinate,
  zoomMap,
} from '../../miniprogram/subpkg-world-map/viewport'

const size = { width: 390, height: 510 }

describe('世界地圖視窗', () => {
  it('用相同的投影對齊海岸與港口，並處理跨越地圖接縫的經度', () => {
    const lisbon = projectMapCoordinate(-9.15, 38.72)
    expect(lisbon.x).toBeCloseTo(4416.55, 1)
    expect(lisbon.y).toBeCloseTo(1795.05, 1)
    expect(projectMapCoordinate(-170, 0).x).toBeCloseTo(projectMapCoordinate(190, 0).x)
    expect(unprojectMapCoordinate(lisbon).latitude).toBeCloseTo(38.72)
    expect(unprojectMapCoordinate(lisbon).longitude).toBeCloseTo(-9.15)
  })

  it('維持雙指中心對應的圖上位置，並在縮放後拖動和限制邊界', () => {
    const initial = fitMap(size)
    const zoomed = zoomMap(initial, 5, { x: 195, y: 255 }, { x: 200, y: 260 }, size)
    const origin = { x: 4986, y: 2943 }
    expect(mapToScreen(origin, zoomed)).toEqual({ x: 200, y: expect.closeTo(260) })
    const dragged = panMap(zoomed, { x: -30, y: 10 }, size)
    expect(mapToScreen(origin, dragged)).toEqual({ x: 170, y: expect.closeTo(270) })
    expect(panMap(zoomed, { x: 10000, y: 10000 }, size)).toMatchObject({ x: 0, y: 0 })
    expect(zoomMap(dragged, 0.001, origin, origin, size)).toEqual(initial)
  })

  it('聚合點位並保留重合的點供選擇，排除視窗外的點', () => {
    const point = { x: 4400, y: 1800 }
    const camera = focusMap(fitMap(size), point, 12, size)
    const markers = getMapMarkers(
      [
        { ...point, id: 'port-a' },
        { ...point, id: 'port-b' },
        { x: 12, y: 13, id: 'port-c' },
      ],
      camera,
      size,
    )
    expect(markers).toEqual([{ x: 195, y: expect.closeTo(255), ids: ['port-a', 'port-b'] }])
  })
})
