import {
  GAME_SERVERS,
  getServerName,
  type CouponProfileInput,
} from '../../../contracts/coupon-redemption'
import { createCouponProfileStore } from '../../../runtime/coupon-profile-store'
import {
  buildCouponSettingsViewModel,
  type CouponSettingsProfileViewModel,
} from '../../../presenters/coupon-redemption-presenter'

const emptyForm = (): CouponProfileInput => ({
  name: '',
  gameServerId: GAME_SERVERS[0].id,
  userNo: '',
})

Page({
  data: {
    gameServers: GAME_SERVERS,
    profiles: [] as CouponSettingsProfileViewModel[],
    form: emptyForm(),
    gameServerName: getServerName(GAME_SERVERS[0].id),
    gameServerIndex: 0,
    editingId: null as string | null,
    deleteTargetId: null as string | null,
    deleteTargetName: '',
    isEmpty: true,
  },

  onLoad() {
    this.refresh()
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const viewModel = buildCouponSettingsViewModel(createCouponProfileStore(wx).load())
    this.setData({
      profiles: viewModel.profiles,
      isEmpty: viewModel.isEmpty,
    })
  },

  onAddProfile() {
    this.setData({
      form: emptyForm(),
      editingId: null,
      gameServerName: getServerName(GAME_SERVERS[0].id),
      gameServerIndex: 0,
    })
  },

  onEditProfile(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.id
    if (typeof id !== 'string') return
    const profile = createCouponProfileStore(wx)
      .load()
      .profiles.find((item) => item.id === id)
    if (!profile) return
    this.setData({
      editingId: id,
      form: {
        name: profile.name,
        gameServerId: profile.gameServerId,
        userNo: profile.userNo,
      },
      gameServerName: getServerName(profile.gameServerId),
      gameServerIndex: GAME_SERVERS.findIndex((server) => server.id === profile.gameServerId),
    })
  },

  onNameInput(event: WechatMiniprogram.Input) {
    this.setData({ 'form.name': event.detail.value })
  },

  onServerChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    const server = GAME_SERVERS[index]
    if (!server) return
    this.setData({
      'form.gameServerId': server.id,
      gameServerName: server.name,
      gameServerIndex: index,
    })
  },

  onUserNoInput(event: WechatMiniprogram.Input) {
    this.setData({ 'form.userNo': event.detail.value })
  },

  onSaveProfile() {
    const store = createCouponProfileStore(wx)
    try {
      if (this.data.editingId) {
        store.updateProfile(this.data.editingId, this.data.form)
      } else {
        store.saveProfile(this.data.form)
      }
      wx.showToast({ title: '設定已保存', icon: 'success' })
      this.setData({
        editingId: null,
        form: emptyForm(),
        gameServerName: getServerName(GAME_SERVERS[0].id),
        gameServerIndex: 0,
      })
      this.refresh()
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '設定無法保存',
        icon: 'none',
      })
    }
  },

  onUseProfile(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.id
    if (typeof id !== 'string') return
    try {
      createCouponProfileStore(wx).setActiveProfile(id)
      wx.navigateBack()
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '設定無法使用',
        icon: 'none',
      })
    }
  },

  onRequestDeleteProfile(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.id
    if (typeof id !== 'string') return
    const profile = createCouponProfileStore(wx)
      .load()
      .profiles.find((item) => item.id === id)
    if (!profile) return
    this.setData({ deleteTargetId: id, deleteTargetName: profile.name })
  },

  onCancelDeleteProfile() {
    this.setData({ deleteTargetId: null, deleteTargetName: '' })
  },

  onConfirmDeleteProfile() {
    if (!this.data.deleteTargetId) return
    try {
      createCouponProfileStore(wx).deleteProfile(this.data.deleteTargetId)
      wx.showToast({ title: '設定已刪除', icon: 'success' })
      this.setData({ deleteTargetId: null, deleteTargetName: '' })
      this.refresh()
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '設定無法刪除',
        icon: 'none',
      })
    }
  },
})
