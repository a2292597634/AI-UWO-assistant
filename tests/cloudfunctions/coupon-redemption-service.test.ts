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
  const batch = (...names: string[]) => ({
    action: 'redeemBatch',
    couponNo: ' UWO-1 ',
    players: names.map((userNo) => ({ gameServerId: validInput.gameServerId, userNo })),
  })

  it('依輸入順序回傳同一批次的成功與未確認結果', async () => {
    const { client, service } = createService({ kind: 'timeout' })
    client.redeem.mockResolvedValueOnce({
      kind: 'response',
      statusCode: 200,
      body: JSON.stringify({ isSuccess: true }),
    })
    await expect(
      service.dispatch(batch('  玩家甲  ', '玩家乙'), 'caller-a', true),
    ).resolves.toMatchObject({
      ok: true,
      data: [{ code: 'success' }, { code: 'unknown' }],
    })
    expect(client.redeem).toHaveBeenNthCalledWith(1, { ...validInput, userNo: '玩家甲' })
    expect(client.redeem).toHaveBeenCalledTimes(2)
  })

  it('限制每小批大小、拒絕重複玩家，並只接受新端身分', async () => {
    const { client, service } = createService({ kind: 'timeout' })
    for (const input of [batch(), batch('甲', '乙', '丙'), batch('甲', ' 甲 ')]) {
      await expect(service.dispatch(input, 'caller-a', true)).resolves.toMatchObject({
        ok: false,
        code: 'batch-invalid',
      })
    }
    await expect(service.dispatch(batch('甲'), 'caller-a')).resolves.toMatchObject({
      ok: false,
      code: 'batch-unavailable',
    })
    expect(client.redeem).not.toHaveBeenCalled()
  })

  it('單一來源每分鐘最多兌換 20 位且同一玩家只送出一次', async () => {
    const { client, service } = createService({ kind: 'timeout' })
    await service.dispatch(batch('玩家0', '玩家1'), 'caller-a', true)
    await expect(
      service.dispatch(batch('玩家1', '玩家2'), 'caller-a', true),
    ).resolves.toMatchObject({ ok: true, data: [{ code: 'rate-limited' }, { code: 'unknown' }] })
    for (let index = 3; index < 20; index += 1) {
      await service.dispatch(batch(`玩家${index}`), 'caller-a', true)
    }
    await expect(service.dispatch(batch('超額'), 'caller-a', true)).resolves.toMatchObject({
      ok: true,
      data: [{ code: 'rate-limited' }],
    })
    expect(client.redeem).toHaveBeenCalledTimes(20)
  })

  it('新端單選與批次共享同一玩家的冷卻時間', async () => {
    const { client, service } = createService({ kind: 'timeout' })
    await service.dispatch(validInput, 'caller-a', true)
    await expect(
      service.dispatch(batch(validInput.userNo), 'caller-a', true),
    ).resolves.toMatchObject({ ok: true, data: [{ code: 'rate-limited' }] })
    await service.dispatch(batch(validInput.userNo), 'caller-b', true)
    await expect(service.dispatch(validInput, 'caller-b', true)).resolves.toMatchObject({
      ok: false,
      code: 'rate-limited',
    })
    expect(client.redeem).toHaveBeenCalledTimes(2)
  })

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
