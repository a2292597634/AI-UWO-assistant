import { CLOUDBASE_ENV_ID } from './runtime/cloudbase-config'

App({
  globalData: {},

  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({ env: CLOUDBASE_ENV_ID })
    }
  },
})
