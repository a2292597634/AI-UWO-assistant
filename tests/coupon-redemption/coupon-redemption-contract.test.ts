import { describe, expect, it } from 'vitest'
import {
  GAME_SERVERS,
  normalizeCouponCode,
  validateCouponRedemptionInput,
} from '../../miniprogram/contracts/coupon-redemption'

describe('兌換碼資料契約', () => {
  it('保留官方九個伺服器的順序與識別值', () => {
    expect(GAME_SERVERS.map(({ id }) => id)).toEqual([
      'UWOGL-JP-02',
      'UWOGL-JP-03',
      'UWO-KR-14',
      'UWO-KR-13',
      'UWO-KR-01',
      'UWO-KR-04',
      'UWO-KR-10',
      'UWOGL-US-01',
      'UWOGL-US-02',
    ])
  })

  it('修剪兌換碼並拒絕空值與超過 50 個字元', () => {
    expect(normalizeCouponCode(' UWO-1 ')).toBe('UWO-1')
    expect(
      validateCouponRedemptionInput({
        gameServerId: 'UWOGL-US-01',
        userNo: '航海家',
        couponNo: '',
      }).code,
    ).toBe('coupon-required')
    expect(
      validateCouponRedemptionInput({
        gameServerId: 'UWOGL-US-01',
        userNo: '航海家',
        couponNo: 'x'.repeat(51),
      }).code,
    ).toBe('coupon-too-long')
  })
})
