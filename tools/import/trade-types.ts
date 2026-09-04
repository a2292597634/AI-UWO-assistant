export interface SourceTrade {
  id: string
  name: string
  typeId: string
  cityIds: string[]
  rank: number | null
  barter: boolean
  special: boolean
  noSeasonalVariation: boolean
  iconId: string | null
}

export interface SourceCity {
  id: string
  nameKey: string
  seasonProfileId: string
}

export interface SourceTradeBundle {
  trades: Record<string, SourceTrade>
  cityTrades: Record<string, string[]>
  cities: Record<string, SourceCity>
  tradeTypes: Record<
    string,
    {
      peakSeasonIds: string[]
      lowSeasonIds: string[]
    }
  >
  seasonProfiles: Record<string, string[]>
  glyphs: {
    season: Record<string, string>
    status: { peak: string; low: string; normal: string }
  }
  languageMap: Record<string, string>
}
