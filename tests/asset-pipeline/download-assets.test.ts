import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { ModuleKind, transpileModule } from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import {
  isVoyageTwOfficerSourceRefs,
  type CanonicalSkill,
  type CanonicalTradeDataset,
  type CanonicalTradeGood,
} from '../../tools/import/types'
import {
  buildAssetEntries,
  buildTradeAssetEntries,
  buildVoyageSkillData,
  downloadAssets,
} from '../../tools/asset-pipeline/download-assets'

const sha256 = (content: Buffer): string => createHash('sha256').update(content).digest('hex')

// 執行正式 CLI；所有下載與輸出均在記憶體中，防止回歸測試改寫素材。
const runSkillDownloadCli = async (skills: readonly CanonicalSkill[], limit?: string) => {
  const source = transpileModule(readFileSync('tools/asset-pipeline/download-assets.ts', 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS },
  }).outputText
  let finish!: (manifest: Array<{ canonicalId: string; url: string }>) => void
  const completed = new Promise<Array<{ canonicalId: string; url: string }>>((resolve) => {
    finish = resolve
  })
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(Buffer.from('png')))
  const dependencies: Record<string, unknown> = {
    'node:crypto': { createHash },
    'node:fs': {
      existsSync: () => false,
      mkdirSync: () => undefined,
      readFileSync: (path: string) => {
        if (path === 'data/master/skills.json') return JSON.stringify(skills)
        if (path === 'data/master/trade-goods.json') return '{"tradeGoods":[]}'
        throw new Error('沒有快取清單')
      },
      writeFileSync: (path: string, content: string) => {
        if (path === 'data/assets/source-asset-manifest.json') finish(JSON.parse(content))
      },
    },
    '../import/types': { isVoyageTwOfficerSourceRefs },
    '../data-pipeline/load-officers': { loadCanonicalOfficers: () => [] },
    './source-skill-icons': {
      loadSkillIconOverrides: () => new Map([['skill_source', 'skill_override.png']]),
    },
    './trade-icons': { buildTradeIconSources: () => [] },
  }
  runInNewContext(source, {
    exports: {},
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`測試未提供依賴：${name}`)
      return dependencies[name]
    },
    process: {
      argv: [
        'node',
        'tools/asset-pipeline/download-assets.ts',
        ...(limit === undefined ? [] : [limit]),
      ],
      stdout: { write: () => undefined },
    },
    console: { log: () => undefined, error: () => undefined },
    fetch: fetcher,
    Buffer,
    setTimeout: (callback: () => void) => callback(),
  })
  return { manifest: await completed, fetcher }
}

describe('手動技能與 voyage.tw 下載分流', () => {
  const fixture: CanonicalSkill[] = [
    {
      id: 'skill_manual',
      name: '手動技能',
      categoryId: 'category',
      description: '',
      levelInfo: '',
      iconId: null,
      sourceRefs: { workOrderId: 'wo:skill' },
    },
    {
      id: 'skill_source',
      name: '來源技能',
      categoryId: 'category',
      description: '',
      levelInfo: '',
      iconId: null,
      sourceRefs: { voyageTw: 'source' },
    },
  ]

  it('純投影排除手動與空來源，以 canonical ID 讀取覆寫且不觸發 fetch', () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('禁止外部 I/O'))
    try {
      const skills = [
        ...fixture,
        { ...fixture[1]!, id: 'skill_empty', sourceRefs: { voyageTw: '' } },
        {
          ...fixture[1]!,
          id: 'skill_other',
          sourceRefs: { voyageTw: 'other' },
        },
      ]
      const projection = buildVoyageSkillData(skills, new Map([['skill_other', 'skill_image.png']]))
      expect(projection).toEqual([
        { id: 'source', imageOverrideId: null },
        { id: 'other', imageOverrideId: 'image' },
      ])
      expect(buildAssetEntries([], projection, 0).map((entry) => entry.url)).toEqual([
        'https://voyage.tw/img/skill/uwo_source.png',
        'https://voyage.tw/img/skill/uwo_image.png',
      ])
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      fetcher.mockRestore()
    }
  })

  it('完整 master 純投影在 limit0 與小批次建清單時都不觸發 fetch', () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('禁止外部 I/O'))
    try {
      const skills = JSON.parse(readFileSync('data/master/skills.json', 'utf8')) as CanonicalSkill[]
      const projection = buildVoyageSkillData(skills, new Map())
      expect(projection).toHaveLength(1203)
      expect(buildAssetEntries([], projection, 0)).toHaveLength(1203)
      expect(buildAssetEntries([], projection, 40)).toHaveLength(40)
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      fetcher.mockRestore()
    }
  })

  it.each([undefined, '0'])('CLI limit=%s 排除手動技能且沿用覆寫來源', async (limit) => {
    const { manifest, fetcher } = await runSkillDownloadCli(fixture, limit)
    expect(manifest).toEqual([
      expect.objectContaining({
        canonicalId: 'skill_source',
        url: 'https://voyage.tw/img/skill/uwo_override.png',
      }),
    ])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('CLI limit0 能為完整 1209 技能建立清單，六筆手動技能沒有遠端 URL', async () => {
    const skills = JSON.parse(readFileSync('data/master/skills.json', 'utf8')) as CanonicalSkill[]
    expect(skills).toHaveLength(1209)
    const manual = skills.filter((skill) => !skill.sourceRefs.voyageTw)
    expect(manual).toHaveLength(6)
    const { manifest, fetcher } = await runSkillDownloadCli(skills, '0')
    expect(manifest).toHaveLength(1203)
    expect(manifest.some((entry) => manual.some((skill) => skill.id === entry.canonicalId))).toBe(
      false,
    )
    expect(manifest.every((entry) => !entry.url.includes('undefined'))).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1203)
  })
})

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
