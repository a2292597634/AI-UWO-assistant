import type { BoardResult } from '../../contracts/message-board'

export function normalizeText(
  value: unknown,
  kind: 'nickname' | 'body' | 'reason',
): BoardResult<string> {
  const invalid = (): BoardResult<string> => ({
    ok: false,
    code: 'text-invalid',
    message: '文字長度或格式不正確。',
  })
  if (
    typeof value !== 'string' ||
    Array.from(value).some((character) => {
      const code = character.codePointAt(0)!
      return (
        (code < 32 && ![9, 10, 13].includes(code)) ||
        (code >= 127 && code <= 159) ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069) ||
        (code >= 0xd800 && code <= 0xdfff)
      )
    })
  )
    return invalid()
  const text = value.replace(/\r\n?/g, '\n').normalize('NFC').trim()
  const limit = { nickname: 32, body: 500, reason: 200 }[kind]
  return text && Array.from(text).length <= limit ? { ok: true, data: text } : invalid()
}
