/**
 * 航海士資料維護工單的 CloudBase 適配器。
 *
 * 頁面僅透過本服務呼叫雲函數，不能直接接觸 wx.cloud；權限與版本衝突
 * 一律由雲函數判定。
 */

import type {
  MaintenanceOfficerData,
  MaintenanceStatus,
  MaintenanceWorkOrderDraft,
  MaintenanceWorkOrderHistoryEntry,
  ReferenceCandidate,
} from '../contracts/officer-maintenance'
import { OFFICER_MAINTENANCE_FUNCTION_NAME } from './cloudbase-config'

export type OfficerMaintenanceErrorCode =
  | 'network'
  | 'unknown-action'
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid-data'
  | 'not-found'
  | 'conflict'
  | 'base-version-conflict'
  | 'invalid-state'
  | 'invalid-status'
  | 'reject-reason-required'
  | 'review-reason-required'

export class OfficerMaintenanceError extends Error {
  readonly code: OfficerMaintenanceErrorCode

  constructor(code: OfficerMaintenanceErrorCode, message: string) {
    super(message)
    this.name = 'OfficerMaintenanceError'
    this.code = code
  }
}

export interface MaintenanceWorkOrder extends MaintenanceWorkOrderDraft {
  readonly workOrderId: string
  readonly status: MaintenanceStatus
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly reviewedData: MaintenanceOfficerData | null
  readonly referenceCandidates: readonly ReferenceCandidate[]
  readonly history: readonly MaintenanceWorkOrderHistoryEntry[]
}

export type SaveMaintenanceDraftInput = MaintenanceWorkOrderDraft & {
  readonly workOrderId?: string
  readonly revision?: number
  readonly updatedAt?: string
}

export interface SubmitMaintenanceWorkOrderInput {
  readonly workOrderId: string
  readonly revision: number
  readonly updatedAt: string
}

export interface SaveMaintenanceReviewInput extends SubmitMaintenanceWorkOrderInput {
  readonly reviewedData: MaintenanceOfficerData
  readonly referenceCandidates?: readonly ReferenceCandidate[]
  readonly reason: string
}

export type ApproveMaintenanceWorkOrderInput = SubmitMaintenanceWorkOrderInput

export interface OfficerMaintenanceService {
  listAdmin(status: MaintenanceStatus): Promise<readonly MaintenanceWorkOrder[]>
  reject(
    input: SubmitMaintenanceWorkOrderInput & { readonly reason: string },
  ): Promise<MaintenanceWorkOrder>
  listMine(): Promise<readonly MaintenanceWorkOrder[]>
  loadMine(workOrderId: string): Promise<MaintenanceWorkOrder>
  saveDraft(input: SaveMaintenanceDraftInput): Promise<MaintenanceWorkOrder>
  submit(input: SubmitMaintenanceWorkOrderInput): Promise<MaintenanceWorkOrder>
  saveReview(input: SaveMaintenanceReviewInput): Promise<MaintenanceWorkOrder>
  approve(input: ApproveMaintenanceWorkOrderInput): Promise<MaintenanceWorkOrder>
}

interface FunctionResult {
  readonly ok: boolean
  readonly data?: unknown
  readonly code?: unknown
  readonly message?: unknown
}

const SAFE_NETWORK_ERROR_MESSAGE = '伺服器暫時無法處理請求，請稍後再試'
const KNOWN_ERROR_CODES = new Set<OfficerMaintenanceErrorCode>([
  'network',
  'unknown-action',
  'unauthenticated',
  'forbidden',
  'invalid-data',
  'not-found',
  'conflict',
  'base-version-conflict',
  'invalid-state',
  'invalid-status',
  'reject-reason-required',
  'review-reason-required',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFunctionResult = (value: unknown): value is FunctionResult =>
  isRecord(value) && typeof value.ok === 'boolean'

const createNetworkError = (): OfficerMaintenanceError =>
  new OfficerMaintenanceError('network', SAFE_NETWORK_ERROR_MESSAGE)

const isKnownErrorCode = (value: unknown): value is OfficerMaintenanceErrorCode =>
  typeof value === 'string' && KNOWN_ERROR_CODES.has(value as OfficerMaintenanceErrorCode)

const callMaintenanceFunction = async <Result>(
  action: string,
  payload: Record<string, unknown>,
): Promise<Result> => {
  let rawResponse: unknown
  try {
    rawResponse = await wx.cloud.callFunction({
      name: OFFICER_MAINTENANCE_FUNCTION_NAME,
      data: { action, ...payload },
    })
  } catch {
    throw createNetworkError()
  }

  if (!isRecord(rawResponse) || !isFunctionResult(rawResponse.result)) {
    throw createNetworkError()
  }

  const result = rawResponse.result
  if (result.ok === false) {
    if (!isKnownErrorCode(result.code) || typeof result.message !== 'string') {
      throw createNetworkError()
    }
    throw new OfficerMaintenanceError(
      result.code,
      result.code === 'network' ? SAFE_NETWORK_ERROR_MESSAGE : result.message,
    )
  }
  if (!Object.prototype.hasOwnProperty.call(result, 'data')) throw createNetworkError()
  return result.data as Result
}

export const createOfficerMaintenanceService = (): OfficerMaintenanceService => ({
  async listAdmin(status): Promise<readonly MaintenanceWorkOrder[]> {
    return callMaintenanceFunction<MaintenanceWorkOrder[]>('listAdmin', { status })
  },
  async reject(input): Promise<MaintenanceWorkOrder> {
    return callMaintenanceFunction<MaintenanceWorkOrder>('reject', { ...input })
  },
  async listMine(): Promise<readonly MaintenanceWorkOrder[]> {
    return callMaintenanceFunction<MaintenanceWorkOrder[]>('listMine', {})
  },

  async loadMine(workOrderId): Promise<MaintenanceWorkOrder> {
    return callMaintenanceFunction<MaintenanceWorkOrder>('loadMine', { workOrderId })
  },
  async saveDraft(input): Promise<MaintenanceWorkOrder> {
    return callMaintenanceFunction<MaintenanceWorkOrder>('saveDraft', { ...input })
  },

  async submit(input): Promise<MaintenanceWorkOrder> {
    return callMaintenanceFunction<MaintenanceWorkOrder>('submit', { ...input })
  },

  async saveReview(input): Promise<MaintenanceWorkOrder> {
    return callMaintenanceFunction<MaintenanceWorkOrder>('saveReview', { ...input })
  },

  async approve(input): Promise<MaintenanceWorkOrder> {
    return callMaintenanceFunction<MaintenanceWorkOrder>('approve', { ...input })
  },
})

let serviceInstance: OfficerMaintenanceService | null = null

export const getOfficerMaintenanceService = (): OfficerMaintenanceService => {
  if (!serviceInstance) serviceInstance = createOfficerMaintenanceService()
  return serviceInstance
}
