import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { ReviewIterationInput, ReviewResultStatus } from './report'
import type { ScenarioRunResult } from './runner'

interface StoredScenarioResult {
  scenario?: unknown
  pagePath?: unknown
  screenshots?: unknown
}

interface StoredReport {
  results?: unknown
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isInsideDirectory = (directory: string, candidate: string): boolean => {
  const relativePath = relative(resolve(directory), resolve(candidate))
  return Boolean(
    relativePath &&
    !isAbsolute(relativePath) &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`),
  )
}

const readStoredResults = (reportDir: string): StoredScenarioResult[] => {
  const reportPath = join(reportDir, 'report.json')
  if (!existsSync(reportPath)) return []
  try {
    const parsed = JSON.parse(readFileSync(reportPath, 'utf8')) as StoredReport
    if (!Array.isArray(parsed.results)) return []
    return parsed.results.filter(isRecord) as StoredScenarioResult[]
  } catch {
    return []
  }
}

const screenshotFromResult = (
  result: StoredScenarioResult,
  reportDir: string,
): string | undefined => {
  if (!Array.isArray(result.screenshots)) return undefined
  for (const value of result.screenshots) {
    if (typeof value !== 'string' || !isInsideDirectory(reportDir, value)) continue
    try {
      if (statSync(value).isFile()) return value
    } catch {
      // 文件在报告生成后被删除时，继续尝试下一张截图。
    }
  }
  return undefined
}

const safeIterationId = (id: string): string =>
  id.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'iteration'

export const copyTrustedBaseline = (input: {
  previousReportDir: string
  outputDir: string
  pagePath: string
  scenario: string
  iterationId?: string
}): string | undefined => {
  const previousResult = readStoredResults(input.previousReportDir).find(
    (result) => result.scenario === input.scenario && result.pagePath === input.pagePath,
  )
  if (!previousResult) return undefined
  const source = screenshotFromResult(previousResult, input.previousReportDir)
  if (!source) return undefined
  const iterationsDir = join(input.outputDir, 'iterations')
  mkdirSync(iterationsDir, { recursive: true })
  const destination = join(
    iterationsDir,
    `${safeIterationId(input.iterationId ?? 'iteration')}-before.png`,
  )
  try {
    copyFileSync(source, destination)
    return destination
  } catch {
    return undefined
  }
}

const unique = (values: string[]): string[] => [...new Set(values)]

const statusForResults = (results: ScenarioRunResult[]): ReviewResultStatus => {
  if (results.some((result) => result.status === 'blocked')) return 'blocked'
  if (results.some((result) => result.status === 'failed')) return 'failed'
  return 'passed'
}

export const createIterationInput = (input: IterationInput): ReviewIterationInput => {
  let beforeScreenshot: string | undefined
  for (const result of input.results) {
    if (beforeScreenshot) break
    for (const previousReportDir of input.previousReportDirs) {
      beforeScreenshot = copyTrustedBaseline({
        previousReportDir,
        outputDir: input.outputDir,
        pagePath: result.pagePath,
        scenario: result.scenario,
        iterationId: input.id,
      })
      if (beforeScreenshot) break
    }
  }

  return {
    id: input.id,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    summary: input.summary,
    changedFiles: unique(input.changedFiles).sort((left, right) => left.localeCompare(right)),
    status: statusForResults(input.results),
    ...(beforeScreenshot ? { beforeScreenshot } : {}),
    afterScreenshots: unique(
      input.results.flatMap((result) => [
        ...result.screenshots,
        ...(result.failureScreenshot ? [result.failureScreenshot] : []),
      ]),
    ),
    notes: [...(input.notes ?? [])],
  }
}
