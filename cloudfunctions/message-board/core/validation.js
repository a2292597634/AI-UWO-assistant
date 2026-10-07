/** 共用契約向量驗證微信正文與暱稱；原文不寫入日誌。 */
function normalizeText(value, kind) {
  const invalid = () => ({ ok: false, code: 'text-invalid', message: '文字長度或格式不正確。' })
  if (
    typeof value !== 'string' ||
    Array.from(value).some((character) => {
      const code = character.codePointAt(0)
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
const fail = (code) => Object.assign(new Error(code), { code })
function text(value, kind) {
  const result = normalizeText(value, kind)
  if (!result.ok) throw fail(result.code)
  return result.data
}
function exact(input, keys, required = []) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !keys.includes(key)) ||
    required.some((key) => !(key in input))
  )
    throw fail('input-invalid')
}
module.exports = { normalizeText, text, exact, fail }
