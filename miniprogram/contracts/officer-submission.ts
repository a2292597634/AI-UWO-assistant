/**
 * 航海士资料投稿与审核契约。
 *
 * 投稿者只接触人类可读的表单字段；技能组别、kind、slot、状态和审核记录
 * 属于服务端或小程序管理员使用的边界，不由普通投稿者直接提交。
 */

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'published'

export type SubmissionStatusTone = 'review' | 'error' | 'success'

export type SubmissionPortraitMimeType = 'image/png' | 'image/jpeg'

export const MAX_PORTRAIT_BYTES = 512 * 1024
export const MAX_PORTRAIT_EDGE = 512

export interface SubmissionPortraitMeta {
  mimeType: SubmissionPortraitMimeType
  byteSize: number
  width: number
  height: number
}

export interface SubmissionPortraitState {
  tempFilePath: string
  fileId: string
  mimeType: SubmissionPortraitMimeType | ''
  byteSize: number
  width: number
  height: number
}

export interface SubmissionLanguageFormRow {
  key: string
  languageId: string
  languageName: string
  level: number
}

export interface SubmissionSkillFormRow {
  key: string
  skillId: string
  skillName: string
  unlockLevel: number
  level: number
}

export interface SubmissionRecruitmentForm {
  cityIds: string[]
  cityNames: string[]
  requirementId: string | null
  requirementName: string
  requiredOfficerIds: string[]
  requiredOfficerNames: string[]
}

export interface OfficerSubmissionFormState {
  name: string
  rarityId: string
  typeId: string
  genderId: string
  jobId: string
  nationalityId: string
  portrait: SubmissionPortraitState | null
  languages: SubmissionLanguageFormRow[]
  skills: SubmissionSkillFormRow[]
  recruitment: SubmissionRecruitmentForm
}

export interface SubmissionValidationContext {
  validRarityIds: ReadonlySet<string>
  validTypeIds: ReadonlySet<string>
  validGenderIds: ReadonlySet<string>
  validJobIds: ReadonlySet<string>
  validNationalityIds: ReadonlySet<string>
  validLanguageIds: ReadonlySet<string>
  validSkillIds: ReadonlySet<string>
  validCityIds: ReadonlySet<string>
  validRequirementIds: ReadonlySet<string>
  validOfficerIds: ReadonlySet<string>
}

export interface SubmissionValidationError {
  field: string
  message: string
}

export type SubmissionSourceGroup = 'sk0' | 'sk1' | 'sk2' | 'sk3' | 'sk4' | 'sk5'

export interface SubmissionReviewSkillFields {
  skillId: string
  kind: 'active' | 'passive'
  sourceGroup: SubmissionSourceGroup
  slot: number
}

export interface OfficerSubmissionReviewFields {
  visualGradeId: 'grade_2' | 'grade_3' | 'grade_4' | 'grade_5' | 'grade_6'
  skills: SubmissionReviewSkillFields[]
}

export interface SubmissionStatusView {
  label: string
  reason: string
  tone: SubmissionStatusTone
}

export interface SubmissionStatusViewInput {
  status: SubmissionStatus
  rejectReason: string | null | undefined
}

export interface SubmissionFormData {
  name: string
  rarityId: string
  typeId: string
  genderId: string
  jobId: string
  nationalityId: string
  languages: Array<{ languageId: string; level: number }>
  skills: Array<{ skillId: string; unlockLevel: number; level: number }>
  recruitment: {
    cityIds: string[]
    requirementId: string | null
    requiredOfficerIds: string[]
  }
  portraitFileId: string
}

export interface OfficerSubmissionMutationResult {
  submissionId: string
  revision: number
  status: SubmissionStatus
  createdAt?: string
  updatedAt?: string
  message?: string
}

export interface OfficerSubmissionSummary {
  submissionId: string
  revision: number
  name: string
  portraitFileId: string
  createdAt: string
  updatedAt: string
  status: SubmissionStatus
  skillCount: number
  hasRecruitment: boolean
  rejectReason: string | null
}

export interface OfficerSubmissionReviewState extends OfficerSubmissionReviewFields {
  reviewerUid: string | null
  reviewedAt: string | null
  rejectReason: string | null
}

export interface OfficerSubmissionPublishState {
  datasetVersion: string | null
  publishedAt: string | null
}

export interface OfficerSubmissionHistoryEntry {
  action: string
  reason: string | null
  at: string
  revision: number
  actorRole?: 'owner' | 'admin' | 'sync'
}

export interface OfficerSubmissionRecord {
  submissionId: string
  status: SubmissionStatus
  revision: number
  formData: SubmissionFormData
  canonicalData: Record<string, unknown> | null
  review: OfficerSubmissionReviewState
  publish: OfficerSubmissionPublishState
  history: OfficerSubmissionHistoryEntry[]
  createdAt: string
  updatedAt: string
}
