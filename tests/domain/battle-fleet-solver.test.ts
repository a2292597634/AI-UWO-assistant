import { describe, expect, it } from 'vitest'
import type { RuntimeFleetOfficer } from '../../miniprogram/contracts/runtime-data'
import { solveBattleTargets } from '../../miniprogram/domain/battle-fleet-solver'

const officer = (id: string, skills: RuntimeFleetOfficer['skills']): RuntimeFleetOfficer => ({
  id,
  name: id,
  jobName: '戰鬥職業',
  rarityName: 'S',
  portraitPath: `/subpkg-assets-0/imgs/${id}.png`,
  visualGradeId: 'grade_6',
  typeId: 'type_class_1',
  genderId: 'gender_f',
  skills,
})

const active = (skillId: string, unlockLevel: number) => ({
  skillId,
  kind: 'active' as const,
  categoryId: 'skill_category_naval_active_cannon',
  unlockLevel,
})

const passive = (skillId: string, categoryId: string, unlockLevel: number) => ({
  skillId,
  kind: 'passive' as const,
  categoryId,
  unlockLevel,
})

const sampleOfficers: RuntimeFleetOfficer[] = [
  officer('officer-locked', [active('skill-cannon', 2)]),
  officer('officer-removed', [active('skill-cannon', 9)]),
  officer('officer-banned', [active('skill-cannon', 9)]),
  officer('officer-other-ship', [active('skill-cannon', 9)]),
  officer('officer-extra', [active('skill-cannon', 1)]),
]

const tieBreakOfficers: RuntimeFleetOfficer[] = [
  officer('officer-cannon', [active('skill-cannon', 2)]),
  officer('officer-melee', [passive('skill-melee', 'skill_category_naval_passive_melee', 2)]),
  officer('officer-combined', [
    active('skill-cannon', 2),
    passive('skill-melee', 'skill_category_naval_passive_melee', 2),
  ]),
]

const emptyInput = {
  officers: sampleOfficers,
  targets: [{ skillId: 'skill-cannon', targetLevel: 2 }],
  lockedOfficerIds: [],
  excludedOfficerIds: [],
  occupiedByOtherShips: [],
  currentOfficerIds: [],
  capacity: 11,
}

describe('battle fleet auto solver', () => {
  it('keeps locked officers and excludes other ships, banned, and removed candidates', () => {
    const result = solveBattleTargets({
      officers: sampleOfficers,
      targets: [{ skillId: 'skill-cannon', targetLevel: 2 }],
      lockedOfficerIds: ['officer-locked'],
      excludedOfficerIds: ['officer-removed', 'officer-banned'],
      occupiedByOtherShips: ['officer-other-ship'],
      currentOfficerIds: ['officer-locked'],
      capacity: 11,
    })

    expect(result.officerIds).toEqual(['officer-locked'])
    expect(result.targetProgress).toEqual([
      { skillId: 'skill-cannon', targetLevel: 2, currentLevel: 2, difference: 0, reached: true },
    ])
    expect(result.officerIds).not.toEqual(
      expect.arrayContaining(['officer-removed', 'officer-banned', 'officer-other-ship']),
    )
  })

  it('prefers more completed targets, then fewer officers, lower overage, then IDs', () => {
    const result = solveBattleTargets({
      officers: tieBreakOfficers,
      targets: [
        { skillId: 'skill-cannon', targetLevel: 2 },
        { skillId: 'skill-melee', targetLevel: 2 },
      ],
      lockedOfficerIds: [],
      excludedOfficerIds: [],
      occupiedByOtherShips: [],
      currentOfficerIds: [],
      capacity: 11,
    })

    expect(result.officerIds).toEqual(['officer-combined'])
    expect(result.allTargetsComplete).toBe(true)
  })

  it('returns an empty recommendation for no valid targets and restricts levels to one through ten', () => {
    expect(solveBattleTargets({ ...emptyInput, targets: [] }).officerIds).toEqual([])
    expect(() =>
      solveBattleTargets({
        ...emptyInput,
        targets: [{ skillId: 'skill-cannon', targetLevel: 11 }],
      }),
    ).toThrow('target-level')
  })
})
