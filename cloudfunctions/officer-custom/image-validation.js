/** 投稿头像的服务端文件验证。 */

const MAX_PORTRAIT_BYTES = 512 * 1024
const MAX_PORTRAIT_EDGE = 512
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

const invalid = (code, message) => ({ ok: false, code, message })

const tooLarge = (message) => invalid('portrait-too-large', message)

const validateDimensions = (width, height) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return invalid('invalid-portrait', '無法讀取頭像尺寸')
  }
  if (Math.max(width, height) > MAX_PORTRAIT_EDGE) {
    return tooLarge('頭像最長邊不可超過 512 px')
  }
  return null
}

const readPngDimensions = (buffer) => {
  if (buffer.length < 24 || !PNG_SIGNATURE.equals(buffer.subarray(0, PNG_SIGNATURE.length))) {
    return null
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

const readJpegDimensions = (buffer) => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null

  let offset = 2
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1
    const marker = buffer[offset++]
    if (marker === undefined) return null
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 1 >= buffer.length) return null
    const segmentLength = buffer.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) return null
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      }
    }
    offset += segmentLength
  }
  return null
}

/** 验证图片真实签名、尺寸和大小，不信任客户端 metadata。 */
const validateImageBuffer = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return invalid('invalid-portrait', '頭像檔案無效')
  }
  if (buffer.length > MAX_PORTRAIT_BYTES) {
    return tooLarge('頭像檔案不可超過 512 KB')
  }

  const normalizedMime = typeof mimeType === 'string' ? mimeType.toLowerCase().trim() : ''
  if (normalizedMime === 'image/png') {
    const dimensions = readPngDimensions(buffer)
    if (!dimensions) return invalid('invalid-portrait', '頭像不是有效的 PNG 檔案')
    const dimensionError = validateDimensions(dimensions.width, dimensions.height)
    if (dimensionError) return dimensionError
    return { ok: true, width: dimensions.width, height: dimensions.height, extension: 'png' }
  }

  if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') {
    const dimensions = readJpegDimensions(buffer)
    if (!dimensions) return invalid('invalid-portrait', '頭像不是有效的 JPG 檔案')
    const dimensionError = validateDimensions(dimensions.width, dimensions.height)
    if (dimensionError) return dimensionError
    return { ok: true, width: dimensions.width, height: dimensions.height, extension: 'jpg' }
  }

  return invalid('invalid-portrait', '頭像格式只支援 PNG、JPG 或 JPEG')
}

module.exports = {
  MAX_PORTRAIT_BYTES,
  MAX_PORTRAIT_EDGE,
  validateImageBuffer,
}
