import catalog from '../generated/game-servers'

export const GAME_SERVERS = catalog.servers

export type GameServerId = (typeof GAME_SERVERS)[number]['id']

export const MAX_COUPON_PROFILES = 10
export const MAX_COUPON_CODE_LENGTH = 50
export const MAX_COUPON_USER_NAME_LENGTH = 100
export const COUPON_PROFILE_STORAGE_KEY = 'coupon_profiles_v1'

export interface CouponProfileInput {
  gameServerId: GameServerId
  userNo: string
}

export interface CouponProfile extends CouponProfileInput {
  id: string
  name: string
}

export interface CouponProfileStore {
  profiles: CouponProfile[]
  activeProfileId: string | null
}

export interface CouponRedemptionInput {
  gameServerId: GameServerId
  userNo: string
  couponNo: string
}

export type CouponValidationCode =
  | 'valid'
  | 'profile-required'
  | 'server-invalid'
  | 'user-required'
  | 'coupon-required'
  | 'coupon-too-long'

export interface CouponValidationResult {
  code: CouponValidationCode
  message: string
}

export type CouponRedemptionCode =
  | 'success'
  | 'user-invalid'
  | 'coupon-invalid'
  | 'coupon-used'
  | 'coupon-expired'
  | 'coupon-group-used'
  | 'rate-limited'
  | 'server-unavailable'
  | 'maintenance'
  | 'retry-later'
  | 'unknown'

export interface CouponRedemptionResult {
  code: CouponRedemptionCode
  message: string
}

export type CouponRedemptionServiceCode =
  CouponRedemptionCode | Exclude<CouponValidationCode, 'valid'>

const serverIds = new Set<string>(GAME_SERVERS.map(({ id }) => id))

export const normalizeCouponCode = (value: string): string => value.trim()

export const validateCouponRedemptionInput = (
  value: Partial<CouponRedemptionInput> | null | undefined,
): CouponValidationResult => {
  if (!value || !serverIds.has(value.gameServerId ?? '')) {
    return { code: 'server-invalid', message: '請選擇有效的伺服器。' }
  }

  if (typeof value.userNo !== 'string' || value.userNo.trim().length === 0) {
    return { code: 'user-required', message: '請輸入遊戲內暱稱。' }
  }

  const couponNo = typeof value.couponNo === 'string' ? normalizeCouponCode(value.couponNo) : ''
  if (couponNo.length === 0) {
    return { code: 'coupon-required', message: '請輸入兌換碼。' }
  }

  if ([...couponNo].length > MAX_COUPON_CODE_LENGTH) {
    return { code: 'coupon-too-long', message: '兌換碼長度不正確。' }
  }

  return { code: 'valid', message: '' }
}

export const getServerName = (id: GameServerId): string =>
  GAME_SERVERS.find((server) => server.id === id)?.name ?? id
