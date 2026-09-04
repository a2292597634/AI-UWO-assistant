import { describe, expect, it } from 'vitest'
import {
  buildTradePortMatrix,
  getTradeSeasonStatus,
} from '../../miniprogram/subpkg-trade/domain/trade-season'
import type {
  RuntimeTradeGoodDetail,
  RuntimeTradeReference,
} from '../../miniprogram/contracts/runtime-data'

const trade: RuntimeTradeGoodDetail = {
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
    { id: 'town101', name: '橫濱', regionName: null, seasonProfileId: '0' },
    { id: 'town102', name: '長崎', regionName: null, seasonProfileId: '1' },
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
    season: { s1: '🌱', s2: '🌞', s3: '🍁', s4: '⛄', s5: '🌵', s6: '💧' },
    status: { peak: '▲', low: '▼', normal: '🅞' },
  },
}

describe('trade season domain', () => {
  it('prioritizes peak, then low, and otherwise returns normal', () => {
    expect(getTradeSeasonStatus(trade, 's4')).toBe('peak')
    expect(getTradeSeasonStatus(trade, 's2')).toBe('low')
    expect(getTradeSeasonStatus(trade, 's1')).toBe('normal')
    expect(getTradeSeasonStatus(trade, null)).toBe('unknown')
  })

  it('projects twelve months for every fixed sales port', () => {
    const rows = buildTradePortMatrix(trade, reference, 12)

    expect(rows).toHaveLength(2)
    expect(rows[0]?.months).toHaveLength(12)
    expect(rows[0]?.months[1]).toMatchObject({
      month: 2,
      seasonId: 's2',
      seasonName: '夏季',
      status: 'low',
      statusGlyph: '▼',
      isCurrent: false,
    })
    expect(rows[0]?.months[11]).toMatchObject({
      month: 12,
      isCurrent: true,
      currentClass: 'trade-month-cell--current',
    })
    expect(rows[0]?.months[11]?.accessibleLabel).toContain('12月')
  })

  it('returns an explicit unknown state when a port profile is missing', () => {
    const rows = buildTradePortMatrix({ ...trade, salesPortIds: ['town-missing'] }, reference, 12)

    expect(rows).toEqual([])
  })

  it('returns no rows for barter or special goods without fixed ports', () => {
    expect(
      buildTradePortMatrix({ ...trade, salesMode: 'barter', salesPortIds: [] }, reference, 12),
    ).toEqual([])
  })
})
