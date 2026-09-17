import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AdventureFleetShareViewModel,
  BattleFleetShareViewModel,
} from '../../miniprogram/contracts/fleet-share'
import {
  drawFleetShareImage,
  FLEET_SHARE_BACKGROUND_PATH,
  FLEET_SHARE_MOTIFS_PATH,
  resolveFleetShareQrRect,
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
  const alphaHistory: number[] = []
  const fillStyleHistory: string[] = []
  const strokeStyleHistory: string[] = []
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
  let globalAlpha = 1
  let fillStyle = ''
  let strokeStyle = ''
  Object.defineProperty(context, 'globalAlpha', {
    configurable: true,
    enumerable: true,
    get: () => globalAlpha,
    set: (value: number) => {
      alphaHistory.push(value)
      globalAlpha = value
    },
  })
  Object.defineProperty(context, 'fillStyle', {
    configurable: true,
    enumerable: true,
    get: () => fillStyle,
    set: (value: string) => {
      fillStyleHistory.push(value)
      fillStyle = value
    },
  })
  Object.defineProperty(context, 'strokeStyle', {
    configurable: true,
    enumerable: true,
    get: () => strokeStyle,
    set: (value: string) => {
      strokeStyleHistory.push(value)
      strokeStyle = value
    },
  })
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
    alphaHistory,
    fillStyleHistory,
    strokeStyleHistory,
  }
  return canvas as unknown as WechatMiniprogram.Canvas & {
    getContext: (type: '2d') => typeof context
    createdImages: typeof createdImages
    alphaHistory: typeof alphaHistory
    fillStyleHistory: typeof fillStyleHistory
    strokeStyleHistory: typeof strokeStyleHistory
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

  it('海圖頂底保留細節，中段使用低對比紋理', async () => {
    const skill = (
      id: string,
    ): BattleFleetShareViewModel['ships'][number]['activeSkills'][number] => ({
      skillId: id,
      skillName: `測試技能${id}`,
      skillIconPath: `/skill-${id}.png`,
      kind: 'active',
      categoryId: 'skill_category_naval_active_cannon',
      totalLevel: 1,
    })
    const emptyView: BattleFleetShareViewModel = {
      mode: 'battle',
      configName: '海圖對比案例',
      ships: Array.from({ length: 3 }, (_, index) => ({
        shipId: `ship-${index + 1}`,
        shipLabel: `${index + 1}號船`,
        officerSlots: Array.from({ length: 11 }, () => null),
        activeSkills: Array.from({ length: 10 }, (_, skillIndex) =>
          skill(`ship-${index + 1}-${skillIndex + 1}`),
        ),
        passiveSkills: [],
      })),
      qrPath: '/qr.png',
      entrancePath: 'pages/home/index',
    }
    const canvas = createCanvas(true)
    const context = canvas.getContext('2d')

    await drawFleetShareImage(canvas, emptyView, measureBattleFleetShare(emptyView))

    expect(canvas.alphaHistory).toContain(0.42)
    expect(canvas.alphaHistory).toContain(0.14)
    expect(canvas.fillStyleHistory).toContain('rgba(245, 239, 224, 0.9)')
    const backgroundDraws = vi
      .mocked(context.drawImage)
      .mock.calls.filter(
        ([image]) => (image as { src: string }).src === FLEET_SHARE_BACKGROUND_PATH,
      )
    expect(backgroundDraws.length).toBeGreaterThan(2)
    expect(backgroundDraws[1]?.[2]).toBeGreaterThan(0)
  })

  it('正常渲染會直接取用已確認的原始航海裝飾板，而不是只畫 Canvas 線稿', async () => {
    const battleView: BattleFleetShareViewModel = {
      mode: 'battle',
      configName: '原始裝飾板案例',
      ships: [],
      qrPath: '/qr.png',
      entrancePath: 'pages/home/index',
    }
    const canvas = createCanvas(true)
    const context = canvas.getContext('2d')

    await drawFleetShareImage(canvas, battleView, measureBattleFleetShare(battleView))

    expect(canvas.createdImages.map((image) => image.src)).toContain(FLEET_SHARE_MOTIFS_PATH)
    const motifDraws = vi
      .mocked(context.drawImage)
      .mock.calls.filter(([image]) => (image as { src: string }).src === FLEET_SHARE_MOTIFS_PATH)
    expect(motifDraws.length).toBeGreaterThanOrEqual(4)
    expect(motifDraws.some((call) => call.length === 9)).toBe(true)
    expect(motifDraws.some((call) => call[1] === 0 && call[2] === 0)).toBe(true)
    expect(motifDraws.some((call) => call[1] === 512 && call[2] === 0)).toBe(true)
  })

  it('冒險模式只切換標題、徽記、強調色與標語', async () => {
    const adventureView: AdventureFleetShareViewModel = {
      ...view,
      configName: '冒險海圖案例',
    }
    const canvas = createCanvas(true)
    const context = canvas.getContext('2d')
    const layout = measureAdventureFleetShare(adventureView)

    await drawFleetShareImage(canvas, adventureView, layout)

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
    expect(canvas.strokeStyleHistory[canvas.strokeStyleHistory.length - 1]).toBe('#B99552')
    expect(context.fillRect).not.toHaveBeenCalledWith(
      layout.footer.x,
      layout.footer.y,
      layout.footer.width,
      layout.footer.height,
    )
  })

  it('二维码會映射到原始海圖右下預留框，而不是沿用過大的通用頁尾框', () => {
    const layout = measureAdventureFleetShare(view)
    const qrRect = resolveFleetShareQrRect(layout, { width: 750, height: 1125 })

    expect(qrRect.x).toBe(596)
    expect(qrRect.width).toBe(100)
    expect(qrRect.height).toBe(100)
    expect(qrRect.x + qrRect.width).toBeLessThan(layout.width)
    expect(qrRect.y + qrRect.height).toBeLessThanOrEqual(layout.height)
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
