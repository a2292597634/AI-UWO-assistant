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
        iconPath: '',
        iconFallback: '戰',
        route: '/pages/fleet/index',
        iconFailed: true,
      },
      {
        id: 'adventure-fleet',
        name: '冒險模擬艦隊',
        iconPath: '',
        iconFallback: '探',
        route: '/pages/adventure-fleet/index',
        iconFailed: true,
      },
      {
        id: 'add-officer',
        name: '新增航海士',
        iconPath: '',
        iconFallback: '新',
        route: '/pages/officer-editor/index',
        iconFailed: true,
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
