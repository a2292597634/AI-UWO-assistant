import { describe, expect, it } from 'vitest'
import type { RuntimeFleetOfficer, RuntimeSkill } from '../../miniprogram/contracts/runtime-data'
import type { FleetState } from '../../miniprogram/contracts/battle-fleet'
import {
  addOfficerToShip,
  createFleetState,
  removeOfficerFromShip,
  updateShipTargets,
} from '../../miniprogram/domain/battle-fleet'
import { buildBattleFleetPageData } from '../../miniprogram/presenters/battle-fleet-presenter'

const officers: RuntimeFleetOfficer[] = [
  {
    id: 'officer-a',
    name: '甲',
    jobName: '炮術家',
    rarityName: 'S',
    portraitPath: '/subpkg-assets-0/imgs/officer-a.png',
    visualGradeId: 'grade_6',
    typeId: 'type_class_1',
    genderId: 'gender_f',
    skills: [
      {
        skillId: 'skill-main',
        kind: 'active',
        categoryId: 'skill_category_naval_active_cannon',
        unlockLevel: 5,
      },
    ],
  },
  {
    id: 'officer-c',
    name: '丙',
    jobName: '炮術家',
    rarityName: 'A',
    portraitPath: '/subpkg-assets-0/imgs/officer-c.png',
    visualGradeId: 'grade_5',
    typeId: 'type_class_2',
    genderId: 'gender_m',
    skills: [
      {
        skillId: 'skill-main',
        kind: 'active',
        categoryId: 'skill_category_naval_active_cannon',
        unlockLevel: 7,
      },
    ],
  },
  {
    id: 'officer-p',
    name: '乙',
    jobName: '肉搏家',
    rarityName: 'A',
    portraitPath: '/subpkg-assets-0/imgs/officer-p.png',
    visualGradeId: 'grade_4',
    typeId: 'type_class_3',
    genderId: 'gender_f',
    skills: [
      {
        skillId: 'skill-target-only',
        kind: 'passive',
        categoryId: 'skill_category_naval_passive_boarding',
        unlockLevel: 3,
      },
    ],
  },
]

const skills: Record<string, RuntimeSkill> = {
  'skill-main': {
    id: 'skill-main',
    n: '主砲強化',
    cat: 'skill_category_naval_active_cannon',
    cn: '海戰主動-砲擊',
    ip: '/skill-main.png',
    d: '',
    li: '',
  },
  'skill-target-only': {
    id: 'skill-target-only',
    n: '衝破目標',
    cat: 'skill_category_naval_passive_boarding',
    cn: '海戰被動-衝破',
    ip: '/skill-target-only.png',
    d: '',
    li: '',
  },
}

const dictionaries = {
  rarities: [],
  types: [],
  genders: [],
  jobs: [],
  nationalities: [],
  languages: [],
  cities: [],
  requirements: [],
  skillCategories: [],
}

const emptyFilters = {
  kind: 'all' as const,
  categoryId: null,
  searchText: '',
}

const stateWithCurrentShip = (): FleetState => {
  let state = createFleetState()
  state = addOfficerToShip(state, 'ship-1', 'officer-a').state
  state = addOfficerToShip(state, 'ship-1', 'officer-c').state
  return updateShipTargets(state, 'ship-1', [
    { id: 'target-main', skillId: 'skill-main', targetLevel: 10 },
    { id: 'target-only', skillId: 'skill-target-only', targetLevel: 3 },
  ]).state
}

describe('battle fleet presenter', () => {
  it('projects contributors as portrait-ready rows and preserves zero target rows', () => {
    const view = buildBattleFleetPageData(
      stateWithCurrentShip(),
      officers,
      skills,
      dictionaries,
      'ship-1',
      emptyFilters,
    )
    const row = view.skillSummary.find((item) => item.skillId === 'skill-main')!

    expect(row.contributors.map((item) => item.officerId)).toEqual(['officer-a', 'officer-c'])
    expect(row.contributors[0]!.portraitPath).toMatch(/^\/subpkg-assets-\d\/imgs\/officer-/)
    expect(view.skillSummary.find((item) => item.skillId === 'skill-target-only')).toMatchObject({
      totalLevel: 0,
    })
  })

  it('exposes only the current ship editor while keeping all seven overview tabs', () => {
    const view = buildBattleFleetPageData(
      createFleetState(),
      officers,
      skills,
      dictionaries,
      'ship-3',
      emptyFilters,
    )

    expect(view.shipTabs).toHaveLength(7)
    expect(view.currentShip.id).toBe('ship-3')
    expect(view.currentShip.slots).toHaveLength(11)
    expect(view.fleetOverview).toHaveLength(7)
  })

  it('narrows the second skill-filter level to the selected skill type', () => {
    const view = buildBattleFleetPageData(
      createFleetState(),
      officers,
      skills,
      dictionaries,
      'ship-1',
      { kind: 'active', categoryId: null, searchText: '' },
    )

    expect(view.skillCategories.every((item) => item.id.includes('naval_active'))).toBe(true)
  })

  it('projects the selected skill contribution as visible candidate text', () => {
    const view = buildBattleFleetPageData(
      stateWithCurrentShip(),
      officers,
      skills,
      dictionaries,
      'ship-1',
      emptyFilters,
      'skill-main',
    )

    expect(view.manualCandidates.find((item) => item.id === 'officer-a')).toMatchObject({
      skillContributionLabel: '主砲強化 +Lv.5',
    })
  })

  it('explains cross-ship movement and exposes current-ship exclusions', () => {
    let state = createFleetState()
    state = addOfficerToShip(state, 'ship-2', 'officer-p').state
    state = addOfficerToShip(state, 'ship-1', 'officer-a').state
    state = removeOfficerFromShip(state, 'ship-1', 'officer-a').state

    const view = buildBattleFleetPageData(
      state,
      officers,
      skills,
      dictionaries,
      'ship-1',
      emptyFilters,
      'skill-target-only',
    )

    expect(view.manualCandidates.find((item) => item.id === 'officer-p')).toMatchObject({
      selectionHint: '第 2 船 · 點擊後移動',
    })
    expect(view.currentShipExcludedOfficers).toEqual([
      expect.objectContaining({ id: 'officer-a', name: '甲' }),
    ])
  })
})
