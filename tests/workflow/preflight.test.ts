import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  cpSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkNodeVersion, checkNpmVersion, collectPreflight } from '../../tools/workflow/preflight'

const roots: string[] = []
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'uwo-preflight-'))
  roots.push(root)
  for (const p of [
    'package.json',
    'package-lock.json',
    'data/master',
    'data/schema',
    'data/audit',
    'data/assets/cloudbase-manifest.json',
    'data/assets/staging',
    'archive/voyage-tw-2026052501/raw-data/json_char.js',
    'tools',
  ]) {
    mkdirSync(join(root, p, '..'), { recursive: true })
    cpSync(resolve(p), join(root, p), { recursive: true })
  }
  return root
}
const input = (root: string) => ({
  projectRoot: root,
  scope: 'repository' as const,
  nodeVersion: 'v22.23.3',
  npmVersion: '10.9.9',
  platform: 'win32',
  env: {},
})
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
describe('只讀預檢', () => {
  it.each([null, { assets: [null] }, { assets: {} }])(
    '合法 JSON 但損壞 manifest 仍分類並繼續診斷：%j',
    (value) => {
      const root = fixture()
      writeFileSync(join(root, 'data/assets/cloudbase-manifest.json'), JSON.stringify(value))
      const report = collectPreflight(input(root))
      expect(report.ready).toBe(false)
      expect(report.items).toContainEqual(
        expect.objectContaining({
          code: 'INPUT_INVALID',
          paths: [join(root, 'data/assets/cloudbase-manifest.json')],
        }),
      )
    },
  )
  it.each(['v20.19.0', 'v23.0.0', 'v24.14.1', 'invalid'])('%s 阻止正式門禁', (version) => {
    expect(checkNodeVersion(version)).toMatchObject({ code: 'NODE_UNSUPPORTED', level: 'error' })
  })
  it.each(['v22.14.0', 'v22.23.3'])('%s 符合環境要求', (version) => {
    expect(checkNodeVersion(version).level).toBe('info')
  })
  it.each([
    ['9.9.0', 'error'],
    ['10.9.9', 'info'],
    ['11.0.0', 'info'],
    ['invalid', 'error'],
    ['', 'error'],
  ])('npm %s 的判定為 %s', (version, level) => expect(checkNpmVersion(version).level).toBe(level))
  it('缺失或損壞輸入分類，不建立檔案', () => {
    const root = fixture()
    rmSync(join(root, 'data/master/skills.json'))
    writeFileSync(join(root, 'data/schema/skills.schema.json'), '{')
    const before = readdirSync(root, { recursive: true })
    const report = collectPreflight(input(root))
    expect(report.ready).toBe(false)
    expect(report.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INPUT_MISSING',
          paths: [join(root, 'data/master/skills.json')],
        }),
        expect.objectContaining({
          code: 'INPUT_INVALID',
          paths: [join(root, 'data/schema/skills.schema.json')],
        }),
      ]),
    )
    expect(readdirSync(root, { recursive: true })).toEqual(before)
    expect(readFileSync(join(root, 'data/schema/skills.schema.json'), 'utf8')).toBe('{')
  })
  it('已有 CI 素材 bytes 不符時回報，不能自動覆寫', () => {
    const root = fixture()
    const p = join(root, 'data/assets/staging/skill_wo_offline_adventure_collect_hazard.png')
    writeFileSync(p, 'wrong')
    expect(collectPreflight(input(root)).items).toContainEqual(
      expect.objectContaining({ code: 'CI_ASSET_INVALID', level: 'error' }),
    )
    expect(readFileSync(p, 'utf8')).toBe('wrong')
  })
  it('外部 manifest 路徑明示且缺失失敗，Linux 不直接阻塞', () => {
    const root = fixture()
    const report = collectPreflight({
      ...input(root),
      platform: 'linux',
      env: { CLOUDBASE_ASSET_MANIFEST_PATH: join(root, 'absent.json') },
    })
    expect(report.items).toContainEqual(
      expect.objectContaining({ code: 'INPUT_MISSING', paths: [join(root, 'absent.json')] }),
    )
    expect(report.items).toContainEqual(
      expect.objectContaining({ code: 'PLATFORM_DIFFERENCE', level: 'warning' }),
    )
  })
  it('頁面預檢顯示私有基礎庫覆蓋和實測未執行，不能輸出 appid', () => {
    const root = fixture()
    writeFileSync(
      join(root, 'project.config.json'),
      JSON.stringify({ libVersion: '3.7.0', appid: 'secret' }),
    )
    writeFileSync(
      join(root, 'project.private.config.json'),
      JSON.stringify({ libVersion: '3.17.0', appid: 'secret' }),
    )
    const report = collectPreflight({
      ...input(root),
      scope: 'page',
      env: { WECHAT_DEVTOOLS_CLI: join(root, 'tools/workflow/cli.ts') },
    })
    expect(report.items).toContainEqual(
      expect.objectContaining({ code: 'BASE_LIBRARY_OVERRIDE', level: 'warning' }),
    )
    expect(report.items).toContainEqual(expect.objectContaining({ code: 'PAGE_PROBE_NOT_RUN' }))
    expect(JSON.stringify(report)).not.toContain('secret')
  })
})
