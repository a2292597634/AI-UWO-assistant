import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const {
  createSafetyProvider,
} = require('../../cloudfunctions/message-board/core/safety-provider.js')
it('定時安全接口顯式綁定服務端 AppID，不依賴用戶呼叫上下文', async () => {
  let bound = ''
  const cloud = {
    openapi(options: { appid: string }) {
      bound = options.appid
      return {
        security: {
          async msgSecCheck() {
            return { errCode: 0, result: { suggest: 'pass' } }
          },
          async mediaCheckAsync() {
            return { errCode: 0, traceId: 'trace' }
          },
        },
      }
    },
  }
  const provider = createSafetyProvider(cloud, 'server-app')
  expect(await provider.checkText('安全文字', 1, 'private-author')).toEqual({
    errCode: 0,
    suggest: 'pass',
  })
  expect(await provider.checkImage('https://example.invalid/avatar', 'private-author')).toEqual({
    errCode: 0,
    traceId: 'trace',
  })
  expect(bound).toBe('server-app')
})
