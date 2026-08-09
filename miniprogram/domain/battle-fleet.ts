import type {
  BattleSkillFilter,
  BattleSkillOption,
  FleetOfficerMap,
  FleetOfficerStatus,
  FleetShipState,
  FleetSkillMap,
  FleetState,
  FleetTarget,
  FleetTransitionResult,
  ShipSkillSummary,
} from '../contracts/battle-fleet'
import { FLEET_SHIP_COUNT, SHIP_OFFICER_CAPACITY } from '../contracts/battle-fleet'
import type { RuntimeFleetSkillRelation } from '../contracts/runtime-data'

export { FLEET_SHIP_COUNT, SHIP_OFFICER_CAPACITY }

export const isBattleFleetSkill = (relation: RuntimeFleetSkillRelation): boolean => {
  if (relation.kind === 'active') {
    return relation.categoryId.startsWith('skill_category_naval_active_')
  }
  return (
    relation.categoryId.startsWith('skill_category_naval_passive_') ||
    relation.categoryId === 'skill_category_combat_other'
  )
}

const cloneShip = (ship: FleetShipState): FleetShipState => ({
  ...ship,
  officerIds: [...ship.officerIds],
  targets: ship.targets.map((target) => ({ ...target })),
  lockedOfficerIds: [...ship.lockedOfficerIds],
  removedOfficerIds: [...ship.removedOfficerIds],
})

const cloneState = (state: FleetState): FleetState => ({
  ships: state.ships.map(cloneShip),
  bannedOfficerIds: [...state.bannedOfficerIds],
})

const findShip = (state: FleetState, shipId: string): FleetShipState | undefined =>
  state.ships.find((ship) => ship.id === shipId)

const findOfficerShip = (state: FleetState, officerId: string): FleetShipState | undefined =>
  state.ships.find((ship) => ship.officerIds.includes(officerId))

const updateShip = (
  state: FleetState,
  shipId: string,
  update: (ship: FleetShipState) => FleetShipState,
): FleetState => ({
  ...cloneState(state),
  ships: state.ships.map((ship) =>
    ship.id === shipId ? update(cloneShip(ship)) : cloneShip(ship),
  ),
})

export const createFleetState = (): FleetState => ({
  ships: Array.from({ length: FLEET_SHIP_COUNT }, (_, index) => ({
    id: `ship-${index + 1}`,
    label: `${index + 1}號船`,
    mode: 'manual' as const,
    officerIds: [],
    targets: [],
    lockedOfficerIds: [],
    removedOfficerIds: [],
    needsReview: false,
  })),
  bannedOfficerIds: [],
})

export const addOfficerToShip = (
  state: FleetState,
  shipId: string,
  officerId: string,
): FleetTransitionResult => {
  const ship = findShip(state, shipId)
  if (!ship) return { state, error: 'unknown-ship' }
  if (ship.officerIds.includes(officerId)) return { state }
  if (state.bannedOfficerIds.includes(officerId)) return { state, error: 'officer-banned' }
  if (ship.officerIds.length >= SHIP_OFFICER_CAPACITY) return { state, error: 'ship-full' }

  const occupiedBy = findOfficerShip(state, officerId)
  if (occupiedBy) {
    return { state, error: 'officer-occupied', fromShipId: occupiedBy.id }
  }

  return {
    state: updateShip(state, shipId, (current) => ({
      ...current,
      officerIds: [...current.officerIds, officerId],
    })),
  }
}

export const removeOfficerFromShip = (
  state: FleetState,
  shipId: string,
  officerId: string,
): FleetTransitionResult => {
  const ship = findShip(state, shipId)
  if (!ship) return { state, error: 'unknown-ship' }
  if (!ship.officerIds.includes(officerId)) return { state, error: 'officer-not-found' }

  return {
    state: updateShip(state, shipId, (current) => ({
      ...current,
      officerIds: current.officerIds.filter((id) => id !== officerId),
      lockedOfficerIds: current.lockedOfficerIds.filter((id) => id !== officerId),
      removedOfficerIds: current.removedOfficerIds.includes(officerId)
        ? current.removedOfficerIds
        : [...current.removedOfficerIds, officerId],
    })),
  }
}

export const moveOfficerToShip = (
  state: FleetState,
  fromShipId: string,
  toShipId: string,
  officerId: string,
): FleetTransitionResult => {
  const source = findShip(state, fromShipId)
  const target = findShip(state, toShipId)
  if (!source || !target) return { state, error: 'unknown-ship' }
  if (!source.officerIds.includes(officerId)) return { state, error: 'officer-not-found' }
  if (target.officerIds.length >= SHIP_OFFICER_CAPACITY) return { state, error: 'ship-full' }

  let next = updateShip(state, fromShipId, (ship) => ({
    ...ship,
    officerIds: ship.officerIds.filter((id) => id !== officerId),
    lockedOfficerIds: ship.lockedOfficerIds.filter((id) => id !== officerId),
    needsReview: true,
  }))
  next = updateShip(next, toShipId, (ship) => ({
    ...ship,
    officerIds: ship.officerIds.includes(officerId)
      ? ship.officerIds
      : [...ship.officerIds, officerId],
  }))
  return { state: next }
}

export const excludeOfficerFromShip = (
  state: FleetState,
  shipId: string,
  officerId: string,
): FleetTransitionResult => {
  const ship = findShip(state, shipId)
  if (!ship) return { state, error: 'unknown-ship' }
  if (!ship.officerIds.includes(officerId)) return { state, error: 'officer-not-found' }
  if (ship.lockedOfficerIds.includes(officerId)) return { state, error: 'officer-locked' }

  let next: FleetState = updateShip(state, shipId, (current) => ({
    ...current,
    officerIds: current.officerIds.filter((id) => id !== officerId),
    lockedOfficerIds: current.lockedOfficerIds.filter((id) => id !== officerId),
    removedOfficerIds: current.removedOfficerIds.includes(officerId)
      ? current.removedOfficerIds
      : [...current.removedOfficerIds, officerId],
  }))

  if (!next.bannedOfficerIds.includes(officerId)) {
    next = { ...cloneState(next), bannedOfficerIds: [...next.bannedOfficerIds, officerId] }
  }

  return { state: next }
}

export const banOfficer = (state: FleetState, officerId: string): FleetTransitionResult => {
  const occupiedBy = findOfficerShip(state, officerId)
  if (occupiedBy) {
    return {
      state,
      error: occupiedBy.lockedOfficerIds.includes(officerId)
        ? 'officer-locked'
        : 'officer-occupied',
    }
  }
  if (state.bannedOfficerIds.includes(officerId)) return { state }
  return {
    state: { ...cloneState(state), bannedOfficerIds: [...state.bannedOfficerIds, officerId] },
  }
}

export const unbanOfficer = (state: FleetState, officerId: string): FleetTransitionResult => ({
  state: {
    ...cloneState(state),
    bannedOfficerIds: state.bannedOfficerIds.filter((id) => id !== officerId),
    ships: state.ships.map((ship) => ({
      ...cloneShip(ship),
      removedOfficerIds: ship.removedOfficerIds.filter((id) => id !== officerId),
    })),
  },
})

export const lockOfficer = (
  state: FleetState,
  shipId: string,
  officerId: string,
): FleetTransitionResult => {
  const ship = findShip(state, shipId)
  if (!ship) return { state, error: 'unknown-ship' }
  if (!ship.officerIds.includes(officerId)) return { state, error: 'officer-not-found' }
  if (ship.lockedOfficerIds.includes(officerId)) return { state }
  return {
    state: updateShip(state, shipId, (current) => ({
      ...current,
      lockedOfficerIds: [...current.lockedOfficerIds, officerId],
    })),
  }
}

export const unlockOfficer = (
  state: FleetState,
  shipId: string,
  officerId: string,
): FleetTransitionResult => {
  const ship = findShip(state, shipId)
  if (!ship) return { state, error: 'unknown-ship' }
  return {
    state: updateShip(state, shipId, (current) => ({
      ...current,
      lockedOfficerIds: current.lockedOfficerIds.filter((id) => id !== officerId),
    })),
  }
}

export const filterBattleSkills = (
  officers: FleetOfficerMap,
  skills: FleetSkillMap,
  filters: BattleSkillFilter,
): BattleSkillOption[] => {
  const relationMap = new Map<string, RuntimeFleetSkillRelation>()
  for (const officer of Object.values(officers)) {
    for (const relation of officer.skills) {
      if (isBattleFleetSkill(relation) && !relationMap.has(relation.skillId)) {
        relationMap.set(relation.skillId, relation)
      }
    }
  }

  const search = filters.searchText.trim().toLocaleLowerCase()
  return [...relationMap.entries()]
    .map(([id, relation]) => {
      const skill = skills[id]
      if (!skill) return null
      return {
        id,
        name: skill.n,
        kind: relation.kind,
        kindLabel: relation.kind === 'active' ? ('主動技能' as const) : ('戰鬥被動' as const),
        categoryId: relation.categoryId,
        categoryName: skill.cn,
        iconPath: skill.ip,
        description: skill.d,
      }
    })
    .filter((item): item is BattleSkillOption => {
      if (!item) return false
      if (filters.kind !== 'all' && item.kind !== filters.kind) return false
      if (filters.categoryId && item.categoryId !== filters.categoryId) return false
      if (search && !item.name.toLocaleLowerCase().includes(search)) return false
      return true
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export const summarizeShipSkills = (
  officerIds: readonly string[],
  officers: FleetOfficerMap,
  skills: FleetSkillMap,
  targets: Readonly<Record<string, number>>,
): ShipSkillSummary[] => {
  const totals = new Map<string, number>()
  const contributors = new Map<string, string[]>()
  const relations = new Map<string, RuntimeFleetSkillRelation>()

  for (const officerId of officerIds) {
    const officer = officers[officerId]
    if (!officer) continue
    for (const relation of officer.skills) {
      if (!isBattleFleetSkill(relation)) continue
      totals.set(relation.skillId, (totals.get(relation.skillId) ?? 0) + relation.unlockLevel)
      const current = contributors.get(relation.skillId) ?? []
      current.push(officerId)
      contributors.set(relation.skillId, current)
      relations.set(relation.skillId, relation)
    }
  }

  for (const skillId of Object.keys(targets)) {
    if (!relations.has(skillId) && skills[skillId]) {
      const skill = skills[skillId]
      const kind = skill.cat.startsWith('skill_category_naval_active_') ? 'active' : 'passive'
      relations.set(skillId, {
        skillId,
        kind,
        categoryId: skill.cat,
        unlockLevel: 0,
      })
      totals.set(skillId, 0)
      contributors.set(skillId, [])
    }
  }

  return [...relations.keys()]
    .map((skillId) => {
      const skill = skills[skillId]
      const relation = relations.get(skillId)!
      const totalLevel = totals.get(skillId) ?? 0
      const targetLevel = targets[skillId] ?? null
      return {
        skillId,
        skillName: skill?.n ?? skillId,
        skillIconPath: skill?.ip ?? '',
        kind: relation.kind,
        categoryId: relation.categoryId,
        totalLevel,
        targetLevel,
        isReached: targetLevel === null ? null : totalLevel >= targetLevel,
        difference: targetLevel === null ? null : Math.max(targetLevel - totalLevel, 0),
        contributorOfficerIds: contributors.get(skillId) ?? [],
      }
    })
    .sort((a, b) => {
      // 有目标的排前
      const aHas = a.targetLevel !== null
      const bHas = b.targetLevel !== null
      if (aHas !== bHas) return aHas ? -1 : 1
      // 同组内按总等级降序
      if (a.totalLevel !== b.totalLevel) return b.totalLevel - a.totalLevel
      return a.skillId < b.skillId ? -1 : a.skillId > b.skillId ? 1 : 0
    })
}

export const getShipStatus = (
  ship: FleetShipState,
  summaries: readonly ShipSkillSummary[],
): 'empty' | 'editing' | 'complete' | 'incomplete-target' | 'needs-review' => {
  if (ship.needsReview) return 'needs-review'
  if (ship.officerIds.length === 0) return 'empty'
  const targets = summaries.filter((summary) => summary.targetLevel !== null)
  if (targets.length > 0 && targets.some((summary) => !summary.isReached)) {
    return 'incomplete-target'
  }
  if (ship.officerIds.length >= SHIP_OFFICER_CAPACITY || targets.length > 0) return 'complete'
  return 'editing'
}

const nextTargetId = (ship: FleetShipState): string => {
  const existingIds = new Set(ship.targets.map((target) => target.id))
  let index = ship.targets.length + 1
  while (existingIds.has(`${ship.id}-target-${index}`)) index += 1
  return `${ship.id}-target-${index}`
}

export const assignSkillToFirstOpenTarget = (
  state: FleetState,
  shipId: string,
  skillId: string,
): FleetTransitionResult => {
  const ship = findShip(state, shipId)
  if (!ship) return { state, error: 'unknown-ship' }
  if (ship.targets.some((target) => target.skillId === skillId)) {
    return { state, error: 'duplicate-target' }
  }

  const emptyTargetIndex = ship.targets.findIndex((target) => target.skillId === null)
  const targets: FleetTarget[] =
    emptyTargetIndex >= 0
      ? ship.targets.map((target, index) =>
          index === emptyTargetIndex ? { ...target, skillId } : { ...target },
        )
      : [...ship.targets, { id: nextTargetId(ship), skillId, targetLevel: 1 }]

  return updateShipTargets(state, shipId, targets)
}

export const updateShipTargets = (
  state: FleetState,
  shipId: string,
  targets: readonly FleetTarget[],
): FleetTransitionResult => {
  const ship = findShip(state, shipId)
  if (!ship) return { state, error: 'unknown-ship' }
  if (
    targets.some(
      (target) => target.targetLevel < (target.skillId === null ? 1 : 0) || target.targetLevel > 10,
    )
  ) {
    return { state, error: 'invalid-target-level' }
  }
  const valid = targets.filter((target) => target.skillId !== null)
  const ids = valid.map((target) => target.skillId!)
  if (new Set(ids).size !== ids.length) return { state, error: 'duplicate-target' }
  return {
    state: updateShip(state, shipId, (current) => ({
      ...current,
      targets: targets.map((target) => ({ ...target })),
    })),
  }
}

export const setShipMode = (
  state: FleetState,
  shipId: string,
  mode: FleetShipState['mode'],
): FleetTransitionResult => {
  const ship = findShip(state, shipId)
  if (!ship) return { state, error: 'unknown-ship' }
  return {
    state: updateShip(state, shipId, (current) => ({
      ...current,
      mode,
      targets:
        mode === 'auto' && current.targets.length === 0
          ? [{ id: `${shipId}-target-1`, skillId: null, targetLevel: 1 }]
          : current.targets,
    })),
  }
}

export const recalculateShip = (
  state: FleetState,
  shipId: string,
  officerIds: readonly string[],
): FleetTransitionResult => {
  const ship = findShip(state, shipId)
  if (!ship) return { state, error: 'unknown-ship' }
  if (officerIds.length > SHIP_OFFICER_CAPACITY || new Set(officerIds).size !== officerIds.length) {
    return { state, error: 'invalid-recommendation' }
  }
  if (ship.lockedOfficerIds.some((id) => !officerIds.includes(id))) {
    return { state, error: 'officer-locked' }
  }
  if (officerIds.some((id) => state.bannedOfficerIds.includes(id))) {
    return { state, error: 'officer-banned' }
  }
  const occupiedElsewhere = officerIds.find((id) => {
    const owner = findOfficerShip(state, id)
    return owner !== undefined && owner.id !== shipId
  })
  if (occupiedElsewhere) return { state, error: 'officer-occupied' }

  return {
    state: updateShip(state, shipId, (current) => ({
      ...current,
      officerIds: [...officerIds],
      needsReview: false,
    })),
  }
}

export const getOfficerStatus = (
  state: FleetState,
  currentShipId: string,
  officerId: string,
): FleetOfficerStatus => {
  if (state.bannedOfficerIds.includes(officerId)) return 'banned'
  const owner = findOfficerShip(state, officerId)
  if (!owner) return 'available'
  if (owner.id === currentShipId && owner.lockedOfficerIds.includes(officerId)) return 'locked'
  if (owner.id === currentShipId) return 'current'
  return 'occupied'
}
