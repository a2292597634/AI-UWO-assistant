import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isDevToolsConnectionError,
  type ReviewAdapter,
} from '../../tools/miniprogram-review/adapter'
import { buildReviewReport } from '../../tools/miniprogram-review/report'
import { renderReviewReportHtml } from '../../tools/miniprogram-review/report-html'
import { runScenario } from '../../tools/miniprogram-review/runner'
import { loadScenario, parseScenario } from '../../tools/miniprogram-review/scenario'
import type { ReviewScenario } from '../../tools/miniprogram-review/types'

const input = (steps: unknown[]) => ({
  name: '條件等待',
  entry: '/pages/catalog/index',
  state: 'normal',
  devices: ['iphone-standard'],
  steps,
})
const wait = (condition: unknown, timeoutMs?: number) => ({
  action: 'waitUntil',
  condition,
  ...(timeoutMs === undefined ? {} : { timeoutMs }),
})
const adapter = (overrides: Partial<ReviewAdapter> = {}): ReviewAdapter => ({
  reLaunch: async () => undefined,
  navigate: async () => undefined,
  switchTab: async () => undefined,
  tap: async () => undefined,
  input: async () => undefined,
  clearInput: async () => undefined,
  scrollPage: async () => undefined,
  scrollElement: async () => undefined,
  waitFor: async () => undefined,
  queryElement: async () => true,
  isVisible: async () => true,
  readText: async () => '',
  currentPagePath: async () => '/pages/catalog/index',
  screenshot: async () => undefined,
  disconnect: async () => undefined,
  ...overrides,
})
const run = (condition: unknown, overrides: Partial<ReviewAdapter> = {}, timeoutMs?: number) =>
  runScenario(adapter(overrides), input([wait(condition, timeoutMs)]) as ReviewScenario, {
    outputDir: 'C:/review/run',
  })

afterEach(() => vi.useRealTimers())

describe('waitUntil 相容性與有界等待', () => {
  it('全部保存場景可載入且包含七份條件等待場景', () => {
    const directory = resolve('tools/miniprogram-review/scenarios')
    const scenarios = readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .map((name) => loadScenario(resolve(directory, name)))
    expect(
      scenarios.filter((scenario) =>
        scenario.steps.some((step) => String(step.action) === 'waitUntil'),
      ),
    ).toHaveLength(7)
  })

  it.each([
    { kind: 'exists', selector: '.loading', exists: false },
    { kind: 'text', selector: '.title', equals: '' },
    { kind: 'text', selector: '.title', contains: '' },
    { kind: 'page', path: '/subpkg-detail/pages/detail/index' },
  ])('解析合法條件保留 false 與空文字：%j', (condition) => {
    expect(parseScenario(input([wait(condition)])).steps).toEqual([wait(condition)])
  })

  it.each([
    [{ kind: 'exists', selector: '.x' }, 'exists'],
    [{ kind: 'exists', selector: '.x', exists: 'false' }, 'exists'],
    [{ kind: 'exists', selector: '.x', exists: false, typo: 1 }, '未知字段'],
    [{ kind: 'text', selector: '.x' }, 'equals 或 contains'],
    [{ kind: 'text', selector: '.x', equals: '', contains: '' }, 'equals 或 contains'],
    [{ kind: 'text', selector: '.x', equals: 1 }, '字符串'],
    [{ kind: 'page', path: '../pages/x' }, '安全'],
    [{ kind: 'page', path: '/pages/../x' }, '安全'],
    [{ kind: 'page', path: '/pages/x\\index' }, '安全'],
    [{ kind: 'page', path: '/pages/x', selector: '.x' }, '未知字段'],
    [{ kind: 'unknown' }, '不支持'],
  ])('拒絕非法條件 %j', (condition, message) => {
    expect(() => parseScenario(input([wait(condition)]))).toThrow(String(message))
  })

  it.each([0, -1, 30_001, 1.5, '5000', null])('拒絕非法 timeout %j', (timeoutMs) => {
    expect(() =>
      parseScenario(input([{ ...wait({ kind: 'page', path: '/pages/x' }), timeoutMs }])),
    ).toThrow(/等待超时/)
  })
  it('拒絕動作未知欄位並接受 timeout 邊界', () => {
    const condition = { kind: 'exists', selector: '.x', exists: true }
    expect(() => parseScenario(input([{ ...wait(condition), intervalMs: 1 }]))).toThrow('未知字段')
    for (const timeoutMs of [1, 30_000])
      expect(parseScenario(input([wait(condition, timeoutMs)])).steps[0]).toEqual(
        wait(condition, timeoutMs),
      )
  })

  it('元素出現後消失，連續兩次不存在才通過', async () => {
    vi.useFakeTimers()
    const observations = [true, false, true, false, false]
    let probes = 0
    const pending = run(
      { kind: 'exists', selector: '.loading', exists: false },
      {
        queryElement: async () => observations[probes++] ?? false,
      },
    )
    await vi.advanceTimersByTimeAsync(399)
    expect(probes).toBe(4)
    await vi.advanceTimersByTimeAsync(1)
    expect((await pending).status).toBe('passed')
    expect(probes).toBe(5)
  })

  it('單次閃現與間歇假穩定不能通過，預設五秒有限失敗', async () => {
    vi.useFakeTimers()
    let probes = 0
    const pending = run(
      { kind: 'exists', selector: '.flash', exists: true },
      {
        queryElement: async () => ++probes % 2 === 1,
      },
    )
    await vi.advanceTimersByTimeAsync(5000)
    const result = await pending
    expect(result.status).toBe('failed')
    expect(result.error).toContain('條件等待超時')
    expect(result.error).toContain('.flash')
    expect(result.error).toContain('最後觀察值')
    expect(isDevToolsConnectionError(result.error)).toBe(false)
    expect(probes).toBeLessThanOrEqual(51)
  })

  it.each([
    [{ kind: 'text', selector: '.title', equals: '' }, ['', ''], 'passed'],
    [
      { kind: 'text', selector: '.title', contains: '完成' },
      ['處理中', '已完成', '已完成'],
      'passed',
    ],
    [
      { kind: 'text', selector: '.title', equals: '完成' },
      ['未完成', '未完成', '未完成'],
      'failed',
    ],
    [
      { kind: 'page', path: '/pages/catalog/index' },
      ['/pages/old/index', '/pages/catalog/index', '/pages/catalog/index'],
      'passed',
    ],
  ])('文字及路徑依實際觀察判定 %j', async (condition, values, status) => {
    vi.useFakeTimers()
    let index = 0
    const read = async () => values[Math.min(index++, values.length - 1)]!
    const pending = run(condition, { readText: read, currentPagePath: read }, 350)
    await vi.advanceTimersByTimeAsync(350)
    expect((await pending).status).toBe(status)
  })

  it('文字元素不存在時不讀文字，也不能以空字串誤通過', async () => {
    vi.useFakeTimers()
    const readText = vi.fn(async () => '')
    const pending = run(
      { kind: 'text', selector: '.missing', equals: '' },
      {
        queryElement: async () => false,
        readText,
      },
      250,
    )
    await vi.advanceTimersByTimeAsync(250)
    expect((await pending).status).toBe('failed')
    expect(readText).not.toHaveBeenCalled()
  })

  it('掛起 probe 受剩餘總 deadline 約束並保留連接恢復分類', async () => {
    vi.useFakeTimers()
    let probes = 0
    const pending = run(
      { kind: 'exists', selector: '.x', exists: false },
      {
        queryElement: async () => (++probes === 1 ? true : new Promise<boolean>(() => undefined)),
      },
      250,
    )
    await vi.advanceTimersByTimeAsync(249)
    expect(probes).toBe(2)
    await vi.advanceTimersByTimeAsync(1)
    const result = await pending
    expect(result.status).toBe('failed')
    expect(isDevToolsConnectionError(result.error)).toBe(true)
    expect(result.error).toContain('waitUntil')
  })

  it.each(['Connection is closed', 'automator response timeout', 'SDK 協議非法回覆'])(
    '探針錯誤原樣保留，不當元素消失：%s',
    async (message) => {
      const result = await run(
        { kind: 'exists', selector: '.x', exists: false },
        {
          queryElement: async () => {
            throw new Error(message)
          },
        },
      )
      expect(result.status).toBe('failed')
      expect(result.error).toBe(message)
    },
  )

  it('HTML 動作顯示等待條件，保留失敗觀察與三層結果', async () => {
    vi.useFakeTimers()
    const pending = run({ kind: 'exists', selector: '.x', exists: false }, {}, 200)
    await vi.advanceTimersByTimeAsync(200)
    const result = await pending
    const report = buildReviewReport({
      runId: 'wait-test',
      generatedAt: new Date(),
      git: { commit: 'test', dirty: true },
      results: [result],
      coverage: { covered: [], exempted: [], manual: [], manualStates: [] },
    })
    const html = renderReviewReportHtml(report, 'C:/review/run')
    expect(html).toContain('等待條件')
    expect(html).toContain('id="icon-waitUntil"')
    expect(html).toContain('最後觀察值')
    expect(html).toContain('倉庫門禁')
    expect(report.status).toBe('failed')
  })
})
