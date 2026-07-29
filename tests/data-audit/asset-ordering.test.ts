import { describe, expect, it, vi } from 'vitest'
import { collectAssetMetadata } from '../../tools/data-audit/collect-asset-metadata'

describe('asset observation ordering', () => {
  it('uses deterministic byte ordering without locale-sensitive comparison', async () => {
    const originalLocaleCompare = String.prototype.localeCompare
    String.prototype.localeCompare = () => {
      throw new Error('localeCompare must not determine audit order')
    }

    try {
      const observations = await collectAssetMetadata(
        [
          {
            ownerType: 'skill',
            ownerSourceId: 'skillA',
            url: 'https://voyage.tw/img/skill/uwo_skillA.png',
          },
          { ownerType: 'officer', ownerSourceId: 'chasA', url: 'https://voyage.tw/z.png' },
          { ownerType: 'officer', ownerSourceId: 'chasA', url: 'https://voyage.tw/a.png' },
        ],
        vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })),
      )

      expect(observations.map(({ url }) => url)).toEqual([
        'https://voyage.tw/a.png',
        'https://voyage.tw/z.png',
        'https://voyage.tw/img/skill/uwo_skillA.png',
      ])
    } finally {
      String.prototype.localeCompare = originalLocaleCompare
    }
  })
})
