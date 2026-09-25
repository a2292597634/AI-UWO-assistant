import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

export interface MajorEventsAssetBuildFile {
  kind: 'region' | 'texture' | 'ornament'
  output: string
  width: number
  height: number
  byteSize: number
  sha256: string
}

export interface MajorEventsAssetBuildReport {
  files: MajorEventsAssetBuildFile[]
  totalBytes: number
}

export interface BuildMajorEventsAssetsOptions {
  sourceRoot: string
  outputRoot: string
}

export interface CheckMajorEventsAssetsOptions extends BuildMajorEventsAssetsOptions {
  reportPath: string
}

interface MajorEventsAssetDefinition {
  kind: MajorEventsAssetBuildFile['kind']
  source: string
  output: string
  width: number
  height: number
  paletteColors: number
  dither?: number
  transparent: boolean
}

interface BuiltMajorEventsAsset {
  definition: MajorEventsAssetDefinition
  bytes: Buffer
  file: MajorEventsAssetBuildFile
}

const REGION_IDS = [
  '37',
  '41',
  '57',
  '21',
  '22',
  '23',
  '58',
  '59',
  '50',
  '53',
  '54',
  '33',
  '63',
  '34',
  '18',
  '60',
  '20',
  '55',
] as const

const MAX_REGION_BYTES = 2 * 1024
const MAX_TEXTURE_AND_ORNAMENT_BYTES = 20 * 1024
const MAX_TOTAL_BYTES = 96 * 1024
const EMPTY_PIXEL_THRESHOLD = 8

const definitions = [
  ...REGION_IDS.map((numericId): MajorEventsAssetDefinition => ({
    kind: 'region',
    source: `region-zone-${numericId}-source.png`,
    output: `region-zone-${numericId}.png`,
    width: 64,
    height: 64,
    paletteColors: 16,
    transparent: true,
  })),
  {
    kind: 'texture',
    source: 'paper-chart-tile-source.png',
    output: 'paper-chart-tile.png',
    width: 512,
    height: 512,
    paletteColors: 2,
    dither: 0,
    transparent: false,
  },
  {
    kind: 'ornament',
    source: 'compass-rose-source.png',
    output: 'compass-rose.png',
    width: 160,
    height: 160,
    paletteColors: 16,
    transparent: true,
  },
  {
    kind: 'ornament',
    source: 'journey-harbor-footer-source.png',
    output: 'journey-harbor-footer.png',
    width: 750,
    height: 180,
    paletteColors: 16,
    transparent: true,
  },
  {
    kind: 'ornament',
    source: 'matrix-ship-engraving-source.png',
    output: 'matrix-ship-engraving.png',
    width: 320,
    height: 180,
    paletteColors: 16,
    transparent: true,
  },
] satisfies MajorEventsAssetDefinition[]

definitions.sort((left, right) =>
  Buffer.compare(Buffer.from(left.output), Buffer.from(right.output)),
)

const stableJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

const decodedPixelHash = async (bytes: Buffer): Promise<string> => {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const metadata = Buffer.from(`${info.width}x${info.height}x${info.channels}\0`, 'utf8')
  return createHash('sha256')
    .update(Buffer.concat([metadata, data]))
    .digest('hex')
}

const alphaBounds = async (bytes: Buffer, imageName: string): Promise<void> => {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let hasVisiblePixel = false
  let hasTransparentPixel = false
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] > EMPTY_PIXEL_THRESHOLD) hasVisiblePixel = true
    else hasTransparentPixel = true
  }
  if (!hasVisiblePixel) throw new Error(`MAJOR_EVENTS_ASSET_TRANSPARENT: ${imageName}`)
  if (!hasTransparentPixel) throw new Error(`MAJOR_EVENTS_ASSET_BACKGROUND: ${imageName}`)
}

const buildOne = async (
  definition: MajorEventsAssetDefinition,
  sourceRoot: string,
): Promise<BuiltMajorEventsAsset> => {
  const sourcePath = join(sourceRoot, definition.source)
  if (!existsSync(sourcePath)) {
    throw new Error(`MAJOR_EVENTS_ASSET_SOURCE_MISSING: ${definition.source}`)
  }

  const source = sharp(sourcePath)
  const sourceMetadata = await source.metadata()
  if (sourceMetadata.width === undefined || sourceMetadata.height === undefined) {
    throw new Error(`MAJOR_EVENTS_ASSET_DIMENSIONS_MISSING: ${definition.source}`)
  }
  if (definition.kind === 'texture' && sourceMetadata.width !== sourceMetadata.height) {
    throw new Error(`MAJOR_EVENTS_ASSET_TEXTURE_NOT_SQUARE: ${definition.source}`)
  }

  const resized = source.resize(definition.width, definition.height, {
    fit: definition.kind === 'texture' ? 'fill' : 'contain',
    background: definition.transparent ? '#00000000' : '#E7DECA',
  })
  const pipeline = definition.transparent ? resized : resized.flatten({ background: '#E7DECA' })
  const bytes = await pipeline
    .png({
      palette: true,
      colours: definition.paletteColors,
      dither: definition.dither ?? 1,
      compressionLevel: 9,
      effort: 10,
      quality: 100,
    })
    .toBuffer()
  const outputMetadata = await sharp(bytes).metadata()
  if (outputMetadata.width !== definition.width || outputMetadata.height !== definition.height) {
    throw new Error(`MAJOR_EVENTS_ASSET_DIMENSIONS_INVALID: ${definition.output}`)
  }
  if (definition.transparent) await alphaBounds(bytes, definition.output)

  const file: MajorEventsAssetBuildFile = {
    kind: definition.kind,
    output: definition.output,
    width: definition.width,
    height: definition.height,
    byteSize: bytes.byteLength,
    sha256: await decodedPixelHash(bytes),
  }
  if (definition.kind === 'region' && file.byteSize > MAX_REGION_BYTES) {
    throw new Error(`MAJOR_EVENTS_ASSET_BUDGET: ${definition.output} is ${file.byteSize} bytes`)
  }
  return { definition, bytes, file }
}

const managedOutputPattern =
  /^(?:region-zone-\d+|paper-chart-tile|matrix-ship-engraving|compass-rose|journey-harbor-footer)\.png$/

const removeStaleManagedOutputs = (
  outputRoot: string,
  expectedOutputs: ReadonlySet<string>,
): void => {
  if (!existsSync(outputRoot)) return
  for (const filename of readdirSync(outputRoot)) {
    if (managedOutputPattern.test(filename) && !expectedOutputs.has(filename)) {
      unlinkSync(join(outputRoot, filename))
    }
  }
}

export const buildMajorEventsAssets = async ({
  sourceRoot,
  outputRoot,
}: BuildMajorEventsAssetsOptions): Promise<MajorEventsAssetBuildReport> => {
  const built = await Promise.all(definitions.map((definition) => buildOne(definition, sourceRoot)))
  const files = built.map(({ file }) => file)
  const totalBytes = files.reduce((total, file) => total + file.byteSize, 0)
  const nonRegionBytes = files
    .filter((file) => file.kind !== 'region')
    .reduce((total, file) => total + file.byteSize, 0)
  if (nonRegionBytes > MAX_TEXTURE_AND_ORNAMENT_BYTES) {
    throw new Error(`MAJOR_EVENTS_ASSET_BUDGET: texture and ornaments are ${nonRegionBytes} bytes`)
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error(`MAJOR_EVENTS_ASSET_BUDGET: total is ${totalBytes} bytes`)
  }

  const expectedOutputs = new Set(files.map((file) => file.output))
  mkdirSync(outputRoot, { recursive: true })
  removeStaleManagedOutputs(outputRoot, expectedOutputs)
  for (const { bytes, file } of built) {
    writeFileSync(join(outputRoot, file.output), bytes)
  }
  return { files, totalBytes }
}

const assertOutputSet = (outputRoot: string): void => {
  if (!existsSync(outputRoot)) throw new Error('MAJOR_EVENTS_ASSET_OUTPUT_SET_DRIFT')
  const actual = readdirSync(outputRoot).sort()
  const expected = definitions.map((definition) => definition.output).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('MAJOR_EVENTS_ASSET_OUTPUT_SET_DRIFT')
  }
}

export const checkMajorEventsAssets = async ({
  sourceRoot,
  outputRoot,
  reportPath,
}: CheckMajorEventsAssetsOptions): Promise<void> => {
  assertOutputSet(outputRoot)
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'uwo-major-events-assets-check-'))
  try {
    const report = await buildMajorEventsAssets({ sourceRoot, outputRoot: temporaryRoot })
    for (const file of report.files) {
      let actualHash: string
      try {
        actualHash = await decodedPixelHash(readFileSync(join(outputRoot, file.output)))
      } catch {
        throw new Error(`MAJOR_EVENTS_ASSET_OUTPUT_DRIFT: ${file.output}`)
      }
      if (actualHash !== file.sha256) {
        throw new Error(`MAJOR_EVENTS_ASSET_OUTPUT_DRIFT: ${file.output}`)
      }
    }
    if (!existsSync(reportPath) || readFileSync(reportPath, 'utf8') !== stableJson(report)) {
      throw new Error('MAJOR_EVENTS_ASSET_REPORT_DRIFT')
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}

const sourceRoot = join('data', 'master', 'ui-assets', 'major-events')
const outputRoot = join('miniprogram', 'subpkg-trade', 'assets', 'major-events')
const reportPath = join('data', 'audit', 'major-events-asset-build-report.json')

const runCli = async (): Promise<void> => {
  const isWrite = process.argv.includes('--write')
  const isCheck = process.argv.includes('--check')
  if (isWrite === isCheck) {
    throw new Error('Usage: build-major-events-assets.ts --write | --check')
  }

  if (isWrite) {
    const report = await buildMajorEventsAssets({ sourceRoot, outputRoot })
    mkdirSync(join('data', 'audit'), { recursive: true })
    writeFileSync(reportPath, stableJson(report), 'utf8')
    return
  }

  await checkMajorEventsAssets({ sourceRoot, outputRoot, reportPath })
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/ui-assets/build-major-events-assets.ts')) {
  runCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
