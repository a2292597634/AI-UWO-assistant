const GAME_SERVER_IDS = new Set([
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

const MAX_USER_NAME_LENGTH = 100
const MAX_COUPON_CODE_LENGTH = 50
const RATE_LIMIT_MS = 60 * 1000

const MESSAGES = {
  success: '獎勵已發送至遊戲內信箱。',
  'server-invalid': '請選擇有效的伺服器。',
  'user-required': '請輸入遊戲內暱稱。',
  'coupon-required': '請輸入兌換碼。',
  'coupon-too-long': '兌換碼長度不正確。',
  'user-invalid': '請確認伺服器與遊戲內暱稱。',
  'coupon-invalid': '這個兌換碼不存在。',
  'coupon-used': '這個兌換碼已經使用過。',
  'coupon-expired': '這個兌換碼已經過期。',
  'coupon-group-used': '同一兌換碼群組只能使用一次。',
  'rate-limited': '請稍候再試。',
  'server-unavailable': '這個兌換碼不能使用於所選伺服器。',
  maintenance: '官方服務維護中，請稍後再試。',
  'retry-later': '官方服務暫時不可用，請稍後再試。',
  unknown: '結果未確認，請先到官方頁面確認再嘗試。',
}

const ERROR_CODE_MAP = {
  NOT_EXIST_USER: 'user-invalid',
  NOT_EXIST_COUPON: 'coupon-invalid',
  ALREADY_USE_COUPON: 'coupon-used',
  EXPIRED_COUPON: 'coupon-expired',
  ALREADY_USE_COUPON_SAME_GROUP: 'coupon-group-used',
  ALREADY_USE_COUPON_SAME_CONFIG: 'coupon-group-used',
  FAIL_MAX_TRY_OVER: 'rate-limited',
  UNAVAILABLE_GAME_SERVER: 'server-unavailable',
  GAME_UNDER_INSPECTION: 'maintenance',
  SYSTEM_MAINTENANCE: 'maintenance',
  FAIL_GIVE_ITEM_API: 'retry-later',
  FAIL_BRIDGE_USERINFO_FAIL: 'retry-later',
  SYSTEM_ERROR: 'retry-later',
  SYSTEM_ERROR_COUPON: 'retry-later',
  EXTERNAL_API_ERROR: 'retry-later',
  NOT_NORMAL: 'retry-later',
}

const createMemoryRateLimiter = () => {
  const lastRequests = new Map()
  return {
    isLimited(key, now) {
      const last = lastRequests.get(key)
      return typeof last === 'number' && now - last < RATE_LIMIT_MS
    },
    mark(key, now) {
      lastRequests.set(key, now)
    },
  }
}

const failure = (code) => ({ ok: false, code, message: MESSAGES[code] ?? MESSAGES.unknown })

const validateInput = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'server-invalid'
  if (typeof input.gameServerId !== 'string' || !GAME_SERVER_IDS.has(input.gameServerId)) {
    return 'server-invalid'
  }
  if (typeof input.userNo !== 'string' || input.userNo.trim().length === 0) return 'user-required'
  if ([...input.userNo.trim()].length > MAX_USER_NAME_LENGTH) return 'user-invalid'
  if (typeof input.couponNo !== 'string' || input.couponNo.trim().length === 0)
    return 'coupon-required'
  if ([...input.couponNo.trim()].length > MAX_COUPON_CODE_LENGTH) return 'coupon-too-long'
  return null
}

const mapOfficialResponse = (response) => {
  if (!response || response.kind === 'timeout') return failure('unknown')
  if (response.kind !== 'response' || response.statusCode < 200 || response.statusCode >= 300) {
    return failure('retry-later')
  }

  let body
  try {
    body = JSON.parse(response.body)
  } catch {
    return failure('unknown')
  }

  if (body?.isSuccess === true)
    return { ok: true, data: { code: 'success', message: MESSAGES.success } }
  if (body?.isSuccess !== false || typeof body.errorCdStr !== 'string') return failure('unknown')

  return failure(ERROR_CODE_MAP[body.errorCdStr] ?? 'unknown')
}

const createCouponRedemptionService = ({
  client,
  rateLimiter = createMemoryRateLimiter(),
  now = Date.now,
} = {}) => ({
  async dispatch(input, requesterKey = 'anonymous') {
    const validationCode = validateInput(input)
    if (validationCode) return failure(validationCode)

    const currentTime = now()
    if (rateLimiter.isLimited(requesterKey, currentTime)) return failure('rate-limited')
    rateLimiter.mark(requesterKey, currentTime)

    try {
      return mapOfficialResponse(
        await client.redeem({
          gameServerId: input.gameServerId,
          userNo: input.userNo.trim(),
          couponNo: input.couponNo.trim(),
        }),
      )
    } catch {
      return failure('unknown')
    }
  },
})

module.exports = {
  createCouponRedemptionService,
  createMemoryRateLimiter,
  mapOfficialResponse,
  RATE_LIMIT_MS,
}
