import { expect, it } from 'vitest'
import {
  getWorldMapLayer,
  presentWorldMapDetail,
  selectWorldMapPosition,
} from '../../miniprogram/subpkg-world-map/detail-presenter'
import type { RuntimeMapPlace } from '../../miniprogram/subpkg-world-map/map-data'

const site: RuntimeMapPlace = {
  id: 'village',
  name: '百慕達島的村莊',
  layer: 'village',
  method: '村莊',
  positions: [
    { x: 100, y: 300 },
    { x: 500, y: 330 },
  ],
  chartPositions: [
    { x: 170, y: 280, precision: 'estimated' },
    { x: 460, y: 355, precision: 'source' },
  ],
  discoveries: [
    { position: { x: 100, y: 300 }, items: [{ id: 'discov-a', name: '中美貘' }] },
    { position: { x: 500, y: 330 }, items: [{ id: 'discov-b', name: '扇頭鷲' }] },
  ],
  barters: [
    {
      id: 'barter-a',
      product: { id: 'trade01', name: '海螺珍珠', quantity: 20 },
      requirements: [{ id: 'trade02', name: '珊瑚', quantity: 5 }],
      conditions: ['暴風'],
    },
  ],
}

it('以校準座標命中後使用對應的原始位置查找村莊發現物', () => {
  const selected = selectWorldMapPosition(site, { x: 169, y: 279 })
  const thumbnail = { path: '/thumb.png', style: 'left:0;' }
  const detail = presentWorldMapDetail(site, selected, () => thumbnail)
  expect(detail.sourceCoordinates).toBe('X 100 · Y 300')
  expect(detail.accuracy).toBe('推算位置')
  expect(detail.discoveries).toEqual([{ id: 'discov-a', name: '中美貘' }])
  expect(detail.barters[0]).toMatchObject({
    product: { id: 'trade01', name: '海螺珍珠', quantity: 20, icon: thumbnail },
    requirements: [{ id: 'trade02', name: '珊瑚', quantity: 5, icon: thumbnail }],
    conditions: '暴風',
  })
})

it('共址探索物由村莊卡展示，其他位置的探索點仍可單獨定位', () => {
  const discovery: RuntimeMapPlace = {
    id: 'discov-a',
    name: '中美貘',
    layer: 'village',
    method: '村莊探索',
    positions: [
      { x: 100, y: 300 },
      { x: 410, y: 380 },
    ],
    chartPositions: [
      { x: 170, y: 280, precision: 'estimated' },
      { x: 422, y: 390, precision: 'source' },
    ],
  }
  expect(getWorldMapLayer([site, discovery], 'village')).toEqual([
    site,
    {
      ...discovery,
      positions: [{ x: 410, y: 380 }],
      chartPositions: [{ x: 422, y: 390, precision: 'source' }],
    },
  ])
})
