import { writeFileSync, mkdirSync } from 'node:fs'
import type { CanonicalOfficer, CanonicalSkill, DictionaryItem } from '../import/types'
import type { AssetDependencyIndex } from './asset-dependencies'
import type {
  RuntimeCatalogEntry,
  RuntimeSkill,
  RuntimeFleetOfficer,
  RuntimeDictionaryItem,
  RuntimeDictionaries,
  RuntimeDetailRecord,
} from '../../miniprogram/contracts/runtime-data'

export interface RuntimeAssetUrlManifest {
  releaseId: string
  contentVersion?: string
  cdnOrigin: string
  cloudPathPrefix?: string
  assets: Array<{ filename: string; publicUrl: string }>
}

// ── Helpers ──

/** Rarity grade letters: S (best) → A → B → C (worst). */
const RARITY_GRADE: Record<string, string> = {
  '2': 'C',
  '3': 'B',
  '4': 'A',
  '5': 'S',
  '6': 'S',
  '7': 'S',
}

const rarityGrade = (rarityId: string): string => {
  const num = rarityId.replace('rarity_', '')
  return RARITY_GRADE[num] ?? 'C'
}

/** CSS class suffix for rarity-grade badge color. */
const rarityClass = (rarityId: string): string => {
  return rarityGrade(rarityId).toLowerCase()
}

/** Strip canonical prefix like `language_` → bare ID `lang70`. */
const unprefix = (id: string): string => {
  const idx = id.indexOf('_')
  return idx >= 0 ? id.slice(idx + 1) : id
}

/** Portrait asset path from officer ID. */
const legacyPortraitPath = (officerId: string): string => {
  const filename = `${officerId}.png`
  return `/subpkg-assets-0/imgs/${filename}`
}

const filenameFromPath = (path: string): string => path.split('/').pop() ?? path

const publicAssetUrl = (
  filename: string,
  manifest?: RuntimeAssetUrlManifest,
): string | undefined => {
  if (!manifest) return undefined
  const asset = manifest.assets.find((entry) => entry.filename === filename)
  if (!asset) throw new Error(`published asset manifest is missing ${filename}`)
  let origin: URL
  let publicUrl: URL
  try {
    origin = new URL(manifest.cdnOrigin)
    publicUrl = new URL(asset.publicUrl)
  } catch {
    throw new Error(`CloudBase CDN origin is invalid: ${manifest.cdnOrigin}`)
  }
  const cloudPathPrefix = manifest.cloudPathPrefix ?? 'assets'
  const expectedPathPrefix = `/${cloudPathPrefix}/${manifest.releaseId}/`
  if (
    origin.protocol !== 'https:' ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*\.tcb\.qcloud\.la$/i.test(origin.hostname) ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(`CloudBase CDN origin is invalid: ${manifest.cdnOrigin}`)
  }
  if (
    publicUrl.protocol !== 'https:' ||
    publicUrl.origin !== origin.origin ||
    publicUrl.search ||
    publicUrl.hash ||
    !publicUrl.pathname.startsWith(expectedPathPrefix)
  ) {
    throw new Error(`asset publicUrl is outside the configured CloudBase CDN release: ${filename}`)
  }
  return asset.publicUrl
}

const resolvedPortraitPath = (
  officerId: string,
  dependencies?: AssetDependencyIndex,
  manifest?: RuntimeAssetUrlManifest,
): string => {
  const path = dependencies?.officerPortraits[officerId]?.path ?? legacyPortraitPath(officerId)
  try {
    return publicAssetUrl(filenameFromPath(path), manifest) ?? path
  } catch (err) {
    // 仅当错误是"资源不在 CDN 清单中"时才回退到本地路径
    // 其他错误（如 CDN origin 无效）仍需抛出
    if (err instanceof Error && err.message.includes('missing')) {
      return path
    }
    throw err
  }
}

/** Skill icon path from skill ID, with fallback for variant skills. */
const iconPath = (
  skillId: string,
  iconSet: Set<string>,
  categoryFallback: Map<string, string>,
  categoryId: string,
  globalFallback?: string,
  dependencies?: AssetDependencyIndex,
  manifest?: RuntimeAssetUrlManifest,
): string => {
  const mapped = dependencies?.skillIcons[skillId]?.path
  if (mapped) return publicAssetUrl(filenameFromPath(mapped), manifest) ?? mapped
  const filename = `${skillId}.png`
  if (iconSet.has(filename)) {
    return publicAssetUrl(filename, manifest) ?? `/subpkg-assets-0/imgs/${filename}`
  }
  // Variant skill (e.g. skillT*) — use category fallback, then global fallback
  const catFB = categoryFallback.get(categoryId)
  if (catFB) {
    const localPath = catFB.replace(/^\/subpkg-a\d\//, '/subpkg-assets-0/')
    return publicAssetUrl(filenameFromPath(localPath), manifest) ?? localPath
  }
  if (globalFallback) {
    const localPath = globalFallback.replace(/^\/subpkg-a\d\//, '/subpkg-assets-0/')
    return publicAssetUrl(filenameFromPath(localPath), manifest) ?? localPath
  }
  if (manifest) return ''
  return publicAssetUrl(filename, manifest) ?? `/subpkg-assets-0/imgs/${filename}`
}

// ── Catalog (compact: skill IDs only, names/icons looked up from skills.js) ──

export type { RuntimeCatalogEntry } from '../../miniprogram/contracts/runtime-data'

export const buildCatalog = (
  officers: CanonicalOfficer[],
  _skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
  dependencies?: AssetDependencyIndex,
  manifest?: RuntimeAssetUrlManifest,
): RuntimeCatalogEntry[] => {
  const dictName = (group: string, id: string): string =>
    dictionaries[group]?.find((d) => d.id === id)?.name ?? unprefix(id)

  return officers.map((o) => {
    // Generate search aliases from name parts
    const nameTrimmed = o.name.trim()
    const aliases = [nameTrimmed]
    const parts = nameTrimmed.split(/[·\s]+/)
    for (const part of parts) {
      if (part.length > 1 && aliases.indexOf(part) < 0) {
        aliases.push(part)
      }
    }

    const skillLevels: Record<string, number> = {}
    for (const relation of o.skills) {
      if (relation.unlockLevel !== 1) {
        skillLevels[relation.skillId] = relation.unlockLevel
      }
    }

    return {
      id: o.id,
      name: nameTrimmed,
      rarityId: o.rarityId,
      rarityName: rarityGrade(o.rarityId),
      rarityClass: rarityClass(o.rarityId),
      visualGradeId: o.visualGradeId,
      typeId: o.typeId,
      typeName: dictName('types', o.typeId),
      genderId: o.genderId,
      genderLabel: dictName('genders', o.genderId),
      jobId: o.jobId,
      jobName: dictName('jobs', o.jobId),
      portraitPath: resolvedPortraitPath(o.id, dependencies, manifest),
      languages: o.languages.map((l) => unprefix(l.languageId)),
      activeSkills: o.skills.filter((r) => r.kind === 'active').map((r) => r.skillId),
      passiveSkills: o.skills.filter((r) => r.kind === 'passive').map((r) => r.skillId),
      skillLevels: Object.keys(skillLevels).length > 0 ? skillLevels : undefined,
      searchAliases: aliases,
    }
  })
}

const isBattleFleetRelation = (kind: 'active' | 'passive', categoryId: string): boolean => {
  if (kind === 'active') return categoryId.startsWith('skill_category_naval_active_')
  return (
    categoryId.startsWith('skill_category_naval_passive_') ||
    categoryId === 'skill_category_combat_other'
  )
}

export const buildFleetOfficers = (
  officers: CanonicalOfficer[],
  skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
  dependencies?: AssetDependencyIndex,
  manifest?: RuntimeAssetUrlManifest,
): RuntimeFleetOfficer[] => {
  const skillMap = new Map(skills.map((skill) => [skill.id, skill]))
  const dictName = (group: string, id: string): string =>
    dictionaries[group]?.find((item) => item.id === id)?.name ?? unprefix(id)

  return officers.map((officer) => ({
    id: officer.id,
    name: officer.name.trim(),
    jobName: dictName('jobs', officer.jobId),
    rarityName: rarityGrade(officer.rarityId),
    portraitPath: resolvedPortraitPath(officer.id, dependencies, manifest),
    visualGradeId: officer.visualGradeId,
    typeId: officer.typeId,
    genderId: officer.genderId,
    skills: officer.skills
      .map((relation) => ({ ...relation, categoryId: skillMap.get(relation.skillId)?.categoryId }))
      .filter(
        (relation): relation is typeof relation & { categoryId: string } =>
          typeof relation.categoryId === 'string' &&
          isBattleFleetRelation(relation.kind, relation.categoryId),
      )
      .map((relation) => ({
        skillId: relation.skillId,
        kind: relation.kind,
        categoryId: relation.categoryId,
        unlockLevel: relation.unlockLevel,
      })),
  }))
}

// Re-export contract types used by downstream consumers and tests
export type { RuntimeDetailRecord } from '../../miniprogram/contracts/runtime-data'

export const buildDetails = (
  officers: CanonicalOfficer[],
  skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
  iconSet?: Set<string>,
  categoryFallback?: Map<string, string>,
  globalFallback?: string,
  dependencies?: AssetDependencyIndex,
  manifest?: RuntimeAssetUrlManifest,
): Record<string, RuntimeDetailRecord> => {
  const skillMap = new Map(skills.map((s) => [s.id, s]))
  const dictName = (group: string, id: string): string =>
    dictionaries[group]?.find((d) => d.id === id)?.name ?? id
  const _iconSet = iconSet ?? new Set<string>()
  const _catFB = categoryFallback ?? new Map<string, string>()

  const result: Record<string, RuntimeDetailRecord> = {}

  for (const o of officers) {
    result[o.id] = {
      n: o.name,
      rn: rarityGrade(o.rarityId),
      vg: o.visualGradeId,
      ti: o.typeId,
      gi: o.genderId,
      tn: dictName('types', o.typeId),
      gn: dictName('genders', o.genderId),
      jn: dictName('jobs', o.jobId),
      nn: dictName('nationalities', o.nationalityId),
      pp: resolvedPortraitPath(o.id, dependencies, manifest),
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
          ul: rel.unlockLevel,
          lv: rel.level,
          ip: iconPath(
            rel.skillId,
            _iconSet,
            _catFB,
            sk?.categoryId ?? '',
            globalFallback,
            dependencies,
            manifest,
          ),
        }
      }),
      rc: {
        cn: o.recruitment.cityIds.map((id) => dictName('cities', id)),
        rn: o.recruitment.requirementId
          ? dictName('requirements', o.recruitment.requirementId)
          : null,
        nt: o.recruitment.note,
      },
    }
  }

  return result
}

/** Shard an officer ID for chunked detail files. */
const detailShard = (officerId: string): number => {
  const filename = `${officerId}.png`
  const id = filename.replace(/\.png$/, '').replace(/^(officer|skill)_/, '')
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return hash % 10
}

/** Write sharded detail files (one chunk per shard) for lazy loading. */
export const writeShardedDetails = (
  officers: CanonicalOfficer[],
  skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
  outputDir: string,
  iconSet?: Set<string>,
  categoryFallback?: Map<string, string>,
  globalFallback?: string,
  dependencies?: AssetDependencyIndex,
  manifest?: RuntimeAssetUrlManifest,
): void => {
  const all = buildDetails(
    officers,
    skills,
    dictionaries,
    iconSet,
    categoryFallback,
    globalFallback,
    dependencies,
    manifest,
  )

  // Group by shard
  const shards: Record<string, RuntimeDetailRecord>[] = Array.from({ length: 10 }, () => ({}))
  for (const [id, entry] of Object.entries(all)) {
    shards[detailShard(id)]![id] = entry
  }

  // Write each shard
  for (let s = 0; s < 10; s++) {
    const count = Object.keys(shards[s]!).length
    writeFileSync(`${outputDir}/details-${s}.js`, `module.exports = ${JSON.stringify(shards[s])}\n`)
    console.log(`  subpkg-detail/details-${s}.js: ${count} entries`)
  }
}

/** Write detail-index.js: maps every officer ID → shard number. */
export const writeDetailIndex = (officers: CanonicalOfficer[], outputDir: string): void => {
  const index: Record<string, number> = {}
  for (const o of officers) {
    index[o.id] = detailShard(o.id)
  }
  writeFileSync(`${outputDir}/detail-index.js`, `module.exports = ${JSON.stringify(index)}\n`)
  console.log(`  subpkg-detail/detail-index.js: ${Object.keys(index).length} entries`)
}

/** Write detail-loaders.js: static loader functions + skills data bridge. */
export const writeDetailLoaders = (outputDir: string): void => {
  const lines = [
    'var loaders = [',
    ...Array.from(
      { length: 10 },
      (_, s) => `  function () { return require('./details-${s}.js') },`,
    ),
    ']',
    '',
    'module.exports = function loadDetail(id, index) {',
    '  var shard = index[id]',
    '  if (typeof shard !== "number" || !loaders[shard]) return null',
    '  return loaders[shard]()[id] || null',
    '}',
    '',
    '// Bridge: skills data from main package for detail page lookups',
    "module.exports.skills = require('../generated/skills')",
    '',
  ]
  writeFileSync(`${outputDir}/detail-loaders.js`, lines.join('\n'))
  console.log('  subpkg-detail/detail-loaders.js: written')
}

// ── Skills (runtime, compact: dictionary format for fast lookup) ──

export type { RuntimeSkill } from '../../miniprogram/contracts/runtime-data'

export const buildSkills = (
  skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
  iconSet?: Set<string>,
  categoryFallback?: Map<string, string>,
  globalFallback?: string,
  dependencies?: AssetDependencyIndex,
  manifest?: RuntimeAssetUrlManifest,
): Record<string, RuntimeSkill> => {
  const _iconSet = iconSet ?? new Set<string>()
  const _catFB = categoryFallback ?? new Map<string, string>()
  const categoryNames = new Map(
    (dictionaries.skillCategories ?? []).map((category) => [category.id, category.name]),
  )
  const result: Record<string, RuntimeSkill> = {}
  for (const s of skills) {
    result[s.id] = {
      id: s.id,
      n: s.name,
      cat: s.categoryId,
      cn: categoryNames.get(s.categoryId) ?? '未分類',
      ip: iconPath(s.id, _iconSet, _catFB, s.categoryId, globalFallback, dependencies, manifest),
      d: s.description,
      li: s.levelInfo,
    }
  }
  return result
}

// ── Dictionaries (runtime) ──

export type {
  RuntimeDictionaryItem,
  RuntimeDictionaries,
} from '../../miniprogram/contracts/runtime-data'

export const buildDictionaries = (
  _officers: CanonicalOfficer[],
  _skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
): RuntimeDictionaries => {
  const map = (group: string): RuntimeDictionaryItem[] =>
    (dictionaries[group] ?? []).map((d) => ({
      id: d.id,
      name: group === 'rarities' ? rarityGrade(d.id) : d.name,
    }))

  // ── Job ordering by type group (matches voyage.tw: 交易 → 战斗 → 冒险 → 未知) ──

  // Build job→type mapping from officer data
  const jobTypeMap = new Map<string, string>()
  for (const o of _officers) {
    if (!jobTypeMap.has(o.jobId)) jobTypeMap.set(o.jobId, o.typeId)
  }

  const JOB_TYPE_ORDER: Record<string, number> = {
    type_class_2: 0, // 交易
    type_class_3: 1, // 战斗
    type_class_1: 2, // 冒险
  }

  const sortByTypeGroup = (items: RuntimeDictionaryItem[]): RuntimeDictionaryItem[] => {
    return [...items].sort((a, b) => {
      const typeA = jobTypeMap.get(a.id) ?? ''
      const typeB = jobTypeMap.get(b.id) ?? ''
      const orderA = JOB_TYPE_ORDER[typeA] ?? 99
      const orderB = JOB_TYPE_ORDER[typeB] ?? 99
      if (orderA !== orderB) return orderA - orderB
      // Within same type group, sort by ID for stable ordering
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
  }

  // ── Skill category ordering by type affiliation ──

  const SKILL_CAT_ORDER: Record<string, number> = {
    // 冒险 (Adventure)
    skill_category_adventure: 0,
    skill_category_navigation: 1,
    skill_category_salvage: 2,
    skill_category_certificate: 3,
    // 交易 (Trade)
    skill_category_trade_expertise: 10,
    skill_category_trade_price_adjustment: 11,
    skill_category_barter: 12,
    skill_category_negotiation: 13,
    // 战斗 (Battle) — active
    skill_category_naval_active_cannon: 20,
    skill_category_naval_active_melee: 21,
    skill_category_naval_active_boarding: 22,
    skill_category_naval_active_enhancement: 23,
    // 战斗 (Battle) — passive
    skill_category_naval_passive_cannon: 30,
    skill_category_naval_passive_melee: 31,
    skill_category_naval_passive_boarding: 32,
    skill_category_naval_passive_defense: 33,
    skill_category_naval_passive_other: 34,
    skill_category_combat_other: 35,
    // 通用 / 其他 (General)
    skill_category_admiral: 40,
    skill_category_medicine: 41,
    skill_category_repair: 42,
    skill_category_innate_buff: 43,
    skill_category_innate_debuff: 44,
  }

  const sortSkillCategories = (items: RuntimeDictionaryItem[]): RuntimeDictionaryItem[] => {
    return [...items].sort((a, b) => {
      const orderA = SKILL_CAT_ORDER[a.id] ?? 99
      const orderB = SKILL_CAT_ORDER[b.id] ?? 99
      return orderA - orderB
    })
  }

  return {
    rarities: map('rarities'),
    types: map('types'),
    genders: map('genders'),
    jobs: sortByTypeGroup(map('jobs')),
    nationalities: map('nationalities').map((n) => ({ ...n, id: unprefix(n.id) })),
    languages: map('languages').map((l) => ({ ...l, id: unprefix(l.id) })),
    cities: map('cities').map((c) => ({ ...c, id: unprefix(c.id) })),
    requirements: map('requirements').map((r) => ({ ...r, id: unprefix(r.id) })),
    skillCategories: sortSkillCategories(map('skillCategories')),
  }
}

// ── Write all runtime files ──

export const writeRuntimeData = (
  officers: CanonicalOfficer[],
  skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
  outputDir: string,
  iconSet?: Set<string>,
  categoryFallback?: Map<string, string>,
  globalFallback?: string,
  dependencies?: AssetDependencyIndex,
  manifest?: RuntimeAssetUrlManifest,
): void => {
  mkdirSync(outputDir, { recursive: true })

  const catalog = buildCatalog(officers, skills, dictionaries, dependencies, manifest)
  const fleetOfficers = buildFleetOfficers(officers, skills, dictionaries, dependencies, manifest)
  const runtimeSkills = buildSkills(
    skills,
    dictionaries,
    iconSet,
    categoryFallback,
    globalFallback,
    dependencies,
    manifest,
  )
  const runtimeDicts = buildDictionaries(officers, skills, dictionaries)

  const write = (name: string, data: unknown) =>
    writeFileSync(`${outputDir}/${name}.js`, `module.exports = ${JSON.stringify(data)}\n`)

  write('catalog', catalog)
  write('fleet-officers', fleetOfficers)
  write('skills', runtimeSkills) // dict format: {skillId: {id,n,cat,ip}, ...}
  write('dictionaries', runtimeDicts)
  // Lightweight metadata for home page (avoids loading full catalog)
  write('dataset-meta', {
    officerCount: catalog.length,
    skillCount: Object.keys(runtimeSkills).length,
    contentVersion: manifest?.contentVersion ?? '1.0.0',
  })
  // Note: sharded details-*.js files are written separately to the detail subpackage

  console.log(`Runtime data written to ${outputDir}/`)
  console.log(`  catalog.js: ${catalog.length} officers`)
  console.log(`  fleet-officers.js: ${fleetOfficers.length} officers`)
  console.log(`  skills.js: ${Object.keys(runtimeSkills).length} entries (dict format)`)
  console.log(
    `  dictionaries.js: rarities=${runtimeDicts.rarities.length}, types=${runtimeDicts.types.length}, genders=${runtimeDicts.genders.length}, jobs=${runtimeDicts.jobs.length}, nationalities=${runtimeDicts.nationalities.length}, languages=${runtimeDicts.languages.length}, cities=${runtimeDicts.cities.length}, requirements=${runtimeDicts.requirements.length}, categories=${runtimeDicts.skillCategories.length}`,
  )
  console.log(
    `  dataset-meta.js: officerCount=${catalog.length}, skillCount=${Object.keys(runtimeSkills).length}`,
  )
}
