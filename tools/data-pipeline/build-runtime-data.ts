import { writeFileSync, mkdirSync } from 'node:fs'
import type { CanonicalOfficer, CanonicalSkill, DictionaryItem } from '../import/types'
import type {
  RuntimeCatalogEntry,
  RuntimeSkill,
  RuntimeDictionaryItem,
  RuntimeDictionaries,
  RuntimeDetailRecord,
} from '../../miniprogram/contracts/runtime-data'

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

/** Deterministic shard index for an image filename. */
const shardFor = (filename: string): number => {
  const id = filename.replace(/\.png$/, '').replace(/^(officer|skill)_/, '')
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return hash % 10
}

/** Portrait asset path from officer ID. */
const portraitPath = (officerId: string): string => {
  const filename = `${officerId}.png`
  return `/subpkg-a${shardFor(filename)}/imgs/${filename}`
}

/** Skill icon path from skill ID, with fallback for variant skills. */
const iconPath = (
  skillId: string,
  iconSet: Set<string>,
  categoryFallback: Map<string, string>,
  categoryId: string,
  globalFallback?: string,
): string => {
  const filename = `${skillId}.png`
  if (iconSet.has(filename)) {
    return `/subpkg-a${shardFor(filename)}/imgs/${filename}`
  }
  // Variant skill (e.g. skillT*) — use category fallback, then global fallback
  const catFB = categoryFallback.get(categoryId)
  if (catFB) return catFB
  if (globalFallback) return globalFallback
  return `/subpkg-a${shardFor(filename)}/imgs/${filename}`
}

// ── Catalog (compact: skill IDs only, names/icons looked up from skills.js) ──

export type { RuntimeCatalogEntry } from '../../miniprogram/contracts/runtime-data'

export const buildCatalog = (
  officers: CanonicalOfficer[],
  _skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
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

    return {
      id: o.id,
      name: nameTrimmed,
      rarityId: o.rarityId,
      rarityName: rarityGrade(o.rarityId),
      rarityClass: rarityClass(o.rarityId),
      typeId: o.typeId,
      typeName: dictName('types', o.typeId),
      genderId: o.genderId,
      genderLabel: dictName('genders', o.genderId),
      jobId: o.jobId,
      jobName: dictName('jobs', o.jobId),
      portraitPath: portraitPath(o.id),
      languages: o.languages.map((l) => unprefix(l.languageId)),
      activeSkills: o.skills.filter((r) => r.kind === 'active').map((r) => r.skillId),
      passiveSkills: o.skills.filter((r) => r.kind === 'passive').map((r) => r.skillId),
      searchAliases: aliases,
    }
  })
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
      tn: dictName('types', o.typeId),
      gn: dictName('genders', o.genderId),
      jn: dictName('jobs', o.jobId),
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
          ul: rel.unlockLevel,
          lv: rel.level,
          n: sk?.name ?? rel.skillId,
          ip: iconPath(rel.skillId, _iconSet, _catFB, sk?.categoryId ?? '', globalFallback),
          d: sk?.description ?? '',
          li: sk?.levelInfo ?? '',
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

/** Shard an officer ID for chunked detail files. Must match shardFor. */
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
): void => {
  const all = buildDetails(
    officers,
    skills,
    dictionaries,
    iconSet,
    categoryFallback,
    globalFallback,
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

/** Write detail-loaders.js: static loader functions keyed by shard number. */
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
  ]
  writeFileSync(`${outputDir}/detail-loaders.js`, lines.join('\n'))
  console.log('  subpkg-detail/detail-loaders.js: written')
}

// ── Skills (runtime, compact: dictionary format for fast lookup) ──

export type { RuntimeSkill } from '../../miniprogram/contracts/runtime-data'

export const buildSkills = (
  skills: CanonicalSkill[],
  _dictionaries: Record<string, DictionaryItem[]>,
  iconSet?: Set<string>,
  categoryFallback?: Map<string, string>,
  globalFallback?: string,
): Record<string, RuntimeSkill> => {
  const _iconSet = iconSet ?? new Set<string>()
  const _catFB = categoryFallback ?? new Map<string, string>()
  const result: Record<string, RuntimeSkill> = {}
  for (const s of skills) {
    result[s.id] = {
      id: s.id,
      n: s.name,
      cat: s.categoryId,
      ip: iconPath(s.id, _iconSet, _catFB, s.categoryId, globalFallback),
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
  iconSet?: Set<string>,
  categoryFallback?: Map<string, string>,
  globalFallback?: string,
): void => {
  mkdirSync(outputDir, { recursive: true })

  const catalog = buildCatalog(officers, skills, dictionaries)
  const runtimeSkills = buildSkills(skills, dictionaries, iconSet, categoryFallback, globalFallback)
  const runtimeDicts = buildDictionaries(officers, skills, dictionaries)

  const write = (name: string, data: unknown) =>
    writeFileSync(`${outputDir}/${name}.js`, `module.exports = ${JSON.stringify(data)}\n`)

  write('catalog', catalog)
  write('skills', runtimeSkills) // dict format: {skillId: {id,n,cat,ip}, ...}
  write('dictionaries', runtimeDicts)
  // Lightweight metadata for home page (avoids loading full catalog)
  write('dataset-meta', {
    officerCount: catalog.length,
    skillCount: Object.keys(runtimeSkills).length,
    contentVersion: '1.0.0',
  })
  // Note: sharded details-*.js files are written separately to the detail subpackage

  console.log(`Runtime data written to ${outputDir}/`)
  console.log(`  catalog.js: ${catalog.length} officers`)
  console.log(`  skills.js: ${Object.keys(runtimeSkills).length} entries (dict format)`)
  console.log(
    `  dictionaries.js: rarities=${runtimeDicts.rarities.length}, types=${runtimeDicts.types.length}, genders=${runtimeDicts.genders.length}, jobs=${runtimeDicts.jobs.length}, languages=${runtimeDicts.languages.length}, categories=${runtimeDicts.skillCategories.length}`,
  )
  console.log(
    `  dataset-meta.js: officerCount=${catalog.length}, skillCount=${Object.keys(runtimeSkills).length}`,
  )
}
