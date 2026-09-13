import type {
  OfficerErrorReport,
  OfficerErrorReportStatus,
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

interface AdminReport extends OfficerErrorReport {
  readonly officerName: string
  readonly statusLabel: string
}

const present = (report: OfficerErrorReport, names: ReadonlyMap<string, string>): AdminReport => ({
  ...report,
  officerName: names.get(report.officerId) ?? report.officerId,
  statusLabel: STATUS_LABELS[report.status],
})

Page({
  data: {
    statusTabs: [
      { id: 'pending', label: '待確認' },
      { id: 'needsInfo', label: '需要補充' },
      { id: 'accepted', label: '已採納' },
      { id: 'fixed', label: '已修正' },
      { id: 'rejected', label: '不採納' },
    ],
    activeStatus: 'pending' as OfficerErrorReportStatus,
    reports: [] as AdminReport[],
    selectedReportId: '',
    reviewReply: '',
    datasetVersion: '',
    loading: false,
    actionLoading: false,
    loadError: '',
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '錯誤回報審核' })
    void this.loadReports()
  },

  async loadReports() {
    if (this.data.loading) return
    this.setData({ loading: true, loadError: '' })
    try {
      const names = new Map(getCatalog().map(({ id, name }) => [id, name]))
      const records = await getOfficerErrorReportService().listAdmin(this.data.activeStatus)
      const reports = records.map((record) => present(record, names))
      const selectedReportId = reports.some(
        ({ reportId }) => reportId === this.data.selectedReportId,
      )
        ? this.data.selectedReportId
        : ''
      this.setData({ reports, selectedReportId })
    } catch (error) {
      this.setData({
        loadError: error instanceof Error ? error.message : '審核列表載入失敗，請重試',
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onStatusTap(event: WechatMiniprogram.BaseEvent) {
    const status = String(event.currentTarget.dataset['status']) as OfficerErrorReportStatus
    if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, status)) return
    this.setData({
      activeStatus: status,
      selectedReportId: '',
      reviewReply: '',
      datasetVersion: '',
    })
    void this.loadReports()
  },

  onRetry() {
    void this.loadReports()
  },

  onSelectReport(event: WechatMiniprogram.BaseEvent) {
    const reportId = String(event.currentTarget.dataset['id'] ?? '')
    const report = this.data.reports.find((item) => item.reportId === reportId)
    if (!report) return
    this.setData({
      selectedReportId: reportId,
      reviewReply: report.reviewReply ?? '',
      datasetVersion: report.fixedDatasetVersion ?? '',
    })
  },

  onReviewReplyInput(event: WechatMiniprogram.Input) {
    this.setData({ reviewReply: event.detail.value })
  },

  onDatasetVersionInput(event: WechatMiniprogram.Input) {
    this.setData({ datasetVersion: event.detail.value })
  },

  selectedReport(): AdminReport | undefined {
    return this.data.reports.find(({ reportId }) => reportId === this.data.selectedReportId)
  },

  async executeAction(action: 'requestInfo' | 'accept' | 'reject' | 'markFixed'): Promise<void> {
    if (this.data.actionLoading) return
    const report = this.selectedReport()
    if (!report) return
    const reply = this.data.reviewReply.trim()
    if ((action === 'requestInfo' || action === 'reject') && !reply) {
      wx.showToast({ title: '請填寫管理員回覆', icon: 'none' })
      return
    }
    const datasetVersion = this.data.datasetVersion.trim()
    if (action === 'markFixed' && !datasetVersion) {
      wx.showToast({ title: '請填寫修正資料版本', icon: 'none' })
      return
    }

    this.setData({ actionLoading: true })
    wx.showLoading({ title: '正在處理', mask: true })
    const version = {
      reportId: report.reportId,
      revision: report.revision,
      updatedAt: report.updatedAt,
    }
    try {
      const service = getOfficerErrorReportService()
      let updated: OfficerErrorReport
      if (action === 'requestInfo') updated = await service.requestInfo({ ...version, reply })
      else if (action === 'accept') updated = await service.accept({ ...version, reply })
      else if (action === 'reject') updated = await service.reject({ ...version, reply })
      else updated = await service.markFixed({ ...version, datasetVersion, reply })

      const names = new Map(getCatalog().map(({ id, name }) => [id, name]))
      const reports =
        updated.status === this.data.activeStatus
          ? this.data.reports.map((item) =>
              item.reportId === updated.reportId ? present(updated, names) : item,
            )
          : this.data.reports.filter(({ reportId }) => reportId !== updated.reportId)
      this.setData({ reports, selectedReportId: '', reviewReply: '', datasetVersion: '' })
      wx.showToast({ title: '處理完成', icon: 'success' })
    } catch (error) {
      if (error instanceof OfficerErrorReportError && error.code === 'conflict') {
        wx.showToast({ title: '回報已更新，正在重新載入', icon: 'none' })
        await this.loadReports()
      } else {
        wx.showToast({ title: error instanceof Error ? error.message : '操作失敗', icon: 'none' })
      }
    } finally {
      wx.hideLoading()
      this.setData({ actionLoading: false })
    }
  },

  onRequestInfo() {
    return this.executeAction('requestInfo')
  },
  onAccept() {
    return this.executeAction('accept')
  },
  onReject() {
    return this.executeAction('reject')
  },
  onMarkFixed() {
    return this.executeAction('markFixed')
  },
})
