import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { CanonicalTradeDataset, CanonicalTradeGood } from '../../tools/import/types'
import {
  buildAssetEntries,
  buildTradeAssetEntries,
  downloadAssets,
} from '../../tools/asset-pipeline/download-assets'

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

describe('貿易品圖示下載條目', () => {
  const normalTrade = {
    id: 'trade0615',
    iconId: null,
    sourceRefs: { voyageTw: 'trade0615' },
  } as CanonicalTradeGood

  it('將共用覆寫圖示建立為單一下載條目', () => {
    const entries = buildTradeAssetEntries([
      {
        id: 'trade18T903',
        iconId: 'trade1817',
        sourceRefs: { voyageTw: 'trade18T903' },
      },
      {
        id: 'trade1817',
        iconId: null,
        sourceRefs: { voyageTw: 'trade1817' },
      },
    ] as CanonicalTradeGood[])

    expect(entries).toEqual([
      {
        ownerCanonicalId: 'trade-icon_trade1817',
        kind: 'icon',
        sourceId: 'trade1817',
        url: 'https://voyage.tw/img/trade/uwo_trade1817.png',
        localPath: 'data/assets/staging/trade_trade1817.png',
      },
    ])
  })

  it('為目前主資料的 656 項貿易品建立 633 個唯一圖示條目', () => {
    const dataset = JSON.parse(
      readFileSync('data/master/trade-goods.json', 'utf8'),
    ) as CanonicalTradeDataset

    expect(dataset.tradeGoods).toHaveLength(656)
    expect(buildTradeAssetEntries(dataset.tradeGoods)).toHaveLength(633)
    expect(
      buildTradeAssetEntries(dataset.tradeGoods).find(
        (entry) => entry.ownerCanonicalId === 'trade-icon_trade0801',
      )?.sourceId,
    ).toBe('trade0801')
    expect(dataset.tradeGoods.find((trade) => trade.id === 'trade02T092')?.iconId).toBe('trade0801')
  })

  it('下載貿易品圖示並記錄其來源資訊', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-download-trade-icon-'))
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(Buffer.from('png'), { status: 200 }))
    const entries = buildTradeAssetEntries([normalTrade])

    try {
      const manifest = await downloadAssets(
        entries.map((entry) => ({
          ...entry,
          localPath: join(root, entry.ownerCanonicalId + '.png'),
        })),
        [],
        { fetcher, sleep: async () => undefined, random: () => 0 },
      )

      expect(fetcher).toHaveBeenCalledWith(
        'https://voyage.tw/img/trade/uwo_trade0615.png',
        expect.objectContaining({ headers: { 'user-agent': expect.any(String) } }),
      )
      expect(manifest[0]).toMatchObject({
        canonicalId: 'trade-icon_trade0615',
        sourceId: 'trade0615',
        status: 200,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
