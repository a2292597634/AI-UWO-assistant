import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import sharp from 'sharp'
import {
  UI_ASSET_GROUP_BUDGETS,
  UI_ASSET_RECIPES,
  UI_ASSET_TOTAL_BUDGET,
  type UiAssetRecipe,
} from './config'

export interface UiAssetTransparentBounds {
  left: number
  top: number
  width: number
  height: number
}

export type UiAssetTrimBounds = UiAssetTransparentBounds

export interface UiAssetBuildFile {
  id: string
  output: string
  group: UiAssetRecipe['group']
  mimeType: 'image/jpeg' | 'image/png'
  width: number
  height: number
  byteSize: number
  sha256: string
  sourceTransparentBounds: UiAssetTransparentBounds
  outputTransparentBounds?: UiAssetTransparentBounds
  trimBounds?: UiAssetTrimBounds
}

export interface UiAssetBuildReport {
  processingRuleVersion: '1'
  files: UiAssetBuildFile[]
  groupBytes: Record<UiAssetRecipe['group'], number>
  totalBytes: number
}

export interface BuildUiAssetsOptions {
  sourceRoot: string
  outputRoot: string
}

export interface CheckUiAssetsOptions extends BuildUiAssetsOptions {
  reportPath: string
}

type BuiltAsset = { recipe: UiAssetRecipe; bytes: Buffer; file: UiAssetBuildFile }

const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

const budgetError = (message: string): Error => new Error(`UI_ASSET_BUDGET_EXCEEDED: ${message}`)

const alphaBounds = async (
  input: string | Buffer,
  imageKind: 'SOURCE' | 'OUTPUT',
  imageName: string,
): Promise<UiAssetTransparentBounds> => {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let left = info.width
  let top = info.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] !== 0) {
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
  }
  if (right === -1) throw new Error(`UI_ASSET_TRANSPARENT_${imageKind}: ${imageName}`)
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

const png = (input: string, width: number, height: number): Promise<Buffer> =>
  sharp(input)
    .resize(width, height, { fit: 'contain', background: '#00000000' })
    .png({ palette: true, compressionLevel: 9, quality: 100, effort: 10 })
    .toBuffer()

const optimizedPng = (input: string): Promise<Buffer> =>
  sharp(input).png({ palette: true, compressionLevel: 9, quality: 100, effort: 10 }).toBuffer()

const jpeg = async (input: string, maxBytes: number): Promise<Buffer> => {
  for (const quality of [78, 74, 70, 66]) {
    const output = await sharp(input)
      .resize(750, 320, { fit: 'cover' })
      .jpeg({ quality, chromaSubsampling: '4:2:0' })
      .toBuffer()
    if (output.byteLength <= maxBytes) return output
  }
  throw budgetError(`home-harbor cannot fit within ${maxBytes} bytes`)
}

const buildOne = async (recipe: UiAssetRecipe, sourceRoot: string): Promise<BuiltAsset> => {
  const sourcePath = join(sourceRoot, recipe.source)
  const sourceTransparentBounds = await alphaBounds(sourcePath, 'SOURCE', basename(sourcePath))
  const bytes =
    recipe.mode === 'copy-png'
      ? await optimizedPng(sourcePath)
      : recipe.mode === 'banner-jpeg'
        ? await jpeg(sourcePath, recipe.maxBytes)
        : recipe.mode === 'resize-png'
          ? await png(sourcePath, recipe.width ?? 0, recipe.height ?? 0)
          : await sharp(sourcePath)
              .extract(sourceTransparentBounds)
              .resize(recipe.width ?? 0, recipe.height ?? 0, {
                fit: 'contain',
                background: '#00000000',
              })
              .png({ palette: true, compressionLevel: 9, quality: 100, effort: 10 })
              .toBuffer()
  const metadata = await sharp(bytes).metadata()
  if (metadata.width === undefined || metadata.height === undefined) {
    throw new Error(`UI_ASSET_DIMENSIONS_MISSING: ${recipe.id}`)
  }
  const outputTransparentBounds =
    recipe.mode === 'banner-jpeg' ? undefined : await alphaBounds(bytes, 'OUTPUT', recipe.output)
  const trimBounds = recipe.mode === 'trim-rarity' ? sourceTransparentBounds : undefined
  const file: UiAssetBuildFile = {
    id: recipe.id,
    output: recipe.output,
    group: recipe.group,
    mimeType: recipe.mode === 'banner-jpeg' ? 'image/jpeg' : 'image/png',
    width: metadata.width,
    height: metadata.height,
    byteSize: bytes.byteLength,
    sha256: hash(bytes),
    sourceTransparentBounds,
    ...(outputTransparentBounds === undefined ? {} : { outputTransparentBounds }),
    ...(trimBounds === undefined ? {} : { trimBounds }),
  }
  if (file.byteSize > recipe.maxBytes) throw budgetError(`${recipe.id} is ${file.byteSize} bytes`)
  return { recipe, bytes, file }
}

const stableRecipes = (): readonly UiAssetRecipe[] =>
  [...UI_ASSET_RECIPES].sort((left, right) => left.id.localeCompare(right.id, 'en'))

const expectedOutputNames = (): string[] =>
  stableRecipes()
    .map((recipe) => recipe.output)
    .sort()

const outputSetDrift = (outputRoot: string): Error =>
  new Error(
    `UI_ASSET_OUTPUT_SET_DRIFT: expected ${expectedOutputNames().join(',')} but found ${
      existsSync(outputRoot) ? readdirSync(outputRoot).sort().join(',') : '(missing directory)'
    }`,
  )

const assertOutputSet = (outputRoot: string): void => {
  if (!existsSync(outputRoot)) throw outputSetDrift(outputRoot)
  const expected = expectedOutputNames()
  const actual = readdirSync(outputRoot).sort()
  if (expected.length !== actual.length || expected.some((name, index) => name !== actual[index])) {
    throw outputSetDrift(outputRoot)
  }
}

const removeStaleOutputs = (outputRoot: string): void => {
  if (!existsSync(outputRoot)) return
  const expected = new Set(expectedOutputNames())
  for (const name of readdirSync(outputRoot)) {
    if (expected.has(name)) continue
    try {
      rmSync(join(outputRoot, name), {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      })
    } catch {
      throw new Error(`UI_ASSET_OUTPUT_STALE: ${name}`)
    }
  }
}

export const buildUiAssets = async ({
  sourceRoot,
  outputRoot,
}: BuildUiAssetsOptions): Promise<UiAssetBuildReport> => {
  const assets = await Promise.all(stableRecipes().map((recipe) => buildOne(recipe, sourceRoot)))
  const groupBytes: Record<UiAssetRecipe['group'], number> = {
    banner: 0,
    feature: 0,
    'original-ui': 0,
  }
  for (const asset of assets) groupBytes[asset.recipe.group] += asset.bytes.byteLength
  for (const [group, byteSize] of Object.entries(groupBytes) as Array<
    [UiAssetRecipe['group'], number]
  >) {
    if (byteSize > UI_ASSET_GROUP_BUDGETS[group]) throw budgetError(`${group} is ${byteSize} bytes`)
  }
  const totalBytes = assets.reduce((total, asset) => total + asset.bytes.byteLength, 0)
  if (totalBytes > UI_ASSET_TOTAL_BUDGET) throw budgetError(`total is ${totalBytes} bytes`)

  mkdirSync(outputRoot, { recursive: true })
  removeStaleOutputs(outputRoot)
  for (const asset of assets) writeFileSync(join(outputRoot, asset.recipe.output), asset.bytes)
  return {
    processingRuleVersion: '1',
    files: assets.map(({ file }) => file),
    groupBytes,
    totalBytes,
  }
}

const reportPath = join('data', 'audit', 'ui-asset-build-report.json')
const outputRoot = join('miniprogram', 'assets', 'ui')
const sourceRoot = join('data', 'master', 'ui-assets')

const stableJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

export const checkUiAssets = async ({
  sourceRoot,
  outputRoot,
  reportPath,
}: CheckUiAssetsOptions): Promise<void> => {
  assertOutputSet(outputRoot)
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'uwo-ui-assets-check-'))
  try {
    const report = await buildUiAssets({ sourceRoot, outputRoot: temporaryRoot })
    for (const file of report.files) {
      const expected = readFileSync(join(temporaryRoot, file.output))
      const actualPath = join(outputRoot, file.output)
      if (!expected.equals(readFileSync(actualPath))) {
        throw new Error(`UI_ASSET_OUTPUT_DRIFT: ${file.output}`)
      }
    }
    if (!existsSync(reportPath) || readFileSync(reportPath, 'utf8') !== stableJson(report)) {
      throw new Error('UI_ASSET_REPORT_DRIFT')
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

const runCli = async (): Promise<void> => {
  const isWrite = process.argv.includes('--write')
  const isCheck = process.argv.includes('--check')
  if (isWrite === isCheck) throw new Error('Usage: build-ui-assets.ts --write | --check')

  if (isWrite) {
    const report = await buildUiAssets({ sourceRoot, outputRoot })
    writeFileSync(reportPath, stableJson(report))
    return
  }

  await checkUiAssets({ sourceRoot, outputRoot, reportPath })
}

if (process.argv[1]?.endsWith('build-ui-assets.ts')) {
  runCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
