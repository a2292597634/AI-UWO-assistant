import { CLOUDBASE_ENV_ID } from './cloudbase-config'

/** 舊版型別包未收錄共享建構器；與呼叫模組一起載入以支援獨立編譯。 */
declare global {
  interface WxCloud {
    Cloud: new (options: { resourceAppid: string; resourceEnv: string }) => {
      init(): Promise<void>
      callFunction(input: { name: string; data?: object }): Promise<ICloud.CallFunctionResult>
      uploadFile(input: { cloudPath: string; filePath: string }): Promise<ICloud.UploadFileResult>
    }
  }
}

interface FunctionInput {
  name: string
  data?: object
}
interface UploadInput {
  cloudPath: string
  filePath: string
}
export interface CloudConnection {
  init(): Promise<void>
  callFunction(input: FunctionInput): Promise<ICloud.CallFunctionResult>
  uploadFile(input: UploadInput): Promise<ICloud.UploadFileResult>
}
const RESOURCE_APP_ID = 'wx8f961bcd8b26996a'
const CONSUMER_APP_ID = 'wxd0bc7afdc9cd334a'
const unavailable = () => new Error('雲端連線設定無效')
const functions = new Set([
  'fleet-config',
  'officer-custom',
  'officer-maintenance',
  'coupon-redemption',
  'message-board',
  'major-event-reminder',
])

export const createCloudConnection = (appId: string): CloudConnection => {
  if (appId !== RESOURCE_APP_ID && appId !== CONSUMER_APP_ID) {
    throw unavailable()
  }
  const shared =
    appId === CONSUMER_APP_ID
      ? new wx.cloud.Cloud({ resourceAppid: RESOURCE_APP_ID, resourceEnv: CLOUDBASE_ENV_ID })
      : null
  let ready: Promise<void> | undefined
  const init = (): Promise<void> => {
    // 保留失敗的初始化結果，禁止切換環境或自動重送業務寫入。
    if (!ready) {
      if (shared) ready = Promise.resolve().then(() => shared.init())
      else {
        try {
          // 原生初始化維持同步，避免啟動後第一個請求搶先執行。
          wx.cloud.init({ env: CLOUDBASE_ENV_ID })
          ready = Promise.resolve()
        } catch (error) {
          ready = Promise.reject(error)
        }
      }
    }
    return ready
  }
  return {
    init,
    async callFunction({ name, data }) {
      if (!functions.has(name)) throw unavailable()
      if (shared) {
        await init()
        return shared.callFunction({ name, data })
      }
      if (ready) await ready
      return wx.cloud.callFunction({ name, data })
    },
    async uploadFile({ cloudPath, filePath }) {
      if (!/^officer-error-reports\/\d+-[0-2]\.(png|jpg)$/.test(cloudPath)) {
        throw unavailable()
      }
      if (shared) {
        await init()
        return shared.uploadFile({ cloudPath, filePath })
      }
      if (ready) await ready
      return wx.cloud.uploadFile({ cloudPath, filePath })
    },
  }
}

const connections = new WeakMap<object, CloudConnection>()
const currentConnection = (): CloudConnection => {
  let connection = connections.get(wx)
  if (!connection) {
    // 早期 SDK 沒有帳號查詢接口時維持原生通道。
    // 真實的新 AppID 必須由平台帳號資訊選擇共享通道，不依賴前端輸入。
    const appId =
      typeof wx.getAccountInfoSync === 'function'
        ? wx.getAccountInfoSync().miniProgram.appId
        : RESOURCE_APP_ID
    connection = createCloudConnection(appId)
    connections.set(wx, connection)
  }
  return connection
}

export const initializeCloudConnection = async (): Promise<void> => currentConnection().init()
export const callSharedCloudFunction = (
  input: FunctionInput,
): Promise<ICloud.CallFunctionResult> => {
  // SDK 缺失時同步失敗，讓呼叫端在建立等待計時器前進入既有錯誤流程。
  if (wx.cloud) return currentConnection().callFunction(input)
  throw unavailable()
}
export const uploadSharedCloudFile = (input: UploadInput): Promise<ICloud.UploadFileResult> => {
  if (wx.cloud) return currentConnection().uploadFile(input)
  throw unavailable()
}
