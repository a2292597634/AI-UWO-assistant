import { describe, expect, it } from 'vitest'
import { transformTrades } from '../../tools/import/transform-trades'
import type { SourceTradeBundle } from '../../tools/import/trade-types'

const fixture: SourceTradeBundle = {
  trades: {
    trade0615: {
      id: 'trade0615',
      name: '葡萄酒',
      typeId: '06',
      cityIds: ['town102', 'town101'],
      rank: 4,
      barter: false,
      special: false,
      noSeasonalVariation: false,
      iconId: null,
    },
    trade9999: {
      id: 'trade9999',
      name: '木材',
      typeId: '05',
      cityIds: [],
      rank: 3,
      barter: true,
      special: false,
      noSeasonalVariation: false,
      iconId: null,
    },
  },
  cityTrades: {
    town101: ['trade0615'],
    town102: ['trade0615'],
  },
  cities: {
    town101: { id: 'town101', nameKey: 'town101', seasonProfileId: '0' },
    town102: { id: 'town102', nameKey: 'town102', seasonProfileId: '0' },
  },
  tradeTypes: {
    '06': { peakSeasonIds: ['s4', 's5'], lowSeasonIds: ['s2', 's6'] },
    '05': { peakSeasonIds: ['s6'], lowSeasonIds: [] },
  },
  seasonProfiles: {
    '0': ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's1', 's2', 's3'],
  },
  glyphs: {
    season: { s1: '🌱', s2: '🌞', s3: '🍁', s4: '⛄', s5: '🌵', s6: '💧' },
    status: { peak: '▲', low: '▼', normal: '🅞' },
  },
  languageMap: {
    trade0615: '葡萄酒',
    trade9999: '木材',
    town101: '橫濱',
    town102: '長崎',
    tradetype06: '酒類',
    tradetype05: '雜貨',
    seasons6: '雨季',
  },
}

describe('transformTrades', () => {
  it('creates canonical trade goods and gives reverse city_trades priority', () => {
    const result = transformTrades(fixture)

    expect(result.dataset.tradeGoods).toContainEqual(
      expect.objectContaining({
        id: 'trade0615',
        name: '葡萄酒',
        categoryId: '06',
        salesMode: 'fixed-port',
        salesPortIds: ['town101', 'town102'],
      }),
    )
    expect(result.dataset.seasonNames.s6).toBe('雨季')
    expect(result.dataset.ports).toContainEqual(
      expect.objectContaining({
        id: 'town101',
        name: '橫濱',
        seasonProfileId: '0',
      }),
    )
    expect(result.dataset.tradeGoods).toContainEqual(
      expect.objectContaining({
        id: 'trade9999',
        salesMode: 'barter',
        salesPortIds: [],
      }),
    )
  })

  it('records a warning when source city lists disagree with city_trades', () => {
    const result = transformTrades({
      ...fixture,
      cityTrades: {
        town101: ['trade0615'],
      },
    })

    expect(result.anomalies).toContainEqual(
      expect.objectContaining({
        entityId: 'trade0615',
        disposition: 'warning',
      }),
    )
  })

  it('does not apply category seasons to source goods marked nlp', () => {
    const result = transformTrades({
      ...fixture,
      trades: {
        ...fixture.trades,
        trade0119: {
          ...fixture.trades.trade0615!,
          id: 'trade0119',
          name: '小麥',
          noSeasonalVariation: true,
        },
      },
    })

    expect(result.dataset.tradeGoods).toContainEqual(
      expect.objectContaining({
        id: 'trade0119',
        peakSeasonIds: [],
        lowSeasonIds: [],
      }),
    )
  })
})
