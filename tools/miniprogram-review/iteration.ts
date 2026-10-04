import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { assertSafeInputPath } from '../workflow/read-inputs'
import {
  compareReviewEvidence,
  isReviewEvidence,
  type ReviewEvidence,
  type ScreenshotComparison,
} from './evidence'
import type { ReviewIterationInput, ReviewResultStatus } from './report'
import type { ScenarioRunResult } from './runner'
interface StoredScenarioResult {
  scenario?: unknown
  pagePath?: unknown
  screenshots?: unknown
  screenshotEvidence?: unknown
}
export interface IterationInput {
  id: string
  startedAt: Date
  finishedAt: Date
  changedFiles: string[]
  results: ScenarioRunResult[]
  previousReportDirs: string[]
  outputDir: string
  summary?: string
  notes?: string[]
}
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const safeFile = (dir: string, path: unknown): path is string => {
  if (typeof path !== 'string') return false
  try {
    return statSync(assertSafeInputPath(dir, path)).isFile()
  } catch {
    return false
  }
}
const readStoredResults = (dir: string): StoredScenarioResult[] => {
  const path = join(dir, 'report.json')
  if (!safeFile(dir, path)) return []
  try {
    const r = JSON.parse(readFileSync(path, 'utf8')) as { results?: unknown }
    return Array.isArray(r.results) ? r.results.filter(isRecord) : []
  } catch {
    return []
  }
}
const safeId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '-') || 'iteration'
const copyBaseline = (dir: string, id: string, n: number, source: string): string | undefined => {
  const dest = join(dir, 'iterations', safeId(id) + '-before' + (n ? '-' + n : '') + '.png')
  try {
    assertSafeInputPath(dir, dest)
    mkdirSync(join(dir, 'iterations'), { recursive: true })
    copyFileSync(source, dest)
    return dest
  } catch {
    return undefined
  }
}
const findComparison = (
  dir: string,
  scenario: string,
  after: ReviewEvidence,
): ScreenshotComparison | undefined => {
  let selected: ScreenshotComparison | undefined
  for (const r of readStoredResults(dir)) {
    if (Array.isArray(r.screenshotEvidence))
      for (const entry of r.screenshotEvidence) {
        if (!isRecord(entry) || !isReviewEvidence(entry.evidence) || !safeFile(dir, entry.path))
          continue
        const before = entry.evidence
        if (
          before.scenario.pagePath !== after.scenario.pagePath ||
          before.scenario.screenshotKey !== after.scenario.screenshotKey
        )
          continue
        const pair: ScreenshotComparison = {
          scenario,
          screenshotKey: after.scenario.screenshotKey,
          before: entry.path,
          after: '',
          beforeEvidence: before,
          afterEvidence: after,
          comparison: compareReviewEvidence(before, after),
          historicalReport: join(dir, 'report.html'),
        }
        if (before.scenario.scenarioSha256 === after.scenario.scenarioSha256) {
          if (pair.comparison.status === 'comparable') return pair
          if (
            !selected ||
            selected.beforeEvidence?.scenario.scenarioSha256 !== after.scenario.scenarioSha256
          )
            selected = pair
        } else selected ??= pair
      }
    if (
      r.scenario === scenario &&
      r.pagePath === after.scenario.pagePath &&
      Array.isArray(r.screenshots) &&
      r.screenshots.some((p) => safeFile(dir, p))
    )
      selected ??= {
        scenario,
        screenshotKey: after.scenario.screenshotKey,
        after: '',
        comparison: compareReviewEvidence(undefined, after),
        historicalReport: join(dir, 'report.html'),
      }
  }
  return selected
}
export const copyTrustedBaseline = (input: {
  previousReportDir: string
  outputDir: string
  pagePath: string
  scenario: string
  iterationId?: string
  afterEvidence?: ReviewEvidence
  ordinal?: number
}): string | undefined => {
  if (!input.afterEvidence) return undefined
  const pair = findComparison(input.previousReportDir, input.scenario, input.afterEvidence)
  return pair?.comparison.status === 'comparable' && pair.before
    ? copyBaseline(
        input.outputDir,
        input.iterationId ?? 'iteration',
        input.ordinal ?? 0,
        pair.before,
      )
    : undefined
}
const statusForResults = (results: ScenarioRunResult[]): ReviewResultStatus => {
  if (results.some((r) => r.status === 'failed')) return 'failed'
  if (results.some((r) => r.status === 'blocked')) return 'blocked'
  return results.some((r) => r.status === 'passed' && !r.screenshots.length) ? 'failed' : 'passed'
}
export const createIterationInput = (input: IterationInput): ReviewIterationInput => {
  const comparisons: ScreenshotComparison[] = []
  for (const result of input.results)
    for (const after of result.screenshotEvidence ?? []) {
      let pair: ScreenshotComparison | undefined
      for (const dir of input.previousReportDirs) {
        if (dir === input.outputDir) continue
        const found = findComparison(dir, result.scenario, after.evidence)
        if (found && (!pair || found.comparison.status === 'comparable')) pair = found
        if (pair?.comparison.status === 'comparable') break
      }
      pair ??= {
        scenario: result.scenario,
        screenshotKey: after.evidence.scenario.screenshotKey,
        after: after.path,
        afterEvidence: after.evidence,
        comparison: { status: 'historical', reasons: ['缺修改前同條件證據。'] },
      }
      pair.after = after.path
      if (pair.comparison.status === 'comparable' && pair.before) {
        pair.before = copyBaseline(input.outputDir, input.id, comparisons.length, pair.before)
        if (!pair.before)
          pair.comparison = { status: 'historical', reasons: ['可信圖片複製失敗。'] }
      } else delete pair.before
      comparisons.push(pair)
    }
  const beforeScreenshot = comparisons.find((p) => p.before)?.before
  return {
    id: input.id,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    summary: input.summary,
    changedFiles: [...new Set(input.changedFiles)].sort(),
    status: statusForResults(input.results),
    ...(beforeScreenshot ? { beforeScreenshot } : {}),
    comparisons,
    afterScreenshots: [
      ...new Set(
        input.results.flatMap((r) => [
          ...r.screenshots,
          ...(r.failureScreenshot ? [r.failureScreenshot] : []),
        ]),
      ),
    ],
    notes: [
      ...(input.notes ?? []),
      ...comparisons
        .filter((p) => p.comparison.status !== 'comparable')
        .map((p) => p.scenario + '／' + p.screenshotKey + '：' + p.comparison.reasons.join('；')),
    ],
  }
}
