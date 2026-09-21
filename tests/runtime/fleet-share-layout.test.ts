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
      officer(`officer-${shipIndex}-${slotIndex}`),
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
    expect(secondRow[0]!.x).toBeGreaterThan(firstRow[0]!.x)
    expect(secondRow[4]!.x).toBeLessThan(firstRow[5]!.x)
    expect(section.officerRow.height).toBe(246)
    expect(section.activeSection.height).toBe(100)
    expect(section.passiveSection.height).toBe(370)
    expect(section.activeRows).toBe(1)
    expect(section.passiveRows).toBe(4)
    expect(section.officerSlots).toHaveLength(11)
    expect(layout.header.height).toBe(88)
    expect(section.y).toBeGreaterThanOrEqual(layout.header.y + layout.header.height)
    expect(layout.footer.height).toBe(160)
    expect(layout.shipSections[1]!.y - (section.y + section.height)).toBe(16)
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

  it('部分配置船只只繪製已配置航海士，末行自動置中', () => {
    const view = {
      ...battleView(),
      ships: [
        {
          ...battleView().ships[0]!,
          officerSlots: Array.from({ length: 11 }, (_, slotIndex) =>
            slotIndex < 5 ? officer(`partial-${slotIndex}`) : null,
          ),
        },
      ],
    }
    const section = measureBattleFleetShare(view).shipSections[0]!

    expect(section.officerSlots).toHaveLength(5)
    expect(section.officerRow.height).toBe(120)
    expect(section.officerSlots.every((slot) => slot.y === section.officerSlots[0]!.y)).toBe(true)
    expect(section.officerSlots[0]!.x).toBeGreaterThan(32)
    expect(section.officerSlots[4]!.x).toBeLessThan(718)
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

  it('冒險三個類型分組使用五欄且與全艦技能區不重疊', () => {
    const view: AdventureFleetShareViewModel = {
      mode: 'adventure',
      configName: '冒險案例',
      qrPath: '/qr.png',
      entrancePath: 'pages/home/index',
      presetRangeEmpty: false,
      groups: [
        {
          zone: 'adventure',
          zoneLabel: '冒險航海士',
          officers: Array.from({ length: 6 }, (_, index) => officer(`adventure-${index + 1}`)),
        },
        {
          zone: 'combat',
          zoneLabel: '戰鬥航海士',
          officers: [officer('combat-1')],
        },
        {
          zone: 'trade',
          zoneLabel: '交易航海士',
          officers: Array.from({ length: 5 }, (_, index) => officer(`trade-${index + 1}`)),
        },
      ],
      skills: Array.from({ length: 11 }, (_, index) => skill(`skill-${index}`, 'passive')),
    }
    const layout = measureAdventureFleetShare(view)
    const lastGroup = layout.groupSections[layout.groupSections.length - 1]!
    const skillHeadingReserve = layout.skillSection.y - (lastGroup.y + lastGroup.height)

    expect(layout.groupSections).toHaveLength(3)
    expect(skillHeadingReserve).toBeGreaterThanOrEqual(56)
    expect(layout.skillSection.y).toBeGreaterThanOrEqual(lastGroup.y + lastGroup.height)
    expect(layout.groupSections[0]!.y).toBeGreaterThanOrEqual(
      layout.header.y + layout.header.height,
    )
    expect(layout.footer.y).toBeGreaterThanOrEqual(
      layout.skillSection.y + layout.skillSection.height,
    )
    expect(layout.skillSection.skillRows).toBe(3)
    expect(layout.contentBottom).toBeLessThanOrEqual(layout.height)
    const adventureSlots = layout.groupSections[0]!.officerSlots
    const firstRow = adventureSlots.slice(0, 5)
    const secondRow = adventureSlots.slice(5)
    expect(adventureSlots).toHaveLength(6)
    expect(firstRow.every((slot) => slot.y === firstRow[0]!.y)).toBe(true)
    expect(secondRow[0]!.y).toBeGreaterThan(firstRow[0]!.y)
    expect(secondRow[0]!.x).toBeGreaterThan(firstRow[0]!.x)
    expect(secondRow[0]!.x).toBeLessThan(firstRow[4]!.x)
    expect(layout.groupSections[1]!.officerSlots).toHaveLength(1)
    expect(layout.groupSections[2]!.officerSlots).toHaveLength(5)
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

  it('技能布局固定使用五欄', () => {
    const layout = measureAdventureFleetShare({
      mode: 'adventure',
      configName: '五欄案例',
      qrPath: '/qr.png',
      entrancePath: 'pages/home/index',
      presetRangeEmpty: false,
      groups: [],
      skills: Array.from({ length: 9 }, (_, index) => skill(`skill-${index}`, 'passive')),
    })

    expect(layout.skillSection.skillRows).toBe(2)
  })

  it('技能不足一整行時，最後一行會在五欄容器中置中', () => {
    const layout = measureAdventureFleetShare({
      mode: 'adventure',
      configName: '技能末行置中案例',
      qrPath: '/qr.png',
      entrancePath: 'pages/home/index',
      presetRangeEmpty: false,
      groups: [],
      skills: Array.from({ length: 6 }, (_, index) => skill(`skill-${index}`, 'passive')),
    })
    const firstRow = layout.skillSection.skillCards.slice(0, 5)
    const lastRow = layout.skillSection.skillCards.slice(5)

    expect(lastRow[0]!.x).toBeGreaterThan(firstRow[0]!.x)
    expect(lastRow[0]!.x).toBeLessThan(firstRow[4]!.x)
  })

  it('航海士框沿用 voyage.tw 滿格分層與左下類型角標', () => {
    const visuals = getOfficerVisualRects({ x: 32, y: 120, width: 132, height: 128 })

    expect(visuals.frame.width).toBe(84)
    expect(visuals.frame.height).toBe(84)
    expect(visuals.portrait).toEqual(visuals.frame)
    expect(visuals.rarity).toEqual(visuals.frame)
    expect(visuals.type.width).toBe(22)
    expect(visuals.type.height).toBe(22)
    expect(visuals.type.x).toBe(visuals.frame.x + 4)
    expect(visuals.type.y + visuals.type.height).toBe(visuals.frame.y + visuals.frame.height - 4)
  })

  it('技能卡保留完整下排給兩行技能名稱，圖標與等級膠囊置於上排', () => {
    const card = getSkillCardLayout({ x: 32, y: 200, width: 160, height: 84 })

    expect(card.icon.width).toBe(36)
    expect(card.icon.height).toBe(36)
    expect(card.level.width).toBe(68)
    expect(card.level.height).toBe(28)
    expect(card.icon.y + card.icon.height).toBeLessThanOrEqual(card.name.y)
    expect(card.level.y + card.level.height).toBeLessThanOrEqual(card.name.y)
    expect(card.name.x).toBeGreaterThanOrEqual(card.rect.x)
    expect(card.name.width).toBeGreaterThanOrEqual(card.rect.width - 16)
    expect(card.name.x + card.name.width).toBeLessThanOrEqual(card.rect.x + card.rect.width)
    expect(card.level.x + card.level.width).toBeLessThanOrEqual(card.rect.x + card.rect.width)
    expect(card.name.height).toBeGreaterThanOrEqual(30)
  })
})
