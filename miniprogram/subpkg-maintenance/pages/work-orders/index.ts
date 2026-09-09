import type { MaintenanceEntityOption } from '../../../presenters/maintenance-option-presenter'
import { getCatalog } from '../../../runtime/main-data-store'
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

const buildOfficerOptions = (): MaintenanceEntityOption[] =>
  getCatalog().map((officer) => ({
    id: officer.id,
    name: officer.name,
    aliases: officer.searchAliases,
    meta: officer.id,
    searchableText: [officer.name, officer.id, ...officer.searchAliases].join(' '),
  }))

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
    officerOptions: [] as MaintenanceEntityOption[],
    selectedOfficerIds: [] as string[],
    selectedOfficerId: '',
  },
  onLoad() {
    wx.setNavigationBarTitle({ title: '我的維護工單' })
    this.setData({ officerOptions: buildOfficerOptions() })
  },
  onShow() {
    void this.loadWorkOrders()
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
  onOfficerSelect(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const id = String(event.detail.id ?? '')
    if (!this.data.officerOptions.some((option) => option.id === id)) return
    this.setData({ selectedOfficerIds: [id], selectedOfficerId: id })
  },
  onOfficerRemove(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const id = String(event.detail.id ?? '')
    if (id !== this.data.selectedOfficerId) return
    this.setData({ selectedOfficerIds: [], selectedOfficerId: '' })
  },
  onModifyOfficer() {
    const id = this.data.selectedOfficerId
    if (!id) return
    wx.navigateTo({
      url: `/subpkg-maintenance/pages/work-order-editor/index?targetOfficerId=${encodeURIComponent(id)}`,
    })
  },
  onRowTap(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id ?? '')
    if (!this.data.rows.some((row) => row.id === id)) return
    wx.navigateTo({
      url: `/subpkg-maintenance/pages/work-order-editor/index?workOrderId=${encodeURIComponent(id)}`,
    })
  },
})
