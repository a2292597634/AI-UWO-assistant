import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { ReviewAdapter } from '../../tools/miniprogram-review/adapter'
import { runScenario } from '../../tools/miniprogram-review/runner'
import type { ReviewScenario } from '../../tools/miniprogram-review/types'
import { evidence } from './evidence-fixture'

const scenario: ReviewScenario = {
  name: '目录交互',
  entry: '/pages/catalog/index',
  state: 'normal',
  devices: ['iphone-standard'],
  steps: [
    { action: 'input', selector: '.search', value: '郑和' },
    { action: 'tap', selector: '.row' },
    { action: 'scrollPage', distance: 600 },
    { action: 'assertText', selector: '.title', contains: '郑和' },
    { action: 'screenshot', name: 'detail-bottom' },
  ],
}

const createRecordingAdapter = (
  calls: string[],
  options: { missingSelector?: string } = {},
): ReviewAdapter => ({
  navigate: async (path) => void calls.push(`navigate:${path}`),
  reLaunch: async (path) => void calls.push(`reLaunch:${path}`),
  switchTab: async (path) => void calls.push(`switchTab:${path}`),
  tap: async (selector) => void calls.push(`tap:${selector}`),
  input: async (selector, value) => void calls.push(`input:${selector}:${value}`),
  clearInput: async (selector) => void calls.push(`clearInput:${selector}`),
  scrollPage: async (distance) => void calls.push(`scrollPage:${distance}`),
  scrollElement: async (selector, distance) =>
    void calls.push(`scrollElement:${selector}:${distance}`),
  waitFor: async (selectorOrDuration) => void calls.push(`waitFor:${selectorOrDuration}`),
  queryElement: async (selector) => selector !== options.missingSelector,
  isVisible: async (selector) => selector !== options.missingSelector,
  readText: async () => '航海士郑和',
  screenshot: async (path) => void calls.push(`screenshot:${path}`),
  currentPagePath: async () => '/subpkg-detail/pages/detail/index',
  disconnect: async () => void calls.push('disconnect'),
})

describe('小程序验收场景执行器', () => {
  it('waitUntil 等待文字節點出現與正確 path，保留後續斷言', async () => {
    let reads = 0
    const calls: string[] = []
    const adapter = {
      ...createRecordingAdapter(calls),
      queryElement: async () => ++reads > 1,
      readText: async () => 'ready',
      currentPagePath: async () => 'pages/catalog/index',
    }
    const result = await runScenario(
      adapter,
      {
        ...scenario,
        steps: [
          {
            action: 'waitUntil',
            condition: { kind: 'text', selector: '.title', equals: 'ready' },
            timeoutMs: 1000,
          },
          {
            action: 'waitUntil',
            condition: { kind: 'page', path: '/pages/catalog/index' },
            timeoutMs: 1000,
          },
          { action: 'assertText', selector: '.title', equals: 'ready' },
        ],
      },
      { outputDir: 'C:/review/run' },
    )
    expect(result.status).toBe('passed')
    expect(result.steps.map((s) => s.action)).toEqual(['waitUntil', 'waitUntil', 'assertText'])
    expect(calls[calls.length - 1]).toBe('disconnect')
  })
  it('消失等待不吞掉查詢協議錯誤', async () => {
    const result = await runScenario(
      {
        ...createRecordingAdapter([]),
        queryElement: async () => {
          throw new Error('Connection closed')
        },
      },
      {
        ...scenario,
        steps: [
          { action: 'waitUntil', condition: { kind: 'exists', selector: '.sheet', exists: false } },
        ],
      },
      { outputDir: 'C:/review/run' },
    )
    expect(result.error).toBe('Connection closed')
  })
  it('每張截圖綁定自己的步驟、fixture 與實測 runtime', async () => {
    const adapter = {
      ...createRecordingAdapter([]),
      getReviewRuntimeInfo: async () => evidence().runtime,
    }
    const result = await runScenario(
      adapter,
      { ...scenario, fixture: 'coupon-success' },
      { outputDir: 'C:/review/run', evidenceSource: evidence().source },
    )
    expect(result.screenshotEvidence?.[0].evidence.scenario).toMatchObject({
      screenshotKey: 'detail-bottom',
      fixtureName: 'coupon-success',
      fixtureSha256: expect.any(String),
    })
    expect(result.screenshotEvidence?.[0].evidence.runtime.width).toBe(390)
  })
  it('以 reLaunch 重置已经打开的场景入口，避免同页 navigateTo 抛出对象错误', async () => {
    const calls: string[] = []
    const adapter = {
      ...createRecordingAdapter(calls),
      reLaunch: async (path: string) => void calls.push(`reLaunch:${path}`),
    } as ReviewAdapter

    await runScenario(adapter, { ...scenario, steps: [] }, { outputDir: 'C:/review/run' })

    expect(calls).toEqual(['reLaunch:/pages/catalog/index', 'disconnect'])
  })

  it('按顺序执行输入、点击、滚动、断言和截图', async () => {
    const calls: string[] = []
    const outputDir = 'C:/review/run'
    const result = await runScenario(createRecordingAdapter(calls), scenario, { outputDir })

    expect(calls).toEqual([
      'reLaunch:/pages/catalog/index',
      'input:.search:郑和',
      'tap:.row',
      'scrollPage:600',
      `screenshot:${join(outputDir, 'detail-bottom.png')}`,
      'disconnect',
    ])
    expect(result.status).toBe('passed')
    expect(result.steps).toHaveLength(5)
    expect(result.screenshots).toEqual([join(outputDir, 'detail-bottom.png')])
  })

  it('元素缺失时保存失败截图并停止后续步骤', async () => {
    const calls: string[] = []
    const missingScenario: ReviewScenario = {
      ...scenario,
      steps: [
        { action: 'assertExists', selector: '.missing' },
        { action: 'tap', selector: '.never' },
      ],
    }
    const outputDir = 'C:/review/run'
    const result = await runScenario(
      createRecordingAdapter(calls, { missingSelector: '.missing' }),
      missingScenario,
      { outputDir },
    )

    expect(result.status).toBe('failed')
    expect(result.failedStep).toBe(0)
    expect(result.failureScreenshot).toBe(join(outputDir, 'failure-step-001.png'))
    expect(result.error).toContain('找不到元素：.missing')
    expect(calls).toEqual([
      'reLaunch:/pages/catalog/index',
      `screenshot:${join(outputDir, 'failure-step-001.png')}`,
      'disconnect',
    ])
  })

  it('支持清空、元素滚动、等待和可见性断言', async () => {
    const calls: string[] = []
    const extendedScenario: ReviewScenario = {
      ...scenario,
      steps: [
        { action: 'clearInput', selector: '.search' },
        { action: 'scrollElement', selector: '.list', distance: 300 },
        { action: 'waitFor', selector: '.row', timeoutMs: 2000 },
        { action: 'waitFor', durationMs: 100 },
        { action: 'assertVisible', selector: '.row' },
        { action: 'assertExists', selector: '.missing', exists: false },
      ],
    }

    const result = await runScenario(
      createRecordingAdapter(calls, { missingSelector: '.missing' }),
      extendedScenario,
      { outputDir: 'C:/review/run' },
    )

    expect(result.status).toBe('passed')
    expect(calls).toEqual([
      'reLaunch:/pages/catalog/index',
      'clearInput:.search',
      'scrollElement:.list:300',
      'waitFor:.row',
      'waitFor:100',
      'disconnect',
    ])
  })

  it('非 Error 异常也保留结构化诊断', async () => {
    const calls: string[] = []
    const adapter = createRecordingAdapter(calls)
    adapter.tap = async () => {
      throw { code: 'PAGE_TRANSITION', page: '/pages/catalog/index' }
    }
    const result = await runScenario(adapter, scenario, { outputDir: 'C:/review/run' })

    expect(result.status).toBe('failed')
    expect(result.error).toBe('{"code":"PAGE_TRANSITION","page":"/pages/catalog/index"}')
  })
})
