import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { buildAssetEntries, downloadAssets } from '../../tools/asset-pipeline/download-assets'

const sha256 = (content: Buffer): string => createHash('sha256').update(content).digest('hex')

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

  it('缓存文件摘要不一致时重新下载并更新清单', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-download-cache-'))
    const [entry] = buildAssetEntries(
      [{ canonicalId: 'officer_cache', sourceId: 'cache' }],
      [],
    ).map((asset) => ({ ...asset, localPath: join(root, 'officer_cache.png') }))
    const staleContent = Buffer.from('stale-cache-content')
    const freshContent = Buffer.from('fresh-cache-content')
    writeFileSync(entry!.localPath, staleContent)
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(freshContent, { status: 200 }))

    try {
      const manifest = await downloadAssets(
        [entry!],
        [
          {
            canonicalId: entry!.ownerCanonicalId,
            kind: entry!.kind,
            sourceId: entry!.sourceId,
            url: entry!.url,
            status: 200,
            localPath: entry!.localPath,
            byteSize: freshContent.length,
            sha256: sha256(freshContent),
          },
        ],
        { fetcher, sleep: async () => undefined, random: () => 0 },
      )

      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(readFileSync(entry!.localPath)).toEqual(freshContent)
      expect(manifest[0]).toMatchObject({
        byteSize: freshContent.length,
        sha256: sha256(freshContent),
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
