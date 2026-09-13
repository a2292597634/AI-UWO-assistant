import type {
  OfficerErrorReportDraft,
  OfficerErrorType,
} from '../../contracts/officer-error-report'
import { validateOfficerErrorReportDraft } from '../../domain/officer-error-report'
import { getOfficerErrorReportService } from '../../runtime/officer-error-report-service'
import { getCatalog } from '../../runtime/main-data-store'

interface OfficerOption {
  readonly id: string
  readonly name: string
}

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

Page({
  data: {
    officerOptions: [] as OfficerOption[],
    officerIndex: -1,
    selectedOfficerName: '',
    errorTypeOptions: ERROR_TYPES.map((item) => ({ ...item, selected: false })),
    draft: emptyDraft(),
    screenshotTempPaths: [] as string[],
    submitting: false,
  },

  onLoad(query?: Record<string, string | undefined>) {
    const officerOptions = getCatalog().map(({ id, name }) => ({ id, name }))
    const requestedId = query?.officerId ? decodeURIComponent(query.officerId) : ''
    const officerIndex = officerOptions.findIndex(({ id }) => id === requestedId)
    const selected = officerIndex >= 0 ? officerOptions[officerIndex] : undefined
    this.setData({
      officerOptions,
      officerIndex,
      selectedOfficerName: selected?.name ?? '',
      'draft.officerId': selected?.id ?? '',
    })
  },

  onOfficerChange(event: WechatMiniprogram.PickerChange) {
    const officerIndex = Number(event.detail.value)
    const selected = this.data.officerOptions[officerIndex]
    if (!selected) return
    this.setData({
      officerIndex,
      selectedOfficerName: selected.name,
      'draft.officerId': selected.id,
    })
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
    })
  },

  onDescriptionInput(event: WechatMiniprogram.Input) {
    this.setData({ 'draft.description': event.detail.value })
  },

  onCorrectionInput(event: WechatMiniprogram.Input) {
    this.setData({ 'draft.suggestedCorrection': event.detail.value })
  },

  onSourceUrlInput(event: WechatMiniprogram.Input) {
    this.setData({ 'draft.sourceUrl': event.detail.value })
  },

  async onChooseScreenshots() {
    const remaining = 3 - this.data.screenshotTempPaths.length
    if (remaining <= 0) return
    const result = await wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    })
    this.setData({
      screenshotTempPaths: this.data.screenshotTempPaths.concat(
        result.tempFiles.map(({ tempFilePath }) => tempFilePath),
      ),
    })
  },

  onRemoveScreenshot(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset['index'])
    this.setData({
      screenshotTempPaths: this.data.screenshotTempPaths.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    })
  },

  onMyReportsTap() {
    wx.navigateTo({ url: '/subpkg-submission/pages/officer-submissions/index' })
  },

  async onSubmit() {
    if (this.data.submitting) return
    const validationErrors = validateOfficerErrorReportDraft(this.data.draft)
    if (validationErrors.length > 0) {
      wx.showToast({ title: validationErrors[0]!.message, icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '正在提交', mask: true })
    try {
      const service = getOfficerErrorReportService()
      const screenshotFileIds = await service.uploadScreenshots(this.data.screenshotTempPaths)
      await service.createReport({ ...this.data.draft, screenshotFileIds })
      wx.hideLoading()
      await wx.showModal({
        title: '提交成功',
        content: '錯誤回報已送出，可在「我的回報」查看處理進度。',
        showCancel: false,
      })
      wx.redirectTo({ url: '/subpkg-submission/pages/officer-submissions/index' })
    } catch (error) {
      wx.hideLoading()
      this.setData({ submitting: false })
      wx.showToast({
        title: error instanceof Error ? error.message : '提交失敗，請稍後再試',
        icon: 'none',
      })
    }
  },
})
