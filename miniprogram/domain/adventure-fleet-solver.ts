import { calculateFleetSelection, finishFleetCalculation } from './fleet-solver-core'
import type { FleetCalculation } from './fleet-solver-core'
import type { AdventureFleetOfficer } from './adventure-fleet'
import type {
  FleetProposal,
  FleetProposalConstraint,
  FleetProposalTargetProgress,
} from '../contracts/fleet-proposal'
import { createFleetProposal } from './fleet-proposal'

// ── 类型 ──

export interface AdventureAutoTargetInput {
  skillId: string
  targetLevel: number
}

export interface AdventureAutoSolveInput {
  officers: readonly AdventureFleetOfficer[]
  targets: readonly AdventureAutoTargetInput[]
  lockedOfficerIds: readonly string[]
  excludedOfficerIds: readonly string[]
  currentOfficerIds: readonly string[]
  capacity: number
  shipId?: string | null
  baseStateFingerprint?: string | null
}

export type AdventureAutoTargetProgress = FleetProposalTargetProgress

export type AdventureAutoSolveResult = FleetProposal & {
  source: 'adventure'
  targetProgress: readonly AdventureAutoTargetProgress[]
}

// ── 内部类型 ──

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
  officer: AdventureFleetOfficer,
  targetIds: ReadonlySet<string>,
): Record<string, number> => {
  const result: Record<string, number> = {}
  for (const relation of officer.adventureSkills) {
    if (!targetIds.has(relation.skillId)) continue
    result[relation.skillId] = (result[relation.skillId] ?? 0) + relation.level
  }
  return result
}

const scoreTotals = (
  totals: Readonly<Record<string, number>>,
  targets: readonly AdventureAutoTargetInput[],
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
  targets: readonly AdventureAutoTargetInput[],
): ScoredSelection => ({
  officerIds: sortedIds(officerIds),
  totals: { ...totals },
  ...scoreTotals(totals, targets),
})

const buildProgress = (
  selection: ScoredSelection,
  targets: readonly AdventureAutoTargetInput[],
): AdventureAutoTargetProgress[] =>
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
  targets: readonly AdventureAutoTargetInput[],
  input: AdventureAutoSolveInput,
  beforeTargetLevels: Readonly<Record<string, number>>,
  constraints: readonly FleetProposalConstraint[],
  canApply: boolean,
): AdventureAutoSolveResult =>
  createFleetProposal({
    source: 'adventure',
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
  }) as AdventureAutoSolveResult

// ── 状态空间 DP ──

const validateTargets = (
  targets: readonly AdventureAutoTargetInput[],
): AdventureAutoTargetInput[] => {
  const configured = targets.filter((target) => target.skillId.trim() !== '')
  if (configured.some((target) => target.targetLevel < 0 || target.targetLevel > 10)) {
    throw new Error('target-level')
  }
  if (new Set(configured.map((target) => target.skillId)).size !== configured.length) {
    throw new Error('duplicate-target')
  }
  return configured.filter((target) => target.targetLevel > 0).map((target) => ({ ...target }))
}

const beforeLevelsFor = (
  input: AdventureAutoSolveInput,
  targets: readonly AdventureAutoTargetInput[],
  byId: ReadonlyMap<string, AdventureFleetOfficer>,
): Record<string, number> => {
  const targetIds = new Set(targets.map((target) => target.skillId))
  const totals = input.currentOfficerIds.reduce<Record<string, number>>((result, officerId) => {
    const officer = byId.get(officerId)
    if (!officer) return result
    const contributions: Record<string, number> = {}
    for (const relation of officer.adventureSkills) {
      if (targetIds.has(relation.skillId)) {
        contributions[relation.skillId] = (contributions[relation.skillId] ?? 0) + relation.level
      }
    }
    for (const [skillId, level] of Object.entries(contributions)) {
      result[skillId] = (result[skillId] ?? 0) + level
    }
    return result
  }, {})
  return Object.fromEntries(targets.map((target) => [target.skillId, totals[target.skillId] ?? 0]))
}

const buildConstraints = (
  selection: ScoredSelection,
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
      message: `鎖定航海士 ${lockedCount} 人超過全艦隊容量 ${capacity} 人。`,
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
        message: `方案已使用全艦隊容量上限 ${capacity} 人。`,
      })
    }
  }

  const cannotImprove = hasUnmetTarget && selection.officerIds.length === lockedCount
  const canApply = !hasLockedConflict && lockedCount <= capacity && !cannotImprove
  return { constraints, canApply }
}

// ── 主入口 ──

export function* createAdventureTargetCalculation(
  input: AdventureAutoSolveInput,
): FleetCalculation<AdventureAutoSolveResult> {
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
  const excluded = new Set(input.excludedOfficerIds)
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
    const safeLockedIds = lockedIds.slice(0, capacity)
    const safeLockedTotals = safeLockedIds.reduce<Record<string, number>>((totals, officerId) => {
      const officer = byId.get(officerId)
      if (!officer) return totals
      return addContribution(totals, candidateContributions(officer, targetIds))
    }, {})
    const overflowSelection = scoreSelection(safeLockedIds, safeLockedTotals, targets)
    const constraintResult = buildConstraints(
      overflowSelection,
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

export const solveAdventureTargets = (input: AdventureAutoSolveInput): AdventureAutoSolveResult =>
  finishFleetCalculation(createAdventureTargetCalculation(input))
