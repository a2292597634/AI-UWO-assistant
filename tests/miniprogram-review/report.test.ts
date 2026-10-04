import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildReviewReport,
  writeReviewReport,
  overallReviewStatus,
} from '../../tools/miniprogram-review/report'
import {
  renderReviewReportHtml,
  toReportAssetPath,
} from '../../tools/miniprogram-review/report-html'
import { evidence } from './evidence-fixture'

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
  it('歷史報告只能連結報告根內的普通檔案，地址可直接開啟', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-history-link-'))
    temporaryDirectories.push(root)
    const dir = join(root, 'current'),
      previous = join(root, 'previous')
    mkdirSync(dir)
    mkdirSync(previous)
    const history = join(previous, 'report.html')
    writeFileSync(history, 'old')
    const report = buildReviewReport({
      ...fixedInput,
      iterations: [
        {
          id: 'history',
          startedAt: fixedInput.generatedAt,
          status: 'passed',
          changedFiles: [],
          afterScreenshots: [join(dir, 'after.png')],
          comparisons: [
            {
              scenario: '目錄',
              screenshotKey: 'catalog',
              after: join(dir, 'after.png'),
              historicalReport: history,
              comparison: { status: 'historical', reasons: ['舊身份未知'] },
            },
          ],
        },
      ],
    })
    expect(renderReviewReportHtml(report, dir)).toContain('href="../previous/report.html"')
    report.iterations[0].comparisons![0].historicalReport = join(root, '../outside.html')
    expect(renderReviewReportHtml(report, dir)).not.toContain('href="../../outside.html"')
  })
  it('未執行門禁使用待驗收徽章，不能顯示通過的綠色樣式', () => {
    const html = renderReviewReportHtml(buildReviewReport(fixedInput), 'C:/review/run')
    const pending = html.match(/<span class="status-badge [^"]+">[^]*?未執行<\/span>/)?.[0]
    expect(pending).toContain('status-badge status-blocked')
  })
  it('逐張圖片直接展示來源、fixture、實測尺寸及基線判定', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uwo-identity-report-'))
    temporaryDirectories.push(dir)
    const after = evidence('2')
    const image = join(dir, 'after.png')
    const report = buildReviewReport({
      ...fixedInput,
      results: [
        { ...fixedInput.results[0], screenshotEvidence: [{ path: image, evidence: after }] },
      ],
      iterations: [
        {
          id: 'identity',
          startedAt: fixedInput.generatedAt,
          changedFiles: [],
          status: 'passed',
          afterScreenshots: [image],
          comparisons: [
            {
              scenario: '目錄',
              screenshotKey: 'catalog',
              after: image,
              afterEvidence: after,
              beforeEvidence: evidence(),
              comparison: { status: 'historical', reasons: ['缺修改前同條件證據。'] },
            },
          ],
        },
      ],
    })
    const paths = writeReviewReport(dir, report)
    for (const p of [paths.htmlPath, paths.markdownPath]) {
      const content = readFileSync(p, 'utf8')
      for (const text of ['候選 SHA-256', 'fixture', '390', '3.17.0', '缺修改前同條件證據'])
        expect(content).toContain(text)
    }
  })
  it('必需的外部檢查未執行，整體為未執行而非通過', () => {
    expect(
      overallReviewStatus({
        mode: 'final',
        page: { status: 'passed', required: true },
        repository: { status: 'passed', required: true, command: 'npm run verify' },
        external: [{ id: 'device', status: 'not-run', required: true }],
      }),
    ).toBe('not-run')
  })
  it('三層結果在 HTML／JSON／Markdown 一致，無頁面範圍如實未執行', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uwo-layered-'))
    temporaryDirectories.push(dir)
    const report = buildReviewReport({
      ...fixedInput,
      results: [],
      checks: {
        mode: 'final',
        page: { status: 'not-run', required: false },
        repository: { status: 'failed', required: true, command: 'npm run verify' },
        external: [{ id: '真機', status: 'not-run', required: false }],
      },
    })
    const paths = writeReviewReport(dir, report)
    expect(report.status).toBe('failed')
    expect(JSON.parse(readFileSync(paths.jsonPath, 'utf8')).checks.repository.status).toBe('failed')
    for (const p of [paths.htmlPath, paths.markdownPath]) {
      const content = readFileSync(p, 'utf8')
      for (const text of ['頁面檢查', '倉庫門禁', '外部驗收', '未執行', '本輪要求的檢查'])
        expect(content).toContain(text)
    }
  })
  it('即使候選場景已通過，文件及路由缺口仍阻塞並顯示於 HTML 與 JSON', () => {
    const report = buildReviewReport({
      ...fixedInput,
      coverage: {
        ...fixedInput.coverage,
        unmatchedPageFiles: ['miniprogram/pages/missing/index.json'],
        unmatchedPagePaths: ['/pages/missing/index'],
      },
    })
    expect(report.status).toBe('blocked')
    expect(report.coverage.unmatchedPageFiles).toEqual(['miniprogram/pages/missing/index.json'])
    const html = renderReviewReportHtml(report, 'C:/review/run')
    expect(html).toContain('<h3>未覆蓋文件</h3>')
    expect(html).toContain('<h3>未覆蓋路由</h3>')
    expect(html).toContain('/pages/missing/index')
    expect(JSON.parse(JSON.stringify(report)).coverage.unmatchedPagePaths).toEqual([
      '/pages/missing/index',
    ])
  })

  it('区分已覆盖、豁免和待人工核验', () => {
    const report = buildReviewReport(fixedInput)

    expect(report.coverage).toEqual({
      ...fixedInput.coverage,
      unmatchedPageFiles: [],
      unmatchedPagePaths: [],
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

  it('在 Markdown 报告中直接展示场景和修改过程截图', () => {
    const directory = mkdtempSync(join(tmpdir(), 'uwo-review-report-evidence-'))
    temporaryDirectories.push(directory)
    const iterationsDirectory = join(directory, 'iterations')
    const simulatorDirectory = join(directory, 'current-simulator')
    mkdirSync(iterationsDirectory)
    mkdirSync(simulatorDirectory)

    const beforeScreenshot = join(iterationsDirectory, '001-before.png')
    const afterScreenshot = join(simulatorDirectory, 'catalog-after.png')
    const report = buildReviewReport({
      ...fixedInput,
      results: [
        {
          ...fixedInput.results[0],
          screenshots: [afterScreenshot],
        },
      ],
      iterations: [
        {
          id: '001',
          startedAt: new Date('2026-09-16T01:00:00.000Z'),
          summary: '调整目录卡片间距',
          changedFiles: ['miniprogram/pages/catalog/index.wxss'],
          status: 'passed',
          beforeScreenshot,
          afterScreenshots: [afterScreenshot],
          notes: ['确认小屏宽度下没有横向溢出'],
        },
      ],
    })

    const paths = writeReviewReport(directory, report)
    const markdown = readFileSync(paths.markdownPath, 'utf8')
    const html = readFileSync(paths.htmlPath, 'utf8')

    expect(markdown).toContain('## 修改过程')
    expect(markdown).toContain('![修改前](<iterations/001-before.png>)')
    expect(markdown).toContain('![修改后](<current-simulator/catalog-after.png>)')
    expect(markdown).toContain('![场景截图](<current-simulator/catalog-after.png>)')
    expect(markdown).toContain('确认小屏宽度下没有横向溢出')
    expect(html).toContain('data-lightbox-src="iterations/001-before.png"')
    expect(html).toContain('data-lightbox-src="current-simulator/catalog-after.png"')
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

  it('把缺少修改后截图的通过轮次降级为失败，并同步总体结果', () => {
    const report = buildReviewReport({
      ...fixedInput,
      iterations: [
        {
          id: '003',
          startedAt: new Date('2026-09-16T01:03:00.000Z'),
          changedFiles: ['miniprogram/pages/catalog/index.wxss'],
          status: 'passed',
          afterScreenshots: [],
        },
      ],
    })

    expect(report.status).toBe('failed')
    expect(report.iterations[0]?.status).toBe('failed')
    expect(report.iterations[0]?.notes).toContain('未提供修改后截图，页面变更验收不得判定为通过。')
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
