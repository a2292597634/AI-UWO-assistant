const { inflateSync } = require('node:zlib')
const { createHash } = require('node:crypto')
const { fail } = require('./validation')
function validateAvatar(base64) {
  if (
    typeof base64 !== 'string' ||
    !base64 ||
    base64.length > 87384 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
  )
    throw fail('asset-invalid')
  const bytes = Buffer.from(base64, 'base64')
  if (!bytes.length || bytes.length > 65536 || bytes.toString('base64') !== base64)
    throw fail('asset-invalid')
  let width = 0,
    height = 0,
    extension = ''
  if (
    bytes.length >= 33 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.subarray(12, 16).toString() === 'IHDR'
  ) {
    width = bytes.readUInt32BE(16)
    height = bytes.readUInt32BE(20)
    extension = 'png'
    const chunks = []
    let offset = 8,
      ended = false
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset),
        kind = bytes.subarray(offset + 4, offset + 8).toString()
      if (size > 65536 || offset + 12 + size > bytes.length) throw fail('asset-invalid')
      if (kind === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + size))
      offset += 12 + size
      if (kind === 'IEND') {
        ended = true
        break
      }
    }
    if (!ended || !chunks.length) throw fail('asset-invalid')
    try {
      inflateSync(Buffer.concat(chunks), { maxOutputLength: 1048576 })
    } catch {
      throw fail('asset-invalid')
    }
  } else if (
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[bytes.length - 2] === 255 &&
    bytes[bytes.length - 1] === 217
  ) {
    let offset = 2
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) throw fail('asset-invalid')
      while (offset < bytes.length && bytes[offset] === 255) offset++
      const marker = bytes[offset++]
      if (marker === 217 || marker === 218) break
      const size = bytes.readUInt16BE(offset)
      if (size < 2 || offset + size > bytes.length) throw fail('asset-invalid')
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        if (size < 7) throw fail('asset-invalid')
        height = bytes.readUInt16BE(offset + 3)
        width = bytes.readUInt16BE(offset + 5)
        extension = 'jpg'
        break
      }
      offset += size
    }
  }
  if (!width || !height || Math.max(width, height) > 256) throw fail('asset-invalid')
  // JPEG 完整解碼仍由微信安全檢查鏈路驗證，失敗或未完成絕不公開。
  return {
    bytes,
    width,
    height,
    extension,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}
module.exports = { validateAvatar }
