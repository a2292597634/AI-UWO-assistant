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
  it('戰鬥固定五欄，七艘船和四行被動技能都納入 QR 頁尾高度', () => {
    const layout = measureBattleFleetShare(battleView())

    expect(layout.width).toBe(750)
    expect(layout.shipSections).toHaveLength(7)
    expect(layout.shipSections[0]!.activeRows).toBe(1)
    expect(layout.shipSections[0]!.passiveRows).toBe(4)
    expect(layout.shipSections[0]!.officerSlots).toHaveLength(11)
    expect(layout.footer.height).toBeGreaterThanOrEqual(180)
    expect(layout.contentBottom).toBeLessThanOrEqual(layout.height)
    expect(layout.qr.x + layout.qr.width).toBeLessThanOrEqual(layout.width - layout.padding)
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
        officers: [officer(`${rarityName}-1`), officer(`${rarityName}-2`)],
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
  })
})
