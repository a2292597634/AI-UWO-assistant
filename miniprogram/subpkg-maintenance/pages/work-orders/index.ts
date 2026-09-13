import type {
  OfficerErrorReport,
  OfficerErrorReportStatus,
  OfficerErrorType,
} from '../../../contracts/officer-error-report'
import {
  getOfficerErrorReportService,
  OfficerErrorReportError,
} from '../../../runtime/officer-error-report-service'
import { getCatalog } from '../../../runtime/main-data-store'

const STATUS_LABELS: Readonly<Record<OfficerErrorReportStatus, string>> = {
  pending: '待確認',
  needsInfo: '需要補充',
  accepted: '已採納',
  fixed: '已修正',
  rejected: '不採納',
}

const TYPE_LABELS: Readonly<Record<OfficerErrorType, string>> = {
  basic: '基本資料',
  skill: '技能資料',
  skillLevel: '技能／解鎖等級',
  recruitment: '招募資訊',
  portrait: '頭像圖片',
  text: '文字錯誤',
  other: '其他',
}

interface ReportRow extends OfficerErrorReport {
  readonly officerName: string
  readonly statusLabel: string
  readonly errorTypeText: string
  readonly canSupplement: boolean
  readonly reviewReply: string
}

const presentReport = (
  report: OfficerErrorReport,
  officerNames: ReadonlyMap<string, string>,
): ReportRow => ({
  ...report,
  officerName: officerNames.get(report.officerId) ?? report.officerId,
  statusLabel: STATUS_LABELS[report.status],
  errorTypeText: report.errorTypes.map((type) => TYPE_LABELS[type]).join('、'),
  canSupplement: report.status === 'needsInfo',
  reviewReply: report.reviewReply?.trim() ?? '',
})

Page({
  data: {
    rows: [] as ReportRow[],
    loading: false,
    loadError: '',
    adminReviewVisible: false,
    adminReviewCount: 0,
    checkingAdmin: false,
    supplementReportId: '',
    supplementText: '',
    supplementSourceUrl: '',
    supplementTempPaths: [] as string[],
    submittingSupplement: false,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '我的回報' })
  },

  onShow() {
    void this.loadReports()
    void this.checkAdminPermission()
  },

  async loadReports() {
    if (this.data.loading) return
    this.setData({ loading: true, loadError: '' })
    try {
      const names = new Map(getCatalog().map(({ id, name }) => [id, name]))
      const records = await getOfficerErrorReportService().listMine()
      this.setData({ rows: records.map((record) => presentReport(record, names)) })
    } catch (error) {
      this.setData({
        loadError:
          error instanceof OfficerErrorReportError ? error.message : '回報列表載入失敗，請重試',
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async checkAdminPermission() {
    if (this.data.checkingAdmin) return
    this.setData({ checkingAdmin: true })
    try {
      const records = await getOfficerErrorReportService().listAdmin('pending')
      this.setData({ adminReviewVisible: true, adminReviewCount: records.length })
    } catch {
      this.setData({ adminReviewVisible: false, adminReviewCount: 0 })
    } finally {
      this.setData({ checkingAdmin: false })
    }
  },

  onRetry() {
    void this.loadReports()
  },

  onNewReport() {
    wx.navigateTo({ url: '/pages/officer-editor/index' })
  },

  onAdminReview() {
    if (!this.data.adminReviewVisible) return
    wx.navigateTo({ url: '/subpkg-maintenance/pages/work-order-review/index' })
  },

  onOpenSupplement(event: WechatMiniprogram.BaseEvent) {
    const reportId = String(event.currentTarget.dataset['id'] ?? '')
    const row = this.data.rows.find((item) => item.reportId === reportId)
    if (!row?.canSupplement) return
    this.setData({
      supplementReportId: reportId,
      supplementText: '',
      supplementSourceUrl: '',
      supplementTempPaths: [],
    })
  },

  onCloseSupplement() {
    this.setData({ supplementReportId: '', supplementTempPaths: [] })
  },

  noop() {},

  onSupplementInput(event: WechatMiniprogram.Input) {
    this.setData({ supplementText: event.detail.value })
  },

  onSupplementSourceInput(event: WechatMiniprogram.Input) {
    this.setData({ supplementSourceUrl: event.detail.value })
  },

  async onChooseSupplementScreenshots() {
    const remaining = 3 - this.data.supplementTempPaths.length
    if (remaining <= 0) return
    const result = await wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    })
    this.setData({
      supplementTempPaths: this.data.supplementTempPaths.concat(
        result.tempFiles.map(({ tempFilePath }) => tempFilePath),
      ),
    })
  },

  onRemoveSupplementScreenshot(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset['index'])
    this.setData({
      supplementTempPaths: this.data.supplementTempPaths.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    })
  },

  async onSubmitSupplement() {
    if (this.data.submittingSupplement) return
    const text = this.data.supplementText.trim()
    if (!text) {
      wx.showToast({ title: '請填寫補充內容', icon: 'none' })
      return
    }
    const current = this.data.rows.find(({ reportId }) => reportId === this.data.supplementReportId)
    if (!current?.canSupplement) return

    this.setData({ submittingSupplement: true })
    wx.showLoading({ title: '正在提交', mask: true })
    try {
      const service = getOfficerErrorReportService()
      const screenshotFileIds = await service.uploadScreenshots(this.data.supplementTempPaths)
      const updated = await service.appendSupplement({
        reportId: current.reportId,
        revision: current.revision,
        updatedAt: current.updatedAt,
        text,
        sourceUrl: this.data.supplementSourceUrl.trim(),
        screenshotFileIds,
      })
      const names = new Map(getCatalog().map(({ id, name }) => [id, name]))
      this.setData({
        rows: this.data.rows.map((row) =>
          row.reportId === updated.reportId ? presentReport(updated, names) : row,
        ),
        supplementReportId: '',
        supplementText: '',
        supplementSourceUrl: '',
        supplementTempPaths: [],
      })
      wx.showToast({ title: '補充資料已提交', icon: 'success' })
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '提交失敗，請稍後再試',
        icon: 'none',
      })
    } finally {
      wx.hideLoading()
      this.setData({ submittingSupplement: false })
    }
  },
})
