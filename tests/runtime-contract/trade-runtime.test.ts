import { describe, expect, it } from 'vitest'
import {
  getTradeGoods,
  getTradeReference,
} from '../../miniprogram/subpkg-trade/runtime/trade-data-store'
import { getTradeDetail } from '../../miniprogram/subpkg-trade/runtime/trade-detail-store'

describe('貿易品 runtime contract', () => {
  it('exposes the complete local index and reference data through stores', () => {
    const goods = getTradeGoods()
    const reference = getTradeReference()
    const wine = goods.find((item) => item.id === 'trade0615')

    expect(goods).toHaveLength(656)
    expect(wine).toMatchObject({
      name: '葡萄酒',
      categoryId: '06',
      salesMode: 'fixed-port',
    })
    expect(reference.ports).toHaveLength(224)
    expect(reference.seasonProfiles).toHaveLength(10)
    expect(reference.glyphs.status).toEqual({ peak: '▲', low: '▼', normal: '🅞' })
  })

  it('loads a complete trade detail from the detail subpackage store', () => {
    const wine = getTradeDetail('trade0615')

    expect(wine).toMatchObject({
      id: 'trade0615',
      name: '葡萄酒',
      salesPortIds: ['town2201', 'town2203'],
    })
    expect(getTradeDetail('trade-does-not-exist')).toBeNull()
  })
})
