import { describe, expect, it } from 'vitest'
import type { RuntimeFleetOfficer, RuntimeSkill } from '../../miniprogram/contracts/runtime-data'
import {
  addOfficerToShip,
  assignSkillToFirstOpenTarget,
  banOfficer,
  createFleetState,
  excludeOfficerFromShip,
  filterBattleSkills,
  getOfficerStatus,
  lockOfficer,
  moveOfficerToShip,
  removeOfficerFromShip,
  recalculateShip,
  setShipMode,
  summarizeShipSkills,
  unbanOfficer,
  unlockOfficer,
  updateShipTargets,
} from '../../miniprogram/domain/battle-fleet'

const relation = (
  skillId: string,
  kind: 'active' | 'passive',
  categoryId: string,
  unlockLevel: number,
) => ({ skillId, kind, categoryId, unlockLevel })

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

const sampleOfficers: Record<string, RuntimeFleetOfficer> = {
  'officer-a': officer('officer-a', [
    relation('skill-main', 'active', 'skill_category_naval_active_cannon', 5),
    relation('skill-cannon-passive', 'passive', 'skill_category_naval_passive_cannon', 2),
    relation('skill-trade', 'passive', 'skill_category_trade_expertise', 9),
  ]),
  'officer-b': officer('officer-b', [
    relation('skill-other', 'passive', 'skill_category_naval_passive_melee', 4),
  ]),
  'officer-c': officer('officer-c', [
    relation('skill-main', 'active', 'skill_category_naval_active_cannon', 7),
  ]),
}

const sampleSkills: Record<string, RuntimeSkill> = {
  'skill-main': {
    id: 'skill-main',
    n: '主砲強化',
    cat: 'skill_category_naval_active_cannon',
    cn: '海戰主動-砲擊',
    ip: '/skill-main.png',
    d: '',
    li: '',
  },
  'skill-cannon-passive': {
    id: 'skill-cannon-passive',
    n: '炮擊防護',
    cat: 'skill_category_naval_passive_cannon',
    cn: '海戰被動-砲擊',
    ip: '/skill-cannon-passive.png',
    d: '',
    li: '',
  },
  'skill-other': {
    id: 'skill-other',
    n: '肉搏強化',
    cat: 'skill_category_naval_passive_melee',
    cn: '海戰被動-肉搏',
    ip: '/skill-other.png',
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
  'skill-trade': {
    id: 'skill-trade',
    n: '交易專精',
    cat: 'skill_category_trade_expertise',
    cn: '交易專精',
    ip: '/skill-trade.png',
    d: '',
    li: '',
  },
}

describe('battle fleet state', () => {
  it('creates seven ships and rejects the twelfth officer on one ship', () => {
    const state = createFleetState()
    let filled = state

    for (let index = 0; index < 11; index += 1) {
      filled = addOfficerToShip(filled, 'ship-1', `officer-${index}`).state
    }

    const result = addOfficerToShip(filled, 'ship-1', 'officer-11')

    expect(filled.ships).toHaveLength(7)
    expect(result.error).toBe('ship-full')
  })

  it('rejects an officer already used by another ship', () => {
    const state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-1').state

    expect(addOfficerToShip(state, 'ship-2', 'officer-1').error).toBe('officer-occupied')
  })

  it('requires explicit confirmation before moving an occupied officer', () => {
    const state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-1').state

    expect(addOfficerToShip(state, 'ship-2', 'officer-1')).toMatchObject({
      error: 'officer-occupied',
      fromShipId: 'ship-1',
    })
  })

  it('marks the source ship for review without recalculating other ships', () => {
    const state = addOfficerToShip(
      addOfficerToShip(createFleetState(), 'ship-1', 'officer-1').state,
      'ship-2',
      'officer-2',
    ).state
    const next = moveOfficerToShip(state, 'ship-1', 'ship-2', 'officer-1').state

    expect(next.ships.find((ship) => ship.id === 'ship-1')).toMatchObject({
      officerIds: [],
      needsReview: true,
    })
    expect(next.ships.find((ship) => ship.id === 'ship-2')!.officerIds).toEqual([
      'officer-2',
      'officer-1',
    ])
  })

  it('does not allow banning an occupied or locked officer', () => {
    const state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-1').state

    expect(banOfficer(state, 'officer-1').error).toBe('officer-occupied')
    const locked = lockOfficer(state, 'ship-1', 'officer-1').state
    expect(banOfficer(locked, 'officer-1').error).toBe('officer-locked')
    expect(unlockOfficer(locked, 'ship-1', 'officer-1').state.ships[0]!.lockedOfficerIds).toEqual(
      [],
    )

    const banned = banOfficer(state, 'officer-free').state
    expect(unbanOfficer(banned, 'officer-free').state.bannedOfficerIds).toEqual([])
  })

  it('removes the current officer and records the removal for auto recalculation', () => {
    const state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-1').state
    const next = removeOfficerFromShip(state, 'ship-1', 'officer-1').state

    expect(next.ships[0]!.officerIds).toEqual([])
    expect(next.ships[0]!.removedOfficerIds).toEqual(['officer-1'])
  })

  it('creates an empty Lv.1 auto target and rejects invalid or duplicate targets', () => {
    const auto = setShipMode(createFleetState(), 'ship-1', 'auto').state
    const targets = auto.ships[0]!.targets

    expect(targets).toEqual([{ id: 'ship-1-target-1', skillId: null, targetLevel: 1 }])
    expect(
      updateShipTargets(auto, 'ship-1', [{ id: 'a', skillId: 'skill-a', targetLevel: 11 }]).error,
    ).toBe('invalid-target-level')
    expect(
      updateShipTargets(auto, 'ship-1', [
        { id: 'a', skillId: 'skill-a', targetLevel: 1 },
        { id: 'b', skillId: 'skill-a', targetLevel: 2 },
      ]).error,
    ).toBe('duplicate-target')
  })

  it('assigns a selected skill to the first empty target or appends a target', () => {
    const auto = setShipMode(createFleetState(), 'ship-1', 'auto').state

    const filled = assignSkillToFirstOpenTarget(auto, 'ship-1', 'skill-cannon').state
    expect(filled.ships[0]!.targets).toEqual([
      { id: 'ship-1-target-1', skillId: 'skill-cannon', targetLevel: 1 },
    ])

    const appended = assignSkillToFirstOpenTarget(filled, 'ship-1', 'skill-melee').state
    expect(appended.ships[0]!.targets).toEqual([
      { id: 'ship-1-target-1', skillId: 'skill-cannon', targetLevel: 1 },
      { id: 'ship-1-target-2', skillId: 'skill-melee', targetLevel: 1 },
    ])
  })

  it('rejects assigning a skill already used by the current ship target list', () => {
    const auto = setShipMode(createFleetState(), 'ship-1', 'auto').state
    const filled = assignSkillToFirstOpenTarget(auto, 'ship-1', 'skill-cannon').state

    expect(assignSkillToFirstOpenTarget(filled, 'ship-1', 'skill-cannon').error).toBe(
      'duplicate-target',
    )
  })

  it('replaces only the current ship recommendation and preserves locked and other ships', () => {
    let state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-1').state
    state = lockOfficer(state, 'ship-1', 'officer-1').state
    state = addOfficerToShip(state, 'ship-2', 'officer-2').state
    const next = recalculateShip(state, 'ship-1', ['officer-1', 'officer-3']).state

    expect(next.ships.find((ship) => ship.id === 'ship-1')!.officerIds).toEqual([
      'officer-1',
      'officer-3',
    ])
    expect(next.ships.find((ship) => ship.id === 'ship-1')!.lockedOfficerIds).toEqual(['officer-1'])
    expect(next.ships.find((ship) => ship.id === 'ship-2')!.officerIds).toEqual(['officer-2'])
  })

  it('excludes an unlocked officer from the current ship and bans them globally', () => {
    const state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-1').state
    const result = excludeOfficerFromShip(state, 'ship-1', 'officer-1')

    expect(result.error).toBeUndefined()
    expect(result.state.ships[0]!.officerIds).toEqual([])
    expect(result.state.ships[0]!.removedOfficerIds).toEqual(['officer-1'])
    expect(result.state.bannedOfficerIds).toEqual(['officer-1'])
  })

  it('rejects excluding a locked officer without mutation', () => {
    let state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-1').state
    state = lockOfficer(state, 'ship-1', 'officer-1').state
    const result = excludeOfficerFromShip(state, 'ship-1', 'officer-1')

    expect(result.error).toBe('officer-locked')
    expect(result.state).toBe(state)
  })

  it('rejects excluding an officer not on the selected ship', () => {
    const state = createFleetState()
    const result = excludeOfficerFromShip(state, 'ship-1', 'officer-missing')

    expect(result.error).toBe('officer-not-found')
  })

  it('returns one mutually exclusive officer availability status', () => {
    let state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-locked').state
    state = lockOfficer(state, 'ship-1', 'officer-locked').state
    state = addOfficerToShip(state, 'ship-2', 'officer-occupied').state
    state = banOfficer(state, 'officer-banned').state

    expect(getOfficerStatus(state, 'ship-1', 'officer-locked')).toBe('locked')
    expect(getOfficerStatus(state, 'ship-1', 'officer-occupied')).toBe('occupied')
    expect(getOfficerStatus(state, 'ship-1', 'officer-banned')).toBe('banned')
    expect(getOfficerStatus(state, 'ship-1', 'officer-available')).toBe('available')
  })
})

describe('battle skill query', () => {
  it('filters only battle active/passive skills through three levels', () => {
    const result = filterBattleSkills(sampleOfficers, sampleSkills, {
      kind: 'passive',
      categoryId: 'skill_category_naval_passive_cannon',
      searchText: '炮',
    })

    expect(result.map((item) => item.id)).toEqual(['skill-cannon-passive'])
  })

  it('does not return trade skills from the shared selector', () => {
    const result = filterBattleSkills(sampleOfficers, sampleSkills, {
      kind: 'all',
      categoryId: null,
      searchText: '',
    })

    expect(result.map((item) => item.id)).not.toContain('skill-trade')
  })
})

describe('ship skill summary', () => {
  it('sums unlockLevel, keeps values above ten, sorts, and shows target-only Lv.0', () => {
    const result = summarizeShipSkills(['officer-a', 'officer-c'], sampleOfficers, sampleSkills, {
      'skill-target-only': 3,
    })
    const main = result.find((item) => item.skillId === 'skill-main')!

    expect(main).toMatchObject({ skillId: 'skill-main', totalLevel: 12 })
    expect(main.contributorOfficerIds).toEqual(['officer-a', 'officer-c'])
    expect(result.find((item) => item.skillId === 'skill-target-only')).toMatchObject({
      totalLevel: 0,
      contributorOfficerIds: [],
    })
  })
})
