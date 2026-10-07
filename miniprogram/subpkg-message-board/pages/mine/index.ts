import type {
  MyMessage,
  ViewerCapabilities,
  BoardProfile,
  BoardInputs,
} from '../../../contracts/message-board'
import {
  createMessageBoardService,
  MessageBoardError,
} from '../../../runtime/message-board-service'
import {
  createBoardOperationId,
  writeBoardPreview,
  removeBoardPreview,
} from '../../../runtime/message-board-platform'
import { createBoardDraftStore } from '../../../domain/message-board/draft-store'
import { createBoardListController } from '../../../controllers/message-board-list-controller'
import { boardMessageView, BOARD_DEFAULT_AVATAR } from '../../../presenters/message-board-presenter'
type Action = 'withdrawMessage' | 'retrySafety' | 'clearMyData'
type Pending = { action: Action; operationId: string }
type List = ReturnType<typeof createBoardListController<MyMessage>>
type Row = ReturnType<typeof boardMessageView<MyMessage>> & { displayAvatar: string }
Page({
  data: {
    rows: [] as Row[],
    loading: true,
    error: '',
    viewer: null as ViewerCapabilities | null,
    profile: null as BoardProfile | null,
    cursor: null as string | null,
    canPrevious: false,
    canNext: false,
    windowNumber: 1,
    pendingAction: false,
    hasDraftPending: false,
    clearing: false,
  },
  service: createMessageBoardService(),
  list: null as List | null,
  active: false,
  loadGeneration: 0,
  serverOffset: 0,
  pending: null as Pending | null,
  timer: null as ReturnType<typeof setInterval> | null,
  clearPolls: 0,
  refreshTicks: 0,
  previews: {} as Record<string, string>,
  onLoad() {
    this.list = createBoardListController<MyMessage>((input) =>
      this.service.invoke('listMine', {
        ...(input.cursor ? { cursor: input.cursor } : {}),
        limit: input.limit,
      }),
    )
  },
  async onShow() {
    this.active = true
    await this.onRefresh()
    this.stopTimer()
    this.refreshTicks = 0
    this.timer = setInterval(() => {
      if (this.data.clearing) {
        if (this.clearPolls++ < 100) void this.onRefresh()
        else this.stopTimer()
      } else if (++this.refreshTicks % 20 === 0) void this.onRefresh()
    }, 3000)
  },
  async onRefresh() {
    const generation = ++this.loadGeneration
    this.setData({ loading: true, error: '' })
    try {
      const viewer = await this.service.invoke('getViewer', {})
      if (!this.active || generation !== this.loadGeneration) return
      const clearedVersionChanged =
        this.data.viewer?.viewerKey === viewer.viewerKey &&
        this.data.viewer.clearVersion !== viewer.clearVersion
      if (
        this.data.viewer &&
        (this.data.viewer.viewerKey !== viewer.viewerKey ||
          this.data.viewer.clearVersion !== viewer.clearVersion)
      ) {
        this.cleanPreviews()
        this.pending = null
        this.setData({ pendingAction: false, rows: [] })
      }
      this.serverOffset = viewer.serverTime - Date.now()
      this.setData({ viewer, clearing: viewer.clearing })
      const draft = createBoardDraftStore(
        {
          get: (key) => wx.getStorageSync(key),
          set: (key, value) => wx.setStorageSync(key, value),
          remove: (key) => wx.removeStorageSync(key),
        },
        viewer.viewerKey,
      )
      if (viewer.clearing || clearedVersionChanged) draft.clear()
      const profile = await this.service.invoke('getProfile', {})
      if (!this.active || generation !== this.loadGeneration) return
      this.setData({
        hasDraftPending: !!draft.read()?.pending,
        profile,
      })
      if (!this.active || generation !== this.loadGeneration) return
      if (this.list) {
        const loading = this.list.refresh()
        this.sync()
        await loading
        this.sync()
        await this.loadPreviews(generation)
      }
    } catch (error) {
      if (this.active)
        this.setData({
          loading: false,
          error: error instanceof Error ? error.message : '無法載入自己的留言。',
        })
    }
  },
  sync() {
    if (!this.active || !this.list) return
    const view = this.list.view()
    this.setData({
      rows: this.data.clearing
        ? []
        : view.items.map((message) => ({
            ...boardMessageView(message),
            displayAvatar:
              message.avatarFileId ||
              (message.avatarAssetId ? this.previews[message.avatarAssetId] : null) ||
              BOARD_DEFAULT_AVATAR,
          })),
      loading: view.busy,
      error: view.error,
      cursor: view.cursor,
      windowNumber: view.windowNumber,
      canPrevious: view.canPrevious,
      canNext: view.canNext,
    })
  },
  async loadPreviews(generation?: number) {
    const currentGeneration = generation ?? this.loadGeneration
    const viewer = this.data.viewer
    if (!viewer || this.data.clearing || !this.list) return
    const assets = [
      ...new Set(
        this.list
          .view()
          .items.filter((message) => !message.avatarFileId && message.avatarAssetId)
          .map((message) => message.avatarAssetId!),
      ),
    ]
    for (const assetId of assets) {
      if (!this.active || currentGeneration !== this.loadGeneration) return
      if (this.previews[assetId]) continue
      try {
        const preview = await this.service.invoke('loadPrivateAvatar', { assetId })
        if (this.active && currentGeneration === this.loadGeneration)
          this.previews[assetId] = writeBoardPreview(viewer.viewerKey, preview.base64, assetId)
      } catch {
        /* 預覽不可用時使用本地預設圖。 */
      }
    }
    this.sync()
  },
  async runList(promise: Promise<void>) {
    this.sync()
    await promise
    this.sync()
    await this.loadPreviews()
  },
  async onMore() {
    if (this.list) await this.runList(this.list.loadMore())
  },
  async onNext() {
    if (this.list) await this.runList(this.list.nextWindow())
  },
  async onPrevious() {
    if (this.list) await this.runList(this.list.previousWindow())
  },
  onCompose() {
    wx.navigateTo({ url: '/subpkg-message-board/pages/compose/index' })
  },
  onProfile() {
    wx.navigateTo({ url: '/subpkg-message-board/pages/compose/index?mode=profile' })
  },
  async perform<A extends Action>(action: A, input: BoardInputs[A]) {
    if (this.pending) return
    this.pending = { action, operationId: input.operationId }
    this.setData({ pendingAction: true, error: '' })
    try {
      await this.service.invoke(action, input)
      this.pending = null
      this.setData({ pendingAction: false })
      if (action === 'clearMyData' && this.data.viewer) {
        createBoardDraftStore(
          {
            get: (key) => wx.getStorageSync(key),
            set: (key, value) => wx.setStorageSync(key, value),
            remove: (key) => wx.removeStorageSync(key),
          },
          this.data.viewer.viewerKey,
        ).clear()
        this.cleanPreviews()
        this.clearPolls = 0
      }
      await this.onRefresh()
    } catch (error) {
      if (
        !(error instanceof MessageBoardError) ||
        !['unconfirmed', 'protocol', 'network'].includes(error.code)
      ) {
        this.pending = null
        this.setData({ pendingAction: false })
      }
      this.setData({ error: error instanceof Error ? error.message : '操作結果尚未確認。' })
    }
  },
  onWithdraw(event: WechatMiniprogram.CustomEvent) {
    const row = this.data.rows.find((item) => item.messageId === event.currentTarget.dataset.id)
    if (!row || !row.canWithdraw || this.pending) return
    wx.showModal({
      title: '撤回這則留言？',
      content: '撤回後不再公開，無法恢復。正文仍可在保留期限內查看。',
      confirmText: '確認撤回',
      success: async (result) => {
        if (result.confirm)
          await this.perform('withdrawMessage', {
            operationId: await createBoardOperationId(this.serverOffset),
            messageId: row.messageId,
            expectedRevision: row.revision,
          })
      },
    })
  },
  async onRetry(event: WechatMiniprogram.CustomEvent) {
    const row = this.data.rows.find((item) => item.messageId === event.currentTarget.dataset.id)
    if (row && !this.pending)
      await this.perform('retrySafety', {
        operationId: await createBoardOperationId(this.serverOffset),
        messageId: row.messageId,
        expectedRevision: row.revision,
      })
  },
  onClear() {
    if (this.pending || this.data.clearing) return
    wx.showModal({
      title: '清除我的留言資料？',
      content:
        '所有你的公開留言會立即撤下，暱稱、頭像及留言正文將在背景清除。此操作無法恢復；必要的最小風控及操作紀錄仍依保留期限處理。',
      confirmText: '確認清除',
      confirmColor: '#8B3A3A',
      success: async (result) => {
        if (result.confirm)
          await this.perform('clearMyData', {
            operationId: await createBoardOperationId(this.serverOffset),
          })
      },
    })
  },
  async onConfirm() {
    if (!this.pending) return
    try {
      const result = await this.service.invoke('getOperationResult', this.pending)
      if (result.confirmed) {
        this.pending = null
        this.setData({ pendingAction: false, error: '' })
        await this.onRefresh()
      } else this.setData({ error: '結果仍未確認，請稍後再確認。' })
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '結果尚未確認。' })
    }
  },
  cleanPreviews() {
    for (const file of Object.values(this.previews)) removeBoardPreview(file)
    this.previews = {}
  },
  stopTimer() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },
  onHide() {
    this.active = false
    this.loadGeneration++
    this.stopTimer()
    this.list?.onHide()
    this.cleanPreviews()
  },
  onUnload() {
    this.active = false
    this.stopTimer()
    this.list?.dispose()
    this.cleanPreviews()
    this.list = null
  },
})
