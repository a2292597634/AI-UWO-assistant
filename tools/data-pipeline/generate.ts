import { readFileSync, mkdirSync, existsSync, unlinkSync, writeFileSync } from 'node:fs'
import type { CanonicalSkill, DictionaryItem } from '../import/types'
import {
  writeRuntimeData,
  writeShardedDetails,
  writeDetailIndex,
  writeDetailLoaders,
  writeMaintenanceOfficerIndex,
} from './build-runtime-data'
import {
  assertAssetDependencyIndex,
  buildAssetDependencyIndex,
  writeAssetDependencyIndex,
} from './asset-dependencies'
import { writeTradeRuntimeData } from './build-trade-runtime-data'
import type { CanonicalDatasetHeader, CanonicalTradeDataset } from '../import/types'
import { loadPublishedAssetManifest } from '../asset-pipeline/publish-assets'
import { loadAssetReuseLocations } from '../asset-pipeline/cloudbase-manifest'
import { loadCanonicalOfficers } from './load-officers'
import {
  buildOfficerReferenceData,
  buildMaintenanceReferenceData,
} from './build-officer-reference-data'
import { loadSkillIconOverrides } from '../asset-pipeline/source-skill-icons'

const CANONICAL_DIR = 'data/master'
const OUTPUT_DIR = 'miniprogram/generated'
const FLEET_OUTPUT_DIR = 'miniprogram/subpkg-fleet/generated'
const SUBPKG_DIR = 'miniprogram/subpkg-detail'
const TRADE_SUBPKG_DIR = 'miniprogram/subpkg-trade'
const MAINTENANCE_SUBPKG_DIR = 'miniprogram/subpkg-maintenance'
const DATA_ASSETS_DIR = 'data/assets'
const ASSET_DEPENDENCY_PATH = `${DATA_ASSETS_DIR}/asset-dependencies.json`
const LEGACY_DEPENDENCY_PATH = 'miniprogram/generated/asset-dependencies.js'
const OFFICER_REFERENCE_DATA_PATH = 'cloudfunctions/officer-custom/reference-data.json'
const MAINTENANCE_REFERENCE_DATA_PATH = 'cloudfunctions/officer-maintenance/reference-data.json'
const PUBLISHED_MANIFEST_PATH =
  process.env.CLOUDBASE_ASSET_MANIFEST_PATH ?? 'data/assets/cloudbase-manifest.json'
const REUSED_ASSET_LOCATIONS_PATH =
  process.env.CLOUDBASE_ASSET_REUSE_PATH ?? 'data/assets/cloudbase-reused-skill-icons.json'

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
  const officers = loadCanonicalOfficers(CANONICAL_DIR)
  const datasetMeta = readJson<CanonicalDatasetHeader>(`${CANONICAL_DIR}/dataset.json`)
  const skills = readJson<CanonicalSkill[]>(`${CANONICAL_DIR}/skills.json`)
  const dictionaries = readJson<Record<string, DictionaryItem[]>>(
    `${CANONICAL_DIR}/dictionaries.json`,
  )
  const tradeDataset = readJson<CanonicalTradeDataset>(`${CANONICAL_DIR}/trade-goods.json`)
  const publishedManifest = loadPublishedAssetManifest(PUBLISHED_MANIFEST_PATH)
  const reusedAssetLocations = existsSync(REUSED_ASSET_LOCATIONS_PATH)
    ? loadAssetReuseLocations(REUSED_ASSET_LOCATIONS_PATH)
    : new Map()
  const runtimeAssetManifest = {
    ...publishedManifest,
    assets: [
      ...publishedManifest.assets,
      ...[...reusedAssetLocations.values()]
        .filter(
          (asset) => !publishedManifest.assets.some((entry) => entry.filename === asset.filename),
        )
        .map(({ filename, publicUrl, cloudPath, releaseId }) => ({
          filename,
          publicUrl,
          cloudPath,
          releaseId,
        })),
    ],
  }
  const skillIconOverrides = loadSkillIconOverrides()
  const officerReferenceData = buildOfficerReferenceData(CANONICAL_DIR)

  console.log(`  Officers: ${officers.length}`)
  console.log(`  Skills: ${skills.length}`)
  console.log(`  Dictionary groups: ${Object.keys(dictionaries).length}`)
  console.log(`  Trade goods: ${tradeDataset.tradeGoods.length}`)
  console.log(`  Officer reference IDs: ${officerReferenceData.officerIds.length}`)

  const iconSet = new Set(runtimeAssetManifest.assets.map((asset) => asset.filename))
  console.log(`  Icon files found: ${iconSet.size}`)
  const assetDependencies = buildAssetDependencyIndex(officers, skills, {
    assetFilenames: iconSet,
    skillIconOverrides,
    trades: tradeDataset.tradeGoods,
  })
  assertAssetDependencyIndex(assetDependencies)
  console.log(`  Asset roots: ${assetDependencies.roots.length}`)

  mkdirSync(OUTPUT_DIR, { recursive: true })
  mkdirSync(FLEET_OUTPUT_DIR, { recursive: true })
  mkdirSync(SUBPKG_DIR, { recursive: true })
  mkdirSync(TRADE_SUBPKG_DIR, { recursive: true })
  mkdirSync(DATA_ASSETS_DIR, { recursive: true })
  writeFileSync(OFFICER_REFERENCE_DATA_PATH, JSON.stringify(officerReferenceData, null, 2) + '\n')
  writeFileSync(
    MAINTENANCE_REFERENCE_DATA_PATH,
    JSON.stringify(buildMaintenanceReferenceData(CANONICAL_DIR), null, 2) + '\n',
  )
  console.log(`  ${OFFICER_REFERENCE_DATA_PATH}: written`)

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
    runtimeAssetManifest,
    {
      contentVersion: datasetMeta.contentVersion,
      updatedAt: datasetMeta.updatedAt,
      sourceSnapshot: datasetMeta.sourceSnapshot,
    },
    FLEET_OUTPUT_DIR,
  )

  // Remove the legacy main-package fleet index after moving its output.
  const legacyFleetPath = `${OUTPUT_DIR}/fleet-officers.js`
  if (existsSync(legacyFleetPath)) {
    unlinkSync(legacyFleetPath)
    console.log(`  Removed legacy ${legacyFleetPath}`)
  }
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
    runtimeAssetManifest,
  )

  // Write detail lookup index and static loaders
  writeDetailIndex(officers, SUBPKG_DIR)
  writeDetailLoaders(SUBPKG_DIR)
  writeTradeRuntimeData(tradeDataset, OUTPUT_DIR, TRADE_SUBPKG_DIR)
  writeMaintenanceOfficerIndex(
    officers,
    datasetMeta.contentVersion,
    MAINTENANCE_SUBPKG_DIR,
    dictionaries,
  )

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
