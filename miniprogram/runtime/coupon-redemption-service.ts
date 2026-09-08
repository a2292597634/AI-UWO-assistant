import { COUPON_REDEMPTION_FUNCTION_NAME } from './cloudbase-config'
import {
  validateCouponRedemptionInput,
  type CouponRedemptionInput,
  type CouponRedemptionResult,
  type CouponRedemptionServiceCode,
} from '../contracts/coupon-redemption'

const UNKNOWN_RESULT_MESSAGE = '結果未確認，請先到官方頁面確認再嘗試。'
const NETWORK_MESSAGE = '兌換服務暫時無法連線，請稍後再試。'

export class CouponRedemptionError extends Error {
  readonly code: CouponRedemptionServiceCode | 'unknown'

  constructor(code: CouponRedemptionServiceCode | 'unknown', message: string) {
    super(message)
    this.name = 'CouponRedemptionError'
    this.code = code
  }
}

export interface CouponRedemptionService {
  submit(input: CouponRedemptionInput): Promise<CouponRedemptionResult>
}

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

const callFunction = async (input: CouponRedemptionInput): Promise<CouponRedemptionResult> => {
  let rawResponse: unknown
  try {
    rawResponse = await wx.cloud.callFunction({
      name: COUPON_REDEMPTION_FUNCTION_NAME,
      data: input,
    })
  } catch {
    throw new CouponRedemptionError('unknown', NETWORK_MESSAGE)
  }

  if (!isRecord(rawResponse) || !isRecord(rawResponse.result)) throw createUnknownError()
  const result = rawResponse.result
  if (result.ok === false) {
    if (!isValidFailure(result)) throw createUnknownError()
    throw new CouponRedemptionError(result.code, result.message)
  }
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
})

let serviceInstance: CouponRedemptionService | null = null

export const getCouponRedemptionService = (): CouponRedemptionService => {
  if (!serviceInstance) serviceInstance = createCouponRedemptionService()
  return serviceInstance
}
