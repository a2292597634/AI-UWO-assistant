/**
 * Runtime Data Contract
 *
 * Shared type definitions for the generated runtime data consumed by the
 * WeChat Mini Program. This file is the single source of truth for both the
 * data pipeline (tools/data-pipeline/) and the runtime stores/presenters.
 *
 * IMPORTANT: These types mirror the ACTUAL generated output in
 * miniprogram/generated/ and miniprogram/subpkg-detail/. Any discrepancy
 * between these types and the real generated files must be resolved by
 * updating this file to match reality — never by silently mutating the data.
 */

// ── Catalog (miniprogram/generated/catalog.js) ──

export interface RuntimeCatalogEntry {
  id: string
  name: string
  rarityId: string
  rarityName: string // grade letter: S/A/B/C
  rarityClass: string // CSS class suffix for badge color
  typeId: string
  typeName: string
  genderId: string
  genderLabel: string
  jobId: string
  jobName: string
  portraitPath: string
  languages: string[] // language IDs (short form, no prefix)
  activeSkills: string[] // skill IDs
  passiveSkills: string[] // skill IDs
  searchAliases: string[] // name parts for search matching
}

// ── Skills dictionary (miniprogram/generated/skills.js) ──

export interface RuntimeSkill {
  id: string
  n: string // name
  cat: string // categoryId
  ip: string // iconPath
  d: string // description
  li: string // levelInfo — compact per-level effect summary
}

// ── Dictionaries (miniprogram/generated/dictionaries.js) ──

export interface RuntimeDictionaryItem {
  id: string
  name: string
}

export interface RuntimeDictionaries {
  rarities: RuntimeDictionaryItem[]
  types: RuntimeDictionaryItem[]
  genders: RuntimeDictionaryItem[]
  jobs: RuntimeDictionaryItem[]
  languages: RuntimeDictionaryItem[]
  skillCategories: RuntimeDictionaryItem[]
}

// ── Dataset metadata (miniprogram/generated/dataset-meta.js) ──

export interface RuntimeDatasetMeta {
  officerCount: number
  skillCount: number
  contentVersion: string
}

// ── Detail records (miniprogram/subpkg-detail/details-N.js) ──
//
// Compact field names:
//   n  = name,  rn = rarityName,  tn = typeName
//   gn = genderName,  jn = jobName,  nn = nationalityName
//   pp = portraitPath,  ls = languages,  ss = skills,  rc = recruitment
//   li = languageId,  lv = level
//   si = skillId,  k  = kind,  ul = unlockLevel,  ip = iconPath
//   cn = cityNames,  rn = requirementName,  nt = note

export interface RuntimeDetailLanguage {
  li: string // languageId
  lv: number // level
  n: string // name
}

export interface RuntimeDetailSkill {
  si: string // skillId
  k: 'active' | 'passive' // kind
  ul: number // unlockLevel
  lv: number // level
  n: string // name
  ip: string // iconPath
  d: string // description
  li: string // levelInfo — compact per-level effect summary
}

export interface RuntimeDetailRecruitment {
  cn: string[] // cityNames
  rn: string | null // requirementName
  nt: string | null // note
}

export interface RuntimeDetailRecord {
  n: string // name
  rn: string // rarityName
  tn: string // typeName
  gn: string // genderName
  jn: string // jobName
  nn: string // nationalityName
  pp: string // portraitPath
  ls: RuntimeDetailLanguage[]
  ss: RuntimeDetailSkill[]
  rc: RuntimeDetailRecruitment
}
