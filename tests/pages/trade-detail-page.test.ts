import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

interface TradeDetailPageData {
  title: { name: string; iconPath: string }
  currentGameMonth: number
  currentMonthLabel: string
  ports: Array<{ portId: string; months: Array<{ month: number; isCurrent: boolean }> }>
  hasPorts: boolean
  emptyMessage: string | null
  iconFailed: boolean
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
  onTradeIconError(): void
}

interface TradeDetailPageInstance extends TradeDetailPageConfig {
  data: TradeDetailPageData
  setData(update: Record<string, unknown>): void
}

let detailPage: TradeDetailPageConfig
const wxStub = {
  setNavigationBarTitle: vi.fn(),
}
const anchorMs = Date.UTC(2026, 8, 7, 1, 0, 0)
const dayMs = 24 * 60 * 60 * 1000
const assetManifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../data/assets/cloudbase-manifest.json'), 'utf8'),
) as { cdnOrigin: string; cloudPathPrefix: string; releaseId: string }
const expectedWineIconPath = `${assetManifest.cdnOrigin}/${assetManifest.cloudPathPrefix}/${assetManifest.releaseId}/trade_trade0615.png`

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
  it('loads the wine detail and marks the current April game month', () => {
    const page = createPageInstance()

    page.onLoad({ id: 'trade0615' })

    expect(page.data.loading).toBe(false)
    expect(page.data.pageError).toBeNull()
    expect(page.data.title.name).toBe('葡萄酒')
    expect(page.data.title.iconPath).toBe(expectedWineIconPath)
    expect(page.data.iconFailed).toBe(false)
    expect(page.data.currentGameMonth).toBe(4)
    expect(page.data.ports.length).toBeGreaterThan(0)
    expect(page.data.ports.every((port) => port.months.length === 12)).toBe(true)
    expect(page.data.ports[0]?.months[3]?.isCurrent).toBe(true)
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

    expect(page.data.currentGameMonth).toBe(5)
    expect(page.data.ports[0]?.months[4]?.isCurrent).toBe(true)
    expect(page.data.ports[0]?.months[3]?.isCurrent).toBe(false)
  })

  it('isolates an icon load failure from the loaded trade detail', () => {
    const page = createPageInstance()

    page.onLoad({ id: 'trade0615' })
    const originalName = page.data.title.name
    const originalPortCount = page.data.ports.length
    const originalHasPorts = page.data.hasPorts

    page.onTradeIconError()

    expect(page.data.iconFailed).toBe(true)
    expect(page.data.title.name).toBe(originalName)
    expect(page.data.ports).toHaveLength(originalPortCount)
    expect(page.data.hasPorts).toBe(originalHasPorts)
  })

  it('resets an earlier icon failure after a successful detail load', () => {
    const page = createPageInstance()

    page.onLoad({ id: 'trade0615' })
    page.onTradeIconError()
    page.onLoad({ id: 'trade0615' })

    expect(page.data.iconFailed).toBe(false)
  })

  it('preserves the icon failure state while refreshing the current month matrix', () => {
    const page = createPageInstance()

    page.onLoad({ id: 'trade0615' })
    page.onTradeIconError()
    vi.setSystemTime(anchorMs + dayMs)
    page.onShow()

    expect(page.data.iconFailed).toBe(true)
    expect(page.data.currentGameMonth).toBe(5)
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
    expect(detailWxml).toContain('中國大陸時間')
    expect(detailWxml).toContain('09:00')
    expect(detailWxml).not.toContain('scroll-x')
    expect(detailWxml).not.toContain('<scroll-view')
    expect(detailWxss).toMatch(/repeat\(12/)
    expect(detailWxss).not.toMatch(/overflow-x\s*:\s*auto/)
    expect(detailWxss).not.toMatch(/min-width\s*:\s*900px/)
  })

  it('renders a local hero icon with an accessible failure fallback', () => {
    expect(detailWxml).toContain('<image')
    expect(detailWxml).toContain('class="trade-detail__icon"')
    expect(detailWxml).toContain('src="{{title.iconPath}}"')
    expect(detailWxml).toContain('binderror="onTradeIconError"')
    expect(detailWxml).toContain('aria-label="{{title.name}}圖示"')
    expect(detailWxml).toContain('圖示載入失敗')
  })

  it('keeps the hero icon tokenized and the copy shrinkable on narrow screens', () => {
    expect(detailWxss).toMatch(/\.trade-detail__hero-row\s*{[^}]*display:\s*flex/s)
    expect(detailWxss).toMatch(/\.trade-detail__icon-wrap\s*{[^}]*width:\s*112rpx/s)
    expect(detailWxss).toMatch(/\.trade-detail__icon-wrap\s*{[^}]*height:\s*112rpx/s)
    expect(detailWxss).toMatch(
      /\.trade-detail__icon-wrap\s*{[^}]*border-radius:\s*var\(--uwo-radius-control\)/s,
    )
    expect(detailWxss).toMatch(
      /\.trade-detail__icon-wrap\s*{[^}]*background:\s*var\(--uwo-color-surface-muted\)/s,
    )
    expect(detailWxss).toMatch(/\.trade-detail__hero-copy\s*{[^}]*min-width:\s*0/s)
    expect(detailWxss).toMatch(/@media\s*\(max-width:\s*360px\)/)
  })
})
