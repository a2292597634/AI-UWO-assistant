import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  cpSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import sharp from 'sharp'
import type { CanonicalOfficer, CanonicalSkill, CanonicalTradeDataset } from '../import/types'
import {
  buildAssetDependencyIndex,
  assertAssetDependencyIndex,
  type AssetDependencyIndex,
  writeAssetDependencyIndex,
} from '../data-pipeline/asset-dependencies'
import { loadCanonicalOfficers } from '../data-pipeline/load-officers'
import { planAssetPackageLayout } from './asset-package-builder'
import { loadSkillIconOverrides } from './source-skill-icons'
import { assertPortraitHasTransparency } from './portrait-transparency'
import { assertProjectPath, readGenerationTree } from '../data-pipeline/generated-output-paths'

export const ASSET_STAGING_DIR = 'data/assets/staging'
const SRC_DIRS = ['archive/voyage-tw-2026052501/raw-assets', ASSET_STAGING_DIR]
const PUBLISH_DIR = ASSET_STAGING_DIR

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

export const normalizeAssetFilename = (filename: string): string => {
  const variantMatch = /^skill_skillt([0-9]+)\.png$/i.exec(filename)
  return variantMatch ? `skill_skillT${variantMatch[1]}.png` : filename
}

/** Compress a PNG buffer to 8-bit palette with max compression. */
async function compressPNG(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .png({
      palette: true,
      compressionLevel: 9,
      quality: 100,
      effort: 10,
    })
    .toBuffer()
}

export const collectAssetSourceFiles = (sourceDirs: readonly string[]): Map<string, string> => {
  const files = new Map<string, { filename: string; path: string }>()
  for (const sourceDir of sourceDirs) {
    if (!existsSync(sourceDir)) continue
    for (const file of readdirSync(sourceDir)) {
      if (!file.endsWith('.png')) continue
      const filename = normalizeAssetFilename(file)
      files.set(filename.toLowerCase(), { filename, path: join(sourceDir, file) })
    }
  }
  return new Map([...files.values()].map(({ filename, path }) => [filename, path]))
}

/** 校验依赖索引中的每个素材文件都存在且能被 sharp 解码为 PNG。 */
export const validateReferencedAssetSources = async (
  dependencies: Pick<AssetDependencyIndex, 'roots'>,
  sourceFiles: ReadonlyMap<string, string>,
): Promise<void> => {
  const referencedFiles = [...new Set(dependencies.roots.flatMap((assetRoot) => assetRoot.files))]
  const missingFiles = referencedFiles.filter((filename) => !sourceFiles.has(filename))
  if (missingFiles.length > 0) {
    throw new Error(`缺少引用素材文件：${missingFiles.join(', ')}`)
  }

  const portraitFilenames = new Set(
    dependencies.roots
      .flatMap((assetRoot) => assetRoot.officerIds)
      .filter((id) => id.startsWith('officer_'))
      .map((id) => `${id}.png`),
  )
  for (const filename of referencedFiles) {
    const filePath = sourceFiles.get(filename)!
    let input: Buffer
    try {
      input = readFileSync(filePath)
      const metadata = await sharp(input).metadata()
      if (metadata.format !== 'png') {
        throw new Error(`格式为 ${metadata.format ?? 'unknown'}`)
      }
      await sharp(input, { failOn: 'warning' }).raw().toBuffer()
    } catch {
      throw new Error(`素材无法解码或不是 PNG：${filename}`)
    }
    if (portraitFilenames.has(filename)) {
      await assertPortraitHasTransparency(input, filename)
    }
  }
}

const sourceFiles = (): Map<string, string> => collectAssetSourceFiles(SRC_DIRS)

const canonicalData = (): {
  officers: CanonicalOfficer[]
  skills: CanonicalSkill[]
  trades: CanonicalTradeDataset['tradeGoods']
} => ({
  officers: loadCanonicalOfficers('data/master'),
  skills: readJson<CanonicalSkill[]>('data/master/skills.json'),
  trades: readJson<CanonicalTradeDataset>('data/master/trade-goods.json').tradeGoods,
})

export const setupAssets = async (
  options: {
    encodePng?: (input: Buffer) => Promise<Buffer>
    renamePath?: (from: string, to: string) => void
  } = {},
): Promise<void> => {
  const { officers, skills, trades } = canonicalData()
  const sources = sourceFiles()
  const skillIconOverrides = loadSkillIconOverrides()
  const skillFilenames = new Set(
    [...sources.keys()].filter((filename) => filename.startsWith('skill_')),
  )
  const missingVariantSourceIcons = skills
    .filter(
      (skill) =>
        /^skill_skillT[0-9]+$/.test(skill.id) &&
        !skillIconOverrides.has(skill.id) &&
        !skillFilenames.has(`${skill.id}.png`),
    )
    .map((skill) => `${skill.sourceRefs.voyageTw ?? skill.id}: ${skill.name}`)
  if (missingVariantSourceIcons.length > 0) {
    console.warn(
      `來源 skillT 圖標未收錄，將保留分類或全域 fallback：${missingVariantSourceIcons.join(', ')}`,
    )
  }
  const dependencies = buildAssetDependencyIndex(officers, skills, {
    assetFilenames: skillFilenames,
    skillIconOverrides,
    trades,
  })
  assertAssetDependencyIndex(dependencies)
  await validateReferencedAssetSources(dependencies, sources)
  const existing = existsSync(PUBLISH_DIR)
    ? readdirSync(PUBLISH_DIR).filter((filename) => filename.endsWith('.png'))
    : []
  const plan = planAssetPackageLayout({
    dependencies,
    sourceFiles: [...sources.keys()],
    existingOutputFiles: existing,
  })

  console.log(`Referenced PNG files: ${dependencies.roots.flatMap((root) => root.files).length}`)
  console.log(`Retained source PNG files: ${plan.retainedFiles.length}`)
  let copied = 0
  let compressed = 0
  const projectRoot = resolve('.')
  const assetsRoot = assertProjectPath(projectRoot, resolve('data/assets'))
  mkdirSync(assetsRoot, { recursive: true })
  // stage 與 backup 均位於目標磁碟；保留合法的未引用檔案與非 PNG 輸入。
  const stage = mkdtempSync(join(assetsRoot, '.uwo-setup-'))
  const prepared = join(stage, 'staging')
  const indexPath = 'data/assets/asset-dependencies.json'
  const installed: Array<{ target: string; backup: string; existed: boolean; replaced: boolean }> =
    []
  const renamePath = options.renamePath ?? renameSync
  let preserveRecovery = false
  try {
    readGenerationTree(projectRoot, PUBLISH_DIR, false)
    readGenerationTree(projectRoot, indexPath, false)
    if (existsSync(PUBLISH_DIR)) cpSync(PUBLISH_DIR, prepared, { recursive: true })
    else mkdirSync(prepared)
    for (const filename of plan.retainedFiles) {
      const sourcePath = sources.get(filename)
      if (!sourcePath) continue
      const raw = readFileSync(sourcePath)
      const compressedBuffer = await (options.encodePng ?? compressPNG)(raw)
      writeFileSync(assertProjectPath(prepared, join(prepared, filename)), compressedBuffer)
      if (compressedBuffer.length < raw.length) compressed += 1
      copied += 1
    }
    writeAssetDependencyIndex(dependencies, join(stage, 'asset-dependencies.json'))
    for (const [index, path] of [PUBLISH_DIR, indexPath].entries()) {
      const target = assertProjectPath(projectRoot, resolve(path))
      const source = join(stage, index === 0 ? 'staging' : 'asset-dependencies.json')
      const backup = join(stage, `backup-${index}`)
      const entry = { target, backup, existed: existsSync(target), replaced: false }
      installed.push(entry)
      mkdirSync(dirname(target), { recursive: true })
      if (entry.existed) renamePath(target, backup)
      renamePath(source, target)
      entry.replaced = true
    }
  } catch (error) {
    const rollbackErrors: Array<{ target: string; error: unknown }> = []
    for (const { target, backup, replaced } of installed.reverse()) {
      try {
        if (replaced)
          rmSync(assertProjectPath(projectRoot, target), { recursive: true, force: true })
        if (existsSync(backup)) renamePath(backup, target)
      } catch (rollbackError) {
        rollbackErrors.push({ target, error: rollbackError })
      }
    }
    if (rollbackErrors.length) {
      preserveRecovery = true
      const describeError = (value: unknown): string =>
        value instanceof Error ? value.message : String(value)
      throw Object.assign(
        new Error(
          `素材安裝失敗：${describeError(error)}；回復失敗：${rollbackErrors.map((item) => `${item.target}: ${describeError(item.error)}`).join('；')}；保留可恢復備份：${stage}`,
        ),
        { cause: error, rollbackErrors, recoveryPath: stage },
      )
    }
    throw error
  } finally {
    if (!preserveRecovery) rmSync(stage, { recursive: true, force: true })
  }

  console.log(`Staged ${copied} PNG files (${compressed} compressed) in ${PUBLISH_DIR}.`)
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/asset-pipeline/setup-assets.ts')) {
  setupAssets().catch((error) => {
    console.error('Asset setup failed:', error)
    process.exit(1)
  })
}
