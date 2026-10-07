import { GAME_SERVERS } from '../../../contracts/coupon-redemption'
import type {
  AdminMessage,
  BoardInputs,
  BoardReport,
  MessageStatus,
  ViewerCapabilities,
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
import { createBoardListController } from '../../../controllers/message-board-list-controller'
import {
  boardMessageView,
  BOARD_DEFAULT_AVATAR,
  STATUS_LABELS,
  SAFETY_LABELS,
} from '../../../presenters/message-board-presenter'
type AdminAction =
  | 'approve'
  | 'restore'
  | 'reject'
  | 'hide'
  | 'saveReply'
  | 'removeReply'
  | 'restrictAuthor'
  | 'unrestrictAuthor'
  | 'resolveReport'
type Pending = { action: AdminAction; operationId: string }
type List = ReturnType<typeof createBoardListController<AdminMessage>>
type ReportList = ReturnType<typeof createBoardListController<BoardReport>>
const statuses: MessageStatus[] = ['pending-review', 'published', 'hidden', 'rejected', 'withdrawn']
Page({
  data: {
    viewer: null as ViewerCapabilities | null,
    forbidden: false,
    loading: true,
    error: '',
    rows: [] as ReturnType<typeof boardMessageView<AdminMessage>>[],
    reports: [] as BoardReport[],
    selected: null as ReturnType<typeof boardMessageView<AdminMessage>> | null,
    serverChoices: ['全部伺服器', ...GAME_SERVERS.map((server) => server.name)],
    serverIndex: 0,
    statusChoices: statuses.map((status) => STATUS_LABELS[status]),
    statusIndex: 0,
    reason: '',
    replyText: '',
    preview: BOARD_DEFAULT_AVATAR,
    pendingAction: false,
    cursor: null as string | null,
    canPrevious: false,
    canNext: false,
    canApprove: false,
    reviewHint: '',
    replyHint: '',
    reportMode: false,
    selectedReportId: '',
  },
  list: null as List | null,
  reportList: null as ReportList | null,
  service: createMessageBoardService(),
  pending: null as Pending | null,
  serverOffset: 0,
  active: false,
  loadGeneration: 0,
  selectionGeneration: 0,
  previewFile: '',
  onLoad() {
    this.list = createBoardListController<AdminMessage>(
      async (input) => {
        try {
          return await this.service.invoke('listAdmin', input)
        } catch (error) {
          if (error instanceof MessageBoardError && error.code === 'forbidden') this.deny()
          throw error
        }
      },
      { status: 'pending-review' },
    )
    this.reportList = createBoardListController<BoardReport>(
      async (input) => {
        try {
          return await this.service.invoke(
            'listReports',
            input.cursor ? { cursor: input.cursor } : {},
          )
        } catch (error) {
          if (error instanceof MessageBoardError && error.code === 'forbidden') this.deny()
          throw error
        }
      },
      { key: (report) => report.reportId },
    )
  },
  async onShow() {
    this.active = true
    await this.onRefresh()
  },
  async onRefresh() {
    const generation = ++this.loadGeneration
    this.setData({ loading: true, error: '' })
    try {
      const viewer = await this.service.invoke('getViewer', {})
      if (!this.active || generation !== this.loadGeneration) return
      this.serverOffset = viewer.serverTime - Date.now()
      if (!viewer.isAdmin) {
        this.deny()
        return
      }
      this.setData({ viewer, forbidden: false })
      if (!this.list || !this.reportList) this.onLoad()
      if (this.data.reportMode) {
        const loading = this.reportList!.refresh()
        this.syncReports()
        await loading
        this.syncReports()
      } else if (this.list) {
        const loading = this.list.refresh()
        this.sync()
        await loading
        this.sync()
      }
    } catch (error) {
      this.handleError(error)
      this.setData({ loading: false })
    }
  },
  sync() {
    if (!this.active || !this.list || this.data.reportMode) return
    const view = this.list.view()
    this.setData({
      rows: view.items.map(boardMessageView),
      loading: view.busy,
      error: view.error,
      cursor: view.cursor,
      canPrevious: view.canPrevious,
      canNext: view.canNext,
    })
  },
  syncReports() {
    if (!this.active || !this.reportList || !this.data.reportMode) return
    const view = this.reportList.view()
    this.setData({
      reports: view.items,
      loading: view.busy,
      error: view.error,
      cursor: view.cursor,
      canPrevious: view.canPrevious,
      canNext: view.canNext,
    })
  },
  async onServer(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.detail.value)
    this.setData({ serverIndex: index })
    if (this.list) {
      const promise = this.list.selectServer(index ? GAME_SERVERS[index - 1]?.id || null : null)
      this.sync()
      await promise
      this.sync()
    }
  },
  async onStatus(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.detail.value)
    if (!statuses[index] || !this.list) return
    this.setData({ statusIndex: index })
    const promise = this.list.selectStatus(statuses[index])
    this.sync()
    await promise
    this.sync()
  },
  async onMore() {
    if (this.data.reportMode) {
      if (!this.reportList) return
      const loading = this.reportList.loadMore()
      this.syncReports()
      await loading
      this.syncReports()
      return
    }
    if (this.list) {
      const promise = this.list.loadMore()
      this.sync()
      await promise
      this.sync()
    }
  },
  async onNext() {
    if (this.data.reportMode && this.reportList) {
      await this.reportList.nextWindow()
      this.syncReports()
      return
    }
    if (this.list) {
      const promise = this.list.nextWindow()
      this.sync()
      await promise
      this.sync()
    }
  },
  async onPrevious() {
    if (this.data.reportMode && this.reportList) {
      await this.reportList.previousWindow()
      this.syncReports()
      return
    }
    if (this.list) {
      const promise = this.list.previousWindow()
      this.sync()
      await promise
      this.sync()
    }
  },
  async onToggleReports() {
    this.list?.onHide()
    this.reportList?.onHide()
    this.setData({
      reportMode: !this.data.reportMode,
      selected: null,
      selectedReportId: '',
      reports: [],
      cursor: null,
      canPrevious: false,
      canNext: false,
    })
    this.cleanPreview()
    await this.onRefresh()
  },
  async onSelect(event: WechatMiniprogram.CustomEvent) {
    if (this.pending) return
    const id = String(event.currentTarget.dataset.id || ''),
      reportId = String(event.currentTarget.dataset.report || ''),
      generation = ++this.selectionGeneration
    this.cleanPreview()
    this.setData({
      selected: null,
      reason: '',
      replyText: '',
      preview: BOARD_DEFAULT_AVATAR,
      error: '',
      selectedReportId: reportId,
    })
    try {
      const message = await this.service.invoke('loadAdmin', { messageId: id })
      if (!this.active || generation !== this.selectionGeneration) return
      this.setData({
        selected: boardMessageView(message),
        replyText: message.reply?.text || '',
        replyHint: message.replySafety ? `候選回覆：${SAFETY_LABELS[message.replySafety]}` : '',
      })
      this.updateGate()
      if (message.avatarAssetId && !message.avatarFileId && this.data.viewer) {
        const preview = await this.service.invoke('loadPrivateAvatar', {
          assetId: message.avatarAssetId,
        })
        if (this.active && generation === this.selectionGeneration) {
          this.previewFile = writeBoardPreview(
            this.data.viewer.viewerKey,
            preview.base64,
            message.avatarAssetId,
          )
          this.setData({ preview: this.previewFile })
        }
      } else if (message.avatarFileId) this.setData({ preview: message.avatarFileId })
    } catch (error) {
      this.handleError(error)
    }
  },
  updateGate() {
    const selected = this.data.selected
    const safe = selected
      ? Object.values(selected.safety).every((value) => ['pass', 'review'].includes(value))
      : false
    const canApprove =
      !!selected &&
      ['pending-review', 'hidden'].includes(selected.status) &&
      safe &&
      !selected.authorRestricted &&
      !!this.data.viewer?.review &&
      !this.pending &&
      (!selected.needsManualReview || !!this.data.reason.trim())
    const reviewHint = !selected
      ? ''
      : !this.data.viewer?.review
        ? '審核暫時關閉。'
        : selected.authorRestricted
          ? '作者目前被限制投稿，請先解除限制。'
          : !safe
            ? '安全檢查尚未完成或未通過，不可強行公開。'
            : selected.needsManualReview
              ? '平台建議人工複核，請確認內容並填寫理由後公開。'
              : ''
    this.setData({ canApprove, reviewHint })
  },
  onReason(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ reason: event.detail.value })
    this.updateGate()
  },
  onReply(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ replyText: event.detail.value })
  },
  async perform<A extends AdminAction>(action: A, input: BoardInputs[A]) {
    if (this.pending) return
    this.pending = { action, operationId: input.operationId }
    this.setData({ pendingAction: true, error: '' })
    this.updateGate()
    try {
      await this.service.invoke(action, input)
      this.pending = null
      this.setData({ pendingAction: false, selected: null })
      this.cleanPreview()
      await this.onRefresh()
    } catch (error) {
      if (
        !(error instanceof MessageBoardError) ||
        !['unconfirmed', 'protocol', 'network'].includes(error.code)
      ) {
        this.pending = null
        this.setData({ pendingAction: false })
      }
      this.handleError(error)
      this.updateGate()
    }
  },
  async onAction(event: WechatMiniprogram.CustomEvent) {
    const action = String(event.currentTarget.dataset.action || ''),
      selected = this.data.selected
    if (!selected || this.pending || !this.data.viewer?.isAdmin) return
    const target = {
      operationId: await createBoardOperationId(this.serverOffset),
      messageId: selected.messageId,
      expectedRevision: selected.revision,
    }
    const reason = this.data.reason
    if (action === 'approve' || action === 'restore') {
      if (!this.data.canApprove) return
      await this.perform(action, {
        ...target,
        ...(selected.needsManualReview ? { manualReviewReason: reason } : {}),
      })
    } else if (
      action === 'reject' ||
      action === 'hide' ||
      action === 'restrictAuthor' ||
      action === 'unrestrictAuthor'
    )
      await this.perform(action, { ...target, reason })
    else if (action === 'saveReply')
      await this.perform(action, { ...target, text: this.data.replyText })
    else if (action === 'removeReply') await this.perform(action, target)
    else if (action === 'resolveHide' || action === 'resolveKeep') {
      if (this.data.selectedReportId)
        await this.perform('resolveReport', {
          ...target,
          reportId: this.data.selectedReportId,
          outcome: action === 'resolveHide' ? 'hide' : 'keep',
          reason,
        })
    }
  },
  async onConfirm() {
    if (!this.pending) return
    try {
      const result = await this.service.invoke('getOperationResult', this.pending)
      if (result.confirmed) {
        this.pending = null
        this.setData({ pendingAction: false, selected: null, error: '' })
        this.cleanPreview()
        await this.onRefresh()
      } else this.setData({ error: '管理操作結果尚未確認，請稍後再確認。' })
    } catch (error) {
      this.handleError(error)
    }
  },
  handleError(error: unknown) {
    if (error instanceof MessageBoardError && error.code === 'forbidden') {
      this.deny()
      return
    }
    if (this.active)
      this.setData({ error: error instanceof Error ? error.message : '無法完成管理操作。' })
  },
  deny() {
    this.cleanPreview()
    this.list?.dispose()
    this.reportList?.dispose()
    this.list = null
    this.reportList = null
    this.pending = null
    this.setData({
      viewer: null,
      forbidden: true,
      loading: false,
      rows: [],
      reports: [],
      selected: null,
      pendingAction: false,
      error: '目前沒有留言板管理員權限。',
      reportMode: false,
      statusIndex: 0,
      serverIndex: 0,
      cursor: null,
      canPrevious: false,
      canNext: false,
      reason: '',
      replyText: '',
      selectedReportId: '',
    })
  },
  cleanPreview() {
    if (this.previewFile) removeBoardPreview(this.previewFile)
    this.previewFile = ''
  },
  onBoard() {
    wx.navigateBack({
      delta: 1,
      fail: () => wx.reLaunch({ url: '/subpkg-message-board/pages/board/index' }),
    })
  },
  onHide() {
    this.active = false
    this.loadGeneration++
    this.selectionGeneration++
    this.list?.onHide()
    this.reportList?.onHide()
    this.cleanPreview()
  },
  onUnload() {
    this.active = false
    this.list?.dispose()
    this.reportList?.dispose()
    this.cleanPreview()
    this.list = null
    this.reportList = null
  },
})
