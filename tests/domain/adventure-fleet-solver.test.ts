import { describe, expect, it } from 'vitest'
import type { AdventureFleetOfficer } from '../../miniprogram/domain/adventure-fleet'
import { solveAdventureTargets } from '../../miniprogram/domain/adventure-fleet-solver'

const officer = (id: string, skillId: string): AdventureFleetOfficer => ({
  id,
  name: id,
  jobName: '冒險家',
  rarityName: '普通',
  portraitPath: '',
  visualGradeId: 'grade-1',
  typeId: 'type_class_1',
  typeName: '冒險',
  genderId: 'gender_m',
  adventureSkills: [{ skillId, level: 1, unlockLevel: 1 }],
  zone: 'adventure',
})

const multiSkillOfficer = (
  id: string,
  skills: Array<{ skillId: string; level: number; unlockLevel: number }>,
): AdventureFleetOfficer => ({
  ...officer(id, skills[0]!.skillId),
  adventureSkills: skills,
})

const baseInput = {
  lockedOfficerIds: [],
  excludedOfficerIds: [],
  currentOfficerIds: [],
  capacity: 77,
}

describe('adventure fleet solver target semantics', () => {
  it('returns an immutable adventure proposal without changing solver input', () => {
    const input = {
      ...baseInput,
      baseStateFingerprint: 'adventure-base',
      officers: [officer('officer-a', 'skill-goal')],
      targets: [{ skillId: 'skill-goal', targetLevel: 1 }],
    }
    const before = structuredClone(input)

    const result = solveAdventureTargets(input)

    expect(result.source).toBe('adventure')
    expect(result.baseStateFingerprint).toBe('adventure-base')
    expect(Object.isFrozen(result)).toBe(true)
    expect(input).toEqual(before)
  })

  it('does not select officers for Lv.0 tracking targets', () => {
    const result = solveAdventureTargets({
      ...baseInput,
      officers: [officer('officer-a', 'skill-track')],
      targets: [{ skillId: 'skill-track', targetLevel: 0 }],
    })

    expect(result.officerIds).toEqual([])
    expect(result.targetProgress).toEqual([])
  })

  it('solves only positive-level targets when tracking and optimization are mixed', () => {
    const result = solveAdventureTargets({
      ...baseInput,
      officers: [officer('officer-a', 'skill-track'), officer('officer-b', 'skill-goal')],
      targets: [
        { skillId: 'skill-track', targetLevel: 0 },
        { skillId: 'skill-goal', targetLevel: 1 },
      ],
    })

    expect(result.officerIds).toEqual(['officer-b'])
    expect(result.targetProgress.map((target) => target.skillId)).toEqual(['skill-goal'])
  })

  it('uses canonical skill level rather than the officer unlock threshold', () => {
    const result = solveAdventureTargets({
      ...baseInput,
      officers: [
        multiSkillOfficer('officer-level-two', [
          { skillId: 'skill-goal', level: 2, unlockLevel: 50 },
        ]),
      ],
      targets: [{ skillId: 'skill-goal', targetLevel: 3 }],
    })

    expect(result.targetProgress).toEqual([
      { skillId: 'skill-goal', targetLevel: 3, currentLevel: 2, difference: 1, reached: false },
    ])
  })

  it('reports an explicit no-candidate constraint without an applicable empty proposal', () => {
    const result = solveAdventureTargets({
      ...baseInput,
      officers: [],
      targets: [{ skillId: 'skill-goal', targetLevel: 2 }],
    })

    expect(result.officerIds).toEqual([])
    expect(result.allTargetsComplete).toBe(false)
    expect(result.canApply).toBe(false)
    expect(result.constraints).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'no-candidate' })]),
    )
  })

  it('按实际返回的航海士计算锁定超容量方案的目标进度', () => {
    const result = solveAdventureTargets({
      ...baseInput,
      officers: [officer('officer-a', 'skill-a'), officer('officer-b', 'skill-b')],
      targets: [{ skillId: 'skill-b', targetLevel: 1 }],
      lockedOfficerIds: ['officer-a', 'officer-b'],
      capacity: 1,
    })

    expect(result.officerIds).toEqual(['officer-a'])
    expect(result.targetProgress).toEqual([
      {
        skillId: 'skill-b',
        targetLevel: 1,
        currentLevel: 0,
        difference: 1,
        reached: false,
      },
    ])
    expect(result.canApply).toBe(false)
  })

  it('大状态空间回退优先选择真正完成目标的候选', () => {
    const targets = Array.from({ length: 6 }, (_, index) => ({
      skillId: `skill-${index}`,
      targetLevel: 10,
    }))
    const result = solveAdventureTargets({
      ...baseInput,
      officers: [
        multiSkillOfficer('officer-complete', [{ skillId: 'skill-0', level: 10, unlockLevel: 10 }]),
        multiSkillOfficer('officer-broad', [
          { skillId: 'skill-0', level: 1, unlockLevel: 1 },
          { skillId: 'skill-1', level: 1, unlockLevel: 1 },
        ]),
      ],
      targets,
      capacity: 1,
    })

    expect(result.officerIds).toEqual(['officer-complete'])
    expect(result.achievedTargetCount).toBe(1)
    expect(result.targetProgress[0]).toMatchObject({ currentLevel: 10, reached: true })
  })
})
