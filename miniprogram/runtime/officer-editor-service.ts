/**
 * 航海士資料投稿服務適配器。
 *
 * 這是小程序唯一允許呼叫 wx.cloud.callFunction 的投稿模組。頁面只取得
 * 型別化服務，不能直接接觸 CloudBase；管理員權限由雲函數依 OPENID 判斷。
 */

import { OFFICER_CUSTOM_FUNCTION_NAME } from './cloudbase-config'
import type { OfficerSubmitResult } from '../contracts/officer-editor'
import type {
  OfficerSubmissionMutationResult,
  OfficerSubmissionRecord,
  OfficerSubmissionReviewFields,
  OfficerSubmissionSummary,
  SubmissionFormData,
  SubmissionPortraitMeta,
  SubmissionStatus,
} from '../contracts/officer-submission'

export class OfficerSubmissionError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'OfficerSubmissionError'
    this.code = code
  }
}

/** 舊頁面尚未切換完成前保留的錯誤名稱別名。 */
export const OfficerSubmitError = OfficerSubmissionError

interface OfficerSubmissionFunctionResult {
  ok: boolean
  data?: unknown
  code?: unknown
  message?: unknown
}

const SAFE_NETWORK_ERROR_MESSAGE = '伺服器暫時無法處理請求，請稍後再試'
const INVALID_RESPONSE_MESSAGE = '伺服器回應格式無效，請稍後再試'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFunctionResult = (value: unknown): value is OfficerSubmissionFunctionResult =>
  isRecord(value) && typeof value.ok === 'boolean'

const getErrorMessage = (code: string, message: unknown): string => {
  if (code === 'network') return SAFE_NETWORK_ERROR_MESSAGE
  return typeof message === 'string' && message.trim() ? message : '伺服器錯誤'
}

async function callOfficerFunction<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  let rawResponse: unknown
  try {
    rawResponse = await wx.cloud.callFunction({
      name: OFFICER_CUSTOM_FUNCTION_NAME,
      data: { action, ...payload },
    })
  } catch {
    throw new OfficerSubmissionError('network', '無法連接伺服器，請檢查網絡後重試')
  }

  if (!isRecord(rawResponse) || !isFunctionResult(rawResponse.result)) {
    throw new OfficerSubmissionError('network', INVALID_RESPONSE_MESSAGE)
  }

  const result = rawResponse.result
  if (result.ok === false) {
    if (
      !isRecord(result) ||
      typeof result.code !== 'string' ||
      typeof result.message !== 'string'
    ) {
      throw new OfficerSubmissionError('network', INVALID_RESPONSE_MESSAGE)
    }
    throw new OfficerSubmissionError(result.code, getErrorMessage(result.code, result.message))
  }

  if (!Object.prototype.hasOwnProperty.call(result, 'data')) {
    throw new OfficerSubmissionError('network', INVALID_RESPONSE_MESSAGE)
  }
  return result.data as T
}

const portraitPayload = (
  portraitBase64: string,
  portraitMeta: SubmissionPortraitMeta,
): Record<string, unknown> => ({
  portraitBase64,
  portraitMimeType: portraitMeta.mimeType,
  portraitMeta: {
    byteSize: portraitMeta.byteSize,
    width: portraitMeta.width,
    height: portraitMeta.height,
  },
})

export interface SaveAdminSubmissionInput {
  submissionId: string
  revision: number
  updatedAt: string
  formData: SubmissionFormData
  reviewFields: OfficerSubmissionReviewFields
  portraitBase64?: string
  portraitMeta?: SubmissionPortraitMeta
}

export interface ApproveSubmissionInput {
  submissionId: string
  revision: number
  updatedAt: string
}

export interface RejectSubmissionInput extends ApproveSubmissionInput {
  rejectReason: string
}

export interface OfficerSubmissionService {
  submit(
    formData: SubmissionFormData,
    portraitBase64: string,
    portraitMeta: SubmissionPortraitMeta,
  ): Promise<OfficerSubmissionMutationResult>
  resubmit(
    submissionId: string,
    expectedRevision: number,
    formData: SubmissionFormData,
    portraitBase64?: string,
    portraitMeta?: SubmissionPortraitMeta,
  ): Promise<OfficerSubmissionMutationResult>
  listMine(): Promise<readonly OfficerSubmissionSummary[]>
  loadMine(submissionId: string, revision?: number): Promise<OfficerSubmissionRecord>
  getAdminStatus(): Promise<{ isAdmin: boolean }>
  listAdmin(status: SubmissionStatus): Promise<readonly OfficerSubmissionSummary[]>
  loadAdmin(submissionId: string, revision: number): Promise<OfficerSubmissionRecord>
  saveAdmin(input: SaveAdminSubmissionInput): Promise<OfficerSubmissionRecord>
  approve(input: ApproveSubmissionInput): Promise<OfficerSubmissionRecord>
  reject(input: RejectSubmissionInput): Promise<OfficerSubmissionRecord>
  listPublishedCustomOfficers(): Promise<readonly Record<string, unknown>[]>
}

export function createOfficerSubmissionService(): OfficerSubmissionService {
  return {
    async submit(
      formData: SubmissionFormData,
      portraitBase64: string,
      portraitMeta: SubmissionPortraitMeta,
    ): Promise<OfficerSubmissionMutationResult> {
      return callOfficerFunction<OfficerSubmissionMutationResult>('submit', {
        formData,
        ...(portraitBase64 && portraitMeta ? portraitPayload(portraitBase64, portraitMeta) : {}),
      })
    },

    async resubmit(
      submissionId: string,
      expectedRevision: number,
      formData: SubmissionFormData,
      portraitBase64?: string,
      portraitMeta?: SubmissionPortraitMeta,
    ): Promise<OfficerSubmissionMutationResult> {
      return callOfficerFunction<OfficerSubmissionMutationResult>('resubmit', {
        submissionId,
        expectedRevision,
        formData,
        ...(portraitBase64 && portraitMeta ? portraitPayload(portraitBase64, portraitMeta) : {}),
      })
    },

    async listMine(): Promise<readonly OfficerSubmissionSummary[]> {
      return callOfficerFunction<OfficerSubmissionSummary[]>('listMine')
    },

    async loadMine(submissionId: string, revision?: number): Promise<OfficerSubmissionRecord> {
      return callOfficerFunction<OfficerSubmissionRecord>('loadMine', {
        submissionId,
        ...(revision === undefined ? {} : { revision }),
      })
    },

    async getAdminStatus(): Promise<{ isAdmin: boolean }> {
      return callOfficerFunction<{ isAdmin: boolean }>('getAdminStatus')
    },

    async listAdmin(status: SubmissionStatus): Promise<readonly OfficerSubmissionSummary[]> {
      return callOfficerFunction<OfficerSubmissionSummary[]>('listAdmin', { status })
    },

    async loadAdmin(submissionId: string, revision: number): Promise<OfficerSubmissionRecord> {
      return callOfficerFunction<OfficerSubmissionRecord>('loadAdmin', { submissionId, revision })
    },

    async saveAdmin(input: SaveAdminSubmissionInput): Promise<OfficerSubmissionRecord> {
      return callOfficerFunction<OfficerSubmissionRecord>('saveAdmin', {
        submissionId: input.submissionId,
        revision: input.revision,
        updatedAt: input.updatedAt,
        formData: input.formData,
        reviewFields: input.reviewFields,
        ...(input.portraitBase64 && input.portraitMeta
          ? portraitPayload(input.portraitBase64, input.portraitMeta)
          : {}),
      })
    },

    async approve(input: ApproveSubmissionInput): Promise<OfficerSubmissionRecord> {
      return callOfficerFunction<OfficerSubmissionRecord>('approve', {
        submissionId: input.submissionId,
        revision: input.revision,
        updatedAt: input.updatedAt,
      })
    },

    async reject(input: RejectSubmissionInput): Promise<OfficerSubmissionRecord> {
      return callOfficerFunction<OfficerSubmissionRecord>('reject', {
        submissionId: input.submissionId,
        revision: input.revision,
        updatedAt: input.updatedAt,
        rejectReason: input.rejectReason,
      })
    },

    async listPublishedCustomOfficers(): Promise<readonly Record<string, unknown>[]> {
      return callOfficerFunction<Record<string, unknown>[]>('listCustom')
    },
  }
}

let serviceInstance: OfficerSubmissionService | null = null

export function getOfficerSubmissionService(): OfficerSubmissionService {
  if (!serviceInstance) serviceInstance = createOfficerSubmissionService()
  return serviceInstance
}

/**
 * 舊資料維護頁的相容介面，待頁面改用新投稿流程後移除。
 * 這個入口不再被新頁面使用，也不提供 CanonicalOfficer 寫入能力。
 */
export interface OfficerEditorService {
  submitOfficer(
    officerId: string,
    canonicalData: Record<string, unknown>,
    portraitBase64?: string,
  ): Promise<OfficerSubmitResult>
}

export const createOfficerEditorService = (): OfficerEditorService => ({
  async submitOfficer(
    officerId: string,
    canonicalData: Record<string, unknown>,
    portraitBase64?: string,
  ): Promise<OfficerSubmitResult> {
    return callOfficerFunction<OfficerSubmitResult>('submit', {
      officerId,
      canonicalData,
      ...(portraitBase64 ? { portraitBase64 } : {}),
    })
  },
})

export const getOfficerEditorService = (): OfficerEditorService => createOfficerEditorService()
