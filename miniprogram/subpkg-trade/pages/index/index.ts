import { queryTradeGoods } from '../../../domain/trade-query'
import { getTradeGoods, getTradeReference } from '../../runtime/trade-data-store'
import type {
  RuntimeTradeGoodIndexEntry,
  RuntimeTradeReference,
} from '../../../contracts/runtime-data'

interface TradeListItem extends RuntimeTradeGoodIndexEntry {
  peakLabel: string
  lowLabel: string
  salesLabel: string
  rankLabel: string
}

interface TradePageData {
  searchText: string
  activeCategoryId: string | null
  categories: Array<{ id: string; name: string }>
  visibleGoods: TradeListItem[]
  resultCount: number
  pageError: string | null
}

interface TradePageController {
  data: TradePageData
  setData(update: Partial<TradePageData>): void
}

const getEventDataset = (event: WechatMiniprogram.BaseEvent): Record<string, unknown> =>
  (event.currentTarget.dataset as unknown as Record<string, unknown>) ?? {}

const seasonLabel = (seasonIds: readonly string[], reference: RuntimeTradeReference): string => {
  if (seasonIds.length === 0) return '未設定'
  return seasonIds.map((seasonId) => reference.seasonNames[seasonId] ?? seasonId).join('、')
}

const salesLabel = (entry: RuntimeTradeGoodIndexEntry): string => {
  if (entry.salesMode === 'fixed-port') {
    return `${entry.salesPortCount} 個固定銷售港口`
  }

  if (entry.salesMode === 'barter') {
    return '交換取得 · 無固定銷售港口'
  }

  return '特殊資料 · 無固定銷售港口'
}

const rankLabel = (rank: number | null): string => (rank === null ? '等級待補' : `名產 Lv.${rank}`)

const toListItem = (
  entry: RuntimeTradeGoodIndexEntry,
  reference: RuntimeTradeReference,
): TradeListItem => ({
  ...entry,
  peakLabel: seasonLabel(entry.peakSeasonIds, reference),
  lowLabel: seasonLabel(entry.lowSeasonIds, reference),
  salesLabel: salesLabel(entry),
  rankLabel: rankLabel(entry.rank),
})

const refreshResults = (
  page: TradePageController,
  searchText: string,
  categoryId: string | null,
): void => {
  try {
    const goods = getTradeGoods()
    const reference = getTradeReference()
    const filtered = queryTradeGoods(goods, { searchText, categoryId })

    page.setData({
      visibleGoods: filtered.map((entry) => toListItem(entry, reference)),
      resultCount: filtered.length,
      pageError: null,
    })
  } catch {
    page.setData({
      visibleGoods: [],
      resultCount: 0,
      pageError: '貿易品資料暫時無法載入，請稍後再試。',
    })
  }
}

Page({
  data: {
    searchText: '',
    activeCategoryId: null,
    categories: [],
    visibleGoods: [],
    resultCount: 0,
    pageError: null,
  } as TradePageData,

  onLoad() {
    try {
      const reference = getTradeReference()
      const categories = reference.tradeTypes.map((type) => ({ id: type.id, name: type.name }))

      this.setData({
        categories,
        searchText: '',
        activeCategoryId: null,
        pageError: null,
      })
      refreshResults(this, '', null)
      wx.setNavigationBarTitle({ title: '貿易品淡旺季查詢' })
    } catch {
      this.setData({
        categories: [],
        visibleGoods: [],
        resultCount: 0,
        pageError: '貿易品資料暫時無法載入，請稍後再試。',
      })
    }
  },

  onSearchInput(event: WechatMiniprogram.Input) {
    const searchText = event.detail.value
    this.setData({ searchText })
    refreshResults(this, searchText, this.data.activeCategoryId)
  },

  onSearchClear() {
    this.setData({ searchText: '' })
    refreshResults(this, '', this.data.activeCategoryId)
  },

  onCategoryTap(event: WechatMiniprogram.BaseEvent) {
    const rawCategoryId = getEventDataset(event).categoryId
    if (typeof rawCategoryId !== 'string') return

    const categoryId = rawCategoryId === '' ? null : rawCategoryId
    const nextCategoryId = categoryId === this.data.activeCategoryId ? null : categoryId
    this.setData({ activeCategoryId: nextCategoryId })
    refreshResults(this, this.data.searchText, nextCategoryId)
  },

  onTradeTap(event: WechatMiniprogram.BaseEvent) {
    const tradeId = getEventDataset(event).tradeId
    if (typeof tradeId !== 'string' || !tradeId) return

    wx.navigateTo({ url: '/subpkg-trade/pages/detail/index?id=' + tradeId })
  },
})
