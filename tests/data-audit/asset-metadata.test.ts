import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { collectAssetMetadata } from '../../tools/data-audit/collect-asset-metadata'

describe('collectAssetMetadata', () => {
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
