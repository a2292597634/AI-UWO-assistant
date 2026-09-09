import { describe, expect, it, vi } from 'vitest'

/* eslint-disable @typescript-eslint/no-require-imports */
const { uploadPortrait } = require('../../cloudfunctions/officer-maintenance/portrait-upload') as {
  uploadPortrait: (
    cloud: { uploadFile: (options: Record<string, unknown>) => Promise<{ fileID: string }> },
    payload: Record<string, unknown>,
    workOrderId: string,
    revision: number,
  ) => Promise<Record<string, unknown> | null>
}
/* eslint-enable @typescript-eslint/no-require-imports */

const pngFixture = (): Buffer => {
  const buffer = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer)
  buffer.writeUInt32BE(256, 16)
  buffer.writeUInt32BE(256, 20)
  return buffer
}

describe('維護工單頭像上傳', () => {
  it('驗證真實圖片尺寸後上傳，回傳檔案參照與服務端 metadata', async () => {
    const uploadFile = vi.fn(async () => ({ fileID: 'cloud://portrait' }))
    const buffer = pngFixture()
    const result = await uploadPortrait(
      { uploadFile },
      {
        portraitUpload: {
          base64: buffer.toString('base64'),
          meta: { mimeType: 'image/png', byteSize: 1, width: 1, height: 1 },
        },
      },
      'wo_test',
      1,
    )

    expect(result).toMatchObject({
      ok: true,
      fileID: 'cloud://portrait',
      meta: { mimeType: 'image/png', byteSize: 24, width: 256, height: 256 },
    })
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudPath: expect.stringMatching(/^officer-maintenance\/wo_test\/revision-1-/),
        fileContent: buffer,
      }),
    )
  })

  it('拒絕非圖片內容，即使客戶端 metadata 聲稱是 PNG', async () => {
    const uploadFile = vi.fn()
    const result = await uploadPortrait(
      { uploadFile },
      {
        portraitUpload: {
          base64: Buffer.from('not-an-image').toString('base64'),
          meta: { mimeType: 'image/png', byteSize: 12, width: 1, height: 1 },
        },
      },
      'wo_test',
      1,
    )
    expect(result).toMatchObject({ ok: false, code: 'invalid-portrait' })
    expect(uploadFile).not.toHaveBeenCalled()
  })
})
