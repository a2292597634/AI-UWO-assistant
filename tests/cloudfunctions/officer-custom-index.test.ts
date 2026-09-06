import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { dispatchMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
}))

const wxServerSdkMock = {
  DYNAMIC_CURRENT_ENV: 'dynamic',
  init: vi.fn(),
  database: vi.fn(() => ({})),
  getWXContext: vi.fn(() => ({ OPENID: 'openid_user' })),
}

const repositoryMock = {
  createRepository: vi.fn(() => ({})),
}

const serviceMock = {
  createOfficerCustomService: vi.fn(() => ({ dispatch: dispatchMock })),
}

/* eslint-disable @typescript-eslint/no-require-imports */
const moduleApi = require('node:module') as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
/* eslint-enable @typescript-eslint/no-require-imports */

const originalModuleLoad = moduleApi._load
moduleApi._load = (request, parent, isMain) => {
  if (request === 'wx-server-sdk') return wxServerSdkMock
  if (request === './officer-custom-repository') return repositoryMock
  if (request === './officer-custom-service') return serviceMock
  return originalModuleLoad(request, parent, isMain)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const indexModule = require('../../cloudfunctions/officer-custom/index') as {
  main: (event: unknown, context: unknown) => Promise<Record<string, unknown>>
}
/* eslint-enable @typescript-eslint/no-require-imports */

afterAll(() => {
  moduleApi._load = originalModuleLoad
})

describe('Officer custom Cloud Function 错误边界', () => {
  beforeEach(() => {
    dispatchMock.mockReset()
  })

  it('内部异常只返回安全错误，不泄露原始消息', async () => {
    dispatchMock.mockRejectedValue(new Error('database password=secret'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await indexModule.main({ action: 'submit' }, { requestId: 'req-123' })

    expect(result).toEqual({
      ok: false,
      code: 'network',
      message: '伺服器暫時無法處理請求，請稍後再試',
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(consoleError).toHaveBeenCalledWith(
      '[officer-custom] submit error requestId=req-123',
      expect.any(Error),
    )
    consoleError.mockRestore()
  })
})
