import { checkMasterDataset } from '../data-audit/check-master-dataset'
import {
  readFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
  writeFileSync,
  mkdtempSync,
  cpSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { DATA_GENERATION_OUTPUT_PATHS, assertProjectPath } from './generated-output-paths'
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
import type {
  CanonicalDatasetHeader,
  CanonicalMajorEventsDataset,
  CanonicalTradeDataset,
} from '../import/types'
import { loadPublishedAssetManifest } from '../asset-pipeline/publish-assets'
import { loadAssetReuseLocations } from '../asset-pipeline/cloudbase-manifest'
import { loadCanonicalOfficers } from './load-officers'
import {
  buildOfficerReferenceData,
  buildMaintenanceReferenceData,
} from './build-officer-reference-data'
import { loadSkillIconOverrides } from '../asset-pipeline/source-skill-icons'
import { buildMajorEventReference } from './build-major-event-runtime-data'

const CANONICAL_DIR = 'data/master'
const PUBLISHED_MANIFEST_PATH =
  process.env.CLOUDBASE_ASSET_MANIFEST_PATH ?? 'data/assets/cloudbase-manifest.json'
const REUSED_ASSET_LOCATIONS_PATH =
  process.env.CLOUDBASE_ASSET_REUSE_PATH ?? 'data/assets/cloudbase-reused-skill-icons.json'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

const buildGeneratedOutputs = (stageRoot: string): void => {
  const OUTPUT_DIR = join(stageRoot, 'miniprogram/generated')
  const FLEET_OUTPUT_DIR = join(stageRoot, 'miniprogram/subpkg-fleet/generated')
  const SUBPKG_DIR = join(stageRoot, 'miniprogram/subpkg-detail')
  const TRADE_SUBPKG_DIR = join(stageRoot, 'miniprogram/subpkg-trade')
  const MAINTENANCE_SUBPKG_DIR = join(stageRoot, 'miniprogram/subpkg-maintenance')
  const DATA_ASSETS_DIR = join(stageRoot, 'data/assets')
  const ASSET_DEPENDENCY_PATH = join(DATA_ASSETS_DIR, 'asset-dependencies.json')
  const LEGACY_DEPENDENCY_PATH = join(OUTPUT_DIR, 'asset-dependencies.js')
  const OFFICER_REFERENCE_DATA_PATH = join(
    stageRoot,
    'cloudfunctions/officer-custom/reference-data.json',
  )
  const MAINTENANCE_REFERENCE_DATA_PATH = join(
    stageRoot,
    'cloudfunctions/officer-maintenance/reference-data.json',
  )
  console.log('=== Runtime Data Generator ===\n')

  // Safety: block generation from candidate data
  if (CANONICAL_DIR.includes('canonical-candidates')) {
    throw new Error(
      'Runtime data must not be generated from canonical-candidates. Use data/master instead.',
    )
  }

  const errors = checkMasterDataset(CANONICAL_DIR).filter((finding) => finding.severity === 'error')
  if (errors.length) throw new Error(`正式 master 校驗失敗：${errors[0].code} ${errors[0].path}`)

  console.log(`Reading canonical data from ${CANONICAL_DIR}/...`)
  const officers = loadCanonicalOfficers(CANONICAL_DIR)
  const datasetMeta = readJson<CanonicalDatasetHeader>(`${CANONICAL_DIR}/dataset.json`)
  const skills = readJson<CanonicalSkill[]>(`${CANONICAL_DIR}/skills.json`)
  const dictionaries = readJson<Record<string, DictionaryItem[]>>(
    `${CANONICAL_DIR}/dictionaries.json`,
  )
  const tradeDataset = readJson<CanonicalTradeDataset>(`${CANONICAL_DIR}/trade-goods.json`)
  const majorEventsDataset = readJson<CanonicalMajorEventsDataset>(
    `${CANONICAL_DIR}/major-events.json`,
  )
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
  mkdirSync(dirname(OFFICER_REFERENCE_DATA_PATH), { recursive: true })
  mkdirSync(dirname(MAINTENANCE_REFERENCE_DATA_PATH), { recursive: true })
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
  writeTradeRuntimeData(
    tradeDataset,
    OUTPUT_DIR,
    TRADE_SUBPKG_DIR,
    assetDependencies,
    runtimeAssetManifest,
  )
  const majorEventReference = buildMajorEventReference(
    majorEventsDataset,
    'miniprogram/subpkg-trade/assets/major-events',
  )
  writeFileSync(
    `${TRADE_SUBPKG_DIR}/major-event-reference.js`,
    `module.exports = ${JSON.stringify(majorEventReference)}\n`,
    'utf8',
  )
  writeMaintenanceOfficerIndex(
    officers,
    datasetMeta.contentVersion,
    MAINTENANCE_SUBPKG_DIR,
    dictionaries,
  )

  console.log(`\nDone. Generated CDN release ${publishedManifest.releaseId}.`)
}

/** 所有產物先在暫存目錄構建；完整成功後才替換正式集合，替換錯誤亦回復。 */
export const generate = (): void => {
  const root = resolve('.')
  const stage = mkdtempSync(join(tmpdir(), 'uwo-data-generation-'))
  const backups: Array<{ target: string; backup: string; existed: boolean }> = []
  try {
    buildGeneratedOutputs(stage)
    for (const [index, path] of DATA_GENERATION_OUTPUT_PATHS.entries()) {
      const target = assertProjectPath(root, resolve(root, path))
      const source = join(stage, path)
      if (!existsSync(source)) throw new Error(`生成產物缺失：${path}`)
      const backup = join(stage, `backup-${index}`)
      const existed = existsSync(target)
      if (existed) cpSync(target, backup, { recursive: true })
      backups.push({ target, backup, existed })
      mkdirSync(dirname(target), { recursive: true })
      rmSync(target, { recursive: true, force: true })
      cpSync(source, target, { recursive: true })
    }
  } catch (error) {
    for (const { target, backup, existed } of backups.reverse()) {
      rmSync(assertProjectPath(root, target), { recursive: true, force: true })
      if (existed) {
        mkdirSync(dirname(target), { recursive: true })
        cpSync(backup, target, { recursive: true })
      }
    }
    throw error
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/data-pipeline/generate.ts')) {
  try {
    generate()
  } catch (err) {
    console.error('Generation failed:', err)
    process.exit(1)
  }
}
