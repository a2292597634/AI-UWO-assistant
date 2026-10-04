import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { renderReviewReportHtml, toReportAssetPath } from './report-html'
import type { ScenarioRunResult } from './runner'
import { evidenceSummary, type ScreenshotComparison } from './evidence'

export interface ReviewCoverage {
  unmatchedPageFiles?: string[]
  unmatchedPagePaths?: string[]
  covered: string[]
  exempted: Array<{ target: string; reason: string }>
  manual: string[]
  manualStates: string[]
}

export type ReviewResultStatus = 'passed' | 'failed' | 'blocked'
export type ReviewCheckStatus = ReviewResultStatus | 'not-run'
export interface ReviewChecks {
  mode: 'iterate' | 'final'
  page: { status: ReviewCheckStatus; required: boolean }
  repository: { status: ReviewCheckStatus; required: boolean; command: string; evidence?: string }
  external: Array<{ id: string; status: ReviewCheckStatus; required: boolean; evidence?: string }>
}
export const PRODUCT_EXTERNAL_GAPS = [
  '長列表原生渲染',
  '四寬度與公共基礎庫',
  'iOS／Android 真機',
  'QR／上傳包',
  '真 CloudBase ACL／並發／草稿',
  '求解器性能及資料語義',
]
export function overallReviewStatus(checks: ReviewChecks): ReviewCheckStatus {
  const required = [checks.page, checks.repository, ...checks.external].filter((c) => c.required)
  if (required.some((c) => c.status === 'failed')) return 'failed'
  if (required.some((c) => c.status === 'blocked')) return 'blocked'
  if (!required.length || required.some((c) => c.status === 'not-run')) return 'not-run'
  return 'passed'
}

export interface ReviewIterationInput {
  id: string
  startedAt: Date
  finishedAt?: Date
  summary?: string
  changedFiles: string[]
  status: ReviewResultStatus
  beforeScreenshot?: string
  comparisons?: ScreenshotComparison[]
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
  comparisons?: ScreenshotComparison[]
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
  checks?: ReviewChecks
}

export interface ReviewReport {
  schemaVersion: 2
  runId: string
  generatedAt: string
  status: ReviewCheckStatus
  checks: ReviewChecks
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
    comparisons: input.comparisons ?? [],
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
  const inferred: ReviewCheckStatus =
    input.coverage.unmatchedPageFiles?.length || input.coverage.unmatchedPagePaths?.length
      ? 'blocked'
      : input.results.some((r) => r.status === 'passed' && r.screenshots.length === 0)
        ? 'failed'
        : input.results.length || iterations.length
          ? statusForReport(input.results, iterations)
          : 'not-run'
  const checks: ReviewChecks = input.checks
    ? {
        ...input.checks,
        page: {
          ...input.checks.page,
          status:
            inferred === 'failed' || inferred === 'blocked' || input.checks.page.status === 'passed'
              ? inferred
              : input.checks.page.status,
        },
      }
    : {
        mode: 'iterate',
        page: { status: inferred, required: input.results.length > 0 || iterations.length > 0 },
        repository: { status: 'not-run', required: false, command: 'npm run verify' },
        external: [],
      }

  return {
    schemaVersion: 2,
    runId: input.runId,
    generatedAt: input.generatedAt.toISOString(),
    status: overallReviewStatus(checks),
    checks,
    git: input.git,
    coverage: {
      unmatchedPageFiles: uniqueSorted(input.coverage.unmatchedPageFiles ?? []),
      unmatchedPagePaths: uniqueSorted(input.coverage.unmatchedPagePaths ?? []),
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
  const statusLabel = (status: ReviewCheckStatus): string => {
    if (status === 'passed') return '通过'
    if (status === 'blocked') return '阻塞'
    if (status === 'not-run') return '未執行'
    return '失败'
  }
  const iterationSections = report.iterations
    .map((iteration, index) => {
      const before = iteration.beforeScreenshot
        ? markdownAsset(outputDir, iteration.beforeScreenshot, '修改前')
        : '- 本轮没有可信基线截图。'
      const pairs = (iteration.comparisons ?? [])
        .map(
          (pair) =>
            '截圖鍵：' +
            pair.screenshotKey +
            '；基線判定：' +
            pair.comparison.status +
            '\n\n' +
            list(pair.comparison.reasons) +
            '\n\n修改前身份：\n' +
            list(evidenceSummary(pair.beforeEvidence)) +
            '\n\n修改後身份：\n' +
            list(evidenceSummary(pair.afterEvidence)),
        )
        .join('\n\n')
      return (
        `### 第 ${index + 1} 轮：${iteration.summary}

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
${list(iteration.notes)}` + (pairs ? '\n\n' + pairs : '')
      )
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
      const identities = (result.screenshotEvidence ?? [])
        .map((entry) => list(evidenceSummary(entry.evidence)))
        .join('\n\n')
      return (
        `## ${result.scenario}\n\n- 页面：${result.pagePath}\n- 状态：${result.state}\n- 结果：${statusLabel(result.status)}\n\n${steps || '无步骤记录'}${screenshots}${failureScreenshot}` +
        (identities ? '\n\n截圖身份：\n' + identities : '')
      )
    })
    .join('\n\n')
  const exemptions = report.coverage.exempted.map((item) => `${item.target}：${item.reason}`)

  return `# 小程序页面验收报告

- 运行编号：${report.runId}
- 生成时间：${report.generatedAt}
- 总体结果：${statusLabel(report.status)}
- Git commit：${report.git.commit}
- 工作区：${report.git.dirty ? '有未提交修改' : '干净'}

## 分層結果

整體結論範圍：本輪要求的檢查。

- 頁面檢查：${statusLabel(report.checks.page.status)}
- 倉庫門禁：${statusLabel(report.checks.repository.status)}（${report.checks.repository.command}）
- 門禁證據：${report.checks.repository.evidence ?? '未提供'}
- 外部驗收：${report.checks.external.map((c) => c.id + '：' + statusLabel(c.status)).join('；') || '未執行'}
- 產品外部缺口仍待獨立證據：${PRODUCT_EXTERNAL_GAPS.join('；')}。本報告不代表發布驗收通過。

## 修改过程

${iterationSections || '- 本次运行未附带修改轮次。'}

## 未覆蓋文件

${list(report.coverage.unmatchedPageFiles ?? [])}

## 未覆蓋路由

${list(report.coverage.unmatchedPagePaths ?? [])}

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
  const outputs = [
    [jsonPath, `${JSON.stringify(report, null, 2)}\n`],
    [markdownPath, toMarkdown(outputDir, report)],
    [htmlPath, renderReviewReportHtml(report, outputDir)],
  ]
  // 全部內容先生成暫存檔，最後更新主 HTML；寫入失敗由 CLI 返回非零。
  try {
    for (const [path, bytes] of outputs) writeFileSync(path + '.tmp', bytes, 'utf8')
    for (const [path] of outputs) renameSync(path + '.tmp', path)
  } finally {
    for (const [path] of outputs) rmSync(path + '.tmp', { force: true })
  }
  return { htmlPath, jsonPath, markdownPath }
}
