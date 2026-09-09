import type {
  RuntimeCatalogEntry,
  RuntimeDictionaries,
  RuntimeDictionaryItem,
  RuntimeSkill,
} from './runtime-data'

/** 維護流程使用的正式 ID 字典；所有 ID 直接來自 canonical，保留完整前綴。 */
export type MaintenanceDictionaries = {
  readonly [Group in keyof RuntimeDictionaries]: readonly Readonly<RuntimeDictionaryItem>[]
}

/** 工單欲執行的航海士資料操作。 */
export type MaintenanceOperation = 'createOfficer' | 'updateOfficer'

/** 工單生命週期狀態。 */
export type MaintenanceStatus =
  'draft' | 'pendingReview' | 'approvedPendingPublish' | 'published' | 'rejected'

/** 尚未轉為正式 ID 的關聯資料候選項。 */
export interface ReferenceCandidate {
  readonly key: string
  readonly kind: 'skill' | 'job' | 'language' | 'nationality'
  readonly name: string
  readonly aliases: readonly string[]
  readonly categoryId?: string
  readonly description?: string
  readonly levelInfo?: string
}

/** 航海士語言能力的正式資料表示。 */
export interface MaintenanceLanguage {
  readonly languageId: string
  readonly level: number
}

/** 航海士技能關聯的正式資料表示。 */
export interface MaintenanceSkillRelation {
  readonly skillId: string
  readonly kind: 'active' | 'passive'
  readonly sourceGroup: 'sk0' | 'sk1' | 'sk2' | 'sk3' | 'sk4' | 'sk5'
  readonly slot: number
  readonly unlockLevel: number
  readonly level: number
}

/** 航海士招募資料的正式資料表示。 */
export interface MaintenanceRecruitment {
  readonly cityIds: readonly string[]
  readonly requirementId: string | null
  readonly requiredOfficerIds: readonly string[]
  readonly note: string | null
}

/** 工單中可由同步流程寫入正式資料的航海士欄位。 */
export interface MaintenanceOfficerData {
  readonly name: string
  readonly rarityId: string
  readonly visualGradeId: 'grade_2' | 'grade_3' | 'grade_4' | 'grade_5' | 'grade_6'
  readonly typeId: string
  readonly genderId: string
  readonly jobId: string
  readonly nationalityId: string
  readonly languages: readonly MaintenanceLanguage[]
  readonly skills: readonly MaintenanceSkillRelation[]
  readonly recruitment: MaintenanceRecruitment
  readonly portraitId: string | null
  readonly displayOrder: number
  readonly maintenanceNote?: string
}

/** 使用者儲存或送審的工單草稿。 */
export interface MaintenanceWorkOrderDraft {
  readonly operation: MaintenanceOperation
  readonly targetOfficerId: string | null
  readonly baseDataVersion: string | null
  readonly baseSnapshot: MaintenanceOfficerData | null
  readonly proposedData: MaintenanceOfficerData
  readonly referenceCandidates: readonly ReferenceCandidate[]
}

/** 前端校驗所需的正式資料參照。 */
export interface MaintenanceValidationContext {
  readonly dictionaries: MaintenanceDictionaries
  readonly skills: readonly RuntimeSkill[]
  readonly officers: readonly Pick<RuntimeCatalogEntry, 'id'>[]
}

/** 單一工單欄位的校驗失敗。 */
export interface MaintenanceValidationError {
  readonly field: string
  readonly message: string
}

/** 將巢狀資料轉為僅讀快照的遞迴型別。 */
export type ReadonlyDeep<T> = T extends readonly (infer Item)[]
  ? readonly ReadonlyDeep<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> }
    : T

/** 可供審核頁呈現的單一欄位差異。 */
export interface MaintenanceWorkOrderDiffEntry {
  readonly field: keyof MaintenanceOfficerData
  readonly before: ReadonlyDeep<MaintenanceOfficerData[keyof MaintenanceOfficerData]>
  readonly after: ReadonlyDeep<MaintenanceOfficerData[keyof MaintenanceOfficerData]>
}

/** 工單對提交者安全公開的不可變操作紀錄。 */
export interface MaintenanceWorkOrderHistoryEntry {
  readonly action: string
  readonly reason: string | null
  readonly at: string
  readonly revision: number
  readonly actorRole: 'owner' | 'admin'
}
