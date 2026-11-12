import { initializeCloudConnection } from './runtime/shared-cloud-client'

App({
  globalData: {},

  onLaunch() {
    // 失敗保留在連線中，由各服務既有的錯誤狀態呈現；不切換其他環境。
    void initializeCloudConnection().catch(() => {})
  },
})
