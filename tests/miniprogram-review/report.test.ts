import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { buildReviewReport, writeReviewReport } from '../../tools/miniprogram-review/report'

const temporaryDirectories: string[] = []

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

const fixedInput = {
  runId: '2026-09-15T120000-review',
  generatedAt: new Date('2026-09-15T12:00:00.000Z'),
  git: { commit: 'abc1234', dirty: true },
  results: [
    {
      scenario: '目录搜寻',
      pagePath: '/pages/catalog/index',
      state: 'normal' as const,
      status: 'passed' as const,
      steps: [],
      screenshots: ['C:/review/run/current-simulator/catalog-search-result.png'],
    },
  ],
  coverage: {
    covered: ['iphone-standard/normal'],
    exempted: [{ target: 'error', reason: '此纯本地页面没有远端错误状态' }],
    manual: ['iphone-small', 'android-large'],
    manualStates: ['empty', 'loading', 'error', 'long-text'],
  },
}

describe('小程序验收报告', () => {
  it('区分已覆盖、豁免和待人工核验', () => {
    const report = buildReviewReport(fixedInput)

    expect(report.coverage).toEqual({
      ...fixedInput.coverage,
      manual: ['android-large', 'iphone-small'],
      manualStates: ['empty', 'error', 'loading', 'long-text'],
    })
    expect(report.generatedAt).toBe('2026-09-15T12:00:00.000Z')
    expect(report.status).toBe('passed')
  })

  it('写入确定性的 JSON 和 Markdown 文件', () => {
    const directory = mkdtempSync(join(tmpdir(), 'uwo-review-report-'))
    temporaryDirectories.push(directory)

    const paths = writeReviewReport(directory, buildReviewReport(fixedInput))

    expect(paths).toEqual({
      jsonPath: join(directory, 'report.json'),
      markdownPath: join(directory, 'report.md'),
    })
    expect(JSON.parse(readFileSync(paths.jsonPath, 'utf8'))).toMatchObject({
      runId: fixedInput.runId,
      status: 'passed',
    })
    expect(readFileSync(paths.markdownPath, 'utf8')).toContain('# 小程序页面验收报告')
    expect(readFileSync(paths.markdownPath, 'utf8')).toContain('待人工核验')
    expect(readFileSync(paths.markdownPath, 'utf8')).toContain(
      'C:/review/run/current-simulator/catalog-search-result.png',
    )
  })
})
