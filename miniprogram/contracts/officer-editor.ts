/**
 * 新增航海士编辑器 — 契约类型
 *
 * 定义表单状态、校验结果、下拉选项等纯类型接口。
 * 用户表单中所有引用字段均为人类可读名称，ID 由 domain 层自动生成。
 */

// VisualGradeId：视觉档位，grade_2 ~ grade_6，Boss 角色强制 grade_6
export type VisualGradeId = 'grade_2' | 'grade_3' | 'grade_4' | 'grade_5' | 'grade_6'

// ── 下拉选项 ──

/** 通用下拉选项（名称 → ID 映射） */
export interface DropdownOption {
  id: string
  name: string
}

// ── 表单行数据 ──

/** 语言能力表单行 */
export interface LanguageFormRow {
  /** 客户端唯一标识（wx:key 用） */
  key: string
  /** 选中的语言 ID（来自词典 languages） */
  languageId: string
  /** 语言显示名称 */
  languageName: string
  /** 语言等级（1-10） */
  level: number
}

/** 技能组别（用户可见中文标签 → 系统 sk0~sk5） */
export type SkillGroupLabel = '被動組0' | '被動組1' | '主動組0' | '主動組1' | '主動組2' | '被動組2'

/** 技能表单行 */
export interface SkillFormRow {
  /** 客户端唯一标识（wx:key 用） */
  key: string
  /** 选中的技能 ID */
  skillId: string
  /** 技能显示名称 */
  skillName: string
  /** 技能组别中文标签 */
  groupLabel: SkillGroupLabel
  /** 解锁等级（≥1） */
  unlockLevel: number
  /** 技能等级（≥1） */
  level: number
}

/** 招募信息子表单 */
export interface RecruitmentFormView {
  /** 选中的城市 ID 列表 */
  cityIds: string[]
  /** 城市显示名称列表（与 cityIds 一一对应） */
  cityNames: string[]
  /** 招募条件 ID（null 表示无条件） */
  requirementId: string | null
  /** 招募条件名称 */
  requirementName: string
  /** 所需前置航海士 ID 列表 */
  requiredOfficerIds: string[]
  /** 所需前置航海士名称列表 */
  requiredOfficerNames: string[]
  /** 招募备注 */
  note: string
}

// ── 完整表单状态（非响应式，存于 WeakMap） ──

export interface OfficerEditorFormState {
  /** 航海士名称（繁体中文） */
  name: string
  /** 选中的稀有度 ID */
  rarityId: string
  /** 是否为 Boss 角色 */
  isBoss: boolean
  /** 选中的类型 ID */
  typeId: string
  /** 选中的性别 ID */
  genderId: string
  /** 选中的职业 ID */
  jobId: string
  /** 选中的国籍 ID */
  nationalityId: string
  /** 头像临时路径（本地预览） */
  portraitTempPath: string
  /** 头像 CloudBase fileID（上传后获得） */
  portraitFileId: string
  /** 语言列表 */
  languages: LanguageFormRow[]
  /** 技能列表 */
  skills: SkillFormRow[]
  /** 招募信息 */
  recruitment: RecruitmentFormView
  /** voyage.tw 原始来源 ID（可选） */
  sourceVoyageTw: string
  /** 维护备注 */
  maintenanceNote: string
}

// ── 校验 ──

/** 单条校验错误 */
export interface OfficerEditorValidationError {
  /** 字段路径（如 "languages[0].level" 或 "name"） */
  field: string
  /** 错误消息 */
  message: string
}

/** 校验结果：通过则 errors 为空数组 */
export interface OfficerEditorValidationResult {
  errors: OfficerEditorValidationError[]
}

// ── 提交 ──

/** 提交到云函数的数据结构 */
export interface OfficerSubmitPayload {
  /** 预生成的 officer ID */
  officerId: string
  /** 完整的 CanonicalOfficer 数据 */
  canonicalData: Record<string, unknown>
  /** 头像 CloudBase fileID（已上传） */
  portraitFileId: string
}

/** 云函数返回结果 */
export interface OfficerSubmitResult {
  ok: boolean
  officerId?: string
  code?: string
  message?: string
}

// ── 组别映射常量（由 domain 层使用，这里定义类型） ──

/** 中文标签 → sourceGroup 映射 */
export const GROUP_LABEL_TO_SOURCE: Record<SkillGroupLabel, string> = {
  被動組0: 'sk0',
  被動組1: 'sk1',
  主動組0: 'sk2',
  主動組1: 'sk3',
  主動組2: 'sk4',
  被動組2: 'sk5',
}

/** sourceGroup → 中文标签反向映射 */
export const SOURCE_TO_GROUP_LABEL: Record<string, SkillGroupLabel> = {
  sk0: '被動組0',
  sk1: '被動組1',
  sk2: '主動組0',
  sk3: '主動組1',
  sk4: '主動組2',
  sk5: '被動組2',
}

/** sourceGroup → kind 自动推导 */
export const SOURCE_GROUP_KIND: Record<string, 'active' | 'passive'> = {
  sk0: 'passive',
  sk1: 'passive',
  sk2: 'active',
  sk3: 'active',
  sk4: 'active',
  sk5: 'passive',
}

/** 稀有度 ID → visualGradeId 默认映射 */
export const RARITY_TO_VISUAL_GRADE: Record<string, VisualGradeId> = {
  rarity_5: 'grade_5',
  rarity_4: 'grade_4',
  rarity_3: 'grade_3',
  rarity_2: 'grade_2',
}

/** 稀有度 ID → 显示星级 */
export const RARITY_DISPLAY: Record<string, string> = {
  rarity_5: '★★★★★',
  rarity_4: '★★★★',
  rarity_3: '★★★',
  rarity_2: '★★',
}
