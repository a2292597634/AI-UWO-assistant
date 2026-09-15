import { describe, expect, it } from 'vitest'
import type {
  AdventureFleetShareViewModel,
  BattleFleetShareViewModel,
  FleetShareOfficerView,
  FleetShareSkillView,
} from '../../miniprogram/contracts/fleet-share'
import {
  measureAdventureFleetShare,
  measureBattleFleetShare,
} from '../../miniprogram/runtime/fleet-share-layout'
import {
  getOfficerVisualRects,
  getSkillCardLayout,
  getShareCanvasDimensions,
} from '../../miniprogram/runtime/fleet-share-renderer'

const officer = (id: string): FleetShareOfficerView => ({
  id,
  name: id,
  portraitPath: `/${id}.png`,
  rarityName: 'A',
  visuals: { framePath: '', rarityIconPath: '', typeIconPath: '', genderIconPath: '' },
  shipId: 'ship-1',
  slotIndex: 0,
})

const skill = (id: string, kind: 'active' | 'passive'): FleetShareSkillView => ({
  skillId: id,
  skillName: id,
  skillIconPath: `/${id}.png`,
  kind,
  categoryId: 'skill_category_naval_passive',
  totalLevel: 2,
})

const expectRectsWithinHeight = (rects: { y: number; height: number }[], height: number) => {
  rects.forEach((rect) => {
    expect(rect.y + rect.height).toBeLessThanOrEqual(height)
  })
}

const battleView = (): BattleFleetShareViewModel => ({
  mode: 'battle',
  configName: '七船案例',
  qrPath: '/qr.png',
  entrancePath: 'pages/home/index',
  ships: Array.from({ length: 7 }, (_, shipIndex) => ({
    shipId: `ship-${shipIndex + 1}`,
    shipLabel: `${shipIndex + 1}號船`,
    officerSlots: Array.from({ length: 11 }, (_, slotIndex) =>
      slotIndex === 0 ? officer(`officer-${shipIndex}`) : null,
    ),
    activeSkills: Array.from({ length: 5 }, (_, index) => skill(`active-${index}`, 'active')),
    passiveSkills: Array.from({ length: 16 }, (_, index) => skill(`passive-${index}`, 'passive')),
  })),
})

describe('配隊分享圖布局測量', () => {
  it('戰鬥使用 6＋5 航海士布局，七艘船和四行被動技能都納入 QR 頁尾高度', () => {
    const layout = measureBattleFleetShare(battleView())
    const section = layout.shipSections[0]!
    const lastSection = layout.shipSections[layout.shipSections.length - 1]!
    const firstRow = section.officerSlots.slice(0, 6)
    const secondRow = section.officerSlots.slice(6)

    expect(layout.width).toBe(750)
    expect(layout.shipSections).toHaveLength(7)
    expect(firstRow.every((slot) => slot.y === firstRow[0]!.y)).toBe(true)
    expect(secondRow.every((slot) => slot.y === secondRow[0]!.y)).toBe(true)
    expect(secondRow[0]!.y).toBeGreaterThan(firstRow[0]!.y)
    expect(secondRow[0]!.x).toBe(firstRow[0]!.x)
    expect(section.officerRow.height).toBeGreaterThan(112)
    expect(section.activeRows).toBe(2)
    expect(section.passiveRows).toBe(4)
    expect(section.officerSlots).toHaveLength(11)
    expect(layout.footer.height).toBeGreaterThanOrEqual(180)
    expect(layout.footer.y).toBeGreaterThan(lastSection.y + lastSection.height)
    expect(layout.contentBottom).toBeLessThanOrEqual(layout.height)
    expect(layout.qr.x + layout.qr.width).toBeLessThanOrEqual(layout.width - layout.padding)
    expect(layout.footer.y + layout.footer.height).toBeLessThanOrEqual(layout.height)
    expect(layout.qr.y + layout.qr.height).toBeLessThanOrEqual(layout.height)
    expectRectsWithinHeight(
      layout.shipSections.flatMap((ship) => [
        ...ship.officerSlots,
        ...ship.activeCards,
        ...ship.passiveCards,
      ]),
      layout.height,
    )
  })

  it('長圖輸出會按內容高度降低倍率，避免 Canvas bitmap 超過平台安全邊長', () => {
    const layout = measureBattleFleetShare(battleView())
    const dimensions = getShareCanvasDimensions(layout)

    expect(dimensions.width).toBeLessThanOrEqual(4096)
    expect(dimensions.height).toBeLessThanOrEqual(4096)
    expect(dimensions.scale).toBeGreaterThan(0)
    expect(dimensions.scale).toBeLessThanOrEqual(2)
    expect(dimensions.height).toBe(Math.round(layout.height * dimensions.scale))
  })

  it('全空戰鬥艦隊保留空狀態空間，頁尾位於其後', () => {
    const view = { ...battleView(), ships: [] }
    const layout = measureBattleFleetShare(view)

    expect(layout.emptyState).not.toBeNull()
    expect(layout.footer.y).toBeGreaterThan(layout.emptyState!.y + layout.emptyState!.height)
    expect(layout.shipSections).toHaveLength(0)
  })

  it('冒險四個品質分組與全艦技能區不重疊', () => {
    const view: AdventureFleetShareViewModel = {
      mode: 'adventure',
      configName: '冒險案例',
      qrPath: '/qr.png',
      entrancePath: 'pages/home/index',
      presetRangeEmpty: false,
      groups: ['S', 'A', 'B', 'C'].map((rarityName) => ({
        rarityName: rarityName as 'S' | 'A' | 'B' | 'C',
        officers: Array.from({ length: 5 }, (_, index) => officer(`${rarityName}-${index + 1}`)),
      })),
      skills: Array.from({ length: 11 }, (_, index) => skill(`skill-${index}`, 'passive')),
    }
    const layout = measureAdventureFleetShare(view)
    const lastGroup = layout.groupSections[layout.groupSections.length - 1]!

    expect(layout.groupSections).toHaveLength(4)
    expect(layout.skillSection.y).toBeGreaterThanOrEqual(lastGroup.y + lastGroup.height)
    expect(layout.footer.y).toBeGreaterThanOrEqual(
      layout.skillSection.y + layout.skillSection.height,
    )
    expect(layout.skillSection.skillRows).toBe(3)
    expect(layout.contentBottom).toBeLessThanOrEqual(layout.height)
    layout.groupSections.forEach((group) => {
      const firstRow = group.officerSlots.slice(0, 4)
      const secondRow = group.officerSlots.slice(4)

      expect(group.officerSlots).toHaveLength(5)
      expect(firstRow.every((slot) => slot.y === firstRow[0]!.y)).toBe(true)
      expect(secondRow[0]!.y).toBeGreaterThan(firstRow[0]!.y)
      expect(secondRow[0]!.x).toBe(firstRow[0]!.x)
    })
    expect(layout.footer.y).toBeGreaterThan(layout.skillSection.y + layout.skillSection.height)
    expect(layout.footer.y + layout.footer.height).toBeLessThanOrEqual(layout.height)
    expect(layout.qr.y + layout.qr.height).toBeLessThanOrEqual(layout.height)
    expectRectsWithinHeight(
      [
        ...layout.groupSections.flatMap((group) => group.officerSlots),
        ...layout.skillSection.skillCards,
      ],
      layout.height,
    )
  })

  it('技能布局固定使用四欄', () => {
    const layout = measureAdventureFleetShare({
      mode: 'adventure',
      configName: '四欄案例',
      qrPath: '/qr.png',
      entrancePath: 'pages/home/index',
      presetRangeEmpty: false,
      groups: [],
      skills: Array.from({ length: 9 }, (_, index) => skill(`skill-${index}`, 'passive')),
    })

    expect(layout.skillSection.skillRows).toBe(3)
  })

  it('航海士品質徽章與類型圖標錨定在實際頭像框內', () => {
    const visuals = getOfficerVisualRects({ x: 32, y: 120, width: 132, height: 112 })

    expect(visuals.frame.x).toBeLessThanOrEqual(visuals.portrait.x)
    expect(visuals.frame.y).toBeLessThanOrEqual(visuals.portrait.y)
    expect(visuals.rarity.x).toBeGreaterThanOrEqual(visuals.portrait.x)
    expect(visuals.rarity.y).toBeGreaterThanOrEqual(visuals.portrait.y)
    expect(visuals.rarity.x + visuals.rarity.width).toBeLessThanOrEqual(
      visuals.portrait.x + visuals.portrait.width,
    )
    expect(visuals.rarity.width).toBeGreaterThanOrEqual(visuals.portrait.width * 0.5)
    expect(visuals.type.x).toBeGreaterThanOrEqual(visuals.portrait.x)
    expect(visuals.type.y + visuals.type.height).toBeLessThanOrEqual(
      visuals.portrait.y + visuals.portrait.height,
    )
  })

  it('技能名稱與累計等級膠囊在卡片內分行且不重疊', () => {
    const card = getSkillCardLayout({ x: 32, y: 200, width: 132, height: 52 })

    expect(card.icon.y + card.icon.height).toBeLessThanOrEqual(card.name.y)
    expect(card.level.y + card.level.height).toBeLessThanOrEqual(card.name.y)
    expect(card.name.x).toBeGreaterThanOrEqual(card.rect.x)
    expect(card.name.width).toBeGreaterThanOrEqual(card.rect.width - 16)
    expect(card.name.x + card.name.width).toBeLessThanOrEqual(card.rect.x + card.rect.width)
    expect(card.level.x + card.level.width).toBeLessThanOrEqual(card.rect.x + card.rect.width)
    expect(card.level.width).toBeGreaterThanOrEqual(60)
  })
})
