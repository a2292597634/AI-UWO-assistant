/**
 * 新增航海士 — 领域逻辑
 *
 * 表单状态管理、字段校验、ID 自动生成、CanonicalOfficer 序列化。
 * 纯函数，无 UI 依赖。
 */

import type {
  OfficerEditorFormState,
  LanguageFormRow,
  SkillFormRow,
  SkillGroupLabel,
  OfficerEditorValidationError,
  VisualGradeId,
} from '../contracts/officer-editor'
import {
  GROUP_LABEL_TO_SOURCE,
  SOURCE_GROUP_KIND,
  RARITY_TO_VISUAL_GRADE,
} from '../contracts/officer-editor'
import type {
  OfficerSubmissionFormState,
  OfficerSubmissionReviewFields,
  SubmissionFormData,
  SubmissionValidationContext,
  SubmissionValidationError,
} from '../contracts/officer-submission'
import { MAX_PORTRAIT_BYTES, MAX_PORTRAIT_EDGE } from '../contracts/officer-submission'

// ── 常量 ──

/** 语言等级范围 */
const LANG_LEVEL_MIN = 1
const LANG_LEVEL_MAX = 10

/** 技能等级范围；解锁等级只要求为正整数，可使用多位数。 */
const SKILL_LEVEL_MIN = 1
const SKILL_LEVEL_MAX = 9

/** 名称最大长度（字符数，约 50 个汉字） */
const MAX_NAME_LENGTH = 50

/** 语言 ID 前缀（master 规范格式） */
const LANGUAGE_PREFIX = 'language_'

/** 国籍 ID 前缀 */
const NATIONALITY_PREFIX = 'nationality_'

/** 城市 ID 前缀 */
const CITY_PREFIX = 'city_'

/** 招募条件 ID 前缀 */
const REQUIREMENT_PREFIX = 'requirement_'

const SUBMISSION_MAX_NAME_LENGTH = 50

let _submissionSkillRowCounter = 0

// ── 初始表单 ──

/** 创建初始空表单状态 */
export const createEmptyFormState = (): OfficerEditorFormState => ({
  name: '',
  rarityId: '',
  isBoss: false,
  typeId: '',
  genderId: '',
  jobId: '',
  nationalityId: '',
  portraitTempPath: '',
  portraitFileId: '',
  languages: [],
  skills: [],
  recruitment: {
    cityIds: [],
    cityNames: [],
    requirementId: null,
    requirementName: '',
    requiredOfficerIds: [],
    requiredOfficerNames: [],
    note: '',
  },
  sourceVoyageTw: '',
  maintenanceNote: '',
})

/** 创建新的两步投稿表单。 */
export const createEmptySubmissionForm = (): OfficerSubmissionFormState => ({
  name: '',
  rarityId: '',
  typeId: '',
  genderId: '',
  jobId: '',
  nationalityId: '',
  portrait: null,
  languages: [],
  skills: [],
  recruitment: {
    cityIds: [],
    cityNames: [],
    requirementId: null,
    requirementName: '',
    requiredOfficerIds: [],
    requiredOfficerNames: [],
  },
})

/** 创建新的投稿技能行，解锁等级默认从 1 开始。 */
export const createEmptySubmissionSkillRow = () => {
  _submissionSkillRowCounter += 1
  return {
    key: `submission-skill-${_submissionSkillRowCounter}`,
    skillId: '',
    skillName: '',
    unlockLevel: 1,
    level: 1,
  }
}

const hasValue = (value: string): boolean => value.trim().length > 0

const pushInvalidId = (
  errors: SubmissionValidationError[],
  field: string,
  value: string,
  validIds: ReadonlySet<string>,
  emptyMessage: string,
  invalidMessage: string,
): void => {
  if (!hasValue(value)) {
    errors.push({ field, message: emptyMessage })
  } else if (!validIds.has(value)) {
    errors.push({ field, message: invalidMessage })
  }
}

/** 校验投稿者可编辑的完整资料。 */
export const validateSubmissionForm = (
  form: OfficerSubmissionFormState,
  ctx: SubmissionValidationContext,
): SubmissionValidationError[] => {
  const errors: SubmissionValidationError[] = []
  const name = form.name.trim()

  if (!name) errors.push({ field: 'name', message: '請輸入航海士名稱' })
  else if ([...name].length > SUBMISSION_MAX_NAME_LENGTH) {
    errors.push({ field: 'name', message: `名稱不可超過 ${SUBMISSION_MAX_NAME_LENGTH} 個字元` })
  }

  pushInvalidId(errors, 'rarityId', form.rarityId, ctx.validRarityIds, '請選擇稀有度', '稀有度無效')
  pushInvalidId(errors, 'typeId', form.typeId, ctx.validTypeIds, '請選擇類型', '類型無效')
  pushInvalidId(errors, 'genderId', form.genderId, ctx.validGenderIds, '請選擇性別', '性別無效')
  pushInvalidId(errors, 'jobId', form.jobId, ctx.validJobIds, '請選擇有效的職業', '職業無效')
  pushInvalidId(
    errors,
    'nationalityId',
    form.nationalityId,
    ctx.validNationalityIds,
    '請選擇有效的國籍',
    '國籍無效',
  )

  const portrait = form.portrait
  if (!portrait || (!hasValue(portrait.tempFilePath) && !hasValue(portrait.fileId))) {
    errors.push({ field: 'portrait', message: '請上傳正式版頭像' })
  } else if (hasValue(portrait.tempFilePath) || !hasValue(portrait.fileId)) {
    if (portrait.mimeType !== 'image/png' && portrait.mimeType !== 'image/jpeg') {
      errors.push({ field: 'portrait', message: '頭像格式只支援 PNG、JPG 或 JPEG' })
    }
    if (!Number.isInteger(portrait.byteSize) || portrait.byteSize <= 0) {
      errors.push({ field: 'portrait', message: '無法讀取頭像檔案大小，請重新選擇' })
    } else if (portrait.byteSize > MAX_PORTRAIT_BYTES) {
      errors.push({ field: 'portrait', message: '頭像檔案不可超過 512 KB' })
    }
    if (
      !Number.isInteger(portrait.width) ||
      !Number.isInteger(portrait.height) ||
      portrait.width <= 0 ||
      portrait.height <= 0
    ) {
      errors.push({ field: 'portrait', message: '無法讀取頭像尺寸，請重新選擇' })
    } else if (Math.max(portrait.width, portrait.height) > MAX_PORTRAIT_EDGE) {
      errors.push({ field: 'portrait', message: '頭像最長邊不可超過 512 px' })
    }
  }

  if (form.languages.length === 0) {
    errors.push({ field: 'languages', message: '請至少新增一種語言能力' })
  }
  const languageIds = new Set<string>()
  for (const [index, language] of form.languages.entries()) {
    const field = `languages[${index}].languageId`
    pushInvalidId(
      errors,
      field,
      language.languageId,
      ctx.validLanguageIds,
      '請選擇語言',
      '無效的語言',
    )
    if (languageIds.has(language.languageId)) errors.push({ field, message: '語言不可重複' })
    languageIds.add(language.languageId)
    if (!Number.isInteger(language.level) || language.level < 1 || language.level > 10) {
      errors.push({
        field: `languages[${index}].level`,
        message: '語言等級範圍 1-10',
      })
    }
  }

  if (form.skills.length === 0) {
    errors.push({ field: 'skills', message: '請至少新增一項技能' })
  }
  const skillIds = new Set<string>()
  for (const [index, skill] of form.skills.entries()) {
    const field = `skills[${index}].skillId`
    pushInvalidId(errors, field, skill.skillId, ctx.validSkillIds, '請選擇技能', '無效的技能')
    if (skillIds.has(skill.skillId)) errors.push({ field, message: '技能不可重複' })
    skillIds.add(skill.skillId)
    if (!Number.isInteger(skill.unlockLevel) || skill.unlockLevel < 1) {
      errors.push({ field: `skills[${index}].unlockLevel`, message: '解鎖等級不可小於 1' })
    }
    if (
      !Number.isInteger(skill.level) ||
      skill.level < SKILL_LEVEL_MIN ||
      skill.level > SKILL_LEVEL_MAX
    ) {
      errors.push({
        field: `skills[${index}].level`,
        message: `技能等級範圍 ${SKILL_LEVEL_MIN}-${SKILL_LEVEL_MAX}`,
      })
    }
  }

  const recruitment = form.recruitment
  const cityIds = new Set<string>()
  for (const [index, cityId] of recruitment.cityIds.entries()) {
    const field = `recruitment.cityIds[${index}]`
    pushInvalidId(errors, field, cityId, ctx.validCityIds, '請選擇招募城市', '招募城市無效')
    if (cityIds.has(cityId)) errors.push({ field, message: '招募城市不可重複' })
    cityIds.add(cityId)
  }
  if (recruitment.requirementId !== null) {
    pushInvalidId(
      errors,
      'recruitment.requirementId',
      recruitment.requirementId,
      ctx.validRequirementIds,
      '請選擇招募條件',
      '招募條件無效',
    )
  }
  const requiredOfficerIds = new Set<string>()
  for (const [index, officerId] of recruitment.requiredOfficerIds.entries()) {
    const field = `recruitment.requiredOfficerIds[${index}]`
    pushInvalidId(
      errors,
      field,
      officerId,
      ctx.validOfficerIds,
      '請選擇前置航海士',
      '前置航海士無效',
    )
    if (requiredOfficerIds.has(officerId)) errors.push({ field, message: '前置航海士不可重複' })
    requiredOfficerIds.add(officerId)
  }

  return errors
}

const withPrefix = (value: string, prefix: string): string =>
  value.startsWith(prefix) ? value : `${prefix}${value}`

export const getDefaultSubmissionVisualGrade = (
  rarityId: string,
): OfficerSubmissionReviewFields['visualGradeId'] => {
  if (rarityId === 'rarity_2') return 'grade_2'
  if (rarityId === 'rarity_3') return 'grade_3'
  if (rarityId === 'rarity_4') return 'grade_4'
  return 'grade_5'
}

/** 构建仅供审核页展示的 Canonical 预览，不作为投稿 payload 发送。 */
export const buildSubmissionCanonicalPreview = (
  form: OfficerSubmissionFormState,
  reviewFields: OfficerSubmissionReviewFields,
  submissionId: string,
): Record<string, unknown> => {
  const reviewSkills = new Map(reviewFields.skills.map((skill) => [skill.skillId, skill]))
  const skillsByGroup = new Map<string, number>()
  const skills = form.skills
    .filter((skill) => skill.skillId)
    .map((skill) => {
      const reviewed = reviewSkills.get(skill.skillId)
      const sourceGroup = reviewed?.sourceGroup ?? 'sk0'
      const slot = reviewed?.slot ?? skillsByGroup.get(sourceGroup) ?? 0
      skillsByGroup.set(sourceGroup, Math.max(skillsByGroup.get(sourceGroup) ?? 0, slot + 1))
      return {
        skillId: skill.skillId,
        kind: reviewed?.kind ?? 'passive',
        sourceGroup,
        slot,
        unlockLevel: skill.unlockLevel,
        level: skill.level,
      }
    })

  return {
    id: `officer_custom_${submissionId}`,
    name: form.name.trim(),
    rarityId: form.rarityId,
    visualGradeId: reviewFields.visualGradeId || getDefaultSubmissionVisualGrade(form.rarityId),
    typeId: form.typeId,
    genderId: form.genderId,
    jobId: form.jobId,
    nationalityId: withPrefix(form.nationalityId, NATIONALITY_PREFIX),
    languages: form.languages
      .filter((language) => language.languageId)
      .map((language) => ({
        languageId: withPrefix(language.languageId, LANGUAGE_PREFIX),
        level: language.level,
      })),
    skills,
    recruitment: {
      cityIds: form.recruitment.cityIds
        .filter((cityId) => cityId)
        .map((cityId) => withPrefix(cityId, CITY_PREFIX)),
      requirementId: form.recruitment.requirementId
        ? withPrefix(form.recruitment.requirementId, REQUIREMENT_PREFIX)
        : null,
      requiredOfficerIds: form.recruitment.requiredOfficerIds.filter((officerId) => officerId),
      note: null,
    },
    portraitId: null,
    displayOrder: 0,
    sourceRefs: { submissionId },
  }
}

/** 只把允许进入 CloudBase 的人类表单字段序列化成 payload。 */
export const toSubmissionFormData = (form: OfficerSubmissionFormState): SubmissionFormData => ({
  name: form.name.trim(),
  rarityId: form.rarityId,
  typeId: form.typeId,
  genderId: form.genderId,
  jobId: form.jobId,
  nationalityId: form.nationalityId,
  languages: form.languages.map(({ languageId, level }) => ({ languageId, level })),
  skills: form.skills.map(({ skillId, unlockLevel, level }) => ({
    skillId,
    unlockLevel,
    level,
  })),
  recruitment: {
    cityIds: form.recruitment.cityIds,
    requirementId: form.recruitment.requirementId,
    requiredOfficerIds: form.recruitment.requiredOfficerIds,
  },
  portraitFileId: form.portrait?.fileId ?? '',
})

// ── ID 生成 ──

/**
 * 生成唯一 officer ID。
 * 优先使用 voyage.tw 来源 ID；否则用时间戳 + 随机数。
 */
export const generateOfficerId = (
  sourceVoyageTw: string,
  existingIds: ReadonlySet<string>,
): string => {
  // 如果提供了来源 ID，使用规范格式
  const trimmed = sourceVoyageTw.trim()
  if (trimmed.length > 0) {
    const candidate = `officer_${trimmed}`
    if (!existingIds.has(candidate)) return candidate
    // 冲突时追加后缀
    let suffix = 1
    while (existingIds.has(`${candidate}_${suffix}`)) suffix++
    return `${candidate}_${suffix}`
  }

  // 无来源 ID：用日期 + 随机数生成
  const now = new Date()
  const datePart = [
    now.getFullYear().toString(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const hexPart = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0')
  const candidate = `officer_custom_${datePart}_${hexPart}`
  if (!existingIds.has(candidate)) return candidate
  // 极小概率冲突，追加随机位
  const extra = Math.floor(Math.random() * 0xff)
    .toString(16)
    .padStart(2, '0')
  return `officer_custom_${datePart}_${hexPart}${extra}`
}

// ── VisualGrade 推导 ──

/** 根据稀有度 ID 和 Boss 标志推导 visualGradeId */
export const deriveVisualGrade = (rarityId: string, isBoss: boolean): VisualGradeId => {
  if (isBoss) return 'grade_6'
  const grade = RARITY_TO_VISUAL_GRADE[rarityId]
  if (grade) return grade
  // 默认兜底
  return 'grade_5'
}

// ── 技能槽位自动分配 ──

/** 计算同一 sourceGroup 内下一个可用槽位 */
export const computeSkillSlot = (
  groupLabel: SkillGroupLabel,
  existingSkills: readonly SkillFormRow[],
): number => {
  const sourceGroup = GROUP_LABEL_TO_SOURCE[groupLabel]
  const usedSlots = existingSkills
    .filter((s) => GROUP_LABEL_TO_SOURCE[s.groupLabel] === sourceGroup)
    .map(() => 1)
  return usedSlots.length
}

// ── 行工厂函数 ──

let _langRowCounter = 0
let _skillRowCounter = 0

/** 创建一个空语言行 */
export const createEmptyLanguageRow = (): LanguageFormRow => {
  _langRowCounter++
  return {
    key: `lang-${_langRowCounter}`,
    languageId: '',
    languageName: '',
    level: 1,
  }
}

/** 创建一个空技能行 */
export const createEmptySkillRow = (): SkillFormRow => {
  _skillRowCounter++
  return {
    key: `skill-${_skillRowCounter}`,
    skillId: '',
    skillName: '',
    groupLabel: '被動組0',
    unlockLevel: 1,
    level: 1,
  }
}

// ── 校验 ──

export interface ValidationContext {
  /** 所有已存在的 officer ID（用于查重） */
  existingOfficerIds: ReadonlySet<string>
  /** 有效的语言 ID 集合（运行时词典，短格式如 "lang70"） */
  validLanguageIds: ReadonlySet<string>
  /** 有效的技能 ID 集合 */
  validSkillIds: ReadonlySet<string>
  /** 有效的职业 ID 集合 */
  validJobIds: ReadonlySet<string>
  /** 有效的国籍 ID 集合 */
  validNationalityIds: ReadonlySet<string>
}

/**
 * 全量表单校验。
 * 返回错误列表；空数组表示通过。
 */
export const validateOfficerForm = (
  form: OfficerEditorFormState,
  ctx: ValidationContext,
): OfficerEditorValidationError[] => {
  const errors: OfficerEditorValidationError[] = []

  // 名称
  if (!form.name || form.name.trim().length === 0) {
    errors.push({ field: 'name', message: '請輸入航海士名稱' })
  } else if ([...form.name.trim()].length > MAX_NAME_LENGTH) {
    errors.push({
      field: 'name',
      message: `名稱不可超過 ${MAX_NAME_LENGTH} 個字元`,
    })
  }

  // 稀有度
  if (!form.rarityId) {
    errors.push({ field: 'rarityId', message: '請選擇稀有度' })
  }

  // 类型
  if (!form.typeId) {
    errors.push({ field: 'typeId', message: '請選擇類型' })
  }

  // 性别
  if (!form.genderId) {
    errors.push({ field: 'genderId', message: '請選擇性別' })
  }

  // 职业
  if (!form.jobId || !ctx.validJobIds.has(form.jobId)) {
    errors.push({ field: 'jobId', message: '請選擇有效的職業' })
  }

  // 国籍
  if (!form.nationalityId || !ctx.validNationalityIds.has(form.nationalityId)) {
    errors.push({ field: 'nationalityId', message: '請選擇有效的國籍' })
  }

  // 头像
  if (!form.portraitTempPath && !form.portraitFileId) {
    errors.push({ field: 'portrait', message: '請上傳頭像' })
  }

  // 语言
  const seenLangIds = new Set<string>()
  for (let i = 0; i < form.languages.length; i++) {
    const lang = form.languages[i]!
    const prefix = `languages[${i}]`
    if (!lang.languageId) {
      errors.push({ field: `${prefix}.languageId`, message: '請選擇語言' })
    } else if (!ctx.validLanguageIds.has(lang.languageId)) {
      errors.push({
        field: `${prefix}.languageId`,
        message: '無效的語言',
      })
    } else if (seenLangIds.has(lang.languageId)) {
      errors.push({
        field: `${prefix}.languageId`,
        message: '語言不可重複',
      })
    }
    seenLangIds.add(lang.languageId)

    if (
      !Number.isInteger(lang.level) ||
      lang.level < LANG_LEVEL_MIN ||
      lang.level > LANG_LEVEL_MAX
    ) {
      errors.push({
        field: `${prefix}.level`,
        message: `語言等級範圍 ${LANG_LEVEL_MIN}-${LANG_LEVEL_MAX}`,
      })
    }
  }

  // 技能
  const seenSkillIds = new Set<string>()
  for (let i = 0; i < form.skills.length; i++) {
    const skill = form.skills[i]!
    const prefix = `skills[${i}]`
    if (!skill.skillId) {
      errors.push({ field: `${prefix}.skillId`, message: '請選擇技能' })
    } else if (!ctx.validSkillIds.has(skill.skillId)) {
      errors.push({
        field: `${prefix}.skillId`,
        message: '無效的技能',
      })
    } else if (seenSkillIds.has(skill.skillId)) {
      errors.push({
        field: `${prefix}.skillId`,
        message: '技能不可重複',
      })
    }
    seenSkillIds.add(skill.skillId)

    if (!Number.isInteger(skill.unlockLevel) || skill.unlockLevel < SKILL_LEVEL_MIN) {
      errors.push({
        field: `${prefix}.unlockLevel`,
        message: `解鎖等級不可小於 ${SKILL_LEVEL_MIN}`,
      })
    }

    if (
      !Number.isInteger(skill.level) ||
      skill.level < SKILL_LEVEL_MIN ||
      skill.level > SKILL_LEVEL_MAX
    ) {
      errors.push({
        field: `${prefix}.level`,
        message: `技能等級範圍 ${SKILL_LEVEL_MIN}-${SKILL_LEVEL_MAX}`,
      })
    }
  }

  return errors
}

// ── CanonicalOfficer 构建 ──

/**
 * 将用户填写的表单（名称选择）转换为标准 CanonicalOfficer（全部 ID）。
 * 这是整个领域层最核心的函数。
 */
export const buildCanonicalOfficerFromForm = (
  form: OfficerEditorFormState,
  officerId: string,
  maxDisplayOrder: number,
): Record<string, unknown> => {
  // 语言：短格式 ID → 规范格式 ID（加 language_ 前缀）
  const languages = form.languages
    .filter((l) => l.languageId)
    .map((l) => ({
      languageId: `${LANGUAGE_PREFIX}${l.languageId}`,
      level: l.level,
    }))

  // 技能：组别标签 → sourceGroup，自动推导 kind，自动分配 slot
  const skillsByGroup = new Map<string, number>()
  const skills = form.skills
    .filter((s) => s.skillId)
    .map((s) => {
      const sourceGroup = GROUP_LABEL_TO_SOURCE[s.groupLabel]
      const slot = skillsByGroup.get(sourceGroup) ?? 0
      skillsByGroup.set(sourceGroup, slot + 1)
      return {
        skillId: s.skillId,
        kind: SOURCE_GROUP_KIND[sourceGroup] ?? 'passive',
        sourceGroup,
        slot,
        unlockLevel: s.unlockLevel,
        level: s.level,
      }
    })

  // 招募信息
  const recruitment = {
    cityIds: form.recruitment.cityIds
      .filter((id) => id)
      .map((id) => (id.startsWith(CITY_PREFIX) ? id : `${CITY_PREFIX}${id}`)),
    requirementId: form.recruitment.requirementId
      ? form.recruitment.requirementId.startsWith(REQUIREMENT_PREFIX)
        ? form.recruitment.requirementId
        : `${REQUIREMENT_PREFIX}${form.recruitment.requirementId}`
      : null,
    requiredOfficerIds: form.recruitment.requiredOfficerIds.filter((id) => id),
    note: form.recruitment.note.trim() || null,
  }

  // 来源引用
  const sourceVoyageTw = form.sourceVoyageTw.trim()
  const sourceRefs: Record<string, unknown> = sourceVoyageTw
    ? { voyageTw: sourceVoyageTw }
    : { manual: true }

  // visualGradeId
  const visualGradeId = deriveVisualGrade(form.rarityId, form.isBoss)

  return {
    id: officerId,
    name: form.name.trim(),
    rarityId: form.rarityId,
    visualGradeId,
    typeId: form.typeId,
    genderId: form.genderId,
    jobId: form.jobId,
    nationalityId: form.nationalityId.startsWith(NATIONALITY_PREFIX)
      ? form.nationalityId
      : `${NATIONALITY_PREFIX}${form.nationalityId}`,
    languages,
    skills,
    recruitment,
    portraitId: form.portraitFileId || null,
    displayOrder: maxDisplayOrder + 1,
    sourceRefs,
    ...(form.maintenanceNote.trim() ? { maintenanceNote: form.maintenanceNote.trim() } : {}),
  }
}

// ── 辅助：从现有 catalog 构建 ID 集合 ──

/** 从 catalog 条目收集所有已有 officer ID */
export const collectExistingOfficerIds = (catalog: readonly { id: string }[]): Set<string> =>
  new Set(catalog.map((o) => o.id))

/** 获取当前最大 displayOrder */
export const getMaxDisplayOrder = (catalog: readonly { displayOrder?: number }[]): number => {
  let max = 0
  for (const o of catalog) {
    if ((o.displayOrder ?? 0) > max) max = o.displayOrder ?? 0
  }
  return max
}
