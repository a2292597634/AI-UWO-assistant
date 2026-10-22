import { GAME_SERVERS } from '../../../contracts/coupon-redemption'
import type { BoardProfile, ViewerCapabilities } from '../../../contracts/message-board'
import { createMessageBoardService } from '../../../runtime/message-board-service'
import {
  createBoardOperationId,
  prepareBoardAvatar,
  readBoardPrivacy,
  openBoardPrivacy,
  writeBoardPreview,
  removeBoardPreview,
} from '../../../runtime/message-board-platform'
import { createComposeController } from '../../../controllers/message-board-compose-controller'
import { createBoardDraftStore } from '../../../domain/message-board/draft-store'
import { BOARD_DEFAULT_AVATAR } from '../../../presenters/message-board-presenter'
type Controller = ReturnType<typeof createComposeController>
Page({
  data: {
    loading: true,
    error: '',
    body: '',
    nickname: '',
    phase: 'idle',
    characterCount: 0,
    serverIndex: 0,
    serverNames: ['請選擇伺服器', ...GAME_SERVERS.map((server) => server.name)],
    privacyReady: false,
    chooseAvatarSupported: false,
    nicknameSupported: false,
    avatarSrc: BOARD_DEFAULT_AVATAR,
    viewer: null as ViewerCapabilities | null,
    submitDisabled: true,
    blockedReason: '正在連接留言服務。',
    profile: null as BoardProfile | null,
    profileOnly: false,
    pendingExpired: false,
    recoveryReviewed: false,
    retryDisabled: true,
  },
  controller: null as Controller | null,
  service: createMessageBoardService(),
  previewFile: '',
  visible: false,
  loadGeneration: 0,
  serverOffset: 0,
  onLoad(options: Record<string, string>) {
    this.setData({ profileOnly: options.mode === 'profile' })
  },
  async onShow() {
    this.visible = true
    await this.initialize()
  },
  async initialize() {
    const generation = ++this.loadGeneration
    this.setData({ loading: true, error: '' })
    try {
      const viewer = await this.service.invoke('getViewer', {}),
        privacyReady = await readBoardPrivacy()
      if (!this.visible || generation !== this.loadGeneration) return
      this.serverOffset = viewer.serverTime - Date.now()
      if (
        !this.controller ||
        this.data.viewer?.viewerKey !== viewer.viewerKey ||
        this.data.viewer.clearVersion !== viewer.clearVersion
      ) {
        const cleared =
          this.data.viewer?.viewerKey === viewer.viewerKey &&
          this.data.viewer.clearVersion !== viewer.clearVersion
        this.controller?.dispose()
        if (this.previewFile) removeBoardPreview(this.previewFile)
        this.previewFile = ''
        const profile = await this.service.invoke('getProfile', {})
        if (!this.visible || generation !== this.loadGeneration) return
        const draft = createBoardDraftStore(
          {
            get: (key) => wx.getStorageSync(key),
            set: (key, value) => wx.setStorageSync(key, value),
            remove: (key) => wx.removeStorageSync(key),
          },
          viewer.viewerKey,
        )
        if (cleared) draft.clear()
        this.controller = createComposeController({
          service: this.service,
          operationId: () => createBoardOperationId(this.serverOffset),
          prepareAvatar: prepareBoardAvatar,
          draft,
          profile,
          now: () => Date.now() + this.serverOffset,
        })
        this.setData({ profile })
      }
      this.setData({
        viewer,
        privacyReady,
        loading: false,
        chooseAvatarSupported: wx.canIUse('button.open-type.chooseAvatar'),
        nicknameSupported: wx.canIUse('input.type.nickname'),
      })
      if (privacyReady) await this.loadProfileAvatar()
      this.sync()
    } catch (error) {
      if (this.visible)
        this.setData({
          loading: false,
          error: error instanceof Error ? error.message : '無法載入留言資料。',
          submitDisabled: true,
          blockedReason: '留言資料尚未載入，請重試。',
        })
    }
  },
  async loadProfileAvatar() {
    if (
      !this.data.profile?.avatarAssetId ||
      !this.data.viewer ||
      this.previewFile ||
      this.controller?.view().avatarAssetId !== this.data.profile.avatarAssetId
    )
      return
    try {
      const preview = await this.service.invoke('loadPrivateAvatar', {
        assetId: this.data.profile.avatarAssetId,
      })
      if (this.visible)
        this.previewFile = writeBoardPreview(this.data.viewer.viewerKey, preview.base64)
    } catch {
      /* 可繼續使用預設頭像或重新選擇。 */
    }
  },
  sync() {
    if (!this.controller || !this.visible) return
    const view = this.controller.view(),
      viewer = this.data.viewer
    const profile = this.controller.currentProfile()
    if (this.data.profile?.avatarAssetId !== profile?.avatarAssetId) {
      if (this.previewFile) removeBoardPreview(this.previewFile)
      this.previewFile = ''
    }
    const busy = view.phase === 'busy',
      pending = view.phase === 'unconfirmed'
    const blockedReason = !viewer
      ? '尚未確認微信身分。'
      : viewer.clearing
        ? '留言資料正在清除。'
        : viewer.restricted
          ? '目前暫停你的新投稿。'
          : !viewer.write
            ? '留言投稿暫時關閉。'
            : !this.data.privacyReady
              ? '請先閱讀並同意隱私指引，才會上傳留言資料。'
              : pending
                ? '先確認原提交結果，避免重複留言。'
                : busy
                  ? '正在提交，請稍候。'
                  : ''
    this.setData({
      body: view.body,
      profile,
      nickname: view.nickname,
      phase: view.phase,
      error: view.error,
      characterCount: view.characterCount,
      serverIndex: view.server
        ? GAME_SERVERS.findIndex((server) => server.id === view.server) + 1
        : 0,
      avatarSrc: view.avatarPath || this.previewFile || BOARD_DEFAULT_AVATAR,
      submitDisabled: !!blockedReason,
      blockedReason,
      pendingExpired: view.pendingExpired,
      recoveryReviewed: view.recoveryReviewed,
      retryDisabled:
        busy ||
        !viewer ||
        !viewer.write ||
        viewer.restricted ||
        viewer.clearing ||
        !this.data.privacyReady,
    })
  },
  onServerChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.detail.value)
    if (index > 0) this.controller?.selectServer(GAME_SERVERS[index - 1]?.id || '')
    this.sync()
  },
  onNicknameInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.controller?.setNickname(event.detail.value)
    this.sync()
  },
  onBodyInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.controller?.setBody(event.detail.value)
    this.sync()
  },
  onAvatarChoose(event: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
    if (!this.data.privacyReady || !event.detail.avatarUrl) return
    this.controller?.selectAvatar(event.detail.avatarUrl)
    this.sync()
  },
  onDefaultAvatar() {
    if (this.previewFile) removeBoardPreview(this.previewFile)
    this.previewFile = ''
    this.controller?.useDefaultAvatar()
    this.sync()
  },
  onPrivacy() {
    openBoardPrivacy()
  },
  async onAgreePrivacy() {
    try {
      this.setData({ privacyReady: await readBoardPrivacy() })
      if (this.data.privacyReady) await this.loadProfileAvatar()
      this.sync()
    } catch {
      this.setData({ error: '尚未完成微信隱私授權，請重試。' })
    }
  },
  async onSubmit(event: WechatMiniprogram.CustomEvent<{ value: Record<string, string> }>) {
    if (!this.controller || this.data.submitDisabled) return
    const values = event.detail.value
    if (!this.data.profileOnly)
      this.controller.setBody(typeof values.body === 'string' ? values.body : '')
    const form = { nickname: typeof values.nickname === 'string' ? values.nickname : '' }
    const submission = this.data.profileOnly
      ? this.controller.saveProfileOnly(form)
      : this.controller.submitForm(form)
    this.sync()
    await submission
    this.sync()
    if (this.data.privacyReady) {
      await this.loadProfileAvatar()
      this.sync()
    }
  },
  async onConfirm() {
    if (!this.controller) return
    const promise = this.controller.confirmPendingOperation()
    this.sync()
    await promise
    this.sync()
  },
  async onRetryOriginal() {
    if (!this.controller || this.data.retryDisabled) return
    const promise = this.controller.retryPendingOperation()
    this.sync()
    await promise
    this.sync()
  },
  async onReviewExpired() {
    if (!this.controller) return
    const promise = this.controller.reviewExpiredOperation()
    this.sync()
    const reviewed = await promise
    this.sync()
    if (reviewed && this.visible) this.onMine()
  },
  async onRestoreExpired() {
    if (!this.controller || !this.data.recoveryReviewed) return
    const result = await wx.showModal({
      title: '恢復正文草稿',
      content:
        '我已核對「我的留言」及留言資料。放棄原操作只會解除待確認狀態，不會刪除可能已送達的留言。恢復後不會自動重新投稿。',
      confirmText: '確認恢復',
      cancelText: '繼續核對',
    })
    if (result.confirm && this.visible) this.controller.restoreExpiredDraft()
    this.sync()
  },
  onMine() {
    wx.navigateTo({ url: '/subpkg-message-board/pages/mine/index' })
  },
  onHide() {
    this.visible = false
    this.loadGeneration++
    if (this.previewFile) removeBoardPreview(this.previewFile)
    this.previewFile = ''
  },
  onUnload() {
    this.visible = false
    this.controller?.dispose()
    this.controller = null
    if (this.previewFile) removeBoardPreview(this.previewFile)
    this.previewFile = ''
  },
})
