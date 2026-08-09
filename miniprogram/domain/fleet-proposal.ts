import type { FleetProposal, FleetProposalInput } from '../contracts/fleet-proposal'
import type { FleetState, FleetTransitionResult } from '../contracts/battle-fleet'
import { FLEET_OFFICER_CAPACITY, SHIP_OFFICER_CAPACITY } from '../contracts/battle-fleet'
import { serializeFleetState } from '../contracts/fleet-config'
import { addOfficerToShip, recalculateShip } from './battle-fleet'

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested)
    }
  }
  return value
}

/** 以既有序列化契約複製完整 FleetState，避免撤銷快照與目前狀態共享巢狀引用。 */
export const cloneFleetState = (state: FleetState): FleetState => {
  return {
    ships: state.ships.map((ship) => ({
      ...ship,
      officerIds: [...ship.officerIds],
      targets: ship.targets.map((target) => ({ ...target })),
      lockedOfficerIds: [...ship.lockedOfficerIds],
      removedOfficerIds: [...ship.removedOfficerIds],
    })),
    bannedOfficerIds: [...state.bannedOfficerIds],
  }
}

/** 產生可用來阻止過期 Proposal 覆蓋新狀態的穩定指紋。 */
export const fleetStateFingerprint = (state: FleetState): string => serializeFleetState(state)

/** 複製並深層凍結 Proposal，確保 Solver 輸出不會被 Controller 或 View 改寫。 */
export const createFleetProposal = (input: FleetProposalInput): FleetProposal => {
  const proposal = {
    ...input,
    officerIds: [...input.officerIds],
    beforeTargetLevels: { ...input.beforeTargetLevels },
    targetProgress: input.targetProgress.map((progress) => ({ ...progress })),
    constraints: input.constraints.map((constraint) => ({ ...constraint })),
  }
  return deepFreeze(proposal)
}

const invalidProposal = (state: FleetState): FleetTransitionResult => ({
  state,
  error: 'invalid-recommendation',
})

const hasCurrentBase = (state: FleetState, proposal: FleetProposal): boolean =>
  proposal.baseStateFingerprint === null ||
  proposal.baseStateFingerprint === fleetStateFingerprint(state)

const hasUniqueOfficerIds = (proposal: FleetProposal): boolean =>
  new Set(proposal.officerIds).size === proposal.officerIds.length

const includesAllLocked = (
  lockedOfficerIds: readonly string[],
  proposal: FleetProposal,
): boolean => {
  const selected = new Set(proposal.officerIds)
  return lockedOfficerIds.every((officerId) => selected.has(officerId))
}

const canUseProposal = (state: FleetState, proposal: FleetProposal): boolean =>
  proposal.canApply && hasCurrentBase(state, proposal) && hasUniqueOfficerIds(proposal)

/** 套用戰鬥目前船方案；任何預檢失敗都返回原 state。 */
export const applyBattleProposal = (
  state: FleetState,
  proposal: FleetProposal,
): FleetTransitionResult => {
  if (!canUseProposal(state, proposal) || proposal.source !== 'battle' || !proposal.shipId) {
    return invalidProposal(state)
  }
  const ship = state.ships.find((item) => item.id === proposal.shipId)
  if (!ship || proposal.officerIds.length > SHIP_OFFICER_CAPACITY) return invalidProposal(state)
  if (!includesAllLocked(ship.lockedOfficerIds, proposal)) return invalidProposal(state)
  return recalculateShip(state, ship.id, proposal.officerIds)
}

const collectLockedOfficerIds = (state: FleetState): string[] =>
  state.ships.flatMap((ship) => ship.lockedOfficerIds)

/**
 * 套用冒險全艦隊方案。
 * 先在暫存 state 上完成全部 transition，任一步失敗便丟棄暫存結果並返回原 state。
 */
export const applyAdventureProposal = (
  state: FleetState,
  proposal: FleetProposal,
): FleetTransitionResult => {
  if (
    !canUseProposal(state, proposal) ||
    proposal.source !== 'adventure' ||
    proposal.shipId !== null
  ) {
    return invalidProposal(state)
  }
  if (proposal.officerIds.length > FLEET_OFFICER_CAPACITY) return invalidProposal(state)

  const lockedOfficerIds = collectLockedOfficerIds(state)
  if (!includesAllLocked(lockedOfficerIds, proposal)) return invalidProposal(state)

  let next = state
  for (const ship of state.ships) {
    const keepLockedIds = ship.officerIds.filter((officerId) =>
      ship.lockedOfficerIds.includes(officerId),
    )
    const result = recalculateShip(next, ship.id, keepLockedIds)
    if (result.error) return { state, error: result.error }
    next = result.state
  }

  for (const officerId of proposal.officerIds) {
    if (next.ships.some((ship) => ship.officerIds.includes(officerId))) continue
    const targetShip = next.ships.find((ship) => ship.officerIds.length < SHIP_OFFICER_CAPACITY)
    if (!targetShip) return invalidProposal(state)
    const result = addOfficerToShip(next, targetShip.id, officerId)
    if (result.error) return { state, error: result.error }
    next = result.state
  }

  return { state: next }
}
