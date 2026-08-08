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
  visualGradeId: string
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
  skillLevels?: Record<string, number> // skill ID → canonical level; absent means level 1
  searchAliases: string[] // name parts for search matching
}

// ── Skills dictionary (miniprogram/generated/skills.js) ──

export interface RuntimeSkill {
  id: string
  n: string // name
  cat: string // categoryId
  cn: string // categoryName
  ip: string // iconPath
  d: string // description
  li: string // levelInfo — compact per-level effect summary
}

// ── Fleet officer index (miniprogram/generated/fleet-officers.js) ──

export interface RuntimeFleetSkillRelation {
  skillId: string
  kind: 'active' | 'passive'
  categoryId: string
  unlockLevel: number
}

export interface RuntimeFleetOfficer {
  id: string
  name: string
  jobName: string
  rarityName: string
  portraitPath: string
  visualGradeId: string
  typeId: string
  genderId: string
  skills: RuntimeFleetSkillRelation[]
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
  nationalities: RuntimeDictionaryItem[]
  languages: RuntimeDictionaryItem[]
  cities: RuntimeDictionaryItem[]
  requirements: RuntimeDictionaryItem[]
  skillCategories: RuntimeDictionaryItem[]
}

// ── Dataset metadata (miniprogram/generated/dataset-meta.js) ──

export interface RuntimeDatasetMeta {
  officerCount: number
  skillCount: number
  contentVersion: string
}

// ── Asset dependencies (miniprogram/generated/asset-dependencies.js) ──

export interface RuntimeAssetRootDependency {
  root: string
  name: string
  officerIds: string[]
  files: string[]
}

export interface RuntimeAssetReference {
  path: string
  root: string
}

export interface RuntimeAssetDependencyIndex {
  roots: RuntimeAssetRootDependency[]
  pathToRoot: Record<string, string>
  skillIcons: Record<string, RuntimeAssetReference>
  officerPortraits: Record<string, RuntimeAssetReference>
  officerCatalogRoots: Record<string, string[]>
  officerDetailRoots: Record<string, string[]>
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
  ip: string // iconPath
  // The following fields are optional in generated detail shards;
  // they are patched at runtime from the shared skills.js dictionary.
  n?: string // name
  d?: string // description
  li?: string // levelInfo — compact per-level effect summary
}

export interface RuntimeDetailRecruitment {
  cn: string[] // cityNames
  rn: string | null // requirementName
  nt: string | null // note
}

export interface RuntimeDetailRecord {
  n: string // name
  rn: string // rarityName
  vg: string // visualGradeId
  ti: string // typeId
  gi: string // genderId
  tn: string // typeName
  gn: string // genderName
  jn: string // jobName
  nn: string // nationalityName
  pp: string // portraitPath
  ls: RuntimeDetailLanguage[]
  ss: RuntimeDetailSkill[]
  rc: RuntimeDetailRecruitment
}
