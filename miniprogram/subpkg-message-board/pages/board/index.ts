import { GAME_SERVERS } from '../../../contracts/coupon-redemption'
import type {
  PublicMessage,
  ViewerCapabilities,
  BoardInputs,
} from '../../../contracts/message-board'
import {
  createMessageBoardService,
  MessageBoardError,
} from '../../../runtime/message-board-service'
import { createBoardOperationId } from '../../../runtime/message-board-platform'
import { createBoardListController } from '../../../controllers/message-board-list-controller'
import { boardMessageView } from '../../../presenters/message-board-presenter'
type List = ReturnType<typeof createBoardListController<PublicMessage>>
Page({
  data: {
    rows: [] as ReturnType<typeof boardMessageView<PublicMessage>>[],
    loading: false,
    error: '',
    viewer: null as ViewerCapabilities | null,
    serverChoices: ['全部伺服器', ...GAME_SERVERS.map((server) => server.name)],
    serverIndex: 0,
    cursor: null as string | null,
    windowNumber: 1,
    canPrevious: false,
    canNext: false,
    pendingReport: false,
    writeDisabled: true,
    writeReason: '正在連接留言服務。',
  },
  list: null as List | null,
  service: createMessageBoardService(),
  active: false,
  showGeneration: 0,
  serverOffset: 0,
  timer: null as ReturnType<typeof setInterval> | null,
  reportInput: null as BoardInputs['reportMessage'] | null,
  onLoad() {
    this.list = createBoardListController<PublicMessage>((input) =>
      this.service.invoke('listPublic', {
        ...(input.cursor ? { cursor: input.cursor } : {}),
        ...(input.gameServerId ? { gameServerId: input.gameServerId } : {}),
        limit: input.limit,
      }),
    )
  },
  async onShow() {
    this.active = true
    await this.reload()
  },
  async reload() {
    const generation = ++this.showGeneration
    this.setData({ loading: true, error: '' })
    try {
      const viewer = await this.service.invoke('getViewer', {})
      if (!this.active || generation !== this.showGeneration) return
      this.serverOffset = viewer.serverTime - Date.now()
      if (this.data.viewer && this.data.viewer.viewerKey !== viewer.viewerKey) {
        this.reportInput = null
        this.setData({ rows: [], pendingReport: false })
      }
      const writeDisabled = !viewer.write || viewer.restricted || viewer.clearing
      const writeReason = viewer.clearing
        ? '留言資料正在清除。'
        : viewer.restricted
          ? '目前暫停你的新投稿。'
          : !viewer.write
            ? '留言投稿暫時關閉。'
            : ''
      this.setData({ viewer, writeDisabled, writeReason })
      if (this.list) await this.run(this.list.refresh())
      this.stopTimer()
      this.timer = setInterval(() => {
        void this.revalidate()
      }, 60000)
    } catch (error) {
      if (this.active)
        this.setData({
          loading: false,
          error: error instanceof Error ? error.message : '留言載入失敗。',
          writeDisabled: true,
          writeReason: '尚未連接留言服務，請重新整理。',
        })
    }
  },
  sync() {
    if (!this.list || !this.active) return
    const view = this.list.view()
    this.setData({
      rows: view.items.map(boardMessageView),
      loading: view.busy,
      error: view.error,
      cursor: view.cursor,
      windowNumber: view.windowNumber,
      canPrevious: view.canPrevious,
      canNext: view.canNext,
    })
  },
  async run(promise: Promise<void>) {
    this.sync()
    await promise
    this.sync()
  },
  async onRefresh() {
    await this.reload()
  },
  async onServerChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.detail.value)
    this.setData({ serverIndex: index })
    if (this.list)
      await this.run(this.list.selectServer(index ? GAME_SERVERS[index - 1]?.id || null : null))
  },
  async onLoadMore() {
    if (this.list) await this.run(this.list.loadMore())
  },
  async onNextWindow() {
    if (this.list) await this.run(this.list.nextWindow())
  },
  async onPreviousWindow() {
    if (this.list) await this.run(this.list.previousWindow())
  },
  async revalidate() {
    if (!this.active || !this.list || this.list.view().busy) return
    const ids = this.list.view().items.map((message) => message.messageId)
    if (!ids.length) return
    try {
      const result = await this.service.invoke('revalidatePublic', { messageIds: ids })
      if (this.active) {
        this.list.replaceRevalidated(result.items, result.unavailable)
        this.sync()
      }
    } catch {
      if (this.active) this.setData({ error: '留言更新失敗，目前顯示上次讀取的內容。' })
    }
  },
  onCompose() {
    if (!this.data.writeDisabled)
      wx.navigateTo({ url: '/subpkg-message-board/pages/compose/index' })
  },
  onMine() {
    wx.navigateTo({ url: '/subpkg-message-board/pages/mine/index' })
  },
  onAdmin() {
    if (this.data.viewer?.isAdmin) wx.navigateTo({ url: '/subpkg-message-board/pages/admin/index' })
  },
  onReport(event: WechatMiniprogram.CustomEvent) {
    if (this.reportInput || !this.data.viewer) return
    const messageId = String(event.currentTarget.dataset.id || '')
    wx.showActionSheet({
      itemList: ['廣告', '辱罵', '個人資訊', '其他'],
      success: async (result) => {
        const reason = (['advertising', 'abuse', 'personal-information', 'other'] as const)[
          result.tapIndex
        ]
        if (!reason || !this.data.viewer) return
        try {
          this.reportInput = {
            operationId: await createBoardOperationId(this.serverOffset),
            messageId,
            fixedReason: reason,
          }
          this.setData({ pendingReport: true, error: '' })
          await this.service.invoke('reportMessage', this.reportInput)
          this.reportInput = null
          this.setData({ pendingReport: false })
          wx.showToast({ title: '已送交管理員', icon: 'success' })
        } catch (error) {
          if (
            !(error instanceof MessageBoardError) ||
            !['unconfirmed', 'protocol', 'network'].includes(error.code)
          ) {
            this.reportInput = null
            this.setData({ pendingReport: false })
          }
          this.setData({ error: error instanceof Error ? error.message : '檢舉結果尚未確認。' })
        }
      },
    })
  },
  async onConfirmReport() {
    if (!this.reportInput) return
    try {
      const result = await this.service.invoke('getOperationResult', {
        action: 'reportMessage',
        operationId: this.reportInput.operationId,
      })
      if (result.confirmed) {
        this.reportInput = null
        this.setData({ pendingReport: false, error: '' })
        wx.showToast({ title: '已確認檢舉', icon: 'success' })
      } else this.setData({ error: '檢舉結果尚未確認，請稍後再確認。' })
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '尚未確認。' })
    }
  },
  onReturnHome() {
    wx.reLaunch({ url: '/pages/home/index' })
  },
  stopTimer() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },
  onHide() {
    this.active = false
    this.showGeneration++
    this.stopTimer()
    this.list?.onHide()
  },
  onUnload() {
    this.active = false
    this.stopTimer()
    this.list?.dispose()
    this.list = null
  },
})
