import {
  getServerName,
  validateCouponRedemptionInput,
  type CouponProfile,
  type CouponRedemptionServiceCode,
} from '../../../contracts/coupon-redemption'
import {
  getCouponRedemptionService,
  CouponRedemptionError,
} from '../../../runtime/coupon-redemption-service'
import { createCouponProfileStore } from '../../../runtime/coupon-profile-store'
import { getCouponResultViewModel } from '../../../presenters/coupon-redemption-presenter'

const DEFAULT_COUPON_CODE = 'FULLMOON2026'

const asProfile = (value: CouponProfile | undefined): CouponProfile | null => value ?? null
const profileIdentity = (profile: CouponProfile | null): string =>
  profile ? JSON.stringify([profile.id, profile.name, profile.gameServerId, profile.userNo]) : ''

Page({
  requestVersion: 0,
  isUnloaded: false,
  data: {
    couponNo: DEFAULT_COUPON_CODE,
    activeProfile: null as CouponProfile | null,
    activeServerName: '',
    submitDisabled: true,
    isSubmitting: false,
    result: null as ReturnType<typeof getCouponResultViewModel> | null,
    resultProfile: null as CouponProfile | null,
    resultServerName: '',
  },

  onLoad() {
    this.requestVersion = 0
    this.isUnloaded = false
    this.refreshProfile()
  },

  onShow() {
    this.refreshProfile()
  },

  onUnload() {
    this.isUnloaded = true
    this.requestVersion += 1
  },

  refreshProfile() {
    const store = createCouponProfileStore(wx).load()
    const activeProfile = asProfile(
      store.profiles.find((profile) => profile.id === store.activeProfileId),
    )
    const changed = profileIdentity(activeProfile) !== profileIdentity(this.data.activeProfile)
    if (changed) this.requestVersion += 1
    const isSubmitting = changed ? false : this.data.isSubmitting
    this.setData({
      activeProfile,
      activeServerName: activeProfile ? getServerName(activeProfile.gameServerId) : '',
      submitDisabled: !activeProfile || isSubmitting,
      ...(changed ? { result: null, resultProfile: null, resultServerName: '', isSubmitting } : {}),
    })
  },

  onCouponInput(event: WechatMiniprogram.Input) {
    if (this.data.isSubmitting) return
    this.setData({ couponNo: event.detail.value })
  },

  onOpenSettings() {
    if (this.data.isSubmitting) return
    wx.navigateTo({ url: '/subpkg-coupon/pages/settings/index' })
  },

  async onSubmit() {
    if (this.data.isSubmitting) return

    if (!this.data.activeProfile) {
      wx.showToast({ title: '請先新增並選擇玩家設定', icon: 'none' })
      return
    }

    const resultProfile = { ...this.data.activeProfile }
    const input = {
      gameServerId: resultProfile.gameServerId,
      userNo: resultProfile.userNo,
      couponNo: this.data.couponNo,
    }
    const validation = validateCouponRedemptionInput(input)
    if (validation.code !== 'valid') {
      wx.showToast({ title: validation.message, icon: 'none' })
      return
    }

    const requestVersion = ++this.requestVersion
    const isCurrent = () =>
      !this.isUnloaded &&
      requestVersion === this.requestVersion &&
      profileIdentity(resultProfile) === profileIdentity(this.data.activeProfile)
    this.setData({
      isSubmitting: true,
      submitDisabled: true,
      result: null,
      resultProfile: null,
      resultServerName: '',
    })
    try {
      const result = await getCouponRedemptionService().submit(input)
      if (!isCurrent()) return
      this.setData({
        result: getCouponResultViewModel(result),
        resultProfile,
        resultServerName: getServerName(resultProfile.gameServerId),
      })
    } catch (error) {
      if (!isCurrent()) return
      const result: { code: CouponRedemptionServiceCode; message: string } =
        error instanceof CouponRedemptionError
          ? { code: error.code, message: error.message }
          : { code: 'unknown', message: '結果未確認，請先到官方頁面確認再嘗試。' }
      this.setData({
        result: getCouponResultViewModel(result),
        resultProfile,
        resultServerName: getServerName(resultProfile.gameServerId),
      })
    } finally {
      if (isCurrent()) {
        this.setData({ couponNo: '', isSubmitting: false })
        this.refreshProfile()
      }
    }
  },
})
