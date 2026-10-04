import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  GENERATION_INPUT_PATHS,
  fingerprintGenerationInputs,
} from '../../tools/data-pipeline/generation-input-paths'
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
it('每項真實依賴的 bytes 變動及可選 reuse 從無到有都改變指紋', () => {
  const root = mkdtempSync(join(tmpdir(), 'uwo-input-hash-'))
  roots.push(root)
  for (const p of GENERATION_INPUT_PATHS) {
    const file = p.endsWith('/') ? p + 'sample.ts' : p
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), 'original')
  }
  const hash = () => fingerprintGenerationInputs({ projectRoot: root, env: {} })
  const initial = hash()
  for (const p of GENERATION_INPUT_PATHS) {
    const f = join(root, p.endsWith('/') ? p + 'sample.ts' : p)
    writeFileSync(f, 'changed')
    expect(hash(), p).not.toBe(initial)
    writeFileSync(f, 'original')
  }
  writeFileSync(join(root, 'data/assets/cloudbase-reused-skill-icons.json'), '{}')
  expect(hash()).not.toBe(initial)
})
it('只序列化素材路徑環境變數，缺失外部 manifest 保留路徑', () => {
  expect(() => fingerprintGenerationInputs({ projectRoot: '/absent', env: {} })).toThrow()
})
