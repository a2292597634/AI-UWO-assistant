import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCouponRedemptionService,
  CouponRedemptionError,
} from '../../miniprogram/runtime/coupon-redemption-service'

const mockCallFunction = vi.fn()

vi.stubGlobal('wx', {
  cloud: {
    callFunction: mockCallFunction,
  },
})

const validInput = {
  gameServerId: 'UWOGL-US-01' as const,
  userNo: '航海家',
  couponNo: 'UWO-1',
}

describe('兌換碼 Runtime service adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('只向 coupon-redemption 雲函數提交三個官方欄位', async () => {
    mockCallFunction.mockResolvedValue({
      result: { ok: true, data: { code: 'success', message: '獎勵已發送至遊戲內信箱。' } },
    })

    await createCouponRedemptionService().submit(validInput)

    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'coupon-redemption',
      data: validInput,
    })
  })

  it('將已知失敗碼轉為 typed error', async () => {
    mockCallFunction.mockResolvedValue({
      result: { ok: false, code: 'coupon-used', message: '這個兌換碼已經使用過。' },
    })

    await expect(createCouponRedemptionService().submit(validInput)).rejects.toMatchObject({
      code: 'coupon-used',
      message: '這個兌換碼已經使用過。',
    })
  })

  it('拒絕未知 success envelope，且不暴露伺服器原文', async () => {
    mockCallFunction.mockResolvedValue({
      result: { ok: true, data: { code: 'third-party-detail' } },
    })

    const error = await createCouponRedemptionService()
      .submit(validInput)
      .catch((value: unknown) => value)

    expect(error).toBeInstanceOf(CouponRedemptionError)
    expect(error).toMatchObject({ code: 'unknown' })
    expect((error as Error).message).toBe('結果未確認，請先到官方頁面確認再嘗試。')
  })

  it('把 CloudBase 連線錯誤轉成安全的 unknown error', async () => {
    mockCallFunction.mockRejectedValue(new Error('internal secret'))

    const error = await createCouponRedemptionService()
      .submit(validInput)
      .catch((value: unknown) => value)

    expect(error).toMatchObject({ code: 'unknown' })
    expect((error as Error).message).not.toContain('secret')
  })
})
