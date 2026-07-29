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

/** Deterministic shard index for an image filename. */
const shardFor = (filename: string): number => {
  const id = filename.replace(/\.png$/, '').replace(/^(officer|skill)_/, '')
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = ((hash * 31 + id.charCodeAt(i)) >>> 0)
  return hash % 10
}

/** Portrait asset path from officer ID. */
const portraitPath = (officerId: string): string => {
  const filename = `${officerId}.png`
  return `/subpkg-a${shardFor(filename)}/imgs/${filename}`
}

/** Skill icon path from skill ID. */
const iconPath = (skillId: string): string => {
  const filename = `${skillId.replace(/^skill_/, 'skill_')}.png`
  return `/subpkg-a${shardFor(filename)}/imgs/${filename}`
}

// ── Catalog (compact: skill IDs only, names/icons looked up from skills.js) ──

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
  languages: string[]  // just language IDs (short form, no prefix)
  activeSkills: string[]  // just skill IDs
  passiveSkills: string[]  // just skill IDs
}

export const buildCatalog = (
  officers: CanonicalOfficer[],
  _skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
): CatalogEntry[] => {
  const dictName = (group: string, id: string): string =>
    dictionaries[group]?.find((d) => d.id === id)?.name ?? unprefix(id)

  return officers.map((o) => ({
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
    languages: o.languages.map((l) => unprefix(l.languageId)),
    activeSkills: o.skills.filter((r) => r.kind === 'active').map((r) => r.skillId),
    passiveSkills: o.skills.filter((r) => r.kind === 'passive').map((r) => r.skillId),
  }))
}

// ── Details (compact: short field names to fit subpackage 2 MB limit) ──
// Field map: i=id, n=name, ri=rarityId, rn=rarityName, ti=typeId, tn=typeName
//   gi=genderId, gn=genderName, ji=jobId, jn=jobName, ni=nationalityId, nn=nationalityName
//   pp=portraitPath, ls=languages, ss=skills, rc=recruitment
//   li=languageId, lv=level, si=skillId, k=kind, sg=sourceGroup, sl=slot
//   ul=unlockLevel, ci=cityIds/requirementId/categoryId, cn=cityNames/categoryName/requirementName
//   ro=requiredOfficerIds, nt=note, ip=iconPath

export interface DetailEntryCompact {
  i: string   // id
  n: string   // name
  ri: string  // rarityId
  rn: string  // rarityName
  ti: string  // typeId
  tn: string  // typeName
  gi: string  // genderId
  gn: string  // genderName
  ji: string  // jobId
  jn: string  // jobName
  ni: string  // nationalityId
  nn: string  // nationalityName
  pp: string  // portraitPath
  ls: Array<{ li: string; lv: number; n: string }>
  ss: Array<{
    si: string; k: string; sg: string; sl: number
    ul: number; lv: number; n: string; cn: string; ci: string; ip: string
  }>
  rc: {
    ci: string[]; cn: string[]; ri: string | null; rn: string | null
    ro: string[]; nt: string | null
  }
}

export const buildDetails = (
  officers: CanonicalOfficer[],
  skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
): Record<string, DetailEntryCompact> => {
  const skillMap = new Map(skills.map((s) => [s.id, s]))
  const dictName = (group: string, id: string): string =>
    dictionaries[group]?.find((d) => d.id === id)?.name ?? id

  const result: Record<string, DetailEntryCompact> = {}

  for (const o of officers) {
    result[o.id] = {
      i: o.id,
      n: o.name,
      ri: o.rarityId,
      rn: rarityStar(o.rarityId),
      ti: o.typeId,
      tn: dictName('types', o.typeId),
      gi: o.genderId,
      gn: dictName('genders', o.genderId),
      ji: o.jobId,
      jn: dictName('jobs', o.jobId),
      ni: o.nationalityId,
      nn: dictName('nationalities', o.nationalityId),
      pp: portraitPath(o.id),
      ls: o.languages.map((l) => ({
        li: unprefix(l.languageId),
        lv: l.level,
        n: dictName('languages', l.languageId),
      })),
      ss: o.skills.map((rel) => {
        const sk = skillMap.get(rel.skillId)
        return {
          si: rel.skillId,
          k: rel.kind,
          sg: rel.sourceGroup,
          sl: rel.slot,
          ul: rel.unlockLevel,
          lv: rel.level,
          n: sk?.name ?? rel.skillId,
          cn: dictName('skillCategories', sk?.categoryId ?? ''),
          ci: sk?.categoryId ?? '',
          ip: iconPath(rel.skillId),
        }
      }),
      rc: {
        ci: o.recruitment.cityIds.map(unprefix),
        cn: o.recruitment.cityIds.map((id) => dictName('cities', id)),
        ri: o.recruitment.requirementId,
        rn: o.recruitment.requirementId
          ? dictName('requirements', o.recruitment.requirementId)
          : null,
        ro: o.recruitment.requiredOfficerIds,
        nt: o.recruitment.note,
      },
    }
  }

  return result
}

// ── Skills (runtime, compact: dictionary format for fast lookup) ──

export interface RuntimeSkill {
  id: string
  n: string    // name
  cat: string  // categoryId
  ip: string   // iconPath
}

export const buildSkills = (
  skills: CanonicalSkill[],
  _dictionaries: Record<string, DictionaryItem[]>,
): Record<string, RuntimeSkill> => {
  const result: Record<string, RuntimeSkill> = {}
  for (const s of skills) {
    result[s.id] = {
      id: s.id,
      n: s.name,
      cat: s.categoryId,
      ip: iconPath(s.id),
    }
  }
  return result
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
  const runtimeSkills = buildSkills(skills, dictionaries)
  const runtimeDicts = buildDictionaries(officers, skills, dictionaries)

  const write = (name: string, data: unknown) =>
    writeFileSync(`${outputDir}/${name}.js`, `module.exports = ${JSON.stringify(data)}\n`)

  write('catalog', catalog)
  write('skills', runtimeSkills) // dict format: {skillId: {id,n,cat,ip}, ...}
  write('dictionaries', runtimeDicts)
  // Note: details.js is written separately to the detail subpackage

  console.log(`Runtime data written to ${outputDir}/`)
  console.log(`  catalog.js: ${catalog.length} officers`)
  console.log(`  skills.js: ${Object.keys(runtimeSkills).length} entries (dict format)`)
  console.log(`  dictionaries.js: rarities=${runtimeDicts.rarities.length}, types=${runtimeDicts.types.length}, genders=${runtimeDicts.genders.length}, jobs=${runtimeDicts.jobs.length}, languages=${runtimeDicts.languages.length}, categories=${runtimeDicts.skillCategories.length}`)
}
