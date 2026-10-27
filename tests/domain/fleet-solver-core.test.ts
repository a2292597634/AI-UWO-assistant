import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import * as battle from '../../miniprogram/domain/battle-fleet-solver'
import * as adventure from '../../miniprogram/domain/adventure-fleet-solver'
import type { AdventureFleetOfficer } from '../../miniprogram/domain/adventure-fleet'
import {
  deriveAdventureOfficers,
  getAdventureSkillIdSet,
} from '../../miniprogram/domain/adventure-fleet'
import type {
  RuntimeCatalogEntry,
  RuntimeFleetOfficer,
  RuntimeSkill,
} from '../../miniprogram/contracts/runtime-data'

const require = createRequire(import.meta.url)
const catalog = require('../../miniprogram/generated/catalog.js') as RuntimeCatalogEntry[]
const skills = require('../../miniprogram/generated/skills.js') as Record<string, RuntimeSkill>
const fleetOfficers =
  require('../../miniprogram/subpkg-fleet/generated/fleet-officers.js') as RuntimeFleetOfficer[]

const makeOfficer = (id: string, levels: number[]): AdventureFleetOfficer => ({
  id,
  name: id,
  jobName: '',
  rarityName: 'S',
  portraitPath: '',
  visualGradeId: '',
  typeId: '',
  typeName: '',
  genderId: '',
  zone: null,
  adventureSkills: levels.flatMap((level, i) =>
    level ? [{ skillId: `s${i}`, level, unlockLevel: 1 }] : [],
  ),
})
const input = (officers: AdventureFleetOfficer[], levels = [10], capacity = 77) => ({
  officers,
  targets: levels.map((targetLevel, i) => ({ skillId: `s${i}`, targetLevel })),
  capacity,
  lockedOfficerIds: [],
  excludedOfficerIds: [],
  currentOfficerIds: [],
})

describe('共用分批配隊搜索', () => {
  it.each([
    {
      name: '負數鎖定貢獻',
      data: {
        ...input(
          [makeOfficer('locked', [-1]), makeOfficer('a', [1]), makeOfficer('b', [1])],
          [1],
          3,
        ),
        lockedOfficerIds: ['locked'],
      },
      officerIds: ['a', 'b', 'locked'],
      beforeTargetLevels: { s0: 0 },
      targetProgress: [
        { skillId: 's0', targetLevel: 1, currentLevel: 1, difference: 0, reached: true },
      ],
    },
    {
      name: '負數候選貢獻',
      data: input(
        [makeOfficer('a', [-1, 1]), makeOfficer('b', [1, 0]), makeOfficer('c', [1, 0])],
        [1, 1],
        3,
      ),
      officerIds: ['a', 'b', 'c'],
      beforeTargetLevels: { s0: 0, s1: 0 },
      targetProgress: [
        { skillId: 's0', targetLevel: 1, currentLevel: 1, difference: 0, reached: true },
        { skillId: 's1', targetLevel: 1, currentLevel: 1, difference: 0, reached: true },
      ],
    },
  ])(
    '$name 回退前保留全部正向同類候選及舊版完整 Proposal',
    ({ data, officerIds, beforeTargetLevels, targetProgress }) => {
      // 以下完整結果已逐項對照修正 import 的原始舊版 Solver，測試不依賴診斷目錄。
      const expected = {
        source: 'adventure',
        shipId: null,
        baseStateFingerprint: null,
        officerIds,
        beforeTargetLevels,
        achievedTargetCount: targetProgress.length,
        allTargetsComplete: true,
        targetProgress,
        overageTotal: 0,
        constraints: [],
        canApply: true,
      }
      expect(adventure.solveAdventureTargets(data)).toEqual(expected)
      const calculation = adventure.createAdventureTargetCalculation(data)
      let step = calculation.next()
      while (!step.done) step = calculation.next()
      expect(step.value).toEqual(expected)
    },
  )

  it('戰鬥與冒險均提供可中斷的增量入口', () => {
    expect(battle.createBattleTargetCalculation).toBeTypeOf('function')
    expect(adventure.createAdventureTargetCalculation).toBeTypeOf('function')
  })

  it('保留足量相同貢獻者、真實溢出和 ID 次序，完整結果與同步入口相同', () => {
    const data = input(
      Array.from({ length: 40 }, (_, i) => makeOfficer(`p${String(i).padStart(2, '0')}`, [3])),
    )
    const calculation = adventure.createAdventureTargetCalculation(data)
    const progress = []
    let step = calculation.next()
    while (!step.done) {
      progress.push(step.value)
      step = calculation.next()
    }
    expect(step.value).toEqual(adventure.solveAdventureTargets(data))
    expect(step.value.officerIds).toEqual(['p00', 'p01', 'p02', 'p03'])
    expect(step.value.overageTotal).toBe(2)
    expect(step.value.targetProgress[0].currentLevel).toBe(12)
    expect(progress[0].phase).toBe('preparing')
    expect(progress[progress.length - 1]?.phase).toBe('finalizing')
    expect(progress.some((p) => p.phase === 'searching' && p.processedCandidates > 0)).toBe(true)
    for (const p of progress) {
      expect(p.processedCandidates).toBeLessThanOrEqual(p.totalCandidates)
      expect(p.candidateFraction).toBeGreaterThanOrEqual(0)
      expect(p.candidateFraction).toBeLessThanOrEqual(1)
    }
  })

  it('單一候選內的大狀態快照可分批中斷，並保持候選處理計數單調', () => {
    const data = input(
      Array.from({ length: 50 }, (_, i) =>
        makeOfficer(
          `p${String(i).padStart(2, '0')}`,
          Array.from({ length: 5 }, (_, j) => (i % 5 === j ? 1 : 0)),
        ),
      ),
      [10, 10, 10, 10, 10],
    )
    const calculation = adventure.createAdventureTargetCalculation(data)
    let previous = -1
    let partial = false
    for (const progress of calculation) {
      expect(progress.processedCandidates).toBeGreaterThanOrEqual(previous)
      if (
        progress.phase === 'searching' &&
        progress.candidateFraction > 0 &&
        progress.candidateFraction < 1
      )
        partial = true
      previous = progress.processedCandidates
      if (partial) break
    }
    expect(partial).toBe(true)
  })

  it('特殊前綴和標點維持舊版排序，鎖定者不被同類壓縮移除', () => {
    const data = {
      ...input([makeOfficer('a', [1]), makeOfficer('a!', [1]), makeOfficer('z', [0])], [1]),
      lockedOfficerIds: ['z'],
    }
    expect(adventure.solveAdventureTargets(data).officerIds).toEqual(['a!', 'z'])
  })

  it('真實五目標冒險在預算內完成，完整 Proposal 與分批計算一致', () => {
    const data = {
      ...input(deriveAdventureOfficers(catalog, getAdventureSkillIdSet(skills))),
      targets: [
        'skill_skill201981',
        'skill_skill202001',
        'skill_skillT0091',
        'skill_skillT0096',
        'skill_skill200921',
      ].map((skillId) => ({ skillId, targetLevel: 10 })),
    }
    const start = performance.now()
    const result = adventure.solveAdventureTargets(data)
    // 正式獨立基準目標為兩秒；測試並行環境保留額外負載容忍，仍能攔截原版約四十秒回歸。
    expect(performance.now() - start).toBeLessThan(5000)
    const calculation = adventure.createAdventureTargetCalculation(data)
    let step = calculation.next()
    while (!step.done) step = calculation.next()
    expect(step.value).toEqual(result)
    expect(result.officerIds).toHaveLength(33)
    expect(result.targetProgress.map((p) => p.currentLevel)).toEqual([10, 10, 10, 10, 10])
    expect(result.overageTotal).toBe(0)
    expect(result.constraints).toEqual([])
  }, 15000)

  it('真實五目標戰鬥完整 Proposal 與分批計算一致並保持容量', () => {
    const data = {
      officers: fleetOfficers,
      targets: [
        'skill_skill210346',
        'skill_skill500886',
        'skill_skill500936',
        'skill_skill501046',
        'skill_skill501066',
      ].map((skillId) => ({ skillId, targetLevel: 10 })),
      lockedOfficerIds: [],
      excludedOfficerIds: [],
      occupiedByOtherShips: [],
      currentOfficerIds: [],
      capacity: 11,
    }
    const start = performance.now()
    const result = battle.solveBattleTargets(data)
    expect(performance.now() - start).toBeLessThan(3000)
    const calculation = battle.createBattleTargetCalculation(data)
    let step = calculation.next()
    while (!step.done) step = calculation.next()
    expect(step.value).toEqual(result)
    expect(result.officerIds).toHaveLength(11)
    expect(result.targetProgress.map((p) => p.currentLevel)).toEqual([10, 10, 0, 0, 10])
    expect(result.overageTotal).toBe(0)
  }, 10000)

  it('少量獨立全子集枚舉確認達標後人數、溢出與 ID 的順序', () => {
    const officers = [
      makeOfficer('a', [2, 0]),
      makeOfficer('b', [0, 2]),
      makeOfficer('c', [1, 1]),
      makeOfficer('d', [3, 3]),
      makeOfficer('e', [2, 2]),
    ]
    for (const levels of [
      [2, 2],
      [3, 3],
      [4, 4],
    ]) {
      const selections = []
      for (let mask = 0; mask < 2 ** officers.length; mask++) {
        const selected = officers.filter((_, i) => (mask & (1 << i)) !== 0)
        if (selected.length > 3) continue
        const totals = [0, 0]
        for (const o of selected)
          for (const s of o.adventureSkills) totals[Number(s.skillId.slice(1))] += s.level
        if (totals.some((v, i) => v < levels[i])) continue
        selections.push({
          ids: selected.map((o) => o.id),
          overage: totals.reduce((n, v, i) => n + v - levels[i], 0),
          totals,
        })
      }
      selections.sort(
        (a, b) =>
          a.ids.length - b.ids.length ||
          a.overage - b.overage ||
          (a.ids.join(',') < b.ids.join(',') ? -1 : 1),
      )
      const result = adventure.solveAdventureTargets(input(officers, levels, 3))
      expect(result.officerIds).toEqual(selections[0].ids)
      expect(result.overageTotal).toBe(selections[0].overage)
      expect(result.targetProgress.map((p) => p.currentLevel)).toEqual(selections[0].totals)
    }
  })
})
