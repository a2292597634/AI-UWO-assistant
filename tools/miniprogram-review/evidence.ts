import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { readInputTree } from '../workflow/read-inputs'
import { fixtureInstallSource, fixtureRestoreSource } from './fixtures'
import type { ReviewScenario } from './types'

export interface ReviewEvidence {
  schemaVersion: 2
  source: {
    projectRoot: string
    executionRoot: string
    gitCommit: string | null
    candidateSha256: string
    unchangedDuringRun: boolean
    binding: 'launch-recorded' | 'unverified'
    executionSha256?: string
    mapping?: Array<{ source: string; execution: string }>
  }
  scenario: {
    pagePath: string
    scenarioSha256: string
    screenshotKey: string
    state: string
    stateInputSha256: string | null
    fixtureName: string | null
    fixtureSha256: string | null
  }
  runtime: {
    adapter: 'native-cli' | 'wechatide' | 'sdk'
    endpoint: string | null
    devToolsVersion: string | null
    sdkVersion: string | null
    width: number | null
    height: number | null
    pagePath: string | null
  }
}
export type ReviewRuntimeInfo = ReviewEvidence['runtime']
export interface ReviewLaunchRecord {
  projectRoot: string
  executionRoot: string
  endpoint: string | null
}
export interface EvidenceComparison {
  status: 'comparable' | 'historical' | 'incompatible'
  reasons: string[]
}
export interface ScreenshotComparison {
  scenario: string
  screenshotKey: string
  before?: string
  after: string
  comparison: EvidenceComparison
  beforeEvidence?: ReviewEvidence
  afterEvidence?: ReviewEvidence
  historicalReport?: string
}
export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableSerialize).join(',') + ']'
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + stableSerialize(v))
        .join(',') +
      '}'
    )
  return JSON.stringify(value) ?? 'null'
}
export const hashReviewValue = (value: unknown): string =>
  createHash('sha256').update(stableSerialize(value)).digest('hex')
export const unknownRuntime = (): ReviewRuntimeInfo => ({
  adapter: 'sdk',
  endpoint: null,
  devToolsVersion: null,
  sdkVersion: null,
  width: null,
  height: null,
  pagePath: null,
})
export const runtimeInfoSource = `function () {
  var win = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
  var app = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : wx.getSystemInfoSync();
  return { sdkVersion: app.SDKVersion, width: win.windowWidth, height: win.windowHeight };
}`
export function normalizeRuntimeMeasurement(
  value: unknown,
): Pick<ReviewRuntimeInfo, 'sdkVersion' | 'width' | 'height'> {
  const r = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const size = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  return {
    sdkVersion: typeof r.sdkVersion === 'string' && r.sdkVersion ? r.sdkVersion : null,
    width: size(r.width),
    height: size(r.height),
  }
}
export function captureReviewSource(
  projectRoot: string,
  executionRoot: string,
): Omit<ReviewEvidence['source'], 'unchangedDuringRun' | 'binding'> {
  const root = resolve(projectRoot),
    execution = resolve(executionRoot)
  const collect = (dir: string) => {
    const files = new Map(readInputTree(dir, 'miniprogram'))
    for (const p of ['project.config.json', 'project.private.config.json'])
      for (const [name, digest] of readInputTree(dir, p, false)) files.set(name, digest)
    return [...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  }
  const sourceFiles = collect(root),
    executionFiles = root === execution ? sourceFiles : collect(execution)
  let gitCommit: string | null = null
  try {
    gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    /* 非 Git 的編譯副本以候選 hash 綁定，不捏造版本。 */
  }
  const executionNames = new Set(executionFiles.map(([p]) => p))
  return {
    projectRoot: root,
    executionRoot: execution,
    gitCommit,
    candidateSha256: hashReviewValue({ source: sourceFiles, execution: executionFiles }),
    executionSha256: hashReviewValue(executionFiles),
    ...(root === execution
      ? {}
      : {
          mapping: sourceFiles
            .filter(([p]) => p.endsWith('.ts'))
            .map(([p]) => ({ source: p, execution: p.slice(0, -3) + '.js' }))
            .filter((p) => executionNames.has(p.execution)),
        }),
  }
}
export function screenshotEvidence(
  source: ReviewEvidence['source'],
  scenario: ReviewScenario,
  screenshotKey: string,
  runtime: ReviewRuntimeInfo,
): ReviewEvidence {
  const fixtureHash = scenario.fixture
    ? hashReviewValue({
        install: fixtureInstallSource(scenario.fixture),
        restore: fixtureRestoreSource,
      })
    : null
  return {
    schemaVersion: 2,
    source: { ...source },
    scenario: {
      pagePath: scenario.entry,
      scenarioSha256: hashReviewValue(scenario),
      screenshotKey,
      state: scenario.state,
      stateInputSha256: fixtureHash,
      fixtureName: scenario.fixture ?? null,
      fixtureSha256: fixtureHash,
    },
    runtime: { ...runtime },
  }
}
/** 舊報告與不完整身份保持可讀，不能升格為可信基線。 */
export function isReviewEvidence(value: unknown): value is ReviewEvidence {
  if (!value || typeof value !== 'object') return false
  const e = value as ReviewEvidence
  return (
    e.schemaVersion === 2 &&
    !!e.source &&
    !!e.scenario &&
    !!e.runtime &&
    typeof e.source.candidateSha256 === 'string' &&
    typeof e.scenario.scenarioSha256 === 'string' &&
    typeof e.scenario.screenshotKey === 'string' &&
    typeof e.scenario.pagePath === 'string'
  )
}
export function compareReviewEvidence(
  before: ReviewEvidence | undefined,
  after: ReviewEvidence,
): EvidenceComparison {
  if (!isReviewEvidence(before) || !isReviewEvidence(after))
    return { status: 'historical', reasons: ['缺少完整身份，舊圖片只作歷史參考。'] }
  const reasons: string[] = []
  for (const key of [
    'pagePath',
    'scenarioSha256',
    'screenshotKey',
    'state',
    'stateInputSha256',
    'fixtureName',
    'fixtureSha256',
  ] as const)
    if (
      before.scenario[key] !== null &&
      after.scenario[key] !== null &&
      before.scenario[key] !== after.scenario[key]
    )
      reasons.push('場景條件不同：' + key)
  // fixture 的有無本身也屬於比較條件。
  if (before.scenario.fixtureName !== after.scenario.fixtureName)
    reasons.push('fixture 有無或名称不同。')
  if (
    (!before.scenario.fixtureName || !after.scenario.fixtureName) &&
    before.scenario.fixtureSha256 !== after.scenario.fixtureSha256
  )
    reasons.push('fixture 實作不同。')
  for (const key of [
    'adapter',
    'sdkVersion',
    'width',
    'height',
    'pagePath',
    'devToolsVersion',
  ] as const)
    if (
      before.runtime[key] !== null &&
      after.runtime[key] !== null &&
      before.runtime[key] !== after.runtime[key]
    )
      reasons.push('實測環境不同：' + key)
  if (reasons.length) return { status: 'incompatible', reasons }
  for (const [label, e] of [
    ['修改前', before],
    ['修改後', after],
  ] as const) {
    if (!e.source.unchangedDuringRun) reasons.push(label + '來源在執行中變動。')
    if (e.source.binding !== 'launch-recorded') reasons.push(label + '未綁定本次啟動。')
    if (!e.scenario.stateInputSha256) reasons.push(label + '輸入狀態未知。')
    if (e.scenario.fixtureName && !e.scenario.fixtureSha256)
      reasons.push(label + 'fixture 實作未知。')
    if (!e.runtime.width || !e.runtime.height || !e.runtime.sdkVersion || !e.runtime.pagePath)
      reasons.push(label + '實測尺寸、SDK 或頁面未知。')
  }
  return reasons.length ? { status: 'historical', reasons } : { status: 'comparable', reasons: [] }
}
export function evidenceSummary(e: ReviewEvidence | undefined): string[] {
  if (!e) return ['身份未知；不作可信基線。']
  return [
    'Git commit：' + (e.source.gitCommit ?? '未知'),
    '候選 SHA-256：' + e.source.candidateSha256,
    '來源根：' + e.source.projectRoot + '；執行根：' + e.source.executionRoot,
    '啟動綁定：' + e.source.binding + '；執行期間來源穩定：' + e.source.unchangedDuringRun,
    'fixture：' +
      (e.scenario.fixtureName ?? '無') +
      '；實作 hash：' +
      (e.scenario.fixtureSha256 ?? '未知'),
    '狀態：' + e.scenario.state + '；輸入 hash：' + (e.scenario.stateInputSha256 ?? '未知'),
    '截圖鍵：' + e.scenario.screenshotKey + '；場景 hash：' + e.scenario.scenarioSha256,
    '實測尺寸：' +
      (e.runtime.width ?? '未知') +
      ' × ' +
      (e.runtime.height ?? '未知') +
      '；SDK：' +
      (e.runtime.sdkVersion ?? '未知') +
      '；DevTools：' +
      (e.runtime.devToolsVersion ?? '未知'),
    '通道：' + e.runtime.adapter + '；當前頁面：' + (e.runtime.pagePath ?? '未知'),
  ]
}
