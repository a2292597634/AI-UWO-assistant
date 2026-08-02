import { randomFillSync } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { buildUiAssets, checkUiAssets } from '../../tools/ui-assets/build-ui-assets'
import { UI_ASSET_GROUP_BUDGETS, UI_ASSET_TOTAL_BUDGET } from '../../tools/ui-assets/config'

interface TransparentBounds {
  left: number
  top: number
  width: number
  height: number
}

type ReportFileWithTransparency = Awaited<ReturnType<typeof buildUiAssets>>['files'][number] & {
  sourceTransparentBounds?: TransparentBounds
  outputTransparentBounds?: TransparentBounds
}

type ReportFileWithOptionalSourceBounds = Omit<
  ReportFileWithTransparency,
  'sourceTransparentBounds'
> & {
  sourceTransparentBounds?: TransparentBounds
}

const temporaryDirectories: string[] = []

const makeTemporaryDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'uwo-ui-assets-'))
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

const writePng = async (
  path: string,
  width = 60,
  height = 60,
  rectangle?: { left: number; top: number; width: number; height: number },
) => {
  const image = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: rectangle === undefined ? '#b08a3eff' : '#00000000',
    },
  })
  await (rectangle === undefined
    ? image.png().toFile(path)
    : image
        .composite([
          {
            input: await sharp({
              create: {
                width: rectangle.width,
                height: rectangle.height,
                channels: 4,
                background: '#b08a3eff',
              },
            })
              .png()
              .toBuffer(),
            left: rectangle.left,
            top: rectangle.top,
          },
        ])
        .png()
        .toFile(path))
}

const createFixtureSources = async (sourceRoot: string) => {
  const original = join(sourceRoot, 'original')
  mkdirSync(original, { recursive: true })
  await Promise.all([
    ...[2, 3, 4, 5, 6].flatMap((grade) => [
      writePng(join(original, `uwo_bg_grade_${grade}.png`)),
      writePng(
        join(original, `uwo_icon_grade_${grade}.png`),
        60,
        60,
        grade === 5
          ? { left: 2, top: 0, width: 20, height: 23 }
          : { left: 1, top: 1, width: 20, height: 23 },
      ),
    ]),
    ...[1, 2, 3].map((kind) => writePng(join(original, `uwo_icon_class_${kind}.png`))),
    writePng(join(original, 'gender_f.png')),
    writePng(join(original, 'gender_m.png')),
    sharp({ create: { width: 1500, height: 640, channels: 3, background: '#193d44' } })
      .png()
      .toFile(join(sourceRoot, 'home-harbor-source.png')),
    sharp({ create: { width: 320, height: 320, channels: 4, background: '#b08a3eff' } })
      .png()
      .toFile(join(sourceRoot, 'feature-officer-catalog-source.png')),
  ])
}

describe('buildUiAssets', () => {
  it('trims rarity badges, observes hard budgets, and emits deterministic image bytes', async () => {
    const sourceRoot = makeTemporaryDirectory()
    const firstOutput = makeTemporaryDirectory()
    const secondOutput = makeTemporaryDirectory()
    await createFixtureSources(sourceRoot)

    const first = await buildUiAssets({ sourceRoot, outputRoot: firstOutput })
    const second = await buildUiAssets({ sourceRoot, outputRoot: secondOutput })
    const files = first.files as ReportFileWithTransparency[]
    const grade = files.find((file) => file.id === 'rarity-filter-grade-5')
    const banner = files.find((file) => file.id === 'home-harbor')

    expect(grade?.trimBounds).toEqual({ left: 2, top: 0, width: 20, height: 23 })
    expect(grade?.sourceTransparentBounds).toEqual(grade?.trimBounds)
    expect(files.every((file) => file.sourceTransparentBounds !== undefined)).toBe(true)
    expect(
      files
        .filter((file) => file.mimeType === 'image/png')
        .every((file) => file.outputTransparentBounds !== undefined),
    ).toBe(true)
    expect(banner?.outputTransparentBounds).toBeUndefined()
    expect([grade?.width, grade?.height]).toEqual([29, 29])
    expect(first).toEqual(second)
    for (const [group, byteSize] of Object.entries(first.groupBytes)) {
      expect(byteSize).toBeLessThanOrEqual(
        UI_ASSET_GROUP_BUDGETS[group as keyof typeof UI_ASSET_GROUP_BUDGETS],
      )
    }
    expect(first.totalBytes).toBeLessThanOrEqual(UI_ASSET_TOTAL_BUDGET)
    expect(readFileSync(join(firstOutput, 'home-harbor.jpg')).byteLength).toBeLessThanOrEqual(
      150 * 1024,
    )
  })

  it('rejects a fully transparent PNG source before it can enter the report', async () => {
    const sourceRoot = makeTemporaryDirectory()
    const outputRoot = makeTemporaryDirectory()
    await createFixtureSources(sourceRoot)
    await sharp({ create: { width: 60, height: 60, channels: 4, background: '#00000000' } })
      .png()
      .toFile(join(sourceRoot, 'original', 'gender_f.png'))

    await expect(buildUiAssets({ sourceRoot, outputRoot })).rejects.toThrow(
      'UI_ASSET_TRANSPARENT_SOURCE',
    )
  })

  it('rejects a source whose generated output cannot meet its hard byte budget', async () => {
    const sourceRoot = makeTemporaryDirectory()
    const outputRoot = makeTemporaryDirectory()
    await createFixtureSources(sourceRoot)
    const pixels = Buffer.alloc(200 * 200 * 3)
    randomFillSync(pixels)
    await sharp(pixels, { raw: { width: 200, height: 200, channels: 3 } })
      .png()
      .toFile(join(sourceRoot, 'original', 'gender_f.png'))

    await expect(buildUiAssets({ sourceRoot, outputRoot })).rejects.toThrow(
      'UI_ASSET_BUDGET_EXCEEDED',
    )
  })

  it('re-encodes copied source PNGs instead of carrying non-image padding into the runtime package', async () => {
    const sourceRoot = makeTemporaryDirectory()
    const outputRoot = makeTemporaryDirectory()
    await createFixtureSources(sourceRoot)
    const genderPath = join(sourceRoot, 'original', 'gender_f.png')
    writeFileSync(genderPath, Buffer.concat([readFileSync(genderPath), Buffer.alloc(100 * 1024)]))

    await expect(buildUiAssets({ sourceRoot, outputRoot })).resolves.toMatchObject({
      groupBytes: { 'original-ui': expect.any(Number) },
    })
    expect(readFileSync(join(outputRoot, 'gender-f.png')).byteLength).toBeLessThan(1024)
  })

  it('rejects a runtime output directory that contains a stale asset outside the recipe set', async () => {
    const sourceRoot = makeTemporaryDirectory()
    const outputRoot = makeTemporaryDirectory()
    const reportPath = join(makeTemporaryDirectory(), 'ui-asset-build-report.json')
    await createFixtureSources(sourceRoot)
    const report = await buildUiAssets({ sourceRoot, outputRoot })
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    writeFileSync(join(outputRoot, 'stale-runtime-asset.png'), Buffer.from('not a recipe output'))

    await expect(checkUiAssets({ sourceRoot, outputRoot, reportPath })).rejects.toThrow(
      'UI_ASSET_OUTPUT_SET_DRIFT',
    )
  })

  it('rejects a report that omits source transparency metadata', async () => {
    const sourceRoot = makeTemporaryDirectory()
    const outputRoot = makeTemporaryDirectory()
    const reportPath = join(makeTemporaryDirectory(), 'ui-asset-build-report.json')
    await createFixtureSources(sourceRoot)
    const report = await buildUiAssets({ sourceRoot, outputRoot })
    const staleReport = structuredClone(report) as Omit<typeof report, 'files'> & {
      files: ReportFileWithOptionalSourceBounds[]
    }
    delete staleReport.files[0]?.sourceTransparentBounds
    writeFileSync(reportPath, `${JSON.stringify(staleReport, null, 2)}\n`)

    await expect(checkUiAssets({ sourceRoot, outputRoot, reportPath })).rejects.toThrow(
      'UI_ASSET_REPORT_DRIFT',
    )
  })
})
