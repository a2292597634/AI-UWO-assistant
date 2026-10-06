import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { classifyProbe } from '../../tools/message-board/probe-contract'

const roots: string[] = []
const candidateSha = 'a'.repeat(40)
const environmentId = 'cloud1-board-test'
const appId = 'wx0000000000000001'
const runId = 'g0-20261005'
const buildSha = 'b'.repeat(64)
const input = () => {
  const evidenceRoot = mkdtempSync(join(tmpdir(), 'uwo-board-probe-'))
  roots.push(evidenceRoot)
  return {
    gate: 'safety' as const,
    evidenceRoot,
    candidateSha,
    buildSha,
    environmentId,
    appId,
    runId,
    evidencePaths: [] as string[],
  }
}

function record(root: string, check: string, overrides: Record<string, unknown> = {}) {
  const rawPath = check + '-raw.json'
  const bytes = Buffer.from(JSON.stringify({ traceId: 'trace-001', requestId: 'request-' + check }))
  writeFileSync(join(root, rawPath), bytes)
  const path = check + '.json'
  writeFileSync(
    join(root, path),
    JSON.stringify({
      schemaVersion: 1,
      gate: 'safety',
      check,
      candidateSha,
      buildSha,
      environmentId,
      appId,
      runId,
      source: 'live-cloud',
      outcome: 'passed',
      performedAt: '2026-10-05T15:00:00.000Z',
      artifact: { path: rawPath, sha256: createHash('sha256').update(bytes).digest('hex') },
      details: { traceId: 'trace-001' },
      ...overrides,
    }),
  )
  return path
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('留言板 G0 證據分類', () => {
  it('沒有獨立測試環境時保持未執行', () => {
    expect(classifyProbe({ ...input(), environmentId: null })).toMatchObject({ status: 'not-run' })
  })
  it('呼叫觀測 boolean 不能代替可讀證據', () => {
    expect(classifyProbe({ ...input(), observed: { transport: true } })).toMatchObject({
      status: 'not-run',
    })
  })
  it('正式環境不可以當作測試環境', () => {
    expect(classifyProbe({ ...input(), environmentId: 'cloud1-d7gxfuxfe813b4eaa' })).toMatchObject({
      status: 'blocked',
    })
  })
  it('只取得檢查發起結果不代表回調與落庫完成', () => {
    const data = input()
    data.evidencePaths = [
      record(data.evidenceRoot, 'text-check'),
      record(data.evidenceRoot, 'image-submit'),
    ]
    expect(classifyProbe(data)).toMatchObject({ status: 'not-run' })
  })
  it('完整同批證據可通過一致性核對', () => {
    const data = input()
    data.evidencePaths = [
      'text-check',
      'image-submit',
      'callback-verified',
      'callback-persisted',
    ].map((check) => record(data.evidenceRoot, check))
    expect(classifyProbe(data)).toMatchObject({ status: 'passed' })
  })
  it('其他候選的紀錄不能用來通過這次門檻', () => {
    const data = input()
    data.evidencePaths = [record(data.evidenceRoot, 'text-check', { candidateSha: 'b'.repeat(40) })]
    expect(classifyProbe(data)).toMatchObject({ status: 'blocked' })
  })
  it('本地 fixture 不被當作真雲證據', () => {
    const data = input()
    data.evidencePaths = [record(data.evidenceRoot, 'text-check', { source: 'local-fixture' })]
    expect(classifyProbe(data)).toMatchObject({ status: 'not-run' })
  })
  it('實際檢查失敗不被未完成項蓋過', () => {
    const data = input()
    data.evidencePaths = [record(data.evidenceRoot, 'text-check', { outcome: 'failed' })]
    expect(classifyProbe(data)).toMatchObject({ status: 'failed' })
  })
  it('原始證據被改寫時拒絕通過', () => {
    const data = input()
    data.evidencePaths = [record(data.evidenceRoot, 'text-check')]
    writeFileSync(join(data.evidenceRoot, 'text-check-raw.json'), '{}')
    expect(classifyProbe(data)).toMatchObject({ status: 'blocked' })
  })
  it('證據路徑不能越過指定證據根', () => {
    expect(classifyProbe({ ...input(), evidencePaths: ['../outside.json'] })).toMatchObject({
      status: 'blocked',
    })
  })
  it('圖片發起與回調 trace 不一致時拒絕通過', () => {
    const data = input()
    data.evidencePaths = [
      'text-check',
      'image-submit',
      'callback-verified',
      'callback-persisted',
    ].map((check) =>
      record(
        data.evidenceRoot,
        check,
        check === 'callback-persisted' ? { details: { traceId: 'other-trace' } } : {},
      ),
    )
    expect(classifyProbe(data)).toMatchObject({ status: 'blocked' })
  })
  it('相同 HEAD 但不同探測包不能混用證據', () => {
    const data = input()
    data.evidencePaths = [record(data.evidenceRoot, 'text-check', { buildSha: 'c'.repeat(64) })]
    expect(classifyProbe(data)).toMatchObject({ status: 'blocked' })
  })
  it('本地 fixture 不會掩蓋已觀測到的真雲失敗', () => {
    const data = input()
    data.evidencePaths = [
      record(data.evidenceRoot, 'text-check', { outcome: 'failed' }),
      record(data.evidenceRoot, 'image-submit', { source: 'local-fixture' }),
    ]
    expect(classifyProbe(data)).toMatchObject({ status: 'failed' })
  })
  it('不同容器的兩位使用者不能證明同實例沒有身分殘留', () => {
    const data = { ...input(), gate: 'identity' as const }
    data.evidencePaths = [
      'caller-a',
      'caller-b',
      'http-rejected',
      'cross-app-rejected',
      'warm-instance',
    ].map((check) =>
      record(data.evidenceRoot, check, {
        gate: 'identity',
        details:
          check === 'caller-a'
            ? { actorHash: '1'.repeat(64), instanceId: 'container-a' }
            : check === 'caller-b'
              ? { actorHash: '2'.repeat(64), instanceId: 'container-b' }
              : check === 'warm-instance'
                ? {
                    firstActorHash: '1'.repeat(64),
                    secondActorHash: '2'.repeat(64),
                    instanceId: 'container-c',
                  }
                : {},
      }),
    )
    expect(classifyProbe(data)).toMatchObject({ status: 'blocked' })
  })
})
