import { extractJsAssignment, parseLanguageMap } from './parse-languages'
import type { SourceCity, SourceTrade, SourceTradeBundle } from './trade-types'

type JsonObject = Record<string, unknown>

const asObject = (value: unknown): JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {}

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : fallback

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const parseRank = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const normalizeSeasonId = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? 's' + value : null
  }
  if (typeof value !== 'string' || value.trim() === '') return null
  const normalized = value.trim()
  if (/^s\d+$/.test(normalized)) return normalized
  if (/^\d+$/.test(normalized)) return Number(normalized) > 0 ? 's' + normalized : null
  return normalized
}

const normalizeSeasonIds = (value: unknown): string[] =>
  asStringArray(value)
    .map((item) => normalizeSeasonId(item))
    .filter((item): item is string => item !== null)

const normalizeSeasonProfiles = (raw: unknown): Record<string, string[]> => {
  const profiles: Record<string, string[]> = {}
  if (Array.isArray(raw)) {
    raw.forEach((profile, index) => {
      const values = Array.isArray(profile) ? profile : []
      const monthValues = values.length === 13 ? values.slice(1) : values
      profiles[String(index)] = monthValues
        .map((value) => normalizeSeasonId(value))
        .filter((value): value is string => value !== null)
    })
    return profiles
  }

  for (const [id, profile] of Object.entries(asObject(raw))) {
    const values = Array.isArray(profile) ? profile : []
    const monthValues = values.length === 13 ? values.slice(1) : values
    profiles[id] = monthValues
      .map((value) => normalizeSeasonId(value))
      .filter((value): value is string => value !== null)
  }
  return profiles
}

const normalizeTradeTypes = (raw: unknown): SourceTradeBundle['tradeTypes'] => {
  const tradeTypes: SourceTradeBundle['tradeTypes'] = {}
  for (const [id, value] of Object.entries(asObject(raw))) {
    const object = asObject(value)
    tradeTypes[id] = {
      peakSeasonIds: normalizeSeasonIds(object.p),
      lowSeasonIds: normalizeSeasonIds(object.m),
    }
  }
  return tradeTypes
}

const normalizeCityTrades = (raw: unknown): Record<string, string[]> => {
  const cityTrades: Record<string, string[]> = {}
  for (const [cityId, trades] of Object.entries(asObject(raw))) {
    cityTrades[cityId] = asStringArray(trades)
  }
  return cityTrades
}

const normalizeCities = (raw: unknown): Record<string, SourceCity> => {
  const cities: Record<string, SourceCity> = {}
  for (const [id, value] of Object.entries(asObject(raw))) {
    const object = asObject(value)
    // voyage.tw 的 seasons 索引使用 ss；s 是另一個城市屬性，不能混用。
    const seasonProfileId = asString(object.ss ?? object.season ?? object.s)
    cities[id] = {
      id,
      nameKey: asString(object.nameKey ?? object.name, id),
      seasonProfileId,
    }
  }
  return cities
}

const normalizeSeasonGlyphs = (raw: unknown): Record<string, string> => {
  const glyphs: Record<string, string> = {}
  if (Array.isArray(raw)) {
    raw.forEach((value, index) => {
      if (index > 0 && typeof value === 'string' && value) glyphs['s' + index] = value
    })
    return glyphs
  }

  for (const [id, value] of Object.entries(asObject(raw))) {
    const seasonId = normalizeSeasonId(id)
    if (seasonId && typeof value === 'string') glyphs[seasonId] = value
  }
  return glyphs
}

const normalizeStatusGlyphs = (raw: unknown): SourceTradeBundle['glyphs']['status'] => {
  const object = asObject(raw)
  return {
    peak: asString(object.p),
    low: asString(object.m),
    normal: asString(object.n),
  }
}

const isSpecialTrade = (object: JsonObject, cityIds: string[], barter: boolean): boolean =>
  Boolean(object.exc ?? object.special ?? object.guild ?? object.zone ?? object.boss) ||
  (cityIds.length === 0 && !barter)

export const parseTradeSource = (jsonSource: string, languageSource: string): SourceTradeBundle => {
  const rawTrades = extractJsAssignment<Record<string, unknown>>(jsonSource, 'trades')
  const rawCityTrades = extractJsAssignment<Record<string, unknown>>(jsonSource, 'city_trades')
  const rawCities = extractJsAssignment<Record<string, unknown>>(jsonSource, 'json_city')
  const rawTradeTypes = extractJsAssignment<Record<string, unknown>>(jsonSource, 'tradetype_pm')
  const rawSeasons = extractJsAssignment<unknown[]>(jsonSource, 'seasons')
  const rawSeasonGlyphs = extractJsAssignment<unknown[]>(jsonSource, 'emoji_ss')
  const rawStatusGlyphs = extractJsAssignment<Record<string, unknown>>(jsonSource, 'emoji_pm')
  const languageMap = parseLanguageMap([languageSource])

  const trades: Record<string, SourceTrade> = {}
  for (const [id, value] of Object.entries(rawTrades)) {
    const object = asObject(value)
    const cityIds = asStringArray(object.c ?? object.city)
    const barter =
      Object.prototype.hasOwnProperty.call(object, 'v') ||
      Object.prototype.hasOwnProperty.call(object, 'vc')
    trades[id] = {
      id,
      name: languageMap[id] ?? id,
      typeId: asString(object.t ?? object.type),
      cityIds,
      rank: parseRank(object.r ?? object.rank),
      barter,
      special: isSpecialTrade(object, cityIds, barter),
      noSeasonalVariation: Boolean(object.nlp),
      iconId: asString(object.i ?? object.iconId) || null,
    }
  }

  return {
    trades,
    cityTrades: normalizeCityTrades(rawCityTrades),
    cities: normalizeCities(rawCities),
    tradeTypes: normalizeTradeTypes(rawTradeTypes),
    seasonProfiles: normalizeSeasonProfiles(rawSeasons),
    glyphs: {
      season: normalizeSeasonGlyphs(rawSeasonGlyphs),
      status: normalizeStatusGlyphs(rawStatusGlyphs),
    },
    languageMap,
  }
}
