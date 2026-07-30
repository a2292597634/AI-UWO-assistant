// eslint-disable-next-line @typescript-eslint/no-require-imports
const meta = require('../../generated/dataset-meta') as {
  officerCount: number
  skillCount: number
  contentVersion: string
}

Page({
  data: {
    title: '航海助手',
    moduleName: '航海士名鑑',
    count: 0,
  },

  onLoad() {
    this.setData({ count: meta.officerCount })
  },

  onEnterCatalog() {
    wx.navigateTo({ url: '/pages/catalog/index' })
  },
})
