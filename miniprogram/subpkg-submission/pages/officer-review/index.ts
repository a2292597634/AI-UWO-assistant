/** 小程序管理员审核工作台列表。权限只由 Cloud Function 返回的状态决定。 */

import type { SubmissionStatus } from '../../../contracts/officer-submission'
import {
  getOfficerSubmissionService,
  OfficerSubmissionError,
} from '../../../runtime/officer-editor-service'
import {
  buildSubmissionSummaryView,
  type SubmissionSummaryView,
} from '../../../presenters/officer-submission-presenter'

interface ReviewTab {
  id: SubmissionStatus
  label: string
}

interface OfficerReviewPageData {
  isAdmin: boolean
  checkingPermission: boolean
  pendingCount: number
  statusTabs: ReviewTab[]
  activeStatus: SubmissionStatus
  rows: SubmissionSummaryView[]
  loading: boolean
  loadError: string
  hasRows: boolean
}

Page({
  data: {
    isAdmin: false,
    checkingPermission: true,
    pendingCount: 0,
    statusTabs: [
      { id: 'pending', label: '待審核' },
      { id: 'approved', label: '待發布' },
      { id: 'rejected', label: '已駁回' },
      { id: 'published', label: '已發布' },
    ],
    activeStatus: 'pending',
    rows: [],
    loading: false,
    loadError: '',
    hasRows: false,
  } as OfficerReviewPageData,

  onLoad() {
    wx.setNavigationBarTitle({ title: '審核工作台' })
    void this.checkPermission()
  },

  async checkPermission() {
    this.setData({ checkingPermission: true, loadError: '' })
    try {
      const result = await getOfficerSubmissionService().getAdminStatus()
      this.setData({ isAdmin: result.isAdmin, checkingPermission: false })
      if (result.isAdmin) void this.loadRows('pending')
    } catch (error) {
      this.setData({
        checkingPermission: false,
        isAdmin: false,
        loadError:
          error instanceof OfficerSubmissionError ? error.message : '管理員身份檢查失敗，請重試',
      })
    }
  },

  async loadRows(status?: SubmissionStatus) {
    if (!this.data.isAdmin) return
    const activeStatus = status ?? (this.data.activeStatus as SubmissionStatus)
    this.setData({ loading: true, loadError: '', activeStatus })
    try {
      const summaries = await getOfficerSubmissionService().listAdmin(activeStatus)
      const rows = summaries.map((summary) => buildSubmissionSummaryView(summary))
      this.setData({
        rows,
        hasRows: rows.length > 0,
        loading: false,
        ...(activeStatus === 'pending' ? { pendingCount: rows.length } : {}),
      })
    } catch (error) {
      this.setData({
        loading: false,
        loadError:
          error instanceof OfficerSubmissionError ? error.message : '投稿列表載入失敗，請重試',
      })
    }
  },

  onStatusTab(event: WechatMiniprogram.BaseEvent) {
    const status = event.currentTarget.dataset.status
    if (
      status !== 'pending' &&
      status !== 'approved' &&
      status !== 'rejected' &&
      status !== 'published'
    )
      return
    void this.loadRows(status)
  },

  onRetry() {
    void this.checkPermission()
  },

  onRowTap(event: WechatMiniprogram.BaseEvent) {
    const submissionId = event.currentTarget.dataset.submissionId
    const revision = Number(event.currentTarget.dataset.revision)
    if (typeof submissionId !== 'string' || !submissionId || !Number.isInteger(revision)) return
    wx.navigateTo({
      url: `/subpkg-submission/pages/officer-review-detail/index?submissionId=${encodeURIComponent(submissionId)}&revision=${revision}&mode=admin`,
    })
  },
})
