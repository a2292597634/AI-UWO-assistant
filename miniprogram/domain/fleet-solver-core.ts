/** 進度只計算實際參與搜索的候選；candidateFraction 是目前候選的已處理比例。 */
export interface FleetSolveProgress {
  phase: 'preparing' | 'searching' | 'finalizing'
  processedCandidates: number
  totalCandidates: number
  candidateFraction: number
}

export type FleetCalculation<T> = Generator<FleetSolveProgress, T, void>

interface Target {
  skillId: string
  targetLevel: number
}

interface Candidate {
  officer: { id: string }
  contributions: Readonly<Record<string, number>>
}

interface Selection {
  officerIds: string[]
  totals: Record<string, number>
  achievedTargetCount: number
  allTargetsComplete: boolean
  overageTotal: number
  remainingDeficitTotal: number
  completionScore: number
}

interface State {
  key: number
  slot: number
  count: number
  mask: Uint32Array
  overage: number
}

/** 保持原有 DP／貪心分界；分批只改變調度，不改變搜索精度。 */
const MAX_STATE_SPACE = 200_000
const BATCH_SIZE = 512

export const finishFleetCalculation = <T>(calculation: FleetCalculation<T>): T => {
  let step = calculation.next()
  while (!step.done) step = calculation.next()
  return step.value
}

const score = (
  ids: readonly string[],
  totals: Record<string, number>,
  targets: readonly Target[],
): Selection => {
  let achievedTargetCount = 0
  let overageTotal = 0
  let remainingDeficitTotal = 0
  let completionScore = 0
  for (const t of targets) {
    const level = totals[t.skillId] ?? 0
    if (level >= t.targetLevel) achievedTargetCount++
    overageTotal += Math.max(level - t.targetLevel, 0)
    remainingDeficitTotal += Math.max(t.targetLevel - level, 0)
    completionScore += Math.min(level, t.targetLevel) / t.targetLevel
  }
  return {
    officerIds: [...ids].sort(),
    totals,
    achievedTargetCount,
    allTargetsComplete: achievedTargetCount === targets.length,
    overageTotal,
    remainingDeficitTotal,
    completionScore,
  }
}

const better = (a: Selection, b: Selection): boolean => {
  if (a.achievedTargetCount !== b.achievedTargetCount)
    return a.achievedTargetCount > b.achievedTargetCount
  if (a.remainingDeficitTotal !== b.remainingDeficitTotal)
    return a.remainingDeficitTotal < b.remainingDeficitTotal
  if (a.completionScore !== b.completionScore) return a.completionScore > b.completionScore
  if (a.allTargetsComplete !== b.allTargetsComplete) return a.allTargetsComplete
  if (a.allTargetsComplete && a.officerIds.length !== b.officerIds.length)
    return a.officerIds.length < b.officerIds.length
  if (a.overageTotal !== b.overageTotal) return a.overageTotal < b.overageTotal
  if (a.officerIds.length !== b.officerIds.length) return a.officerIds.length < b.officerIds.length
  return a.officerIds.join(',') < b.officerIds.join(',')
}

const add = (
  totals: Readonly<Record<string, number>>,
  candidate: Candidate,
): Record<string, number> => {
  const result = { ...totals }
  for (const [id, value] of Object.entries(candidate.contributions))
    result[id] = (result[id] ?? 0) + value
  return result
}

const progress = (
  phase: FleetSolveProgress['phase'],
  processedCandidates: number,
  totalCandidates: number,
  candidateFraction = 0,
): FleetSolveProgress => ({ phase, processedCandidates, totalCandidates, candidateFraction })

/** 同向量只保留足以填滿容量或全部相關目標的最早 ID，仍逐一處理保留者。 */
const representatives = (
  candidates: readonly Candidate[],
  targets: readonly Target[],
  freeSlots: number,
): Candidate[] => {
  const counts = new Map<string, number>()
  return candidates.filter((candidate) => {
    const vector = targets.map((t) => candidate.contributions[t.skillId] ?? 0)
    // 非整數／負數輸入沿用原搜索，不套用只適用正整數資料的壓縮證明。
    if (!vector.every((v) => Number.isInteger(v) && v >= 0)) return true
    const needed = Math.max(
      ...vector.map((v, i) => (v > 0 ? Math.ceil(targets[i].targetLevel / v) : 0)),
    )
    const key = vector.join(',')
    const count = counts.get(key) ?? 0
    counts.set(key, count + 1)
    return count < Math.min(Math.ceil(freeSlots), needed)
  })
}

function* greedy(
  lockedIds: readonly string[],
  lockedTotals: Readonly<Record<string, number>>,
  candidates: readonly Candidate[],
  targets: readonly Target[],
  capacity: number,
): FleetCalculation<Selection> {
  let current = score(lockedIds, { ...lockedTotals }, targets)
  const remaining = [...candidates]
  // 入選者不再重評，才算完整處理；其餘候選到搜索結束時一併完成。
  // 不把每輪重複掃描冒充新候選，也不在首輪掃描後提前回報全部完成。
  let processed = 0
  while (current.officerIds.length < capacity && remaining.length && !current.allTargetsComplete) {
    let best = current
    let bestIndex = -1
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]
      const next = score(
        [...current.officerIds, candidate.officer.id],
        add(current.totals, candidate),
        targets,
      )
      if (better(next, best)) {
        best = next
        bestIndex = i
      }
      if ((i + 1) % BATCH_SIZE === 0) yield progress('searching', processed, candidates.length)
    }
    if (bestIndex < 0) break
    remaining.splice(bestIndex, 1)
    current = best
    processed++
    yield progress('searching', processed, candidates.length)
  }
  yield progress('finalizing', candidates.length, candidates.length)
  return current
}

/** 小數等非標準輸入沿用字串鍵，避免數值編碼碰撞改變歷史結果。 */
function* genericDp(
  lockedIds: readonly string[],
  lockedTotals: Readonly<Record<string, number>>,
  candidates: readonly Candidate[],
  targets: readonly Target[],
  capacity: number,
): FleetCalculation<Selection> {
  const seed = score(lockedIds, { ...lockedTotals }, targets)
  const key = (s: Selection) =>
    targets.map((t) => Math.min(s.totals[t.skillId] ?? 0, t.targetLevel)).join(',')
  const dp = new Map([[key(seed), seed]])
  for (let c = 0; c < candidates.length; c++) {
    const candidate = candidates[c]
    const snapshot = [...dp.values()]
    for (let i = 0; i < snapshot.length; i++) {
      const state = snapshot[i]
      if (state.officerIds.length < capacity) {
        const next = score(
          [...state.officerIds, candidate.officer.id],
          add(state.totals, candidate),
          targets,
        )
        const k = key(next)
        const old = dp.get(k)
        if (
          !old ||
          next.officerIds.length < old.officerIds.length ||
          (next.officerIds.length === old.officerIds.length &&
            (next.overageTotal < old.overageTotal ||
              (next.overageTotal === old.overageTotal &&
                next.officerIds.join(',') < old.officerIds.join(','))))
        )
          dp.set(k, next)
      }
      if ((i + 1) % BATCH_SIZE === 0)
        yield progress('searching', c, candidates.length, (i + 1) / snapshot.length)
    }
    yield progress('searching', c + 1, candidates.length)
  }
  let best = seed
  let i = 0
  yield progress('finalizing', candidates.length, candidates.length)
  for (const state of dp.values()) {
    if (better(state, best)) best = state
    if (++i % BATCH_SIZE === 0) yield progress('finalizing', candidates.length, candidates.length)
  }
  return best
}

/** 不建立候選集合便能比較，避免失敗轉移的陣列配置；使用平台已有的 Uint32Array。 */
const compareMasks = (a: Uint32Array, b: Uint32Array, addedWord = -1, addedBit = 0): number => {
  for (let i = 0; i < a.length; i++) {
    const value = i === addedWord ? (a[i] | addedBit) >>> 0 : a[i]
    if (value !== b[i]) return value > b[i] ? 1 : -1
  }
  return 0
}

export function* calculateFleetSelection(
  lockedIds: readonly string[],
  lockedTotals: Readonly<Record<string, number>>,
  allCandidates: readonly Candidate[],
  targets: readonly Target[],
  capacity: number,
): FleetCalculation<Selection> {
  const seed = score(lockedIds, { ...lockedTotals }, targets)
  if (seed.allTargetsComplete || lockedIds.length >= capacity || !allCandidates.length) {
    yield progress('finalizing', 0, 0)
    return seed
  }
  const space = targets.reduce((n, t) => n * (t.targetLevel + 1), 1)
  // 貪心的中間排序與 DP 不同，保留其完整候選序列。
  const allIds = [...lockedIds, ...allCandidates.map((c) => c.officer.id)]
  const canonicalIds =
    new Set(allIds).size === allIds.length && allIds.every((id) => /^[a-zA-Z0-9_-]+$/.test(id))
  // 壓縮的證明要求完整輸入皆為非負整數；負數會增加其他同類候選的必要數量。
  // 必須先檢查鎖定總量及所有候選，不能等截取後才決定回退。
  const nonnegativeIntegerInput =
    targets.every(
      (t) =>
        Number.isInteger(t.targetLevel) &&
        Number.isInteger(lockedTotals[t.skillId] ?? 0) &&
        (lockedTotals[t.skillId] ?? 0) >= 0,
    ) &&
    allCandidates.every((c) =>
      targets.every(
        (t) =>
          Number.isInteger(c.contributions[t.skillId] ?? 0) &&
          (c.contributions[t.skillId] ?? 0) >= 0,
      ),
    )
  const candidates =
    space <= MAX_STATE_SPACE && canonicalIds && nonnegativeIntegerInput
      ? representatives(allCandidates, targets, capacity - lockedIds.length)
      : [...allCandidates]
  yield progress('searching', 0, candidates.length)
  if (space > MAX_STATE_SPACE)
    return yield* greedy(lockedIds, lockedTotals, candidates, targets, capacity)
  if (!nonnegativeIntegerInput) {
    return yield* genericDp(lockedIds, lockedTotals, candidates, targets, capacity)
  }
  const levels = targets.map((t) => t.targetLevel)
  const strides: number[] = []
  let stride = 1
  let seedKey = 0
  for (let i = 0; i < targets.length; i++) {
    strides.push(stride)
    seedKey += Math.min(lockedTotals[targets[i].skillId] ?? 0, levels[i]) * stride
    stride *= levels[i] + 1
  }
  // 固定候選順序下，以高位代表較早 ID；等人數時較大位元集合正好對應舊版字串排序。
  // 特殊標點／重複 ID 走通用路徑，避免改變原有 join(',') 的比較語義。
  const ids = [...lockedIds, ...candidates.map((c) => c.officer.id)].sort()
  if (new Set(ids).size !== ids.length || ids.some((id) => !/^[a-zA-Z0-9_-]+$/.test(id))) {
    return yield* genericDp(lockedIds, lockedTotals, candidates, targets, capacity)
  }
  const bits = new Map(
    ids.map((id, i) => [id, { word: Math.floor(i / 32), bit: (1 << (31 - (i % 32))) >>> 0 }]),
  )
  const seedMask = new Uint32Array(Math.ceil(ids.length / 32))
  for (const id of lockedIds) {
    const { word, bit } = bits.get(id)!
    seedMask[word] |= bit
  }
  const initial: State = {
    key: seedKey,
    slot: 0,
    count: lockedIds.length,
    mask: seedMask,
    overage: seed.overageTotal,
  }
  const byKey: (State | undefined)[] = new Array(space)
  byKey[seedKey] = initial
  const states = [initial]
  const transitions = new Map<string, { keys: Int32Array; overages: Float64Array }>()
  for (let c = 0; c < candidates.length; c++) {
    const candidate = candidates[c]
    const { word, bit } = bits.get(candidate.officer.id)!
    const vector = targets.map((t) => candidate.contributions[t.skillId] ?? 0)
    const vectorKey = vector.join(',')
    let transition = transitions.get(vectorKey)
    if (!transition) {
      transition = { keys: new Int32Array(space).fill(-1), overages: new Float64Array(space) }
      // 限制不同向量的快取數，避免極端多樣候選把記憶體擴大為候選數乘狀態空間。
      if (transitions.size >= 16) transitions.delete(transitions.keys().next().value!)
      transitions.set(vectorKey, transition)
    }
    const snapshot = states.slice()
    for (let s = 0; s < snapshot.length; s++) {
      const state = snapshot[s]
      if (state.count < capacity) {
        let key = transition.keys[state.key]
        if (key < 0) {
          key = 0
          let extra = 0
          for (let i = 0; i < levels.length; i++) {
            const value = (Math.floor(state.key / strides[i]) % (levels[i] + 1)) + vector[i]
            key += Math.min(value, levels[i]) * strides[i]
            extra += Math.max(value - levels[i], 0)
          }
          transition.keys[state.key] = key
          transition.overages[state.key] = extra
        }
        const overage = state.overage + transition.overages[state.key]
        const old = byKey[key]
        const count = state.count + 1
        // 先排除大多數無收益轉移，僅可能替換時建立持久選人位元集合。
        if (!old || count < old.count || (count === old.count && overage <= old.overage)) {
          if (
            !old ||
            count < old.count ||
            overage < old.overage ||
            compareMasks(state.mask, old.mask, word, bit) > 0
          ) {
            const mask = state.mask.slice()
            mask[word] |= bit
            const next: State = { key, slot: old?.slot ?? states.length, count, mask, overage }
            byKey[key] = next
            states[next.slot] = next
          }
        }
      }
      if ((s + 1) % BATCH_SIZE === 0)
        yield progress('searching', c, candidates.length, (s + 1) / snapshot.length)
    }
    yield progress('searching', c + 1, candidates.length)
  }
  yield progress('finalizing', candidates.length, candidates.length)
  let bestState = initial
  let achieved = seed.achievedTargetCount
  let deficit = seed.remainingDeficitTotal
  let completion = seed.completionScore
  for (let s = 0; s < states.length; s++) {
    const state = states[s]
    let nextAchieved = 0
    let nextDeficit = 0
    let nextCompletion = 0
    for (let i = 0; i < levels.length; i++) {
      const level = Math.floor(state.key / strides[i]) % (levels[i] + 1)
      if (level >= levels[i]) nextAchieved++
      nextDeficit += levels[i] - level
      nextCompletion += level / levels[i]
    }
    const wins =
      nextAchieved !== achieved
        ? nextAchieved > achieved
        : nextDeficit !== deficit
          ? nextDeficit < deficit
          : nextCompletion !== completion
            ? nextCompletion > completion
            : nextAchieved === levels.length && state.count !== bestState.count
              ? state.count < bestState.count
              : state.overage !== bestState.overage
                ? state.overage < bestState.overage
                : state.count !== bestState.count
                  ? state.count < bestState.count
                  : compareMasks(state.mask, bestState.mask) > 0
    if (wins) {
      bestState = state
      achieved = nextAchieved
      deficit = nextDeficit
      completion = nextCompletion
    }
    if ((s + 1) % BATCH_SIZE === 0)
      yield progress('finalizing', candidates.length, candidates.length)
  }
  // 鍵只截斷搜索維度；最終回傳按實際選人重建，完整保留真實溢出。
  const selected = new Set(
    ids.filter((id) => {
      const { word, bit } = bits.get(id)!
      return (bestState.mask[word] & bit) !== 0
    }),
  )
  let totals = { ...lockedTotals }
  for (const candidate of candidates)
    if (selected.has(candidate.officer.id)) totals = add(totals, candidate)
  return score([...selected], totals, targets)
}
