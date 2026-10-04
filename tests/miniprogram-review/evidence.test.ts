import { mkdirSync, mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { captureReviewSource, compareReviewEvidence } from '../../tools/miniprogram-review/evidence'
import { evidence } from './evidence-fixture'
const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})
it('有意不同 commit、候選 bytes、端點與副本路徑仍可同條件比較', () => {
  const after = evidence('2')
  after.source.projectRoot = 'F:/copy'
  after.source.executionRoot = 'F:/copy'
  after.runtime.endpoint = 'ws://127.0.0.1:9450'
  expect(compareReviewEvidence(evidence(), after).status).toBe('comparable')
})
it.each([
  'fixtureSha256',
  'fixtureName',
  'stateInputSha256',
  'scenarioSha256',
  'screenshotKey',
  'state',
  'pagePath',
] as const)('相同 commit 也不能跨不同 %s', (key) => {
  const after = evidence()
  after.scenario[key] = 'changed'
  expect(compareReviewEvidence(evidence(), after).status).toBe('incompatible')
})
it.each(['sdkVersion', 'width', 'height', 'adapter'] as const)(
  '不同 runtime %s 不能套用圖片',
  (key) => {
    const after = evidence()
    Object.assign(after.runtime, {
      [key]: typeof after.runtime[key] === 'number' ? 999 : 'different',
    })
    expect(compareReviewEvidence(evidence(), after).status).toBe('incompatible')
  },
)
it('舊圖片與未知狀態、尺寸、SDK、attach 或來源改動只作歷史參考', () => {
  expect(compareReviewEvidence(undefined, evidence()).status).toBe('historical')
  const cases = [evidence(), evidence(), evidence(), evidence(), evidence()]
  cases[0].scenario.stateInputSha256 = null
  cases[1].runtime.width = null
  cases[2].runtime.sdkVersion = null
  cases[3].source.binding = 'unverified'
  cases[4].source.unchangedDuringRun = false
  for (const after of cases)
    expect(compareReviewEvidence(evidence(), after).status).toBe('historical')
})
it('來源 hash 包含素材與有效私有配置，忽略文件及個人配置；拒絕越界 symlink', () => {
  const root = mkdtempSync(join(tmpdir(), 'uwo-source-'))
  roots.push(root)
  mkdirSync(join(root, 'miniprogram/assets'), { recursive: true })
  mkdirSync(join(root, '.codex'))
  writeFileSync(join(root, 'miniprogram/assets/image.png'), 'first')
  writeFileSync(
    join(root, 'project.private.config.json'),
    '{"appid":"private","libVersion":"3.17.0"}',
  )
  const first = captureReviewSource(root, root)
  writeFileSync(join(root, '.codex/config.toml'), 'private')
  writeFileSync(join(root, 'README.md'), 'doc')
  expect(captureReviewSource(root, root).candidateSha256).toBe(first.candidateSha256)
  writeFileSync(join(root, 'miniprogram/assets/image.png'), 'second')
  expect(captureReviewSource(root, root).candidateSha256).not.toBe(first.candidateSha256)
  expect(JSON.stringify(first)).not.toContain('appid')
  const external = mkdtempSync(join(tmpdir(), 'uwo-external-'))
  roots.push(external)
  symlinkSync(
    external,
    join(root, 'miniprogram/linked'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  expect(() => captureReviewSource(root, root)).toThrow(/符號連結/)
})
