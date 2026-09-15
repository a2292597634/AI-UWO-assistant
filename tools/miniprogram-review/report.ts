import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ScenarioRunResult } from './runner'

export interface ReviewCoverage {
  covered: string[]
  exempted: Array<{ target: string; reason: string }>
  manual: string[]
  manualStates: string[]
}

export interface ReviewReportInput {
  runId: string
  generatedAt: Date
  git: { commit: string; dirty: boolean }
  results: ScenarioRunResult[]
  coverage: ReviewCoverage
}

export interface ReviewReport {
  runId: string
  generatedAt: string
  status: 'passed' | 'failed'
  git: { commit: string; dirty: boolean }
  coverage: ReviewCoverage
  results: ScenarioRunResult[]
}

const sorted = (values: string[]): string[] =>
  [...values].sort((left, right) => left.localeCompare(right))

export const buildReviewReport = (input: ReviewReportInput): ReviewReport => ({
  runId: input.runId,
  generatedAt: input.generatedAt.toISOString(),
  status: input.results.every((result) => result.status === 'passed') ? 'passed' : 'failed',
  git: input.git,
  coverage: {
    covered: sorted(input.coverage.covered),
    exempted: [...input.coverage.exempted].sort((left, right) =>
      left.target.localeCompare(right.target),
    ),
    manual: sorted(input.coverage.manual),
    manualStates: sorted(input.coverage.manualStates),
  },
  results: [...input.results].sort((left, right) => left.scenario.localeCompare(right.scenario)),
})

const list = (values: string[]): string =>
  values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : '- 无'

const toMarkdown = (report: ReviewReport): string => {
  const resultSections = report.results
    .map((result) => {
      const steps = result.steps
        .map(
          (step, index) =>
            `${index + 1}. ${step.action}：${step.status === 'passed' ? '通过' : `失败（${step.error ?? '未知错误'}）`}`,
        )
        .join('\n')
      const screenshots =
        result.screenshots.length > 0 ? `\n\n截图证据：\n${list(result.screenshots)}` : ''
      const failureScreenshot = result.failureScreenshot
        ? `\n\n失败现场：\n- ${result.failureScreenshot}`
        : ''
      return `## ${result.scenario}\n\n- 页面：${result.pagePath}\n- 状态：${result.state}\n- 结果：${result.status === 'passed' ? '通过' : '失败'}\n\n${steps || '无步骤记录'}${screenshots}${failureScreenshot}`
    })
    .join('\n\n')
  const exemptions = report.coverage.exempted.map((item) => `${item.target}：${item.reason}`)

  return `# 小程序页面验收报告

- 运行编号：${report.runId}
- 生成时间：${report.generatedAt}
- 总体结果：${report.status === 'passed' ? '通过' : '失败'}
- Git commit：${report.git.commit}
- 工作区：${report.git.dirty ? '有未提交修改' : '干净'}

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
): { jsonPath: string; markdownPath: string } => {
  mkdirSync(outputDir, { recursive: true })
  const jsonPath = join(outputDir, 'report.json')
  const markdownPath = join(outputDir, 'report.md')
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  writeFileSync(markdownPath, toMarkdown(report), 'utf8')
  return { jsonPath, markdownPath }
}
