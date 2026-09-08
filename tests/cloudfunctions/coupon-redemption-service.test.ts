import { describe, expect, it, vi } from 'vitest'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  createCouponRedemptionService,
} = require('../../cloudfunctions/coupon-redemption/coupon-redemption-service')

const validInput = {
  gameServerId: 'UWOGL-US-01',
  userNo: '航海家',
  couponNo: 'UWO-1',
}

const createRateLimiter = () => {
  const keys = new Set()
  return {
    isLimited(key: string) {
      return keys.has(key)
    },
    mark(key: string) {
      keys.add(key)
    },
  }
}

const createService = (response: unknown) => {
  const client = { redeem: vi.fn().mockResolvedValue(response) }
  return {
    client,
    service: createCouponRedemptionService({
      client,
      rateLimiter: createRateLimiter(),
      now: () => 1000,
    }),
  }
}

describe('兌換碼雲函數服務', () => {
  it('拒絕未知伺服器且不呼叫官方 client', async () => {
    const { client, service } = createService({
      kind: 'response',
      statusCode: 200,
      body: JSON.stringify({ isSuccess: true }),
    })

    const result = await service.dispatch({ ...validInput, gameServerId: 'forged' }, 'caller-a')

    expect(result).toMatchObject({ ok: false, code: 'server-invalid' })
    expect(client.redeem).not.toHaveBeenCalled()
  })

  it('同一來源在冷卻時間內只允許一次提交', async () => {
    const { service } = createService({
      kind: 'response',
      statusCode: 200,
      body: JSON.stringify({ isSuccess: true }),
    })

    await service.dispatch(validInput, 'caller-a')
    await expect(service.dispatch(validInput, 'caller-a')).resolves.toMatchObject({
      ok: false,
      code: 'rate-limited',
    })
  })

  it('將官方成功回應映射為 success', async () => {
    const { service } = createService({
      kind: 'response',
      statusCode: 200,
      body: JSON.stringify({ isSuccess: true }),
    })

    await expect(service.dispatch(validInput, 'caller-a')).resolves.toMatchObject({
      ok: true,
      data: { code: 'success', message: '獎勵已發送至遊戲內信箱。' },
    })
  })

  it.each([
    ['NOT_EXIST_USER', 'user-invalid'],
    ['NOT_EXIST_COUPON', 'coupon-invalid'],
    ['ALREADY_USE_COUPON', 'coupon-used'],
    ['EXPIRED_COUPON', 'coupon-expired'],
    ['ALREADY_USE_COUPON_SAME_GROUP', 'coupon-group-used'],
    ['FAIL_MAX_TRY_OVER', 'rate-limited'],
    ['UNAVAILABLE_GAME_SERVER', 'server-unavailable'],
    ['GAME_UNDER_INSPECTION', 'maintenance'],
  ])('將官方 %s 映射為 %s', async (errorCdStr, expectedCode) => {
    const { service } = createService({
      kind: 'response',
      statusCode: 200,
      body: JSON.stringify({ isSuccess: false, errorCdStr }),
    })

    await expect(service.dispatch(validInput, `caller-${errorCdStr}`)).resolves.toMatchObject({
      ok: false,
      code: expectedCode,
    })
  })

  it('未知官方回應不回傳暱稱、兌換碼或原始 body', async () => {
    const { service } = createService({
      kind: 'response',
      statusCode: 200,
      body: JSON.stringify({ isSuccess: false, errorCdStr: 'UNKNOWN', msg: 'third-party-detail' }),
    })

    const result = await service.dispatch(validInput, 'caller-a')

    expect(JSON.stringify(result)).not.toContain(validInput.couponNo)
    expect(JSON.stringify(result)).not.toContain(validInput.userNo)
    expect(JSON.stringify(result)).not.toContain('third-party-detail')
  })
})
