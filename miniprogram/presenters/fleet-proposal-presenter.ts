import type { FleetState } from '../contracts/battle-fleet'
import type { FleetProposal, FleetProposalConstraint } from '../contracts/fleet-proposal'

export interface FleetProposalOfficerView {
  id: string
  name: string
}

export interface FleetProposalLockedOfficerView extends FleetProposalOfficerView {
  retained: boolean
}

export interface FleetProposalTargetDiffView {
  skillId: string
  skillName: string
  currentLevel: number
  proposedLevel: number
  targetLevel: number
  difference: number
  reached: boolean
}

export interface FleetProposalPreviewView {
  source: FleetProposal['source']
  scopeLabel: string
  achievedTargetCount: number
  targetCount: number
  allTargetsComplete: boolean
  targetDiffs: FleetProposalTargetDiffView[]
  keptOfficers: FleetProposalOfficerView[]
  addedOfficers: FleetProposalOfficerView[]
  removedOfficers: FleetProposalOfficerView[]
  lockedOfficers: FleetProposalLockedOfficerView[]
  lockedAllRetained: boolean
  constraints: FleetProposalConstraint[]
  canApply: boolean
}

interface ProposalOfficer {
  id: string
  name: string
}

interface ProposalSkill {
  n: string
}

const officerView = (
  officerMap: ReadonlyMap<string, ProposalOfficer>,
  officerId: string,
): FleetProposalOfficerView => ({
  id: officerId,
  name: officerMap.get(officerId)?.name ?? officerId,
})

const currentOfficerIdsFor = (state: FleetState, proposal: FleetProposal): string[] => {
  if (proposal.source === 'battle' && proposal.shipId) {
    return state.ships.find((ship) => ship.id === proposal.shipId)?.officerIds.slice() ?? []
  }
  return state.ships.flatMap((ship) => ship.officerIds)
}

const lockedOfficerIdsFor = (state: FleetState, proposal: FleetProposal): string[] => {
  if (proposal.source === 'battle' && proposal.shipId) {
    return state.ships.find((ship) => ship.id === proposal.shipId)?.lockedOfficerIds.slice() ?? []
  }
  return state.ships.flatMap((ship) => ship.lockedOfficerIds)
}

/** 將 Solver Proposal 純函式投影成戰鬥與冒險共用的差異預覽。 */
export const buildFleetProposalPreview = (
  state: FleetState,
  proposal: FleetProposal,
  officers: readonly ProposalOfficer[],
  skills: Readonly<Record<string, ProposalSkill>>,
): FleetProposalPreviewView => {
  const officerMap = new Map(officers.map((officer) => [officer.id, officer] as const))
  const currentIds = currentOfficerIdsFor(state, proposal)
  const proposedIds = [...proposal.officerIds]
  const currentSet = new Set(currentIds)
  const proposedSet = new Set(proposedIds)
  const lockedIds = lockedOfficerIdsFor(state, proposal)

  const targetDiffs = proposal.targetProgress.map((progress) => ({
    skillId: progress.skillId,
    skillName: skills[progress.skillId]?.n ?? progress.skillId,
    currentLevel: proposal.beforeTargetLevels[progress.skillId] ?? 0,
    proposedLevel: progress.currentLevel,
    targetLevel: progress.targetLevel,
    difference: progress.difference,
    reached: progress.reached,
  }))

  const keptOfficers = currentIds
    .filter((officerId) => proposedSet.has(officerId))
    .map((officerId) => officerView(officerMap, officerId))
  const addedOfficers = proposedIds
    .filter((officerId) => !currentSet.has(officerId))
    .map((officerId) => officerView(officerMap, officerId))
  const removedOfficers = currentIds
    .filter((officerId) => !proposedSet.has(officerId))
    .map((officerId) => officerView(officerMap, officerId))
  const lockedOfficers = lockedIds.map((officerId) => ({
    ...officerView(officerMap, officerId),
    retained: proposedSet.has(officerId),
  }))

  return {
    source: proposal.source,
    scopeLabel: proposal.source === 'battle' ? '目前船' : '全艦隊',
    achievedTargetCount: proposal.achievedTargetCount,
    targetCount: proposal.targetProgress.length,
    allTargetsComplete: proposal.allTargetsComplete,
    targetDiffs,
    keptOfficers,
    addedOfficers,
    removedOfficers,
    lockedOfficers,
    lockedAllRetained: lockedOfficers.every((officer) => officer.retained),
    constraints: proposal.constraints.map((constraint) => ({ ...constraint })),
    canApply: proposal.canApply,
  }
}
