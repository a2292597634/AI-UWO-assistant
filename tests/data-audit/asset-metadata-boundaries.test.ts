import { describe, expect, it, vi } from 'vitest'
import { collectAssetMetadata } from '../../tools/data-audit/collect-asset-metadata'

const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')

describe('asset metadata boundaries', () => {
  it('prioritizes bounded image overrides and records the source rule', async () => {
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
      {
        skill509998139: {
          imageOverrideId: 'skill200681123',
          metadataSourceRange: 'bytes=520192-524287',
        },
      },
    )

    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://voyage.tw/img/skill/uwo_skill200681.png')
    expect(observations.find(({ status }) => status === 200)).toMatchObject({
      resolution: {
        imageOverrideId: 'skill200681123',
        metadataSourceRange: 'bytes=520192-524287',
        rule: 'Use skill_arr[skillId].i when present, then truncate image IDs longer than 11 characters.',
      },
    })
  })

  it('shares duplicate detection with a fallback observation', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }),
      )

    const observations = await collectAssetMetadata(
      [
        { ownerType: 'skill', ownerSourceId: 'skill200681', url: 'https://voyage.tw/direct.png' },
        {
          ownerType: 'skill',
          ownerSourceId: 'skill999999999',
          url: 'https://voyage.tw/fallback.png',
        },
      ],
      fetcher,
    )

    expect(observations.find(({ url }) => url.endsWith('uwo_skill999999.png'))).toMatchObject({
      duplicateOf: 'https://voyage.tw/direct.png',
    })
  })

  it('rejects host, count, declared-body, MIME, and PNG boundaries', async () => {
    await expect(
      collectAssetMetadata(
        [{ ownerType: 'skill', ownerSourceId: 'skill1', url: 'https://example.com/icon.png' }],
        fetch,
      ),
    ).rejects.toThrow('AUDIT_ASSET_URL_NOT_APPROVED')
    await expect(
      collectAssetMetadata(
        Array.from({ length: 13 }, (_, index) => ({
          ownerType: 'skill' as const,
          ownerSourceId: `skill${index}`,
          url: `https://voyage.tw/${index}.png`,
        })),
        fetch,
      ),
    ).rejects.toThrow('AUDIT_SOURCE_LIMIT_EXCEEDED:assets')
    await expect(
      collectAssetMetadata(
        [{ ownerType: 'skill', ownerSourceId: 'skill1', url: 'https://voyage.tw/large.png' }],
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(Buffer.alloc(256 * 1024 + 1), {
            status: 200,
            headers: { 'content-type': 'image/png', 'content-length': String(256 * 1024 + 1) },
          }),
        ),
      ),
    ).rejects.toThrow('AUDIT_SOURCE_LIMIT_EXCEEDED:assetBytes')
    await expect(
      collectAssetMetadata(
        [{ ownerType: 'skill', ownerSourceId: 'skill1', url: 'https://voyage.tw/mime.png' }],
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response(Buffer.from('nope'), {
              status: 200,
              headers: { 'content-type': 'image/jpeg' },
            }),
          ),
      ),
    ).rejects.toThrow('AUDIT_ASSET_MIME_INVALID')
    await expect(
      collectAssetMetadata(
        [{ ownerType: 'skill', ownerSourceId: 'skill1', url: 'https://voyage.tw/signature.png' }],
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response(Buffer.alloc(24), {
              status: 200,
              headers: { 'content-type': 'image/png' },
            }),
          ),
      ),
    ).rejects.toThrow('AUDIT_ASSET_PNG_INVALID')
  })
})
