import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { collectAssetMetadata } from '../../tools/data-audit/collect-asset-metadata'

interface TransparentBounds {
  left: number
  top: number
  width: number
  height: number
}

const independentlyMeasureTransparentBounds = async (file: Buffer): Promise<TransparentBounds> => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = info.width
  let top = info.height
  let right = -1
  let bottom = -1

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] === 0) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }

  if (right === -1) throw new Error('test fixture must contain at least one non-transparent pixel')
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

describe('collectAssetMetadata', () => {
  it('records every downloaded original UI image with verifiable local provenance', async () => {
    const assets = JSON.parse(readFileSync('data/master/assets.json', 'utf8')) as Array<{
      id: string
      kind: string
      ownerType: string
      source: {
        url: string
        originalFilename: string
        mimeType: string
        byteSize: number
        sha256: string
        width: number
        height: number
        downloadedAt: string
        transparentBounds: TransparentBounds
      }
    }>
    const uiAssets = assets.filter((asset) => asset.ownerType === 'ui')

    expect(uiAssets).toHaveLength(15)
    expect(uiAssets.every((asset) => asset.kind === 'ui-image')).toBe(true)
    expect(uiAssets.map((asset) => asset.id)).toEqual([...uiAssets.map((asset) => asset.id)].sort())

    for (const asset of uiAssets) {
      const file = readFileSync(
        join('data/master/ui-assets/original', asset.source.originalFilename),
      )
      const metadata = await sharp(file).metadata()
      const transparentBounds = await independentlyMeasureTransparentBounds(file)
      expect(asset.source).toMatchObject({
        url: `https://voyage.tw/img/common/${asset.source.originalFilename}`,
        mimeType: 'image/png',
        byteSize: file.byteLength,
        sha256: createHash('sha256').update(file).digest('hex'),
        width: metadata.width,
        height: metadata.height,
        downloadedAt: '2026-08-01',
        transparentBounds,
      })
      expect(
        asset.source.transparentBounds.left + asset.source.transparentBounds.width,
      ).toBeLessThanOrEqual(asset.source.width)
      expect(
        asset.source.transparentBounds.top + asset.source.transparentBounds.height,
      ).toBeLessThanOrEqual(asset.source.height)
    }

    expect(uiAssets.find((asset) => asset.id === 'ui_gender_f')?.source.transparentBounds).toEqual({
      left: 4,
      top: 1,
      width: 23,
      height: 28,
    })
  })

  it('hashes bounded PNG content and records dimensions', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(png, {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': String(png.length) },
      }),
    )

    const [result] = await collectAssetMetadata(
      [{ ownerType: 'officer', ownerSourceId: 'chasT089', url: 'https://voyage.tw/a.png' }],
      fetcher,
    )

    expect(result).toMatchObject({
      status: 200,
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sha256: createHash('sha256').update(png).digest('hex'),
    })
  })

  it('records 404 without writing a fake asset', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }))
    const [result] = await collectAssetMetadata(
      [{ ownerType: 'skill', ownerSourceId: 'skillT0218', url: 'https://voyage.tw/missing.png' }],
      fetcher,
    )
    expect(result).toMatchObject({ status: 404, sha256: null, localFixturePath: null })
  })

  it('keeps manifest expectations out of observations', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }),
      )
    const entries = [
      {
        ownerType: 'officer',
        ownerSourceId: 'chasT089',
        url: 'https://voyage.tw/a.png',
        expectedStatus: 200,
      },
    ] as unknown as Parameters<typeof collectAssetMetadata>[0]

    const [result] = await collectAssetMetadata(entries, fetcher)

    expect(result).not.toHaveProperty('expectedStatus')
  })

  it('resolves a 404 skill icon through the 11-character image-ID rule', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }),
      )

    const observations = await collectAssetMetadata(
      [
        {
          ownerType: 'skill',
          ownerSourceId: 'skill509998139',
          url: 'https://voyage.tw/img/skill/uwo_skill509998139.png',
        },
      ],
      fetcher,
    )

    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://voyage.tw/img/skill/uwo_skill509998.png')
    expect(observations).toHaveLength(2)
    expect(observations.find(({ status }) => status === 404)).toMatchObject({
      status: 404,
      localFixturePath: null,
    })
    expect(observations.find(({ status }) => status === 200)).toMatchObject({
      status: 200,
      localFixturePath: 'tests/fixtures/source-audit/assets/skill509998139.png',
    })
  })
})
