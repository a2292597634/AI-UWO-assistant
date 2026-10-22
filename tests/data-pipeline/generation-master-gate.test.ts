import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { generate } from '../../tools/data-pipeline/generate'
import { checkMasterDataset } from '../../tools/data-audit/check-master-dataset'

it('未知銷售港口阻止正式生成並保留全部既有產物', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'uwo-master-gate-'))
  const original = process.cwd()
  try {
    for (const path of [
      'data/master',
      'data/schema',
      'data/assets/cloudbase-manifest.json',
      'data/assets/cloudbase-reused-skill-icons.json',
      'archive/voyage-tw-2026052501/raw-data/json_char.js',
      'miniprogram/subpkg-trade/assets/major-events',
    ]) {
      const target = join(fixture, path)
      mkdirSync(dirname(target), { recursive: true })
      cpSync(path, target, { recursive: true })
    }
    const path = join(fixture, 'data/master/trade-goods.json')
    const data = JSON.parse(readFileSync(path, 'utf8'))
    data.tradeGoods[0].salesMode = 'fixed-port'
    data.tradeGoods[0].salesPortIds = ['town_missing_review']
    writeFileSync(path, JSON.stringify(data))
    mkdirSync(join(fixture, 'miniprogram/generated'), { recursive: true })
    const target = join(fixture, 'miniprogram/generated/sentinel')
    writeFileSync(target, 'dirty-keep')
    process.chdir(fixture)
    expect(checkMasterDataset().filter((f) => f.severity === 'error').length).toBeGreaterThan(0)
    expect(() => generate()).toThrow('正式 master 校驗失敗')
    expect(readFileSync(target, 'utf8')).toBe('dirty-keep')
  } finally {
    process.chdir(original)
    rmSync(fixture, { recursive: true, force: true })
  }
})
