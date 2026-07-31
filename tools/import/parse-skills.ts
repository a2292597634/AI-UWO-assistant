import { extractJsAssignment } from './parse-languages'
import type { SourceSkillMetadata } from './types'

/**
 * Parse skill_arr metadata from a json_char.js source.
 *
 * The source contains `var skill_arr={skill501386:{d:[["2.3%"],["3.5%"]],t:"menuskt15"}, ...}`
 * where each key is a source skill ID.
 *
 * Fields:
 * - `t`: source category ID (e.g., "menuskt15") — primary field in real source
 * - `g`: legacy category ID — retained for backward compatibility with older snapshots
 * - `d`: per-level effect value arrays (e.g. [["2.3%"],["3.5%"],...])
 * - `i`: image override ID (optional, e.g., "skillT0053")
 */
export const parseSkills = (source: string): Record<string, SourceSkillMetadata> => {
  const raw = extractJsAssignment<Record<string, Record<string, unknown>>>(source, 'skill_arr')

  const skills: Record<string, SourceSkillMetadata> = {}
  const errors: string[] = []

  for (const [id, data] of Object.entries(raw)) {
    if (typeof data !== 'object' || data === null) continue

    // Primary field: `t` (real source). Fallback: `g` (legacy snapshots).
    const sourceCategoryId =
      typeof data.t === 'string' ? data.t : typeof data.g === 'string' ? data.g : ''

    if (!sourceCategoryId) {
      errors.push(id)
      continue
    }

    // Extract per-level effect values from `d` field
    const levelValues: string[][] = []
    if (Array.isArray(data.d)) {
      for (const lv of data.d) {
        if (Array.isArray(lv)) {
          levelValues.push(lv.map((v) => String(v)))
        }
      }
    }

    skills[id] = {
      sourceCategoryId,
      imageOverrideId: typeof data.i === 'string' ? data.i : null,
      levelValues,
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `SKILL_CATEGORY_MISSING: ${errors.length} skills have no category (field 't'): ${errors.slice(0, 10).join(', ')}${errors.length > 10 ? ` ... and ${errors.length - 10} more` : ''}`,
    )
  }

  return skills
}
