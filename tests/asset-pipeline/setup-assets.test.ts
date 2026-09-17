import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type { AssetDependencyIndex } from '../../tools/data-pipeline/asset-dependencies'
import { buildAssetEntries } from '../../tools/asset-pipeline/download-assets'
import {
  collectAssetSourceFiles,
  validateReferencedAssetSources,
} from '../../tools/asset-pipeline/setup-assets'
import { loadSkillIconOverrides } from '../../tools/asset-pipeline/source-skill-icons'

const dependencies = (files: string[]): AssetDependencyIndex => ({
  roots: [
    {
      root: 'subpkg-assets-0',
      name: 'assetsCatalog0',
      officerIds: [],
      files,
    },
  ],
  pathToRoot: {},
  skillIcons: {},
  officerPortraits: {},
  officerCatalogRoots: {},
  officerDetailRoots: {},
  tradeIcons: {},
})

describe('asset source collection', () => {
  it('preserves canonical filename casing for generated asset references', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-assets-'))
    try {
      mkdirSync(join(root, 'source'))
      writeFileSync(join(root, 'source', 'skill_skillT0003.png'), 'png')

      const sources = collectAssetSourceFiles([join(root, 'source')])

      expect([...sources.keys()]).toEqual(['skill_skillT0003.png'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('normalizes lowercase skill variant filenames to canonical casing', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-assets-lowercase-'))
    try {
      mkdirSync(join(root, 'source'))
      writeFileSync(join(root, 'source', 'skill_skillt0092.png'), 'png')

      const sources = collectAssetSourceFiles([join(root, 'source')])

      expect([...sources.keys()]).toEqual(['skill_skillT0092.png'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('loads canonical skill icon overrides from skill_arr metadata', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-skill-icons-'))
    try {
      const sourcePath = join(root, 'json_char.js')
      writeFileSync(sourcePath, 'var skill_arr={"skillT0092":{"t":"menuskt16","i":"skill202001"}}')

      const overrides = loadSkillIconOverrides(sourcePath)

      expect(overrides.get('skill_skillT0092')).toBe('skill_skill202001.png')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('asset staging directory isolation', () => {
  it('defaults business PNG paths to data/assets/staging/', () => {
    const entries = buildAssetEntries(
      [{ canonicalId: 'officer_chast089', sourceId: 'chast089' }],
      [{ id: 'skill100043' }],
    )

    for (const entry of entries) {
      expect(entry.localPath.startsWith('data/assets/staging/')).toBe(true)
    }
  })

  it('does not place any default business asset under miniprogram/assets/', () => {
    const entries = buildAssetEntries(
      [
        { canonicalId: 'officer_chast089', sourceId: 'chast089' },
        { canonicalId: 'officer_chast090', sourceId: 'chast090' },
      ],
      [{ id: 'skill100043' }, { id: 'skill203426' }, { id: 'skill400591' }],
    )

    for (const entry of entries) {
      expect(entry.localPath).not.toContain('miniprogram/assets/')
    }
  })
})

describe('素材来源完整性校验', () => {
  it('缺少依赖文件时失败并指出文件名', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-assets-missing-'))
    try {
      await expect(
        validateReferencedAssetSources(
          dependencies(['officer_missing.png']),
          new Map([['officer_missing.png', join(root, 'officer_missing.png')]]),
        ),
      ).rejects.toThrow('officer_missing.png')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('缺少貿易品圖示時失敗並指出檔名', async () => {
    await expect(
      validateReferencedAssetSources(dependencies(['trade_trade1817.png']), new Map()),
    ).rejects.toThrow('trade_trade1817.png')
  })

  it('PNG 无法被 sharp 解码时失败并指出文件名', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-assets-invalid-'))
    const filename = 'officer_invalid.png'
    const filePath = join(root, filename)
    writeFileSync(filePath, Buffer.from('not a png'))

    try {
      await expect(
        validateReferencedAssetSources(dependencies([filename]), new Map([[filename, filePath]])),
      ).rejects.toThrow(filename)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('所有依赖文件都是可解码 PNG 时通过', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-assets-valid-'))
    const filename = 'officer_valid.png'
    const filePath = join(root, filename)
    const png = await sharp({
      create: { width: 1, height: 1, channels: 4, background: '#ffffff' },
    })
      .png()
      .toBuffer()
    writeFileSync(filePath, png)

    try {
      await expect(
        validateReferencedAssetSources(dependencies([filename]), new Map([[filename, filePath]])),
      ).resolves.toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
