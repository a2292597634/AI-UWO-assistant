const GAME_SERVER_IDS = new Set(require('./game-servers.json').servers.map(({ id }) => id))

const MAX_USER_NAME_LENGTH = 100
const MAX_COUPON_CODE_LENGTH = 50
const RATE_LIMIT_MS = 60 * 1000
const BATCH_SIZE = 2
const MAX_BATCH_PLAYERS_PER_MINUTE = 20

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
  'batch-invalid': '玩家清單無效，請重新選擇。',
  'batch-unavailable': '批次兌換暫時無法使用。',
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

const playerKey = ({ gameServerId, userNo }) => JSON.stringify([gameServerId, userNo.trim()])

const createPlayerRateLimiter = () => {
  const recentByRequester = new Map()
  let nextCleanup = 0
  return (requesterKey, target, now) => {
    if (now >= nextCleanup) {
      for (const [key, recent] of recentByRequester) {
        if (now - recent.at(-1).at >= RATE_LIMIT_MS) recentByRequester.delete(key)
      }
      nextCleanup = now + RATE_LIMIT_MS
    }
    const recent = (recentByRequester.get(requesterKey) ?? []).filter(
      (entry) => now - entry.at < RATE_LIMIT_MS,
    )
    if (
      recent.length >= MAX_BATCH_PLAYERS_PER_MINUTE ||
      recent.some((entry) => entry.key === target)
    )
      return false
    recent.push({ key: target, at: now })
    recentByRequester.set(requesterKey, recent)
    return true
  }
}

const createCouponRedemptionService = ({
  client,
  rateLimiter = createMemoryRateLimiter(),
  now = Date.now,
} = {}) => {
  const reservePlayer = createPlayerRateLimiter()
  const redeem = async (input) => {
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
  }

  const redeemBatch = async ({ players, couponNo }, requesterKey) => {
    if (!Array.isArray(players) || players.length < 1 || players.length > BATCH_SIZE)
      return failure('batch-invalid')
    const inputs = players.map((player) => ({
      gameServerId: player?.gameServerId,
      userNo: player?.userNo,
      couponNo,
    }))
    if (inputs.some(validateInput)) return failure('batch-invalid')
    const keys = inputs.map(playerKey)
    if (new Set(keys).size !== inputs.length) return failure('batch-invalid')
    const currentTime = now()
    const results = await Promise.all(
      inputs.map(async (input, index) => {
        if (!reservePlayer(requesterKey, keys[index], currentTime)) {
          return { code: 'rate-limited', message: MESSAGES['rate-limited'] }
        }
        const result = await redeem(input)
        return result.ok ? result.data : { code: result.code, message: result.message }
      }),
    )
    return { ok: true, data: results }
  }

  return {
    async dispatch(input, requesterKey = 'anonymous', allowBatch = false) {
      if (input?.action === 'redeemBatch') {
        return allowBatch ? redeemBatch(input, requesterKey) : failure('batch-unavailable')
      }
      const validationCode = validateInput(input)
      if (validationCode) return failure(validationCode)
      const currentTime = now()
      if (rateLimiter.isLimited(requesterKey, currentTime)) return failure('rate-limited')
      if (allowBatch && !reservePlayer(requesterKey, playerKey(input), currentTime)) {
        return failure('rate-limited')
      }
      rateLimiter.mark(requesterKey, currentTime)
      return redeem(input)
    },
  }
}

module.exports = {
  createCouponRedemptionService,
  createMemoryRateLimiter,
  mapOfficialResponse,
  RATE_LIMIT_MS,
}
