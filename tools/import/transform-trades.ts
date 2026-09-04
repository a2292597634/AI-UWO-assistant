import type {
  CanonicalTradeDataset,
  CanonicalTradeGood,
  CanonicalTradePort,
  CanonicalTradeSeasonProfile,
  CanonicalTradeType,
  TradeTransformAnomaly,
} from './types'
import type { SourceTradeBundle } from './trade-types'

const SOURCE_SNAPSHOT = 'voyage-tw-2026052501-trade-20260904'

const compareText = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].sort(compareText)

const reverseCityTrades = (bundle: SourceTradeBundle): Map<string, string[]> => {
  const reverse = new Map<string, string[]>()
  for (const [cityId, tradeIds] of Object.entries(bundle.cityTrades).sort(([left], [right]) =>
    compareText(left, right),
  )) {
    for (const tradeId of tradeIds) {
      const current = reverse.get(tradeId) ?? []
      if (!current.includes(cityId)) current.push(cityId)
      reverse.set(tradeId, current)
    }
  }
  return reverse
}

const transformTradeTypes = (bundle: SourceTradeBundle): CanonicalTradeType[] =>
  Object.entries(bundle.tradeTypes)
    .sort(([left], [right]) => compareText(left, right))
    .map(([id, rule]) => ({
      id,
      name: bundle.languageMap['tradetype' + id] ?? id,
      peakSeasonIds: uniqueSorted(rule.peakSeasonIds),
      lowSeasonIds: uniqueSorted(rule.lowSeasonIds),
    }))

const transformPorts = (bundle: SourceTradeBundle): CanonicalTradePort[] =>
  Object.values(bundle.cities)
    .sort((left, right) => compareText(left.id, right.id))
    .map((city) => ({
      id: city.id,
      name: bundle.languageMap[city.nameKey] ?? city.nameKey,
      regionName: null,
      seasonProfileId: city.seasonProfileId,
      sourceRefs: { voyageTw: city.id },
    }))

const transformSeasonProfiles = (bundle: SourceTradeBundle): CanonicalTradeSeasonProfile[] =>
  Object.entries(bundle.seasonProfiles)
    .sort(([left], [right]) => compareText(left, right))
    .map(([id, monthSeasonIds]) => ({
      id,
      monthSeasonIds: [...monthSeasonIds],
    }))

const transformGoods = (
  bundle: SourceTradeBundle,
  reverseCityTrades: Map<string, string[]>,
  anomalies: TradeTransformAnomaly[],
): CanonicalTradeGood[] =>
  Object.values(bundle.trades)
    .sort((left, right) => compareText(left.id, right.id))
    .map((trade) => {
      const sourceCityIds = uniqueSorted(trade.cityIds)
      const reverseCityIds = uniqueSorted(reverseCityTrades.get(trade.id) ?? [])
      if (sourceCityIds.join('\0') !== reverseCityIds.join('\0')) {
        anomalies.push({
          entityId: trade.id,
          field: 'salesPortIds',
          value: JSON.stringify({ source: sourceCityIds, cityTrades: reverseCityIds }),
          disposition: 'warning',
          reason: '貿易品來源港口清單與反向 city_trades 關係不一致。',
        })
      }

      const salesPortIds = reverseCityIds.length > 0 ? reverseCityIds : sourceCityIds
      const salesMode = salesPortIds.length > 0 ? 'fixed-port' : trade.barter ? 'barter' : 'special'
      const rule = bundle.tradeTypes[trade.typeId] ?? {
        peakSeasonIds: [],
        lowSeasonIds: [],
      }
      const peakSeasonIds = trade.noSeasonalVariation ? [] : uniqueSorted(rule.peakSeasonIds)
      const lowSeasonIds = trade.noSeasonalVariation ? [] : uniqueSorted(rule.lowSeasonIds)

      return {
        id: trade.id,
        name: trade.name,
        categoryId: trade.typeId,
        categoryName: bundle.languageMap['tradetype' + trade.typeId] ?? trade.typeId,
        rank: trade.rank,
        salesMode,
        salesPortIds,
        peakSeasonIds,
        lowSeasonIds,
        iconId: trade.iconId,
        searchAliases: [],
        sourceRefs: { voyageTw: trade.id },
      }
    })

export const transformTrades = (
  bundle: SourceTradeBundle,
): { dataset: CanonicalTradeDataset; anomalies: TradeTransformAnomaly[] } => {
  const anomalies: TradeTransformAnomaly[] = []
  const seasonNames: Record<string, string> = {}
  for (const seasonId of Object.keys(bundle.glyphs.season)) {
    const number = seasonId.replace(/^s/, '')
    seasonNames[seasonId] =
      bundle.languageMap['seasons' + number] ?? bundle.languageMap['season' + number] ?? seasonId
  }
  const dataset: CanonicalTradeDataset = {
    sourceSnapshot: SOURCE_SNAPSHOT,
    tradeGoods: transformGoods(bundle, reverseCityTrades(bundle), anomalies),
    tradeTypes: transformTradeTypes(bundle),
    ports: transformPorts(bundle),
    seasonProfiles: transformSeasonProfiles(bundle),
    seasonNames,
    glyphs: {
      season: { ...bundle.glyphs.season },
      status: { ...bundle.glyphs.status },
    },
  }
  return { dataset, anomalies }
}
