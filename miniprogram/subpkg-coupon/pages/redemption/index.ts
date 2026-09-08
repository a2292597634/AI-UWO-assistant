import {
  getServerName,
  validateCouponRedemptionInput,
  type CouponProfile,
  type CouponRedemptionResult,
} from '../../../contracts/coupon-redemption'
import {
  getCouponRedemptionService,
  CouponRedemptionError,
} from '../../../runtime/coupon-redemption-service'
import { createCouponProfileStore } from '../../../runtime/coupon-profile-store'
import { getCouponResultViewModel } from '../../../presenters/coupon-redemption-presenter'

const asProfile = (value: CouponProfile | undefined): CouponProfile | null => value ?? null

Page({
  data: {
    couponNo: '',
    activeProfile: null as CouponProfile | null,
    activeServerName: '',
    submitDisabled: true,
    isSubmitting: false,
    result: null as ReturnType<typeof getCouponResultViewModel> | null,
  },

  onLoad() {
    this.refreshProfile()
  },

  onShow() {
    this.refreshProfile()
  },

  refreshProfile() {
    const store = createCouponProfileStore(wx).load()
    const activeProfile = asProfile(
      store.profiles.find((profile) => profile.id === store.activeProfileId),
    )
    this.setData({
      activeProfile,
      activeServerName: activeProfile ? getServerName(activeProfile.gameServerId) : '',
      submitDisabled: !activeProfile || this.data.isSubmitting,
    })
  },

  onCouponInput(event: WechatMiniprogram.Input) {
    this.setData({ couponNo: event.detail.value })
  },

  onOpenSettings() {
    wx.navigateTo({ url: '/subpkg-coupon/pages/settings/index' })
  },

  async onSubmit() {
    if (this.data.isSubmitting) return

    if (!this.data.activeProfile) {
      wx.showToast({ title: '請先新增並選擇玩家設定', icon: 'none' })
      return
    }

    const input = {
      gameServerId: this.data.activeProfile.gameServerId,
      userNo: this.data.activeProfile.userNo,
      couponNo: this.data.couponNo,
    }
    const validation = validateCouponRedemptionInput(input)
    if (validation.code !== 'valid') {
      wx.showToast({ title: validation.message, icon: 'none' })
      return
    }

    this.setData({ isSubmitting: true, submitDisabled: true, result: null })
    try {
      const result = await getCouponRedemptionService().submit(input)
      this.setData({ result: getCouponResultViewModel(result) })
    } catch (error) {
      const result: CouponRedemptionResult = {
        code: 'unknown',
        message:
          error instanceof CouponRedemptionError
            ? error.message
            : '結果未確認，請先到官方頁面確認再嘗試。',
      }
      this.setData({ result: getCouponResultViewModel(result) })
    } finally {
      this.setData({ couponNo: '', isSubmitting: false })
      this.refreshProfile()
    }
  },
})
