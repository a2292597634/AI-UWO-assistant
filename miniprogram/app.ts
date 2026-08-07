import { CLOUDBASE_ENV_ID } from './runtime/cloudbase-config'

App({
  globalData: {
    datasetVersion: null as string | null,
  },

  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({ env: CLOUDBASE_ENV_ID })
    }
  },
})
