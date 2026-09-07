import { gameMonthAt } from '../../domain/game-month'
import { presentTradeDetail } from '../../presenters/trade-season-presenter'
import type { TradeDetailPageState } from '../../presenters/trade-season-presenter'
import { getTradeReference } from '../../runtime/trade-data-store'
import { getTradeDetail } from '../../runtime/trade-detail-store'

interface TradeDetailPageData extends TradeDetailPageState {
  monthLabels: string[]
  loading: boolean
  pageError: string | null
  retryAvailable: boolean
}

interface TradeDetailPageController {
  data: TradeDetailPageData
  setData(update: Partial<TradeDetailPageData>): void
}

interface TradeDetailPageInstanceState {
  tradeId: string | null
  retryCount: number
}

const pageStateByInstance = new WeakMap<object, TradeDetailPageInstanceState>()

const getPageState = (page: object): TradeDetailPageInstanceState => {
  let state = pageStateByInstance.get(page)
  if (!state) {
    state = { tradeId: null, retryCount: 0 }
    pageStateByInstance.set(page, state)
  }
  return state
}

const emptyView: TradeDetailPageState = {
  title: {
    name: '',
    categoryName: '',
    rankLabel: '',
    peakLabel: '',
    lowLabel: '',
  },
  currentGameMonth: 4,
  currentMonthLabel: '4月',
  ports: [],
  legend: { season: [], status: [] },
  hasPorts: false,
  emptyMessage: '目前沒有固定銷售港口矩陣',
}

const monthLabels = Array.from({ length: 12 }, (_, index) => `${index + 1}月`)

const loadDetail = (
  page: TradeDetailPageController,
  options: Record<string, string | undefined>,
): void => {
  const state = getPageState(page)
  const tradeId = options.id?.trim() ?? ''
  state.tradeId = tradeId || null

  if (!tradeId) {
    page.setData({
      ...emptyView,
      monthLabels,
      loading: false,
      pageError: '找不到貿易品資料。',
      retryAvailable: false,
    })
    return
  }

  page.setData({ loading: true, pageError: null, retryAvailable: false })

  try {
    const detail = getTradeDetail(tradeId)
    if (!detail) {
      page.setData({
        loading: false,
        pageError: `找不到貿易品「${tradeId}」的資料。`,
        retryAvailable: state.retryCount < 1,
      })
      return
    }

    const reference = getTradeReference()
    const view = presentTradeDetail(detail, reference, gameMonthAt(Date.now()))
    page.setData({
      ...view,
      monthLabels,
      loading: false,
      pageError: null,
      retryAvailable: false,
    })
    wx.setNavigationBarTitle({ title: detail.name || '貿易品詳情' })
  } catch {
    page.setData({
      loading: false,
      pageError: '貿易品資料載入失敗，請稍後重試。',
      retryAvailable: state.retryCount < 1,
    })
  }
}

const refreshCurrentMonth = (page: TradeDetailPageController): void => {
  const state = getPageState(page)
  if (!state.tradeId || page.data.loading || page.data.pageError) return

  const currentGameMonth = gameMonthAt(Date.now())
  if (page.data.currentGameMonth === currentGameMonth) return

  try {
    const detail = getTradeDetail(state.tradeId)
    if (!detail) return

    const reference = getTradeReference()
    page.setData({
      ...presentTradeDetail(detail, reference, currentGameMonth),
      monthLabels,
      loading: false,
      pageError: null,
      retryAvailable: false,
    })
  } catch {
    // 保留目前可見資料，避免返回頁面時因月份更新暫時失敗而清空矩陣。
  }
}

Page({
  data: {
    ...emptyView,
    monthLabels,
    loading: false,
    pageError: null,
    retryAvailable: false,
  } as TradeDetailPageData,

  onLoad(options: Record<string, string | undefined> = {}) {
    const state = getPageState(this)
    state.retryCount = 0
    loadDetail(this, options)
  },

  onShow() {
    refreshCurrentMonth(this)
  },

  retryLoad() {
    const state = getPageState(this)
    if (!state.tradeId || state.retryCount >= 1) return

    state.retryCount += 1
    loadDetail(this, { id: state.tradeId })
  },
})
