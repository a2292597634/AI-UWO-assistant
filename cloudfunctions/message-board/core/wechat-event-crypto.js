const { createHash, createDecipheriv, timingSafeEqual } = require('node:crypto')
const { fail } = require('./validation')
const signature = (token, parts) =>
  createHash('sha1')
    .update([token, ...parts].sort().join(''))
    .digest('hex')
function checkSignature(expected, actual) {
  return (
    typeof actual === 'string' &&
    /^[a-f0-9]{40}$/.test(actual) &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
}
function decodeEvent(encrypted, keyText, appId) {
  if (
    typeof encrypted !== 'string' ||
    encrypted.length > 98304 ||
    typeof keyText !== 'string' ||
    !/^[A-Za-z0-9+/]{43}$/.test(keyText)
  )
    throw fail('invalid-encryption')
  const key = Buffer.from(keyText + '=', 'base64'),
    bytes = Buffer.from(encrypted, 'base64')
  if (!bytes.length || bytes.length % 16 || bytes.toString('base64') !== encrypted)
    throw fail('invalid-encryption')
  let plain
  try {
    const cipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16))
    cipher.setAutoPadding(false)
    plain = Buffer.concat([cipher.update(bytes), cipher.final()])
  } catch {
    throw fail('invalid-encryption')
  }
  const padding = plain[plain.length - 1]
  if (
    !padding ||
    padding > 32 ||
    padding > plain.length ||
    !plain.subarray(plain.length - padding).equals(Buffer.alloc(padding, padding))
  )
    throw fail('invalid-encryption')
  plain = plain.subarray(0, plain.length - padding)
  if (plain.length < 20) throw fail('invalid-encryption')
  const length = plain.readUInt32BE(16)
  if (length > plain.length - 20 || plain.subarray(20 + length).toString('utf8') !== appId)
    throw fail('invalid-encryption')
  let payload
  try {
    payload = JSON.parse(plain.subarray(20, 20 + length).toString('utf8'))
  } catch {
    throw fail('invalid-event')
  }
  if (
    !payload ||
    payload.appid !== appId ||
    payload.MsgType !== 'event' ||
    payload.Event !== 'wxa_media_check' ||
    payload.version !== 2 ||
    typeof payload.trace_id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,160}$/.test(payload.trace_id) ||
    !Number.isInteger(payload.errcode) ||
    (payload.errcode === 0 && !['pass', 'review', 'risky'].includes(payload.result?.suggest))
  )
    throw fail('invalid-event')
  return {
    traceId: payload.trace_id,
    errCode: payload.errcode,
    suggest: payload.errcode === 0 ? payload.result.suggest : null,
  }
}
module.exports = { signature, checkSignature, decodeEvent }
