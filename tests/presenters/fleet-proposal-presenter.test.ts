import { describe, expect, it } from 'vitest'
import {
  addOfficerToShip,
  createFleetState,
  lockOfficer,
} from '../../miniprogram/domain/battle-fleet'
import { createFleetProposal, fleetStateFingerprint } from '../../miniprogram/domain/fleet-proposal'
import { buildFleetProposalPreview } from '../../miniprogram/presenters/fleet-proposal-presenter'

const officers = [
  { id: 'officer-locked', name: '鎖定者' },
  { id: 'officer-old', name: '舊成員' },
  { id: 'officer-new', name: '新成員' },
]

const skills = {
  'skill-cannon': { n: '砲術' },
  'skill-sail': { n: '操帆' },
}

describe('fleet proposal presenter', () => {
  it('shows battle target differences, member changes, and locked retention', () => {
    let state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-locked').state
    state = lockOfficer(state, 'ship-1', 'officer-locked').state
    state = addOfficerToShip(state, 'ship-1', 'officer-old').state
    const proposal = createFleetProposal({
      source: 'battle',
      shipId: 'ship-1',
      baseStateFingerprint: fleetStateFingerprint(state),
      officerIds: ['officer-locked', 'officer-new'],
      beforeTargetLevels: { 'skill-cannon': 1 },
      targetProgress: [
        { skillId: 'skill-cannon', targetLevel: 4, currentLevel: 3, difference: 1, reached: false },
      ],
      achievedTargetCount: 0,
      allTargetsComplete: false,
      overageTotal: 0,
      constraints: [{ code: 'unmet-target', severity: 'warning', message: '仍有目標未達成。' }],
      canApply: true,
    })

    const preview = buildFleetProposalPreview(state, proposal, officers, skills)

    expect(preview.achievedTargetCount).toBe(0)
    expect(preview.targetCount).toBe(1)
    expect(preview.targetDiffs).toEqual([
      expect.objectContaining({
        skillId: 'skill-cannon',
        skillName: '砲術',
        currentLevel: 1,
        proposedLevel: 3,
        targetLevel: 4,
        difference: 1,
        reached: false,
      }),
    ])
    expect(preview.keptOfficers).toEqual([{ id: 'officer-locked', name: '鎖定者' }])
    expect(preview.addedOfficers).toEqual([{ id: 'officer-new', name: '新成員' }])
    expect(preview.removedOfficers).toEqual([{ id: 'officer-old', name: '舊成員' }])
    expect(preview.lockedOfficers).toEqual([
      { id: 'officer-locked', name: '鎖定者', retained: true },
    ])
    expect(preview.lockedAllRetained).toBe(true)
    expect(preview.constraints[0]!.message).toBe('仍有目標未達成。')
    expect(preview.canApply).toBe(true)
  })

  it('uses all ships for adventure member differences', () => {
    let state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-locked').state
    state = lockOfficer(state, 'ship-1', 'officer-locked').state
    state = addOfficerToShip(state, 'ship-2', 'officer-old').state
    const proposal = createFleetProposal({
      source: 'adventure',
      shipId: null,
      baseStateFingerprint: fleetStateFingerprint(state),
      officerIds: ['officer-locked', 'officer-new'],
      beforeTargetLevels: { 'skill-sail': 0 },
      targetProgress: [
        { skillId: 'skill-sail', targetLevel: 1, currentLevel: 1, difference: 0, reached: true },
      ],
      achievedTargetCount: 1,
      allTargetsComplete: true,
      overageTotal: 0,
      constraints: [],
      canApply: true,
    })

    const preview = buildFleetProposalPreview(state, proposal, officers, skills)

    expect(preview.keptOfficers.map((item) => item.id)).toEqual(['officer-locked'])
    expect(preview.addedOfficers.map((item) => item.id)).toEqual(['officer-new'])
    expect(preview.removedOfficers.map((item) => item.id)).toEqual(['officer-old'])
    expect(preview.lockedAllRetained).toBe(true)
  })
})
