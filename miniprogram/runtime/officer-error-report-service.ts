import type {
  OfficerErrorReport,
  OfficerErrorReportDraft,
  OfficerErrorReportStatus,
} from '../contracts/officer-error-report'
import { OFFICER_MAINTENANCE_FUNCTION_NAME } from './cloudbase-config'

export type OfficerErrorReportErrorCode =
  | 'network'
  | 'unknown-action'
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid-data'
  | 'invalid-status'
  | 'not-found'
  | 'conflict'
  | 'invalid-state'
  | 'review-reply-required'
  | 'dataset-version-required'

export class OfficerErrorReportError extends Error {
  readonly code: OfficerErrorReportErrorCode

  constructor(code: OfficerErrorReportErrorCode, message: string) {
    super(message)
    this.name = 'OfficerErrorReportError'
    this.code = code
  }
}

export interface ErrorReportVersionInput {
  readonly reportId: string
  readonly revision: number
  readonly updatedAt: string
}

export interface OfficerErrorReportService {
  uploadScreenshots(tempFilePaths: readonly string[]): Promise<readonly string[]>
  createReport(draft: OfficerErrorReportDraft): Promise<OfficerErrorReport>
  listMine(): Promise<readonly OfficerErrorReport[]>
  appendSupplement(
    input: ErrorReportVersionInput & {
      readonly text: string
      readonly sourceUrl?: string
      readonly screenshotFileIds?: readonly string[]
    },
  ): Promise<OfficerErrorReport>
  listAdmin(status: OfficerErrorReportStatus): Promise<readonly OfficerErrorReport[]>
  requestInfo(
    input: ErrorReportVersionInput & { readonly reply: string },
  ): Promise<OfficerErrorReport>
  accept(input: ErrorReportVersionInput & { readonly reply: string }): Promise<OfficerErrorReport>
  reject(input: ErrorReportVersionInput & { readonly reply: string }): Promise<OfficerErrorReport>
  markFixed(
    input: ErrorReportVersionInput & {
      readonly datasetVersion: string
      readonly reply?: string
    },
  ): Promise<OfficerErrorReport>
}

interface FunctionResult {
  readonly ok: boolean
  readonly data?: unknown
  readonly code?: unknown
  readonly message?: unknown
}

const SAFE_NETWORK_MESSAGE = '伺服器暫時無法處理請求，請稍後再試'
const ERROR_CODES = new Set<OfficerErrorReportErrorCode>([
  'network',
  'unknown-action',
  'unauthenticated',
  'forbidden',
  'invalid-data',
  'invalid-status',
  'not-found',
  'conflict',
  'invalid-state',
  'review-reply-required',
  'dataset-version-required',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFunctionResult = (value: unknown): value is FunctionResult =>
  isRecord(value) && typeof value.ok === 'boolean'

const call = async <Result>(action: string, payload: Record<string, unknown>): Promise<Result> => {
  let response: unknown
  try {
    response = await wx.cloud.callFunction({
      name: OFFICER_MAINTENANCE_FUNCTION_NAME,
      data: { action, ...payload },
    })
  } catch {
    throw new OfficerErrorReportError('network', SAFE_NETWORK_MESSAGE)
  }
  if (!isRecord(response) || !isFunctionResult(response.result)) {
    throw new OfficerErrorReportError('network', SAFE_NETWORK_MESSAGE)
  }
  const result = response.result
  if (!result.ok) {
    const code = typeof result.code === 'string' ? result.code : ''
    if (
      !ERROR_CODES.has(code as OfficerErrorReportErrorCode) ||
      typeof result.message !== 'string'
    ) {
      throw new OfficerErrorReportError('network', SAFE_NETWORK_MESSAGE)
    }
    throw new OfficerErrorReportError(code as OfficerErrorReportErrorCode, result.message)
  }
  if (!Object.prototype.hasOwnProperty.call(result, 'data')) {
    throw new OfficerErrorReportError('network', SAFE_NETWORK_MESSAGE)
  }
  return result.data as Result
}

export const createOfficerErrorReportService = (): OfficerErrorReportService => ({
  async uploadScreenshots(tempFilePaths) {
    if (tempFilePaths.length > 3) {
      throw new OfficerErrorReportError('invalid-data', '證據截圖最多三張')
    }
    const fileIds: string[] = []
    for (const [index, filePath] of tempFilePaths.entries()) {
      const suffix = filePath.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
      try {
        const result = await wx.cloud.uploadFile({
          cloudPath: `officer-error-reports/${Date.now()}-${index}.${suffix}`,
          filePath,
        })
        fileIds.push(result.fileID)
      } catch {
        throw new OfficerErrorReportError('network', '證據截圖上傳失敗，請稍後再試')
      }
    }
    return fileIds
  },
  createReport: (draft) => call('createReport', { ...draft }),
  listMine: () => call('listMyReports', {}),
  appendSupplement: (input) => call('appendReportSupplement', { ...input }),
  listAdmin: (status) => call('listReportsForAdmin', { status }),
  requestInfo: (input) => call('requestReportInfo', { ...input }),
  accept: (input) => call('acceptReport', { ...input }),
  reject: (input) => call('rejectReport', { ...input }),
  markFixed: (input) => call('markReportFixed', { ...input }),
})

let instance: OfficerErrorReportService | null = null

export const getOfficerErrorReportService = (): OfficerErrorReportService => {
  if (!instance) instance = createOfficerErrorReportService()
  return instance
}
