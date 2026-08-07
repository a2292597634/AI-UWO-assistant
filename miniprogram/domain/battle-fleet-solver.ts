import type { RuntimeFleetOfficer } from '../contracts/runtime-data'
import { isBattleFleetSkill } from './battle-fleet'

export interface AutoTargetInput {
  skillId: string
  targetLevel: number
}

export interface AutoSolveInput {
  officers: readonly RuntimeFleetOfficer[]
  targets: readonly AutoTargetInput[]
  lockedOfficerIds: readonly string[]
  excludedOfficerIds: readonly string[]
  occupiedByOtherShips: readonly string[]
  currentOfficerIds: readonly string[]
  capacity: number
}

export interface AutoTargetProgress {
  skillId: string
  targetLevel: number
  currentLevel: number
  difference: number
  reached: boolean
}

export interface AutoSolveResult {
  officerIds: string[]
  achievedTargetCount: number
  allTargetsComplete: boolean
  targetProgress: AutoTargetProgress[]
  overageTotal: number
}

interface Candidate {
  officer: RuntimeFleetOfficer
  contributions: Record<string, number>
}

interface ScoredSelection {
  officerIds: string[]
  totals: Record<string, number>
  achievedTargetCount: number
  allTargetsComplete: boolean
  overageTotal: number
}

interface DpState {
  officerIds: string[]
  totals: Record<string, number>
  achievedCount: number
  overageTotal: number
}

/** 状态空间上限：超过此值时跳过 DP，避免极端参数下性能退化 */
const MAX_STATE_SPACE = 200_000

const sortedIds = (ids: readonly string[]): string[] => [...ids].sort()

const addContribution = (
  totals: Readonly<Record<string, number>>,
  contributions: Readonly<Record<string, number>>,
): Record<string, number> => {
  const next = { ...totals }
  for (const [skillId, level] of Object.entries(contributions)) {
    next[skillId] = (next[skillId] ?? 0) + level
  }
  return next
}

const candidateContributions = (
  officer: RuntimeFleetOfficer,
  targetIds: ReadonlySet<string>,
): Record<string, number> => {
  const result: Record<string, number> = {}
  for (const relation of officer.skills) {
    if (!targetIds.has(relation.skillId) || !isBattleFleetSkill(relation)) continue
    result[relation.skillId] = (result[relation.skillId] ?? 0) + relation.unlockLevel
  }
  return result
}

const scoreSelection = (
  officerIds: readonly string[],
  totals: Readonly<Record<string, number>>,
  targets: readonly AutoTargetInput[],
): ScoredSelection => {
  const achievedTargetCount = targets.reduce(
    (count, target) => count + ((totals[target.skillId] ?? 0) >= target.targetLevel ? 1 : 0),
    0,
  )
  const allTargetsComplete = achievedTargetCount === targets.length
  const overageTotal = targets.reduce(
    (sum, target) => sum + Math.max((totals[target.skillId] ?? 0) - target.targetLevel, 0),
    0,
  )
  return {
    officerIds: sortedIds(officerIds),
    totals: { ...totals },
    achievedTargetCount,
    allTargetsComplete,
    overageTotal,
  }
}

const buildProgress = (
  selection: ScoredSelection,
  targets: readonly AutoTargetInput[],
): AutoTargetProgress[] =>
  targets.map((target) => {
    const currentLevel = selection.totals[target.skillId] ?? 0
    return {
      skillId: target.skillId,
      targetLevel: target.targetLevel,
      currentLevel,
      difference: Math.max(target.targetLevel - currentLevel, 0),
      reached: currentLevel >= target.targetLevel,
    }
  })

const buildResult = (
  selection: ScoredSelection,
  targets: readonly AutoTargetInput[],
): AutoSolveResult => ({
  officerIds: selection.officerIds,
  achievedTargetCount: selection.achievedTargetCount,
  allTargetsComplete: selection.allTargetsComplete,
  targetProgress: buildProgress(selection, targets),
  overageTotal: selection.overageTotal,
})

// ── State-space DP ──

const makeStateKey = (
  totals: Readonly<Record<string, number>>,
  targetSkillIds: readonly string[],
  targetLevels: readonly number[],
): string =>
  targetSkillIds.map((sid, i) => String(Math.min(totals[sid] ?? 0, targetLevels[i]!))).join(',')

const countAchieved = (
  totals: Readonly<Record<string, number>>,
  targetSkillIds: readonly string[],
  targetLevels: readonly number[],
): number =>
  targetSkillIds.reduce(
    (count, sid, i) => count + ((totals[sid] ?? 0) >= targetLevels[i]! ? 1 : 0),
    0,
  )

const betterForSameKey = (a: DpState, b: DpState, _targetCount: number): boolean => {
  if (a.achievedCount !== b.achievedCount) return a.achievedCount > b.achievedCount
  // 同一等级分布下，人数少一定更优（剩余空间更多）
  if (a.officerIds.length !== b.officerIds.length) return a.officerIds.length < b.officerIds.length
  // 溢出少更优
  if (a.overageTotal !== b.overageTotal) return a.overageTotal < b.overageTotal
  return sortedIds(a.officerIds).join(',') < sortedIds(b.officerIds).join(',')
}

const runStateDp = (
  lockedIds: readonly string[],
  lockedTotals: Readonly<Record<string, number>>,
  candidates: readonly Candidate[],
  targets: readonly AutoTargetInput[],
  capacity: number,
): ScoredSelection => {
  const targetSkillIds = targets.map((t) => t.skillId)
  const targetLevels = targets.map((t) => t.targetLevel)
  const targetCount = targets.length

  const seedTotals: Record<string, number> = {}
  for (const sid of targetSkillIds) seedTotals[sid] = lockedTotals[sid] ?? 0

  const overage = (totals: Record<string, number>): number =>
    targets.reduce((sum, t) => sum + Math.max((totals[t.skillId] ?? 0) - t.targetLevel, 0), 0)

  const initialState: DpState = {
    officerIds: [...lockedIds],
    totals: { ...seedTotals },
    achievedCount: countAchieved(seedTotals, targetSkillIds, targetLevels),
    overageTotal: overage(seedTotals),
  }

  const dp = new Map<string, DpState>()
  dp.set(makeStateKey(seedTotals, targetSkillIds, targetLevels), initialState)

  for (const candidate of candidates) {
    const snapshot = [...dp.values()]
    for (const state of snapshot) {
      if (state.officerIds.length >= capacity) continue

      const newTotals = addContribution(state.totals, candidate.contributions)
      const achievedCount = countAchieved(newTotals, targetSkillIds, targetLevels)
      const newState: DpState = {
        officerIds: [...state.officerIds, candidate.officer.id],
        totals: newTotals,
        achievedCount,
        overageTotal: overage(newTotals),
      }

      const key = makeStateKey(newTotals, targetSkillIds, targetLevels)
      const existing = dp.get(key)
      if (!existing || betterForSameKey(newState, existing, targetCount)) {
        dp.set(key, newState)
      }
    }
  }

  let best: DpState = initialState
  for (const state of dp.values()) {
    if (betterForSameKey(state, best, targetCount)) best = state
  }

  return scoreSelection(best.officerIds, best.totals, targets)
}

const validateTargets = (targets: readonly AutoTargetInput[]): AutoTargetInput[] => {
  const valid = targets.filter((target) => target.skillId.trim() !== '')
  if (valid.some((target) => target.targetLevel < 1 || target.targetLevel > 10)) {
    throw new Error('target-level')
  }
  if (new Set(valid.map((target) => target.skillId)).size !== valid.length) {
    throw new Error('duplicate-target')
  }
  return valid.map((target) => ({ ...target }))
}

export const solveBattleTargets = (input: AutoSolveInput): AutoSolveResult => {
  const targets = validateTargets(input.targets)
  if (targets.length === 0) {
    return {
      officerIds: [],
      achievedTargetCount: 0,
      allTargetsComplete: false,
      targetProgress: [],
      overageTotal: 0,
    }
  }

  const targetIds = new Set(targets.map((target) => target.skillId))
  const byId = new Map(input.officers.map((officer) => [officer.id, officer]))
  const excluded = new Set([...input.excludedOfficerIds, ...input.occupiedByOtherShips])
  const lockedIds = sortedIds(
    input.lockedOfficerIds.filter((id) => byId.has(id) && !excluded.has(id)),
  )
  const lockedSet = new Set(lockedIds)
  const lockedTotals = lockedIds.reduce<Record<string, number>>((totals, officerId) => {
    const officer = byId.get(officerId)
    if (!officer) return totals
    return addContribution(totals, candidateContributions(officer, targetIds))
  }, {})
  const candidates = input.officers
    .filter(
      (officer) =>
        !lockedSet.has(officer.id) &&
        !excluded.has(officer.id) &&
        !input.lockedOfficerIds.includes(officer.id),
    )
    .map((officer) => ({ officer, contributions: candidateContributions(officer, targetIds) }))
    .filter((candidate) => Object.keys(candidate.contributions).length > 0)
    .sort((a, b) => (a.officer.id < b.officer.id ? -1 : a.officer.id > b.officer.id ? 1 : 0))

  const capacity = Math.max(0, input.capacity)
  if (lockedIds.length > capacity) {
    return buildResult(scoreSelection(lockedIds.slice(0, capacity), lockedTotals, targets), targets)
  }

  const stateSpace = targets.reduce((product, t) => product * (t.targetLevel + 1), 1)
  const selection =
    stateSpace <= MAX_STATE_SPACE
      ? runStateDp(lockedIds, lockedTotals, candidates, targets, capacity)
      : scoreSelection(lockedIds, lockedTotals, targets)
  return buildResult(selection, targets)
}
