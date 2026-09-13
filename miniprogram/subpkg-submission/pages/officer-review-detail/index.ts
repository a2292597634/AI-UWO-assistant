/**
 * 投稿詳情：普通使用者查看自己的狀態；小程序管理員可在同一頁修改、保存、
 * 通過或駁回投稿。所有寫操作仍經由服務端權限與版本檢查。
 */

import {
  buildSubmissionCanonicalPreview,
  createEmptySubmissionSkillRow,
  getDefaultSubmissionVisualGrade,
  toSubmissionFormData,
} from '../../../domain/officer-editor'
import type {
  OfficerSubmissionFormState,
  OfficerSubmissionRecord,
  OfficerSubmissionReviewFields,
  SubmissionLanguageFormRow,
  SubmissionPortraitMeta,
  SubmissionSkillFormRow,
} from '../../../contracts/officer-submission'
import { getCatalog, getDictionaries, getSkills } from '../../../runtime/main-data-store'
import {
  buildSubmissionOptions,
  buildSubmissionStatusView,
  filterSubmissionOptions,
  findSubmissionOptionIndex,
  type SubmissionOption,
  type SubmissionOptions,
} from '../../../presenters/officer-submission-presenter'
import {
  getOfficerSubmissionService,
  OfficerSubmissionError,
  type SaveAdminSubmissionInput,
} from '../../../runtime/officer-editor-service'

type DetailMode = 'mine' | 'admin'

interface DetailLanguageView extends SubmissionLanguageFormRow {
  languageIndex: number
}

interface DetailSkillView extends SubmissionSkillFormRow {
  searchText: string
  filteredOptions: SubmissionOption[]
  skillIndex: number
  kind: 'active' | 'passive'
  kindIndex: number
  sourceGroup: string
  groupName: string
  groupIndex: number
  slot: number
}

interface DetailPageState {
  mode: DetailMode
  record: OfficerSubmissionRecord
  form: OfficerSubmissionFormState
  reviewFields: OfficerSubmissionReviewFields
  options: SubmissionOptions
  skillSearchByKey: Record<string, string>
  pendingCityId: string
  pendingCityName: string
  pendingOfficerId: string
  pendingOfficerName: string
  rejectReason: string
  portraitBase64: string
  portraitMeta: SubmissionPortraitMeta | null
  saving: boolean
}

interface DetailPageData {
  mode: DetailMode
  loading: boolean
  loadError: string
  submissionId: string
  revision: number
  status: string
  statusLabel: string
  statusClass: 'achieved' | 'review' | 'error'
  officerId: string
  visualGradeId: string
  visualGradeName: string
  visualGradeIndex: number
  visualGradeOptions: SubmissionOption[]
  canonicalPreviewText: string
  rejectReason: string
  canEdit: boolean
  canApprove: boolean
  canReject: boolean
  canResubmit: boolean
  saving: boolean
  name: string
  rarityId: string
  rarityName: string
  rarityIndex: number
  rarityOptions: SubmissionOption[]
  typeId: string
  typeName: string
  typeIndex: number
  typeOptions: SubmissionOption[]
  genderId: string
  genderName: string
  genderIndex: number
  genderOptions: SubmissionOption[]
  jobId: string
  jobName: string
  jobIndex: number
  jobOptions: SubmissionOption[]
  nationalityId: string
  nationalityName: string
  nationalityIndex: number
  nationalityOptions: SubmissionOption[]
  portraitTempPath: string
  portraitFileId: string
  portraitMetaText: string
  languages: DetailLanguageView[]
  languageOptions: SubmissionOption[]
  skills: DetailSkillView[]
  skillKindOptions: SubmissionOption[]
  skillGroupOptions: SubmissionOption[]
  groupIndex: number
  recruitment: OfficerSubmissionFormState['recruitment']
  recruitmentCityText: string
  requiredOfficerText: string
  cityPickerOptions: SubmissionOption[]
  cityPickerIndex: number
  requirementPickerOptions: SubmissionOption[]
  requirementIndex: number
  officerPickerOptions: SubmissionOption[]
  officerPickerIndex: number
  pendingCityName: string
  pendingOfficerName: string
  rejectReasonInput: string
  history: OfficerSubmissionRecord['history']
}

interface PageLike {
  data: DetailPageData
  setData(update: Record<string, unknown>): void
}

const GROUP_OPTIONS: SubmissionOption[] = [
  { id: 'sk0', name: '被動組 0' },
  { id: 'sk1', name: '被動組 1' },
  { id: 'sk2', name: '主動組 0' },
  { id: 'sk3', name: '主動組 1' },
  { id: 'sk4', name: '主動組 2' },
  { id: 'sk5', name: '被動組 2' },
]

const KIND_OPTIONS: SubmissionOption[] = [
  { id: 'active', name: '主動技能' },
  { id: 'passive', name: '被動技能' },
]

const VISUAL_GRADE_OPTIONS: SubmissionOption[] = [
  { id: 'grade_2', name: '檔位 2（C）' },
  { id: 'grade_3', name: '檔位 3（B）' },
  { id: 'grade_4', name: '檔位 4（A）' },
  { id: 'grade_5', name: '檔位 5（S）' },
  { id: 'grade_6', name: '檔位 6（特殊）' },
]

const pageStateByInstance = new WeakMap<object, DetailPageState>()

const getState = (page: object): DetailPageState => {
  const state = pageStateByInstance.get(page)
  if (!state) throw new Error('officer-review-detail-page-not-loaded')
  return state
}

const dataset = (event: WechatMiniprogram.BaseEvent): Record<string, unknown> =>
  (event.currentTarget.dataset as unknown as Record<string, unknown>) ?? {}

const valueOf = (event: WechatMiniprogram.Input): string => event.detail.value ?? ''

const selectedName = (options: readonly SubmissionOption[], id: string): string =>
  options.find((option) => option.id === id)?.name ?? id

const showError = (message: string): void => {
  wx.showToast({ title: message, icon: 'none' })
}

const showSuccess = (message: string): void => {
  wx.showToast({ title: message, icon: 'success' })
}

const recordForm = (
  record: OfficerSubmissionRecord,
  options: SubmissionOptions,
): OfficerSubmissionFormState => ({
  name: record.formData.name,
  rarityId: record.formData.rarityId,
  typeId: record.formData.typeId,
  genderId: record.formData.genderId,
  jobId: record.formData.jobId,
  nationalityId: record.formData.nationalityId,
  portrait: record.formData.portraitFileId
    ? {
        tempFilePath: '',
        fileId: record.formData.portraitFileId,
        mimeType: 'image/png',
        byteSize: 0,
        width: 0,
        height: 0,
      }
    : null,
  languages: record.formData.languages.map((language, index) => ({
    key: `detail-language-${index}`,
    languageId: language.languageId,
    languageName: selectedName(options.languages, language.languageId),
    level: language.level,
  })),
  skills: record.formData.skills.map((skill, index) => ({
    key: `detail-skill-${index}`,
    skillId: skill.skillId,
    skillName: selectedName(options.skills, skill.skillId),
    unlockLevel: skill.unlockLevel,
    level: skill.level,
  })),
  recruitment: {
    cityIds: [...record.formData.recruitment.cityIds],
    cityNames: record.formData.recruitment.cityIds.map((id) => selectedName(options.cities, id)),
    requirementId: record.formData.recruitment.requirementId,
    requirementName: record.formData.recruitment.requirementId
      ? selectedName(options.requirements, record.formData.recruitment.requirementId)
      : '',
    requiredOfficerIds: [...record.formData.recruitment.requiredOfficerIds],
    requiredOfficerNames: record.formData.recruitment.requiredOfficerIds.map((id) =>
      selectedName(options.officers, id),
    ),
  },
})

const reviewFromRecord = (
  record: OfficerSubmissionRecord,
  form: OfficerSubmissionFormState,
): OfficerSubmissionReviewFields => {
  const canonicalSkills = Array.isArray(record.canonicalData?.skills)
    ? (record.canonicalData.skills as Array<Record<string, unknown>>)
    : []
  const reviewSkills: OfficerSubmissionReviewFields['skills'] = form.skills.map((skill, index) => {
    const relation = canonicalSkills.find((item) => item.skillId === skill.skillId)
    const sourceGroupCandidate =
      typeof relation?.sourceGroup === 'string' ? relation.sourceGroup : 'sk0'
    const sourceGroup = GROUP_OPTIONS.some((option) => option.id === sourceGroupCandidate)
      ? (sourceGroupCandidate as OfficerSubmissionReviewFields['skills'][number]['sourceGroup'])
      : 'sk0'
    const kind: 'active' | 'passive' =
      relation?.kind === 'active' || relation?.kind === 'passive' ? relation.kind : 'passive'
    return {
      skillId: skill.skillId,
      kind,
      sourceGroup,
      slot: typeof relation?.slot === 'number' ? relation.slot : index,
    }
  })
  const visualGradeId = record.canonicalData?.visualGradeId
  return {
    visualGradeId:
      visualGradeId === 'grade_2' ||
      visualGradeId === 'grade_3' ||
      visualGradeId === 'grade_4' ||
      visualGradeId === 'grade_5' ||
      visualGradeId === 'grade_6'
        ? visualGradeId
        : getDefaultSubmissionVisualGrade(form.rarityId),
    skills: reviewSkills,
  }
}

const buildView = (state: DetailPageState): DetailPageData => {
  const statusView = buildSubmissionStatusView({
    status: state.record.status,
    rejectReason: state.record.review.rejectReason,
  })
  const form = state.form
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
    mode: state.mode,
    loading: false,
    loadError: '',
    submissionId: state.record.submissionId,
    revision: state.record.revision,
    status: state.record.status,
    statusLabel: statusView.label,
    statusClass: statusView.tone === 'success' ? 'achieved' : statusView.tone,
    officerId: `officer_custom_${state.record.submissionId}`,
    visualGradeId: state.reviewFields.visualGradeId,
    visualGradeName: selectedName(VISUAL_GRADE_OPTIONS, state.reviewFields.visualGradeId),
    visualGradeIndex: findSubmissionOptionIndex(
      VISUAL_GRADE_OPTIONS,
      state.reviewFields.visualGradeId,
    ),
    visualGradeOptions: VISUAL_GRADE_OPTIONS,
    canonicalPreviewText: JSON.stringify(
      buildSubmissionCanonicalPreview(state.form, state.reviewFields, state.record.submissionId),
      null,
      2,
    ),
    rejectReason: statusView.reason,
    canEdit:
      state.mode === 'admin' &&
      (state.record.status === 'pending' || state.record.status === 'approved'),
    canApprove: state.mode === 'admin' && state.record.status === 'pending',
    canReject: state.mode === 'admin' && state.record.status === 'pending',
    canResubmit: state.mode === 'mine' && state.record.status === 'rejected',
    saving: state.saving,
    name: form.name,
    rarityId: form.rarityId,
    rarityName: selectedName(state.options.rarities, form.rarityId),
    rarityIndex: findSubmissionOptionIndex(state.options.rarities, form.rarityId),
    rarityOptions: state.options.rarities,
    typeId: form.typeId,
    typeName: selectedName(state.options.types, form.typeId),
    typeIndex: findSubmissionOptionIndex(state.options.types, form.typeId),
    typeOptions: state.options.types,
    genderId: form.genderId,
    genderName: selectedName(state.options.genders, form.genderId),
    genderIndex: findSubmissionOptionIndex(state.options.genders, form.genderId),
    genderOptions: state.options.genders,
    jobId: form.jobId,
    jobName: selectedName(state.options.jobs, form.jobId),
    jobIndex: findSubmissionOptionIndex(state.options.jobs, form.jobId),
    jobOptions: state.options.jobs,
    nationalityId: form.nationalityId,
    nationalityName: selectedName(state.options.nationalities, form.nationalityId),
    nationalityIndex: findSubmissionOptionIndex(state.options.nationalities, form.nationalityId),
    nationalityOptions: state.options.nationalities,
    portraitTempPath: form.portrait?.tempFilePath ?? '',
    portraitFileId: form.portrait?.fileId ?? '',
    portraitMetaText: form.portrait?.tempFilePath
      ? `${form.portrait.width} × ${form.portrait.height} px · ${Math.ceil(form.portrait.byteSize / 1024)} KB`
      : form.portrait?.fileId
        ? '已保留目前頭像；如需更換請重新選擇'
        : '',
    languages: form.languages.map((language) => ({
      ...language,
      languageIndex: findSubmissionOptionIndex(state.options.languages, language.languageId),
    })),
    languageOptions: state.options.languages,
    skills: form.skills.map((skill, index) => {
      const review = state.reviewFields.skills[index]
      const searchText = state.skillSearchByKey[skill.key] ?? ''
      const filteredOptions = filterSubmissionOptions(state.options.skills, searchText)
      const sourceGroup = review?.sourceGroup ?? 'sk0'
      return {
        ...skill,
        searchText,
        filteredOptions,
        skillIndex: findSubmissionOptionIndex(filteredOptions, skill.skillId),
        kind: review?.kind ?? 'passive',
        kindIndex: findSubmissionOptionIndex(KIND_OPTIONS, review?.kind ?? 'passive'),
        sourceGroup,
        groupName: selectedName(GROUP_OPTIONS, sourceGroup),
        groupIndex: findSubmissionOptionIndex(GROUP_OPTIONS, sourceGroup),
        slot: review?.slot ?? index,
      }
    }),
    skillKindOptions: KIND_OPTIONS,
    skillGroupOptions: GROUP_OPTIONS,
    groupIndex: 0,
    recruitment: form.recruitment,
    recruitmentCityText:
      form.recruitment.cityNames.length > 0
        ? form.recruitment.cityNames.join('、')
        : '未填招募城市',
    requiredOfficerText:
      form.recruitment.requiredOfficerNames.length > 0
        ? form.recruitment.requiredOfficerNames.join('、')
        : '未填前置航海士',
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
    pendingCityName: state.pendingCityName,
    pendingOfficerName: state.pendingOfficerName,
    rejectReasonInput: state.rejectReason,
    history: state.record.history,
  }
}

const render = (page: PageLike): void => {
  page.setData(buildView(getState(page)) as unknown as Record<string, unknown>)
}

const loadImageMeta = (page: PageLike, path: string): void => {
  wx.getImageInfo({
    src: path,
    success: (info) => {
      const imageTypeName = info.type as string
      const mimeType =
        imageTypeName === 'png'
          ? 'image/png'
          : imageTypeName === 'jpeg' || imageTypeName === 'jpg'
            ? 'image/jpeg'
            : ''
      if (!mimeType) {
        showError('頭像格式只支援 PNG、JPG 或 JPEG')
        return
      }
      try {
        const stats = wx.getFileSystemManager().statSync(path) as { size: number }
        const state = getState(page)
        state.form.portrait = {
          tempFilePath: path,
          fileId: '',
          mimeType,
          byteSize: stats.size,
          width: info.width,
          height: info.height,
        }
        state.portraitMeta = {
          mimeType,
          byteSize: stats.size,
          width: info.width,
          height: info.height,
        }
        try {
          state.portraitBase64 = wx.getFileSystemManager().readFileSync(path, 'base64') as string
        } catch {
          state.portraitBase64 = ''
        }
        render(page)
      } catch {
        showError('無法讀取頭像檔案大小，請重新選擇')
      }
    },
    fail: () => showError('無法讀取頭像資訊，請重新選擇'),
  })
}

const chooseImage = (page: PageLike): void => {
  wx.chooseImage({
    count: 1,
    sizeType: ['original', 'compressed'],
    sourceType: ['album', 'camera'],
    success: (result) => {
      const path = result.tempFilePaths[0]
      if (!path) return
      wx.cropImage({
        src: path,
        cropScale: '1:1',
        success: (cropped) => {
          wx.compressImage({
            src: cropped.tempFilePath,
            quality: 80,
            success: (compressed) => loadImageMeta(page, compressed.tempFilePath),
            fail: () => loadImageMeta(page, cropped.tempFilePath),
          })
        },
        fail: () => showError('頭像裁切已取消，請重新選擇'),
      })
    },
    fail: () => showError('頭像選擇已取消'),
  })
}

const readPortraitPayload = (state: DetailPageState) => {
  if (!state.portraitBase64 || !state.portraitMeta) return undefined
  return { portraitBase64: state.portraitBase64, portraitMeta: state.portraitMeta }
}

const setUpdatedRecord = (state: DetailPageState, record: OfficerSubmissionRecord): void => {
  state.record = record
  state.form = recordForm(record, state.options)
  state.reviewFields = reviewFromRecord(record, state.form)
  state.portraitBase64 = ''
  state.portraitMeta = null
}

Page({
  data: {
    mode: 'mine',
    loading: true,
    loadError: '',
    submissionId: '',
    revision: 0,
    status: '',
    statusLabel: '',
    statusClass: 'review',
    officerId: '',
    visualGradeId: 'grade_5',
    visualGradeName: '',
    visualGradeIndex: 0,
    visualGradeOptions: VISUAL_GRADE_OPTIONS,
    canonicalPreviewText: '',
    rejectReason: '',
    canEdit: false,
    canApprove: false,
    canReject: false,
    canResubmit: false,
    saving: false,
    name: '',
    rarityId: '',
    rarityName: '',
    rarityIndex: 0,
    rarityOptions: [],
    typeId: '',
    typeName: '',
    typeIndex: 0,
    typeOptions: [],
    genderId: '',
    genderName: '',
    genderIndex: 0,
    genderOptions: [],
    jobId: '',
    jobName: '',
    jobIndex: 0,
    jobOptions: [],
    nationalityId: '',
    nationalityName: '',
    nationalityIndex: 0,
    nationalityOptions: [],
    portraitTempPath: '',
    portraitFileId: '',
    portraitMetaText: '',
    languages: [],
    languageOptions: [],
    skills: [],
    skillKindOptions: KIND_OPTIONS,
    skillGroupOptions: GROUP_OPTIONS,
    groupIndex: 0,
    recruitment: {
      cityIds: [],
      cityNames: [],
      requirementId: null,
      requirementName: '',
      requiredOfficerIds: [],
      requiredOfficerNames: [],
    },
    recruitmentCityText: '未填招募城市',
    requiredOfficerText: '未填前置航海士',
    cityPickerOptions: [],
    cityPickerIndex: 0,
    requirementPickerOptions: [],
    requirementIndex: 0,
    officerPickerOptions: [],
    officerPickerIndex: 0,
    pendingCityName: '',
    pendingOfficerName: '',
    rejectReasonInput: '',
    history: [],
  } as DetailPageData,

  onLoad(query?: Record<string, string | undefined>) {
    const submissionId = query?.submissionId ?? ''
    const revision = Number(query?.revision)
    const mode: DetailMode = query?.mode === 'admin' ? 'admin' : 'mine'
    wx.setNavigationBarTitle({ title: mode === 'admin' ? '審核詳情' : '投稿詳情' })
    if (!submissionId || !Number.isInteger(revision) || revision < 1) {
      this.setData({ loading: false, loadError: '投稿參數無效，請返回列表重試' })
      return
    }
    const dictionaries = getDictionaries()
    const skills = getSkills()
    const options = buildSubmissionOptions(dictionaries, skills, getCatalog())
    const pendingRecord = null as unknown as OfficerSubmissionRecord
    const state: DetailPageState = {
      mode,
      record: pendingRecord,
      form: createEmptyForm(),
      reviewFields: { visualGradeId: 'grade_5', skills: [] },
      options,
      skillSearchByKey: {},
      pendingCityId: '',
      pendingCityName: '',
      pendingOfficerId: '',
      pendingOfficerName: '',
      rejectReason: '',
      portraitBase64: '',
      portraitMeta: null,
      saving: false,
    }
    pageStateByInstance.set(this, state)
    void this.loadRecord(submissionId, revision)
  },

  async loadRecord(submissionId: string, revision: number) {
    this.setData({ loading: true, loadError: '' })
    try {
      const state = getState(this)
      if (state.mode === 'admin') {
        const permission = await getOfficerSubmissionService().getAdminStatus()
        if (!permission.isAdmin) {
          this.setData({ loading: false, loadError: '只有小程序管理員可以查看審核詳情' })
          return
        }
      }
      const record =
        state.mode === 'admin'
          ? await getOfficerSubmissionService().loadAdmin(submissionId, revision)
          : await getOfficerSubmissionService().loadMine(submissionId, revision)
      state.record = record
      state.form = recordForm(record, state.options)
      state.reviewFields = reviewFromRecord(record, state.form)
      this.setData({ loading: false })
      render(this)
    } catch (error) {
      this.setData({
        loading: false,
        loadError:
          error instanceof OfficerSubmissionError ? error.message : '投稿詳情載入失敗，請重試',
      })
    }
  },

  onRetry() {
    const state = pageStateByInstance.get(this)
    if (!state?.record?.submissionId) return
    void this.loadRecord(state.record.submissionId, state.record.revision)
  },

  onNameInput(event: WechatMiniprogram.Input) {
    getState(this).form.name = valueOf(event)
    render(this)
  },

  onVisualGradeChange(event: WechatMiniprogram.PickerChange) {
    const option = VISUAL_GRADE_OPTIONS[Number(event.detail.value)]
    if (option) {
      getState(this).reviewFields.visualGradeId =
        option.id as OfficerSubmissionReviewFields['visualGradeId']
      render(this)
    }
  },

  onBasicPickerChange(event: WechatMiniprogram.PickerChange) {
    const field = dataset(event).field
    const state = getState(this)
    const index = Number(event.detail.value)
    const fields: Record<string, keyof OfficerSubmissionFormState> = {
      rarity: 'rarityId',
      type: 'typeId',
      gender: 'genderId',
      job: 'jobId',
      nationality: 'nationalityId',
    }
    const key = typeof field === 'string' ? fields[field] : undefined
    if (!key) return
    const options =
      field === 'rarity'
        ? state.options.rarities
        : field === 'type'
          ? state.options.types
          : field === 'gender'
            ? state.options.genders
            : field === 'job'
              ? state.options.jobs
              : state.options.nationalities
    const option = options[index]
    if (option) state.form[key] = option.id as never
    render(this)
  },

  onPortraitTap() {
    chooseImage(this)
  },

  onLanguageAdd() {
    const state = getState(this)
    state.form.languages = [
      ...state.form.languages,
      {
        key: `detail-language-new-${Date.now()}`,
        languageId: '',
        languageName: '',
        level: 1,
      },
    ]
    render(this)
  },

  onLanguageRemove(event: WechatMiniprogram.BaseEvent) {
    const key = dataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    state.form.languages = state.form.languages.filter((language) => language.key !== key)
    render(this)
  },

  onLanguageChange(event: WechatMiniprogram.PickerChange) {
    const key = dataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    const language = state.form.languages.find((item) => item.key === key)
    const option = state.options.languages[Number(event.detail.value)]
    if (language && option) {
      language.languageId = option.id
      language.languageName = option.name
    }
    render(this)
  },

  onLanguageLevelInput(event: WechatMiniprogram.Input) {
    const key = dataset(event).key
    if (typeof key !== 'string') return
    const language = getState(this).form.languages.find((item) => item.key === key)
    if (language) language.level = Number(valueOf(event)) || 1
    render(this)
  },

  onSkillAdd() {
    const state = getState(this)
    const row = createEmptySubmissionSkillRow()
    state.form.skills = [...state.form.skills, row]
    state.reviewFields.skills = [
      ...state.reviewFields.skills,
      { skillId: '', kind: 'passive', sourceGroup: 'sk0', slot: state.form.skills.length - 1 },
    ]
    render(this)
  },

  onSkillRemove(event: WechatMiniprogram.BaseEvent) {
    const key = dataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    const index = state.form.skills.findIndex((skill) => skill.key === key)
    state.form.skills = state.form.skills.filter((skill) => skill.key !== key)
    if (index >= 0) state.reviewFields.skills.splice(index, 1)
    delete state.skillSearchByKey[key]
    render(this)
  },

  onSkillSearchInput(event: WechatMiniprogram.Input) {
    const key = dataset(event).key
    if (typeof key !== 'string') return
    getState(this).skillSearchByKey[key] = valueOf(event)
    render(this)
  },

  onSkillChange(event: WechatMiniprogram.PickerChange) {
    const key = dataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    const skill = state.form.skills.find((item) => item.key === key)
    const filtered = filterSubmissionOptions(
      state.options.skills,
      state.skillSearchByKey[key] ?? '',
    )
    const option = filtered[Number(event.detail.value)]
    const index = state.form.skills.findIndex((item) => item.key === key)
    if (skill && option && index >= 0) {
      skill.skillId = option.id
      skill.skillName = option.name
      const review = state.reviewFields.skills[index]
      if (review) review.skillId = option.id
    }
    state.skillSearchByKey[key] = ''
    render(this)
  },

  onSkillUnlockLevelInput(event: WechatMiniprogram.Input) {
    const key = dataset(event).key
    if (typeof key !== 'string') return
    const skill = getState(this).form.skills.find((item) => item.key === key)
    if (skill) skill.unlockLevel = Number(valueOf(event)) || 1
    render(this)
  },

  onSkillLevelInput(event: WechatMiniprogram.Input) {
    const key = dataset(event).key
    if (typeof key !== 'string') return
    const skill = getState(this).form.skills.find((item) => item.key === key)
    if (skill) skill.level = Number(valueOf(event)) || 1
    render(this)
  },

  onSkillGroupChange(event: WechatMiniprogram.PickerChange) {
    const key = dataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    const index = state.form.skills.findIndex((skill) => skill.key === key)
    const option = GROUP_OPTIONS[Number(event.detail.value)]
    const review = state.reviewFields.skills[index]
    if (review && option) {
      review.sourceGroup =
        option.id as OfficerSubmissionReviewFields['skills'][number]['sourceGroup']
    }
    render(this)
  },

  onSkillKindChange(event: WechatMiniprogram.PickerChange) {
    const key = dataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    const index = state.form.skills.findIndex((skill) => skill.key === key)
    const option = KIND_OPTIONS[Number(event.detail.value)]
    const review = state.reviewFields.skills[index]
    if (review && option && (option.id === 'active' || option.id === 'passive')) {
      review.kind = option.id
    }
    render(this)
  },

  onSkillSlotInput(event: WechatMiniprogram.Input) {
    const key = dataset(event).key
    if (typeof key !== 'string') return
    const state = getState(this)
    const index = state.form.skills.findIndex((skill) => skill.key === key)
    const review = state.reviewFields.skills[index]
    if (review) review.slot = Number(valueOf(event)) || 0
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
    if (!state.pendingCityId) return showError('請先選擇招募城市')
    if (state.form.recruitment.cityIds.includes(state.pendingCityId))
      return showError('此招募城市已加入')
    state.form.recruitment.cityIds.push(state.pendingCityId)
    state.form.recruitment.cityNames.push(state.pendingCityName)
    state.pendingCityId = ''
    state.pendingCityName = ''
    render(this)
  },

  onCityRemove(event: WechatMiniprogram.BaseEvent) {
    const index = Number(dataset(event).index)
    if (!Number.isInteger(index)) return
    const state = getState(this)
    state.form.recruitment.cityIds.splice(index, 1)
    state.form.recruitment.cityNames.splice(index, 1)
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
    if (!state.pendingOfficerId) return showError('請先選擇前置航海士')
    if (state.form.recruitment.requiredOfficerIds.includes(state.pendingOfficerId))
      return showError('此航海士已加入')
    state.form.recruitment.requiredOfficerIds.push(state.pendingOfficerId)
    state.form.recruitment.requiredOfficerNames.push(state.pendingOfficerName)
    state.pendingOfficerId = ''
    state.pendingOfficerName = ''
    render(this)
  },

  onRequiredOfficerRemove(event: WechatMiniprogram.BaseEvent) {
    const index = Number(dataset(event).index)
    if (!Number.isInteger(index)) return
    const state = getState(this)
    state.form.recruitment.requiredOfficerIds.splice(index, 1)
    state.form.recruitment.requiredOfficerNames.splice(index, 1)
    render(this)
  },

  onRejectReasonInput(event: WechatMiniprogram.Input) {
    const state = getState(this)
    state.rejectReason = valueOf(event)
    render(this)
  },

  async saveDraft(): Promise<OfficerSubmissionRecord | null> {
    const state = getState(this)
    const input: SaveAdminSubmissionInput = {
      submissionId: state.record.submissionId,
      revision: state.record.revision,
      updatedAt: state.record.updatedAt,
      formData: toSubmissionFormData(state.form),
      reviewFields: state.reviewFields,
      ...readPortraitPayload(state),
    }
    const saved = await getOfficerSubmissionService().saveAdmin(input)
    setUpdatedRecord(state, saved)
    return saved
  },

  async onSave() {
    const state = getState(this)
    if (!state || !state.record || !state.record.submissionId) return
    state.saving = true
    render(this)
    try {
      await this.saveDraft()
      showSuccess('修改已保存，狀態仍為待審核／待發布')
    } catch (error) {
      showError(error instanceof OfficerSubmissionError ? error.message : '保存失敗，請重試')
    } finally {
      state.saving = false
      render(this)
    }
  },

  async onApprove() {
    const state = getState(this)
    if (!state || state.record.status !== 'pending') return
    state.saving = true
    render(this)
    try {
      const saved = await this.saveDraft()
      if (!saved) throw new Error('save-failed')
      const approved = await getOfficerSubmissionService().approve({
        submissionId: saved.submissionId,
        revision: saved.revision,
        updatedAt: saved.updatedAt,
      })
      setUpdatedRecord(state, approved)
      showSuccess('審核通過，等待資料發布')
    } catch (error) {
      showError(error instanceof OfficerSubmissionError ? error.message : '通過失敗，請重試')
    } finally {
      state.saving = false
      render(this)
    }
  },

  async onReject() {
    const state = getState(this)
    if (!state || state.record.status !== 'pending') return
    if (!state.rejectReason.trim()) {
      showError('請填寫駁回原因')
      return
    }
    state.saving = true
    render(this)
    try {
      const rejected = await getOfficerSubmissionService().reject({
        submissionId: state.record.submissionId,
        revision: state.record.revision,
        updatedAt: state.record.updatedAt,
        rejectReason: state.rejectReason,
      })
      setUpdatedRecord(state, rejected)
      showSuccess('投稿已駁回，已通知投稿者按原因修改')
    } catch (error) {
      showError(error instanceof OfficerSubmissionError ? error.message : '駁回失敗，請重試')
    } finally {
      state.saving = false
      render(this)
    }
  },

  onResubmit() {
    const state = getState(this)
    if (!state || state.record.status !== 'rejected') return
    wx.navigateTo({
      url: `/pages/officer-editor/index?submissionId=${encodeURIComponent(state.record.submissionId)}&revision=${state.record.revision}`,
    })
  },

  onBack() {
    wx.navigateBack({})
  },
})

const createEmptyForm = (): OfficerSubmissionFormState => ({
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
