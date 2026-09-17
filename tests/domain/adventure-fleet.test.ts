import { describe, expect, it } from 'vitest'
import { createFleetState } from '../../miniprogram/domain/battle-fleet'
import {
  deriveAdventureOfficers,
  getAdventureOptimizationTargets,
  updateAdventureShipTargets,
} from '../../miniprogram/domain/adventure-fleet'
import type { RuntimeCatalogEntry } from '../../miniprogram/contracts/runtime-data'

describe('adventure fleet target semantics', () => {
  it('冒險配隊接受每船 30 個目標但拒絕第 31 個', () => {
    const state = createFleetState()
    const targets = Array.from({ length: 30 }, (_, index) => ({
      id: `adventure-target-${index + 1}`,
      skillId: `skill-adventure-${index + 1}`,
      targetLevel: 0,
    }))

    const accepted = updateAdventureShipTargets(state, 'ship-1', targets)
    expect(accepted.error).toBeUndefined()
    expect(accepted.state.ships[0]!.targets).toHaveLength(30)

    const rejected = updateAdventureShipTargets(accepted.state, 'ship-1', [
      ...targets,
      { id: 'adventure-target-31', skillId: 'skill-adventure-31', targetLevel: 0 },
    ])
    expect(rejected.error).toBe('target-limit')
    expect(rejected.state).toBe(accepted.state)
  })

  it('keeps only configured Lv.1+ adventure targets for optimization', () => {
    expect(
      getAdventureOptimizationTargets([
        { id: 'tracking', skillId: 'skill-track', targetLevel: 0 },
        { id: 'empty', skillId: null, targetLevel: 1 },
        { id: 'goal', skillId: 'skill-goal', targetLevel: 3 },
      ]),
    ).toEqual([{ skillId: 'skill-goal', targetLevel: 3 }])
  })

  it('keeps canonical skill levels separate from unlock thresholds', () => {
    const catalog = [
      {
        id: 'officer-test',
        name: '測試航海士',
        rarityId: 'rarity_5',
        rarityName: 'S',
        rarityClass: 's',
        visualGradeId: 'grade_6',
        typeId: 'type_class_1',
        typeName: '冒險',
        genderId: 'gender_f',
        genderLabel: '女性',
        jobId: 'job_test',
        jobName: '探險家',
        portraitPath: '/officer.png',
        languages: [],
        activeSkills: [],
        passiveSkills: ['skill-adventure'],
        skillLevels: { 'skill-adventure': 2 },
        skillUnlockLevels: { 'skill-adventure': 50 },
        searchAliases: [],
      } satisfies RuntimeCatalogEntry,
    ]

    const officers = deriveAdventureOfficers(catalog, new Set(['skill-adventure']))
    expect(officers[0]!.adventureSkills).toEqual([
      { skillId: 'skill-adventure', level: 2, unlockLevel: 50 },
    ])
  })
})
