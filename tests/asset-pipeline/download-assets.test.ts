import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { buildAssetEntries, downloadAssets } from '../../tools/asset-pipeline/download-assets'

describe('素材下载批次节流', () => {
  it('在批次之间等待并为每个请求设置 User-Agent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-download-assets-'))
    const entries = buildAssetEntries(
      Array.from({ length: 9 }, (_, index) => ({
        canonicalId: `officer_test_${index}`,
        sourceId: `test_${index}`,
      })),
      [],
    ).map((entry) => ({
      ...entry,
      localPath: join(root, `${entry.ownerCanonicalId}.png`),
    }))
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(Buffer.from('asset')))
    const timerSpy = vi.spyOn(globalThis, 'setTimeout')

    try {
      const manifest = await downloadAssets(entries, [])

      expect(manifest).toHaveLength(9)
      expect(fetchMock).toHaveBeenCalledTimes(9)
      for (const [, init] of fetchMock.mock.calls) {
        expect(new Headers(init?.headers).get('user-agent')).toBe(
          'uwo-assistant-asset-pipeline/1.0',
        )
      }

      const delays = timerSpy.mock.calls
        .map((call) => Number(call[1]))
        .filter((delay) => delay >= 100 && delay <= 150)
      expect(delays).toHaveLength(1)
    } finally {
      vi.restoreAllMocks()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
