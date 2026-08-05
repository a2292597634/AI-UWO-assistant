import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectAssetSourceFiles } from '../../tools/asset-pipeline/setup-assets'

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
