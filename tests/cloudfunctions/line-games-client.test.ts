import { describe, expect, it, vi } from 'vitest'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  createLineGamesClient,
} = require('../../cloudfunctions/coupon-redemption/line-games-client')

const validInput = {
  gameServerId: 'UWOGL-US-01',
  userNo: '航海家',
  couponNo: 'UWO-1',
}

describe('LINE Games 兌換 HTTP client', () => {
  it('以 URL encoded POST、官方 endpoint 與 Referer 提交', async () => {
    const request = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ isSuccess: true }),
    })

    await createLineGamesClient({ request, timeoutMs: 3000 }).redeem(validInput)

    const [options] = request.mock.calls[0]
    expect(options).toMatchObject({
      method: 'POST',
      hostname: 'coupon-front.line.games',
      path: '/sbc/UWOGL/useGameCoupon',
      headers: expect.objectContaining({
        referer: 'https://coupon-front.line.games/sbc/UWOGL',
        'content-type': 'application/x-www-form-urlencoded',
      }),
    })
    expect(new URLSearchParams(options.body)).toEqual(
      new URLSearchParams({
        gameServerId: 'UWOGL-US-01',
        userNo: '航海家',
        couponNo: 'UWO-1',
        os: '',
        appStoreCd: '',
      }),
    )
  })

  it('逾時時只請求一次並回傳 timeout', async () => {
    const request = vi.fn().mockResolvedValue({ kind: 'timeout' })

    await expect(
      createLineGamesClient({ request, timeoutMs: 3000 }).redeem(validInput),
    ).resolves.toEqual({ kind: 'timeout' })
    expect(request).toHaveBeenCalledTimes(1)
  })
})
