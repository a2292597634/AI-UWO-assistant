import type {
  MaintenanceOfficerData,
  MaintenancePortraitMeta,
  MaintenancePortraitUpload,
  MaintenanceValidationContext,
  MaintenanceWorkOrderDraft,
  ReferenceCandidate,
} from '../../../contracts/officer-maintenance'
import type { RuntimeDictionaryItem } from '../../../contracts/runtime-data'
import { validateMaintenanceDraft } from '../../../domain/officer-maintenance'
import type { MaintenanceEntityOption } from '../../../presenters/maintenance-option-presenter'
import {
  buildMaintenanceDiff,
  mergeMaintenanceCandidate,
} from '../../../presenters/officer-maintenance-presenter'
import {
  getCatalog,
  getMaintenanceDictionaries,
  getMaintenanceOfficer,
  getSkills,
} from '../../../runtime/main-data-store'
import {
  getOfficerMaintenanceService,
  OfficerMaintenanceError,
  type MaintenanceWorkOrder,
} from '../../../runtime/officer-maintenance-service'
import {
  buildMaintenanceSkillTypeOptions,
  findMaintenanceSkillTypeOption,
  nextMaintenanceSkillSlot,
  type MaintenanceSkillTypeOption,
} from '../../presenters/maintenance-skill-type-presenter'

interface EditorState {
  draft: MaintenanceWorkOrderDraft
  saved: MaintenanceWorkOrder | null
  context: MaintenanceValidationContext
  portraitUpload: MaintenancePortraitUpload | null
  idempotencyKey: string
}
type PortraitStatusKind = 'empty' | 'pending' | 'uploading' | 'uploaded' | 'error'
interface EditorData {
  reviewMode: boolean
  reviewList: boolean
  reviewOrders: readonly MaintenanceWorkOrder[]
  reviewDiff: ReturnType<typeof buildMaintenanceDiff>
  proposalDiff: ReturnType<typeof buildMaintenanceDiff>
  reviewReason: string
  rejectReason: string
  rejectionReason: string
  conflict: string
  loading: boolean
  loadError: string
  saving: boolean
  submitting: boolean
  readonly: boolean
  error: string
  notice: string
  targetOfficerId: string
  originalName: string
  baseDataVersion: string
  modifying: boolean
  form: MaintenanceOfficerData
  candidates: readonly (ReferenceCandidate & { selectedCategoryIds: readonly string[] })[]
  options: Record<string, readonly MaintenanceEntityOption[]>
  selected: Record<string, readonly string[]>
  basicFields: {
    field: string
    label: string
    options: readonly MaintenanceEntityOption[]
    name: string
  }[]
  languageRows: { id: string; name: string; level: number }[]
  skillRows: {
    id: string
    name: string
    level: number
    unlockLevel: number
    slot: number
    typeIndex: number
    typeLabel: string
    expanded: boolean
  }[]
  skillTypeOptions: readonly MaintenanceSkillTypeOption[]
  expandedSkillIds: readonly string[]
  portraitTempPath: string
  portraitFileId: string
  portraitMetaText: string
  portraitStatusKind: PortraitStatusKind
  portraitStatusText: string
  portraitImageFailed: boolean
}
interface EditorPage {
  data: EditorData
  setData(value: Record<string, unknown>): void
}
const states = new WeakMap<object, EditorState>()
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const emptyForm = (): MaintenanceOfficerData => ({
  name: '',
  rarityId: '',
  visualGradeId: 'grade_2',
  typeId: '',
  genderId: '',
  jobId: '',
  nationalityId: '',
  languages: [],
  skills: [],
  recruitment: { cityIds: [], requirementId: null, requiredOfficerIds: [], note: null },
  portraitId: null,
  displayOrder: 0,
  maintenanceNote: '',
})
const MAX_PORTRAIT_BYTES = 512 * 1024
const MAX_PORTRAIT_EDGE = 512
const generateIdempotencyKey = (): string =>
  `maintenance-save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const setPortraitError = (page: EditorPage, message: string, statusText = message): void => {
  page.setData({
    error: message,
    notice: '',
    portraitStatusKind: 'error',
    portraitStatusText: statusText,
  })
}

const readPortrait = (page: EditorPage, tempFilePath: string): void => {
  wx.getImageInfo({
    src: tempFilePath,
    success: (info) => {
      const imageType = String(info.type)
      const mimeType: MaintenancePortraitMeta['mimeType'] | '' =
        imageType === 'png'
          ? 'image/png'
          : imageType === 'jpg' || imageType === 'jpeg'
            ? 'image/jpeg'
            : ''
      if (!mimeType) {
        setPortraitError(page, '頭像格式只支援 PNG、JPG 或 JPEG')
        return
      }
      try {
        const byteSize = (wx.getFileSystemManager().statSync(tempFilePath) as { size: number }).size
        if (byteSize > MAX_PORTRAIT_BYTES) {
          setPortraitError(page, '頭像檔案不可超過 512 KB')
          return
        }
        if (
          !Number.isInteger(info.width) ||
          !Number.isInteger(info.height) ||
          info.width <= 0 ||
          info.height <= 0 ||
          Math.max(info.width, info.height) > MAX_PORTRAIT_EDGE
        ) {
          setPortraitError(page, '頭像最長邊不可超過 512 px')
          return
        }
        const base64 = wx.getFileSystemManager().readFileSync(tempFilePath, 'base64') as string
        const state = states.get(page)
        if (!state) return
        const meta: MaintenancePortraitMeta = {
          mimeType,
          byteSize,
          width: info.width,
          height: info.height,
        }
        state.portraitUpload = { base64, meta }
        page.setData({
          portraitTempPath: tempFilePath,
          portraitMetaText: `${info.width} × ${info.height} px · ${Math.ceil(byteSize / 1024)} KB`,
          portraitStatusKind: 'pending',
          portraitStatusText: '頭像待上傳；儲存草稿或送審時會上傳',
          portraitImageFailed: false,
          error: '',
          notice: '',
        })
      } catch {
        setPortraitError(page, '無法讀取頭像檔案，請重新選擇')
      }
    },
    fail: () => setPortraitError(page, '無法讀取頭像資訊，請重新選擇'),
  })
}
const choosePortrait = (page: EditorPage): void => {
  wx.chooseImage({
    count: 1,
    sizeType: ['original', 'compressed'],
    sourceType: ['album', 'camera'],
    success: (result) => {
      const source = result.tempFilePaths[0]
      if (!source) {
        setPortraitError(page, '未選取頭像，請重新選擇')
        return
      }
      wx.cropImage({
        src: source,
        cropScale: '1:1',
        success: (result) => {
          wx.compressImage({
            src: result.tempFilePath,
            quality: 80,
            success: (compressed) => readPortrait(page, compressed.tempFilePath),
            fail: () => readPortrait(page, result.tempFilePath),
          })
        },
        fail: () => setPortraitError(page, '頭像裁切已取消，請重新選擇'),
      })
    },
    fail: () => setPortraitError(page, '頭像選擇已取消'),
  })
}
const toOptions = (items: readonly RuntimeDictionaryItem[]): MaintenanceEntityOption[] =>
  items.map((item) => ({
    ...item,
    aliases: [],
    meta: '',
    searchableText: `${item.name} ${item.id}`,
  }))
const writable = (page: EditorPage): EditorState | undefined =>
  page.data.loading ||
  page.data.loadError ||
  page.data.saving ||
  page.data.submitting ||
  page.data.readonly
    ? undefined
    : states.get(page)
const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof OfficerMaintenanceError ? error.message : fallback
const latestRejectionReason = (record: MaintenanceWorkOrder): string =>
  [...record.history]
    .reverse()
    .find((entry) => entry.action === 'rejected')
    ?.reason?.trim() ?? ''
const portraitPreviewId = (draft: MaintenanceWorkOrderDraft, reviewMode: boolean): string =>
  draft.portraitFileId || (reviewMode ? draft.proposedData.portraitId : null) || ''
const render = (page: EditorPage): void => {
  const state = states.get(page)
  if (!state) return
  const form = state.draft.proposedData
  const options = page.data.options
  const portraitMeta = state.portraitUpload?.meta ?? state.draft.portraitMeta
  const name = (kind: string, id: string) =>
    options[kind]?.find((option) => option.id === id)?.name ?? (id ? '待確認資料' : '請選擇')
  const skillTypeOptions = page.data.skillTypeOptions
  const expandedSkillIds = new Set(page.data.expandedSkillIds)
  const skillById = new Map(state.context.skills.map((skill) => [skill.id, skill]))
  page.setData({
    form,
    portraitFileId: portraitPreviewId(state.draft, page.data.reviewMode),
    portraitMetaText: portraitMeta
      ? `${portraitMeta.width} × ${portraitMeta.height} px · ${Math.ceil(portraitMeta.byteSize / 1024)} KB`
      : '',
    ...(page.data.reviewMode
      ? {
          reviewDiff: buildMaintenanceDiff(state.draft.baseSnapshot, form),
          proposalDiff: buildMaintenanceDiff(state.saved?.proposedData ?? null, form),
        }
      : {}),
    candidates: state.draft.referenceCandidates.map((candidate) => ({
      ...candidate,
      selectedCategoryIds: candidate.categoryId ? [candidate.categoryId] : [],
    })),
    targetOfficerId: state.draft.targetOfficerId ?? '',
    originalName: state.draft.baseSnapshot?.name ?? '',
    baseDataVersion: state.draft.baseDataVersion ?? '',
    modifying: state.draft.operation === 'updateOfficer',
    selected: {
      job: form.jobId ? [form.jobId] : [],
      nationality: form.nationalityId ? [form.nationalityId] : [],
      language: form.languages.map((row) => row.languageId),
      skill: form.skills.map((row) => row.skillId),
      city: form.recruitment.cityIds,
      officer: form.recruitment.requiredOfficerIds,
      requirement: form.recruitment.requirementId ? [form.recruitment.requirementId] : [],
    },
    basicFields: [
      { field: 'rarityId', label: '稀有度', kind: 'rarity' },
      { field: 'typeId', label: '類型', kind: 'type' },
      { field: 'genderId', label: '性別', kind: 'gender' },
    ].map((item) => ({
      ...item,
      options: options[item.kind] ?? [],
      name: name(item.kind, String(form[item.field as keyof MaintenanceOfficerData])) || '請選擇',
    })),
    languageRows: form.languages.map((row) => ({
      id: row.languageId,
      name: name('language', row.languageId),
      level: row.level,
    })),
    skillRows: form.skills.map((row) => {
      const candidate = state.draft.referenceCandidates.find(
        (item) => item.kind === 'skill' && item.key === row.skillId,
      )
      const categoryReference =
        skillById.get(row.skillId) ??
        (candidate?.categoryId ? { cat: candidate.categoryId } : undefined)
      const type = findMaintenanceSkillTypeOption(categoryReference, row, skillTypeOptions)
      const typeIndex = type ? skillTypeOptions.indexOf(type) : 0
      return {
        id: row.skillId,
        name: name('skill', row.skillId),
        level: row.level,
        unlockLevel: row.unlockLevel,
        slot: row.slot,
        typeIndex: Math.max(0, typeIndex),
        typeLabel: type?.label ?? (row.kind === 'active' ? '主動技能' : '被動技能'),
        expanded: page.data.readonly || expandedSkillIds.has(row.skillId),
      }
    }),
  })
}
const updateForm = (page: EditorPage, patch: Partial<MaintenanceOfficerData>): void => {
  const state = writable(page)
  if (!state) return
  state.draft = { ...state.draft, proposedData: { ...state.draft.proposedData, ...patch } }
  page.setData({ error: '', notice: '' })
  render(page)
}
const validationError = (state: EditorState, requirePortrait = false): string => {
  const errors = validateMaintenanceDraft(state.draft, state.context)
  const candidateError = state.draft.referenceCandidates.some(
    (candidate) => candidate.kind === 'skill' && !candidate.description?.trim(),
  )
    ? '請補上候選技能說明'
    : ''
  const invalidNumber =
    state.draft.proposedData.languages.some(
      (row) => !Number.isInteger(row.level) || row.level < 1,
    ) ||
    state.draft.proposedData.skills.some(
      (row) =>
        !Number.isInteger(row.level) ||
        row.level < 1 ||
        !Number.isInteger(row.unlockLevel) ||
        row.unlockLevel < 1 ||
        !Number.isInteger(row.slot) ||
        row.slot < 0,
    )
  const portraitError =
    requirePortrait &&
    state.draft.operation === 'createOfficer' &&
    !state.draft.portraitFileId &&
    !state.portraitUpload
      ? '請上傳正式版頭像'
      : ''
  return (
    errors[0]?.message ||
    candidateError ||
    (!state.draft.proposedData.name.trim() ? '請輸入航海士名稱' : '') ||
    portraitError ||
    (invalidNumber ? '語言與技能等級必須為正整數，槽位必須為非負整數' : '')
  )
}
const persist = async (page: EditorPage, submit: boolean): Promise<void> => {
  const state = writable(page)
  if (!state || page.data.reviewMode) return
  const error = validationError(state, submit)
  if (error) {
    page.setData({ error })
    return
  }
  let portraitUploadPending = Boolean(state.portraitUpload)
  page.setData({ saving: !submit, submitting: submit, error: '', notice: '' })
  if (portraitUploadPending) {
    page.setData({
      portraitStatusKind: 'uploading',
      portraitStatusText: '正在上傳頭像，請稍候…',
    })
  }
  try {
    const service = getOfficerMaintenanceService()
    const isNewWorkOrder = !state.saved
    if (isNewWorkOrder && !state.idempotencyKey) {
      state.idempotencyKey = generateIdempotencyKey()
    }
    const saveIdempotencyKey = isNewWorkOrder
      ? state.idempotencyKey
      : `save:${state.saved!.workOrderId}:${state.saved!.revision}:${submit ? 'submit' : 'draft'}`
    state.saved = await service.saveDraft({
      ...clone(state.draft),
      ...(state.saved
        ? {
            workOrderId: state.saved.workOrderId,
            revision: state.saved.revision,
            updatedAt: state.saved.updatedAt,
          }
        : {}),
      idempotencyKey: saveIdempotencyKey,
      ...(state.portraitUpload ? { portraitUpload: state.portraitUpload } : {}),
    })
    state.draft = {
      ...state.draft,
      portraitFileId: state.saved.portraitFileId ?? null,
      portraitMeta: state.saved.portraitMeta ?? null,
    }
    state.portraitUpload = null
    portraitUploadPending = false
    const portraitFileId = state.saved.portraitFileId ?? ''
    page.setData({
      portraitFileId,
      portraitStatusKind: portraitFileId ? 'uploaded' : 'empty',
      portraitStatusText: portraitFileId ? '頭像已上傳並保留' : '',
      portraitImageFailed: false,
    })
    if (submit) {
      const { workOrderId, revision, updatedAt } = state.saved
      state.saved = await service.submit({
        workOrderId,
        revision,
        updatedAt,
        submitIdempotencyKey: `submit:${workOrderId}:${revision}`,
      })
    }
    page.setData({ readonly: submit, notice: submit ? '工單已送審，等待管理員審核' : '草稿已儲存' })
  } catch (error) {
    if (
      submit &&
      state.saved &&
      error instanceof OfficerMaintenanceError &&
      ['conflict', 'invalid-state'].includes(error.code)
    ) {
      try {
        const recovered = await getOfficerMaintenanceService().loadMine(state.saved.workOrderId)
        if (recovered.status === 'pendingReview') {
          state.saved = recovered
          page.setData({
            readonly: true,
            error: '',
            notice: '工單已送審，等待管理員審核',
          })
          return
        }
      } catch {
        // 重新載入也失敗時，沿用原本錯誤提示與可重試狀態。
      }
    }
    const portraitUploadFailed =
      error instanceof OfficerMaintenanceError &&
      ['invalid-portrait', 'upload-failed'].includes(error.code)
    page.setData({
      error: errorMessage(
        error,
        submit ? '送審失敗，草稿內容已保留，請重試' : '草稿儲存失敗，請重試',
      ),
      ...(portraitUploadPending
        ? portraitUploadFailed
          ? {
              portraitStatusKind: 'error',
              portraitStatusText: '頭像上傳失敗，請重試保存或送審',
            }
          : {
              portraitStatusKind: 'pending',
              portraitStatusText: '頭像待上傳；儲存草稿或送審時會上傳',
            }
        : {}),
    })
  } finally {
    page.setData({ saving: false, submitting: false })
  }
}

const persistReview = async (
  page: EditorPage,
  action: 'save' | 'approve' | 'reject',
): Promise<void> => {
  const state = writable(page)
  if (!state?.saved || !page.data.reviewMode) return
  const reason = (action === 'reject' ? page.data.rejectReason : page.data.reviewReason).trim()
  const error =
    action === 'reject'
      ? reason
        ? ''
        : '請填寫駁回原因'
      : !reason
        ? '請填寫本次修訂原因'
        : validationError(state)
  if (error) {
    page.setData({ error })
    return
  }
  page.setData({ saving: true, error: '', notice: '', conflict: '' })
  const service = getOfficerMaintenanceService()
  const version = () => ({
    workOrderId: state.saved!.workOrderId,
    revision: state.saved!.revision,
    updatedAt: state.saved!.updatedAt,
  })
  try {
    if (action === 'reject') {
      state.saved = await service.reject({ ...version(), reason })
      page.setData({ readonly: true, notice: '工單已駁回，提交者可依原因修正' })
      return
    }
    state.saved = await service.saveReview({
      ...version(),
      reviewedData: clone(state.draft.proposedData),
      referenceCandidates: clone(state.draft.referenceCandidates),
      reason,
    })
    state.draft = {
      ...state.draft,
      proposedData: clone(state.saved.reviewedData ?? state.draft.proposedData),
      referenceCandidates: clone(state.saved.referenceCandidates),
    }
    render(page)
    page.setData({ notice: '管理員修訂已儲存' })
    if (action === 'approve') {
      const diff = page.data.reviewDiff
        .map((item) => `${item.label}：${item.beforeText} → ${item.afterText}`)
        .join('\n')
      const confirm = await wx.showModal({
        title: '確認核准最新修訂',
        content: `${diff || '航海士欄位無變更'}\n候選項：${state.draft.referenceCandidates.map((item) => item.name).join('、') || '無'}\n核准後仍需發布才會更新名鑑。`,
        confirmText: '核准',
        cancelText: '返回檢查',
      })
      if (!confirm.confirm) return
      state.saved = await service.approve(version())
      page.setData({ readonly: true, notice: '工單已核准，待發布' })
    }
  } catch (error) {
    const message = errorMessage(error, '審核操作失敗，內容已保留，請重試')
    page.setData({
      error: message,
      conflict:
        error instanceof OfficerMaintenanceError &&
        ['conflict', 'base-version-conflict'].includes(error.code)
          ? message
          : '',
    })
  } finally {
    page.setData({ saving: false })
  }
}

/** 使用者與管理員共用完整欄位表單，權限仍由雲函數檢查。 */
const defineEditor = <T>(definition: T & ThisType<EditorPage>): T => definition
export const createMaintenanceEditorPage = (reviewMode = false) =>
  defineEditor({
    data: {
      reviewMode,
      reviewList: false,
      reviewOrders: [],
      reviewDiff: [],
      proposalDiff: [],
      reviewReason: '',
      rejectReason: '',
      rejectionReason: '',
      conflict: '',
      loading: true,
      loadError: '',
      saving: false,
      submitting: false,
      readonly: false,
      error: '',
      notice: '',
      targetOfficerId: '',
      originalName: '',
      baseDataVersion: '',
      modifying: false,
      form: emptyForm(),
      candidates: [],
      options: {},
      selected: {},
      basicFields: [],
      languageRows: [],
      skillRows: [],
      skillTypeOptions: [],
      expandedSkillIds: [],
      portraitTempPath: '',
      portraitFileId: '',
      portraitMetaText: '',
      portraitStatusKind: 'empty',
      portraitStatusText: '',
      portraitImageFailed: false,
    } as EditorData,

    async onLoad(query?: Record<string, string | undefined>) {
      this.setData({
        loading: true,
        loadError: '',
        expandedSkillIds: [],
        portraitTempPath: '',
        portraitFileId: '',
        portraitMetaText: '',
        portraitStatusKind: 'empty',
        portraitStatusText: '',
        portraitImageFailed: false,
      })
      wx.setNavigationBarTitle({ title: reviewMode ? '管理員工單審核' : '維護工單' })
      try {
        const dictionaries = await getMaintenanceDictionaries()
        const skills = Object.values(getSkills())
        const context: MaintenanceValidationContext = {
          dictionaries,
          skills,
          officers: getCatalog(),
        }
        const skillTypeOptions = buildMaintenanceSkillTypeOptions(dictionaries.skillCategories)
        this.setData({
          skillTypeOptions,
          options: {
            skillCategory: toOptions(dictionaries.skillCategories),
            rarity: toOptions(dictionaries.rarities),
            type: toOptions(dictionaries.types),
            gender: toOptions(dictionaries.genders),
            job: toOptions(dictionaries.jobs),
            nationality: toOptions(dictionaries.nationalities),
            language: toOptions(dictionaries.languages),
            city: toOptions(dictionaries.cities),
            requirement: toOptions(dictionaries.requirements),
            officer: toOptions(getCatalog()),
            skill: skills.map((skill) => ({
              id: skill.id,
              name: skill.n,
              aliases: [],
              meta: skill.cn,
              searchableText: `${skill.n} ${skill.id} ${skill.cn}`,
            })),
          },
        })
        let draft: MaintenanceWorkOrderDraft = {
          operation: 'createOfficer',
          targetOfficerId: null,
          baseDataVersion: null,
          baseSnapshot: null,
          proposedData: emptyForm(),
          referenceCandidates: [],
        }
        let saved: MaintenanceWorkOrder | null = null
        if (reviewMode) {
          const records = await getOfficerMaintenanceService().listAdmin('pendingReview')
          if (!query?.workOrderId) {
            this.setData({ reviewOrders: records, reviewList: true, readonly: true })
            return
          }
          saved = records.find((record) => record.workOrderId === query.workOrderId) ?? null
          if (!saved)
            throw new OfficerMaintenanceError(
              'not-found',
              '待審核工單不存在或已完成審核，請返回審核列表',
            )
          draft = { ...clone(saved), proposedData: clone(saved.reviewedData ?? saved.proposedData) }
          this.setData({ readonly: false })
        } else if (query?.workOrderId) {
          saved = await getOfficerMaintenanceService().loadMine(query.workOrderId)
          if (query.targetOfficerId && query.targetOfficerId !== saved.targetOfficerId)
            throw new Error('target-mismatch')
          draft = clone(saved)
          this.setData({
            readonly: saved.status !== 'draft' && saved.status !== 'rejected',
            rejectionReason: saved.status === 'rejected' ? latestRejectionReason(saved) : '',
            notice:
              saved.status !== 'draft' && saved.status !== 'rejected'
                ? '工單已送審，目前僅供檢視'
                : '',
          })
        } else if (query?.targetOfficerId || query?.operation === 'updateOfficer') {
          const targetOfficerId = query.targetOfficerId
          if (!targetOfficerId) throw new Error('missing-target')
          const official = await getMaintenanceOfficer(targetOfficerId)
          if (!official) throw new Error('missing-officer')
          draft = {
            operation: 'updateOfficer',
            targetOfficerId,
            baseDataVersion: official.dataVersion,
            baseSnapshot: clone(official.data),
            proposedData: clone(official.data),
            referenceCandidates: [],
          }
        }
        states.set(this, { draft, saved, context, portraitUpload: null, idempotencyKey: '' })
        const portraitFileId = portraitPreviewId(draft, reviewMode)
        this.setData({
          portraitTempPath: '',
          portraitImageFailed: false,
          portraitStatusKind: portraitFileId ? 'uploaded' : 'empty',
          portraitStatusText: portraitFileId ? '頭像已上傳並保留' : '',
        })
        render(this)
      } catch (error) {
        this.setData({
          loadError: errorMessage(error, '工單或正式航海士資料載入失敗，請返回列表重新開啟'),
        })
      } finally {
        this.setData({ loading: false })
      }
    },

    onFieldInput(event: WechatMiniprogram.Input) {
      const field = String(event.currentTarget.dataset.field ?? '')
      if (field === 'name' || field === 'maintenanceNote')
        updateForm(this, { [field]: event.detail.value })
      if (field === 'recruitmentNote')
        updateForm(this, {
          recruitment: { ...this.data.form.recruitment, note: event.detail.value || null },
        })
    },
    onPortraitTap() {
      if (
        this.data.modifying ||
        this.data.reviewMode ||
        this.data.readonly ||
        this.data.saving ||
        this.data.submitting
      )
        return
      choosePortrait(this)
    },
    onPortraitRemove() {
      const state = states.get(this)
      if (!state || this.data.modifying) return
      if (state.draft.portraitFileId) {
        setPortraitError(this, '頭像已上傳；如需更換請重新選擇新頭像')
        return
      }
      state.portraitUpload = null
      this.setData({
        portraitTempPath: '',
        portraitMetaText: '',
        portraitStatusKind: 'empty',
        portraitStatusText: '',
        portraitImageFailed: false,
        error: '',
      })
    },
    onPortraitImageError() {
      const message = '頭像預覽載入失敗，請重新選擇或稍後重試'
      this.setData({
        portraitImageFailed: true,
        portraitStatusKind: 'error',
        portraitStatusText: message,
        error: message,
        notice: '',
      })
    },
    onBasicChange(event: WechatMiniprogram.PickerChange) {
      const field = this.data.basicFields.find(
        (item) => item.field === event.currentTarget.dataset.field,
      )
      const option = field?.options[Number(event.detail.value)]
      if (field && option) updateForm(this, { [field.field]: option.id })
    },
    onEntitySelect(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
      const kind = String(event.currentTarget.dataset.kind ?? '')
      const id = event.detail.id
      if (!this.data.options[kind]?.some((option) => option.id === id)) return
      const form = this.data.form
      if (kind === 'job') updateForm(this, { jobId: id })
      if (kind === 'nationality') updateForm(this, { nationalityId: id })
      if (kind === 'language' && !form.languages.some((row) => row.languageId === id))
        updateForm(this, { languages: [...form.languages, { languageId: id, level: 1 }] })
      if (kind === 'skill' && !form.skills.some((row) => row.skillId === id)) {
        const skillType = findMaintenanceSkillTypeOption(
          states.get(this)?.context.skills.find((skill) => skill.id === id),
          { kind: 'passive' },
          this.data.skillTypeOptions,
        )
        const sourceGroup = skillType?.sourceGroup ?? 'sk0'
        const nextSkill = {
          skillId: id,
          kind: skillType?.kind ?? 'passive',
          sourceGroup,
          slot: nextMaintenanceSkillSlot(form.skills, sourceGroup),
          unlockLevel: 1,
          level: 1,
        } as const
        this.setData({
          expandedSkillIds: [...new Set([...this.data.expandedSkillIds, id])],
        })
        updateForm(this, { skills: [...form.skills, nextSkill] })
      }
      if (kind === 'city' && !form.recruitment.cityIds.includes(id))
        updateForm(this, {
          recruitment: { ...form.recruitment, cityIds: [...form.recruitment.cityIds, id] },
        })
      if (kind === 'officer' && !form.recruitment.requiredOfficerIds.includes(id))
        updateForm(this, {
          recruitment: {
            ...form.recruitment,
            requiredOfficerIds: [...form.recruitment.requiredOfficerIds, id],
          },
        })
      if (kind === 'requirement')
        updateForm(this, { recruitment: { ...form.recruitment, requirementId: id } })
    },
    onEntityRemove(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
      const kind = String(event.currentTarget.dataset.kind ?? '')
      const id = event.detail.id
      const form = this.data.form
      if (kind === 'job') updateForm(this, { jobId: '' })
      if (kind === 'nationality') updateForm(this, { nationalityId: '' })
      if (kind === 'language')
        updateForm(this, { languages: form.languages.filter((row) => row.languageId !== id) })
      if (kind === 'skill') {
        this.setData({
          expandedSkillIds: this.data.expandedSkillIds.filter((value) => value !== id),
        })
        updateForm(this, { skills: form.skills.filter((row) => row.skillId !== id) })
      }
      if (kind === 'city')
        updateForm(this, {
          recruitment: {
            ...form.recruitment,
            cityIds: form.recruitment.cityIds.filter((value) => value !== id),
          },
        })
      if (kind === 'officer')
        updateForm(this, {
          recruitment: {
            ...form.recruitment,
            requiredOfficerIds: form.recruitment.requiredOfficerIds.filter((value) => value !== id),
          },
        })
      if (kind === 'requirement')
        updateForm(this, { recruitment: { ...form.recruitment, requirementId: null } })
    },
    onRelationInput(event: WechatMiniprogram.Input) {
      const { kind, id, field } = event.currentTarget.dataset
      const value = Number(event.detail.value)
      if (kind === 'language' && field === 'level')
        updateForm(this, {
          languages: this.data.form.languages.map((row) =>
            row.languageId === id ? { ...row, level: value } : row,
          ),
        })
      if (kind === 'skill' && ['level', 'unlockLevel', 'slot'].includes(String(field)))
        updateForm(this, {
          skills: this.data.form.skills.map((row) =>
            row.skillId === id ? { ...row, [String(field)]: value } : row,
          ),
        })
    },
    onSkillTypeChange(event: WechatMiniprogram.PickerChange) {
      const type = this.data.skillTypeOptions[Number(event.detail.value)]
      const skillId = String(event.currentTarget.dataset.id ?? '')
      if (!type || !skillId) return
      const current = this.data.form.skills.find((row) => row.skillId === skillId)
      if (!current) return
      const rest = this.data.form.skills.filter((row) => row.skillId !== skillId)
      const targetSlotTaken = rest.some(
        (row) => row.sourceGroup === type.sourceGroup && row.slot === current.slot,
      )
      updateForm(this, {
        skills: this.data.form.skills.map((row) =>
          row.skillId === skillId
            ? {
                ...row,
                sourceGroup: type.sourceGroup,
                kind: type.kind,
                slot: targetSlotTaken
                  ? nextMaintenanceSkillSlot(rest, type.sourceGroup)
                  : current.slot,
              }
            : row,
        ),
      })
    },
    onToggleSkill(event: WechatMiniprogram.TouchEvent) {
      const state = writable(this)
      const skillId = String(event.currentTarget.dataset.id ?? '')
      if (!state || !skillId || !this.data.form.skills.some((row) => row.skillId === skillId))
        return
      const expanded = new Set(this.data.expandedSkillIds)
      if (expanded.has(skillId)) expanded.delete(skillId)
      else expanded.add(skillId)
      this.setData({ expandedSkillIds: [...expanded] })
      render(this)
    },
    onCreateCandidate(event: WechatMiniprogram.CustomEvent<{ name: string }>) {
      const state = writable(this)
      const kind = String(event.currentTarget.dataset.kind ?? '') as ReferenceCandidate['kind']
      const name = event.detail.name.trim()
      if (!state || !name || !['skill', 'job', 'language', 'nationality'].includes(kind)) return
      if (
        state.draft.referenceCandidates.some(
          (candidate) => candidate.kind === kind && candidate.name === name,
        )
      ) {
        this.setData({ error: '同類候選項名稱不可重複' })
        return
      }
      const key = `candidate_${Date.now()}_${state.draft.referenceCandidates.length}`
      const proposedData = state.draft.proposedData
      const nextProposedData: MaintenanceOfficerData =
        kind === 'job'
          ? { ...proposedData, jobId: key }
          : kind === 'nationality'
            ? { ...proposedData, nationalityId: key }
            : kind === 'language'
              ? {
                  ...proposedData,
                  languages: [...proposedData.languages, { languageId: key, level: 1 }],
                }
              : {
                  ...proposedData,
                  skills: [
                    ...proposedData.skills,
                    {
                      skillId: key,
                      kind: 'passive',
                      sourceGroup: 'sk0',
                      slot: nextMaintenanceSkillSlot(proposedData.skills, 'sk0'),
                      unlockLevel: 1,
                      level: 1,
                    },
                  ],
                }
      state.draft = {
        ...state.draft,
        proposedData: nextProposedData,
        referenceCandidates: [
          ...state.draft.referenceCandidates,
          {
            key,
            kind,
            name,
            aliases: [],
          },
        ],
      }
      this.setData({
        expandedSkillIds: [...new Set([...this.data.expandedSkillIds, key])],
      })
      render(this)
    },
    onCandidateCategoryChange(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
      const state = writable(this)
      const category = this.data.options.skillCategory?.find(
        (option) => option.id === event.detail.id,
      )
      if (!state || !category) return
      const candidate = state.draft.referenceCandidates[Number(event.currentTarget.dataset.index)]
      const type = this.data.skillTypeOptions.find((item) => item.categoryId === category.id)
      const currentSkill =
        candidate?.kind === 'skill'
          ? state.draft.proposedData.skills.find((item) => item.skillId === candidate.key)
          : undefined
      const otherSkills = currentSkill
        ? state.draft.proposedData.skills.filter((item) => item.skillId !== currentSkill.skillId)
        : state.draft.proposedData.skills
      state.draft = {
        ...state.draft,
        proposedData:
          type && currentSkill
            ? {
                ...state.draft.proposedData,
                skills: state.draft.proposedData.skills.map((item) =>
                  item.skillId === currentSkill.skillId
                    ? {
                        ...item,
                        kind: type.kind,
                        sourceGroup: type.sourceGroup,
                        slot: otherSkills.some(
                          (other) =>
                            other.sourceGroup === type.sourceGroup && other.slot === item.slot,
                        )
                          ? nextMaintenanceSkillSlot(otherSkills, type.sourceGroup)
                          : item.slot,
                      }
                    : item,
                ),
              }
            : state.draft.proposedData,
        referenceCandidates: state.draft.referenceCandidates.map((candidate, index) =>
          index === Number(event.currentTarget.dataset.index) && candidate.kind === 'skill'
            ? { ...candidate, categoryId: category.id }
            : candidate,
        ),
      }
      render(this)
    },
    onCandidateCategoryRemove(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
      const state = writable(this)
      if (!state) return
      state.draft = {
        ...state.draft,
        referenceCandidates: state.draft.referenceCandidates.map((candidate, index) =>
          index === Number(event.currentTarget.dataset.index) &&
          candidate.kind === 'skill' &&
          candidate.categoryId === event.detail.id
            ? { ...candidate, categoryId: undefined }
            : candidate,
        ),
      }
      render(this)
    },
    onCandidateInput(event: WechatMiniprogram.Input) {
      const state = writable(this)
      const field = String(event.currentTarget.dataset.field)
      if (!state || !['name', 'description', 'levelInfo', 'aliases'].includes(field)) return
      state.draft = {
        ...state.draft,
        referenceCandidates: state.draft.referenceCandidates.map((candidate, index) =>
          index === Number(event.currentTarget.dataset.index)
            ? {
                ...candidate,
                [field]:
                  field === 'aliases'
                    ? event.detail.value
                        .split(/[，,]/)
                        .map((value) => value.trim())
                        .filter(Boolean)
                    : event.detail.value,
              }
            : candidate,
        ),
      }
      this.setData({
        error:
          validateMaintenanceDraft(state.draft, state.context).find(
            (error) =>
              error.field.startsWith('referenceCandidates') &&
              (error.field.endsWith('.name') || error.field.endsWith('.aliases')),
          )?.message ?? '',
        notice: '',
      })
      render(this)
    },
    onCandidateRemove(event: WechatMiniprogram.TouchEvent) {
      const state = writable(this)
      if (!state) return
      const index = Number(event.currentTarget.dataset.index)
      const candidate = state.draft.referenceCandidates[index]
      if (!candidate) return
      const key = candidate.key
      const proposedData = state.draft.proposedData
      const nextProposedData: MaintenanceOfficerData =
        candidate.kind === 'job'
          ? proposedData.jobId === key
            ? { ...proposedData, jobId: '' }
            : proposedData
          : candidate.kind === 'nationality'
            ? proposedData.nationalityId === key
              ? { ...proposedData, nationalityId: '' }
              : proposedData
            : candidate.kind === 'language'
              ? {
                  ...proposedData,
                  languages: proposedData.languages.filter((item) => item.languageId !== key),
                }
              : {
                  ...proposedData,
                  skills: proposedData.skills.filter((item) => item.skillId !== key),
                }
      state.draft = {
        ...state.draft,
        proposedData: nextProposedData,
        referenceCandidates: state.draft.referenceCandidates.filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      }
      render(this)
    },
    async onSaveDraft() {
      await persist(this, false)
    },
    onCandidateMerge(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
      const state = writable(this)
      if (!state || !reviewMode) return
      const key = String(event.currentTarget.dataset.key ?? '')
      const candidate = state.draft.referenceCandidates.find((item) => item.key === key)
      if (
        !candidate ||
        !this.data.options[candidate.kind]?.some((item) => item.id === event.detail.id)
      )
        return
      const merged = mergeMaintenanceCandidate(
        state.draft.proposedData,
        state.draft.referenceCandidates,
        key,
        event.detail.id,
      )
      state.draft = {
        ...state.draft,
        proposedData: merged.reviewedData,
        referenceCandidates: merged.referenceCandidates,
      }
      this.setData({ error: '', notice: '候選項已合併至既有資料，請檢查關聯等級與槽位後儲存' })
      render(this)
    },
    onRejectReasonInput(event: WechatMiniprogram.Input) {
      if (writable(this) && reviewMode) this.setData({ rejectReason: event.detail.value })
    },
    onReviewReasonInput(event: WechatMiniprogram.Input) {
      if (writable(this) && reviewMode)
        this.setData({ reviewReason: event.detail.value, error: '' })
    },
    async onSaveReview() {
      await persistReview(this, 'save')
    },
    async onApprove() {
      await persistReview(this, 'approve')
    },
    async onReject() {
      await persistReview(this, 'reject')
    },
    onReviewOrder(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id ?? '')
      if (this.data.reviewOrders.some((item) => item.workOrderId === id))
        wx.navigateTo({
          url: `/subpkg-maintenance/pages/work-order-review/index?workOrderId=${encodeURIComponent(id)}`,
        })
    },
    onReviewList() {
      wx.navigateTo({ url: '/subpkg-maintenance/pages/work-order-review/index' })
    },
    async onSubmit() {
      await persist(this, true)
    },
    onMyWorkOrders() {
      wx.navigateTo({ url: '/subpkg-maintenance/pages/work-orders/index' })
    },
  })
