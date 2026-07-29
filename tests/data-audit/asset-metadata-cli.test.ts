import { describe, expect, it, vi } from 'vitest'
import { collectAssetMetadata } from '../../tools/data-audit/collect-asset-metadata'

describe('asset metadata CLI behavior', () => {
  it('does not re-request a short skill 404 when no override changes its image URL', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }))

    const observations = await collectAssetMetadata(
      [
        {
          ownerType: 'skill',
          ownerSourceId: 'skill123',
          url: 'https://voyage.tw/img/skill/uwo_skill123.png',
        },
      ],
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(observations).toHaveLength(1)
  })
})
