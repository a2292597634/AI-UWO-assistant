import { describe, expect, it, vi } from 'vitest'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  createLineGamesClient,
  requestHttps,
} = require('../../cloudfunctions/coupon-redemption/line-games-client')

const validInput = {
  gameServerId: 'UWOGL-US-01',
  userNo: '航海家',
  couponNo: 'UWO-1',
}

describe('LINE Games 兌換 HTTP client', () => {
  it('HTTP 請求使用絕對 timeout，而非只限制 socket 閒置時間', async () => {
    vi.useFakeTimers()
    const handlers = new Map<string, () => void>()
    const request = {
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler)
        return request
      }),
      setTimeout: vi.fn(),
      destroy: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    }
    const requestFactory = vi.fn(() => request as never)

    try {
      const pending = requestHttps(
        {
          method: 'GET',
          hostname: 'coupon-front.line.games',
          path: '/sbc/UWOGL',
          timeoutMs: 1000,
        },
        requestFactory,
      )
      await vi.advanceTimersByTimeAsync(1000)

      await expect(pending).resolves.toEqual({ kind: 'timeout' })
      expect(request.destroy).toHaveBeenCalledTimes(1)
      expect(handlers.has('error')).toBe(true)
      expect(requestFactory).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('以 URL encoded POST、官方 endpoint 與 Referer 提交', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        kind: 'response',
        statusCode: 200,
        headers: { 'set-cookie': ['JSESSIONID=session-123; Path=/; HttpOnly'] },
        body: '',
      })
      .mockResolvedValueOnce({
        kind: 'response',
        statusCode: 200,
        body: JSON.stringify({ isSuccess: true }),
      })

    const result = await createLineGamesClient({ request, timeoutMs: 3000 }).redeem(validInput)

    const [options] = request.mock.calls[1]
    expect(result).toMatchObject({ kind: 'response', statusCode: 200 })
    expect(options).toMatchObject({
      method: 'POST',
      hostname: 'coupon-front.line.games',
      path: '/sbc/UWOGL/useGameCoupon',
      headers: expect.objectContaining({
        referer: 'https://coupon-front.line.games/sbc/UWOGL',
        accept: 'application/json, text/javascript, */*; q=0.01',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        origin: 'https://coupon-front.line.games',
        'user-agent': expect.stringContaining('Mozilla/5.0'),
        'x-requested-with': 'XMLHttpRequest',
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

  it('先建立官方頁面 session，再將 Set-Cookie 帶入兌換請求', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        kind: 'response',
        statusCode: 200,
        headers: { 'set-cookie': ['JSESSIONID=session-123; Path=/; HttpOnly'] },
        body: '',
      })
      .mockResolvedValueOnce({
        kind: 'response',
        statusCode: 200,
        body: JSON.stringify({ isSuccess: true }),
      })

    const result = await createLineGamesClient({ request, timeoutMs: 3000 }).redeem(validInput)

    expect(request).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ kind: 'response', statusCode: 200 })
    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'GET',
      hostname: 'coupon-front.line.games',
      path: '/sbc/UWOGL',
      headers: expect.objectContaining({
        'user-agent': expect.stringContaining('Mozilla/5.0'),
      }),
    })
    expect(request.mock.calls[1][0]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ cookie: 'JSESSIONID=session-123' }),
    })
  })

  it('官方頁面沒有建立 session 時不提交兌換碼', async () => {
    const request = vi.fn().mockResolvedValueOnce({
      kind: 'response',
      statusCode: 200,
      headers: {},
      body: '',
    })

    await expect(
      createLineGamesClient({ request, timeoutMs: 3000 }).redeem(validInput),
    ).resolves.toEqual({ kind: 'network' })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('POST 逾時時回傳 timeout', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        kind: 'response',
        statusCode: 200,
        headers: { 'set-cookie': ['JSESSIONID=session-123; Path=/; HttpOnly'] },
        body: '',
      })
      .mockResolvedValueOnce({ kind: 'timeout' })

    await expect(
      createLineGamesClient({ request, timeoutMs: 3000 }).redeem(validInput),
    ).resolves.toEqual({ kind: 'timeout' })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('GET 與 POST 共用同一個 timeout 預算', async () => {
    let currentTime = 1000
    const now = vi.spyOn(Date, 'now').mockImplementation(() => currentTime)
    const request = vi
      .fn()
      .mockImplementationOnce(async (options) => {
        expect(options.timeoutMs).toBe(3000)
        currentTime = 2500
        return {
          kind: 'response',
          statusCode: 200,
          headers: { 'set-cookie': ['JSESSIONID=session-123; Path=/; HttpOnly'] },
          body: '',
        }
      })
      .mockImplementationOnce(async (options) => {
        expect(options.timeoutMs).toBe(1500)
        return { kind: 'response', statusCode: 200, body: '{}' }
      })

    try {
      await createLineGamesClient({ request, timeoutMs: 3000 }).redeem(validInput)
    } finally {
      now.mockRestore()
    }
  })

  it('逾時時只請求一次並回傳 timeout', async () => {
    const request = vi.fn().mockResolvedValue({ kind: 'timeout' })

    await expect(
      createLineGamesClient({ request, timeoutMs: 3000 }).redeem(validInput),
    ).resolves.toEqual({ kind: 'timeout' })
    expect(request).toHaveBeenCalledTimes(1)
  })
})
