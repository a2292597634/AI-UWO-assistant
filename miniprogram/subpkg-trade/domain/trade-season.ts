import type { RuntimeTradeGoodDetail, RuntimeTradeReference } from '../../contracts/runtime-data'

export type TradeSeasonStatus = 'peak' | 'low' | 'normal' | 'unknown'

export interface TradeMonthView {
  month: number
  seasonId: string | null
  seasonName: string | null
  seasonGlyph: string | null
  status: TradeSeasonStatus
  statusGlyph: string | null
  statusName: string
  isCurrent: boolean
  currentClass: string
  accessibleLabel: string
}

export interface TradePortMatrixView {
  portId: string
  portName: string
  regionName: string | null
  months: TradeMonthView[]
}

const STATUS_NAMES: Record<TradeSeasonStatus, string> = {
  peak: '旺季',
  low: '淡季',
  normal: '一般',
  unknown: '資料待補',
}

export const getTradeSeasonStatus = (
  trade: RuntimeTradeGoodDetail,
  seasonId: string | null,
): TradeSeasonStatus => {
  if (seasonId === null || seasonId === '') {
    return 'unknown'
  }

  if (trade.peakSeasonIds.includes(seasonId)) {
    return 'peak'
  }

  if (trade.lowSeasonIds.includes(seasonId)) {
    return 'low'
  }

  return 'normal'
}

const statusGlyph = (
  reference: RuntimeTradeReference,
  status: TradeSeasonStatus,
): string | null => {
  if (status === 'unknown') {
    return null
  }

  return reference.glyphs.status[status]
}

export const buildTradePortMatrix = (
  trade: RuntimeTradeGoodDetail,
  reference: RuntimeTradeReference,
  currentGameMonth: number,
): TradePortMatrixView[] => {
  if (trade.salesMode !== 'fixed-port' || trade.salesPortIds.length === 0) {
    return []
  }

  const ports = trade.salesPortIds.map((portId) =>
    reference.ports.find((port) => port.id === portId),
  )

  if (ports.some((port) => port === undefined)) {
    return []
  }

  const profiles = ports.map((port) =>
    reference.seasonProfiles.find((profile) => profile.id === port?.seasonProfileId),
  )

  if (profiles.some((profile) => profile === undefined)) {
    return []
  }

  return ports.map((port, portIndex) => {
    const profile = profiles[portIndex]
    const months = Array.from({ length: 12 }, (_, monthIndex) => {
      const month = monthIndex + 1
      const seasonId = profile?.monthSeasonIds[monthIndex] ?? null
      const status = getTradeSeasonStatus(trade, seasonId)
      const seasonName = seasonId === null ? null : (reference.seasonNames[seasonId] ?? null)
      const seasonGlyph = seasonId === null ? null : (reference.glyphs.season[seasonId] ?? null)
      const statusName = STATUS_NAMES[status]

      return {
        month,
        seasonId,
        seasonName,
        seasonGlyph,
        status,
        statusGlyph: statusGlyph(reference, status),
        statusName,
        isCurrent: month === currentGameMonth,
        currentClass: month === currentGameMonth ? 'trade-month-cell--current' : '',
        accessibleLabel: `${month}月、${seasonName ?? '季節資料待補'}、${statusName}`,
      }
    })

    return {
      portId: port?.id ?? '',
      portName: port?.name ?? '港口資料待補',
      regionName: port?.regionName ?? null,
      months,
    }
  })
}
