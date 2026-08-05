import { readFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import type { CanonicalOfficer, CanonicalSkill, DictionaryItem } from '../import/types'
import {
  writeRuntimeData,
  writeShardedDetails,
  writeDetailIndex,
  writeDetailLoaders,
} from './build-runtime-data'
import {
  assertAssetDependencyIndex,
  buildAssetDependencyIndex,
  writeAssetDependencyIndex,
} from './asset-dependencies'
import { loadPublishedAssetManifest } from '../asset-pipeline/publish-assets'

const CANONICAL_DIR = 'data/master'
const OUTPUT_DIR = 'miniprogram/generated'
const SUBPKG_DIR = 'miniprogram/subpkg-detail'
const DATA_ASSETS_DIR = 'data/assets'
const ASSET_DEPENDENCY_PATH = `${DATA_ASSETS_DIR}/asset-dependencies.json`
const LEGACY_DEPENDENCY_PATH = 'miniprogram/generated/asset-dependencies.js'
const PUBLISHED_MANIFEST_PATH =
  process.env.CLOUDBASE_ASSET_MANIFEST_PATH ?? 'data/assets/cloudbase-manifest.json'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

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
  const publishedManifest = loadPublishedAssetManifest(PUBLISHED_MANIFEST_PATH)

  console.log(`  Officers: ${officers.length}`)
  console.log(`  Skills: ${skills.length}`)
  console.log(`  Dictionary groups: ${Object.keys(dictionaries).length}`)

  const iconSet = new Set(publishedManifest.assets.map((asset) => asset.filename))
  console.log(`  Icon files found: ${iconSet.size}`)
  const assetDependencies = buildAssetDependencyIndex(officers, skills, {
    assetFilenames: iconSet,
  })
  assertAssetDependencyIndex(assetDependencies)
  console.log(`  Asset roots: ${assetDependencies.roots.length}`)

  mkdirSync(OUTPUT_DIR, { recursive: true })
  mkdirSync(SUBPKG_DIR, { recursive: true })
  mkdirSync(DATA_ASSETS_DIR, { recursive: true })

  // Generate main package data (catalog, skills, dictionaries)
  writeRuntimeData(
    officers,
    skills,
    dictionaries,
    OUTPUT_DIR,
    iconSet,
    undefined,
    undefined,
    assetDependencies,
    publishedManifest,
  )
  writeAssetDependencyIndex(assetDependencies, ASSET_DEPENDENCY_PATH)

  // Remove legacy JS module so it never ends up in the miniprogram package
  if (existsSync(LEGACY_DEPENDENCY_PATH)) {
    unlinkSync(LEGACY_DEPENDENCY_PATH)
    console.log(`  Removed legacy ${LEGACY_DEPENDENCY_PATH}`)
  }

  // Write details sharded (lazy-loaded per officer on detail page)
  writeShardedDetails(
    officers,
    skills,
    dictionaries,
    SUBPKG_DIR,
    iconSet,
    undefined,
    undefined,
    assetDependencies,
    publishedManifest,
  )

  // Write detail lookup index and static loaders
  writeDetailIndex(officers, SUBPKG_DIR)
  writeDetailLoaders(SUBPKG_DIR)

  console.log(`\nDone. Generated CDN release ${publishedManifest.releaseId}.`)
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/data-pipeline/generate.ts')) {
  try {
    generate()
  } catch (err) {
    console.error('Generation failed:', err)
    process.exit(1)
  }
}
