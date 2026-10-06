import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { CLOUDBASE_ENV_ID } from '../../miniprogram/runtime/cloudbase-config'
import { assertSafeInputPath } from '../workflow/read-inputs'

export type ProbeGate = 'safety' | 'avatar' | 'identity'
export type ProbeStatus = 'passed' | 'failed' | 'blocked' | 'not-run'
export interface ProbeInput {
  gate: ProbeGate
  evidenceRoot: string
  candidateSha: string
  buildSha: string
  environmentId: string | null
  appId: string
  runId: string
  evidencePaths: string[]
  /** 呼叫端舊觀測不作為證據。 */
  observed?: unknown
}
export interface ProbeResult {
  gate: ProbeGate
  status: ProbeStatus
  environmentId: string | null
  candidateSha: string
  buildSha: string
  evidencePaths: string[]
  reason: string | null
  /** 僅核對證據一致性；不認證人工標註的來源真實性。 */
  verification: 'evidence-consistency'
}

const CHECKS: Record<ProbeGate, readonly string[]> = {
  safety: ['text-check', 'image-submit', 'callback-verified', 'callback-persisted'],
  avatar: ['transport', 'private-acl', 'public-acl', 'device-render', 'cleanup'],
  identity: ['caller-a', 'caller-b', 'http-rejected', 'cross-app-rejected', 'warm-instance'],
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function readBounded(root: string, path: string, limit: number): Buffer {
  const absolute = assertSafeInputPath(root, path)
  const stat = statSync(absolute)
  if (!stat.isFile() || stat.size === 0 || stat.size > limit) throw new Error('證據大小不合法')
  return readFileSync(absolute)
}

/** 核對可讀性、身份、原始檔案雜湊與同批關聯，不將本地測試轉為平台通過。 */
export function classifyProbe(input: ProbeInput): ProbeResult {
  const result = (status: ProbeStatus, reason: string | null): ProbeResult => ({
    gate: input.gate,
    status,
    reason,
    environmentId: input.environmentId,
    candidateSha: input.candidateSha,
    buildSha: input.buildSha,
    evidencePaths: [...input.evidencePaths],
    verification: 'evidence-consistency',
  })
  if (!input.environmentId) return result('not-run', '尚未指定獨立測試環境')
  if (input.environmentId === CLOUDBASE_ENV_ID) return result('blocked', '禁止使用現有正式環境')
  if (
    !CHECKS[input.gate] ||
    !/^[a-f0-9]{40}$/.test(input.candidateSha) ||
    !/^[a-f0-9]{64}$/.test(input.buildSha) ||
    !/^wx[a-f0-9]{16}$/.test(input.appId) ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(input.runId)
  ) {
    return result('blocked', '探測身份或門檻格式不合法')
  }
  if (!input.evidencePaths.length) return result('not-run', '尚無可讀外部證據')
  const records = new Map<string, Record<string, unknown>>()
  try {
    for (const path of input.evidencePaths) {
      const value: unknown = JSON.parse(
        readBounded(input.evidenceRoot, path, 96 * 1024).toString('utf8'),
      )
      if (
        !isRecord(value) ||
        value.schemaVersion !== 1 ||
        value.gate !== input.gate ||
        value.candidateSha !== input.candidateSha ||
        value.buildSha !== input.buildSha ||
        value.environmentId !== input.environmentId ||
        value.appId !== input.appId ||
        value.runId !== input.runId ||
        typeof value.check !== 'string' ||
        !CHECKS[input.gate].includes(value.check) ||
        records.has(value.check) ||
        typeof value.performedAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value.performedAt) ||
        !Number.isFinite(Date.parse(value.performedAt)) ||
        !['passed', 'failed', 'blocked'].includes(String(value.outcome))
      ) {
        return result('blocked', '證據身份、檢查項或版本不一致')
      }
      const device = value.check === 'device-render'
      if (
        value.source !== 'local-fixture' &&
        (device
          ? !['device-ios', 'device-android'].includes(String(value.source))
          : value.source !== 'live-cloud')
      ) {
        return result('blocked', '證據來源不符合檢查種類')
      }
      if (
        !isRecord(value.artifact) ||
        typeof value.artifact.path !== 'string' ||
        typeof value.artifact.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(value.artifact.sha256)
      ) {
        return result('blocked', '缺少原始證據雜湊')
      }
      const bytes = readBounded(input.evidenceRoot, value.artifact.path, 4 * 1024 * 1024)
      if (createHash('sha256').update(bytes).digest('hex') !== value.artifact.sha256) {
        return result('blocked', '原始證據已變更')
      }
      records.set(value.check, value)
    }
  } catch {
    return result('blocked', '證據缺失、路徑不安全或格式損壞')
  }
  const liveRecords = [...records.values()].filter((record) => record.source !== 'local-fixture')
  if (liveRecords.some((record) => record.outcome === 'failed'))
    return result('failed', '外部檢查失敗')
  if (liveRecords.some((record) => record.outcome === 'blocked'))
    return result('blocked', '外部檢查受阻')
  if ([...records.values()].some((record) => record.source === 'local-fixture'))
    return result('not-run', '本地 fixture 不代表外部平台證據')
  if (CHECKS[input.gate].some((check) => !records.has(check)))
    return result('not-run', '外部檢查尚未覆蓋完整門檻')
  if (input.gate === 'safety') {
    const traces = ['image-submit', 'callback-verified', 'callback-persisted'].map((check) => {
      const details = records.get(check)?.details
      return isRecord(details) ? details.traceId : null
    })
    if (traces.some((trace) => typeof trace !== 'string' || !trace) || new Set(traces).size !== 1) {
      return result('blocked', '圖片發起與回調的 trace 不一致')
    }
  }
  if (input.gate === 'identity') {
    const actor = (check: string): unknown => {
      const details = records.get(check)?.details
      return isRecord(details) ? details.actorHash : null
    }
    const first = actor('caller-a')
    const second = actor('caller-b')
    const details = (check: string): Record<string, unknown> => {
      const value = records.get(check)?.details
      return isRecord(value) ? value : {}
    }
    const warm = details('warm-instance')
    if (
      typeof first !== 'string' ||
      typeof second !== 'string' ||
      !/^[a-f0-9]{64}$/.test(first) ||
      !/^[a-f0-9]{64}$/.test(second) ||
      first === second ||
      typeof warm.instanceId !== 'string' ||
      !warm.instanceId ||
      details('caller-a').instanceId !== warm.instanceId ||
      details('caller-b').instanceId !== warm.instanceId ||
      warm.firstActorHash !== first ||
      warm.secondActorHash !== second
    ) {
      return result('blocked', '缺少不同使用者的身份對照')
    }
  }
  return result('passed', null)
}
