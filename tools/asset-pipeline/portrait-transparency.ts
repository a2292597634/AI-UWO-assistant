import sharp from 'sharp'

/** 判斷圖片是否至少包含一個可讓品質背景透出的透明像素。 */
export const hasTransparentPixel = async (input: Buffer): Promise<boolean> => {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] < 255) return true
  }
  return false
}

/** 頭像若為完整不透明矩形，會遮住分享圖與配隊頁的品質背景。 */
export const assertPortraitHasTransparency = async (
  input: Buffer,
  label: string,
): Promise<void> => {
  if (await hasTransparentPixel(input)) return
  throw new Error(`${label} 頭像必須保留透明背景`)
}
