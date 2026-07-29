import { extractJsAssignment } from './parse-languages'
import type { SourceOfficer } from './types'

/**
 * Parse all officer records from a json_char.js source.
 *
 * The source contains `var json_char={chasT001:{...}, chasT002:{...}, ...}`
 * where each key is a source officer ID and each value is the officer's raw data.
 */
export const parseOfficers = (source: string): Record<string, SourceOfficer> => {
  const raw = extractJsAssignment<Record<string, unknown>>(source, 'json_char')

  const officers: Record<string, SourceOfficer> = {}

  for (const [id, data] of Object.entries(raw)) {
    // Skip non-officer keys that might be in the object
    if (typeof data !== 'object' || data === null) continue

    const obj = data as Record<string, unknown>

    officers[id] = {
      cht: typeof obj.cht === 'string' ? obj.cht : undefined,
      rank: String(obj.rank ?? ''),
      type: String(obj.type ?? ''),
      job: String(obj.job ?? ''),
      country: String(obj.country ?? ''),
      gender: String(obj.gender ?? ''),
      lang: (obj.lang as Record<string, string>) ?? {},
      skill: normalizeSkillObject(obj.skill as Record<string, unknown> | undefined),
      slv: normalizeSlvObject(obj.slv as Record<string, unknown> | undefined),
      city: Array.isArray(obj.city) ? obj.city.map(String) : [],
      req: String(obj.req ?? ''),
      req_char: typeof obj.req_char === 'string' ? obj.req_char : undefined,
      char_reqs: Array.isArray(obj.char_reqs) ? obj.char_reqs.map(String) : undefined,
      note: typeof obj.note === 'string' ? obj.note : undefined,
      new: typeof obj.new === 'number' ? obj.new : undefined,
      boss: typeof obj.boss === 'number' ? obj.boss : undefined,
    }
  }

  return officers
}

/** Normalize the nested skill.sk0-sk5 structure. */
const normalizeSkillObject = (
  skill: Record<string, unknown> | undefined,
): SourceOfficer['skill'] => {
  const result: SourceOfficer['skill'] = {}
  if (!skill || typeof skill !== 'object') return result

  const groupPattern = /^sk[0-5]$/
  for (const [key, value] of Object.entries(skill)) {
    if (groupPattern.test(key) && value !== null && typeof value === 'object') {
      const normalized: Record<string, number | string | null> = {}
      for (const [skillId, level] of Object.entries(value as Record<string, unknown>)) {
        if (level === null) normalized[skillId] = null
        else if (typeof level === 'number') normalized[skillId] = level
        else normalized[skillId] = String(level)
      }
      ;(result as Record<string, unknown>)[key] = normalized
    }
  }

  return result
}

/** Normalize slv overrides. */
const normalizeSlvObject = (
  slv: Record<string, unknown> | undefined,
): Record<string, number | string> | undefined => {
  if (!slv || typeof slv !== 'object') return undefined
  const result: Record<string, number | string> = {}
  for (const [key, value] of Object.entries(slv)) {
    if (typeof value === 'number') result[key] = value
    else if (typeof value === 'string') result[key] = value
  }
  return Object.keys(result).length > 0 ? result : undefined
}
