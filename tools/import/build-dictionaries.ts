import type { CanonicalOfficer, CanonicalSkill, DictionaryItem, TransformAnomaly } from './types'

// ── Dictionary group definitions ──

interface DictGroup {
  /** Key name in the output dictionaries object. */
  key: string
  /** Function to extract canonical IDs from officers. */
  extractFromOfficer: (o: CanonicalOfficer) => string[]
  /** Function to extract canonical IDs from skills. */
  extractFromSkill: (s: CanonicalSkill) => string[]
  /** Source value pattern to strip from canonical ID to get the lookup key. */
  idPrefix: string
}

const DICT_GROUPS: DictGroup[] = [
  {
    key: 'rarities',
    extractFromOfficer: (o) => [o.rarityId],
    extractFromSkill: () => [],
    idPrefix: 'rarity_',
  },
  {
    key: 'types',
    extractFromOfficer: (o) => [o.typeId],
    extractFromSkill: () => [],
    idPrefix: 'type_',
  },
  {
    key: 'genders',
    extractFromOfficer: (o) => [o.genderId],
    extractFromSkill: () => [],
    idPrefix: 'gender_',
  },
  {
    key: 'jobs',
    extractFromOfficer: (o) => [o.jobId],
    extractFromSkill: () => [],
    idPrefix: 'job_',
  },
  {
    key: 'nationalities',
    extractFromOfficer: (o) => [o.nationalityId],
    extractFromSkill: () => [],
    idPrefix: 'nationality_',
  },
  {
    key: 'languages',
    extractFromOfficer: (o) => o.languages.map((l) => l.languageId),
    extractFromSkill: () => [],
    idPrefix: 'language_',
  },
  {
    key: 'cities',
    extractFromOfficer: (o) => o.recruitment.cityIds,
    extractFromSkill: () => [],
    idPrefix: 'city_',
  },
  {
    key: 'requirements',
    extractFromOfficer: (o) => (o.recruitment.requirementId ? [o.recruitment.requirementId] : []),
    extractFromSkill: () => [],
    idPrefix: 'requirement_',
  },
  {
    key: 'skillCategories',
    extractFromOfficer: () => [],
    extractFromSkill: (s) => [s.categoryId],
    idPrefix: 'skill_category_',
  },
]

// ── Name resolution ──

/** Hardcoded rarity star mapping. */
const RARITY_STARS: Record<string, string> = {
  '1': '★',
  '2': '★★',
  '3': '★★★',
  '4': '★★★★',
  '5': '★★★★★',
  '6': '★★★★★★',
  '7': '★★★★★★★',
}

/**
 * Look up a display name for a dictionary item.
 *
 * Priority:
 * 1. lang_js[1] lookup with the source value (e.g., "town4105" → "倫敦")
 * 2. lang_js[1] lookup with the full canonical ID
 * 3. Hardcoded mappings (rarity stars, gender labels)
 * 4. Canonical ID as fallback
 */
const resolveDictName = (
  sourceValue: string,
  canonicalId: string,
  groupKey: string,
  languageMap: Record<string, string>,
): string => {
  // Try direct source value lookup
  if (languageMap[sourceValue]) return languageMap[sourceValue]

  // Try canonical ID lookup
  if (languageMap[canonicalId]) return languageMap[canonicalId]

  // Hardcoded fallbacks
  if (groupKey === 'rarities') return RARITY_STARS[sourceValue] ?? `★×${sourceValue}`
  if (groupKey === 'genders')
    return sourceValue === 'f' ? '女性' : sourceValue === 'm' ? '男性' : sourceValue
  if (groupKey === 'nationalities' && (sourceValue === 'unknown' || sourceValue === ''))
    return '未知'

  // Fallback: use the canonical ID itself
  return canonicalId
}

// ── Main builder ──

export const buildDictionaries = (
  officers: CanonicalOfficer[],
  skills: CanonicalSkill[],
  languageMap: Record<string, string>,
): { dictionaries: Record<string, DictionaryItem[]>; anomalies: TransformAnomaly[] } => {
  const dictionaries: Record<string, DictionaryItem[]> = {}
  const anomalies: TransformAnomaly[] = []

  for (const group of DICT_GROUPS) {
    const seenIds = new Set<string>()
    const items: DictionaryItem[] = []

    // Collect IDs from officers
    for (const officer of officers) {
      for (const id of group.extractFromOfficer(officer)) {
        if (id && !seenIds.has(id)) {
          seenIds.add(id)
          const rawSource = id.startsWith(group.idPrefix) ? id.slice(group.idPrefix.length) : id
          // Use placeholder for empty source values (required by schema minLength:1)
          const sourceValue = rawSource === '' ? '_unknown' : rawSource
          items.push({
            id,
            name: resolveDictName(sourceValue, id, group.key, languageMap),
            displayOrder: items.length,
            sourceRefs: { voyageTw: sourceValue },
          })
        }
      }
    }

    // Collect IDs from skills
    for (const skill of skills) {
      for (const id of group.extractFromSkill(skill)) {
        if (id && !seenIds.has(id)) {
          seenIds.add(id)
          const rawSource = id.startsWith(group.idPrefix) ? id.slice(group.idPrefix.length) : id
          // Use placeholder for empty source values (required by schema minLength:1)
          const sourceValue = rawSource === '' ? '_unknown' : rawSource
          items.push({
            id,
            name: resolveDictName(sourceValue, id, group.key, languageMap),
            displayOrder: items.length,
            sourceRefs: { voyageTw: sourceValue },
          })
        }
      }
    }

    dictionaries[group.key] = items
  }

  return { dictionaries, anomalies }
}
