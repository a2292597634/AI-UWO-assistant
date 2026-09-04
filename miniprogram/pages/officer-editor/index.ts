/**
 * 航海士資料投稿頁。
 *
 * 以兩步表單降低一次性輸入負擔：基本資料先完成，再補語言、技能與可選
 * 招募資料。所有提交先進入 pending，不能直接改動小程序正式名鑑。
 */

import {
  createEmptyLanguageRow,
  createEmptySubmissionForm,
  createEmptySubmissionSkillRow,
  toSubmissionFormData,
  validateSubmissionForm,
} from '../../domain/officer-editor'
import type {
  OfficerSubmissionFormState,
  SubmissionLanguageFormRow,
  SubmissionPortraitMeta,
  SubmissionSkillFormRow,
  SubmissionValidationError,
} from '../../contracts/officer-submission'
import type { RuntimeDictionaries, RuntimeSkill } from '../../contracts/runtime-data'
import { getCatalog, getDictionaries, getSkills } from '../../runtime/main-data-store'
import {
  buildSubmissionOptions,
  filterSubmissionOptions,
  findSubmissionOptionIndex,
  type SubmissionOption,
  type SubmissionOptions,
} from '../../presenters/officer-submission-presenter'
import {
  getOfficerSubmissionService,
  OfficerSubmissionError,
} from '../../runtime/officer-editor-service'

interface SkillRowView extends SubmissionSkillFormRow {
  searchText: string
  filteredOptions: SubmissionOption[]
  skillIndex: number
  skillError: string
  unlockLevelError: string
  levelError: string
}

interface LanguageRowView extends SubmissionLanguageFormRow {
  languageIndex: number
}

interface SubmissionPageData {
  step: number
  stepLabels: string[]
  pageTitle: string
  pageHint: string
  editingSubmission: boolean
  isAdmin: boolean
  adminStatusReady: boolean
  submitting: boolean
  name: string
  rarityOptions: SubmissionOption[]
  rarityId: string
  rarityIndex: number
  rarityName: string
  typeId: string
  typeOptions: SubmissionOption[]
  typeIndex: number
  typeName: string
  genderId: string
  genderOptions: SubmissionOption[]
  genderIndex: number
  genderName: string
  jobId: string
  jobSearchText: string
  jobPickerOptions: SubmissionOption[]
  jobIndex: number
  jobName: string
  nationalityId: string
  nationalitySearchText: string
  nationalityPickerOptions: SubmissionOption[]
  nationalityIndex: number
  nationalityName: string
  portraitTempPath: string
  portraitFileId: string
  portraitMetaText: string
  languages: LanguageRowView[]
  skills: SkillRowView[]
  languageOptions: SubmissionOption[]
  skillOptions: SubmissionOption[]
  recruitment: OfficerSubmissionFormState['recruitment']
  cityPickerOptions: SubmissionOption[]
  cityPickerIndex: number
  requirementPickerOptions: SubmissionOption[]
  requirementIndex: number
  officerPickerOptions: SubmissionOption[]
  officerPickerIndex: number
  pendingCityId: string
  pendingCityName: string
  pendingOfficerId: string
  pendingOfficerName: string
  validationErrors: Record<string, string>
  hasValidationErrors: boolean
}

interface SubmissionPageState {
  form: OfficerSubmissionFormState
  dictionaries: RuntimeDictionaries
  skills: Readonly<Record<string, RuntimeSkill>>
  options: SubmissionOptions
  step: 0 | 1
  submissionId: string
  expectedRevision: number | null
  editingSubmission: boolean
  jobSearchText: string
  nationalitySearchText: string
  skillSearchByKey: Record<string, string>
  pendingCityId: string
  pendingCityName: string
  pendingOfficerId: string
  pendingOfficerName: string
  validationErrors: Record<string, string>
  submitting: boolean
  isAdmin: boolean
  adminStatusReady: boolean
}

interface PageLike {
  data: SubmissionPageData
  setData(update: Record<string, unknown>): void
}

const pageStateByInstance = new WeakMap<object, SubmissionPageState>()

const getState = (page: object): SubmissionPageState => {
  const state = pageStateByInstance.get(page)
  if (!state) throw new Error('officer-submission-page-not-loaded')
  return state
}

const eventDataset = (event: WechatMiniprogram.BaseEvent): Record<string, unknown> =>
  (event.currentTarget.dataset as unknown as Record<string, unknown>) ?? {}

const eventValue = (event: WechatMiniprogram.Input): string => event.detail.value ?? ''

const selectedName = (options: readonly SubmissionOption[], id: string): string =>
  options.find((option) => option.id === id)?.name ?? ''

const makeValidationMap = (
  errors: readonly SubmissionValidationError[],
): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const error of errors) result[error.field] = error.message
  return result
}

const showError = (message: string): void => {
  wx.showToast({ title: message, icon: 'none' })
}

const showSuccess = (message: string): void => {
  wx.showToast({ title: message, icon: 'success' })
}

const getValidationContext = (state: SubmissionPageState) => ({
  validRarityIds: new Set(state.options.rarities.map((option) => option.id)),
  validTypeIds: new Set(state.options.types.map((option) => option.id)),
  validGenderIds: new Set(state.options.genders.map((option) => option.id)),
  validJobIds: new Set(state.options.jobs.map((option) => option.id)),
  validNationalityIds: new Set(state.options.nationalities.map((option) => option.id)),
  validLanguageIds: new Set(state.options.languages.map((option) => option.id)),
  validSkillIds: new Set(state.options.skills.map((option) => option.id)),
  validCityIds: new Set(state.options.cities.map((option) => option.id)),
  validRequirementIds: new Set(state.options.requirements.map((option) => option.id)),
  validOfficerIds: new Set(state.options.officers.map((option) => option.id)),
})

const buildView = (state: SubmissionPageState): SubmissionPageData => {
  const form = state.form
  const jobPickerOptions = filterSubmissionOptions(state.options.jobs, state.jobSearchText)
  const nationalityPickerOptions = filterSubmissionOptions(
    state.options.nationalities,
    state.nationalitySearchText,
  )
  const cityPickerOptions: SubmissionOption[] = [
    { id: '', name: '選擇招募城市' },
    ...state.options.cities,
  ]
  const requirementPickerOptions: SubmissionOption[] = [
    { id: '', name: '不設定招募條件' },
    ...state.options.requirements,
  ]
  const officerPickerOptions: SubmissionOption[] = [
    { id: '', name: '選擇前置航海士' },
    ...state.options.officers,
  ]

  return {
    step: state.step,
    stepLabels: ['基本資料', '語言與技能'],
    pageTitle: state.editingSubmission ? '修改後重新提交' : '提交一位新航海士',
    pageHint: state.editingSubmission
      ? '依駁回原因修正資料，再次提交後會建立新的審核版本。'
      : '完成後先送交小程序管理員審核，審核通過並發布後才會出現在名鑑。',
    editingSubmission: state.editingSubmission,
    isAdmin: state.isAdmin,
    adminStatusReady: state.adminStatusReady,
    submitting: state.submitting,
    name: form.name,
    rarityOptions: state.options.rarities,
    rarityId: form.rarityId,
    rarityIndex: findSubmissionOptionIndex(state.options.rarities, form.rarityId),
    rarityName: selectedName(state.options.rarities, form.rarityId),
    typeId: form.typeId,
    typeOptions: state.options.types,
    typeIndex: findSubmissionOptionIndex(state.options.types, form.typeId),
    typeName: selectedName(state.options.types, form.typeId),
    genderId: form.genderId,
    genderOptions: state.options.genders,
    genderIndex: findSubmissionOptionIndex(state.options.genders, form.genderId),
    genderName: selectedName(state.options.genders, form.genderId),
    jobId: form.jobId,
    jobSearchText: state.jobSearchText,
    jobPickerOptions,
    jobIndex: findSubmissionOptionIndex(jobPickerOptions, form.jobId),
    jobName: selectedName(state.options.jobs, form.jobId),
    nationalityId: form.nationalityId,
    nationalitySearchText: state.nationalitySearchText,
    nationalityPickerOptions,
    nationalityIndex: findSubmissionOptionIndex(nationalityPickerOptions, form.nationalityId),
    nationalityName: selectedName(state.options.nationalities, form.nationalityId),
    portraitTempPath: form.portrait?.tempFilePath ?? '',
    portraitFileId: form.portrait?.fileId ?? '',
    portraitMetaText: form.portrait
      ? `${form.portrait.width} × ${form.portrait.height} px · ${Math.ceil(form.portrait.byteSize / 1024)} KB`
      : '',
    languages: form.languages.map((language) => ({
      ...language,
      languageIndex: findSubmissionOptionIndex(state.options.languages, language.languageId),
    })),
    skills: form.skills.map((skill) => {
      const searchText = state.skillSearchByKey[skill.key] ?? ''
      const filteredOptions = filterSubmissionOptions(state.options.skills, searchText)
      return {
        ...skill,
        searchText,
        filteredOptions,
        skillIndex: findSubmissionOptionIndex(filteredOptions, skill.skillId),
        skillError: state.validationErrors[`skills[${form.skills.indexOf(skill)}].skillId`] ?? '',
        unlockLevelError:
          state.validationErrors[`skills[${form.skills.indexOf(skill)}].unlockLevel`] ?? '',
        levelError: state.validationErrors[`skills[${form.skills.indexOf(skill)}].level`] ?? '',
      }
    }),
    languageOptions: state.options.languages,
    skillOptions: state.options.skills,
    recruitment: form.recruitment,
    cityPickerOptions,
    cityPickerIndex: state.pendingCityId
      ? findSubmissionOptionIndex(cityPickerOptions, state.pendingCityId)
      : 0,
    requirementPickerOptions,
    requirementIndex: form.recruitment.requirementId
      ? findSubmissionOptionIndex(requirementPickerOptions, form.recruitment.requirementId)
      : 0,
    officerPickerOptions,
    officerPickerIndex: state.pendingOfficerId
      ? findSubmissionOptionIndex(officerPickerOptions, state.pendingOfficerId)
      : 0,
    pendingCityId: state.pendingCityId,
    pendingCityName: state.pendingCityName,
    pendingOfficerId: state.pendingOfficerId,
    pendingOfficerName: state.pendingOfficerName,
    validationErrors: state.validationErrors,
    hasValidationErrors: Object.keys(state.validationErrors).length > 0,
  }
}

const render = (page: PageLike): void => {
  page.setData(buildView(getState(page)) as unknown as Record<string, unknown>)
}

const readPortrait = (page: PageLike, tempFilePath: string): void => {
  wx.getImageInfo({
    src: tempFilePath,
    success: (info) => {
      const imageTypeName = info.type as string
      const imageType =
        imageTypeName === 'png'
          ? 'image/png'
          : imageTypeName === 'jpeg' || imageTypeName === 'jpg'
            ? 'image/jpeg'
            : ''
      if (!imageType) {
        showError('頭像格式只支援 PNG、JPG 或 JPEG')
        return
      }
      try {
        const stats = wx.getFileSystemManager().statSync(tempFilePath) as { size: number }
        const state = getState(page)
        state.form.portrait = {
          tempFilePath,
          fileId: '',
          mimeType: imageType,
          byteSize: stats.size,
          width: info.width,
          height: info.height,
        }
        state.validationErrors = { ...state.validationErrors, portrait: '' }
        render(page)
      } catch {
        showError('無法讀取頭像檔案大小，請重新選擇')
      }
    },
    fail: () => showError('無法讀取頭像資訊，請重新選擇'),
  })
}

const choosePortrait = (page: PageLike): void => {
  wx.chooseImage({
    count: 1,
    sizeType: ['original', 'compressed'],
    sourceType: ['album', 'camera'],
    success: (result) => {
      const path = result.tempFilePaths[0]
      if (!path) return
      wx.compressImage({
        src: path,
        quality: 80,
        success: (compressed) => readPortrait(page, compressed.tempFilePath),
        fail: () => readPortrait(page, path),
      })
    },
    fail: () => undefined,
  })
}

const readPortraitPayload = (
  form: OfficerSubmissionFormState,
): { base64: string; meta: SubmissionPortraitMeta } | null => {
  const portrait = form.portrait
  if (!portrait?.tempFilePath) return null
  try {
    const base64 = wx.getFileSystemManager().readFileSync(portrait.tempFilePath, 'base64') as string
    if (portrait.mimeType !== 'image/png' && portrait.mimeType !== 'image/jpeg') return null
    return {
      base64,
      meta: {
        mimeType: portrait.mimeType,
        byteSize: portrait.byteSize,
        width: portrait.width,
        height: portrait.height,
      },
    }
  } catch {
    return null
  }
}

const validateBasicStep = (state: SubmissionPageState): Record<string, string> => {
  const basicFields = new Set([
    'name',
    'rarityId',
    'typeId',
    'genderId',
    'jobId',
    'nationalityId',
    'portrait',
  ])
  const allErrors = validateSubmissionForm(state.form, getValidationContext(state))
  return makeValidationMap(allErrors.filter((error) => basicFields.has(error.field)))
}

Page({
  data: {
    step: 0,
    stepLabels: ['基本資料', '語言與技能'],
    pageTitle: '提交一位新航海士',
    pageHint: '完成後先送交小程序管理員審核，審核通過並發布後才會出現在名鑑。',
    editingSubmission: false,
    isAdmin: false,
    adminStatusReady: false,
    submitting: false,
    name: '',
    rarityOptions: [],
    rarityId: '',
    rarityIndex: 0,
    rarityName: '',
    typeId: '',
    typeOptions: [],
    typeIndex: 0,
    typeName: '',
    genderId: '',
    genderOptions: [],
    genderIndex: 0,
    genderName: '',
    jobId: '',
    jobSearchText: '',
    jobPickerOptions: [],
    jobIndex: 0,
    jobName: '',
    nationalityId: '',
    nationalitySearchText: '',
    nationalityPickerOptions: [],
    nationalityIndex: 0,
    nationalityName: '',
    portraitTempPath: '',
    portraitFileId: '',
    portraitMetaText: '',
    languages: [],
    skills: [],
    languageOptions: [],
    skillOptions: [],
    recruitment: {
      cityIds: [],
      cityNames: [],
      requirementId: null,
      requirementName: '',
      requiredOfficerIds: [],
      requiredOfficerNames: [],
    },
    cityPickerOptions: [],
    cityPickerIndex: 0,
    requirementPickerOptions: [],
    requirementIndex: 0,
    officerPickerOptions: [],
    officerPickerIndex: 0,
    pendingCityId: '',
    pendingCityName: '',
    pendingOfficerId: '',
    pendingOfficerName: '',
    validationErrors: {},
    hasValidationErrors: false,
  } as SubmissionPageData,

  onLoad(query?: Record<string, string | undefined>) {
    const dictionaries = getDictionaries()
    const skills = getSkills()
    const options = buildSubmissionOptions(dictionaries, skills, getCatalog())
    const state: SubmissionPageState = {
      form: createEmptySubmissionForm(),
      dictionaries,
      skills,
      options,
      step: 0,
      submissionId: '',
      expectedRevision: null,
      editingSubmission: false,
      jobSearchText: '',
      nationalitySearchText: '',
      skillSearchByKey: {},
      pendingCityId: '',
      pendingCityName: '',
      pendingOfficerId: '',
      pendingOfficerName: '',
      validationErrors: {},
      submitting: false,
      isAdmin: false,
      adminStatusReady: false,
    }
    pageStateByInstance.set(this, state)
    wx.setNavigationBarTitle({ title: '資料投稿' })
    render(this)
    const submissionId = query?.submissionId
    const revision = Number(query?.revision)
    if (submissionId && Number.isInteger(revision) && revision > 0) {
      void this.loadRejectedSubmission(submissionId, revision)
    }
    void this.loadAdminStatus()
  },

  async loadRejectedSubmission(submissionId: string, revision: number) {
    try {
      const record = await getOfficerSubmissionService().loadMine(submissionId, revision)
      if (record.status !== 'rejected') {
        showError('只有已駁回投稿可以重新提交')
        return
      }
      const state = getState(this)
      const formData = record.formData
      state.form = {
        name: formData.name,
        rarityId: formData.rarityId,
        typeId: formData.typeId,
        genderId: formData.genderId,
        jobId: formData.jobId,
        nationalityId: formData.nationalityId,
        portrait: formData.portraitFileId
          ? {
              tempFilePath: '',
              fileId: formData.portraitFileId,
              mimeType: 'image/png',
              byteSize: 0,
              width: 0,
              height: 0,
            }
          : null,
        languages: formData.languages.map((language, index) => ({
          key: `loaded-language-${index}`,
          languageId: language.languageId,
          languageName: selectedName(state.options.languages, language.languageId),
          level: language.level,
        })),
        skills: formData.skills.map((skill, index) => ({
          key: `loaded-skill-${index}`,
          skillId: skill.skillId,
          skillName: selectedName(state.options.skills, skill.skillId),
          unlockLevel: skill.unlockLevel,
          level: skill.level,
        })),
        recruitment: {
          cityIds: [...formData.recruitment.cityIds],
          cityNames: formData.recruitment.cityIds.map((id) =>
            selectedName(state.options.cities, id),
          ),
          requirementId: formData.recruitment.requirementId,
          requirementName: formData.recruitment.requirementId
            ? selectedName(state.options.requirements, formData.recruitment.requirementId)
            : '',
          requiredOfficerIds: [...formData.recruitment.requiredOfficerIds],
          requiredOfficerNames: formData.recruitment.requiredOfficerIds.map((id) =>
            selectedName(state.options.officers, id),
          ),
        },
      }
      state.submissionId = submissionId
      state.expectedRevision = revision
      state.editingSubmission = true
      state.validationErrors = {}
      wx.setNavigationBarTitle({ title: '修改投稿' })
      render(this)
    } catch (error) {
      showError(error instanceof OfficerSubmissionError ? error.message : '投稿載入失敗，請重試')
    }
  },

  async loadAdminStatus() {
    try {
      const result = await getOfficerSubmissionService().getAdminStatus()
      const state = getState(this)
      state.isAdmin = result.isAdmin
      state.adminStatusReady = true
      render(this)
    } catch {
      const state = getState(this)
      state.isAdmin = false
      state.adminStatusReady = true
      render(this)
    }
  },

  onNameInput(event: WechatMiniprogram.Input) {
    getState(this).form.name = eventValue(event)
    render(this)
  },

  onRarityChange(event: WechatMiniprogram.PickerChange) {
    const option = getState(this).options.rarities[Number(event.detail.value)]
    if (option) getState(this).form.rarityId = option.id
    render(this)
  },

  onTypeChange(event: WechatMiniprogram.PickerChange) {
    const option = getState(this).options.types[Number(event.detail.value)]
    if (option) getState(this).form.typeId = option.id
    render(this)
  },

  onGenderChange(event: WechatMiniprogram.PickerChange) {
    const option = getState(this).options.genders[Number(event.detail.value)]
    if (option) getState(this).form.genderId = option.id
    render(this)
  },

  onJobSearchInput(event: WechatMiniprogram.Input) {
    getState(this).jobSearchText = eventValue(event)
    render(this)
  },

  onJobChange(event: WechatMiniprogram.PickerChange) {
    const state = getState(this)
    const options = filterSubmissionOptions(state.options.jobs, state.jobSearchText)
    const option = options[Number(event.detail.value)]
    if (option) state.form.jobId = option.id
    state.jobSearchText = ''
    render(this)
  },

  onNationalitySearchInput(event: WechatMiniprogram.Input) {
    getState(this).nationalitySearchText = eventValue(event)
    render(this)
  },

  onNationalityChange(event: WechatMiniprogram.PickerChange) {
    const state = getState(this)
    const options = filterSubmissionOptions(
      state.options.nationalities,
      state.nationalitySearchText,
    )
    const option = options[Number(event.detail.value)]
    if (option) state.form.nationalityId = option.id
    state.nationalitySearchText = ''
    render(this)
  },

  onPortraitTap() {
    choosePortrait(this)
  },

  onPortraitRemove() {
    getState(this).form.portrait = null
    render(this)
  },

  onNextStep() {
    const state = getState(this)
    const errors = validateBasicStep(state)
    if (Object.keys(errors).length > 0) {
      state.validationErrors = errors
      render(this)
      showError(Object.values(errors)[0] ?? '請先完成基本資料')
      return
    }
    state.validationErrors = {}
    state.step = 1
    render(this)
  },

  onPreviousStep() {
    const state = getState(this)
    state.step = 0
    render(this)
  },

  onLanguageAdd() {
    const state = getState(this)
    state.form.languages = [...state.form.languages, createEmptyLanguageRow()]
    render(this)
  },

  onLanguageRemove(event: WechatMiniprogram.BaseEvent) {
    const key = eventDataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    state.form.languages = state.form.languages.filter((language) => language.key !== key)
    render(this)
  },

  onLanguageChange(event: WechatMiniprogram.PickerChange) {
    const key = eventDataset(event).key
    if (typeof key !== 'string') return
    const option = getState(this).options.languages[Number(event.detail.value)]
    const language = getState(this).form.languages.find((item) => item.key === key)
    if (language && option) {
      language.languageId = option.id
      language.languageName = option.name
    }
    render(this)
  },

  onLanguageLevelInput(event: WechatMiniprogram.Input) {
    const key = eventDataset(event).key
    if (typeof key !== 'string') return
    const language = getState(this).form.languages.find((item) => item.key === key)
    if (language) language.level = Number(eventValue(event)) || 1
    render(this)
  },

  onSkillAdd() {
    const state = getState(this)
    const row = createEmptySubmissionSkillRow()
    state.form.skills = [...state.form.skills, row]
    state.skillSearchByKey[row.key] = ''
    render(this)
  },

  onSkillRemove(event: WechatMiniprogram.BaseEvent) {
    const key = eventDataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    state.form.skills = state.form.skills.filter((skill) => skill.key !== key)
    delete state.skillSearchByKey[key]
    render(this)
  },

  onSkillSearchInput(event: WechatMiniprogram.Input) {
    const key = eventDataset(event).key
    if (typeof key !== 'string') return
    getState(this).skillSearchByKey[key] = eventValue(event)
    render(this)
  },

  onSkillChange(event: WechatMiniprogram.PickerChange) {
    const key = eventDataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    const skill = state.form.skills.find((item) => item.key === key)
    const filteredOptions = filterSubmissionOptions(
      state.options.skills,
      state.skillSearchByKey[key] ?? '',
    )
    const option = filteredOptions[Number(event.detail.value)]
    if (skill && option) {
      skill.skillId = option.id
      skill.skillName = option.name
    }
    state.skillSearchByKey[key] = ''
    render(this)
  },

  onSkillUnlockLevelInput(event: WechatMiniprogram.Input) {
    const key = eventDataset(event).key
    if (typeof key !== 'string') return
    const skill = getState(this).form.skills.find((item) => item.key === key)
    if (skill) skill.unlockLevel = Number(eventValue(event)) || 1
    render(this)
  },

  onSkillLevelInput(event: WechatMiniprogram.Input) {
    const key = eventDataset(event).key
    if (typeof key !== 'string') return
    const skill = getState(this).form.skills.find((item) => item.key === key)
    if (skill) skill.level = Number(eventValue(event)) || 1
    render(this)
  },

  onCityChange(event: WechatMiniprogram.PickerChange) {
    const state = getState(this)
    const option = state.options.cities[Number(event.detail.value) - 1]
    state.pendingCityId = option?.id ?? ''
    state.pendingCityName = option?.name ?? ''
    render(this)
  },

  onCityAdd() {
    const state = getState(this)
    if (!state.pendingCityId) {
      showError('請先選擇招募城市')
      return
    }
    if (state.form.recruitment.cityIds.includes(state.pendingCityId)) {
      showError('此招募城市已加入')
      return
    }
    state.form.recruitment.cityIds = [...state.form.recruitment.cityIds, state.pendingCityId]
    state.form.recruitment.cityNames = [...state.form.recruitment.cityNames, state.pendingCityName]
    state.pendingCityId = ''
    state.pendingCityName = ''
    render(this)
  },

  onCityRemove(event: WechatMiniprogram.BaseEvent) {
    const index = Number(eventDataset(event).index)
    if (!Number.isInteger(index)) return
    const state = getState(this)
    state.form.recruitment.cityIds = state.form.recruitment.cityIds.filter((_, i) => i !== index)
    state.form.recruitment.cityNames = state.form.recruitment.cityNames.filter(
      (_, i) => i !== index,
    )
    render(this)
  },

  onRequirementChange(event: WechatMiniprogram.PickerChange) {
    const state = getState(this)
    const option = state.options.requirements[Number(event.detail.value) - 1]
    state.form.recruitment.requirementId = option?.id ?? null
    state.form.recruitment.requirementName = option?.name ?? ''
    render(this)
  },

  onOfficerChange(event: WechatMiniprogram.PickerChange) {
    const state = getState(this)
    const option = state.options.officers[Number(event.detail.value) - 1]
    state.pendingOfficerId = option?.id ?? ''
    state.pendingOfficerName = option?.name ?? ''
    render(this)
  },

  onRequiredOfficerAdd() {
    const state = getState(this)
    if (!state.pendingOfficerId) {
      showError('請先選擇前置航海士')
      return
    }
    if (state.form.recruitment.requiredOfficerIds.includes(state.pendingOfficerId)) {
      showError('此航海士已加入')
      return
    }
    state.form.recruitment.requiredOfficerIds = [
      ...state.form.recruitment.requiredOfficerIds,
      state.pendingOfficerId,
    ]
    state.form.recruitment.requiredOfficerNames = [
      ...state.form.recruitment.requiredOfficerNames,
      state.pendingOfficerName,
    ]
    state.pendingOfficerId = ''
    state.pendingOfficerName = ''
    render(this)
  },

  onRequiredOfficerRemove(event: WechatMiniprogram.BaseEvent) {
    const index = Number(eventDataset(event).index)
    if (!Number.isInteger(index)) return
    const state = getState(this)
    state.form.recruitment.requiredOfficerIds = state.form.recruitment.requiredOfficerIds.filter(
      (_, i) => i !== index,
    )
    state.form.recruitment.requiredOfficerNames =
      state.form.recruitment.requiredOfficerNames.filter((_, i) => i !== index)
    render(this)
  },

  onMySubmissionsTap() {
    wx.navigateTo({ url: '/subpkg-submission/pages/officer-submissions/index' })
  },

  onAdminReviewTap() {
    const state = getState(this)
    if (!state.isAdmin) return
    wx.navigateTo({ url: '/subpkg-submission/pages/officer-review/index' })
  },

  async onSubmit() {
    const state = getState(this)
    const errors = makeValidationMap(
      validateSubmissionForm(state.form, getValidationContext(state)),
    )
    if (Object.keys(errors).length > 0) {
      state.validationErrors = errors
      state.step = Object.keys(errors).some(
        (field) =>
          field.startsWith('languages') ||
          field.startsWith('skills') ||
          field === 'languages' ||
          field === 'skills',
      )
        ? 1
        : 0
      render(this)
      showError(Object.values(errors)[0] ?? '請修正表單中的錯誤')
      return
    }

    const portraitPayload = readPortraitPayload(state.form)
    if (!portraitPayload && !state.editingSubmission) {
      state.validationErrors = { portrait: '無法讀取頭像，請重新選擇' }
      state.step = 0
      render(this)
      showError('無法讀取頭像，請重新選擇')
      return
    }

    state.submitting = true
    state.validationErrors = {}
    render(this)
    try {
      if (state.editingSubmission && state.expectedRevision !== null) {
        await getOfficerSubmissionService().resubmit(
          state.submissionId,
          state.expectedRevision,
          toSubmissionFormData(state.form),
          portraitPayload?.base64,
          portraitPayload?.meta,
        )
      } else if (portraitPayload) {
        await getOfficerSubmissionService().submit(
          toSubmissionFormData(state.form),
          portraitPayload.base64,
          portraitPayload.meta,
        )
      } else {
        throw new Error('portrait-required')
      }
      showSuccess('投稿已提交，等待審核')
      setTimeout(
        () => wx.navigateTo({ url: '/subpkg-submission/pages/officer-submissions/index' }),
        900,
      )
    } catch (error) {
      state.submitting = false
      render(this)
      showError(error instanceof OfficerSubmissionError ? error.message : '提交失敗，請重試')
    }
  },
})
