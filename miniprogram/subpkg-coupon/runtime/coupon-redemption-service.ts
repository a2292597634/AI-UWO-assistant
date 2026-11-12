import { callSharedCloudFunction } from '../../runtime/shared-cloud-client'
import { COUPON_REDEMPTION_FUNCTION_NAME } from '../../runtime/cloudbase-config'
import {
  validateCouponRedemptionInput,
  COUPON_BATCH_SIZE,
  type CouponProfileInput,
  type CouponRedemptionInput,
  type CouponRedemptionResult,
  type CouponRedemptionServiceCode,
} from '../../contracts/coupon-redemption'

const UNKNOWN_RESULT_MESSAGE = '結果未確認，請先到官方頁面確認再嘗試。'

export class CouponRedemptionError extends Error {
  readonly code: CouponRedemptionServiceCode

  constructor(code: CouponRedemptionServiceCode, message: string) {
    super(message)
    this.name = 'CouponRedemptionError'
    this.code = code
  }
}

export interface CouponRedemptionService {
  submit(input: CouponRedemptionInput): Promise<CouponRedemptionResult>
  submitBatch(players: CouponProfileInput[], couponNo: string): Promise<BatchResult[]>
}

type BatchResult = { code: CouponRedemptionServiceCode; message: string }

interface FunctionSuccess {
  ok: true
  data: CouponRedemptionResult
}

interface FunctionFailure {
  ok: false
  code: CouponRedemptionServiceCode
  message: string
}

const RESULT_CODES = new Set<CouponRedemptionServiceCode>([
  'success',
  'user-invalid',
  'coupon-invalid',
  'coupon-used',
  'coupon-expired',
  'coupon-group-used',
  'rate-limited',
  'server-unavailable',
  'maintenance',
  'retry-later',
  'unknown',
  'server-invalid',
  'user-required',
  'coupon-required',
  'coupon-too-long',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key))

const isValidResultData = (value: unknown): value is CouponRedemptionResult => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['code', 'message'])) return false
  return (
    RESULT_CODES.has(value.code as CouponRedemptionServiceCode) &&
    value.code !== 'unknown' &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    value.message.length <= 200
  )
}

const isValidFailure = (
  value: Record<string, unknown>,
): value is Record<string, unknown> & FunctionFailure =>
  hasOnlyKeys(value, ['ok', 'code', 'message']) &&
  value.ok === false &&
  RESULT_CODES.has(value.code as CouponRedemptionServiceCode) &&
  typeof value.message === 'string' &&
  value.message.length > 0 &&
  value.message.length <= 200

const isValidSuccess = (
  value: Record<string, unknown>,
): value is Record<string, unknown> & FunctionSuccess =>
  hasOnlyKeys(value, ['ok', 'data']) && value.ok === true && isValidResultData(value.data)

const createUnknownError = (): CouponRedemptionError =>
  new CouponRedemptionError('unknown', UNKNOWN_RESULT_MESSAGE)

const readEnvelope = async (input: object): Promise<Record<string, unknown>> => {
  let rawResponse: unknown
  try {
    rawResponse = await callSharedCloudFunction({
      name: COUPON_REDEMPTION_FUNCTION_NAME,
      data: input,
    })
  } catch {
    throw createUnknownError()
  }

  if (!isRecord(rawResponse) || !isRecord(rawResponse.result)) throw createUnknownError()
  const result = rawResponse.result
  if (result.ok === false) {
    const batchCode = result.code
    if (
      'action' in input &&
      hasOnlyKeys(result, ['ok', 'code', 'message']) &&
      (batchCode === 'batch-invalid' || batchCode === 'batch-unavailable')
    ) {
      const message =
        batchCode === 'batch-invalid' ? '玩家清單無效，請重新選擇。' : '批次兌換暫時無法使用。'
      throw new CouponRedemptionError('retry-later', message)
    }
    if (!isValidFailure(result)) throw createUnknownError()
    if (result.code === 'unknown') throw createUnknownError()
    throw new CouponRedemptionError(result.code, result.message)
  }
  return result
}

const callFunction = async (input: CouponRedemptionInput): Promise<CouponRedemptionResult> => {
  const result = await readEnvelope(input)
  if (!isValidSuccess(result)) throw createUnknownError()
  return result.data
}

export const createCouponRedemptionService = (): CouponRedemptionService => ({
  async submit(input) {
    const validation = validateCouponRedemptionInput(input)
    if (validation.code !== 'valid') {
      throw new CouponRedemptionError(validation.code, validation.message)
    }
    return callFunction({
      gameServerId: input.gameServerId,
      userNo: input.userNo.trim(),
      couponNo: input.couponNo.trim(),
    })
  },
  async submitBatch(players, couponNo) {
    if (players.length < 1 || players.length > COUPON_BATCH_SIZE) {
      throw new CouponRedemptionError('retry-later', '玩家清單無效，請重新選擇。')
    }
    for (const player of players) {
      const validation = validateCouponRedemptionInput({ ...player, couponNo })
      if (validation.code !== 'valid') {
        throw new CouponRedemptionError(validation.code, validation.message)
      }
    }
    const result = await readEnvelope({
      action: 'redeemBatch',
      couponNo: couponNo.trim(),
      players: players.map(({ gameServerId, userNo }) => ({ gameServerId, userNo: userNo.trim() })),
    })
    if (
      result.ok !== true ||
      !hasOnlyKeys(result, ['ok', 'data']) ||
      !Array.isArray(result.data) ||
      result.data.length !== players.length
    )
      throw createUnknownError()
    return result.data.map((item: unknown) =>
      isValidResultData(item) ? item : { code: 'unknown', message: UNKNOWN_RESULT_MESSAGE },
    )
  },
})

let serviceInstance: CouponRedemptionService | null = null

export const getCouponRedemptionService = (): CouponRedemptionService => {
  if (!serviceInstance) serviceInstance = createCouponRedemptionService()
  return serviceInstance
}
