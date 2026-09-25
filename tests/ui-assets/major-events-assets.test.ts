import { randomFillSync } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildMajorEventsAssets,
  checkMajorEventsAssets,
  type MajorEventsAssetBuildReport,
} from '../../tools/ui-assets/build-major-events-assets'

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

const ORNAMENT_OUTPUTS = [
  'compass-rose.png',
  'journey-harbor-footer.png',
  'matrix-ship-engraving.png',
] as const

const temporaryDirectories: string[] = []

const makeTemporaryDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'uwo-major-events-assets-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    } catch {
      // Windows can retain a short-lived libvips handle after a deliberate build failure.
    }
  }
})

const writeTransparentFixture = async (
  path: string,
  width: number,
  height: number,
  inset = 16,
): Promise<void> => {
  const mark = await sharp({
    create: {
      width: Math.max(8, width - inset * 2),
      height: Math.max(8, height - inset * 2),
      channels: 4,
      background: '#b99552ff',
    },
  })
    .png()
    .toBuffer()

  await sharp({
    create: { width, height, channels: 4, background: '#00000000' },
  })
    .composite([{ input: mark, left: inset, top: inset }])
    .png()
    .toFile(path)
}

const createFixtureSources = async (sourceRoot: string): Promise<void> => {
  mkdirSync(sourceRoot, { recursive: true })

  await Promise.all([
    ...REGION_IDS.map((id) =>
      writeTransparentFixture(join(sourceRoot, `region-zone-${id}-source.png`), 128, 128, 24),
    ),
    sharp({ create: { width: 512, height: 512, channels: 3, background: '#e7deca' } })
      .png()
      .toFile(join(sourceRoot, 'paper-chart-tile-source.png')),
    writeTransparentFixture(join(sourceRoot, 'matrix-ship-engraving-source.png'), 512, 512, 160),
    writeTransparentFixture(join(sourceRoot, 'compass-rose-source.png'), 512, 512, 144),
    writeTransparentFixture(join(sourceRoot, 'journey-harbor-footer-source.png'), 1024, 512, 192),
  ])
}

const expectedRegionOutputs = REGION_IDS.map((id) => `region-zone-${id}.png`)
const stableJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

describe('大流行分包素材 builder', () => {
  it('正式紙紋、裝飾和區域素材符合分包預算', async () => {
    const outputRoot = makeTemporaryDirectory()
    const report = await buildMajorEventsAssets({
      sourceRoot: resolve(__dirname, '../../data/master/ui-assets/major-events'),
      outputRoot,
    })

    expect(report.files.filter((file) => file.kind === 'region')).toHaveLength(18)
    expect(
      report.files
        .filter((file) => file.kind !== 'region')
        .reduce((total, file) => total + file.byteSize, 0),
    ).toBeLessThanOrEqual(20 * 1024)
    expect(report.totalBytes).toBeLessThanOrEqual(96 * 1024)
  })

  it('輸出指定的 18 個 zone 徽記、底圖和裝飾，並守住尺寸與預算', async () => {
    const sourceRoot = makeTemporaryDirectory()
    const outputRoot = makeTemporaryDirectory()
    await createFixtureSources(sourceRoot)

    const report = await buildMajorEventsAssets({ sourceRoot, outputRoot })
    const outputs = report.files.map((file) => file.output)
    const regions = report.files.filter((file) => file.kind === 'region')
    const texture = report.files.find((file) => file.kind === 'texture')
    const ornaments = report.files.filter((file) => file.kind === 'ornament')

    expect(regions.map((file) => file.output).sort()).toEqual([...expectedRegionOutputs].sort())
    expect(regions).toHaveLength(18)
    expect(regions.every((file) => file.width === 64 && file.height === 64)).toBe(true)
    expect(regions.every((file) => file.byteSize <= 2 * 1024)).toBe(true)
    expect(texture).toMatchObject({
      output: 'paper-chart-tile.png',
      width: 512,
      height: 512,
      kind: 'texture',
    })
    expect(ornaments.map((file) => file.output).sort()).toEqual([...ORNAMENT_OUTPUTS])
    expect(ornaments.map(({ output, width, height }) => ({ output, width, height }))).toEqual([
      { output: 'compass-rose.png', width: 160, height: 160 },
      { output: 'journey-harbor-footer.png', width: 750, height: 180 },
      { output: 'matrix-ship-engraving.png', width: 320, height: 180 },
    ])
    expect(outputs).toHaveLength(22)
    expect(report.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
    expect(
      report.files
        .filter((file) => file.kind !== 'region')
        .reduce((total, file) => total + file.byteSize, 0),
    ).toBeLessThanOrEqual(20 * 1024)
    expect(report.totalBytes).toBeLessThanOrEqual(96 * 1024)
  })

  it('重建時輸出相同像素雜湊與報告次序', async () => {
    const sourceRoot = makeTemporaryDirectory()
    const firstOutput = makeTemporaryDirectory()
    const secondOutput = makeTemporaryDirectory()
    await createFixtureSources(sourceRoot)

    const first = await buildMajorEventsAssets({ sourceRoot, outputRoot: firstOutput })
    const second = await buildMajorEventsAssets({ sourceRoot, outputRoot: secondOutput })

    expect(second.files).toEqual(first.files)
    expect(first.files).toHaveLength(22)
    expect(second.totalBytes).toBe(first.totalBytes)
    for (const file of first.files) {
      expect(readFileSync(join(firstOutput, file.output))).toEqual(
        readFileSync(join(secondOutput, file.output)),
      )
    }
  })

  it('check 比對正式輸出和穩定 JSON 報告，並偵測素材漂移', async () => {
    const sourceRoot = makeTemporaryDirectory()
    const outputRoot = makeTemporaryDirectory()
    const reportPath = join(makeTemporaryDirectory(), 'major-events-asset-build-report.json')
    await createFixtureSources(sourceRoot)

    const report: MajorEventsAssetBuildReport = await buildMajorEventsAssets({
      sourceRoot,
      outputRoot,
    })
    writeFileSync(reportPath, stableJson(report), 'utf8')

    await expect(
      checkMajorEventsAssets({ sourceRoot, outputRoot, reportPath }),
    ).resolves.toBeUndefined()

    await writeTransparentFixture(join(outputRoot, 'region-zone-37.png'), 64, 64, 4)
    await expect(checkMajorEventsAssets({ sourceRoot, outputRoot, reportPath })).rejects.toThrow(
      /DRIFT|CHANGED|MISMATCH/,
    )
  })

  it('來源缺失或素材無法符合硬預算時，不留下半套輸出', async () => {
    const sourceRoot = makeTemporaryDirectory()
    const outputRoot = makeTemporaryDirectory()
    await createFixtureSources(sourceRoot)
    unlinkSync(join(sourceRoot, 'region-zone-37-source.png'))

    await expect(buildMajorEventsAssets({ sourceRoot, outputRoot })).rejects.toThrow(
      /region-zone-37-source\.png/,
    )
    expect(readdirSync(outputRoot)).toEqual([])

    await createFixtureSources(sourceRoot)
    const noisyPixels = Buffer.alloc(512 * 512 * 3)
    randomFillSync(noisyPixels)
    await sharp(noisyPixels, { raw: { width: 512, height: 512, channels: 3 } })
      .png()
      .toFile(join(sourceRoot, 'paper-chart-tile-source.png'))

    await expect(buildMajorEventsAssets({ sourceRoot, outputRoot })).rejects.toThrow(/BUDGET/)
    expect(readdirSync(outputRoot)).toEqual([])
  })
})
