import type { MaintenanceEntityOption } from '../../../presenters/maintenance-option-presenter'
import { getCatalog } from '../../../runtime/main-data-store'

const buildOfficerOptions = (): MaintenanceEntityOption[] =>
  getCatalog().map((officer) => ({
    id: officer.id,
    name: officer.name,
    aliases: officer.searchAliases,
    meta: '',
    searchableText: [officer.name, officer.id, ...officer.searchAliases].join(' '),
  }))

Page({
  data: {
    officerOptions: [] as MaintenanceEntityOption[],
    selectedOfficerIds: [] as string[],
    selectedOfficerId: '',
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '修改既有航海士' })
    this.setData({ officerOptions: buildOfficerOptions() })
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

  onStartModify() {
    const targetOfficerId = this.data.selectedOfficerId
    if (!targetOfficerId) return
    wx.navigateTo({
      url: `/subpkg-maintenance/pages/work-order-editor/index?targetOfficerId=${encodeURIComponent(targetOfficerId)}`,
    })
  },
})
