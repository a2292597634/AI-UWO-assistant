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

const EXACT_CANDIDATE_LIMIT = 40

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

const compareSelections = (
  left: ScoredSelection,
  right: ScoredSelection,
  targetCount: number,
): number => {
  if (left.achievedTargetCount !== right.achievedTargetCount) {
    return left.achievedTargetCount > right.achievedTargetCount ? 1 : -1
  }
  if (targetCount > 0 && left.allTargetsComplete && right.allTargetsComplete) {
    if (left.officerIds.length !== right.officerIds.length) {
      return left.officerIds.length < right.officerIds.length ? 1 : -1
    }
    if (left.overageTotal !== right.overageTotal) {
      return left.overageTotal < right.overageTotal ? 1 : -1
    }
  }
  const leftKey = left.officerIds.join('\u0000')
  const rightKey = right.officerIds.join('\u0000')
  if (leftKey === rightKey) return 0
  return leftKey < rightKey ? 1 : -1
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

const greedySelection = (
  lockedIds: readonly string[],
  lockedTotals: Readonly<Record<string, number>>,
  candidates: readonly Candidate[],
  targets: readonly AutoTargetInput[],
  capacity: number,
): ScoredSelection => {
  const selected = sortedIds(lockedIds)
  let totals: Record<string, number> = { ...lockedTotals }

  while (selected.length < capacity) {
    let best: { candidate: Candidate; selection: ScoredSelection; gain: number } | null = null
    const current = scoreSelection(selected, totals, targets)
    for (const candidate of candidates) {
      if (selected.includes(candidate.officer.id)) continue
      const nextTotals = addContribution(totals, candidate.contributions)
      const next = scoreSelection([...selected, candidate.officer.id], nextTotals, targets)
      const gain = next.achievedTargetCount - current.achievedTargetCount
      const deficitReduction = targets.reduce(
        (sum, target) =>
          sum +
          Math.max(target.targetLevel - (totals[target.skillId] ?? 0), 0) -
          Math.max(target.targetLevel - (nextTotals[target.skillId] ?? 0), 0),
        0,
      )
      const bestDeficitReduction = best
        ? targets.reduce(
            (sum, target) =>
              sum +
              Math.max(target.targetLevel - (totals[target.skillId] ?? 0), 0) -
              Math.max(target.targetLevel - (best!.selection.totals[target.skillId] ?? 0), 0),
            0,
          )
        : -1
      if (
        !best ||
        gain > best.gain ||
        (gain === best.gain && deficitReduction > bestDeficitReduction) ||
        (gain === best.gain &&
          deficitReduction === bestDeficitReduction &&
          candidate.officer.id < best.candidate.officer.id)
      ) {
        best = { candidate, selection: next, gain }
      }
    }
    if (
      !best ||
      (best.gain === 0 && best.selection.officerIds.length > 0 && current.allTargetsComplete)
    ) {
      break
    }
    selected.push(best.candidate.officer.id)
    totals = best.selection.totals
    if (best.selection.allTargetsComplete) break
  }
  return scoreSelection(selected, totals, targets)
}

const maxReachableCount = (
  totals: Readonly<Record<string, number>>,
  remaining: readonly Candidate[],
  targets: readonly AutoTargetInput[],
): number => {
  const upper = { ...totals }
  for (const candidate of remaining) {
    for (const [skillId, level] of Object.entries(candidate.contributions)) {
      upper[skillId] = (upper[skillId] ?? 0) + level
    }
  }
  return targets.reduce(
    (count, target) => count + ((upper[target.skillId] ?? 0) >= target.targetLevel ? 1 : 0),
    0,
  )
}

const exactSelection = (
  lockedIds: readonly string[],
  lockedTotals: Readonly<Record<string, number>>,
  candidates: readonly Candidate[],
  targets: readonly AutoTargetInput[],
  capacity: number,
  seeded: ScoredSelection,
): ScoredSelection => {
  let best = seeded

  const visit = (start: number, selected: string[], totals: Record<string, number>): void => {
    const current = scoreSelection(selected, totals, targets)
    if (compareSelections(current, best, targets.length) > 0) best = current

    if (selected.length >= capacity || start >= candidates.length) return
    if (maxReachableCount(totals, candidates.slice(start), targets) < best.achievedTargetCount) {
      return
    }
    if (best.allTargetsComplete && selected.length >= best.officerIds.length) return

    for (let index = start; index < candidates.length; index += 1) {
      if (selected.length >= capacity) break
      const candidate = candidates[index]!
      visit(
        index + 1,
        [...selected, candidate.officer.id],
        addContribution(totals, candidate.contributions),
      )
    }
  }

  visit(0, [...lockedIds], { ...lockedTotals })
  return best
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

  const seeded = greedySelection(lockedIds, lockedTotals, candidates, targets, capacity)
  const selection =
    candidates.length <= EXACT_CANDIDATE_LIMIT
      ? exactSelection(lockedIds, lockedTotals, candidates, targets, capacity, seeded)
      : seeded
  return buildResult(selection, targets)
}
