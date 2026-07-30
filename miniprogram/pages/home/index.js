Page({
  data: {
    title: '航海助手',
    moduleName: '航海士名鑑',
    count: 0,
  },

  onLoad() {
    const catalog = require('../../generated/catalog')
    this.setData({ count: catalog.length })
  },

  onEnterCatalog() {
    wx.navigateTo({ url: '/pages/catalog/index' })
  },
})
