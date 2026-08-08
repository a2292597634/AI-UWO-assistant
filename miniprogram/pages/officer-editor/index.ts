/**
 * 新增航海士 — 页面控制器
 *
 * 遵循两层状态模式：PageData（响应式）+ PageState（WeakMap 非响应式）。
 */

import {
  getCatalog,
  getDictionaries,
  getSkills,
  addCachedCustomOfficer,
} from '../../runtime/main-data-store'
import type { RuntimeDictionaries, RuntimeSkill } from '../../contracts/runtime-data'
import type { OfficerEditorFormState } from '../../contracts/officer-editor'
import {
  createEmptyFormState,
  createEmptyLanguageRow,
  createEmptySkillRow,
  generateOfficerId,
  validateOfficerForm,
  buildCanonicalOfficerFromForm,
  collectExistingOfficerIds,
  getMaxDisplayOrder,
  type ValidationContext,
} from '../../domain/officer-editor'
import {
  buildInitialFormWithOptions,
  buildOfficerEditorPageData,
  GROUP_LABEL_OPTIONS,
  filterSkillOptions,
  type OfficerEditorPageData,
} from '../../presenters/officer-editor-presenter'
import { getOfficerEditorService, OfficerSubmitError } from '../../runtime/officer-editor-service'

// ── 类型 ──

interface OfficerEditorPageState {
  form: OfficerEditorFormState
  dictionaries: RuntimeDictionaries
  skills: Readonly<Record<string, RuntimeSkill>>
  /** 所有已存在的 officer ID（用于查重） */
  existingOfficerIds: ReadonlySet<string>
  /** 当前最大 displayOrder */
  maxDisplayOrder: number
  /** 预生成的 officer ID */
  generatedOfficerId: string
}

interface OfficerPageLike {
  data: OfficerEditorPageData
  setData(update: Record<string, unknown>): void
}

// ── 状态管理 ──

const pageStateByInstance = new WeakMap<object, OfficerEditorPageState>()

const eventDataset = (event: WechatMiniprogram.BaseEvent): Record<string, unknown> =>
  (event.currentTarget.dataset as unknown as Record<string, unknown>) ?? {}

const getState = (page: object): OfficerEditorPageState => {
  const state = pageStateByInstance.get(page)
  if (!state) throw new Error('officer-editor-page-not-loaded')
  return state
}

// ── 渲染 ──

const render = (page: OfficerPageLike): void => {
  const state = getState(page)
  const options = buildInitialFormWithOptions(state.dictionaries, state.skills)
  const view = buildOfficerEditorPageData(
    state.form,
    options,
    page.data.skillSearchText ?? '',
    page.data.jobSearchText ?? '',
    page.data.nationalitySearchText ?? '',
  )
  page.setData({
    ...view,
    submitting: false,
    skillSearchText: page.data.skillSearchText ?? '',
    jobSearchText: page.data.jobSearchText ?? '',
    nationalitySearchText: page.data.nationalitySearchText ?? '',
  })
}

// ── 错误提示 ──

const showError = (message: string): void => {
  wx.showToast({ title: message, icon: 'none' })
}

const showSuccess = (message: string): void => {
  wx.showToast({ title: message, icon: 'success' })
}

// ── 页面定义 ──

Page({
  data: {
    name: '',
    rarityId: '',
    rarityIndex: 0,
    isBoss: false,
    typeId: '',
    typeIndex: 0,
    genderId: '',
    genderIndex: 0,
    jobId: '',
    jobIndex: 0,
    jobSearchText: '',
    filteredJobOptions: [],
    nationalityId: '',
    nationalityIndex: 0,
    nationalitySearchText: '',
    filteredNationalityOptions: [],
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
    rarityOptions: [],
    typeOptions: [],
    genderOptions: [],
    jobOptions: [],
    nationalityOptions: [],
    languageOptions: [],
    cityOptions: [],
    requirementOptions: [],
    skillOptions: [],
    skillSearchText: '',
    filteredSkillOptions: [],
    submitting: false,
    validationErrors: {} as Record<string, string>,
    canSubmit: false,
  } as OfficerEditorPageData,

  onLoad() {
    const catalog = getCatalog()
    const dictionaries = getDictionaries()
    const skills = getSkills()
    const existingOfficerIds = collectExistingOfficerIds(catalog)
    const maxDisplayOrder = getMaxDisplayOrder(catalog as unknown as { displayOrder?: number }[])

    const state: OfficerEditorPageState = {
      form: createEmptyFormState(),
      dictionaries,
      skills,
      existingOfficerIds,
      maxDisplayOrder,
      generatedOfficerId: generateOfficerId('', existingOfficerIds),
    }

    pageStateByInstance.set(this, state)
    wx.setNavigationBarTitle({ title: '新增航海士' })
    render(this)
  },

  // ── 名称 ──

  onNameInput(event: WechatMiniprogram.Input) {
    const state = getState(this)
    state.form.name = event.detail.value ?? ''
    // 重新生成 ID
    state.generatedOfficerId = generateOfficerId(
      state.form.sourceVoyageTw,
      state.existingOfficerIds,
    )
    render(this)
  },

  // ── 稀有度 ──

  onRarityChange(event: WechatMiniprogram.PickerChange) {
    const state = getState(this)
    const index = Number(event.detail.value)
    const options = buildInitialFormWithOptions(state.dictionaries, state.skills)
    state.form.rarityId = options.rarityOptions[index]?.id ?? ''
    render(this)
  },

  // ── Boss 开关 ──

  onBossToggle(event: WechatMiniprogram.SwitchChange) {
    const state = getState(this)
    state.form.isBoss = event.detail.value
    render(this)
  },

  // ── 类型 ──

  onTypeChange(event: WechatMiniprogram.PickerChange) {
    const state = getState(this)
    const index = Number(event.detail.value)
    const options = buildInitialFormWithOptions(state.dictionaries, state.skills)
    state.form.typeId = options.typeOptions[index]?.id ?? ''
    render(this)
  },

  // ── 性别 ──

  onGenderChange(event: WechatMiniprogram.PickerChange) {
    const state = getState(this)
    const index = Number(event.detail.value)
    const options = buildInitialFormWithOptions(state.dictionaries, state.skills)
    state.form.genderId = options.genderOptions[index]?.id ?? ''
    render(this)
  },

  // ── 职业（可搜索） ──

  onJobSearchInput(event: WechatMiniprogram.Input) {
    this.setData({ jobSearchText: event.detail.value ?? '' })
    render(this)
  },

  onJobChange(event: WechatMiniprogram.PickerChange) {
    const state = getState(this)
    const index = Number(event.detail.value)
    const options = buildInitialFormWithOptions(state.dictionaries, state.skills)
    const filtered = options.jobOptions
    state.form.jobId = filtered[index]?.id ?? ''
    this.setData({ jobSearchText: '' })
    render(this)
  },

  // ── 国籍（可搜索） ──

  onNationalitySearchInput(event: WechatMiniprogram.Input) {
    this.setData({ nationalitySearchText: event.detail.value ?? '' })
    render(this)
  },

  onNationalityChange(event: WechatMiniprogram.PickerChange) {
    const state = getState(this)
    const index = Number(event.detail.value)
    const options = buildInitialFormWithOptions(state.dictionaries, state.skills)
    const filtered = options.nationalityOptions
    state.form.nationalityId = filtered[index]?.id ?? ''
    this.setData({ nationalitySearchText: '' })
    render(this)
  },

  // ── 头像 ──

  onPortraitTap() {
    wx.showActionSheet({
      itemList: ['拍照', '從相冊選擇'],
      success: (res) => {
        const sourceType: ('camera' | 'album')[] = res.tapIndex === 0 ? ['camera'] : ['album']
        wx.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType,
          success: (result) => {
            const state = getState(this)
            state.form.portraitTempPath = result.tempFilePaths[0] ?? ''
            state.form.portraitFileId = ''
            render(this)
          },
        })
      },
    })
  },

  onPortraitRemove() {
    const state = getState(this)
    state.form.portraitTempPath = ''
    state.form.portraitFileId = ''
    render(this)
  },

  // ── 语言 ──

  onLanguageAdd() {
    const state = getState(this)
    state.form.languages = [...state.form.languages, createEmptyLanguageRow()]
    render(this)
  },

  onLanguageRemove(event: WechatMiniprogram.BaseEvent) {
    const key = eventDataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    state.form.languages = state.form.languages.filter((l) => l.key !== key)
    render(this)
  },

  onLanguageChange(event: WechatMiniprogram.PickerChange) {
    const key = eventDataset(event).key
    const index = Number(event.detail.value)
    if (typeof key !== 'string') return
    const state = getState(this)
    const options = buildInitialFormWithOptions(state.dictionaries, state.skills)
    const lang = state.form.languages.find((l) => l.key === key)
    if (lang) {
      const selected = options.languageOptions[index]
      if (selected) {
        lang.languageId = selected.id
        lang.languageName = selected.name
      }
    }
    render(this)
  },

  onLanguageLevelInput(event: WechatMiniprogram.Input) {
    const key = eventDataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    const lang = state.form.languages.find((l) => l.key === key)
    if (lang) {
      lang.level = Number(event.detail.value) || 1
    }
    render(this)
  },

  // ── 技能 ──

  onSkillAdd() {
    const state = getState(this)
    state.form.skills = [...state.form.skills, createEmptySkillRow()]
    render(this)
  },

  onSkillRemove(event: WechatMiniprogram.BaseEvent) {
    const key = eventDataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    state.form.skills = state.form.skills.filter((s) => s.key !== key)
    render(this)
  },

  onSkillSearchInput(event: WechatMiniprogram.Input) {
    this.setData({ skillSearchText: event.detail.value ?? '' })
    render(this)
  },

  onSkillIdChange(event: WechatMiniprogram.PickerChange) {
    const key = eventDataset(event).key
    const index = Number(event.detail.value)
    if (typeof key !== 'string') return
    const state = getState(this)
    const skill = state.form.skills.find((s) => s.key === key)
    if (skill) {
      const options = buildInitialFormWithOptions(state.dictionaries, state.skills)
      const searchText = this.data.skillSearchText ?? ''
      const filtered = filterSkillOptions(options.skillOptions, searchText, 100)
      const selected = filtered[index]
      if (selected) {
        skill.skillId = selected.id
        skill.skillName = selected.name
      }
    }
    this.setData({ skillSearchText: '' })
    render(this)
  },

  onSkillGroupChange(event: WechatMiniprogram.PickerChange) {
    const key = eventDataset(event).key
    const index = Number(event.detail.value)
    if (typeof key !== 'string') return
    const state = getState(this)
    const skill = state.form.skills.find((s) => s.key === key)
    if (skill) {
      const label = GROUP_LABEL_OPTIONS[index]?.id
      if (label) skill.groupLabel = label as typeof skill.groupLabel
    }
    render(this)
  },

  onSkillUnlockLevelInput(event: WechatMiniprogram.Input) {
    const key = eventDataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    const skill = state.form.skills.find((s) => s.key === key)
    if (skill) {
      skill.unlockLevel = Number(event.detail.value) || 1
    }
    render(this)
  },

  onSkillLevelInput(event: WechatMiniprogram.Input) {
    const key = eventDataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    const skill = state.form.skills.find((s) => s.key === key)
    if (skill) {
      skill.level = Number(event.detail.value) || 1
    }
    render(this)
  },

  // ── 招募：城市 ──

  onCityInput(event: WechatMiniprogram.Input) {
    // 城市输入暂存到临时字段，通过确认按钮添加
    const value = event.detail.value ?? ''
    this.setData({ cityInputValue: value })
  },

  onCityAdd() {
    const cityName = (this.data as unknown as Record<string, unknown>).cityInputValue as string
    if (!cityName || !cityName.trim()) return
    const state = getState(this)
    const cityId = `city_${cityName.trim()}`
    state.form.recruitment.cityIds = [...state.form.recruitment.cityIds, cityId]
    state.form.recruitment.cityNames = [...state.form.recruitment.cityNames, cityName.trim()]
    this.setData({ cityInputValue: '' })
    render(this)
  },

  onCityRemove(event: WechatMiniprogram.BaseEvent) {
    const index = Number(eventDataset(event).index)
    if (Number.isNaN(index)) return
    const state = getState(this)
    const rec = state.form.recruitment
    rec.cityIds = rec.cityIds.filter((_, i) => i !== index)
    rec.cityNames = rec.cityNames.filter((_, i) => i !== index)
    render(this)
  },

  // ── 招募：条件 ──

  onRequirementToggle(event: WechatMiniprogram.SwitchChange) {
    const state = getState(this)
    if (!event.detail.value) {
      state.form.recruitment.requirementId = null
      state.form.recruitment.requirementName = ''
    }
    render(this)
  },

  onRequirementInput(event: WechatMiniprogram.Input) {
    const state = getState(this)
    const value = event.detail.value ?? ''
    state.form.recruitment.requirementId = value.trim() || null
    state.form.recruitment.requirementName = value.trim()
    render(this)
  },

  // ── 招募：所需航海士 ──

  onRequiredOfficerInput(event: WechatMiniprogram.Input) {
    this.setData({ officerSearchText: event.detail.value ?? '' })
  },

  onRequiredOfficerAdd() {
    const name = (this.data as unknown as Record<string, unknown>).officerSearchText as string
    if (!name || !name.trim()) return
    const catalog = getCatalog()
    const match = catalog.find((o) => o.name === name.trim())
    const state = getState(this)
    if (match) {
      if (state.form.recruitment.requiredOfficerIds.includes(match.id)) {
        showError('此航海士已在列表中')
        return
      }
      state.form.recruitment.requiredOfficerIds = [
        ...state.form.recruitment.requiredOfficerIds,
        match.id,
      ]
      state.form.recruitment.requiredOfficerNames = [
        ...state.form.recruitment.requiredOfficerNames,
        match.name,
      ]
    } else {
      // 允许手动输入 ID
      const manualId = `officer_${name.trim()}`
      state.form.recruitment.requiredOfficerIds = [
        ...state.form.recruitment.requiredOfficerIds,
        manualId,
      ]
      state.form.recruitment.requiredOfficerNames = [
        ...state.form.recruitment.requiredOfficerNames,
        name.trim(),
      ]
    }
    this.setData({ officerSearchText: '' })
    render(this)
  },

  onRequiredOfficerRemove(event: WechatMiniprogram.BaseEvent) {
    const index = Number(eventDataset(event).index)
    if (Number.isNaN(index)) return
    const state = getState(this)
    const rec = state.form.recruitment
    rec.requiredOfficerIds = rec.requiredOfficerIds.filter((_, i) => i !== index)
    rec.requiredOfficerNames = rec.requiredOfficerNames.filter((_, i) => i !== index)
    render(this)
  },

  // ── 招募：备注 ──

  onRecruitmentNoteInput(event: WechatMiniprogram.Input) {
    const state = getState(this)
    state.form.recruitment.note = event.detail.value ?? ''
    render(this)
  },

  // ── 来源 ID ──

  onSourceVoyageInput(event: WechatMiniprogram.Input) {
    const state = getState(this)
    state.form.sourceVoyageTw = event.detail.value ?? ''
    state.generatedOfficerId = generateOfficerId(
      state.form.sourceVoyageTw,
      state.existingOfficerIds,
    )
    render(this)
  },

  // ── 维护备注 ──

  onMaintenanceNoteInput(event: WechatMiniprogram.Input) {
    const state = getState(this)
    state.form.maintenanceNote = event.detail.value ?? ''
    render(this)
  },

  // ── 提交 ──

  async onSubmit() {
    const state = getState(this)
    const form = state.form

    // 前端校验
    const ctx: ValidationContext = {
      existingOfficerIds: state.existingOfficerIds,
      validLanguageIds: new Set(state.dictionaries.languages.map((l) => l.id)),
      validSkillIds: new Set(Object.keys(state.skills)),
      validJobIds: new Set(state.dictionaries.jobs.map((j) => j.id)),
      validNationalityIds: new Set((state.dictionaries.nationalities ?? []).map((n) => n.id)),
    }
    const errors = validateOfficerForm(form, ctx)
    if (errors.length > 0) {
      const errorMap: Record<string, string> = {}
      for (const e of errors) {
        errorMap[e.field] = e.message
      }
      this.setData({ validationErrors: errorMap })
      showError(errors[0]?.message ?? '請修正表單中的錯誤')
      return
    }

    this.setData({ submitting: true, validationErrors: {} })

    try {
      // 构建 CanonicalOfficer
      const canonicalData = buildCanonicalOfficerFromForm(
        form,
        state.generatedOfficerId,
        state.maxDisplayOrder,
      )

      // 读取头像为 base64（通过云函数转发到云存储）
      let portraitBase64: string | undefined
      if (form.portraitTempPath && !form.portraitFileId) {
        try {
          const fs = wx.getFileSystemManager()
          const data = fs.readFileSync(form.portraitTempPath, 'base64') as string
          portraitBase64 = data
        } catch {
          showError('讀取頭像失敗')
          this.setData({ submitting: false })
          return
        }
      }

      // 提交到 CloudBase（含头像 base64）
      const service = getOfficerEditorService()
      const result = await service.submitOfficer(
        state.generatedOfficerId,
        canonicalData,
        portraitBase64,
      )

      if (result.ok) {
        // 缓存到本地
        addCachedCustomOfficer(state.generatedOfficerId, canonicalData)
        showSuccess('航海士已新增')
        // 返回名鉴页面
        setTimeout(() => {
          wx.navigateBack({})
        }, 1500)
      } else {
        showError(result.message ?? '提交失敗')
        this.setData({ submitting: false })
      }
    } catch (e) {
      if (e instanceof OfficerSubmitError) {
        showError(e.message)
      } else {
        showError('提交失敗，請重試')
      }
      this.setData({ submitting: false })
    }
  },

  // ── 阻止穿透 ──

  onNoop() {
    // 空函数，阻止事件冒泡
  },
})
