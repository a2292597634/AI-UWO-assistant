import { buildTradePortMatrix } from '../domain/trade-season'
import type { TradePortMatrixView } from '../domain/trade-season'
import { getTradeCategoryIconPath } from '../trade-category-icons'
import type { RuntimeTradeGoodDetail, RuntimeTradeReference } from '../../contracts/runtime-data'

export interface TradeDetailPageState {
  title: {
    name: string
    iconPath: string
    categoryIconPath: string | null
    categoryName: string
    rankLabel: string
    peakLabel: string
    lowLabel: string
  }
  currentGameMonth: number
  currentMonthLabel: string
  ports: TradePortMatrixView[]
  legend: {
    season: Array<{ id: string; name: string; glyph: string }>
    status: Array<{ key: string; name: string; glyph: string }>
  }
  hasPorts: boolean
  emptyMessage: string | null
}

const seasonSummary = (seasonIds: readonly string[], reference: RuntimeTradeReference): string => {
  if (seasonIds.length === 0) return '未設定'
  return seasonIds.map((seasonId) => reference.seasonNames[seasonId] ?? seasonId).join('、')
}

const seasonNumber = (seasonId: string): number => {
  const match = /^s(\d+)$/.exec(seasonId)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

const buildSeasonLegend = (reference: RuntimeTradeReference) => {
  const seasonIds = Array.from(
    new Set([...Object.keys(reference.seasonNames), ...Object.keys(reference.glyphs.season)]),
  ).sort((left, right) => seasonNumber(left) - seasonNumber(right) || left.localeCompare(right))

  return seasonIds.map((id) => ({
    id,
    name: reference.seasonNames[id] ?? id,
    glyph: reference.glyphs.season[id] ?? '',
  }))
}

export const presentTradeDetail = (
  detail: RuntimeTradeGoodDetail,
  reference: RuntimeTradeReference,
  gameMonth: number,
): TradeDetailPageState => {
  const ports = buildTradePortMatrix(detail, reference, gameMonth)

  return {
    title: {
      name: detail.name,
      iconPath: detail.iconPath,
      categoryIconPath: getTradeCategoryIconPath(detail.categoryId),
      categoryName: detail.categoryName,
      rankLabel: detail.rank === null ? '等級待補' : `名產 Lv.${detail.rank}`,
      peakLabel: seasonSummary(detail.peakSeasonIds, reference),
      lowLabel: seasonSummary(detail.lowSeasonIds, reference),
    },
    currentGameMonth: gameMonth,
    currentMonthLabel: `${gameMonth}月`,
    ports,
    legend: {
      season: buildSeasonLegend(reference),
      status: [
        { key: 'peak', name: '旺季', glyph: reference.glyphs.status.peak },
        { key: 'low', name: '淡季', glyph: reference.glyphs.status.low },
        { key: 'normal', name: '一般', glyph: reference.glyphs.status.normal },
      ],
    },
    hasPorts: ports.length > 0,
    emptyMessage: ports.length > 0 ? null : '目前沒有固定銷售港口矩陣',
  }
}
