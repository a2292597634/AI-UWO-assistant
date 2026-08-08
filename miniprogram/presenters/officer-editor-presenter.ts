/**
 * 新增航海士 — Presenter
 *
 * 构建表单视图模型：下拉选项、初始表单数据、校验错误映射。
 * 纯函数，无 UI 依赖。
 */

import type {
  OfficerEditorFormState,
  SkillGroupLabel,
  DropdownOption,
} from '../contracts/officer-editor'
import { RARITY_DISPLAY } from '../contracts/officer-editor'
import type { RuntimeDictionaries, RuntimeSkill } from '../contracts/runtime-data'

// ── 选项构建 ──

/** 稀有度选项（显示星级） */
export const buildRarityOptions = (
  dicts: RuntimeDictionaries,
): DropdownOption[] =>
  dicts.rarities.map((r) => ({
    id: r.id,
    name: RARITY_DISPLAY[r.id] ?? r.name,
  }))

/** 类型选项 */
export const buildTypeOptions = (dicts: RuntimeDictionaries): DropdownOption[] =>
  [...dicts.types].map((t) => ({ id: t.id, name: t.name }))

/** 性别选项 */
export const buildGenderOptions = (
  dicts: RuntimeDictionaries,
): DropdownOption[] =>
  [...dicts.genders].map((g) => ({ id: g.id, name: g.name }))

/** 职业选项 */
export const buildJobOptions = (dicts: RuntimeDictionaries): DropdownOption[] =>
  [...dicts.jobs]
    .map((j) => ({ id: j.id, name: j.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))

/** 国籍选项 */
export const buildNationalityOptions = (
  dicts: RuntimeDictionaries,
): DropdownOption[] =>
  [...dicts.nationalities]
    .map((n) => ({ id: n.id, name: n.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))

/** 城市选项 */
export const buildCityOptions = (
  dicts: RuntimeDictionaries,
): DropdownOption[] =>
  [...dicts.cities]
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))

/** 招募条件选项 */
export const buildRequirementOptions = (
  dicts: RuntimeDictionaries,
): DropdownOption[] =>
  [...dicts.requirements]
    .map((r) => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))

/** 语言选项 */
export const buildLanguageOptions = (
  dicts: RuntimeDictionaries,
): DropdownOption[] =>
  [...dicts.languages]
    .map((l) => ({ id: l.id, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))

/** 技能选项（从技能字典构建） */
export const buildSkillOptions = (
  skills: Readonly<Record<string, RuntimeSkill>>,
): DropdownOption[] =>
  Object.values(skills)
    .map((s) => ({ id: s.id, name: s.n }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))

/** 技能组别选项 */
export const GROUP_LABEL_OPTIONS: DropdownOption[] = [
  { id: '被動組0', name: '被動組0 (sk0)' },
  { id: '被動組1', name: '被動組1 (sk1)' },
  { id: '主動組0', name: '主動組0 (sk2)' },
  { id: '主動組1', name: '主動組1 (sk3)' },
  { id: '主動組2', name: '主動組2 (sk4)' },
  { id: '被動組2', name: '被動組2 (sk5)' },
]

// ── 初始页面数据构建 ──

/** 构建初始表单状态的完整选项集 */
export const buildInitialFormWithOptions = (
  dicts: RuntimeDictionaries,
  skills: Readonly<Record<string, RuntimeSkill>>,
): {
  rarityOptions: DropdownOption[]
  typeOptions: DropdownOption[]
  genderOptions: DropdownOption[]
  jobOptions: DropdownOption[]
  nationalityOptions: DropdownOption[]
  languageOptions: DropdownOption[]
  cityOptions: DropdownOption[]
  requirementOptions: DropdownOption[]
  skillOptions: DropdownOption[]
} => ({
  rarityOptions: buildRarityOptions(dicts),
  typeOptions: buildTypeOptions(dicts),
  genderOptions: buildGenderOptions(dicts),
  jobOptions: buildJobOptions(dicts),
  nationalityOptions: buildNationalityOptions(dicts),
  languageOptions: buildLanguageOptions(dicts),
  cityOptions: buildCityOptions(dicts),
  requirementOptions: buildRequirementOptions(dicts),
  skillOptions: buildSkillOptions(skills),
})

// ── 过滤后的技能选项（支持搜索） ──

/** 根据搜索文本过滤技能选项 */
export const filterSkillOptions = (
  allOptions: readonly DropdownOption[],
  searchText: string,
  limit: number,
): DropdownOption[] => {
  if (!searchText.trim()) return [...allOptions].slice(0, limit)
  const lower = searchText.trim().toLowerCase()
  return allOptions
    .filter((o) => o.name.toLowerCase().includes(lower))
    .slice(0, limit)
}

/** 根据搜索文本过滤职业选项 */
export const filterJobOptions = (
  allOptions: readonly DropdownOption[],
  searchText: string,
): DropdownOption[] => {
  if (!searchText.trim()) return [...allOptions]
  const lower = searchText.trim().toLowerCase()
  return allOptions.filter((o) => o.name.toLowerCase().includes(lower))
}

// ── View model 类型（供页面使用） ──

export interface LanguageRowView {
  key: string
  languageId: string
  languageName: string
  level: number
  languageIndex: number // picker 选中索引
}

export interface SkillRowView {
  key: string
  skillId: string
  skillName: string
  groupLabel: SkillGroupLabel
  groupIndex: number // picker 选中索引
  unlockLevel: number
  level: number
  expanded: boolean // 卡片展开状态
}

export interface RecruitmentViewData {
  cityIds: string[]
  cityNames: string[]
  requirementId: string | null
  requirementName: string
  requiredOfficerIds: string[]
  requiredOfficerNames: string[]
  note: string
}

export interface OfficerEditorPageData {
  // 表单值
  name: string
  rarityId: string
  rarityIndex: number
  isBoss: boolean
  typeId: string
  typeIndex: number
  genderId: string
  genderIndex: number
  jobId: string
  jobIndex: number
  jobSearchText: string
  filteredJobOptions: DropdownOption[]
  nationalityId: string
  nationalityIndex: number
  nationalitySearchText: string
  filteredNationalityOptions: DropdownOption[]
  portraitTempPath: string
  portraitFileId: string
  languages: LanguageRowView[]
  skills: SkillRowView[]
  recruitment: RecruitmentViewData
  sourceVoyageTw: string
  maintenanceNote: string
  // 下拉选项
  rarityOptions: DropdownOption[]
  typeOptions: DropdownOption[]
  genderOptions: DropdownOption[]
  jobOptions: DropdownOption[]
  nationalityOptions: DropdownOption[]
  languageOptions: DropdownOption[]
  cityOptions: DropdownOption[]
  requirementOptions: DropdownOption[]
  skillOptions: DropdownOption[]
  // 过滤后的技能选项
  skillSearchText: string
  filteredSkillOptions: DropdownOption[]
  // UI 状态
  submitting: boolean
  validationErrors: Record<string, string>
  canSubmit: boolean
}

/** 构建用于 setData 的完整页面数据 */
export const buildOfficerEditorPageData = (
  form: OfficerEditorFormState,
  options: ReturnType<typeof buildInitialFormWithOptions>,
  skillSearchText: string,
  jobSearchText: string,
  nationalitySearchText: string,
): OfficerEditorPageData => {
  // 查找已选中的 picker 索引
  const rarityIndex = options.rarityOptions.findIndex(
    (o) => o.id === form.rarityId,
  )
  const typeIndex = options.typeOptions.findIndex((o) => o.id === form.typeId)
  const genderIndex = options.genderOptions.findIndex(
    (o) => o.id === form.genderId,
  )
  const jobIndex = options.jobOptions.findIndex((o) => o.id === form.jobId)
  const nationalityIndex = options.nationalityOptions.findIndex(
    (o) => o.id === form.nationalityId,
  )

  // 语言视图
  const languageViews: LanguageRowView[] = form.languages.map((l) => ({
    ...l,
    languageIndex: options.languageOptions.findIndex(
      (o) => o.id === l.languageId,
    ),
  }))

  // 技能视图
  const skillViews: SkillRowView[] = form.skills.map((s) => ({
    ...s,
    groupIndex: GROUP_LABEL_OPTIONS.findIndex(
      (o) => o.id === s.groupLabel,
    ),
    expanded: false,
  }))

  // 过滤技能选项
  const filteredSkillOptions: DropdownOption[] = filterSkillOptions(
    options.skillOptions,
    skillSearchText,
    50,
  )

  // 过滤职业选项
  const filteredJobOptions: DropdownOption[] = filterJobOptions(
    options.jobOptions,
    jobSearchText,
  )

  // 过滤国籍选项
  const filteredNationalityOptions: DropdownOption[] = filterJobOptions(
    options.nationalityOptions,
    nationalitySearchText,
  )

  return {
    name: form.name,
    rarityId: form.rarityId,
    rarityIndex: rarityIndex >= 0 ? rarityIndex : 0,
    isBoss: form.isBoss,
    typeId: form.typeId,
    typeIndex: typeIndex >= 0 ? typeIndex : 0,
    genderId: form.genderId,
    genderIndex: genderIndex >= 0 ? genderIndex : 0,
    jobId: form.jobId,
    jobIndex: jobIndex >= 0 ? jobIndex : 0,
    jobSearchText,
    filteredJobOptions,
    nationalityId: form.nationalityId,
    nationalityIndex: nationalityIndex >= 0 ? nationalityIndex : 0,
    nationalitySearchText,
    filteredNationalityOptions,
    portraitTempPath: form.portraitTempPath,
    portraitFileId: form.portraitFileId,
    languages: languageViews,
    skills: skillViews,
    recruitment: form.recruitment,
    sourceVoyageTw: form.sourceVoyageTw,
    maintenanceNote: form.maintenanceNote,
    // 选项
    rarityOptions: options.rarityOptions,
    typeOptions: options.typeOptions,
    genderOptions: options.genderOptions,
    jobOptions: options.jobOptions,
    nationalityOptions: options.nationalityOptions,
    languageOptions: options.languageOptions,
    cityOptions: options.cityOptions,
    requirementOptions: options.requirementOptions,
    skillOptions: options.skillOptions,
    // 技能搜索
    skillSearchText,
    filteredSkillOptions,
    // UI 状态
    submitting: false,
    validationErrors: {},
    canSubmit: false,
  }
}
