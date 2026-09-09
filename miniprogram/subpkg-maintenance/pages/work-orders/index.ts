import type { MaintenanceStatus } from '../../../contracts/officer-maintenance'
import {
  getOfficerMaintenanceService,
  OfficerMaintenanceError,
  type MaintenanceWorkOrder,
} from '../../../runtime/officer-maintenance-service'

const labels: Record<MaintenanceStatus, string> = {
  draft: '草稿',
  pendingReview: '待審核',
  approvedPendingPublish: '已核准，待發布',
  published: '已發布',
  rejected: '已駁回',
}
interface WorkOrderRow {
  id: string
  name: string
  operationLabel: string
  statusLabel: string
  rejectionReason: string
  editable: boolean
  updatedAt: string
}

const latestRejectionReason = (record: MaintenanceWorkOrder): string =>
  [...record.history]
    .reverse()
    .find((entry) => entry.action === 'rejected')
    ?.reason?.trim() ?? ''

Page({
  data: {
    rows: [] as WorkOrderRow[],
    loading: false,
    loadError: '',
    isAdmin: false,
    adminReviewVisible: false,
    adminReviewCount: 0,
    checkingAdmin: false,
  },
  onLoad() {
    wx.setNavigationBarTitle({ title: '我的維護工單' })
  },
  onShow() {
    void this.loadWorkOrders()
    void this.checkAdminPermission()
  },
  async checkAdminPermission() {
    if (this.data.checkingAdmin) return
    this.setData({ checkingAdmin: true })
    try {
      const records = await getOfficerMaintenanceService().listAdmin('pendingReview')
      this.setData({
        isAdmin: true,
        adminReviewVisible: true,
        adminReviewCount: records.length,
      })
    } catch {
      // 權限探測失敗時保持一般使用者畫面，不把 forbidden 當成列表錯誤提示。
      this.setData({ isAdmin: false, adminReviewVisible: false, adminReviewCount: 0 })
    } finally {
      this.setData({ checkingAdmin: false })
    }
  },
  async loadWorkOrders() {
    if (this.data.loading) return
    this.setData({ loading: true, loadError: '' })
    try {
      const records = await getOfficerMaintenanceService().listMine()
      const rows = records.map((record: MaintenanceWorkOrder): WorkOrderRow => ({
        id: record.workOrderId,
        name: record.proposedData.name || '未命名航海士',
        operationLabel: record.operation === 'updateOfficer' ? '修改航海士' : '新增航海士',
        statusLabel: labels[record.status] ?? '未知狀態',
        rejectionReason: record.status === 'rejected' ? latestRejectionReason(record) : '',
        editable: record.status === 'draft' || record.status === 'rejected',
        updatedAt: record.updatedAt,
      }))
      this.setData({ rows })
    } catch (error) {
      this.setData({
        loadError:
          error instanceof OfficerMaintenanceError ? error.message : '工單列表載入失敗，請重試',
      })
    } finally {
      this.setData({ loading: false })
    }
  },
  onRetry() {
    void this.loadWorkOrders()
  },
  onNewWorkOrder() {
    wx.navigateTo({ url: '/subpkg-maintenance/pages/work-order-editor/index' })
  },
  onModifyWorkOrder() {
    wx.navigateTo({ url: '/subpkg-maintenance/pages/modify-officer/index' })
  },
  onAdminReview() {
    if (!this.data.adminReviewVisible) return
    wx.navigateTo({ url: '/subpkg-maintenance/pages/work-order-review/index' })
  },
  onRowTap(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id ?? '')
    if (!this.data.rows.some((row) => row.id === id)) return
    wx.navigateTo({
      url: `/subpkg-maintenance/pages/work-order-editor/index?workOrderId=${encodeURIComponent(id)}`,
    })
  },
})
