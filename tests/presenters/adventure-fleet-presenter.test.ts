import { describe, expect, it } from 'vitest'
import { updateShipTargets, createFleetState } from '../../miniprogram/domain/battle-fleet'
import { addOfficerToShip, lockOfficer } from '../../miniprogram/domain/adventure-fleet'
import { buildAdventureFleetPageData } from '../../miniprogram/presenters/adventure-fleet-presenter'
import type { RuntimeSkill } from '../../miniprogram/contracts/runtime-data'
import type { AdventureFleetOfficer } from '../../miniprogram/domain/adventure-fleet'

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

const adventureOfficers: AdventureFleetOfficer[] = ['officer-a', 'officer-c'].map((id) => ({
  id,
  name: id,
  jobName: '冒險家',
  rarityName: 'A',
  portraitPath: `/${id}.png`,
  visualGradeId: 'grade_4',
  typeId: 'type_class_1',
  typeName: '冒險',
  genderId: 'gender_f',
  adventureSkills: [],
  zone: 'adventure',
}))

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

  it('shows locked officers first in each type zone', () => {
    let state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-a').state
    state = addOfficerToShip(state, 'ship-1', 'officer-c').state
    state = lockOfficer(state, 'ship-1', 'officer-c').state

    const page = buildAdventureFleetPageData(state, adventureOfficers, {}, '')

    expect(page.typeZones[0]?.officers.map((officer) => officer.id)).toEqual([
      'officer-c',
      'officer-a',
    ])
    expect(page.typeZones[0]?.officers[0]?.status).toBe('locked')
  })

  it('分離優化目標與技能追蹤', () => {
    const page = buildAdventureFleetPageData(
      buildStateWithTargets([
        { id: 'goal', skillId: 'skill-goal', targetLevel: 2 },
        { id: 'tracking', skillId: 'skill-track', targetLevel: 0 },
        { id: 'empty', skillId: null, targetLevel: 1 },
      ]),
      [],
      {
        'skill-goal': skill('skill-goal'),
        'skill-track': skill('skill-track'),
      },
      '',
    )

    expect(page.optimizationTargets).toEqual([
      expect.objectContaining({ id: 'goal', targetLevel: 2, isTracking: false }),
    ])
    expect(page.trackingTargets).toEqual([
      expect.objectContaining({ id: 'tracking', targetLevel: 0, isTracking: true }),
    ])
    expect(page.targets).toHaveLength(2)
  })
})

type FleetState = ReturnType<typeof createFleetState>
