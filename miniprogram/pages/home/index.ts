import { getDatasetMeta } from '../../runtime/main-data-store'

Page({
  data: {
    title: '航海助手',
    count: 0,
    bannerFailed: false,
    modules: [
      {
        id: 'officer-catalog',
        name: '航海士名鑑',
        iconPath: '/assets/ui/feature-officer-catalog.png',
        route: '/pages/catalog/index',
        iconFailed: false,
      },
      {
        id: 'battle-fleet',
        name: '戰鬥模擬艦隊',
        iconPath: '/assets/ui/feature-battle-fleet.png',
        route: '/pages/fleet/index',
        iconFailed: false,
      },
      {
        id: 'adventure-fleet',
        name: '冒險模擬艦隊',
        iconPath: '/assets/ui/feature-adventure-fleet.png',
        route: '/pages/adventure-fleet/index',
        iconFailed: false,
      },
      {
        id: 'data-maintenance',
        name: '資料維護',
        iconPath: '/assets/ui/feature-data-maintenance.png',
        route: '/pages/officer-editor/index',
        iconFailed: false,
      },
    ],
  },

  onLoad() {
    const meta = getDatasetMeta()
    this.setData({ count: meta.officerCount })
  },

  onBannerError() {
    this.setData({ bannerFailed: true })
  },

  onModuleIconError(event: WechatMiniprogram.BaseEvent) {
    const moduleIndex = Number(event.currentTarget.dataset.index)
    if (Number.isNaN(moduleIndex)) return

    this.setData({ [`modules[${moduleIndex}].iconFailed`]: true })
  },

  onModuleTap(event: WechatMiniprogram.BaseEvent) {
    const route = event.currentTarget.dataset.route
    if (typeof route !== 'string' || !route) return

    wx.navigateTo({ url: route })
  },
})
