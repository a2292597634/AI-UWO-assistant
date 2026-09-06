import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import type { CanonicalOfficer, CanonicalSkill } from '../import/types'
import {
  buildAssetDependencyIndex,
  type AssetDependencyIndex,
} from '../data-pipeline/asset-dependencies'
import { loadCanonicalOfficers } from '../data-pipeline/load-officers'
import { planAssetPackageLayout } from './asset-package-builder'

export const ASSET_STAGING_DIR = 'data/assets/staging'
const SRC_DIRS = ['archive/voyage-tw-2026052501/raw-assets', ASSET_STAGING_DIR]
const PUBLISH_DIR = ASSET_STAGING_DIR

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

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
      files.set(file.toLowerCase(), { filename: file, path: join(sourceDir, file) })
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

  for (const filename of referencedFiles) {
    const filePath = sourceFiles.get(filename)!
    try {
      const metadata = await sharp(readFileSync(filePath)).metadata()
      if (metadata.format !== 'png') {
        throw new Error(`格式为 ${metadata.format ?? 'unknown'}`)
      }
    } catch {
      throw new Error(`素材无法解码或不是 PNG：${filename}`)
    }
  }
}

const sourceFiles = (): Map<string, string> => collectAssetSourceFiles(SRC_DIRS)

const canonicalData = (): {
  officers: CanonicalOfficer[]
  skills: CanonicalSkill[]
} => ({
  officers: loadCanonicalOfficers('data/master'),
  skills: readJson<CanonicalSkill[]>('data/master/skills.json'),
})

export const setupAssets = async (): Promise<void> => {
  const { officers, skills } = canonicalData()
  const sources = sourceFiles()
  const skillFilenames = new Set(
    [...sources.keys()].filter((filename) => filename.startsWith('skill_')),
  )
  const dependencies = buildAssetDependencyIndex(officers, skills, {
    assetFilenames: skillFilenames,
  })
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
  mkdirSync(PUBLISH_DIR, { recursive: true })
  for (const filename of plan.retainedFiles) {
    const sourcePath = sources.get(filename)
    if (!sourcePath) continue
    const raw = readFileSync(sourcePath)
    const compressedBuffer = await compressPNG(raw)
    writeFileSync(join(PUBLISH_DIR, filename), compressedBuffer)
    if (compressedBuffer.length < raw.length) compressed += 1
    copied += 1
  }

  console.log(`Staged ${copied} PNG files (${compressed} compressed) in ${PUBLISH_DIR}.`)
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/asset-pipeline/setup-assets.ts')) {
  setupAssets().catch((error) => {
    console.error('Asset setup failed:', error)
    process.exit(1)
  })
}
