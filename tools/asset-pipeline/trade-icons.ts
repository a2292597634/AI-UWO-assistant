import type { CanonicalTradeGood } from '../import/types'

export interface TradeIconSource {
  imageId: string
  filename: string
  url: string
  tradeIds: string[]
}

export const resolveTradeIconImageId = (
  trade: Pick<CanonicalTradeGood, 'id' | 'iconId' | 'sourceRefs'>,
): string => trade.iconId ?? trade.sourceRefs.voyageTw

export const tradeIconFilename = (imageId: string): string => `trade_${imageId}.png`

export const tradeIconUrl = (imageId: string): string =>
  `https://voyage.tw/img/trade/uwo_${imageId}.png`

const compareUtf8 = (left: string, right: string): number =>
  Buffer.from(left, 'utf8').compare(Buffer.from(right, 'utf8'))

export const buildTradeIconSources = (trades: readonly CanonicalTradeGood[]): TradeIconSource[] => {
  const sources = new Map<string, string[]>()

  for (const trade of trades) {
    const imageId = resolveTradeIconImageId(trade)
    const tradeIds = sources.get(imageId) ?? []
    tradeIds.push(trade.id)
    sources.set(imageId, tradeIds)
  }

  return [...sources.entries()]
    .sort(([left], [right]) => compareUtf8(left, right))
    .map(([imageId, tradeIds]) => ({
      imageId,
      filename: tradeIconFilename(imageId),
      url: tradeIconUrl(imageId),
      tradeIds: tradeIds.sort(compareUtf8),
    }))
}
