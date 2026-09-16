import { describe, expect, it } from 'vitest'
import type { FleetState } from '../../miniprogram/contracts/battle-fleet'
import type { RuntimeFleetOfficer, RuntimeSkill } from '../../miniprogram/contracts/runtime-data'
import {
  buildAdventureFleetShareViewModel,
  buildBattleFleetShareViewModel,
} from '../../miniprogram/presenters/fleet-share-presenter'
import type { AdventureFleetOfficer } from '../../miniprogram/domain/adventure-fleet'

const skill = (
  id: string,
  name = id,
  categoryId = 'skill_category_naval_active_cannon',
): RuntimeSkill => ({
  id,
  n: name,
  cat: categoryId,
  cn: categoryId,
  ip: `/${id}.png`,
  d: '',
  li: '',
})

const relation = (
  skillId: string,
  kind: 'active' | 'passive',
  level: number,
  categoryId = kind === 'active'
    ? 'skill_category_naval_active_cannon'
    : 'skill_category_naval_passive_boarding',
) => ({ skillId, kind, categoryId, level, unlockLevel: 99 })

const fleetWithOfficers = (shipOfficerIds: string[][]): FleetState => ({
  ships: shipOfficerIds.map((officerIds, index) => ({
    id: `ship-${index + 1}`,
    label: `${index + 1}號船`,
    mode: 'manual',
    officerIds,
    targets: [],
    lockedOfficerIds: [],
    removedOfficerIds: [],
    needsReview: false,
  })),
  bannedOfficerIds: [],
})

const runtimeOfficer = (
  id: string,
  skills: RuntimeFleetOfficer['skills'],
  rarityName = 'A',
): RuntimeFleetOfficer => ({
  id,
  name: id,
  jobName: '航海士',
  rarityName,
  portraitPath: `/${id}.png`,
  visualGradeId: 'grade_4',
  typeId: 'type_class_1',
  genderId: 'gender_f',
  skills,
})

describe('配隊分享圖 Presenter', () => {
  it('分享圖移除完全空船，但保留部分空位和有效船原順序', () => {
    const view = buildBattleFleetShareViewModel(
      fleetWithOfficers([[], ['o1', 'missing-officer'], ['missing-only'], ['o2']]),
      [runtimeOfficer('o1', []), runtimeOfficer('o2', [])],
      {},
      '空船篩選案例',
      '/qr.png',
    )

    expect(view.ships.map((ship) => ship.shipId)).toEqual(['ship-2', 'ship-4'])
    expect(view.ships[0]!.shipLabel).toBe('2號船')
    expect(view.ships[0]!.officerSlots).toHaveLength(11)
    expect(view.ships[0]!.officerSlots.slice(0, 3).map((officer) => officer?.id ?? null)).toEqual([
      'o1',
      null,
      null,
    ])
    expect(view.ships[1]!.shipLabel).toBe('4號船')
    expect(view.ships[1]!.officerSlots.slice(0, 2).map((officer) => officer?.id ?? null)).toEqual([
      'o2',
      null,
    ])
  })

  it('戰鬥每艘船只輸出主動 TOP5，並保留累計至少 Lv2 的戰鬥被動', () => {
    const officers = [
      runtimeOfficer('o1', [
        relation('a1', 'active', 2),
        relation('a2', 'active', 2),
        relation('a3', 'active', 2),
        relation('a4', 'active', 2),
        relation('a5', 'active', 2),
        relation('a6', 'active', 9),
        relation('p1', 'passive', 1),
        relation('p2', 'passive', 1),
        relation('trade', 'passive', 9, 'skill_category_trade'),
      ]),
      runtimeOfficer('o2', [
        relation('a1', 'active', 1),
        relation('p1', 'passive', 1),
        relation('p2', 'passive', 1),
      ]),
    ]
    const skills = Object.fromEntries(
      ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'p1', 'p2', 'trade'].map((id) => [id, skill(id)]),
    ) as Record<string, RuntimeSkill>
    skills.a1 = skill('a1', 'A1')
    skills.a2 = skill('a2', 'A2')
    skills.a3 = skill('a3', 'A3')
    skills.a4 = skill('a4', 'A4')
    skills.a5 = skill('a5', 'A5')
    skills.a6 = skill('a6', 'A6')
    skills.p1 = skill('p1', 'P1', 'skill_category_naval_passive_boarding')
    skills.p2 = skill('p2', 'P2', 'skill_category_naval_passive_boarding')

    const view = buildBattleFleetShareViewModel(
      fleetWithOfficers([['o1', 'o2']]),
      officers,
      skills,
      '測試隊伍',
      '/assets/ui/mini-program-home-code.png',
    )
    const ship = view.ships[0]!

    expect(ship.officerSlots).toHaveLength(11)
    expect(ship.officerSlots.slice(0, 2).map((item) => item?.id)).toEqual(['o1', 'o2'])
    expect(ship.activeSkills).toHaveLength(5)
    expect(ship.activeSkills.map((item) => item.skillId)).toEqual(['a6', 'a1', 'a2', 'a3', 'a4'])
    expect(ship.passiveSkills.map((item) => item.skillId)).toEqual(['p1', 'p2'])
    expect(ship.passiveSkills.every((item) => item.totalLevel >= 2)).toBe(true)
    expect(view.qrPath).toBe('/assets/ui/mini-program-home-code.png')
  })

  it('戰鬥技能只統計分享圖實際展示的前 11 個位置', () => {
    const officers = [
      ...Array.from({ length: 11 }, (_, index) => runtimeOfficer(`o${index}`, [])),
      runtimeOfficer('overflow', [relation('overflow-skill', 'active', 9)]),
    ]
    const view = buildBattleFleetShareViewModel(
      fleetWithOfficers([officers.map((officer) => officer.id)]),
      officers,
      { 'overflow-skill': skill('overflow-skill', '不應出現') },
      '七船案例',
      '/qr.png',
    )

    expect(view.ships[0]!.officerSlots).toHaveLength(11)
    expect(view.ships[0]!.activeSkills).toEqual([])
  })

  it('戰鬥主動只看 kind，被動則以 canonical 技能分類判斷', () => {
    const officers = [
      runtimeOfficer('o1', [
        relation('active-outside', 'active', 4, 'skill_category_trade'),
        relation('passive-relation-battle', 'passive', 4, 'skill_category_naval_passive_defense'),
        relation('passive-canonical-battle', 'passive', 4, 'skill_category_trade'),
      ]),
    ]
    const skills = {
      'active-outside': skill('active-outside', '主動技能', 'skill_category_trade'),
      'passive-relation-battle': skill(
        'passive-relation-battle',
        '非戰鬥技能',
        'skill_category_trade',
      ),
      'passive-canonical-battle': skill(
        'passive-canonical-battle',
        '錯誤關係分類',
        'skill_category_naval_passive_defense',
      ),
    }
    const view = buildBattleFleetShareViewModel(
      fleetWithOfficers([['o1']]),
      officers,
      skills,
      '分類案例',
      '/qr.png',
    )

    expect(view.ships[0]!.activeSkills.map((item) => item.skillId)).toEqual(['active-outside'])
    expect(view.ships[0]!.passiveSkills.map((item) => item.skillId)).toEqual([
      'passive-canonical-battle',
    ])
  })

  it('冒險累計只統計分享圖展示的前 11 個位置', () => {
    const officers: AdventureFleetOfficer[] = Array.from({ length: 12 }, (_, index) => ({
      id: `o${index}`,
      name: `航海士${index}`,
      jobName: '航海士',
      rarityName: 'A',
      portraitPath: `/o${index}.png`,
      visualGradeId: 'grade_4',
      typeId: 'type_class_1',
      typeName: '冒險',
      genderId: 'gender_f',
      zone: 'adventure',
      adventureSkills: [{ skillId: 'target', level: index === 11 ? 9 : 0, unlockLevel: 1 }],
    }))
    const state = fleetWithOfficers([officers.map((item) => item.id)])
    state.ships[0]!.targets = [{ id: 'target-row', skillId: 'target', targetLevel: 1 }]

    const view = buildAdventureFleetShareViewModel(
      state,
      officers,
      { target: skill('target', '目標', 'skill_category_adventure') },
      '冒險隊伍',
      '/qr.png',
    )

    expect(view.groups.flatMap((group) => group.officers)).toHaveLength(11)
    expect(view.skills[0]?.totalLevel).toBe(0)
  })

  it('冒險只累計首艘船預設目標，按 S/A/B/C 分組並顯示 Lv0', () => {
    const officers: AdventureFleetOfficer[] = [
      {
        id: 's',
        name: 'S航海士',
        jobName: '航海士',
        rarityName: 'S',
        portraitPath: '/s.png',
        visualGradeId: 'grade_6',
        typeId: 'type_class_1',
        typeName: '冒險',
        genderId: 'gender_f',
        zone: 'adventure',
        adventureSkills: [
          { skillId: 'skill-a', level: 3, unlockLevel: 99 },
          { skillId: 'outside', level: 9, unlockLevel: 99 },
        ],
      },
      {
        id: 'a',
        name: 'A航海士',
        jobName: '航海士',
        rarityName: 'A',
        portraitPath: '/a.png',
        visualGradeId: 'grade_5',
        typeId: 'type_class_1',
        typeName: '冒險',
        genderId: 'gender_f',
        zone: 'adventure',
        adventureSkills: [{ skillId: 'skill-a', level: 1, unlockLevel: 99 }],
      },
      {
        id: 'b',
        name: 'B航海士',
        jobName: '航海士',
        rarityName: 'B',
        portraitPath: '/b.png',
        visualGradeId: 'grade_4',
        typeId: 'type_class_1',
        typeName: '冒險',
        genderId: 'gender_f',
        zone: 'adventure',
        adventureSkills: [{ skillId: 'skill-b', level: 0, unlockLevel: 99 }],
      },
      {
        id: 'c',
        name: 'C航海士',
        jobName: '航海士',
        rarityName: 'C',
        portraitPath: '/c.png',
        visualGradeId: 'grade_3',
        typeId: 'type_class_1',
        typeName: '冒險',
        genderId: 'gender_f',
        zone: 'adventure',
        adventureSkills: [],
      },
    ]
    const skills = {
      'skill-a': skill('skill-a', '探索'),
      'skill-b': skill('skill-b', '採集', 'skill_category_adventure'),
      outside: skill('outside', '範圍外', 'skill_category_adventure'),
    }
    const state = fleetWithOfficers([
      ['s', 'a'],
      ['b', 'c'],
    ])
    state.ships[0]!.targets = [
      { id: 'target-a', skillId: 'skill-a', targetLevel: 5 },
      { id: 'target-b', skillId: 'skill-b', targetLevel: 0 },
    ]

    const view = buildAdventureFleetShareViewModel(state, officers, skills, '冒險隊伍', '/qr.png')

    expect(view.groups.map((group) => group.rarityName)).toEqual(['S', 'A', 'B', 'C'])
    expect(view.groups.flatMap((group) => group.officers).map((officer) => officer.id)).toEqual([
      's',
      'a',
      'b',
      'c',
    ])
    expect(view.skills.map((item) => [item.skillId, item.totalLevel])).toEqual([
      ['skill-a', 4],
      ['skill-b', 0],
    ])
    expect(view.skills.map((item) => item.skillId)).not.toContain('outside')
    expect(view.presetRangeEmpty).toBe(false)
  })
})
