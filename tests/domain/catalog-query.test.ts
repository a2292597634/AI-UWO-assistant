/**
 * Catalog Query Engine Tests
 *
 * Comprehensive coverage of the queryCatalog() pure function.
 */

import { describe, it, expect } from 'vitest'
import { queryCatalog } from '../../miniprogram/domain/catalog-query'
import type { RuntimeCatalogEntry, RuntimeSkill } from '../../miniprogram/contracts/runtime-data'
import type { CatalogFilterState } from '../../miniprogram/contracts/filter-state'

// ── Fixtures ──

const makeEntry = (id: string, overrides?: Partial<RuntimeCatalogEntry>): RuntimeCatalogEntry => ({
  id,
  name: `航海士${id}`,
  rarityId: 'rarity_4',
  rarityName: 'A',
  rarityClass: 'a',
  visualGradeId: 'grade_4',
  typeId: 'type_class_1',
  typeName: '冒險',
  genderId: 'gender_m',
  genderLabel: '男性',
  jobId: 'job_test',
  jobName: '測試職業',
  portraitPath: `/subpkg-assets-0/imgs/${id}.png`,
  languages: ['lang10'],
  activeSkills: ['skill_a1'],
  passiveSkills: ['skill_p1'],
  searchAliases: [],
  ...overrides,
})

const makeSkills = (): Record<string, RuntimeSkill> => ({
  skill_a1: {
    id: 'skill_a1',
    n: '攻擊',
    cat: 'cat_combat',
    cn: '戰鬥',
    ip: '/a.png',
    d: '',
    li: '',
  },
  skill_a2: {
    id: 'skill_a2',
    n: '治療',
    cat: 'cat_heal',
    cn: '治療',
    ip: '/b.png',
    d: '',
    li: '',
  },
  skill_p1: {
    id: 'skill_p1',
    n: '防禦',
    cat: 'cat_def',
    cn: '防禦',
    ip: '/c.png',
    d: '',
    li: '',
  },
  skill_p2: {
    id: 'skill_p2',
    n: '航海',
    cat: 'cat_nav',
    cn: '航海',
    ip: '/d.png',
    d: '',
    li: '',
  },
})

const emptyState: CatalogFilterState = {
  searchText: '',
  selectedRarities: [],
  selectedTypes: [],
  selectedGenders: [],
  selectedLanguages: [],
  selectedJobs: [],
  selectedSkillCategories: [],
  activeFilter: 'all',
  selectedSkillId: null,
}

// ── Tests ──

describe('queryCatalog', () => {
  // ── No filters ──

  it('returns all records when no filter is active', () => {
    const catalog = [
      makeEntry('001', { rarityId: 'rarity_5' }),
      makeEntry('002', { rarityId: 'rarity_3' }),
      makeEntry('003', { rarityId: 'rarity_2' }),
    ]
    const result = queryCatalog(catalog, makeSkills(), emptyState)
    expect(result).toHaveLength(3)
  })

  it('does not modify the input array', () => {
    const catalog = [makeEntry('001'), makeEntry('002')]
    const snapshot = JSON.stringify(catalog)
    queryCatalog(catalog, makeSkills(), emptyState)
    expect(JSON.stringify(catalog)).toBe(snapshot)
  })

  it('returns an empty array for empty catalog', () => {
    const result = queryCatalog([], makeSkills(), emptyState)
    expect(result).toEqual([])
    expect(Array.isArray(result)).toBe(true)
  })

  // ── Rarity (OR) ──

  it('filters by rarity — OR logic within rarity selections', () => {
    const catalog = [
      makeEntry('001', { rarityId: 'rarity_5' }),
      makeEntry('002', { rarityId: 'rarity_3' }),
      makeEntry('003', { rarityId: 'rarity_2' }),
    ]
    const state: CatalogFilterState = {
      ...emptyState,
      selectedRarities: ['rarity_5', 'rarity_2'],
    }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(2)
    expect(result.map((o) => o.id)).toEqual(['001', '003'])
  })

  // ── Type (OR) ──

  it('filters by type — OR logic within type selections', () => {
    const catalog = [
      makeEntry('001', { typeId: 'type_class_1' }),
      makeEntry('002', { typeId: 'type_class_2' }),
      makeEntry('003', { typeId: 'type_class_3' }),
    ]
    const state: CatalogFilterState = {
      ...emptyState,
      selectedTypes: ['type_class_1', 'type_class_3'],
    }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(2)
  })

  // ── Gender (OR) ──

  it('filters by gender — OR logic', () => {
    const catalog = [
      makeEntry('001', { genderId: 'gender_m' }),
      makeEntry('002', { genderId: 'gender_f' }),
    ]
    const state: CatalogFilterState = {
      ...emptyState,
      selectedGenders: ['gender_f'],
    }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('002')
  })

  // ── Language (AND — must have ALL selected) ──

  it('filters by language — AND logic (must have ALL selected languages)', () => {
    const catalog = [
      makeEntry('001', { languages: ['lang10', 'lang30'] }),
      makeEntry('002', { languages: ['lang10'] }),
      makeEntry('003', { languages: ['lang30'] }),
    ]
    const state: CatalogFilterState = {
      ...emptyState,
      selectedLanguages: ['lang10', 'lang30'],
    }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('001')
  })

  it('handles entries with no languages when filtering by language', () => {
    const catalog = [
      makeEntry('001', { languages: ['lang10'] }),
      makeEntry('002', { languages: [] }),
    ]
    const state: CatalogFilterState = {
      ...emptyState,
      selectedLanguages: ['lang10'],
    }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('001')
  })

  // ── Job (OR) ──

  it('filters by job — OR logic', () => {
    const catalog = [
      makeEntry('001', { jobId: 'job_a' }),
      makeEntry('002', { jobId: 'job_b' }),
      makeEntry('003', { jobId: 'job_c' }),
    ]
    const state: CatalogFilterState = {
      ...emptyState,
      selectedJobs: ['job_a', 'job_c'],
    }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(2)
  })

  // ── Cross-filter: AND between different categories ──

  it('combines different filter categories with AND logic', () => {
    const catalog = [
      makeEntry('001', { rarityId: 'rarity_5', genderId: 'gender_m' }),
      makeEntry('002', { rarityId: 'rarity_5', genderId: 'gender_f' }),
      makeEntry('003', { rarityId: 'rarity_3', genderId: 'gender_m' }),
    ]
    const state: CatalogFilterState = {
      ...emptyState,
      selectedRarities: ['rarity_5'],
      selectedGenders: ['gender_m'],
    }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('001')
  })

  // ── Skill category (AND) ──

  it('filters by skill categories — AND logic', () => {
    const catalog = [
      makeEntry('001', {
        activeSkills: ['skill_a1'],
        passiveSkills: ['skill_p1'],
      }),
      makeEntry('002', {
        activeSkills: ['skill_a1'],
        passiveSkills: [],
      }),
      makeEntry('003', {
        activeSkills: [],
        passiveSkills: ['skill_p1'],
      }),
    ]
    // skill_a1 → cat_combat, skill_p1 → cat_def
    // AND: both categories required
    const state: CatalogFilterState = {
      ...emptyState,
      selectedSkillCategories: ['cat_combat', 'cat_def'],
    }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('001')
  })

  it('missing skill reference does not crash', () => {
    const catalog = [
      makeEntry('001', {
        activeSkills: ['skill_nonexistent'],
        passiveSkills: [],
      }),
    ]
    const state: CatalogFilterState = {
      ...emptyState,
      selectedSkillCategories: ['cat_combat'],
    }
    // Should not throw
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(0)
    expect(Array.isArray(result)).toBe(true)
  })

  // ── Active/Passive skill filter ──

  it('active-only filter returns officers with active skills', () => {
    const catalog = [
      makeEntry('001', {
        activeSkills: ['skill_a1'],
        passiveSkills: [],
      }),
      makeEntry('002', {
        activeSkills: [],
        passiveSkills: ['skill_p1'],
      }),
      makeEntry('003', {
        activeSkills: ['skill_a2'],
        passiveSkills: ['skill_p2'],
      }),
    ]
    const state: CatalogFilterState = { ...emptyState, activeFilter: 'active' }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(2)
    expect(result.map((o) => o.id)).toEqual(['001', '003'])
  })

  it('passive-only filter returns officers with passive skills', () => {
    const catalog = [
      makeEntry('001', {
        activeSkills: ['skill_a1'],
        passiveSkills: [],
      }),
      makeEntry('002', {
        activeSkills: [],
        passiveSkills: ['skill_p1'],
      }),
    ]
    const state: CatalogFilterState = { ...emptyState, activeFilter: 'passive' }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('002')
  })

  it('active-only + category filter checks only active skills', () => {
    const catalog = [
      makeEntry('001', {
        activeSkills: ['skill_a1'], // cat_combat
        passiveSkills: ['skill_p1'], // cat_def
      }),
    ]
    const state: CatalogFilterState = {
      ...emptyState,
      activeFilter: 'active',
      selectedSkillCategories: ['cat_def'], // only on passive skills
    }
    const result = queryCatalog(catalog, makeSkills(), state)
    // Should NOT match because cat_def is only on passive, and active filter limits to active
    expect(result).toHaveLength(0)
  })

  it('passive-only + category filter checks only passive skills', () => {
    const catalog = [
      makeEntry('001', {
        activeSkills: ['skill_a1'], // cat_combat
        passiveSkills: ['skill_p1'], // cat_def
      }),
    ]
    const state: CatalogFilterState = {
      ...emptyState,
      activeFilter: 'passive',
      selectedSkillCategories: ['cat_def'],
    }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('001')
  })

  // ── Name search ──

  it('filters by name search (case-insensitive, substring)', () => {
    const catalog = [
      makeEntry('001', { name: '鄭成功' }),
      makeEntry('002', { name: '李華' }),
      makeEntry('003', { name: '成功號' }),
    ]
    const state: CatalogFilterState = { ...emptyState, searchText: '成功' }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(2)
  })

  it('name search with whitespace-only is treated as no filter', () => {
    const catalog = [makeEntry('001'), makeEntry('002')]
    const state: CatalogFilterState = { ...emptyState, searchText: '   ' }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(2)
  })

  it('empty search text does not filter', () => {
    const catalog = [makeEntry('001'), makeEntry('002')]
    const state: CatalogFilterState = { ...emptyState, searchText: '' }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(2)
  })

  it('search matches against searchAliases', () => {
    const catalog = [
      makeEntry('001', { name: '艾莉西亞', searchAliases: ['Alicia'] }),
      makeEntry('002', { name: '鮑伯', searchAliases: [] }),
    ]
    const state: CatalogFilterState = { ...emptyState, searchText: 'Alicia' }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('001')
  })

  // ── Name + other filters together ──

  it('name search AND rarity filter work together', () => {
    const catalog = [
      makeEntry('001', { name: '鄭成功', rarityId: 'rarity_5' }),
      makeEntry('002', { name: '鄭經', rarityId: 'rarity_3' }),
    ]
    const state: CatalogFilterState = {
      ...emptyState,
      searchText: '鄭',
      selectedRarities: ['rarity_5'],
    }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('001')
  })

  // ── Result ordering ──

  it('preserves input order after filtering', () => {
    const catalog = [
      makeEntry('003', { rarityId: 'rarity_3' }),
      makeEntry('001', { rarityId: 'rarity_5' }),
      makeEntry('002', { rarityId: 'rarity_3' }),
    ]
    const state: CatalogFilterState = {
      ...emptyState,
      selectedRarities: ['rarity_3'],
    }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result.map((o) => o.id)).toEqual(['003', '002'])
  })

  // ── Empty results ──

  it('returns empty array when no entries match', () => {
    const catalog = [makeEntry('001', { rarityId: 'rarity_5' })]
    const state: CatalogFilterState = {
      ...emptyState,
      selectedRarities: ['rarity_2'],
    }
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toEqual([])
    expect(Array.isArray(result)).toBe(true)
  })

  // ── Clear filter restores full results ──

  it('clearing filters restores all results', () => {
    const catalog = [makeEntry('001'), makeEntry('002'), makeEntry('003')]
    const filteredState: CatalogFilterState = {
      ...emptyState,
      selectedRarities: ['rarity_5'],
      searchText: 'test',
    }
    const filtered = queryCatalog(catalog, makeSkills(), filteredState)
    expect(filtered).toHaveLength(0)

    const cleared = queryCatalog(catalog, makeSkills(), emptyState)
    expect(cleared).toHaveLength(3)
  })

  // ── Edge cases ──

  it('handles undefined searchAliases gracefully', () => {
    const entry: RuntimeCatalogEntry = {
      ...makeEntry('001'),
      searchAliases: undefined as unknown as string[],
    }
    const catalog = [entry]
    const state: CatalogFilterState = { ...emptyState, searchText: 'test' }
    // Should not throw
    const result = queryCatalog(catalog, makeSkills(), state)
    expect(result).toHaveLength(0)
  })

  it('handles undefined activeSkills gracefully', () => {
    const entry: RuntimeCatalogEntry = {
      ...makeEntry('001'),
      activeSkills: undefined as unknown as string[],
    }
    const catalog = [entry]
    const state: CatalogFilterState = {
      ...emptyState,
      activeFilter: 'active',
    }
    // Should not throw
    expect(() => queryCatalog(catalog, makeSkills(), state)).not.toThrow()
  })
})
