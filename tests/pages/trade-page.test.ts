import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

interface TradeListItem {
  id: string
  name: string
  categoryId: string
  categoryName: string
  salesMode: string
  salesPortCount: number
  peakLabel: string
  lowLabel: string
  salesLabel: string
  iconPath: string
  iconFailed: boolean
}

interface TradePageData {
  searchText: string
  activeCategoryId: string | null
  categories: Array<{ id: string; name: string }>
  visibleGoods: TradeListItem[]
  resultCount: number
  pageError: string | null
}

interface TradePageConfig {
  data: TradePageData
  onLoad(): void
  onSearchInput(event: WechatMiniprogram.Input): void
  onCategoryTap(event: WechatMiniprogram.BaseEvent): void
  onTradeTap(event: WechatMiniprogram.BaseEvent): void
  onTradeIconError(event: WechatMiniprogram.BaseEvent): void
}

interface TradePageInstance extends TradePageConfig {
  data: TradePageData
  setData(update: Record<string, unknown>): void
}

let tradePage: TradePageConfig
const wxStub = {
  navigateTo: vi.fn(),
  setNavigationBarTitle: vi.fn(),
}

const createPageInstance = (): TradePageInstance => {
  const instance = Object.create(tradePage) as TradePageInstance
  instance.data = structuredClone(tradePage.data)
  instance.setData = (update) => {
    Object.assign(instance.data, update)
  }
  return instance
}

const inputEvent = (value: string): WechatMiniprogram.Input => ({ detail: { value } }) as never

const categoryEvent = (categoryId: string): WechatMiniprogram.BaseEvent =>
  ({ currentTarget: { dataset: { categoryId } } }) as never

const assetManifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../data/assets/cloudbase-manifest.json'), 'utf8'),
) as { assets: Array<{ filename: string; publicUrl: string }> }
const expectedWineIconPath = assetManifest.assets.find(
  (asset) => asset.filename === 'trade_trade0615.png',
)!.publicUrl

beforeAll(async () => {
  vi.stubGlobal('Page', (config: TradePageConfig) => {
    tradePage = config
  })
  vi.stubGlobal('wx', wxStub)

  await import('../../miniprogram/subpkg-trade/pages/index/index')
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('trade page', () => {
  it('loads the trade index and category reference', () => {
    const page = createPageInstance()

    page.onLoad()

    expect(page.data.searchText).toBe('')
    expect(page.data.visibleGoods.length).toBeGreaterThan(0)
    expect(page.data.categories).toContainEqual({
      id: '06',
      name: '酒類',
      iconPath: '/subpkg-trade/assets/category-icons/06.png',
    })
    expect(page.data.pageError).toBeNull()
    expect(page.data.visibleGoods).toContainEqual(
      expect.objectContaining({
        id: 'trade0615',
        iconPath: expectedWineIconPath,
        iconFailed: false,
      }),
    )
  })

  it('filters by trade name and category while preserving the result count', () => {
    const page = createPageInstance()
    page.onLoad()

    page.onSearchInput(inputEvent('葡萄酒'))
    expect(page.data.visibleGoods).toContainEqual(
      expect.objectContaining({ id: 'trade0615', name: '葡萄酒' }),
    )
    expect(page.data.resultCount).toBeGreaterThanOrEqual(1)

    page.onSearchInput(inputEvent(''))
    page.onCategoryTap(categoryEvent('06'))
    expect(page.data.activeCategoryId).toBe('06')
    expect(page.data.visibleGoods.every((item) => item.categoryId === '06')).toBe(true)
  })

  it('navigates to the trade detail subpackage', () => {
    const page = createPageInstance()
    page.onLoad()

    page.onTradeTap({ currentTarget: { dataset: { tradeId: 'trade0615' } } } as never)

    expect(wxStub.navigateTo).toHaveBeenCalledWith({
      url: '/subpkg-trade/pages/detail/index?id=trade0615',
    })
  })

  it('only marks the failed trade icon with its fallback state', () => {
    const page = createPageInstance()
    page.onLoad()

    page.onTradeIconError({
      currentTarget: { dataset: { tradeId: 'trade0615' } },
    } as never)

    const wine = page.data.visibleGoods.find((item) => item.id === 'trade0615')
    const otherGood = page.data.visibleGoods.find((item) => item.id !== 'trade0615')
    expect(wine?.iconFailed).toBe(true)
    expect(otherGood?.iconFailed).toBe(false)
    expect(page.data.resultCount).toBe(page.data.visibleGoods.length)

    page.onTradeIconError({} as never)
    expect(page.data.visibleGoods.find((item) => item.id === 'trade0615')?.iconFailed).toBe(true)
  })
})

describe('trade page markup', () => {
  const pageDir = path.resolve('miniprogram/subpkg-trade/pages/index')
  const tradeWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8')
  const tradeWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8')

  it('exposes the agreed information architecture and local design tokens', () => {
    expect(tradeWxml).toContain('搜尋貿易品')
    expect(tradeWxml).toContain('貿易品清單')
    expect(tradeWxml).toContain('無結果')
    expect(tradeWxml).toContain('data-trade-id')
    expect(tradeWxml).toContain('<image')
    expect(tradeWxml).toContain('lazy-load')
    expect(tradeWxml).toContain('binderror="onTradeIconError"')
    expect(tradeWxml).toContain('trade-result__icon')
    expect(tradeWxml).toContain('圖示載入失敗')
    expect(tradeWxss).toContain('var(--uwo-color-canvas)')
    expect(tradeWxss).toContain('var(--uwo-space-')
  })
})
