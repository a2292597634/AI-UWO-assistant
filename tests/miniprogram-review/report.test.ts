import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { buildReviewReport, writeReviewReport } from '../../tools/miniprogram-review/report'
import {
  renderReviewReportHtml,
  toReportAssetPath,
} from '../../tools/miniprogram-review/report-html'

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

  it('同时写入 HTML、JSON、Markdown 文件', () => {
    const directory = mkdtempSync(join(tmpdir(), 'uwo-review-report-'))
    temporaryDirectories.push(directory)

    const paths = writeReviewReport(directory, buildReviewReport(fixedInput))

    expect(paths).toEqual({
      htmlPath: join(directory, 'report.html'),
      jsonPath: join(directory, 'report.json'),
      markdownPath: join(directory, 'report.md'),
    })
    expect(readFileSync(paths.htmlPath, 'utf8')).toContain('<title>小程序页面验收报告</title>')
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

  it('规范化修改轮次并让阻塞优先于失败', () => {
    const report = buildReviewReport({
      runId: 'fixed-run',
      generatedAt: new Date('2026-09-16T01:00:00.000Z'),
      git: { commit: 'abc1234', dirty: true },
      results: [
        {
          scenario: '目录搜寻',
          pagePath: '/pages/catalog/index',
          state: 'normal',
          status: 'blocked',
          steps: [],
          screenshots: [],
          error: '开发者工具未登录',
        },
      ],
      iterations: [
        {
          id: '002',
          startedAt: new Date('2026-09-16T01:02:00.000Z'),
          summary: '调整卡片间距',
          changedFiles: [
            'miniprogram/pages/catalog/index.wxss',
            'miniprogram/pages/catalog/index.wxml',
          ],
          status: 'blocked',
          afterScreenshots: [],
        },
        {
          id: '001',
          startedAt: new Date('2026-09-16T01:01:00.000Z'),
          changedFiles: ['miniprogram/pages/catalog/index.wxml'],
          status: 'passed',
          afterScreenshots: ['C:/review/run/after.png'],
        },
      ],
      coverage: { covered: [], exempted: [], manual: [], manualStates: [] },
    })

    expect(report.status).toBe('blocked')
    expect(report.iterations.map((iteration) => iteration.id)).toEqual(['001', '002'])
    expect(report.iterations[0]?.summary).toBe('本轮页面修改与自动验收')
    expect(report.iterations[0]?.changedFiles).toEqual(['miniprogram/pages/catalog/index.wxml'])
  })

  it('生成包含时间线、步骤图标和相对截图的离线 HTML', () => {
    const outputDir = 'C:/review/output'
    const report = buildReviewReport({
      ...fixedInput,
      iterations: [
        {
          id: '001',
          startedAt: new Date('2026-09-16T01:00:00.000Z'),
          summary: '<调整卡片>',
          changedFiles: ['miniprogram/pages/catalog/index.wxss'],
          status: 'passed',
          afterScreenshots: [`${outputDir}/current-simulator/catalog.png`],
          notes: ['保持 <script> 文本为普通说明'],
        },
      ],
    })
    const html = renderReviewReportHtml(report, outputDir)

    expect(html).toContain('<title>小程序页面验收报告</title>')
    expect(html).toContain('修改过程')
    expect(html).toContain('调整卡片')
    expect(html).toContain('data-lightbox-src="current-simulator/catalog.png"')
    expect(html).toContain('icon-screenshot')
    expect(html).not.toContain('<script> 文本为普通说明')
    expect(html).toContain('&lt;script&gt; 文本为普通说明')
    expect(html).not.toMatch(/https?:\/\//i)
  })

  it('拒绝把报告目录外的截图渲染成图片链接', () => {
    expect(toReportAssetPath('C:/review/output', 'C:/review/secret.png')).toBeUndefined()
  })
})
