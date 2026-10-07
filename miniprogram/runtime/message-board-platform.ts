export async function createBoardOperationId(serverOffset: number): Promise<string> {
  if (typeof wx.getRandomValues !== 'function') throw new Error('請更新微信後再提交留言。')
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) =>
    wx.getRandomValues({
      length: 16,
      success: (result) => resolve(result.randomValues),
      fail: reject,
    }),
  )
  if (bytes.byteLength !== 16) throw new Error('無法建立安全操作編號，請重試。')
  return (
    String(Math.round(Date.now() + serverOffset)) +
    '_' +
    Array.from(new Uint8Array(bytes))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  )
}
export async function readBoardPrivacy(): Promise<boolean> {
  if (typeof wx.getPrivacySetting !== 'function') throw new Error('請更新微信後再使用留言功能。')
  return new Promise((resolve, reject) =>
    wx.getPrivacySetting({ success: (result) => resolve(!result.needAuthorization), fail: reject }),
  )
}
export function openBoardPrivacy() {
  wx.openPrivacyContract({})
}
export async function prepareBoardAvatar(source: string): Promise<string> {
  if (!source) throw new Error('請重新選擇頭像。')
  const info = await new Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult>(
    (resolve, reject) => wx.getImageInfo({ src: source, success: resolve, fail: reject }),
  )
  const manager = wx.getFileSystemManager()
  const readIfValid = (file: string, width: number, height: number): string | null => {
    const stat = manager.statSync(file)
    const size = 'size' in stat ? stat.size : 0
    if (size > 0 && size <= 65536 && Math.max(width, height) <= 256) {
      const result = manager.readFileSync(file, 'base64')
      if (typeof result === 'string' && result.length <= 87384) return result
    }
    return null
  }
  const original = readIfValid(source, info.width, info.height)
  if (original) return original
  const ratio = Math.min(1, 256 / Math.max(info.width, info.height)),
    width = Math.max(1, Math.floor(info.width * ratio)),
    height = Math.max(1, Math.floor(info.height * ratio))
  for (let round = 0; round < 3; round++) {
    const compressed = await new Promise<WechatMiniprogram.CompressImageSuccessCallbackResult>(
      (resolve, reject) =>
        wx.compressImage({
          src: source,
          quality: 80 - round * 20,
          compressedWidth: width,
          compressedHeight: height,
          success: resolve,
          fail: reject,
        }),
    )
    const decoded = await new Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult>(
      (resolve, reject) =>
        wx.getImageInfo({ src: compressed.tempFilePath, success: resolve, fail: reject }),
    )
    const result = readIfValid(compressed.tempFilePath, decoded.width, decoded.height)
    if (result) return result
  }
  throw new Error('頭像仍超過大小限制，請重選或使用預設頭像。')
}
export function writeBoardPreview(viewerKey: string, base64: string, assetId?: string): string {
  if (!/^[a-f0-9]{64}$/.test(viewerKey) || base64.length > 87384)
    throw new Error('預覽資料不正確。')
  if (assetId !== undefined && !/^[a-f0-9]{32,64}$/.test(assetId))
    throw new Error('預覽素材編號不正確。')
  const file =
    wx.env.USER_DATA_PATH +
    '/message-board-preview-' +
    viewerKey +
    '-' +
    (assetId || 'profile') +
    '.png'
  wx.getFileSystemManager().writeFileSync(file, base64, 'base64')
  return file
}
export function removeBoardPreview(file: string) {
  if (!file.startsWith(wx.env.USER_DATA_PATH + '/message-board-preview-')) return
  try {
    wx.getFileSystemManager().unlinkSync(file)
  } catch {
    /* 預覽可能已清理。 */
  }
}
