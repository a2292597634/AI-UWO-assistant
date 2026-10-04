import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createIterationInput } from '../../tools/miniprogram-review/iteration'
import { evidence } from './evidence-fixture'

const temporaryDirectories: string[] = []

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

const makeDirectory = (prefix: string): string => {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

const result = (screenshotPath: string) => ({
  scenario: '目录搜寻',
  pagePath: '/pages/catalog/index',
  state: 'normal' as const,
  status: 'passed' as const,
  steps: [],
  screenshots: [screenshotPath],
  screenshotEvidence: [{ path: screenshotPath, evidence: evidence() }],
})

describe('小程序验收修改轮次', () => {
  it('同頁同名截圖先選相同場景 hash，不被較早的另一場景遮蔽', () => {
    const previousOutput = makeDirectory('uwo-same-key-'),
      currentOutput = makeDirectory('uwo-same-key-after-')
    const wrongImage = join(previousOutput, 'wrong.png'),
      rightImage = join(previousOutput, 'right.png')
    writeFileSync(wrongImage, 'wrong')
    writeFileSync(rightImage, 'right')
    const wrong = result(wrongImage)
    wrong.screenshotEvidence[0].evidence.scenario.scenarioSha256 = 'different'
    writeFileSync(
      join(previousOutput, 'report.json'),
      JSON.stringify({ results: [wrong, result(rightImage)] }),
    )
    const iteration = createIterationInput({
      id: 'same',
      startedAt: new Date(),
      finishedAt: new Date(),
      changedFiles: [],
      results: [result(join(currentOutput, 'after.png'))],
      previousReportDirs: [previousOutput],
      outputDir: currentOutput,
    })
    expect(iteration.comparisons?.[0].comparison.status).toBe('comparable')
    expect(readFileSync(iteration.beforeScreenshot ?? '', 'utf8')).toBe('right')
  })
  it('舊報告無身份不能複製成可信 before，仍執行 after', () => {
    const previousOutput = makeDirectory('uwo-history-')
    const currentOutput = makeDirectory('uwo-after-')
    const image = join(previousOutput, 'image.png')
    writeFileSync(image, 'old')
    const old = result(image)
    writeFileSync(
      join(previousOutput, 'report.json'),
      JSON.stringify({ results: [{ ...old, screenshotEvidence: undefined }] }),
    )
    const iteration = createIterationInput({
      id: 'history',
      startedAt: new Date(),
      finishedAt: new Date(),
      changedFiles: [],
      results: [result(join(currentOutput, 'after.png'))],
      previousReportDirs: [previousOutput],
      outputDir: currentOutput,
    })
    expect(iteration.beforeScreenshot).toBeUndefined()
    expect(iteration.comparisons?.[0].comparison.status).toBe('historical')
    expect(iteration.afterScreenshots).toHaveLength(1)
  })
  it('每個截圖鍵各自匹配，跨 fixture 不複製', () => {
    const previousOutput = makeDirectory('uwo-pairs-'),
      currentOutput = makeDirectory('uwo-pairs-after-')
    const image = join(previousOutput, 'image.png')
    writeFileSync(image, 'old')
    const before = result(image)
    writeFileSync(join(previousOutput, 'report.json'), JSON.stringify({ results: [before] }))
    const after = result(join(currentOutput, 'after.png'))
    after.screenshotEvidence[0].evidence.scenario.fixtureSha256 = 'different'
    const iteration = createIterationInput({
      id: 'pairs',
      startedAt: new Date(),
      finishedAt: new Date(),
      changedFiles: [],
      results: [after],
      previousReportDirs: [previousOutput],
      outputDir: currentOutput,
    })
    expect(iteration.beforeScreenshot).toBeUndefined()
    expect(iteration.comparisons?.[0].comparison.status).toBe('incompatible')
  })
  it('记录变更文件和 after 截图，并复制可信的上一轮 before 基线', () => {
    const previousOutput = makeDirectory('uwo-review-previous-')
    const currentOutput = makeDirectory('uwo-review-current-')
    const previousScreenshot = join(previousOutput, 'previous.png')
    const currentScreenshot = join(currentOutput, 'current.png')
    writeFileSync(previousScreenshot, 'previous-image')
    writeFileSync(
      join(previousOutput, 'report.json'),
      JSON.stringify({
        results: [{ ...result(previousScreenshot) }],
      }),
    )
    writeFileSync(currentScreenshot, 'current-image')

    const iteration = createIterationInput({
      id: '002',
      startedAt: new Date('2026-09-16T02:00:00.000Z'),
      finishedAt: new Date('2026-09-16T02:00:02.000Z'),
      changedFiles: ['miniprogram/pages/catalog/index.wxss'],
      results: [result(currentScreenshot)],
      previousReportDirs: [previousOutput],
      outputDir: currentOutput,
    })

    expect(iteration.status).toBe('passed')
    expect(iteration.changedFiles).toEqual(['miniprogram/pages/catalog/index.wxss'])
    expect(iteration.afterScreenshots).toEqual([currentScreenshot])
    expect(iteration.beforeScreenshot).toBe(join(currentOutput, 'iterations', '002-before.png'))
    expect(existsSync(iteration.beforeScreenshot ?? '')).toBe(true)
    expect(readFileSync(iteration.beforeScreenshot ?? '', 'utf8')).toBe('previous-image')
  })

  it('忽略报告目录外的上一轮截图，并从失败结果推导失败状态', () => {
    const previousOutput = makeDirectory('uwo-review-previous-')
    const currentOutput = makeDirectory('uwo-review-current-')
    const outsideScreenshot = join(makeDirectory('uwo-review-outside-'), 'outside.png')
    writeFileSync(outsideScreenshot, 'outside-image')
    writeFileSync(
      join(previousOutput, 'report.json'),
      JSON.stringify({ results: [{ ...result(outsideScreenshot) }] }),
    )
    const currentScreenshot = join(currentOutput, 'current.png')

    const iteration = createIterationInput({
      id: '003',
      startedAt: new Date('2026-09-16T03:00:00.000Z'),
      finishedAt: new Date('2026-09-16T03:00:02.000Z'),
      changedFiles: [],
      results: [
        {
          ...result(currentScreenshot),
          status: 'failed',
          failureScreenshot: currentScreenshot,
        },
      ],
      previousReportDirs: [previousOutput],
      outputDir: currentOutput,
    })

    expect(iteration.status).toBe('failed')
    expect(iteration.beforeScreenshot).toBeUndefined()
    expect(iteration.afterScreenshots).toEqual([currentScreenshot])
    expect(existsSync(join(currentOutput, 'iterations', '003-before.png'))).toBe(false)
  })

  it('通过结果没有修改后截图时不得判定本轮通过', () => {
    const currentOutput = makeDirectory('uwo-review-current-')

    const iteration = createIterationInput({
      id: '004',
      startedAt: new Date('2026-09-16T04:00:00.000Z'),
      finishedAt: new Date('2026-09-16T04:00:02.000Z'),
      changedFiles: ['miniprogram/pages/catalog/index.wxss'],
      results: [
        {
          ...result(join(currentOutput, 'current.png')),
          screenshots: [],
        },
      ],
      previousReportDirs: [],
      outputDir: currentOutput,
    })

    expect(iteration.status).toBe('failed')
  })
})
