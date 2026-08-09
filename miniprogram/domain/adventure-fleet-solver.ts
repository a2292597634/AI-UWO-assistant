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

interface Candidate {
  officer: AdventureFleetOfficer
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

/** 状态空间上限：超过此值时跳过 DP */
const MAX_STATE_SPACE = 200_000

// ── 工具函数 ──

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
    result[relation.skillId] = (result[relation.skillId] ?? 0) + relation.unlockLevel
  }
  return result
}

const scoreSelection = (
  officerIds: readonly string[],
  totals: Readonly<Record<string, number>>,
  targets: readonly AdventureAutoTargetInput[],
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

const betterForSameKey = (a: DpState, b: DpState): boolean => {
  if (a.achievedCount !== b.achievedCount) return a.achievedCount > b.achievedCount
  if (a.officerIds.length !== b.officerIds.length) return a.officerIds.length < b.officerIds.length
  if (a.overageTotal !== b.overageTotal) return a.overageTotal < b.overageTotal
  return sortedIds(a.officerIds).join(',') < sortedIds(b.officerIds).join(',')
}

const runStateDp = (
  lockedIds: readonly string[],
  lockedTotals: Readonly<Record<string, number>>,
  candidates: readonly Candidate[],
  targets: readonly AdventureAutoTargetInput[],
  capacity: number,
): ScoredSelection => {
  const targetSkillIds = targets.map((t) => t.skillId)
  const targetLevels = targets.map((t) => t.targetLevel)

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
      if (!existing || betterForSameKey(newState, existing)) {
        dp.set(key, newState)
      }
    }
  }

  let best: DpState = initialState
  for (const state of dp.values()) {
    if (betterForSameKey(state, best)) best = state
  }

  return scoreSelection(best.officerIds, best.totals, targets)
}

// ── 贪心求解（目标数过多导致状态空间超标时使用） ──

/**
 * 贪心算法：每次选择对未达成目标贡献最大的候选航海士。
 * 达标即停，不填充多余人数。
 */
const runGreedy = (
  lockedIds: readonly string[],
  lockedTotals: Readonly<Record<string, number>>,
  candidates: readonly Candidate[],
  targets: readonly AdventureAutoTargetInput[],
  capacity: number,
): ScoredSelection => {
  const selectedIds = [...lockedIds]
  const totals: Record<string, number> = { ...lockedTotals }
  const remaining = [...candidates]

  while (selectedIds.length < capacity && remaining.length > 0) {
    const unmet = new Set(
      targets.filter((t) => (totals[t.skillId] ?? 0) < t.targetLevel).map((t) => t.skillId),
    )

    // 全部达标，立即停止
    if (unmet.size === 0) break

    let bestIndex = 0
    let bestScore = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i]!
      let filled = 0
      for (const sid of Object.keys(c.contributions)) {
        if (unmet.has(sid)) filled += 1
      }
      // 分数 = 填补数 × 100 + 贡献技能总数（同分数时选覆盖面更广的）
      const score = filled * 100 + Object.keys(c.contributions).length
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }
    if (bestScore <= 0 && unmet.size === 0) {
      // 所有目标为 0 且没有候选有贡献：停止
      break
    }

    const best = remaining.splice(bestIndex, 1)[0]!
    selectedIds.push(best.officer.id)
    for (const [sid, lv] of Object.entries(best.contributions)) {
      totals[sid] = (totals[sid] ?? 0) + lv
    }
  }

  return scoreSelection(selectedIds, totals, targets)
}

// ── 输入校验 ──

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
        contributions[relation.skillId] =
          (contributions[relation.skillId] ?? 0) + relation.unlockLevel
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

export const solveAdventureTargets = (input: AdventureAutoSolveInput): AdventureAutoSolveResult => {
  const targets = validateTargets(input.targets)
  if (targets.length === 0) {
    return buildResult(
      {
        officerIds: [],
        totals: {},
        achievedTargetCount: 0,
        allTargetsComplete: false,
        overageTotal: 0,
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
    const overflowSelection = scoreSelection(lockedIds, lockedTotals, targets)
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

  const stateSpace = targets.reduce((product, t) => product * (t.targetLevel + 1), 1)
  const selection =
    stateSpace <= MAX_STATE_SPACE
      ? runStateDp(lockedIds, lockedTotals, candidates, targets, capacity)
      : runGreedy(lockedIds, lockedTotals, candidates, targets, capacity)
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
