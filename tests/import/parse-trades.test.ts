import { describe, expect, it } from 'vitest'
import { parseTradeSource } from '../../tools/import/parse-trades'

const jsonSource = String.raw`var city_trades={
  "town101":["trade0615"],
  "town102":["trade0615"]
};
var trades={
  "trade0615":{"t":"06","city":["town101","town102"],"rank":3,"i":"615"},
  "trade9999":{"t":"05","city":[],"rank":null,"vc":{"trade0101":["discov01"]}},
  "trade-nlp":{"t":"01","city":["town101"],"rank":4,"nlp":1}
};
var json_city={
  "town101":{"name":"town101","s":"1","ss":0},
  "town102":{"name":"town102","season":"1"}
};
var tradetype_pm={
  "06":{"p":["s4","s5"],"m":["s2","s6"]}
};
var seasons={
  "0":["s1","s2","s3","s4","s5","s6","s7","s8","s9","s1","s2","s3"],
  "1":["s4","s5","s6","s7","s8","s9","s1","s2","s3","s4","s5","s6"]
};
var emoji_ss=["","🌱","🌞","🍁","⛄","🌵","💧","🥵","🥶","🎅"];
var emoji_pm={"p":"▲","m":"▼","n":"🅞"};`

const languageSource = String.raw`var lang_js=[];
lang_js[1]={
  "trade0615":"葡萄酒",
  "trade9999":"木材",
  "town101":"橫濱",
  "town102":"長崎",
  "tradetype06":"酒類",
  "season1":"春季",
  "season2":"夏季",
  "season3":"秋季",
  "season4":"冬季",
  "season5":"旱季",
  "season6":"雨季"
};`

describe('parseTradeSource', () => {
  it('extracts trade, port, category, season and glyph assignments', () => {
    const bundle = parseTradeSource(jsonSource, languageSource)

    expect(bundle.trades.trade0615?.name).toBe('葡萄酒')
    expect(bundle.trades.trade0615?.cityIds).toEqual(['town101', 'town102'])
    expect(bundle.trades.trade0615?.typeId).toBe('06')
    expect(bundle.trades.trade9999?.barter).toBe(true)
    expect(bundle.trades['trade-nlp']?.noSeasonalVariation).toBe(true)
    expect(bundle.tradeTypes['06']?.peakSeasonIds).toEqual(['s4', 's5'])
    expect(bundle.tradeTypes['06']?.lowSeasonIds).toEqual(['s2', 's6'])
    expect(bundle.seasonProfiles['0']).toHaveLength(12)
    expect(bundle.cities.town101).toEqual({
      id: 'town101',
      nameKey: 'town101',
      seasonProfileId: '0',
    })
    expect(bundle.cityTrades.town102).toEqual(['trade0615'])
    expect(bundle.glyphs.season.s6).toBe('💧')
    expect(bundle.glyphs.status.peak).toBe('▲')
    expect(bundle.glyphs.status.low).toBe('▼')
    expect(bundle.glyphs.status.normal).toBe('🅞')
  })

  it('fails with a readable code when a required structured assignment is missing', () => {
    expect(() => parseTradeSource('var trades={};', languageSource)).toThrow(
      'IMPORT_VARIABLE_MISSING:city_trades',
    )
  })
})
