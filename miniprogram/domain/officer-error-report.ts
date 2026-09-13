import type {
  OfficerErrorReportAction,
  OfficerErrorReportActorRole,
  OfficerErrorReportDraft,
  OfficerErrorReportStatus,
  OfficerErrorReportValidationError,
  OfficerErrorType,
} from '../contracts/officer-error-report'

const ERROR_TYPES = new Set<OfficerErrorType>([
  'basic',
  'skill',
  'skillLevel',
  'recruitment',
  'portrait',
  'text',
  'other',
])

const isValidOptionalUrl = (value: string): boolean => {
  const trimmed = value.trim()
  return !trimmed || /^https?:\/\/\S+$/i.test(trimmed)
}

/** 校驗使用者可編輯欄位；來源網址和證據截圖均為選填。 */
export const validateOfficerErrorReportDraft = (
  draft: Readonly<OfficerErrorReportDraft>,
): OfficerErrorReportValidationError[] => {
  const errors: OfficerErrorReportValidationError[] = []
  if (!draft.officerId.trim()) {
    errors.push({ field: 'officerId', message: '請選擇航海士' })
  }
  if (draft.errorTypes.length === 0) {
    errors.push({ field: 'errorTypes', message: '請至少選擇一種錯誤類型' })
  } else if (draft.errorTypes.some((type) => !ERROR_TYPES.has(type))) {
    errors.push({ field: 'errorTypes', message: '錯誤類型無效' })
  }
  if (!draft.description.trim()) {
    errors.push({ field: 'description', message: '請填寫錯誤說明' })
  }
  if (!draft.suggestedCorrection.trim()) {
    errors.push({ field: 'suggestedCorrection', message: '請填寫建議的正確內容' })
  }
  if (!isValidOptionalUrl(draft.sourceUrl)) {
    errors.push({ field: 'sourceUrl', message: '來源網址格式無效' })
  }
  if (draft.screenshotFileIds.length > 3) {
    errors.push({ field: 'screenshotFileIds', message: '證據截圖最多三張' })
  }
  return errors
}

const ADMIN_TRANSITIONS: Readonly<
  Record<OfficerErrorReportStatus, readonly OfficerErrorReportAction[]>
> = {
  pending: ['requestInfo', 'accept', 'reject'],
  needsInfo: ['requestInfo', 'accept', 'reject'],
  accepted: ['requestInfo', 'markFixed'],
  fixed: [],
  rejected: [],
}

/** 判斷角色能否對目前狀態執行指定動作。 */
export const canTransitionErrorReport = (
  status: OfficerErrorReportStatus,
  action: OfficerErrorReportAction,
  actorRole: OfficerErrorReportActorRole,
): boolean => {
  if (actorRole === 'owner') return status === 'needsInfo' && action === 'supplement'
  return ADMIN_TRANSITIONS[status].includes(action)
}
