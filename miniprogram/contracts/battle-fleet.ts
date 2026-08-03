import type { RuntimeFleetOfficer, RuntimeSkill } from './runtime-data'

export const FLEET_SHIP_COUNT = 7
export const SHIP_OFFICER_CAPACITY = 11
export const FLEET_OFFICER_CAPACITY = FLEET_SHIP_COUNT * SHIP_OFFICER_CAPACITY

export type FleetShipMode = 'manual' | 'auto'
export type BattleSkillKindFilter = 'all' | 'active' | 'passive'
export type FleetShipStatus =
  'empty' | 'editing' | 'complete' | 'incomplete-target' | 'needs-review'
export type FleetOfficerStatus = 'available' | 'current' | 'locked' | 'occupied' | 'banned'

export interface FleetTarget {
  id: string
  skillId: string | null
  targetLevel: number
}

export interface FleetShipState {
  id: string
  label: string
  mode: FleetShipMode
  officerIds: string[]
  targets: FleetTarget[]
  lockedOfficerIds: string[]
  removedOfficerIds: string[]
  needsReview: boolean
}

export interface FleetState {
  ships: FleetShipState[]
  bannedOfficerIds: string[]
}

export interface BattleSkillFilter {
  kind: BattleSkillKindFilter
  categoryId: string | null
  searchText: string
}

export interface BattleSkillOption {
  id: string
  name: string
  kind: 'active' | 'passive'
  kindLabel: '主動技能' | '戰鬥被動'
  categoryId: string
  categoryName: string
  iconPath: string
}

export interface ShipSkillSummary {
  skillId: string
  skillName: string
  skillIconPath: string
  kind: 'active' | 'passive'
  categoryId: string
  totalLevel: number
  targetLevel: number | null
  isReached: boolean | null
  difference: number | null
  contributorOfficerIds: string[]
}

export type FleetTransitionError =
  | 'unknown-ship'
  | 'ship-full'
  | 'officer-occupied'
  | 'officer-banned'
  | 'officer-locked'
  | 'officer-not-found'
  | 'invalid-target-level'
  | 'duplicate-target'
  | 'target-not-found'
  | 'invalid-recommendation'

export interface FleetTransitionResult {
  state: FleetState
  error?: FleetTransitionError
  fromShipId?: string
}

export type FleetOfficerMap = Readonly<Record<string, RuntimeFleetOfficer>>
export type FleetSkillMap = Readonly<Record<string, RuntimeSkill>>
