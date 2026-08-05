import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectAssetSourceFiles } from '../../tools/asset-pipeline/setup-assets'
import { buildAssetEntries } from '../../tools/asset-pipeline/download-assets'

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
