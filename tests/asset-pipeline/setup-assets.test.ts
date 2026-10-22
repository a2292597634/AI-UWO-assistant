import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  renameSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type { AssetDependencyIndex } from '../../tools/data-pipeline/asset-dependencies'
import { buildAssetEntries } from '../../tools/asset-pipeline/download-assets'
import {
  collectAssetSourceFiles,
  validateReferencedAssetSources,
  setupAssets,
} from '../../tools/asset-pipeline/setup-assets'
import { loadSkillIconOverrides } from '../../tools/asset-pipeline/source-skill-icons'

const dependencies = (files: string[], officerIds: string[] = []): AssetDependencyIndex => ({
  roots: [
    {
      root: 'subpkg-assets-0',
      name: 'assetsCatalog0',
      officerIds,
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

  it('航海士頭像缺少透明像素時失敗並指出檔名', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-assets-opaque-'))
    const filename = 'officer_wo_offline_opaque.png'
    const filePath = join(root, filename)
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer()
    writeFileSync(filePath, png)

    try {
      await expect(
        validateReferencedAssetSources(
          dependencies([filename], ['officer_wo_offline_opaque']),
          new Map([[filename, filePath]]),
        ),
      ).rejects.toThrow('officer_wo_offline_opaque.png')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('投稿航海士頭像缺少透明背景時也必須被素材門禁拒絕', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-assets-custom-opaque-'))
    const filename = 'officer_custom_legacy.png'
    const filePath = join(root, filename)
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer()
    writeFileSync(filePath, png)

    try {
      await expect(
        validateReferencedAssetSources(
          dependencies([filename], ['officer_custom_legacy']),
          new Map([[filename, filePath]]),
        ),
      ).rejects.toThrow('officer_custom_legacy.png 頭像必須保留透明背景')
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
  it('metadata 可讀的截斷 PNG 仍必須完整解碼失敗', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-assets-truncated-'))
    try {
      const png = await sharp({
        create: { width: 64, height: 64, channels: 4, background: '#00ff00ff' },
      })
        .png()
        .toBuffer()
      const path = join(root, 'skill_bad.png')
      writeFileSync(path, png.subarray(0, 70))
      await expect(
        validateReferencedAssetSources(
          dependencies(['skill_bad.png']),
          new Map([['skill_bad.png', path]]),
        ),
      ).rejects.toThrow('skill_bad.png')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
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
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer()
    writeFileSync(filePath, png)

    try {
      await expect(
        validateReferencedAssetSources(
          dependencies([filename], ['officer_valid']),
          new Map([[filename, filePath]]),
        ),
      ).resolves.toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('素材整批原子性', () => {
  it.each(['壞圖', '編碼失敗', '替換失敗', '回復失敗', '成功'])(
    '%s 時 staging 與索引保持同一成功邊界',
    async (mode) => {
      const root = mkdtempSync(join(tmpdir(), 'uwo-assets-transaction-'))
      const original = process.cwd()
      const png = await sharp({
        create: { width: 64, height: 64, channels: 4, background: '#00ff00ff' },
      })
        .png()
        .toBuffer()
      const put = (path: string, value: string | Buffer) => {
        const target = join(root, path)
        mkdirSync(join(target, '..'), { recursive: true })
        writeFileSync(target, value)
      }
      put('data/master/officers.json', '[]')
      put(
        'data/master/skills.json',
        JSON.stringify([
          { id: 'skill_good', categoryId: 'cat' },
          { id: 'skill_bad', categoryId: 'cat' },
        ]),
      )
      put('data/master/trade-goods.json', '{"tradeGoods":[]}')
      put('archive/voyage-tw-2026052501/raw-data/json_char.js', 'var skill_arr={};')
      put('data/assets/staging/skill_good.png', png)
      put('data/assets/staging/skill_bad.png', mode === '壞圖' ? png.subarray(0, 70) : png)
      put('data/assets/staging/unreferenced.png', png)
      put('data/assets/staging/legal.txt', 'keep')
      put('data/assets/asset-dependencies.json', 'old-index')
      const before = new Map(
        readdirSync(join(root, 'data/assets/staging')).map((name) => [
          name,
          readFileSync(join(root, 'data/assets/staging', name)),
        ]),
      )
      let encoded = 0
      let renamed = 0
      const installError = Error('索引安裝失敗')
      const rollbackIndexError = Error('索引回復失敗')
      const rollbackStagingError = Error('staging 回復失敗')
      try {
        process.chdir(root)
        const operation = setupAssets({
          encodePng: async (input: Buffer) => {
            if (mode === '編碼失敗' && ++encoded === 2) throw Error('後續編碼失敗')
            return sharp(input).png({ palette: true }).toBuffer()
          },
          renamePath: (from: string, to: string) => {
            renamed += 1
            if (mode === '替換失敗' && renamed === 4) throw Error('替換失敗')
            if (mode === '回復失敗') {
              if (renamed === 4) throw installError
              if (renamed === 5) throw rollbackIndexError
              if (renamed === 6) throw rollbackStagingError
            }
            renameSync(from, to)
          },
        })
        if (mode === '回復失敗') {
          const error = await operation.catch((error) => error)
          expect(error).toMatchObject({
            cause: installError,
            rollbackErrors: [{ error: rollbackIndexError }, { error: rollbackStagingError }],
          })
          expect(renamed).toBe(6)
          const stageName = readdirSync('data/assets').find((name) =>
            name.startsWith('.uwo-setup-'),
          )
          expect(stageName).toBeDefined()
          const recoveryPath = join(root, 'data/assets', stageName!)
          expect(error).toHaveProperty('recoveryPath', recoveryPath)
          expect(error).toHaveProperty('message', expect.stringContaining(recoveryPath))
          expect(error).toHaveProperty('message', expect.stringContaining('索引安裝失敗'))
          expect(error).toHaveProperty('message', expect.stringContaining('索引回復失敗'))
          expect(error).toHaveProperty('message', expect.stringContaining('staging 回復失敗'))
          expect(readFileSync(join(recoveryPath, 'backup-1'), 'utf8')).toBe('old-index')
          expect(
            new Map(
              readdirSync(join(recoveryPath, 'backup-0')).map((name) => [
                name,
                readFileSync(join(recoveryPath, 'backup-0', name)),
              ]),
            ),
          ).toEqual(before)
          return
        }
        if (mode === '成功') await operation
        else await expect(operation).rejects.toThrow()
        expect(readFileSync('data/assets/staging/legal.txt', 'utf8')).toBe('keep')
        expect(readFileSync('data/assets/staging/unreferenced.png')).toEqual(png)
        if (mode !== '成功') {
          expect(readFileSync('data/assets/asset-dependencies.json', 'utf8')).toBe('old-index')
          expect(
            new Map(
              readdirSync('data/assets/staging').map((name) => [
                name,
                readFileSync(join('data/assets/staging', name)),
              ]),
            ),
          ).toEqual(before)
        } else
          expect(readFileSync('data/assets/asset-dependencies.json', 'utf8')).not.toBe('old-index')
      } finally {
        process.chdir(original)
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
