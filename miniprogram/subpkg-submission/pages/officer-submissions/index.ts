/** 我的投稿頁：只顯示目前微信帳號由服務端返回的最新投稿。 */

import type { SubmissionStatus } from '../../../contracts/officer-submission'
import {
  getOfficerSubmissionService,
  OfficerSubmissionError,
} from '../../../runtime/officer-editor-service'
import {
  buildSubmissionSummaryView,
  type SubmissionSummaryView,
} from '../../../presenters/officer-submission-presenter'

interface OfficerSubmissionsPageData {
  rows: SubmissionSummaryView[]
  loading: boolean
  loadError: string
  hasRows: boolean
}

const toRows = (summaries: readonly { status: SubmissionStatus }[]): SubmissionSummaryView[] =>
  summaries.map((summary) => buildSubmissionSummaryView(summary as SubmissionSummaryView))

Page({
  data: {
    rows: [],
    loading: false,
    loadError: '',
    hasRows: false,
  } as OfficerSubmissionsPageData,

  onLoad() {
    wx.setNavigationBarTitle({ title: '我的投稿' })
    void this.loadSubmissions()
  },

  onShow() {
    if (this.data.rows.length > 0) void this.loadSubmissions()
  },

  async loadSubmissions() {
    this.setData({ loading: true, loadError: '' })
    try {
      const summaries = await getOfficerSubmissionService().listMine()
      const rows = toRows(summaries)
      this.setData({ rows, hasRows: rows.length > 0, loading: false })
    } catch (error) {
      this.setData({
        loading: false,
        loadError:
          error instanceof OfficerSubmissionError ? error.message : '投稿列表載入失敗，請重試',
      })
    }
  },

  onRetry() {
    void this.loadSubmissions()
  },

  onRowTap(event: WechatMiniprogram.BaseEvent) {
    const submissionId = event.currentTarget.dataset.submissionId
    const revision = Number(event.currentTarget.dataset.revision)
    if (typeof submissionId !== 'string' || !submissionId || !Number.isInteger(revision)) return
    wx.navigateTo({
      url: `/subpkg-submission/pages/officer-review-detail/index?submissionId=${encodeURIComponent(submissionId)}&revision=${revision}&mode=mine`,
    })
  },

  onNewSubmission() {
    wx.navigateTo({ url: '/pages/officer-editor/index' })
  },
})
