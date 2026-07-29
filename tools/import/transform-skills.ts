import type { SkillMappingRecord } from '../data-audit/types'
import type { CanonicalSkill, SourceSkillMetadata, TransformAnomaly } from './types'

/** Track unmapped categories globally to avoid duplicate warnings. */
const unmappedCategorySet = new Set<string>()

/**
 * Build a lookup from sourceCategoryId → categoryId.
 * A sourceCategoryId may appear in multiple sourceGroup mappings but always maps
 * to the same categoryId (verified by Phase 2 audit). Use the first match.
 */
const buildCategoryMap = (mappings: SkillMappingRecord[]): Map<string, string> => {
  const map = new Map<string, string>()
  for (const m of mappings) {
    if (m.status !== 'approved') continue
    if (!map.has(m.sourceCategoryId)) {
      map.set(m.sourceCategoryId, m.categoryId)
    }
  }
  return map
}

/**
 * Transform unique skill IDs into canonical skill records.
 *
 * @param skillIds - Unique source skill IDs from all officer relationships
 * @param skillMetadata - skill_arr metadata keyed by source skill ID
 * @param languageMap - lang_js[1] display name dictionary
 * @param mappingTable - Phase 2 approved skill group mappings
 */
export const transformSkills = (
  skillIds: string[],
  skillMetadata: Record<string, SourceSkillMetadata>,
  languageMap: Record<string, string>,
  mappingTable: SkillMappingRecord[],
): { skills: CanonicalSkill[]; anomalies: TransformAnomaly[] } => {
  unmappedCategorySet.clear()

  const categoryMap = buildCategoryMap(mappingTable)
  const seen = new Set<string>()
  const skills: CanonicalSkill[] = []
  const anomalies: TransformAnomaly[] = []

  for (const sourceId of skillIds) {
    if (seen.has(sourceId)) continue
    seen.add(sourceId)

    const meta = skillMetadata[sourceId]
    if (!meta) {
      anomalies.push({
        officerId: '*',
        field: 'skill',
        value: sourceId,
        disposition: 'rejected',
        reason: `Skill "${sourceId}" has no metadata in skill_arr.`,
      })
      continue
    }

    // Resolve display name and description from lang_js[1]
    const name = languageMap[sourceId] ?? ''
    // Some skill descriptions may be outside the 4 authorized lang_1.js ranges.
    // Fall back to the skill name when no description is found.
    const rawDescription = languageMap[`${sourceId}des`]
    const description = rawDescription && rawDescription.trim() !== ''
      ? rawDescription
      : name || `技能 ${sourceId} 的說明暫未收錄`

    // Fall back to ID as display name when lang_js[1] key is not in authorized ranges
    const displayName = name || sourceId

    // Resolve categoryId from sourceCategoryId via mapping table.
    // For unmapped categories, auto-generate a category ID and warn once.
    let categoryId: string
    if (categoryMap.has(meta.sourceCategoryId)) {
      categoryId = categoryMap.get(meta.sourceCategoryId)!
    } else {
      categoryId = `skill_category_${meta.sourceCategoryId}`
      if (!unmappedCategorySet.has(meta.sourceCategoryId)) {
        unmappedCategorySet.add(meta.sourceCategoryId)
        anomalies.push({
          officerId: '*',
          field: 'skill.category',
          value: meta.sourceCategoryId,
          disposition: 'warning',
          reason: `Unmapped sourceCategoryId "${meta.sourceCategoryId}" — auto-generated category "${categoryId}".`,
        })
      }
    }

    skills.push({
      id: `skill_${sourceId}`,
      name: displayName,
      categoryId,
      description,
      iconId: null, // deferred to Phase 4
      sourceRefs: { voyageTw: sourceId },
    })
  }

  return { skills, anomalies }
}
