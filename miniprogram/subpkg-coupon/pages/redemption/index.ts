import {
  COUPON_BATCH_SIZE,
  couponPlayerKey,
  getServerName,
  validateCouponRedemptionInput,
  type CouponProfile,
} from '../../../contracts/coupon-redemption'
import {
  getCouponRedemptionService,
  CouponRedemptionError,
} from '../../runtime/coupon-redemption-service'
import { createCouponProfileStore } from '../../../runtime/coupon-profile-store'
import {
  getCouponResultViewModel,
  type CouponResultViewModel,
} from '../../../presenters/coupon-redemption-presenter'

const DEFAULT_COUPON_CODE = 'ANTARIA3RD'

interface PlayerOption extends CouponProfile {
  serverName: string
  checked: boolean
}

interface PlayerResult {
  id: string
  profile: PlayerOption
  result: CouponResultViewModel | null
}

const profileIdentity = (profile: CouponProfile): string =>
  JSON.stringify([profile.id, couponPlayerKey(profile)])

const emptyResults = () => ({
  results: [] as PlayerResult[],
  completedCount: 0,
  progressPercent: 0,
  processingEnd: 0,
})

Page({
  requestVersion: 0,
  isUnloaded: false,
  activeProfileId: null as string | null,
  data: {
    couponNo: DEFAULT_COUPON_CODE,
    players: [] as PlayerOption[],
    selectedCount: 0,
    submitDisabled: true,
    isSubmitting: false,
    ...emptyResults(),
  },

  onLoad() {
    this.requestVersion = 0
    this.isUnloaded = false
    this.activeProfileId = null
    this.refreshPlayers()
  },

  onShow() {
    this.refreshPlayers()
  },

  onUnload() {
    this.isUnloaded = true
    this.requestVersion += 1
  },

  refreshPlayers() {
    const store = createCouponProfileStore(wx).load()
    const activeChanged = this.activeProfileId !== store.activeProfileId
    const previous = this.data.players
    // 歷史設定可重複，兌換清單只顯示一次，優先採用目前設定。
    const unique = new Map<string, CouponProfile>()
    for (const profile of store.profiles) {
      const key = couponPlayerKey(profile)
      if (!unique.has(key) || profile.id === store.activeProfileId) unique.set(key, profile)
    }
    const profiles = [...unique.values()]
    const changed =
      activeChanged ||
      profiles.length !== previous.length ||
      profiles.some(
        (profile, index) => profileIdentity(profile) !== profileIdentity(previous[index]!),
      )
    if (!changed) return
    this.activeProfileId = store.activeProfileId
    this.requestVersion += 1

    const previousSelection = new Set(
      previous.filter(({ checked }) => checked).map(profileIdentity),
    )
    const players = profiles.map((profile) => ({
      ...profile,
      serverName: getServerName(profile.gameServerId),
      checked: activeChanged
        ? profile.id === store.activeProfileId
        : previousSelection.has(profileIdentity(profile)) ||
          (profile.id === store.activeProfileId &&
            previous.some((old) => old.id === profile.id && old.checked)),
    }))
    this.setData({ isSubmitting: false })
    this.updateSelection(players)
  },

  updateSelection(players: PlayerOption[]) {
    const selectedCount = players.filter(({ checked }) => checked).length
    this.setData({ players, selectedCount, submitDisabled: selectedCount === 0, ...emptyResults() })
  },

  onSelectionChange(event: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    if (this.data.isSubmitting) return
    const selected = new Set(event.detail.value)
    this.updateSelection(
      this.data.players.map((profile) => ({
        ...profile,
        checked: selected.has(profile.id),
      })),
    )
  },

  onToggleAll() {
    if (this.data.isSubmitting) return
    const checked = this.data.selectedCount !== this.data.players.length
    this.updateSelection(this.data.players.map((profile) => ({ ...profile, checked })))
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
    const profiles = this.data.players.filter(({ checked }) => checked)
    if (!profiles.length) return

    const couponNo = this.data.couponNo
    const validation = validateCouponRedemptionInput({ ...profiles[0], couponNo })
    if (validation.code !== 'valid') {
      wx.showToast({ title: validation.message, icon: 'none' })
      return
    }

    const requestVersion = ++this.requestVersion
    const isCurrent = () => !this.isUnloaded && requestVersion === this.requestVersion
    const results: PlayerResult[] = profiles.map((profile) => ({
      id: profile.id,
      profile,
      result: null,
    }))
    this.setData({
      ...emptyResults(),
      results: [...results],
      processingEnd: COUPON_BATCH_SIZE,
      isSubmitting: true,
      submitDisabled: true,
    })

    const service = getCouponRedemptionService()
    for (let index = 0; index < profiles.length; index += COUPON_BATCH_SIZE) {
      const players = profiles.slice(index, index + COUPON_BATCH_SIZE)
      try {
        const replies =
          profiles.length === 1
            ? [await service.submit({ ...players[0]!, couponNo })]
            : await service.submitBatch(players, couponNo)
        replies.forEach((reply, offset) => {
          const profile = players[offset]!
          results[index + offset] = {
            id: profile.id,
            profile,
            result: getCouponResultViewModel(reply),
          }
        })
      } catch (error) {
        const result = getCouponResultViewModel(
          error instanceof CouponRedemptionError
            ? error
            : { code: 'unknown', message: '結果未確認，請先到官方頁面確認再嘗試。' },
        )
        players.forEach((profile, offset) => {
          results[index + offset] = { id: profile.id, profile, result }
        })
      }
      if (!isCurrent()) return
      const completedCount = index + players.length
      const isSubmitting = completedCount < profiles.length
      this.setData({
        results: [...results],
        completedCount,
        processingEnd: completedCount + COUPON_BATCH_SIZE,
        progressPercent: Math.round((completedCount * 100) / profiles.length),
        isSubmitting,
        submitDisabled: isSubmitting,
        ...(isSubmitting ? {} : { couponNo: '' }),
      })
    }
  },
})
