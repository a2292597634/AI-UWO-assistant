import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const imageValidation = require('../../cloudfunctions/officer-custom/image-validation') as {
  validateImageBuffer: (
    buffer: Buffer,
    mimeType: string,
  ) => {
    ok: boolean
    code?: string
    message?: string
    width?: number
    height?: number
    extension?: 'png' | 'jpg'
  }
}

const validPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

describe('投稿头像服务端验证', () => {
  it('接受真实 PNG 并读取尺寸', () => {
    expect(imageValidation.validateImageBuffer(validPng, 'image/png')).toMatchObject({
      ok: true,
      width: 1,
      height: 1,
      extension: 'png',
    })
  })

  it('拒绝 MIME 与文件签名不一致的内容', () => {
    expect(imageValidation.validateImageBuffer(validPng, 'image/jpeg')).toMatchObject({
      ok: false,
      code: 'invalid-portrait',
    })
  })

  it('拒绝超过 512 KB 的头像', () => {
    const oversized = Buffer.concat([validPng, Buffer.alloc(512 * 1024)])
    expect(imageValidation.validateImageBuffer(oversized, 'image/png')).toMatchObject({
      ok: false,
      code: 'portrait-too-large',
    })
  })

  it('拒绝最长边超过 512 px 的 PNG', () => {
    const widePng = Buffer.from(validPng)
    widePng.writeUInt32BE(513, 16)
    expect(imageValidation.validateImageBuffer(widePng, 'image/png')).toMatchObject({
      ok: false,
      code: 'portrait-too-large',
    })
  })

  it('接受真实 JPG 并读取尺寸', async () => {
    const jpeg = await sharp({
      create: { width: 2, height: 1, channels: 3, background: { r: 32, g: 64, b: 96 } },
    })
      .jpeg()
      .toBuffer()

    expect(imageValidation.validateImageBuffer(jpeg, 'image/jpeg')).toMatchObject({
      ok: true,
      width: 2,
      height: 1,
      extension: 'jpg',
    })
  })
})
