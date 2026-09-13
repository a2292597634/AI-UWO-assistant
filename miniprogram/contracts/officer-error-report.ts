/** 使用者可回報的航海士資料錯誤類型。 */
export type OfficerErrorType =
  'basic' | 'skill' | 'skillLevel' | 'recruitment' | 'portrait' | 'text' | 'other'

/** 錯誤回報生命週期狀態。 */
export type OfficerErrorReportStatus = 'pending' | 'needsInfo' | 'accepted' | 'fixed' | 'rejected'

export interface OfficerErrorReportDraft {
  readonly officerId: string
  readonly errorTypes: readonly OfficerErrorType[]
  readonly description: string
  readonly suggestedCorrection: string
  readonly sourceUrl: string
  readonly screenshotFileIds: readonly string[]
  readonly supplement: string
}

export interface OfficerErrorReportSupplement {
  readonly text: string
  readonly sourceUrl: string
  readonly screenshotFileIds: readonly string[]
  readonly createdAt: string
}

export interface OfficerErrorReportHistoryEntry {
  readonly action: string
  readonly reason: string | null
  readonly actorRole: 'owner' | 'admin'
  readonly at: string
  readonly revision: number
}

export interface OfficerErrorReport extends OfficerErrorReportDraft {
  readonly reportId: string
  readonly status: OfficerErrorReportStatus
  readonly reviewReply: string | null
  readonly fixedDatasetVersion: string | null
  readonly supplements: readonly OfficerErrorReportSupplement[]
  readonly history: readonly OfficerErrorReportHistoryEntry[]
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface OfficerErrorReportValidationError {
  readonly field: keyof OfficerErrorReportDraft
  readonly message: string
}

export type OfficerErrorReportAction =
  'requestInfo' | 'accept' | 'reject' | 'markFixed' | 'supplement'

export type OfficerErrorReportActorRole = 'owner' | 'admin'
