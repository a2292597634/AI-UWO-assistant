import { readFileSync } from 'node:fs'
import { parseSkills } from '../import/parse-skills'

export const DEFAULT_SKILL_SOURCE_PATH = 'archive/voyage-tw-2026052501/raw-data/json_char.js'

/**
 * 讀取來源技能圖標覆蓋，轉成 canonical 資產檔名。
 * Map key 是 `skill_skillT0092` 這類 canonical 技能 ID。
 */
export const loadSkillIconOverrides = (
  sourcePath = DEFAULT_SKILL_SOURCE_PATH,
): ReadonlyMap<string, string> => {
  const metadata = parseSkills(readFileSync(sourcePath, 'utf8'))
  const overrides = new Map<string, string>()

  for (const [sourceId, skill] of Object.entries(metadata)) {
    if (!skill.imageOverrideId) continue
    overrides.set(`skill_${sourceId}`, `skill_${skill.imageOverrideId}.png`)
  }

  return overrides
}
