import { writeFileSync, mkdirSync } from 'node:fs'
import type { CanonicalOfficer, CanonicalSkill, DictionaryItem } from '../import/types'

// ── Helpers ──

const RARITY_STARS: Record<string, string> = {
  '1': '★', '2': '★★', '3': '★★★', '4': '★★★★',
  '5': '★★★★★', '6': '★★★★★★', '7': '★★★★★★★',
}

const rarityStar = (rarityId: string): string => {
  const num = rarityId.replace('rarity_', '')
  return RARITY_STARS[num] ?? rarityId
}

/** Strip canonical prefix like `language_` → bare ID `lang70`. */
const unprefix = (id: string): string => {
  const idx = id.indexOf('_')
  return idx >= 0 ? id.slice(idx + 1) : id
}

/** Portrait asset path from officer ID. */
const portraitPath = (officerId: string): string =>
  `/assets/${officerId}.png`

/** Skill icon path from skill ID. */
const iconPath = (skillId: string): string =>
  `/assets/${skillId.replace(/^skill_/, 'skill_')}.png`

// ── Catalog ──

export interface CatalogEntry {
  id: string
  name: string
  rarityId: string
  rarityName: string
  typeId: string
  typeName: string
  genderId: string
  genderLabel: string
  jobId: string
  jobName: string
  portraitPath: string
  languages: Array<{ languageId: string }>
  activeSkills: Array<{ id: string; name: string; iconPath: string }>
  passiveSkills: Array<{ id: string; name: string; iconPath: string }>
}

export const buildCatalog = (
  officers: CanonicalOfficer[],
  skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
): CatalogEntry[] => {
  const skillMap = new Map(skills.map((s) => [s.id, s]))
  const dictName = (group: string, id: string): string =>
    dictionaries[group]?.find((d) => d.id === id)?.name ?? unprefix(id)

  return officers.map((o) => {
    const activeSkills: CatalogEntry['activeSkills'] = []
    const passiveSkills: CatalogEntry['passiveSkills'] = []

    for (const rel of o.skills) {
      const sk = skillMap.get(rel.skillId)
      const entry = { id: rel.skillId, name: sk?.name ?? rel.skillId, iconPath: iconPath(rel.skillId) }
      if (rel.kind === 'active') activeSkills.push(entry)
      else passiveSkills.push(entry)
    }

    return {
      id: o.id,
      name: o.name,
      rarityId: o.rarityId,
      rarityName: rarityStar(o.rarityId),
      typeId: o.typeId,
      typeName: dictName('types', o.typeId),
      genderId: o.genderId,
      genderLabel: unprefix(o.genderId),
      jobId: o.jobId,
      jobName: dictName('jobs', o.jobId),
      portraitPath: portraitPath(o.id),
      languages: o.languages.map((l) => ({ languageId: unprefix(l.languageId) })),
      activeSkills,
      passiveSkills,
    }
  })
}

// ── Details ──

export interface DetailSkillEntry {
  skillId: string
  kind: string
  sourceGroup: string
  slot: number
  unlockLevel: number
  level: number
  name: string
  categoryName: string
  categoryId: string
  iconPath: string
}

export interface DetailEntry {
  id: string
  name: string
  rarityId: string
  rarityName: string
  typeId: string
  typeName: string
  genderId: string
  genderName: string
  jobId: string
  jobName: string
  nationalityId: string
  nationalityName: string
  portraitPath: string
  languages: Array<{ languageId: string; level: number }>
  skills: DetailSkillEntry[]
  recruitment: {
    cityIds: string[]
    cityNames: string[]
    requirementId: string | null
    requirementName: string | null
    requiredOfficerIds: string[]
    note: string | null
  }
}

export const buildDetails = (
  officers: CanonicalOfficer[],
  skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
): Record<string, DetailEntry> => {
  const skillMap = new Map(skills.map((s) => [s.id, s]))
  const dictName = (group: string, id: string): string =>
    dictionaries[group]?.find((d) => d.id === id)?.name ?? id

  const result: Record<string, DetailEntry> = {}

  for (const o of officers) {
    result[o.id] = {
      id: o.id,
      name: o.name,
      rarityId: o.rarityId,
      rarityName: rarityStar(o.rarityId),
      typeId: o.typeId,
      typeName: dictName('types', o.typeId),
      genderId: o.genderId,
      genderName: dictName('genders', o.genderId),
      jobId: o.jobId,
      jobName: dictName('jobs', o.jobId),
      nationalityId: o.nationalityId,
      nationalityName: dictName('nationalities', o.nationalityId),
      portraitPath: portraitPath(o.id),
      languages: o.languages.map((l) => ({
        languageId: unprefix(l.languageId),
        level: l.level,
      })),
      skills: o.skills.map((rel) => {
        const sk = skillMap.get(rel.skillId)
        return {
          skillId: rel.skillId,
          kind: rel.kind,
          sourceGroup: rel.sourceGroup,
          slot: rel.slot,
          unlockLevel: rel.unlockLevel,
          level: rel.level,
          name: sk?.name ?? rel.skillId,
          categoryName: dictName('skillCategories', sk?.categoryId ?? ''),
          categoryId: sk?.categoryId ?? '',
          iconPath: iconPath(rel.skillId),
        }
      }),
      recruitment: {
        cityIds: o.recruitment.cityIds.map(unprefix),
        cityNames: o.recruitment.cityIds.map((id) => dictName('cities', id)),
        requirementId: o.recruitment.requirementId,
        requirementName: o.recruitment.requirementId
          ? dictName('requirements', o.recruitment.requirementId)
          : null,
        requiredOfficerIds: o.recruitment.requiredOfficerIds,
        note: o.recruitment.note,
      },
    }
  }

  return result
}

// ── Skills (runtime) ──

export interface RuntimeSkill {
  id: string
  name: string
  catName: string
  categoryId: string
  iconPath: string
}

export const buildSkills = (
  skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
): RuntimeSkill[] => {
  const dictName = (group: string, id: string): string =>
    dictionaries[group]?.find((d) => d.id === id)?.name ?? id

  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    catName: dictName('skillCategories', s.categoryId),
    categoryId: s.categoryId,
    iconPath: iconPath(s.id),
  }))
}

// ── Dictionaries (runtime) ──

export interface RuntimeDictItem {
  id: string
  name: string
}

export interface RuntimeDictionaries {
  rarities: RuntimeDictItem[]
  types: RuntimeDictItem[]
  genders: RuntimeDictItem[]
  jobs: RuntimeDictItem[]
  languages: RuntimeDictItem[]
  skillCategories: RuntimeDictItem[]
}

export const buildDictionaries = (
  _officers: CanonicalOfficer[],
  _skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
): RuntimeDictionaries => {
  const map = (group: string): RuntimeDictItem[] =>
    (dictionaries[group] ?? []).map((d) => ({
      id: d.id,
      name: group === 'rarities' ? rarityStar(d.id) : d.name,
    }))

  return {
    rarities: map('rarities'),
    types: map('types'),
    genders: map('genders'),
    jobs: map('jobs'),
    languages: map('languages').map((l) => ({ ...l, id: unprefix(l.id) })),
    skillCategories: map('skillCategories'),
  }
}

// ── Write all runtime files ──

export const writeRuntimeData = (
  officers: CanonicalOfficer[],
  skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
  outputDir: string,
): void => {
  mkdirSync(outputDir, { recursive: true })

  const catalog = buildCatalog(officers, skills, dictionaries)
  const details = buildDetails(officers, skills, dictionaries)
  const runtimeSkills = buildSkills(skills, dictionaries)
  const runtimeDicts = buildDictionaries(officers, skills, dictionaries)

  const write = (name: string, data: unknown) =>
    writeFileSync(`${outputDir}/${name}.js`, `module.exports = ${JSON.stringify(data)}\n`)

  write('catalog', catalog)
  write('details', details)
  write('skills', runtimeSkills)
  write('dictionaries', runtimeDicts)

  console.log(`Runtime data written to ${outputDir}/`)
  console.log(`  catalog.js: ${catalog.length} officers`)
  console.log(`  details.js: ${Object.keys(details).length} entries`)
  console.log(`  skills.js: ${runtimeSkills.length}`)
  console.log(`  dictionaries.js: rarities=${runtimeDicts.rarities.length}, types=${runtimeDicts.types.length}, genders=${runtimeDicts.genders.length}, jobs=${runtimeDicts.jobs.length}, languages=${runtimeDicts.languages.length}, categories=${runtimeDicts.skillCategories.length}`)
}
