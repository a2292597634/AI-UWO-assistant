import { describe, expect, it } from 'vitest'
import {
  buildTradeIconSources,
  resolveTradeIconImageId,
  tradeIconFilename,
  tradeIconUrl,
} from '../../tools/asset-pipeline/trade-icons'

const normal = {
  id: 'trade0615',
  iconId: null,
  sourceRefs: { voyageTw: 'trade0615' },
} as const
const overridden = {
  id: 'trade18T903',
  iconId: 'trade1817',
  sourceRefs: { voyageTw: 'trade18T903' },
} as const

describe('貿易品圖示來源解析器', () => {
  it('resolves normal and overridden source image IDs', () => {
    expect(resolveTradeIconImageId(normal)).toBe('trade0615')
    expect(resolveTradeIconImageId(overridden)).toBe('trade1817')
  })

  it('builds the voyage.tw URL and collision-safe filename', () => {
    expect(tradeIconUrl('trade0615')).toBe('https://voyage.tw/img/trade/uwo_trade0615.png')
    expect(tradeIconFilename('trade0615')).toBe('trade_trade0615.png')
  })

  it('deduplicates two goods that share an overridden image ID', () => {
    const sources = buildTradeIconSources([
      normal,
      overridden,
      {
        id: 'trade1817',
        iconId: null,
        sourceRefs: { voyageTw: 'trade1817' },
      },
    ] as never[])

    expect(sources).toEqual([
      {
        imageId: 'trade0615',
        filename: 'trade_trade0615.png',
        url: 'https://voyage.tw/img/trade/uwo_trade0615.png',
        tradeIds: ['trade0615'],
      },
      {
        imageId: 'trade1817',
        filename: 'trade_trade1817.png',
        url: 'https://voyage.tw/img/trade/uwo_trade1817.png',
        tradeIds: ['trade1817', 'trade18T903'],
      },
    ])
  })
})
