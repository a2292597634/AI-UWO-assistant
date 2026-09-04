import { describe, expect, it } from 'vitest'
import { presentTradeDetail } from '../../miniprogram/subpkg-trade/presenters/trade-season-presenter'
import type {
  RuntimeTradeGoodDetail,
  RuntimeTradeReference,
} from '../../miniprogram/contracts/runtime-data'

const detail: RuntimeTradeGoodDetail = {
  id: 'trade0615',
  name: '葡萄酒',
  categoryId: '06',
  categoryName: '酒類',
  rank: 4,
  salesMode: 'fixed-port',
  salesPortIds: ['town101', 'town102'],
  peakSeasonIds: ['s4'],
  lowSeasonIds: ['s2'],
  iconId: null,
}

const reference: RuntimeTradeReference = {
  tradeTypes: [],
  ports: [
    { id: 'town101', name: '橫濱', regionName: '日本', seasonProfileId: '0' },
    { id: 'town102', name: '長崎', regionName: '日本', seasonProfileId: '1' },
  ],
  seasonProfiles: [
    {
      id: '0',
      monthSeasonIds: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's1', 's2', 's3'],
    },
    {
      id: '1',
      monthSeasonIds: ['s4', 's5', 's6', 's7', 's8', 's9', 's1', 's2', 's3', 's4', 's5', 's6'],
    },
  ],
  seasonNames: {
    s1: '春季',
    s2: '夏季',
    s3: '秋季',
    s4: '冬季',
    s5: '旱季',
    s6: '雨季',
    s7: '熱帶',
    s8: '寒帶',
    s9: '聖誕',
  },
  glyphs: {
    season: {
      s1: '🌱',
      s2: '🌞',
      s3: '🍁',
      s4: '⛄',
      s5: '🌵',
      s6: '💧',
      s7: '🥵',
      s8: '🥶',
      s9: '🎅',
    },
    status: { peak: '▲', low: '▼', normal: '🅞' },
  },
}

describe('trade season presenter', () => {
  it('combines trade metadata and a twelve-month matrix for each port', () => {
    const view = presentTradeDetail(detail, reference, 12)

    expect(view.title.name).toBe('葡萄酒')
    expect(view.title.categoryName).toBe('酒類')
    expect(view.currentGameMonth).toBe(12)
    expect(view.currentMonthLabel).toBe('12月')
    expect(view.ports).toHaveLength(detail.salesPortIds.length)
    expect(view.ports.every((port) => port.months.length === 12)).toBe(true)
    expect(view.ports[0]?.months[11]?.isCurrent).toBe(true)
    expect(view.legend.season).toContainEqual({ id: 's6', name: '雨季', glyph: '💧' })
    expect(view.legend.status).toContainEqual({ key: 'peak', name: '旺季', glyph: '▲' })
  })

  it('keeps goods without fixed sales ports in an explicit empty state', () => {
    const view = presentTradeDetail(
      { ...detail, salesMode: 'barter', salesPortIds: [] },
      reference,
      12,
    )

    expect(view.hasPorts).toBe(false)
    expect(view.ports).toEqual([])
    expect(view.emptyMessage).toBe('目前沒有固定銷售港口矩陣')
  })
})
