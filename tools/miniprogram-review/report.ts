import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderReviewReportHtml, toReportAssetPath } from './report-html'
import type { ScenarioRunResult } from './runner'

export interface ReviewCoverage {
  covered: string[]
  exempted: Array<{ target: string; reason: string }>
  manual: string[]
  manualStates: string[]
}

export type ReviewResultStatus = 'passed' | 'failed' | 'blocked'

export interface ReviewIterationInput {
  id: string
  startedAt: Date
  finishedAt?: Date
  summary?: string
  changedFiles: string[]
  status: ReviewResultStatus
  beforeScreenshot?: string
  afterScreenshots: string[]
  notes?: string[]
}

export interface ReviewIteration {
  id: string
  startedAt: string
  finishedAt?: string
  summary: string
  changedFiles: string[]
  status: ReviewResultStatus
  beforeScreenshot?: string
  afterScreenshots: string[]
  notes: string[]
}

export interface ReviewReportInput {
  runId: string
  generatedAt: Date
  git: { commit: string; dirty: boolean }
  results: ScenarioRunResult[]
  coverage: ReviewCoverage
  iterations?: ReviewIterationInput[]
}

export interface ReviewReport {
  runId: string
  generatedAt: string
  status: ReviewResultStatus
  git: { commit: string; dirty: boolean }
  coverage: ReviewCoverage
  iterations: ReviewIteration[]
  results: ScenarioRunResult[]
}

const sorted = (values: string[]): string[] =>
  [...values].sort((left, right) => left.localeCompare(right))

const uniqueSorted = (values: string[]): string[] => sorted([...new Set(values)])

const normalizeIteration = (input: ReviewIterationInput): ReviewIteration => {
  const missingAfterScreenshot = input.status === 'passed' && input.afterScreenshots.length === 0
  const notes = [...(input.notes ?? [])]
  if (missingAfterScreenshot) {
    notes.push('未提供修改后截图，页面变更验收不得判定为通过。')
  }

  return {
    id: input.id,
    startedAt: input.startedAt.toISOString(),
    ...(input.finishedAt ? { finishedAt: input.finishedAt.toISOString() } : {}),
    summary: input.summary?.trim() || '本轮页面修改与自动验收',
    changedFiles: uniqueSorted(input.changedFiles),
    status: missingAfterScreenshot ? 'failed' : input.status,
    ...(input.beforeScreenshot ? { beforeScreenshot: input.beforeScreenshot } : {}),
    afterScreenshots: [...input.afterScreenshots],
    notes,
  }
}

const statusForResults = (results: ScenarioRunResult[]): ReviewResultStatus => {
  if (results.some((result) => result.status === 'blocked')) return 'blocked'
  if (results.some((result) => result.status === 'failed')) return 'failed'
  return 'passed'
}

const statusForIterations = (iterations: ReviewIteration[]): ReviewResultStatus => {
  if (iterations.some((iteration) => iteration.status === 'blocked')) return 'blocked'
  if (iterations.some((iteration) => iteration.status === 'failed')) return 'failed'
  return 'passed'
}

const statusForReport = (
  results: ScenarioRunResult[],
  iterations: ReviewIteration[],
): ReviewResultStatus => {
  const statuses = [statusForResults(results), statusForIterations(iterations)]
  if (statuses.includes('blocked')) return 'blocked'
  if (statuses.includes('failed')) return 'failed'
  return 'passed'
}

export const buildReviewReport = (input: ReviewReportInput): ReviewReport => {
  const iterations = [...(input.iterations ?? [])].map(normalizeIteration).sort((left, right) => {
    const byStartedAt = left.startedAt.localeCompare(right.startedAt)
    return byStartedAt === 0 ? left.id.localeCompare(right.id) : byStartedAt
  })

  return {
    runId: input.runId,
    generatedAt: input.generatedAt.toISOString(),
    status: statusForReport(input.results, iterations),
    git: input.git,
    coverage: {
      covered: sorted(input.coverage.covered),
      exempted: [...input.coverage.exempted].sort((left, right) =>
        left.target.localeCompare(right.target),
      ),
      manual: sorted(input.coverage.manual),
      manualStates: sorted(input.coverage.manualStates),
    },
    iterations,
    results: [...input.results].sort((left, right) => left.scenario.localeCompare(right.scenario)),
  }
}

const list = (values: string[]): string =>
  values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : '- 无'

const markdownAsset = (outputDir: string, assetPath: string, label: string): string => {
  const relativePath = toReportAssetPath(outputDir, assetPath)
  return relativePath ? `![${label}](<${relativePath}>)` : `- ${label}：${assetPath}`
}

const markdownAssets = (outputDir: string, paths: string[], label: string): string =>
  paths.length > 0 ? paths.map((path) => markdownAsset(outputDir, path, label)).join('\n') : '- 无'

const toMarkdown = (outputDir: string, report: ReviewReport): string => {
  const statusLabel = (status: ReviewResultStatus): string => {
    if (status === 'passed') return '通过'
    if (status === 'blocked') return '阻塞'
    return '失败'
  }
  const iterationSections = report.iterations
    .map((iteration, index) => {
      const before = iteration.beforeScreenshot
        ? markdownAsset(outputDir, iteration.beforeScreenshot, '修改前')
        : '- 本轮没有可信基线截图。'
      return `### 第 ${index + 1} 轮：${iteration.summary}

- 状态：${statusLabel(iteration.status)}
- 开始：${iteration.startedAt}
- 结束：${iteration.finishedAt ?? '未记录'}

变更文件：
${list(iteration.changedFiles)}

修改前截图：
${before}

修改后截图：
${markdownAssets(outputDir, iteration.afterScreenshots, '修改后')}

修改说明：
${list(iteration.notes)}`
    })
    .join('\n\n')
  const resultSections = report.results
    .map((result) => {
      const steps = result.steps
        .map(
          (step, index) =>
            `${index + 1}. ${step.action}：${step.status === 'passed' ? '通过' : `失败（${step.error ?? '未知错误'}）`}`,
        )
        .join('\n')
      const screenshots =
        result.screenshots.length > 0
          ? `\n\n截图证据：\n${markdownAssets(outputDir, result.screenshots, '场景截图')}`
          : ''
      const failureScreenshot = result.failureScreenshot
        ? `\n\n失败现场：\n${markdownAsset(outputDir, result.failureScreenshot, '失败现场')}`
        : ''
      return `## ${result.scenario}\n\n- 页面：${result.pagePath}\n- 状态：${result.state}\n- 结果：${statusLabel(result.status)}\n\n${steps || '无步骤记录'}${screenshots}${failureScreenshot}`
    })
    .join('\n\n')
  const exemptions = report.coverage.exempted.map((item) => `${item.target}：${item.reason}`)

  return `# 小程序页面验收报告

- 运行编号：${report.runId}
- 生成时间：${report.generatedAt}
- 总体结果：${statusLabel(report.status)}
- Git commit：${report.git.commit}
- 工作区：${report.git.dirty ? '有未提交修改' : '干净'}

## 修改过程

${iterationSections || '- 本次运行未附带修改轮次。'}

## 已覆盖

${list(report.coverage.covered)}

## 豁免

${list(exemptions)}

## 待人工核验

${list(report.coverage.manual)}

## 待人工核验状态

${list(report.coverage.manualStates)}

${resultSections}
`
}

export const writeReviewReport = (
  outputDir: string,
  report: ReviewReport,
): { htmlPath: string; jsonPath: string; markdownPath: string } => {
  mkdirSync(outputDir, { recursive: true })
  const htmlPath = join(outputDir, 'report.html')
  const jsonPath = join(outputDir, 'report.json')
  const markdownPath = join(outputDir, 'report.md')
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  writeFileSync(markdownPath, toMarkdown(outputDir, report), 'utf8')
  writeFileSync(htmlPath, renderReviewReportHtml(report, outputDir), 'utf8')
  return { htmlPath, jsonPath, markdownPath }
}
