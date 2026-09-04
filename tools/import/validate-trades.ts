import type { AuditFinding } from '../data-audit/types'
import type { CanonicalTradeDataset } from './types'

const compareText = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))

const finding = (
  code: string,
  entityType: string,
  entityId: string,
  path: string,
  observedValue: unknown,
  message: string,
): AuditFinding => ({
  severity: 'error',
  code,
  entityType,
  entityId,
  path,
  observedValue,
  message,
  suggestedAction: '修正貿易品權威資料或其來源關係。',
})

const duplicateFindings = (
  values: readonly { id: string }[],
  entityType: string,
  code: string,
  path: string,
): AuditFinding[] => {
  const findings: AuditFinding[] = []
  const seen = new Set<string>()
  for (const [index, value] of values.entries()) {
    if (seen.has(value.id)) {
      findings.push(
        finding(
          code,
          entityType,
          value.id,
          path + '/' + index + '/id',
          value.id,
          '同一資料集合中的 ID 必須唯一。',
        ),
      )
    }
    seen.add(value.id)
  }
  return findings
}

export const validateTradeDataset = (dataset: CanonicalTradeDataset): AuditFinding[] => {
  const findings: AuditFinding[] = []
  findings.push(
    ...duplicateFindings(dataset.tradeGoods, 'tradeGood', 'DUPLICATE_TRADE_ID', '/tradeGoods'),
    ...duplicateFindings(dataset.tradeTypes, 'tradeType', 'DUPLICATE_TRADE_TYPE_ID', '/tradeTypes'),
    ...duplicateFindings(dataset.ports, 'tradePort', 'DUPLICATE_PORT_ID', '/ports'),
    ...duplicateFindings(
      dataset.seasonProfiles,
      'tradeSeasonProfile',
      'DUPLICATE_SEASON_PROFILE_ID',
      '/seasonProfiles',
    ),
  )

  const typeIds = new Set(dataset.tradeTypes.map((item) => item.id))
  const portIds = new Set(dataset.ports.map((item) => item.id))
  const profileIds = new Set(dataset.seasonProfiles.map((item) => item.id))
  const seasonIds = new Set<string>()

  for (const [index, profile] of dataset.seasonProfiles.entries()) {
    if (profile.monthSeasonIds.length !== 12) {
      findings.push(
        finding(
          'SEASON_MONTH_COUNT',
          'tradeSeasonProfile',
          profile.id,
          '/seasonProfiles/' + index + '/monthSeasonIds',
          profile.monthSeasonIds.length,
          '每組季節設定必須恰好包含 12 個月份值。',
        ),
      )
    }
    for (const seasonId of profile.monthSeasonIds) seasonIds.add(seasonId)
  }

  for (const [index, type] of dataset.tradeTypes.entries()) {
    const peak = new Set(type.peakSeasonIds)
    const overlap = type.lowSeasonIds.filter((seasonId) => peak.has(seasonId))
    if (overlap.length > 0) {
      findings.push(
        finding(
          'SEASON_RULE_OVERLAP',
          'tradeType',
          type.id,
          '/tradeTypes/' + index,
          overlap,
          '旺季與淡季規則不可重疊。',
        ),
      )
    }
    for (const seasonId of [...type.peakSeasonIds, ...type.lowSeasonIds]) seasonIds.add(seasonId)
  }

  for (const [index, trade] of dataset.tradeGoods.entries()) {
    if (!typeIds.has(trade.categoryId)) {
      findings.push(
        finding(
          'UNKNOWN_TRADE_TYPE_ID',
          'tradeGood',
          trade.id,
          '/tradeGoods/' + index + '/categoryId',
          trade.categoryId,
          '貿易品分類必須參照已知的貿易品類型。',
        ),
      )
    }
    if (trade.salesMode === 'fixed-port' && trade.salesPortIds.length === 0) {
      findings.push(
        finding(
          'FIXED_PORT_WITHOUT_PORT',
          'tradeGood',
          trade.id,
          '/tradeGoods/' + index + '/salesPortIds',
          trade.salesPortIds,
          '固定銷售港口貿易品至少要包含一個銷售港口。',
        ),
      )
    }
    for (const [portIndex, portId] of trade.salesPortIds.entries()) {
      if (!portIds.has(portId)) {
        findings.push(
          finding(
            'UNKNOWN_PORT_ID',
            'tradeGood',
            trade.id,
            '/tradeGoods/' + index + '/salesPortIds/' + portIndex,
            portId,
            '銷售港口必須參照已知港口。',
          ),
        )
      }
    }
    for (const seasonId of [...trade.peakSeasonIds, ...trade.lowSeasonIds]) {
      seasonIds.add(seasonId)
    }
  }

  for (const [index, port] of dataset.ports.entries()) {
    if (!profileIds.has(port.seasonProfileId)) {
      findings.push(
        finding(
          'UNKNOWN_SEASON_PROFILE_ID',
          'tradePort',
          port.id,
          '/ports/' + index + '/seasonProfileId',
          port.seasonProfileId,
          '港口必須參照已知的 12 個月季節設定。',
        ),
      )
    }
  }

  for (const seasonId of [...seasonIds].sort(compareText)) {
    if (!dataset.glyphs.season[seasonId]) {
      findings.push(
        finding(
          'GLYPH_SEASON_MISSING',
          'tradeGlyphs',
          seasonId,
          '/glyphs/season/' + seasonId,
          null,
          '每個被參照的季節都必須有來源圖示。',
        ),
      )
    }
  }

  for (const key of ['peak', 'low', 'normal'] as const) {
    if (!dataset.glyphs.status[key]) {
      findings.push(
        finding(
          'GLYPH_STATUS_MISSING',
          'tradeGlyphs',
          key,
          '/glyphs/status/' + key,
          null,
          '旺、淡、一般三種狀態都必須有圖示。',
        ),
      )
    }
  }

  return findings.sort((left, right) =>
    compareText(
      [left.code, left.entityType, left.entityId, left.path].join('\0'),
      [right.code, right.entityType, right.entityId, right.path].join('\0'),
    ),
  )
}
