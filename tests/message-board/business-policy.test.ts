import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { normalizeText } from '../../miniprogram/domain/message-board/text-policy'
import { canPublish } from '../../miniprogram/domain/message-board/state-policy'
const require = createRequire(import.meta.url)
const server = require('../../cloudfunctions/message-board/core/validation.js')
const operation = require('../../cloudfunctions/message-board/core/operation-policy.js')

describe('留言共用文字與公開規則', () => {
  it.each([
    ['😀'.repeat(500), 'body', true],
    ['😀'.repeat(501), 'body', false],
    ['暱'.repeat(32), 'nickname', true],
    ['暱'.repeat(33), 'nickname', false],
    ['   ', 'body', false],
    ['內容\u202e偽裝', 'body', false],
    ['\ud800', 'body', false],
    ['航海\u200d😀', 'body', true],
  ] as const)('前後端相同規則 %s %s', (text, kind, expected) => {
    expect(normalizeText(text, kind).ok).toBe(expected)
    expect(server.normalizeText(text, kind)).toEqual(normalizeText(text, kind))
  })
  it('統一 NFC 與換行，保留正文內空格', () => {
    expect(normalizeText(' e\u0301\r\n甲  乙 ', 'body')).toEqual({ ok: true, data: 'é\n甲  乙' })
  })
  it('風險、未完成、已撤回、清除中和已撤銷素材一律不能公開', () => {
    const valid = {
      status: 'pending-review' as const,
      safety: ['pass', 'pass', 'pass'] as const,
      manualReviewsComplete: true,
      ownerClearing: false,
      assetRevoked: false,
    }
    expect(canPublish(valid)).toBe(true)
    for (const safety of ['checking', 'risky', 'needs-author', 'retryable-error'] as const)
      expect(canPublish({ ...valid, safety: ['pass', 'pass', safety] })).toBe(false)
    expect(canPublish({ ...valid, status: 'withdrawn' })).toBe(false)
    expect(canPublish({ ...valid, ownerClearing: true })).toBe(false)
    expect(canPublish({ ...valid, assetRevoked: true })).toBe(false)
    expect(
      canPublish({ ...valid, safety: ['pass', 'review', 'pass'], manualReviewsComplete: false }),
    ).toBe(false)
    expect(canPublish({ ...valid, safety: ['pass', 'review', 'pass'] })).toBe(true)
  })
})

describe('服務端操作格式與內容绑定', () => {
  const now = 1791340000000
  it('拒絕過期、未來和不合法操作 ID', () => {
    expect(operation.validateOperationId(`${now}_${'a'.repeat(32)}`, now)).toBe(true)
    expect(operation.validateOperationId(`${now - 86400001}_${'a'.repeat(32)}`, now)).toBe(false)
    expect(operation.validateOperationId(`${now + 120001}_${'a'.repeat(32)}`, now)).toBe(false)
    expect(operation.validateOperationId('forged', now)).toBe(false)
  })
  it('欄位順序不影響雜湊，正文與目標改變會改變雜湊', () => {
    const first = operation.payloadHash({ text: '甲', messageId: '1' })
    expect(operation.payloadHash({ messageId: '1', text: '甲' })).toBe(first)
    expect(operation.payloadHash({ messageId: '2', text: '甲' })).not.toBe(first)
    expect(operation.payloadHash({ messageId: '1', text: '乙' })).not.toBe(first)
  })
})
