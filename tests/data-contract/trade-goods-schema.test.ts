import { describe, expect, it } from 'vitest'
import { createSchemaValidator } from '../../tools/data-audit/create-schema-validator'
import { validateTradeDataset } from '../../tools/import/validate-trades'
import type { CanonicalTradeDataset } from '../../tools/import/types'

const validDataset = (): CanonicalTradeDataset => ({
  sourceSnapshot: 'fixture-trade-snapshot',
  tradeGoods: [
    {
      id: 'trade0615',
      name: '葡萄酒',
      categoryId: '06',
      categoryName: '酒類',
      rank: 4,
      salesMode: 'fixed-port',
      salesPortIds: ['town101'],
      peakSeasonIds: ['s4', 's5'],
      lowSeasonIds: ['s2', 's6'],
      iconId: null,
      sourceRefs: { voyageTw: 'trade0615' },
    },
  ],
  tradeTypes: [
    {
      id: '06',
      name: '酒類',
      peakSeasonIds: ['s4', 's5'],
      lowSeasonIds: ['s2', 's6'],
    },
  ],
  ports: [
    {
      id: 'town101',
      name: '橫濱',
      regionName: null,
      seasonProfileId: '0',
      sourceRefs: { voyageTw: 'town101' },
    },
  ],
  seasonProfiles: [
    {
      id: '0',
      monthSeasonIds: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's1', 's2', 's3'],
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
})

describe('trade-goods schema and relationships', () => {
  it('accepts a valid trade dataset in JSON Schema and cross-file validation', () => {
    const dataset = validDataset()
    const validator = createSchemaValidator()

    expect(validator.validate('trade-goods', dataset)).toEqual([])
    expect(validateTradeDataset(dataset)).toEqual([])
  })

  it('rejects duplicate trade IDs', () => {
    const dataset = validDataset()
    dataset.tradeGoods.push({ ...dataset.tradeGoods[0]! })

    expect(validateTradeDataset(dataset)).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_TRADE_ID', severity: 'error' }),
    )
  })

  it('rejects a season profile that does not contain all twelve months', () => {
    const dataset = validDataset()
    dataset.seasonProfiles[0]!.monthSeasonIds.pop()

    expect(validateTradeDataset(dataset)).toContainEqual(
      expect.objectContaining({ code: 'SEASON_MONTH_COUNT', severity: 'error' }),
    )
  })

  it('rejects overlapping peak and low season rules', () => {
    const dataset = validDataset()
    dataset.tradeTypes[0]!.lowSeasonIds.push('s4')

    expect(validateTradeDataset(dataset)).toContainEqual(
      expect.objectContaining({ code: 'SEASON_RULE_OVERLAP', severity: 'error' }),
    )
  })
})
