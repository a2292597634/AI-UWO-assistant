import type { SkillMappingRecord } from '../data-audit/types'
import type { CanonicalSkill, SourceSkillMetadata, TransformAnomaly } from './types'

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
    const description = languageMap[`${sourceId}des`] ?? ''

    if (!name) {
      anomalies.push({
        officerId: '*',
        field: 'skill.name',
        value: sourceId,
        disposition: 'warning',
        reason: `Skill "${sourceId}" has no display name in lang_js[1].`,
      })
    }

    // Resolve categoryId from sourceCategoryId via mapping table
    const categoryId = categoryMap.get(meta.sourceCategoryId) ?? 'skill_category_unknown'

    if (!categoryMap.has(meta.sourceCategoryId)) {
      anomalies.push({
        officerId: '*',
        field: 'skill.category',
        value: meta.sourceCategoryId,
        disposition: 'warning',
        reason: `Skill "${sourceId}" has unmapped sourceCategoryId "${meta.sourceCategoryId}".`,
      })
    }

    skills.push({
      id: `skill_${sourceId}`,
      name,
      categoryId,
      description,
      iconId: null, // deferred to Phase 4
      sourceRefs: { voyageTw: sourceId },
    })
  }

  return { skills, anomalies }
}
