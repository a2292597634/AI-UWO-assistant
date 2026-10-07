import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBoardOperationId,
  prepareBoardAvatar,
} from '../../miniprogram/runtime/message-board-platform'
afterEach(() => vi.unstubAllGlobals())
describe('原生頭像預算與安全隨機能力', () => {
  it('高瘦圖片依最長邊縮放，第三輪合格輸出也可使用', async () => {
    let compressed = 0
    vi.stubGlobal('wx', {
      getImageInfo: ({
        src,
        success,
      }: {
        src: string
        success: (data: { width: number; height: number }) => void
      }) => success(src === 'original' ? { width: 32, height: 2048 } : { width: 4, height: 256 }),
      getFileSystemManager: () => ({
        statSync: (file: string) => ({ size: file === 'compressed-3' ? 1000 : 70000 }),
        readFileSync: () => 'c3ludGhldGlj',
      }),
      compressImage: (input: {
        compressedWidth: number
        compressedHeight: number
        success: (data: { tempFilePath: string }) => void
      }) => {
        expect(input.compressedWidth).toBe(4)
        expect(input.compressedHeight).toBe(256)
        input.success({ tempFilePath: 'compressed-' + ++compressed })
      },
    })
    await expect(prepareBoardAvatar('original')).resolves.toBe('c3ludGhldGlj')
    expect(compressed).toBe(3)
  })
  it('安全隨機值不完整時停用操作，沒有退回 Math.random', async () => {
    vi.stubGlobal('wx', {
      getRandomValues: ({ success }: { success: (data: { randomValues: ArrayBuffer }) => void }) =>
        success({ randomValues: new ArrayBuffer(8) }),
    })
    await expect(createBoardOperationId(0)).rejects.toThrow('無法建立安全操作編號')
  })
})
