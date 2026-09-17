import { describe, expect, it } from 'vitest'
import { queryTradeGoods } from '../../miniprogram/subpkg-trade/domain/trade-query'
import type { RuntimeTradeGoodIndexEntry } from '../../miniprogram/contracts/runtime-data'

const entries: RuntimeTradeGoodIndexEntry[] = [
  {
    id: 'trade0615',
    name: '葡萄酒',
    categoryId: '06',
    categoryName: '酒類',
    rank: 4,
    salesMode: 'fixed-port',
    salesPortCount: 2,
    peakSeasonIds: ['s4'],
    lowSeasonIds: ['s2'],
    searchAliases: ['葡萄酒', 'wine'],
    iconPath: '/subpkg-assets-0/imgs/trade_trade0615.png',
  },
  {
    id: 'trade0201',
    name: '胡椒',
    categoryId: '15',
    categoryName: '辛香料',
    rank: 4,
    salesMode: 'barter',
    salesPortCount: 0,
    peakSeasonIds: ['s1'],
    lowSeasonIds: ['s3'],
    searchAliases: ['胡椒', 'pepper'],
    iconPath: '/subpkg-assets-0/imgs/trade_trade0201.png',
  },
]

describe('queryTradeGoods', () => {
  it('returns the stable full index for an empty search', () => {
    expect(queryTradeGoods(entries, { searchText: '  ', categoryId: null })).toEqual(entries)
  })

  it('matches names and aliases case-insensitively', () => {
    expect(queryTradeGoods(entries, { searchText: 'WINE', categoryId: null })).toEqual([entries[0]])
  })

  it('combines category and text filters without hiding barter goods', () => {
    expect(queryTradeGoods(entries, { searchText: '', categoryId: '15' })).toEqual([entries[1]])
    expect(queryTradeGoods(entries, { searchText: '胡椒', categoryId: null })).toEqual([entries[1]])
  })
})
