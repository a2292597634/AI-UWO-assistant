import type { FleetState } from './battle-fleet'

export type FleetProposalSource = 'battle' | 'adventure'

export type FleetProposalConstraintCode =
  | 'no-target'
  | 'unmet-target'
  | 'no-candidate'
  | 'capacity-limit'
  | 'locked-conflict'
  | 'stale-state'

export interface FleetProposalConstraint {
  code: FleetProposalConstraintCode
  severity: 'warning' | 'error'
  message: string
}

export interface FleetProposalTargetProgress {
  skillId: string
  targetLevel: number
  currentLevel: number
  difference: number
  reached: boolean
}

export interface FleetProposalInput {
  source: FleetProposalSource
  shipId: string | null
  baseStateFingerprint: string | null
  officerIds: readonly string[]
  beforeTargetLevels: Readonly<Record<string, number>>
  targetProgress: readonly FleetProposalTargetProgress[]
  achievedTargetCount: number
  allTargetsComplete: boolean
  overageTotal: number
  constraints: readonly FleetProposalConstraint[]
  canApply: boolean
}

export interface FleetProposal extends Omit<FleetProposalInput, 'officerIds'> {
  readonly officerIds: readonly string[]
}

export type FleetProposalState = FleetState
