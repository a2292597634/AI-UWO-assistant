import { readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import type { CanonicalOfficer, CanonicalSkill, DictionaryItem } from '../import/types'
import {
  writeRuntimeData,
  writeShardedDetails,
  writeDetailIndex,
  writeDetailLoaders,
} from './build-runtime-data'

const CANONICAL_DIR = 'data/master'
const OUTPUT_DIR = 'miniprogram/generated'
const SUBPKG_DIR = 'miniprogram/subpkg-detail'
const ASSET_DIRS = Array.from({ length: 10 }, (_, i) => `miniprogram/subpkg-a${i}/imgs`)

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

/** Build set of all existing skill icon filenames from asset subpackages. */
const buildIconSet = (dirs: string[]): Set<string> => {
  const set = new Set<string>()
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      if (f.startsWith('skill_')) set.add(f)
    }
  }
  return set
}

/** Build category → icon path fallback for variant skills without own icons. */
const buildCategoryFallback = (
  skills: CanonicalSkill[],
  iconSet: Set<string>,
): Map<string, string> => {
  const fallback = new Map<string, string>()
  for (const s of skills) {
    if (fallback.has(s.categoryId)) continue
    const fname = `${s.id}.png`
    if (iconSet.has(fname)) {
      // Compute the same path that iconPath() would generate
      const id = fname.replace(/\.png$/, '').replace(/^(officer|skill)_/, '')
      let hash = 0
      for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
      const shard = hash % 10
      fallback.set(s.categoryId, `/subpkg-a${shard}/imgs/${fname}`)
    }
  }
  return fallback
}

const generate = (): void => {
  console.log('=== Runtime Data Generator ===\n')

  // Safety: block generation from candidate data
  if (CANONICAL_DIR.includes('canonical-candidates')) {
    throw new Error(
      'Runtime data must not be generated from canonical-candidates. Use data/master instead.',
    )
  }

  console.log(`Reading canonical data from ${CANONICAL_DIR}/...`)
  const officers = readJson<CanonicalOfficer[]>(`${CANONICAL_DIR}/officers.json`)
  const skills = readJson<CanonicalSkill[]>(`${CANONICAL_DIR}/skills.json`)
  const dictionaries = readJson<Record<string, DictionaryItem[]>>(
    `${CANONICAL_DIR}/dictionaries.json`,
  )

  console.log(`  Officers: ${officers.length}`)
  console.log(`  Skills: ${skills.length}`)
  console.log(`  Dictionary groups: ${Object.keys(dictionaries).length}`)

  // Build icon set and category fallback for variant skills
  const iconSet = buildIconSet(ASSET_DIRS)
  const categoryFallback = buildCategoryFallback(skills, iconSet)
  // Global fallback: the first available skill icon (used when a category has no base icons)
  const globalFallback = categoryFallback.values().next().value as string | undefined
  console.log(`  Icon files found: ${iconSet.size}`)
  console.log(`  Category fallbacks: ${categoryFallback.size}`)
  console.log(`  Global fallback: ${globalFallback ?? 'none'}`)

  mkdirSync(OUTPUT_DIR, { recursive: true })
  mkdirSync(SUBPKG_DIR, { recursive: true })

  // Generate main package data (catalog, skills, dictionaries)
  writeRuntimeData(
    officers,
    skills,
    dictionaries,
    OUTPUT_DIR,
    iconSet,
    categoryFallback,
    globalFallback,
  )

  // Write details sharded (lazy-loaded per officer on detail page)
  writeShardedDetails(
    officers,
    skills,
    dictionaries,
    SUBPKG_DIR,
    iconSet,
    categoryFallback,
    globalFallback,
  )

  // Write detail lookup index and static loaders
  writeDetailIndex(officers, SUBPKG_DIR)
  writeDetailLoaders(SUBPKG_DIR)

  console.log('\nDone. Mini program loads details from subpkg-detail/ on demand.')
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/data-pipeline/generate.ts')) {
  try {
    generate()
  } catch (err) {
    console.error('Generation failed:', err)
    process.exit(1)
  }
}
