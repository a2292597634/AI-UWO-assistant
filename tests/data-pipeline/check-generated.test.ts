import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  readdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { checkGeneratedOutputs } from '../../tools/data-pipeline/check-generated'
const roots: string[] = []
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'uwo-generated-check-test-'))
  roots.push(root)
  mkdirSync(join(root, 'out'))
  writeFileSync(join(root, 'out/sample.js'), '2\n')
  return root
}
const build = (stage: string, content = '2\n') => {
  mkdirSync(join(stage, 'out'))
  writeFileSync(join(stage, 'out/sample.js'), content)
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
it('候選沒有 Git index 仍通過；檢查不改寫 bytes 或成員', () => {
  const root = fixture()
  expect(
    checkGeneratedOutputs({
      projectRoot: root,
      outputPaths: ['out'],
      buildStage: build,
      fingerprintInputs: () => 'fixed',
    }),
  ).toEqual({ status: 'passed', findings: [] })
  expect(readFileSync(join(root, 'out/sample.js'), 'utf8')).toBe('2\n')
  expect(readdirSync(join(root, 'out'))).toEqual(['sample.js'])
})
it('空的舊目錄也是候選漂移，不能忽略集合成員', () => {
  const root = fixture()
  mkdirSync(join(root, 'out/stale'))
  expect(
    checkGeneratedOutputs({
      projectRoot: root,
      outputPaths: ['out'],
      buildStage: build,
      fingerprintInputs: () => 'fixed',
    }).findings[0]?.code,
  ).toBe('GENERATED_OUTPUT_DRIFT')
})
it.each(['extra', 'missing', 'wrong'])('候選 %s 分類為漂移且不修正', (kind) => {
  const root = fixture(),
    p = join(root, 'out/sample.js')
  if (kind === 'extra') writeFileSync(join(root, 'out/old.js'), 'old')
  if (kind === 'missing') rmSync(p)
  if (kind === 'wrong') writeFileSync(p, 'wrong')
  const before = readdirSync(join(root, 'out')).map((n) => [
    n,
    readFileSync(join(root, 'out', n), 'utf8'),
  ])
  expect(
    checkGeneratedOutputs({
      projectRoot: root,
      outputPaths: ['out'],
      buildStage: build,
      fingerprintInputs: () => 'fixed',
    }).findings[0].code,
  ).toBe('GENERATED_OUTPUT_DRIFT')
  expect(
    readdirSync(join(root, 'out')).map((n) => [n, readFileSync(join(root, 'out', n), 'utf8')]),
  ).toEqual(before)
})
it('兩次輸出不同分類為非確定', () => {
  const root = fixture()
  let count = 0
  expect(
    checkGeneratedOutputs({
      projectRoot: root,
      outputPaths: ['out'],
      fingerprintInputs: () => 'fixed',
      buildStage: (s) => build(s, String(++count)),
    }).findings[0].code,
  ).toBe('GENERATION_NONDETERMINISTIC')
})
it('輸入變動不能因其他比較成功而通過', () => {
  const root = fixture()
  let count = 0
  expect(
    checkGeneratedOutputs({
      projectRoot: root,
      outputPaths: ['out'],
      fingerprintInputs: () => String(++count),
      buildStage: build,
    }).findings[0].code,
  ).toBe('GENERATION_INPUT_CHANGED')
})
it('第二次構建失敗及缺失 registry 項保留原始原因', () => {
  const root = fixture()
  let count = 0
  const result = checkGeneratedOutputs({
    projectRoot: root,
    outputPaths: ['out'],
    fingerprintInputs: () => 'fixed',
    buildStage: (s) => {
      if (++count === 2) throw new Error('build broke')
      build(s)
    },
  })
  expect(result.findings[0]).toMatchObject({
    code: 'GENERATION_BUILD_FAILED',
    message: expect.stringContaining('build broke'),
  })
  expect(
    checkGeneratedOutputs({
      projectRoot: root,
      outputPaths: ['absent'],
      fingerprintInputs: () => 'fixed',
      buildStage: build,
    }).findings[0].code,
  ).toBe('GENERATION_BUILD_FAILED')
  expect(readFileSync(join(root, 'out/sample.js'), 'utf8')).toBe('2\n')
})
it('拒絕另一棵樹及 junction，不碰外部檔案', () => {
  const root = fixture(),
    external = fixture()
  symlinkSync(
    join(external, 'out'),
    join(root, 'linked'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  for (const output of ['../outside', 'linked']) {
    expect(
      checkGeneratedOutputs({
        projectRoot: root,
        outputPaths: [output],
        fingerprintInputs: () => 'fixed',
        buildStage: build,
      }).findings[0].code,
    ).toBe('GENERATION_BUILD_FAILED')
  }
  expect(readFileSync(join(external, 'out/sample.js'), 'utf8')).toBe('2\n')
})
