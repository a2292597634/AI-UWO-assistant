import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdventureFleetShareViewModel } from '../../miniprogram/contracts/fleet-share'
import {
  drawFleetShareImage,
  SHARE_IMAGE_LOAD_TIMEOUT_MS,
} from '../../miniprogram/runtime/fleet-share-renderer'
import { measureAdventureFleetShare } from '../../miniprogram/runtime/fleet-share-layout'

const view: AdventureFleetShareViewModel = {
  mode: 'adventure',
  configName: '素材載入案例',
  groups: [],
  skills: [],
  presetRangeEmpty: true,
  qrPath: '/assets/ui/mini-program-home-code.png',
  entrancePath: 'pages/home/index',
}

const createCanvas = () => {
  const context = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
    drawImage: vi.fn(),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textBaseline: 'middle',
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    // 模擬平台未返回 onload／onerror 的異常素材，生成器仍須在超時後結束。
    createImage: vi.fn(() => ({
      width: 64,
      height: 64,
      src: '',
      onload: () => {},
      onerror: () => {},
    })),
  }
  return canvas as never
}

afterEach(() => {
  vi.useRealTimers()
})

describe('配隊分享圖素材載入', () => {
  it('素材回調遺失時在超時後返回 QR 缺失結果，不讓分享流程永久卡住', async () => {
    vi.useFakeTimers()
    const canvas = createCanvas()
    const layout = measureAdventureFleetShare(view)
    const generation = drawFleetShareImage(canvas, view, layout)
    let settled = false
    void generation.then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(SHARE_IMAGE_LOAD_TIMEOUT_MS + 1)

    expect(settled).toBe(true)
    await expect(generation).resolves.toMatchObject({ fatalAssetMissing: true })
  })
})
