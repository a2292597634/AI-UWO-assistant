import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AdventureFleetShareViewModel,
  BattleFleetShareViewModel,
} from '../../miniprogram/contracts/fleet-share'
import {
  drawFleetShareImage,
  FLEET_SHARE_BACKGROUND_PATH,
  SHARE_IMAGE_LOAD_TIMEOUT_MS,
} from '../../miniprogram/runtime/fleet-share-renderer'
import {
  measureAdventureFleetShare,
  measureBattleFleetShare,
} from '../../miniprogram/runtime/fleet-share-layout'

const view: AdventureFleetShareViewModel = {
  mode: 'adventure',
  configName: '素材載入案例',
  groups: [],
  skills: [],
  presetRangeEmpty: true,
  qrPath: '/assets/ui/mini-program-home-code.png',
  entrancePath: 'pages/home/index',
}

const createCanvas = (loadImages = false) => {
  const createdImages: Array<{ width: number; height: number; src: string }> = []
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
    drawImage: vi.fn(),
    scale: vi.fn(),
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textBaseline: 'middle',
    textAlign: 'left',
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn((_type: '2d') => context),
    // 模擬平台未返回 onload／onerror 的異常素材，生成器仍須在超時後結束。
    createImage: vi.fn(() => {
      const image = {
        width: 64,
        height: 64,
        src: '',
        onload: () => {},
        onerror: () => {},
      }
      createdImages.push(image)
      if (loadImages) queueMicrotask(() => image.onload())
      return image
    }),
    createdImages,
  }
  return canvas as unknown as WechatMiniprogram.Canvas & {
    getContext: (type: '2d') => typeof context
    createdImages: typeof createdImages
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('配隊分享圖素材載入', () => {
  it('全空戰鬥配隊會繪製「尚未配置航海士」空狀態', async () => {
    const emptyView: BattleFleetShareViewModel = {
      mode: 'battle',
      configName: '全空案例',
      ships: [],
      qrPath: '/qr.png',
      entrancePath: 'pages/home/index',
    }
    const canvas = createCanvas(true)
    const layout = measureBattleFleetShare(emptyView)

    await drawFleetShareImage(canvas, emptyView, layout)

    expect(canvas.getContext('2d').fillText).toHaveBeenCalledWith(
      '尚未配置航海士',
      layout.emptyState!.x + 16,
      layout.emptyState!.y + layout.emptyState!.height / 2,
      layout.emptyState!.width - 32,
    )
  })

  it('有船時不會繪製「尚未配置航海士」空狀態', async () => {
    const nonEmptyView: BattleFleetShareViewModel = {
      mode: 'battle',
      configName: '有船案例',
      ships: [
        {
          shipId: 'ship-1',
          shipLabel: '1號船',
          officerSlots: Array.from({ length: 11 }, (_, index) =>
            index === 0
              ? {
                  id: 'officer-1',
                  name: '航海士一號',
                  portraitPath: '/officer-1.png',
                  rarityName: 'A',
                  visuals: {
                    framePath: '/frame.png',
                    rarityIconPath: '/rarity.png',
                    typeIconPath: '/type.png',
                    genderIconPath: '',
                  },
                  shipId: 'ship-1',
                  slotIndex: 0,
                }
              : null,
          ),
          activeSkills: [],
          passiveSkills: [],
        },
      ],
      qrPath: '/qr.png',
      entrancePath: 'pages/home/index',
    }
    const canvas = createCanvas(true)

    await drawFleetShareImage(canvas, nonEmptyView, measureBattleFleetShare(nonEmptyView))

    expect(canvas.getContext('2d').fillText).not.toHaveBeenCalledWith(
      '尚未配置航海士',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('戰鬥航海士會預載並按 frame、portrait、rarity、type 順序繪製四層', async () => {
    const battleView: BattleFleetShareViewModel = {
      mode: 'battle',
      configName: '四層繪製案例',
      ships: [
        {
          shipId: 'ship-1',
          shipLabel: '1號船',
          officerSlots: [
            {
              id: 'officer-1',
              name: '四層航海士',
              portraitPath: '/portrait.png',
              rarityName: 'S',
              visuals: {
                framePath: '/frame.png',
                rarityIconPath: '/rarity.png',
                typeIconPath: '/type.png',
                genderIconPath: '',
              },
              shipId: 'ship-1',
              slotIndex: 0,
            },
          ],
          activeSkills: [],
          passiveSkills: [],
        },
      ],
      qrPath: '/qr.png',
      entrancePath: 'pages/home/index',
    }
    const canvas = createCanvas(true)
    const context = canvas.getContext('2d')

    await drawFleetShareImage(canvas, battleView, measureBattleFleetShare(battleView))

    const loadedPaths = canvas.createdImages.map((image) => image.src)
    expect(loadedPaths).toContain('/rarity.png')

    const officerDraws = vi
      .mocked(context.drawImage)
      .mock.calls.filter(([image]) =>
        ['/frame.png', '/portrait.png', '/rarity.png', '/type.png'].includes(
          (image as { src: string }).src,
        ),
      )
    expect(officerDraws.map(([image]) => (image as { src: string }).src)).toEqual([
      '/frame.png',
      '/portrait.png',
      '/rarity.png',
      '/type.png',
    ])
    expect(officerDraws.map(([, x, y, width, height]) => [x, y, width, height])).toEqual([
      [333, 134, 84, 84],
      [333, 134, 84, 84],
      [333, 134, 84, 84],
      [337, 192, 22, 22],
    ])
  })

  it('共享海圖底板先於內容繪製，頁首透明且戰鬥文案落在 88 高度內', async () => {
    const battleView: BattleFleetShareViewModel = {
      mode: 'battle',
      configName: '海圖底板案例',
      ships: [],
      qrPath: '/qr.png',
      entrancePath: 'pages/home/index',
    }
    const canvas = createCanvas(true)
    const context = canvas.getContext('2d')
    const layout = measureBattleFleetShare(battleView)

    await drawFleetShareImage(canvas, battleView, layout)

    expect(canvas.createdImages.map((image) => image.src)).toContain(FLEET_SHARE_BACKGROUND_PATH)
    const imageCalls = vi.mocked(context.drawImage).mock.calls
    expect((imageCalls[0]?.[0] as { src: string }).src).toBe(FLEET_SHARE_BACKGROUND_PATH)
    expect(context.fillRect).not.toHaveBeenCalledWith(
      0,
      layout.header.y,
      layout.header.width,
      layout.header.height,
    )
    for (const label of ['遠洋艦隊・航海檔案', '戰鬥配隊記錄', '定航向・統全艦・赴遠洋']) {
      const call = vi.mocked(context.fillText).mock.calls.find(([text]) => text === label)
      expect(call).toBeDefined()
      expect(call![2]).toBeGreaterThanOrEqual(0)
      expect(call![2]).toBeLessThanOrEqual(layout.header.height)
    }
    expect(context.globalAlpha).toBe(1)
    expect(context.save).toHaveBeenCalled()
    expect(context.restore).toHaveBeenCalled()
  })

  it('冒險模式只切換標題、徽記、強調色與標語', async () => {
    const adventureView: AdventureFleetShareViewModel = {
      ...view,
      configName: '冒險海圖案例',
    }
    const canvas = createCanvas(true)
    const context = canvas.getContext('2d')

    await drawFleetShareImage(canvas, adventureView, measureAdventureFleetShare(adventureView))

    expect(context.fillText).toHaveBeenCalledWith(
      '冒險配隊記錄',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    )
    expect(context.fillText).toHaveBeenCalledWith(
      '向未知海域・寫下下一段航跡',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    )
    expect(context.fillText).toHaveBeenCalledWith(
      '一圖收艦・掃碼回到航海日誌',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    )
    expect(context.fillText).toHaveBeenCalledWith(
      '掃描進入小程式首頁',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('冒險技能標題和說明保有安全中心距，且不侵入前後分區', async () => {
    const adventureView: AdventureFleetShareViewModel = {
      mode: 'adventure',
      configName: '技能標題間距案例',
      groups: [
        {
          rarityName: 'A',
          officers: [
            {
              id: 'officer-1',
              name: '航海士一號',
              portraitPath: '/officer-1.png',
              rarityName: 'A',
              visuals: {
                framePath: '/frame.png',
                rarityIconPath: '/rarity.png',
                typeIconPath: '/type.png',
                genderIconPath: '',
              },
              shipId: 'ship-1',
              slotIndex: 0,
            },
          ],
        },
      ],
      skills: [
        {
          skillId: 'skill-1',
          skillName: '冒險技能一號',
          skillIconPath: '/skill-1.png',
          kind: 'passive',
          categoryId: 'skill_category_adventure',
          totalLevel: 2,
        },
      ],
      presetRangeEmpty: false,
      qrPath: '/qr.png',
      entrancePath: 'pages/home/index',
    }
    const canvas = createCanvas(true)
    const context = canvas.getContext('2d')
    const fillText = vi.mocked(context.fillText)
    const layout = measureAdventureFleetShare(adventureView)
    const lastGroup = layout.groupSections[layout.groupSections.length - 1]!
    const firstSkillCard = layout.skillSection.skillCards[0]!

    await drawFleetShareImage(canvas, adventureView, layout)

    const headingCall = fillText.mock.calls.find(([text]) => text === '全艦冒險技能累計')
    const descriptionCall = fillText.mock.calls.find(
      ([text]) => text === '統計上方全部航海士的累計效果 · 只列出已選技能範圍',
    )
    expect(headingCall).toBeDefined()
    expect(descriptionCall).toBeDefined()

    const headingCenterY = headingCall![2] as number
    const descriptionCenterY = descriptionCall![2] as number
    expect(headingCenterY).toBe(layout.skillSection.y - 40)
    expect(descriptionCenterY).toBe(layout.skillSection.y - 12)
    expect(descriptionCenterY - headingCenterY).toBeGreaterThanOrEqual(28)
    expect(headingCenterY - 14).toBeGreaterThanOrEqual(lastGroup.y + lastGroup.height)
    expect(headingCenterY + 14).toBeLessThanOrEqual(descriptionCenterY - 11)
    expect(descriptionCenterY + 11).toBeLessThan(firstSkillCard.y)
  })

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

  it('空素材路徑也會標記降級類型，讓預覽層顯示降級提示', async () => {
    const canvas = createCanvas(true)
    const viewWithMissingAssets: AdventureFleetShareViewModel = {
      ...view,
      groups: [
        {
          rarityName: 'A',
          officers: [
            {
              id: 'missing-portrait',
              name: '缺少頭像',
              portraitPath: '',
              rarityName: 'A',
              visuals: { framePath: '', rarityIconPath: '', typeIconPath: '', genderIconPath: '' },
              shipId: 'ship-1',
              slotIndex: 0,
            },
          ],
        },
      ],
      skills: [
        {
          skillId: 'missing-skill',
          skillName: '缺少技能圖標',
          skillIconPath: '',
          kind: 'passive',
          categoryId: 'skill_category_adventure',
          totalLevel: 0,
        },
      ],
    }

    const report = await drawFleetShareImage(
      canvas,
      viewWithMissingAssets,
      measureAdventureFleetShare(viewWithMissingAssets),
    )

    expect(report.fatalAssetMissing).toBe(false)
    expect(report.degradedAssetCount).toBeGreaterThanOrEqual(2)
    expect(report.failedAssetKinds).toEqual(expect.arrayContaining(['portrait', 'skill']))
  })
})
