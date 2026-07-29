import type { SourceEnumValue, SkillMappingRecord } from '../data-audit/types'
import type {
  CanonicalOfficer,
  CanonicalSkillRelation,
  SourceOfficer,
  SourceSkillMetadata,
  TransformAnomaly,
} from './types'

// ── ID generation rules (matching canonical fixture naming) ──

/**
 * Canonical ID prefixes per source path.
 * These match the naming conventions in tests/fixtures/canonical/.
 */
const ID_RULES: Record<string, { prefix: string; transform?: (v: string) => string }> = {
  rank: { prefix: 'rarity_' },        // rarity_5
  type: { prefix: 'type_' },          // type_class_2
  gender: { prefix: 'gender_' },      // gender_f
  job: { prefix: 'job_' },            // job_jobchasT089
  // country → nationality (special: empty → nationality_unknown)
  city: { prefix: 'city_' },          // city_town4105
  'lang.*': { prefix: 'language_' },  // language_lang70
  req: { prefix: 'requirement_' },    // requirement_reqchasT089
  skill: { prefix: 'skill_' },        // skill_skill100043
}

/** Generate a canonical ID from a source path and source value. */
const canonicalId = (sourcePath: string, sourceValue: string): string => {
  // Country has a special prefix
  if (sourcePath === 'country') return `nationality_${sourceValue}`
  const rule = ID_RULES[sourcePath]
  if (rule) return rule.prefix + sourceValue
  // Fallback: just prefix with the path
  return `${sourcePath}_${sourceValue}`
}

// ── Enum verification ──

/**
 * Build a set of known sourcePath\0sourceValue pairs from the enum inventory.
 * Used only to detect unknown values — canonical ID generation is deterministic above.
 */
const buildKnownEnumSet = (enumInventory: SourceEnumValue[]): Set<string> => {
  const set = new Set<string>()
  for (const entry of enumInventory) {
    if (entry.status === 'rejected') continue
    // Also add the normalized dynamic path for lang keys
    set.add(`${entry.sourcePath}\0${entry.sourceValue}`)
    if (entry.sourcePath === 'lang.*') {
      set.add(`lang\0${entry.sourceValue}`)
    }
  }
  return set
}

// ── Skill mapping lookup ──

const buildMappingMap = (
  mappings: SkillMappingRecord[],
): Map<string, { kind: 'active' | 'passive'; categoryId: string }> => {
  const map = new Map<string, { kind: 'active' | 'passive'; categoryId: string }>()
  for (const m of mappings) {
    if (m.status !== 'approved') continue
    map.set(`${m.sourceGroup}\0${m.sourceCategoryId}`, { kind: m.kind, categoryId: m.categoryId })
  }
  return map
}

// ── Helpers ──

const OFFICER_ID_PATTERN = /^chas/i

const isOfficerShapedCity = (value: string): boolean => OFFICER_ID_PATTERN.test(value)

const checkKnown = (
  knownEnums: Set<string>,
  sourcePath: string,
  sourceValue: string,
  officerId: string,
  anomalies: TransformAnomaly[],
): void => {
  if (!knownEnums.has(`${sourcePath}\0${sourceValue}`)) {
    anomalies.push({
      officerId,
      field: sourcePath,
      value: sourceValue,
      disposition: 'warning',
      reason: `Unknown enum value "${sourceValue}" for path "${sourcePath}" — not in Phase 2 enum inventory.`,
    })
  }
}

// ── Main transform ──

export const transformOfficers = (
  sourceOfficers: Record<string, SourceOfficer>,
  languageMap: Record<string, string>,
  skillMetadata: Record<string, SourceSkillMetadata>,
  _fieldInventory: unknown,
  enumInventory: SourceEnumValue[],
  mappingTable: SkillMappingRecord[],
): { officers: CanonicalOfficer[]; anomalies: TransformAnomaly[] } => {
  const knownEnums = buildKnownEnumSet(enumInventory)
  const mappingMap = buildMappingMap(mappingTable)
  const officers: CanonicalOfficer[] = []
  const anomalies: TransformAnomaly[] = []

  let displayOrder = 0

  for (const [sourceId, src] of Object.entries(sourceOfficers)) {
    displayOrder += 1

    // Name: cht → languageMap → sourceId
    const name = src.cht || languageMap[sourceId] || sourceId

    // Canonical officer ID (lowercase the source ID)
    const officerId = `officer_${sourceId.toLowerCase()}`

    // Enum-backed fields
    const rarityId = canonicalId('rank', src.rank)
    checkKnown(knownEnums, 'rank', src.rank, sourceId, anomalies)

    const typeId = canonicalId('type', src.type)
    checkKnown(knownEnums, 'type', src.type, sourceId, anomalies)

    const genderId = canonicalId('gender', src.gender)
    checkKnown(knownEnums, 'gender', src.gender, sourceId, anomalies)

    const jobId = canonicalId('job', src.job)
    checkKnown(knownEnums, 'job', src.job, sourceId, anomalies)

    // Country: empty → unknown
    const nationalityId = src.country === '' ? 'nationality_unknown' : canonicalId('country', src.country)
    if (src.country !== '') checkKnown(knownEnums, 'country', src.country, sourceId, anomalies)

    // Languages
    const languages = Object.entries(src.lang).map(([langKey, levelStr]) => {
      checkKnown(knownEnums, 'lang.*', langKey, sourceId, anomalies)
      return {
        languageId: canonicalId('lang.*', langKey),
        level: parseInt(levelStr, 10) || 0,
      }
    })

    // Skills
    const skills = buildSkillRelations(
      src, sourceId, skillMetadata, mappingMap, anomalies,
    )

    // Recruitment
    const recruitment = {
      cityIds: (src.city || []).flatMap((cityValue) => {
        if (isOfficerShapedCity(cityValue)) {
          anomalies.push({
            officerId: sourceId,
            field: 'city',
            value: cityValue,
            disposition: 'rejected',
            reason: `Rejected: source city value ${cityValue} is officer-shaped; not a city.`,
          })
          return []
        }
        checkKnown(knownEnums, 'city', cityValue, sourceId, anomalies)
        return [canonicalId('city', cityValue)]
      }),
      requirementId: src.req && src.req !== ''
        ? (checkKnown(knownEnums, 'req', src.req, sourceId, anomalies),
           canonicalId('req', src.req))
        : null,
      requiredOfficerIds: src.char_reqs
        ? src.char_reqs.map((id) => `officer_${id.toLowerCase()}`)
        : src.req_char
          ? [`officer_${src.req_char.toLowerCase()}`]
          : [],
      note: src.note ?? null,
    }

    officers.push({
      id: officerId,
      name,
      rarityId,
      typeId,
      genderId,
      jobId,
      nationalityId,
      languages,
      skills,
      recruitment,
      portraitId: null,
      displayOrder,
      sourceRefs: { voyageTw: sourceId },
    })
  }

  return { officers, anomalies }
}

// ── Skill relationship builder ──

const buildSkillRelations = (
  src: SourceOfficer,
  sourceId: string,
  skillMetadata: Record<string, SourceSkillMetadata>,
  mappingMap: Map<string, { kind: 'active' | 'passive'; categoryId: string }>,
  anomalies: TransformAnomaly[],
): CanonicalSkillRelation[] => {
  const relations: CanonicalSkillRelation[] = []

  // Unlock level overrides
  const slvMap: Record<string, number> = {}
  if (src.slv) {
    for (const [skillId, value] of Object.entries(src.slv)) {
      const num = typeof value === 'number' ? value : parseInt(String(value), 10)
      if (!isNaN(num)) slvMap[skillId] = num
    }
  }

  // Duel skill level overrides (top-level skill<N> keys)
  const duelLevelMap: Record<string, number> = {}
  for (const [key, value] of Object.entries(src)) {
    const match = /^skill(\d+)$/.exec(key)
    if (match && value !== undefined && value !== null) {
      const duelLevel = typeof value === 'number' ? value : parseInt(String(value), 10)
      if (!isNaN(duelLevel)) duelLevelMap[match[0]] = duelLevel
    }
  }

  const groups: Array<'sk0' | 'sk1' | 'sk2' | 'sk3' | 'sk4' | 'sk5'> = [
    'sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5',
  ]

  for (const group of groups) {
    const groupSkills = src.skill[group]
    if (!groupSkills || typeof groupSkills !== 'object') continue

    let slot = 0
    for (const [skillSourceId, levelValue] of Object.entries(groupSkills)) {
      const meta = skillMetadata[skillSourceId]
      if (!meta) {
        anomalies.push({
          officerId: sourceId,
          field: `skill.${group}.${skillSourceId}`,
          value: String(levelValue),
          disposition: 'warning',
          reason: `Skill "${skillSourceId}" has no metadata in skill_arr.`,
        })
        slot += 1
        continue
      }

      const mappingKey = `${group}\0${meta.sourceCategoryId}`
      const mapping = mappingMap.get(mappingKey)
      if (!mapping) {
        anomalies.push({
          officerId: sourceId,
          field: `skill.${group}.${skillSourceId}`,
          value: `${group}/${meta.sourceCategoryId}`,
          disposition: 'warning',
          reason: `Unmapped sourceGroup/sourceCategoryId pair: ${group}/${meta.sourceCategoryId}.`,
        })
      }

      const baseLevel = levelValue === null ? 1
        : typeof levelValue === 'number' ? levelValue
        : parseInt(String(levelValue), 10) || 1

      const duelOverride = duelLevelMap[skillSourceId]
      const level = duelOverride ?? baseLevel

      const unlockLevel = slvMap[skillSourceId] ?? 1

      relations.push({
        skillId: `skill_${skillSourceId}`,
        kind: mapping?.kind ?? 'passive',
        sourceGroup: group,
        slot,
        unlockLevel,
        level,
      })

      slot += 1
    }
  }

  return relations
}
