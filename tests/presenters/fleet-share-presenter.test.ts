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
