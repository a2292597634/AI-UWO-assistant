import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const {
  providerErrorCode,
} = require('../../cloudfunctions/message-board/core/provider-error-code.js')
it('只保留平台數字錯誤碼，不保存原始錯誤或個資', () => {
  expect(providerErrorCode({ errCode: -604101, errMsg: 'private-user' })).toBe(-604101)
  expect(providerErrorCode({ errcode: 87014 })).toBe(87014)
  expect(providerErrorCode({ code: '40003' })).toBe(40003)
  expect(providerErrorCode({ errCode: 'openid-private', message: 'secret' })).toBe(null)
  expect(providerErrorCode(new Error('private-url'))).toBe(null)
})
