import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

interface TradeDetailPageData {
  title: { name: string }
  currentGameMonth: number
  currentMonthLabel: string
  ports: Array<{ portId: string; months: Array<{ month: number; isCurrent: boolean }> }>
  hasPorts: boolean
  emptyMessage: string | null
  loading: boolean
  pageError: string | null
  retryAvailable: boolean
  [key: string]: unknown
}

interface TradeDetailPageConfig {
  data: TradeDetailPageData
  onLoad(options?: Record<string, string | undefined>): void
  onShow(): void
  retryLoad(): void
}

interface TradeDetailPageInstance extends TradeDetailPageConfig {
  data: TradeDetailPageData
  setData(update: Record<string, unknown>): void
}

let detailPage: TradeDetailPageConfig
const wxStub = {
  setNavigationBarTitle: vi.fn(),
}
const anchorMs = Date.UTC(2026, 8, 3, 15, 0, 0)
const dayMs = 24 * 60 * 60 * 1000

const createPageInstance = (): TradeDetailPageInstance => {
  const instance = Object.create(detailPage) as TradeDetailPageInstance
  instance.data = structuredClone(detailPage.data)
  instance.setData = (update) => {
    Object.assign(instance.data, update)
  }
  return instance
}

beforeAll(async () => {
  vi.stubGlobal('Page', (config: TradeDetailPageConfig) => {
    detailPage = config
  })
  vi.stubGlobal('wx', wxStub)
  vi.useFakeTimers()
  vi.setSystemTime(anchorMs)

  await import('../../miniprogram/subpkg-trade/pages/detail/index')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime(anchorMs)
})

afterAll(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('trade detail page', () => {
  it('loads the wine detail and marks the calibrated current month', () => {
    const page = createPageInstance()

    page.onLoad({ id: 'trade0615' })

    expect(page.data.loading).toBe(false)
    expect(page.data.pageError).toBeNull()
    expect(page.data.title.name).toBe('葡萄酒')
    expect(page.data.currentGameMonth).toBe(12)
    expect(page.data.ports.length).toBeGreaterThan(0)
    expect(page.data.ports.every((port) => port.months.length === 12)).toBe(true)
    expect(page.data.ports[0]?.months[11]?.isCurrent).toBe(true)
    expect(wxStub.setNavigationBarTitle).toHaveBeenCalledWith({ title: '葡萄酒' })
  })

  it('shows a recoverable error when the trade ID is absent', () => {
    const page = createPageInstance()

    page.onLoad({})

    expect(page.data.loading).toBe(false)
    expect(page.data.pageError).toContain('找不到')
    expect(page.data.retryAvailable).toBe(false)
  })

  it('refreshes the current game month when the page is shown again', () => {
    const page = createPageInstance()

    page.onLoad({ id: 'trade0615' })
    vi.setSystemTime(anchorMs + dayMs)
    page.onShow()

    expect(page.data.currentGameMonth).toBe(1)
    expect(page.data.ports[0]?.months[0]?.isCurrent).toBe(true)
    expect(page.data.ports[0]?.months[11]?.isCurrent).toBe(false)
  })
})

describe('trade detail page markup', () => {
  const pageDir = path.resolve('miniprogram/subpkg-trade/pages/detail')
  const detailWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8')
  const detailWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8')

  it('keeps all twelve month cells visible in one row', () => {
    expect(detailWxml).toContain('各港口 1–12 月完整資料')
    expect(detailWxml).toContain('季節')
    expect(detailWxml).toContain('旺')
    expect(detailWxml).toContain('淡')
    expect(detailWxml).toContain('一般')
    expect(detailWxml).toContain('第 {{currentMonthLabel}} 已標示目前月份')
    expect(detailWxml).not.toContain('scroll-x')
    expect(detailWxml).not.toContain('<scroll-view')
    expect(detailWxss).toMatch(/repeat\(12/)
    expect(detailWxss).not.toMatch(/overflow-x\s*:\s*auto/)
    expect(detailWxss).not.toMatch(/min-width\s*:\s*900px/)
  })
})
