import {
  getServerName,
  type CouponProfileStore,
  type CouponRedemptionResult,
} from '../contracts/coupon-redemption'

export interface CouponSettingsProfileViewModel {
  id: string
  name: string
  serverName: string
  userNo: string
  isActive: boolean
}

export interface CouponSettingsViewModel {
  profiles: CouponSettingsProfileViewModel[]
  activeProfileId: string | null
  isEmpty: boolean
  emptyMessage: string
}

export interface CouponResultViewModel {
  statusClass: 'ui-status--achieved' | 'ui-status--error' | 'ui-status--review'
  label: string
  message: string
}

export const buildCouponSettingsViewModel = (
  store: CouponProfileStore,
): CouponSettingsViewModel => ({
  profiles: store.profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    serverName: getServerName(profile.gameServerId),
    userNo: profile.userNo,
    isActive: profile.id === store.activeProfileId,
  })),
  activeProfileId: store.activeProfileId,
  isEmpty: store.profiles.length === 0,
  emptyMessage: '尚未新增玩家設定',
})

export const getCouponResultViewModel = (result: CouponRedemptionResult): CouponResultViewModel => {
  if (result.code === 'success') {
    return {
      statusClass: 'ui-status--achieved',
      label: '兌換成功',
      message: result.message,
    }
  }

  if (result.code === 'unknown') {
    return {
      statusClass: 'ui-status--review',
      label: '需復核',
      message: result.message,
    }
  }

  return {
    statusClass: 'ui-status--error',
    label: '兌換失敗',
    message: result.message,
  }
}
