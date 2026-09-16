import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createIterationInput } from '../../tools/miniprogram-review/iteration'

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
})

describe('小程序验收修改轮次', () => {
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
})
