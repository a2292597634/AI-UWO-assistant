export type ReminderAdPhase = 'create' | 'preload' | 'show' | 'retry-load' | 'retry-show'
export type ReminderAdErrorSource = 'event' | 'promise' | 'throw'
export interface ReminderAdDiagnostic {
  diagnosticVersion: 'ad-v1'
  adUnitId: string
  code: number | null
  phase: ReminderAdPhase
  source: ReminderAdErrorSource
  envVersion: string
  version: string
  wechatVersion: string
  SDKVersion: string
  platform: string
}
const reasons: Record<number, string> = {
  1000: '廣告後端呼叫失敗',
  1001: '廣告參數錯誤',
  1002: '廣告位無效',
  1003: '廣告內部錯誤',
  1004: '暫無合適的廣告',
  1005: '廣告元件審核中',
  1006: '廣告元件審核被駁回',
  1007: '廣告元件被封禁',
  1008: '廣告位已關閉',
}
const phaseLabels: Record<ReminderAdPhase, string> = {
  create: '建立',
  preload: '預載',
  show: '展示',
  'retry-load': '重載',
  'retry-show': '再次展示',
}
const safeVersion = (value: unknown): string =>
  typeof value === 'string' && /^[a-zA-Z0-9._+-]{1,40}$/.test(value) ? value : 'unknown'
const read = <T>(fn: () => T): T | undefined => {
  try {
    return fn()
  } catch {
    return undefined
  }
}
/** 僅抽取白名單欄位；原始 errMsg、身份和完整系統物件不得進入診斷。 */
export const createReminderAdDiagnostic = (
  adUnitId: string,
  phase: ReminderAdPhase,
  source: ReminderAdErrorSource,
  error: unknown,
): ReminderAdDiagnostic => {
  const rawCode = error && typeof error === 'object' && 'errCode' in error ? error.errCode : null
  const code =
    typeof rawCode === 'number'
      ? rawCode
      : typeof rawCode === 'string' && /^-?\d{1,10}$/.test(rawCode)
        ? Number(rawCode)
        : null
  const mini = read(() => wx.getAccountInfoSync().miniProgram)
  const base = read(() => wx.getAppBaseInfo())
  const platform = read(() => wx.getDeviceInfo().platform)
  return {
    diagnosticVersion: 'ad-v1',
    adUnitId: /^adunit-[a-zA-Z0-9-]{1,64}$/.test(adUnitId) ? adUnitId : 'unknown',
    code: code !== null && Number.isSafeInteger(code) && Math.abs(code) <= 2147483647 ? code : null,
    phase,
    source,
    envVersion:
      mini && ['release', 'trial', 'develop'].includes(mini.envVersion)
        ? mini.envVersion
        : 'unknown',
    version: safeVersion(mini?.version),
    wechatVersion: safeVersion(base?.version),
    SDKVersion: safeVersion(base?.SDKVersion),
    platform:
      platform && ['ios', 'android', 'windows', 'mac', 'devtools', 'ohos'].includes(platform)
        ? platform
        : 'unknown',
  }
}
export class ReminderAdError extends Error {
  readonly diagnostics: ReminderAdDiagnostic[]
  constructor(diagnostics: ReminderAdDiagnostic[]) {
    const records = diagnostics.slice(-5)
    const known =
      [...records].reverse().find((record) => record.code !== null) ?? records[records.length - 1]
    const reason =
      known?.code == null ? '廣告失敗原因尚未確認' : (reasons[known.code] ?? '廣告播放失敗')
    super(`${reason}（${known?.code ?? '未知錯誤碼'}）。`)
    this.name = 'ReminderAdError'
    this.diagnostics = records
  }
}
/** 失敗詳情保留在彈窗中，使用者主動確認後才寫入剪貼簿。 */
export const showReminderAdDiagnostic = (error: ReminderAdError): void => {
  const d = error.diagnostics[error.diagnostics.length - 1]
  if (!d) return
  const content = [
    error.message,
    `環境：${d.envVersion}／版本：${d.version}`,
    `微信：${d.wechatVersion}／基礎庫：${d.SDKVersion}`,
    `系統：${d.platform}／診斷版：${d.diagnosticVersion}`,
    `廣告位：${d.adUnitId}`,
    '失敗記錄：',
    ...error.diagnostics.map(
      (record) => `${phaseLabels[record.phase]} ${record.code ?? '未知'}（${record.source}）`,
    ),
    '本次未完成廣告，尚未開通提醒。可複製診斷或截圖回報。',
  ].join('\n')
  wx.showModal({
    title: '提醒廣告診斷',
    content,
    confirmText: '複製診斷',
    cancelText: '關閉',
    success: (result) => {
      if (result.confirm)
        wx.setClipboardData({
          data: content,
          fail: () => wx.showToast({ title: '複製失敗，請截圖保存。', icon: 'none' }),
        })
    },
    fail: () => wx.showToast({ title: error.message, icon: 'none', duration: 3500 }),
  })
}
