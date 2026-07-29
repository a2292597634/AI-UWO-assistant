import { extractJsAssignment } from './parse-languages'
import type { SourceSkillMetadata } from './types'

/**
 * Parse skill_arr metadata from a json_char.js source.
 *
 * The source contains `var skill_arr={skill100001:{g:"menuskt3"}, skill100002:{g:"menuskt2",i:"skillT0053"}, ...}`
 * where each key is a source skill ID.
 *
 * Fields:
 * - `g`: source category ID (e.g., "menuskt3")
 * - `i`: image override ID (optional, e.g., "skillT0053")
 */
export const parseSkills = (source: string): Record<string, SourceSkillMetadata> => {
  const raw = extractJsAssignment<Record<string, Record<string, unknown>>>(source, 'skill_arr')

  const skills: Record<string, SourceSkillMetadata> = {}

  for (const [id, data] of Object.entries(raw)) {
    if (typeof data !== 'object' || data === null) continue

    skills[id] = {
      sourceCategoryId: typeof data.g === 'string' ? data.g : '',
      imageOverrideId: typeof data.i === 'string' ? data.i : null,
    }
  }

  return skills
}
