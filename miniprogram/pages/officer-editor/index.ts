import type {
  OfficerErrorReportDraft,
  OfficerErrorType,
} from '../../contracts/officer-error-report'
import { validateOfficerErrorReportDraft } from '../../domain/officer-error-report'
import {
  buildOfficerReportOptions,
  mapOfficerReportFieldErrors,
  presentOfficerReportIdentity,
  type OfficerReportFieldErrors,
  type OfficerReportIdentityView,
  type OfficerReportOfficerOption,
} from '../../presenters/officer-error-report-presenter'
import { getOfficerErrorReportService } from '../../runtime/officer-error-report-service'
import {
  getCatalog,
  getMaintenanceDictionaries,
  getMaintenanceOfficer,
} from '../../runtime/main-data-store'

interface ErrorTypeOption {
  readonly id: OfficerErrorType
  readonly name: string
  readonly selected: boolean
}

const ERROR_TYPES: readonly Omit<ErrorTypeOption, 'selected'>[] = [
  { id: 'basic', name: '基本資料' },
  { id: 'skill', name: '技能資料' },
  { id: 'skillLevel', name: '技能／解鎖等級' },
  { id: 'recruitment', name: '招募資訊' },
  { id: 'portrait', name: '頭像圖片' },
  { id: 'text', name: '文字錯誤' },
  { id: 'other', name: '其他' },
]

const emptyDraft = (): OfficerErrorReportDraft => ({
  officerId: '',
  errorTypes: [],
  description: '',
  suggestedCorrection: '',
  sourceUrl: '',
  screenshotFileIds: [],
  supplement: '',
})

const withoutFieldError = (
  errors: OfficerReportFieldErrors,
  field: keyof OfficerErrorReportDraft,
): OfficerReportFieldErrors => {
  const next = { ...errors }
  delete next[field]
  return next
}

const evidenceSummary = (sourceUrl: string, screenshotCount: number): string => {
  const parts: string[] = []
  if (/^https?:\/\/\S+$/i.test(sourceUrl.trim())) parts.push('1 個網址')
  if (screenshotCount > 0) parts.push(`${String(screenshotCount)} 張截圖`)
  return parts.length > 0 ? parts.join(' · ') : '添加來源網址或證據截圖'
}

Page({
  data: {
    officerOptions: [] as OfficerReportOfficerOption[],
    officerIdentity: null as OfficerReportIdentityView | null,
    selectingOfficer: true,
    identityLoading: false,
    portraitFailed: false,
    returnToOfficerId: '',
    errorTypeOptions: ERROR_TYPES.map((item) => ({ ...item, selected: false })),
    draft: emptyDraft(),
    fieldErrors: {} as OfficerReportFieldErrors,
    descriptionCount: 0,
    correctionCount: 0,
    evidenceExpanded: false,
    evidenceSummary: '添加來源網址或證據截圖',
    screenshotTempPaths: [] as string[],
    submitting: false,
    submitError: '',
    submittedReportId: '',
  },

  async onLoad(query?: Record<string, string | undefined>) {
    const officerOptions = buildOfficerReportOptions(getCatalog())
    const requestedId = query?.officerId ? decodeURIComponent(query.officerId) : ''
    const hasRequestedOfficer = officerOptions.some(({ id }) => id === requestedId)
    this.setData({
      officerOptions,
      returnToOfficerId: hasRequestedOfficer ? requestedId : '',
    })
    if (hasRequestedOfficer) await this.loadOfficerIdentity(requestedId)
  },

  async loadOfficerIdentity(officerId: string) {
    const catalogEntry = getCatalog().find(({ id }) => id === officerId)
    if (!catalogEntry) return
    this.setData({ identityLoading: true, portraitFailed: false })
    try {
      const [maintenance, dictionaries] = await Promise.all([
        getMaintenanceOfficer(officerId),
        getMaintenanceDictionaries(),
      ])
      if (!maintenance) {
        this.setData({ submitError: '暫時無法讀取這位航海士的完整資料，請稍後再試。' })
        return
      }
      this.setData({
        officerIdentity: presentOfficerReportIdentity(catalogEntry, maintenance.data, dictionaries),
        selectingOfficer: false,
        'draft.officerId': officerId,
        fieldErrors: withoutFieldError(this.data.fieldErrors, 'officerId'),
        submitError: '',
      })
    } catch (error) {
      this.setData({
        submitError:
          error instanceof Error ? error.message : '暫時無法讀取航海士資料，請稍後再試。',
      })
    } finally {
      this.setData({ identityLoading: false })
    }
  },

  async onOfficerSelect(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const officerId = String(event.detail.id ?? '')
    if (officerId) await this.loadOfficerIdentity(officerId)
  },

  onChangeOfficer() {
    this.setData({ selectingOfficer: true })
  },

  onPortraitError() {
    this.setData({ portraitFailed: true })
  },

  onErrorTypeTap(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset['id'] as OfficerErrorType | undefined
    if (!id) return
    const errorTypeOptions = this.data.errorTypeOptions.map((item) =>
      item.id === id ? { ...item, selected: !item.selected } : item,
    )
    this.setData({
      errorTypeOptions,
      'draft.errorTypes': errorTypeOptions.filter(({ selected }) => selected).map(({ id }) => id),
      fieldErrors: withoutFieldError(this.data.fieldErrors, 'errorTypes'),
    })
  },

  onDescriptionInput(event: WechatMiniprogram.Input) {
    const value = String(event.detail.value ?? '')
    this.setData({
      'draft.description': value,
      descriptionCount: value.length,
      fieldErrors: withoutFieldError(this.data.fieldErrors, 'description'),
    })
  },

  onCorrectionInput(event: WechatMiniprogram.Input) {
    const value = String(event.detail.value ?? '')
    this.setData({
      'draft.suggestedCorrection': value,
      correctionCount: value.length,
      fieldErrors: withoutFieldError(this.data.fieldErrors, 'suggestedCorrection'),
    })
  },

  onSourceUrlInput(event: WechatMiniprogram.Input) {
    const value = String(event.detail.value ?? '')
    this.setData({
      'draft.sourceUrl': value,
      evidenceSummary: evidenceSummary(value, this.data.screenshotTempPaths.length),
      fieldErrors: withoutFieldError(this.data.fieldErrors, 'sourceUrl'),
    })
  },

  onToggleEvidence() {
    this.setData({
      evidenceExpanded: !this.data.evidenceExpanded,
      evidenceSummary: evidenceSummary(
        this.data.draft.sourceUrl,
        this.data.screenshotTempPaths.length,
      ),
    })
  },

  async onChooseScreenshots() {
    const remaining = 3 - this.data.screenshotTempPaths.length
    if (remaining <= 0) return
    const result = await wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    })
    const screenshotTempPaths = this.data.screenshotTempPaths.concat(
      result.tempFiles.map(({ tempFilePath }) => tempFilePath),
    )
    this.setData({
      screenshotTempPaths,
      evidenceSummary: evidenceSummary(this.data.draft.sourceUrl, screenshotTempPaths.length),
      fieldErrors: withoutFieldError(this.data.fieldErrors, 'screenshotFileIds'),
    })
  },

  onRemoveScreenshot(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset['index'])
    const screenshotTempPaths = this.data.screenshotTempPaths.filter(
      (_, itemIndex) => itemIndex !== index,
    )
    this.setData({
      screenshotTempPaths,
      evidenceSummary: evidenceSummary(this.data.draft.sourceUrl, screenshotTempPaths.length),
    })
  },

  onMyReportsTap() {
    wx.navigateTo({ url: '/subpkg-maintenance/pages/work-orders/index' })
  },

  onReturnFromSuccess() {
    const url = this.data.returnToOfficerId
      ? `/subpkg-detail/pages/detail/index?id=${this.data.returnToOfficerId}`
      : '/pages/catalog/index'
    wx.redirectTo({ url })
  },

  async onSubmit() {
    if (this.data.submitting) return
    const validationErrors = validateOfficerErrorReportDraft(this.data.draft)
    if (validationErrors.length > 0) {
      this.setData({ fieldErrors: mapOfficerReportFieldErrors(validationErrors), submitError: '' })
      wx.pageScrollTo({ selector: `#field-${validationErrors[0]!.field}`, duration: 240 })
      return
    }

    this.setData({ submitting: true, submitError: '' })
    try {
      const service = getOfficerErrorReportService()
      const screenshotFileIds = await service.uploadScreenshots(this.data.screenshotTempPaths)
      const report = await service.createReport({ ...this.data.draft, screenshotFileIds })
      this.setData({ submittedReportId: report.reportId, submitting: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : '提交失敗，請稍後再試。'
      this.setData({ submitting: false, submitError: message })
      wx.showToast({ title: message, icon: 'none' })
    }
  },
})
