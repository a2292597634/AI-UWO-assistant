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
  adventureSkills: [{ skillId, unlockLevel: 1 }],
  zone: 'adventure',
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
})
