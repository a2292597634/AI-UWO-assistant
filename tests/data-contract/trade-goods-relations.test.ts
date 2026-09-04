import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { validateTradeDataset } from '../../tools/import/validate-trades'
import type { CanonicalTradeDataset } from '../../tools/import/types'

const masterDataset = JSON.parse(
  readFileSync('data/master/trade-goods.json', 'utf8'),
) as CanonicalTradeDataset

const minimalDataset = (): CanonicalTradeDataset => ({
  sourceSnapshot: 'fixture-trade-snapshot',
  tradeGoods: [
    {
      id: 'trade0615',
      name: '葡萄酒',
      categoryId: '06',
      categoryName: '酒類',
      rank: 4,
      salesMode: 'fixed-port',
      salesPortIds: ['town-missing'],
      peakSeasonIds: ['s4'],
      lowSeasonIds: [],
      iconId: null,
      sourceRefs: { voyageTw: 'trade0615' },
    },
    {
      id: 'trade-empty-fixed',
      name: '缺少港口資料',
      categoryId: '06',
      categoryName: '酒類',
      rank: null,
      salesMode: 'fixed-port',
      salesPortIds: [],
      peakSeasonIds: [],
      lowSeasonIds: [],
      iconId: null,
      sourceRefs: { voyageTw: 'trade-empty-fixed' },
    },
  ],
  tradeTypes: [
    {
      id: '06',
      name: '酒類',
      peakSeasonIds: ['s4'],
      lowSeasonIds: [],
    },
  ],
  ports: [],
  seasonProfiles: [],
  seasonNames: {},
  glyphs: {
    season: {},
    status: { peak: '▲', low: '▼', normal: '🅞' },
  },
})

describe('trade-goods cross-file relationships', () => {
  it('reports unknown fixed-port and missing season references', () => {
    const findings = validateTradeDataset(minimalDataset())

    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(['UNKNOWN_PORT_ID', 'FIXED_PORT_WITHOUT_PORT']),
    )
  })

  it('keeps the source ss, vc and nlp semantics in the real master data', () => {
    expect(masterDataset.ports.find((port) => port.id === 'town2201')?.seasonProfileId).toBe('0')
    expect(masterDataset.tradeGoods.find((trade) => trade.id === 'trade09T090')).toMatchObject({
      salesMode: 'barter',
      salesPortIds: [],
    })
    expect(masterDataset.tradeGoods.find((trade) => trade.id === 'trade0119')).toMatchObject({
      peakSeasonIds: [],
      lowSeasonIds: [],
    })
  })
})
