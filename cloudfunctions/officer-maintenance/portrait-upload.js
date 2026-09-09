const { validateImageBuffer } = require('./image-validation')

const generateUploadToken = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const getPortraitUpload = (payload) => {
  if (payload?.portraitUpload && typeof payload.portraitUpload === 'object') {
    return payload.portraitUpload
  }
  // 相容尚未更新的呼叫端，但正式 runtime 只會送 portraitUpload 物件。
  if (typeof payload?.portraitBase64 === 'string' && payload.portraitBase64) {
    return {
      base64: payload.portraitBase64,
      meta: { mimeType: payload.portraitMimeType },
    }
  }
  return null
}

const uploadPortrait = async (cloud, payload, workOrderId, revision) => {
  const portraitUpload = getPortraitUpload(payload)
  if (!portraitUpload || typeof portraitUpload.base64 !== 'string' || !portraitUpload.base64) {
    return null
  }
  let buffer
  try {
    buffer = Buffer.from(portraitUpload.base64, 'base64')
  } catch {
    return { ok: false, code: 'invalid-portrait', message: '頭像檔案無效' }
  }
  const validation = validateImageBuffer(buffer, portraitUpload.meta?.mimeType)
  if (!validation.ok) return validation
  try {
    const result = await cloud.uploadFile({
      cloudPath: `officer-maintenance/${workOrderId}/revision-${revision}-${generateUploadToken()}.${validation.extension}`,
      fileContent: buffer,
    })
    return result?.fileID
      ? {
          ok: true,
          fileID: result.fileID,
          meta: {
            mimeType: validation.extension === 'png' ? 'image/png' : 'image/jpeg',
            byteSize: buffer.length,
            width: validation.width,
            height: validation.height,
          },
        }
      : { ok: false, code: 'upload-failed', message: '頭像上傳失敗，請重試' }
  } catch (error) {
    console.error('[officer-maintenance] portrait upload error:', error)
    return { ok: false, code: 'upload-failed', message: '頭像上傳失敗，請重試' }
  }
}

module.exports = { uploadPortrait }
