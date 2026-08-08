import { describe, expect, it, vi } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const serviceMod = require('../../cloudfunctions/fleet-config/fleet-config-service') as {
  createSafeServerError: () => { ok: false; code: string; message: string }
  getRequestId: (context: unknown) => string
  logServerError: (action: string, requestId: string, error: unknown) => void
}

describe('Fleet Config Cloud Function 錯誤邊界', () => {
  it('從 CloudBase context 取得 request id，沒有時產生 request id', () => {
    expect(serviceMod.getRequestId({ requestId: 'req-from-context' })).toBe('req-from-context')
    expect(serviceMod.getRequestId({})).toMatch(/^req-/)
  })

  it('回傳不包含內部例外細節的安全錯誤 envelope', () => {
    const result = serviceMod.createSafeServerError()
    expect(result).toEqual({
      ok: false,
      code: 'network',
      message: '伺服器暫時無法處理請求，請稍後再試',
    })
  })

  it('記錄 request id 與完整例外物件', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new Error('資料庫連線細節')

    serviceMod.logServerError('loadConfig', 'req-123', error)

    expect(consoleError).toHaveBeenCalledWith(
      '[fleet-config] loadConfig error requestId=req-123',
      error,
    )
    consoleError.mockRestore()
  })
})
