import { describe, expect, it } from 'vitest'
import {
  addOfficerToShip,
  banOfficer,
  createFleetState,
  lockOfficer,
} from '../../miniprogram/domain/battle-fleet'
import {
  applyAdventureProposal,
  applyBattleProposal,
  cloneFleetState,
  createFleetProposal,
  fleetStateFingerprint,
} from '../../miniprogram/domain/fleet-proposal'
import type { FleetProposalInput } from '../../miniprogram/contracts/fleet-proposal'

const proposalInput = (state = createFleetState()): FleetProposalInput => ({
  source: 'battle',
  shipId: 'ship-1',
  baseStateFingerprint: fleetStateFingerprint(state),
  officerIds: ['officer-a'],
  beforeTargetLevels: { 'skill-a': 0 },
  targetProgress: [
    {
      skillId: 'skill-a',
      targetLevel: 2,
      currentLevel: 1,
      difference: 1,
      reached: false,
    },
  ],
  achievedTargetCount: 0,
  allTargetsComplete: false,
  overageTotal: 0,
  constraints: [],
  canApply: true,
})

describe('FleetProposal', () => {
  it('creates a frozen proposal without changing input arrays', () => {
    const officerIds = ['officer-a']
    const targetProgress = [
      {
        skillId: 'skill-a',
        targetLevel: 2,
        currentLevel: 1,
        difference: 1,
        reached: false,
      },
    ]
    const input: FleetProposalInput = {
      ...proposalInput(),
      officerIds,
      targetProgress,
    }

    const proposal = createFleetProposal(input)

    expect(Object.isFrozen(proposal)).toBe(true)
    expect(Object.isFrozen(proposal.officerIds)).toBe(true)
    expect(Object.isFrozen(proposal.targetProgress)).toBe(true)
    officerIds.push('officer-b')
    targetProgress[0]!.difference = 0
    expect(proposal.officerIds).toEqual(['officer-a'])
    expect(proposal.targetProgress[0]!.difference).toBe(1)
  })

  it('does not change the current FleetState before an explicit battle apply', () => {
    const state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-old').state
    const before = cloneFleetState(state)
    const proposal = createFleetProposal({
      ...proposalInput(state),
      officerIds: ['officer-new'],
    })

    expect(state).toEqual(before)
    expect(state.ships[0]!.officerIds).toEqual(['officer-old'])
    expect(proposal.officerIds).toEqual(['officer-new'])
  })

  it('applies a battle proposal only on request and keeps locked officers', () => {
    let state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-locked').state
    state = lockOfficer(state, 'ship-1', 'officer-locked').state
    state = addOfficerToShip(state, 'ship-1', 'officer-old').state
    const before = cloneFleetState(state)
    const proposal = createFleetProposal({
      ...proposalInput(state),
      officerIds: ['officer-locked', 'officer-new'],
      allTargetsComplete: true,
      canApply: true,
    })

    const result = applyBattleProposal(state, proposal)

    expect(result.error).toBeUndefined()
    expect(result.state.ships[0]!.officerIds).toEqual(['officer-locked', 'officer-new'])
    expect(result.state.ships[0]!.lockedOfficerIds).toEqual(['officer-locked'])
    expect(before.ships[0]!.officerIds).toEqual(['officer-locked', 'officer-old'])
  })

  it('rejects a stale proposal without changing the current state', () => {
    const state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-current').state
    const proposal = createFleetProposal(proposalInput())

    const result = applyBattleProposal(state, proposal)

    expect(result.error).toBe('invalid-recommendation')
    expect(result.state).toBe(state)
  })

  it('does not clear existing officers when the proposal has no solution', () => {
    const state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-current').state
    const proposal = createFleetProposal({
      ...proposalInput(state),
      officerIds: [],
      constraints: [{ code: 'no-candidate', severity: 'error', message: '無解' }],
      canApply: false,
    })

    const result = applyBattleProposal(state, proposal)

    expect(result.error).toBe('invalid-recommendation')
    expect(result.state).toBe(state)
    expect(result.state.ships[0]!.officerIds).toEqual(['officer-current'])
  })

  it('applies an adventure proposal atomically across ships and preserves the full snapshot on failure', () => {
    let state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-locked').state
    state = lockOfficer(state, 'ship-1', 'officer-locked').state
    state = addOfficerToShip(state, 'ship-2', 'officer-old').state
    state = banOfficer(state, 'officer-banned').state
    const before = cloneFleetState(state)
    const proposal = createFleetProposal({
      ...proposalInput(state),
      source: 'adventure',
      shipId: null,
      officerIds: ['officer-locked', 'officer-banned'],
      allTargetsComplete: true,
      canApply: true,
    })

    const result = applyAdventureProposal(state, proposal)

    expect(result.error).toBe('officer-banned')
    expect(result.state).toEqual(state)
    expect(result.state).toEqual(before)
  })
})
