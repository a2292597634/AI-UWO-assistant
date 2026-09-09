import type {
  MaintenanceOfficerData,
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

interface EditorState {
  draft: MaintenanceWorkOrderDraft
  saved: MaintenanceWorkOrder | null
  context: MaintenanceValidationContext
}
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
    groupIndex: number
    slot: number
  }[]
  groups: readonly string[]
}
interface EditorPage {
  data: EditorData
  setData(value: Record<string, unknown>): void
}
const states = new WeakMap<object, EditorState>()
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const groups = ['sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5'] as const
const groupLabels = ['被動・sk0', '被動・sk1', '主動・sk2', '主動・sk3', '主動・sk4', '被動・sk5']
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
const toOptions = (items: readonly RuntimeDictionaryItem[]): MaintenanceEntityOption[] =>
  items.map((item) => ({
    ...item,
    aliases: [],
    meta: item.id,
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
const render = (page: EditorPage): void => {
  const state = states.get(page)
  if (!state) return
  const form = state.draft.proposedData
  const options = page.data.options
  const name = (kind: string, id: string) =>
    options[kind]?.find((option) => option.id === id)?.name ?? id
  page.setData({
    form,
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
      { field: 'visualGradeId', label: '視覺等級', kind: 'grade' },
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
    skillRows: form.skills.map((row) => ({
      id: row.skillId,
      name: name('skill', row.skillId),
      level: row.level,
      unlockLevel: row.unlockLevel,
      groupIndex: groups.indexOf(row.sourceGroup),
      slot: row.slot,
    })),
  })
}
const updateForm = (page: EditorPage, patch: Partial<MaintenanceOfficerData>): void => {
  const state = writable(page)
  if (!state) return
  state.draft = { ...state.draft, proposedData: { ...state.draft.proposedData, ...patch } }
  page.setData({ error: '', notice: '' })
  render(page)
}
const validationError = (state: EditorState): string => {
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
  return (
    errors[0]?.message ||
    candidateError ||
    (!state.draft.proposedData.name.trim() ? '請輸入航海士名稱' : '') ||
    (invalidNumber ? '語言與技能等級必須為正整數，槽位必須為非負整數' : '')
  )
}
const persist = async (page: EditorPage, submit: boolean): Promise<void> => {
  const state = writable(page)
  if (!state || page.data.reviewMode) return
  const error = validationError(state)
  if (error) {
    page.setData({ error })
    return
  }
  page.setData({ saving: !submit, submitting: submit, error: '', notice: '' })
  try {
    const service = getOfficerMaintenanceService()
    state.saved = await service.saveDraft({
      ...clone(state.draft),
      ...(state.saved
        ? {
            workOrderId: state.saved.workOrderId,
            revision: state.saved.revision,
            updatedAt: state.saved.updatedAt,
          }
        : {}),
    })
    if (submit) {
      const { workOrderId, revision, updatedAt } = state.saved
      state.saved = await service.submit({ workOrderId, revision, updatedAt })
    }
    page.setData({ readonly: submit, notice: submit ? '工單已送審，等待管理員審核' : '草稿已儲存' })
  } catch (error) {
    page.setData({
      error: errorMessage(
        error,
        submit ? '送審失敗，草稿內容已保留，請重試' : '草稿儲存失敗，請重試',
      ),
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
      groups: groupLabels,
    } as EditorData,

    async onLoad(query?: Record<string, string | undefined>) {
      this.setData({ loading: true, loadError: '' })
      wx.setNavigationBarTitle({ title: reviewMode ? '管理員工單審核' : '維護工單' })
      try {
        const dictionaries = await getMaintenanceDictionaries()
        const context: MaintenanceValidationContext = {
          dictionaries,
          skills: Object.values(getSkills()),
          officers: getCatalog(),
        }
        this.setData({
          options: {
            skillCategory: toOptions(dictionaries.skillCategories),
            rarity: toOptions(dictionaries.rarities),
            type: toOptions(dictionaries.types),
            gender: toOptions(dictionaries.genders),
            grade: toOptions(
              [2, 3, 4, 5, 6].map((grade) => ({ id: `grade_${grade}`, name: `等級 ${grade}` })),
            ),
            job: toOptions(dictionaries.jobs),
            nationality: toOptions(dictionaries.nationalities),
            language: toOptions(dictionaries.languages),
            city: toOptions(dictionaries.cities),
            requirement: toOptions(dictionaries.requirements),
            officer: toOptions(getCatalog()),
            skill: Object.values(getSkills()).map((skill) => ({
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
        states.set(this, { draft, saved, context })
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
      if (field === 'portraitId')
        updateForm(this, { portraitId: event.detail.value.trim() || null })
      if (field === 'displayOrder') updateForm(this, { displayOrder: Number(event.detail.value) })
      if (field === 'recruitmentNote')
        updateForm(this, {
          recruitment: { ...this.data.form.recruitment, note: event.detail.value || null },
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
      if (kind === 'skill' && !form.skills.some((row) => row.skillId === id))
        updateForm(this, {
          skills: [
            ...form.skills,
            {
              skillId: id,
              kind: 'passive',
              sourceGroup: 'sk0',
              slot:
                Math.max(
                  -1,
                  ...form.skills.filter((row) => row.sourceGroup === 'sk0').map((row) => row.slot),
                ) + 1,
              unlockLevel: 1,
              level: 1,
            },
          ],
        })
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
      if (kind === 'skill')
        updateForm(this, { skills: form.skills.filter((row) => row.skillId !== id) })
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
    onSkillGroupChange(event: WechatMiniprogram.PickerChange) {
      const sourceGroup = groups[Number(event.detail.value)]
      if (!sourceGroup) return
      updateForm(this, {
        skills: this.data.form.skills.map((row) =>
          row.skillId === event.currentTarget.dataset.id
            ? {
                ...row,
                sourceGroup,
                kind: ['sk2', 'sk3', 'sk4'].includes(sourceGroup) ? 'active' : 'passive',
              }
            : row,
        ),
      })
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
                      slot:
                        Math.max(
                          -1,
                          ...proposedData.skills
                            .filter((row) => row.sourceGroup === 'sk0')
                            .map((row) => row.slot),
                        ) + 1,
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
      render(this)
    },
    onCandidateCategoryChange(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
      const state = writable(this)
      const category = this.data.options.skillCategory?.find(
        (option) => option.id === event.detail.id,
      )
      if (!state || !category) return
      state.draft = {
        ...state.draft,
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
      state.draft = {
        ...state.draft,
        referenceCandidates: state.draft.referenceCandidates.filter(
          (_, index) => index !== Number(event.currentTarget.dataset.index),
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
