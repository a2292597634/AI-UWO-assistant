import { describe, expect, it } from 'vitest'
import { updateShipTargets, createFleetState } from '../../miniprogram/domain/battle-fleet'
import { buildAdventureFleetPageData } from '../../miniprogram/presenters/adventure-fleet-presenter'
import type { RuntimeSkill } from '../../miniprogram/contracts/runtime-data'

const skill = (id: string): RuntimeSkill => ({
  id,
  n: id,
  cat: 'skill_category_adventure',
  cn: '冒險',
  ip: '',
  d: '',
  li: '',
})

const buildStateWithTargets = (targets: FleetState['ships'][number]['targets']) => {
  const result = updateShipTargets(createFleetState(), 'ship-1', targets)
  if (result.error) throw new Error(result.error)
  return result.state
}

describe('adventure fleet presenter target state', () => {
  it('keeps Lv.0 tracking targets, hides empty placeholders, and disables calculation', () => {
    const page = buildAdventureFleetPageData(
      buildStateWithTargets([
        { id: 'tracking', skillId: 'skill-track', targetLevel: 0 },
        { id: 'empty', skillId: null, targetLevel: 1 },
      ]),
      [],
      { 'skill-track': skill('skill-track') },
      '',
    )

    expect(page.targets).toEqual([
      expect.objectContaining({ skillId: 'skill-track', targetLevel: 0, isTracking: true }),
    ])
    expect(page.optimizationTargetCount).toBe(0)
    expect(page.canRecalculate).toBe(false)
  })

  it('enables calculation when a configured target is Lv.1 or higher', () => {
    const page = buildAdventureFleetPageData(
      buildStateWithTargets([{ id: 'goal', skillId: 'skill-goal', targetLevel: 2 }]),
      [],
      { 'skill-goal': skill('skill-goal') },
      '',
    )

    expect(page.optimizationTargetCount).toBe(1)
    expect(page.canRecalculate).toBe(true)
    expect(page.targets[0]).toMatchObject({ skillId: 'skill-goal', isTracking: false })
  })
})

type FleetState = ReturnType<typeof createFleetState>
