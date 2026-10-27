import { calculateFleetSelection, finishFleetCalculation } from './fleet-solver-core'
import type { FleetCalculation } from './fleet-solver-core'
import type { RuntimeFleetOfficer } from '../contracts/runtime-data'
import type {
  FleetProposal,
  FleetProposalConstraint,
  FleetProposalTargetProgress,
} from '../contracts/fleet-proposal'
import { isBattleFleetSkill } from './battle-fleet'
import { createFleetProposal } from './fleet-proposal'

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
  shipId?: string | null
  baseStateFingerprint?: string | null
}

export type AutoTargetProgress = FleetProposalTargetProgress

export type AutoSolveResult = FleetProposal & {
  source: 'battle'
  targetProgress: readonly AutoTargetProgress[]
}

interface ScoredSelection {
  officerIds: string[]
  totals: Record<string, number>
  achievedTargetCount: number
  allTargetsComplete: boolean
  overageTotal: number
  remainingDeficitTotal: number
  completionScore: number
}

interface TargetScores {
  achievedTargetCount: number
  allTargetsComplete: boolean
  overageTotal: number
  remainingDeficitTotal: number
  completionScore: number
}

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
    result[relation.skillId] = (result[relation.skillId] ?? 0) + relation.level
  }
  return result
}

const scoreTotals = (
  totals: Readonly<Record<string, number>>,
  targets: readonly AutoTargetInput[],
): TargetScores => {
  const achievedTargetCount = targets.reduce(
    (count, target) => count + ((totals[target.skillId] ?? 0) >= target.targetLevel ? 1 : 0),
    0,
  )
  const allTargetsComplete = achievedTargetCount === targets.length
  const overageTotal = targets.reduce(
    (sum, target) => sum + Math.max((totals[target.skillId] ?? 0) - target.targetLevel, 0),
    0,
  )
  const remainingDeficitTotal = targets.reduce(
    (sum, target) => sum + Math.max(target.targetLevel - (totals[target.skillId] ?? 0), 0),
    0,
  )
  const completionScore = targets.reduce(
    (sum, target) =>
      sum + Math.min(totals[target.skillId] ?? 0, target.targetLevel) / target.targetLevel,
    0,
  )
  return {
    achievedTargetCount,
    allTargetsComplete,
    overageTotal,
    remainingDeficitTotal,
    completionScore,
  }
}

const scoreSelection = (
  officerIds: readonly string[],
  totals: Readonly<Record<string, number>>,
  targets: readonly AutoTargetInput[],
): ScoredSelection => ({
  officerIds: sortedIds(officerIds),
  totals: { ...totals },
  ...scoreTotals(totals, targets),
})

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
  input: AutoSolveInput,
  beforeTargetLevels: Readonly<Record<string, number>>,
  constraints: readonly FleetProposalConstraint[],
  canApply: boolean,
): AutoSolveResult =>
  createFleetProposal({
    source: 'battle',
    shipId: input.shipId ?? null,
    baseStateFingerprint: input.baseStateFingerprint ?? null,
    officerIds: selection.officerIds,
    beforeTargetLevels,
    achievedTargetCount: selection.achievedTargetCount,
    allTargetsComplete: selection.allTargetsComplete,
    targetProgress: buildProgress(selection, targets),
    overageTotal: selection.overageTotal,
    constraints,
    canApply,
  }) as AutoSolveResult

// ── State-space DP ──

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

const beforeLevelsFor = (
  input: AutoSolveInput,
  targets: readonly AutoTargetInput[],
  byId: ReadonlyMap<string, RuntimeFleetOfficer>,
): Record<string, number> => {
  const targetIds = new Set(targets.map((target) => target.skillId))
  const totals = input.currentOfficerIds.reduce<Record<string, number>>((result, officerId) => {
    const officer = byId.get(officerId)
    return officer ? addContribution(result, candidateContributions(officer, targetIds)) : result
  }, {})
  return Object.fromEntries(targets.map((target) => [target.skillId, totals[target.skillId] ?? 0]))
}

const buildConstraints = (
  selection: ScoredSelection,
  targets: readonly AutoTargetInput[],
  candidateCount: number,
  lockedCount: number,
  capacity: number,
  hasLockedConflict: boolean,
): { constraints: FleetProposalConstraint[]; canApply: boolean } => {
  const constraints: FleetProposalConstraint[] = []
  const hasUnmetTarget = !selection.allTargetsComplete

  if (hasLockedConflict) {
    constraints.push({
      code: 'locked-conflict',
      severity: 'error',
      message: '鎖定航海士資料與目前候選或排除約束衝突，無法安全套用。',
    })
  }
  if (lockedCount > capacity) {
    constraints.push({
      code: 'capacity-limit',
      severity: 'error',
      message: `鎖定航海士 ${lockedCount} 人超過目前船容量 ${capacity} 人。`,
    })
  }
  if (hasUnmetTarget) {
    constraints.push({
      code: candidateCount === 0 ? 'no-candidate' : 'unmet-target',
      severity: candidateCount === 0 ? 'error' : 'warning',
      message:
        candidateCount === 0
          ? '沒有符合目前目標的可用航海士。'
          : '部分目標仍未達成，請檢查目標差異與候選名單。',
    })
    if (selection.officerIds.length >= capacity && capacity >= 0) {
      constraints.push({
        code: 'capacity-limit',
        severity: 'warning',
        message: `方案已使用目前船容量上限 ${capacity} 人。`,
      })
    }
  }

  const cannotImprove = hasUnmetTarget && selection.officerIds.length === lockedCount
  const canApply = !hasLockedConflict && lockedCount <= capacity && !cannotImprove
  void targets
  return { constraints, canApply }
}

export function* createBattleTargetCalculation(
  input: AutoSolveInput,
): FleetCalculation<AutoSolveResult> {
  yield { phase: 'preparing', processedCandidates: 0, totalCandidates: 0, candidateFraction: 0 }
  const targets = validateTargets(input.targets)
  if (targets.length === 0) {
    return buildResult(
      {
        officerIds: [],
        totals: {},
        achievedTargetCount: 0,
        allTargetsComplete: false,
        overageTotal: 0,
        remainingDeficitTotal: 0,
        completionScore: 0,
      },
      [],
      input,
      {},
      [{ code: 'no-target', severity: 'error', message: '沒有可計算的配隊目標。' }],
      false,
    )
  }

  const targetIds = new Set(targets.map((target) => target.skillId))
  const byId = new Map(input.officers.map((officer) => [officer.id, officer]))
  const excluded = new Set([...input.excludedOfficerIds, ...input.occupiedByOtherShips])
  const lockedIds = sortedIds([...new Set(input.lockedOfficerIds)])
  const lockedSet = new Set(lockedIds)
  const lockedConflictIds = lockedIds.filter((id) => !byId.has(id) || excluded.has(id))
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
  const beforeTargetLevels = beforeLevelsFor(input, targets, byId)
  if (lockedIds.length > capacity) {
    const overflowSelection = scoreSelection(lockedIds, lockedTotals, targets)
    const constraintResult = buildConstraints(
      overflowSelection,
      targets,
      candidates.length,
      lockedIds.length,
      capacity,
      lockedConflictIds.length > 0,
    )
    return buildResult(
      overflowSelection,
      targets,
      input,
      beforeTargetLevels,
      constraintResult.constraints,
      false,
    )
  }

  const selection = yield* calculateFleetSelection(
    lockedIds,
    lockedTotals,
    candidates,
    targets,
    capacity,
  )
  const constraintResult = buildConstraints(
    selection,
    targets,
    candidates.length,
    lockedIds.length,
    capacity,
    lockedConflictIds.length > 0,
  )
  return buildResult(
    selection,
    targets,
    input,
    beforeTargetLevels,
    constraintResult.constraints,
    constraintResult.canApply,
  )
}

export const solveBattleTargets = (input: AutoSolveInput): AutoSolveResult =>
  finishFleetCalculation(createBattleTargetCalculation(input))
