const https = require('node:https')
const { URLSearchParams } = require('node:url')

const OFFICIAL_HOST = 'coupon-front.line.games'
const OFFICIAL_PATH = '/sbc/UWOGL/useGameCoupon'
const OFFICIAL_REFERER = 'https://coupon-front.line.games/sbc/UWOGL'
const DEFAULT_TIMEOUT_MS = 5000

const requestHttps = (options) =>
  new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const request = https.request(
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
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        )
      },
    )

    request.setTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, () => {
      request.destroy()
      finish({ kind: 'timeout' })
    })
    request.on('error', () => finish({ kind: 'network' }))
    request.write(options.body)
    request.end()
  })

const createLineGamesClient = ({
  request = requestHttps,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) => ({
  async redeem(input) {
    const body = new URLSearchParams({
      gameServerId: input.gameServerId,
      userNo: input.userNo,
      couponNo: input.couponNo,
      os: '',
      appStoreCd: '',
    }).toString()

    return request({
      method: 'POST',
      hostname: OFFICIAL_HOST,
      path: OFFICIAL_PATH,
      timeoutMs,
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        referer: OFFICIAL_REFERER,
        'content-length': Buffer.byteLength(body),
      },
      body,
    })
  },
})

module.exports = {
  createLineGamesClient,
  OFFICIAL_HOST,
  OFFICIAL_PATH,
  OFFICIAL_REFERER,
}
