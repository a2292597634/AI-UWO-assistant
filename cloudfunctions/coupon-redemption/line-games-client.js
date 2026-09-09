const https = require('node:https')
const { URLSearchParams } = require('node:url')

const OFFICIAL_HOST = 'coupon-front.line.games'
const OFFICIAL_PAGE_PATH = '/sbc/UWOGL'
const OFFICIAL_PATH = '/sbc/UWOGL/useGameCoupon'
const OFFICIAL_REFERER = 'https://coupon-front.line.games/sbc/UWOGL'
const OFFICIAL_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const DEFAULT_TIMEOUT_MS = 5000

const requestHttps = (options, requestFactory = https.request) =>
  new Promise((resolve) => {
    let settled = false
    let request
    let timeoutHandle
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutHandle)
      resolve(result)
    }

    timeoutHandle = setTimeout(() => {
      request?.destroy()
      finish({ kind: 'timeout' })
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

    request = requestFactory(
      {
        method: options.method,
        hostname: options.hostname,
        path: options.path,
        headers: options.headers,
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        response.on('end', () =>
          finish({
            kind: 'response',
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        )
      },
    )

    request.on('error', () => finish({ kind: 'network' }))
    if (typeof options.body === 'string' && options.body.length > 0) request.write(options.body)
    request.end()
  })

const getCookieHeader = (headers) => {
  const setCookie = headers?.['set-cookie'] ?? headers?.['Set-Cookie']
  const values = Array.isArray(setCookie)
    ? setCookie
    : typeof setCookie === 'string'
      ? [setCookie]
      : []
  return values
    .map((cookie) => cookie.split(';', 1)[0].trim())
    .filter(Boolean)
    .join('; ')
}

const getRemainingTimeoutMs = (deadline) => Math.max(0, deadline - Date.now())

const createLineGamesClient = ({
  request = requestHttps,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) => ({
  async redeem(input) {
    const deadline = Date.now() + timeoutMs
    const pageTimeoutMs = getRemainingTimeoutMs(deadline)
    if (pageTimeoutMs <= 0) return { kind: 'timeout' }

    const pageResponse = await request({
      method: 'GET',
      hostname: OFFICIAL_HOST,
      path: OFFICIAL_PAGE_PATH,
      timeoutMs: pageTimeoutMs,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        referer: OFFICIAL_REFERER,
        'user-agent': OFFICIAL_USER_AGENT,
      },
    })

    if (
      pageResponse?.kind !== 'response' ||
      pageResponse.statusCode < 200 ||
      pageResponse.statusCode >= 300
    ) {
      return pageResponse
    }

    const body = new URLSearchParams({
      gameServerId: input.gameServerId,
      userNo: input.userNo,
      couponNo: input.couponNo,
      os: '',
      appStoreCd: '',
    }).toString()

    const cookie = getCookieHeader(pageResponse.headers)
    if (!cookie) return { kind: 'network' }

    const postTimeoutMs = getRemainingTimeoutMs(deadline)
    if (postTimeoutMs <= 0) return { kind: 'timeout' }

    return request({
      method: 'POST',
      hostname: OFFICIAL_HOST,
      path: OFFICIAL_PATH,
      timeoutMs: postTimeoutMs,
      headers: {
        accept: 'application/json, text/javascript, */*; q=0.01',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        origin: 'https://coupon-front.line.games',
        referer: OFFICIAL_REFERER,
        'content-length': Buffer.byteLength(body),
        'user-agent': OFFICIAL_USER_AGENT,
        'x-requested-with': 'XMLHttpRequest',
        ...(cookie ? { cookie } : {}),
      },
      body,
    })
  },
})

module.exports = {
  createLineGamesClient,
  requestHttps,
  OFFICIAL_HOST,
  OFFICIAL_PAGE_PATH,
  OFFICIAL_PATH,
  OFFICIAL_REFERER,
  OFFICIAL_USER_AGENT,
}
