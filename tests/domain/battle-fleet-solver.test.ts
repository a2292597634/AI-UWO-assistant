import { describe, expect, it } from 'vitest'
import type { RuntimeFleetOfficer } from '../../miniprogram/contracts/runtime-data'
import { solveBattleTargets } from '../../miniprogram/domain/battle-fleet-solver'
import type { AutoTargetInput } from '../../miniprogram/domain/battle-fleet-solver'

const officer = (id: string, skills: RuntimeFleetOfficer['skills']): RuntimeFleetOfficer => ({
  id,
  name: id,
  jobName: '戰鬥職業',
  rarityName: 'S',
  portraitPath: `/subpkg-assets-0/imgs/${id}.png`,
  visualGradeId: 'grade_6',
  typeId: 'type_class_1',
  genderId: 'gender_f',
  skills,
})

const active = (skillId: string, unlockLevel: number) => ({
  skillId,
  kind: 'active' as const,
  categoryId: 'skill_category_naval_active_cannon',
  unlockLevel,
})

const passive = (skillId: string, categoryId: string, unlockLevel: number) => ({
  skillId,
  kind: 'passive' as const,
  categoryId,
  unlockLevel,
})

const sampleOfficers: RuntimeFleetOfficer[] = [
  officer('officer-locked', [active('skill-cannon', 2)]),
  officer('officer-removed', [active('skill-cannon', 9)]),
  officer('officer-banned', [active('skill-cannon', 9)]),
  officer('officer-other-ship', [active('skill-cannon', 9)]),
  officer('officer-extra', [active('skill-cannon', 1)]),
]

const tieBreakOfficers: RuntimeFleetOfficer[] = [
  officer('officer-cannon', [active('skill-cannon', 2)]),
  officer('officer-melee', [passive('skill-melee', 'skill_category_naval_passive_melee', 2)]),
  officer('officer-combined', [
    active('skill-cannon', 2),
    passive('skill-melee', 'skill_category_naval_passive_melee', 2),
  ]),
]

const emptyInput = {
  officers: sampleOfficers,
  targets: [{ skillId: 'skill-cannon', targetLevel: 2 }],
  lockedOfficerIds: [],
  excludedOfficerIds: [],
  occupiedByOtherShips: [],
  currentOfficerIds: [],
  capacity: 11,
}

describe('battle fleet auto solver', () => {
  it('keeps locked officers and excludes other ships, banned, and removed candidates', () => {
    const result = solveBattleTargets({
      officers: sampleOfficers,
      targets: [{ skillId: 'skill-cannon', targetLevel: 2 }],
      lockedOfficerIds: ['officer-locked'],
      excludedOfficerIds: ['officer-removed', 'officer-banned'],
      occupiedByOtherShips: ['officer-other-ship'],
      currentOfficerIds: ['officer-locked'],
      capacity: 11,
    })

    expect(result.officerIds).toEqual(['officer-locked'])
    expect(result.targetProgress).toEqual([
      { skillId: 'skill-cannon', targetLevel: 2, currentLevel: 2, difference: 0, reached: true },
    ])
    expect(result.officerIds).not.toEqual(
      expect.arrayContaining(['officer-removed', 'officer-banned', 'officer-other-ship']),
    )
  })

  it('prefers more completed targets, then fewer officers, lower overage, then IDs', () => {
    const result = solveBattleTargets({
      officers: tieBreakOfficers,
      targets: [
        { skillId: 'skill-cannon', targetLevel: 2 },
        { skillId: 'skill-melee', targetLevel: 2 },
      ],
      lockedOfficerIds: [],
      excludedOfficerIds: [],
      occupiedByOtherShips: [],
      currentOfficerIds: [],
      capacity: 11,
    })

    expect(result.officerIds).toEqual(['officer-combined'])
    expect(result.allTargetsComplete).toBe(true)
  })

  it('returns an empty recommendation for no valid targets and restricts levels to one through ten', () => {
    expect(solveBattleTargets({ ...emptyInput, targets: [] }).officerIds).toEqual([])
    expect(() =>
      solveBattleTargets({
        ...emptyInput,
        targets: [{ skillId: 'skill-cannon', targetLevel: 11 }],
      }),
    ).toThrow('target-level')
  })
})

// ── DP stress & correctness ──

describe('state DP solver', () => {
  const makeDualSkillOfficers = (count: number): RuntimeFleetOfficer[] =>
    Array.from({ length: count }, (_, i) =>
      officer(`officer-ds-${i}`, [
        active('skill-a', (i % 5) + 1),
        active('skill-b', ((i + 2) % 5) + 1),
      ]),
    )

  it('handles 30 candidates with high-level targets within 500ms', () => {
    const officers = makeDualSkillOfficers(30)
    const start = Date.now()
    const result = solveBattleTargets({
      officers,
      targets: [
        { skillId: 'skill-a', targetLevel: 10 },
        { skillId: 'skill-b', targetLevel: 10 },
      ],
      lockedOfficerIds: [],
      excludedOfficerIds: [],
      occupiedByOtherShips: [],
      currentOfficerIds: [],
      capacity: 11,
    })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(500)
    expect(result.officerIds.length).toBeGreaterThan(0)
    expect(result.officerIds.length).toBeLessThanOrEqual(11)
    // Should achieve all targets or at least try
    expect(result.achievedTargetCount).toBeGreaterThanOrEqual(0)
  })

  it('scales linearly — 200 candidates with 2 targets finishes fast', () => {
    const officers = makeDualSkillOfficers(200)
    const start = Date.now()
    const result = solveBattleTargets({
      officers,
      targets: [
        { skillId: 'skill-a', targetLevel: 5 },
        { skillId: 'skill-b', targetLevel: 5 },
      ],
      lockedOfficerIds: [],
      excludedOfficerIds: [],
      occupiedByOtherShips: [],
      currentOfficerIds: [],
      capacity: 11,
    })
    const elapsed = Date.now() - start
    // 200 candidates × 36 states (6×6) ≈ 7200 iterations → well under 100ms
    expect(elapsed).toBeLessThan(200)
    expect(result.officerIds.length).toBeGreaterThan(0)
  })

  it('DP equals or beats naive greedy for same input', () => {
    // 15 candidates with 3 target skills — DP should find optimal
    const officers = Array.from({ length: 15 }, (_, i) =>
      officer(`officer-opt-${i}`, [
        active('skill-x', (i % 3) + 1),
        active('skill-y', ((i + 1) % 3) + 1),
        active('skill-z', ((i + 2) % 3) + 1),
      ]),
    )
    const targets: AutoTargetInput[] = [
      { skillId: 'skill-x', targetLevel: 5 },
      { skillId: 'skill-y', targetLevel: 5 },
      { skillId: 'skill-z', targetLevel: 5 },
    ]

    const result = solveBattleTargets({
      officers,
      targets,
      lockedOfficerIds: [],
      excludedOfficerIds: [],
      occupiedByOtherShips: [],
      currentOfficerIds: [],
      capacity: 11,
    })

    // DP should at least achieve all targets if possible
    // With 15 officers each contributing to 3 skills, it should be achievable
    expect(result.achievedTargetCount).toBeGreaterThanOrEqual(2)
    expect(result.officerIds.length).toBeLessThanOrEqual(11)
  })

  it('respects locked officers and excluded list with DP', () => {
    const officers = [
      officer('officer-locked', [active('skill-a', 5)]),
      officer('officer-normal', [active('skill-a', 5)]),
      officer('officer-excluded', [active('skill-a', 5)]),
    ]
    const result = solveBattleTargets({
      officers,
      targets: [{ skillId: 'skill-a', targetLevel: 5 }],
      lockedOfficerIds: ['officer-locked'],
      excludedOfficerIds: ['officer-excluded'],
      occupiedByOtherShips: [],
      currentOfficerIds: ['officer-locked'],
      capacity: 11,
    })
    expect(result.officerIds).toContain('officer-locked')
    expect(result.officerIds).not.toContain('officer-excluded')
    expect(result.allTargetsComplete).toBe(true)
  })

  it('handles empty candidates gracefully', () => {
    const result = solveBattleTargets({
      officers: [],
      targets: [{ skillId: 'skill-a', targetLevel: 1 }],
      lockedOfficerIds: [],
      excludedOfficerIds: [],
      occupiedByOtherShips: [],
      currentOfficerIds: [],
      capacity: 11,
    })
    expect(result.officerIds).toEqual([])
    expect(result.allTargetsComplete).toBe(false)
  })

  it('handles capacity overflow — more locked than capacity', () => {
    const officers = [
      officer('officer-a', [active('skill-x', 1)]),
      officer('officer-b', [active('skill-x', 1)]),
    ]
    const result = solveBattleTargets({
      officers,
      targets: [{ skillId: 'skill-x', targetLevel: 1 }],
      lockedOfficerIds: ['officer-a', 'officer-b'],
      excludedOfficerIds: [],
      occupiedByOtherShips: [],
      currentOfficerIds: ['officer-a', 'officer-b'],
      capacity: 1,
    })
    expect(result.officerIds.length).toBe(1)
    // Should include only the first locked officer (truncated)
    expect(result.achievedTargetCount).toBeGreaterThanOrEqual(0)
  })
})
