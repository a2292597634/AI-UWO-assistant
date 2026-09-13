import { describe, expect, it } from 'vitest'
import {
  deriveAdventureOfficers,
  getAdventureOptimizationTargets,
} from '../../miniprogram/domain/adventure-fleet'
import type { RuntimeCatalogEntry } from '../../miniprogram/contracts/runtime-data'

describe('adventure fleet target semantics', () => {
  it('keeps only configured Lv.1+ adventure targets for optimization', () => {
    expect(
      getAdventureOptimizationTargets([
        { id: 'tracking', skillId: 'skill-track', targetLevel: 0 },
        { id: 'empty', skillId: null, targetLevel: 1 },
        { id: 'goal', skillId: 'skill-goal', targetLevel: 3 },
      ]),
    ).toEqual([{ skillId: 'skill-goal', targetLevel: 3 }])
  })

  it('uses explicit unlock levels instead of canonical skill levels', () => {
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
    expect(officers[0]!.adventureSkills).toEqual([{ skillId: 'skill-adventure', unlockLevel: 50 }])
  })
})
