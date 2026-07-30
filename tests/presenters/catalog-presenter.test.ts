/**
 * Catalog Presenter Tests
 */

import { describe, it, expect } from 'vitest'
import {
  enrichCatalogWithIcons,
  buildViewMaps,
  preservePortraitFails,
  createCatalogPageData,
  PAGE_SIZE,
} from '../../miniprogram/presenters/catalog-presenter'
import type { RuntimeCatalogEntry, RuntimeSkill } from '../../miniprogram/contracts/runtime-data'
import { createEmptyFilterState } from '../../miniprogram/domain/filter-state'

// ── Fixtures ──

const makeEntry = (id: string, overrides?: Partial<RuntimeCatalogEntry>): RuntimeCatalogEntry => ({
  id,
  name: `Test ${id}`,
  rarityId: 'rarity_5',
  rarityName: 'S',
  rarityClass: 's',
  typeId: 'type_class_1',
  typeName: '冒險',
  genderId: 'gender_m',
  genderLabel: '男性',
  jobId: 'job_test',
  jobName: '測試',
  portraitPath: '/a.png',
  languages: [],
  activeSkills: ['skill_a'],
  passiveSkills: ['skill_p'],
  searchAliases: [],
  ...overrides,
})

const makeSkills = (): Record<string, RuntimeSkill> => ({
  skill_a: { id: 'skill_a', n: '攻擊', cat: 'cat_combat', ip: '/icons/a.png' },
  skill_p: { id: 'skill_p', n: '防禦', cat: 'cat_def', ip: '/icons/p.png' },
})

// ── Tests ──

describe('enrichCatalogWithIcons', () => {
  it('adds activeSkillIcons and passiveSkillIcons to each entry', () => {
    const catalog = [makeEntry('001')]
    const result = enrichCatalogWithIcons(catalog, makeSkills())

    expect(result[0]!.activeSkillIcons).toEqual({ skill_a: '/icons/a.png' })
    expect(result[0]!.passiveSkillIcons).toEqual({ skill_p: '/icons/p.png' })
  })

  it('handles missing skill references with empty string', () => {
    const catalog = [makeEntry('001', { activeSkills: ['skill_nonexistent'] })]
    const result = enrichCatalogWithIcons(catalog, makeSkills())

    expect(result[0]!.activeSkillIcons).toEqual({ skill_nonexistent: '' })
  })

  it('handles empty skill arrays', () => {
    const catalog = [makeEntry('001', { activeSkills: [], passiveSkills: [] })]
    const result = enrichCatalogWithIcons(catalog, makeSkills())

    expect(result[0]!.activeSkillIcons).toEqual({})
    expect(result[0]!.passiveSkillIcons).toEqual({})
  })

  it('does not modify input entries', () => {
    const catalog = [makeEntry('001')]
    const snapshot = JSON.stringify(catalog)
    enrichCatalogWithIcons(catalog, makeSkills())
    expect(JSON.stringify(catalog)).toBe(snapshot)
  })

  it('returns same number of entries', () => {
    const catalog = [makeEntry('001'), makeEntry('002'), makeEntry('003')]
    const result = enrichCatalogWithIcons(catalog, makeSkills())
    expect(result).toHaveLength(3)
  })
})

describe('buildViewMaps', () => {
  it('creates boolean maps for all selected filters', () => {
    const state = {
      ...createEmptyFilterState(),
      selectedRarities: ['rarity_5'],
      selectedTypes: ['type_class_1'],
    }
    const maps = buildViewMaps(state)

    expect(maps.selectedRarityMap).toEqual({ rarity_5: true })
    expect(maps.selectedTypeMap).toEqual({ type_class_1: true })
    expect(maps.selectedGenderMap).toEqual({})
    expect(maps.selectedLanguageMap).toEqual({})
    expect(maps.selectedJobMap).toEqual({})
    expect(maps.selectedSkillCategoryMap).toEqual({})
  })

  it('handles multiple selected values', () => {
    const state = {
      ...createEmptyFilterState(),
      selectedGenders: ['gender_m', 'gender_f'],
    }
    const maps = buildViewMaps(state)
    expect(maps.selectedGenderMap).toEqual({ gender_m: true, gender_f: true })
  })

  it('returns empty maps for empty filter state', () => {
    const maps = buildViewMaps(createEmptyFilterState())
    expect(maps.selectedRarityMap).toEqual({})
    expect(maps.selectedTypeMap).toEqual({})
  })
})

describe('preservePortraitFails', () => {
  it('preserves portraitFail flags from old rows', () => {
    const newRows = [
      { ...makeEntry('001'), activeSkillIcons: {}, passiveSkillIcons: {} },
      { ...makeEntry('002'), activeSkillIcons: {}, passiveSkillIcons: {} },
    ]
    const oldRows = [
      { ...makeEntry('001'), activeSkillIcons: {}, passiveSkillIcons: {}, portraitFail: true },
    ]

    const result = preservePortraitFails(newRows, oldRows)
    expect(result[0]!.portraitFail).toBe(true)
    expect(result[1]!.portraitFail).toBeUndefined()
  })

  it('handles empty old rows', () => {
    const newRows = [
      { ...makeEntry('001'), activeSkillIcons: {}, passiveSkillIcons: {} },
    ]
    const result = preservePortraitFails(newRows, [])
    expect(result[0]!.portraitFail).toBeUndefined()
  })
})

describe('createCatalogPageData', () => {
  it('creates page data with correct structure', () => {
    const rows = [
      { ...makeEntry('001'), activeSkillIcons: {}, passiveSkillIcons: {} },
    ]
    const state = createEmptyFilterState()
    const data = createCatalogPageData(rows, 1, state, false)

    expect(data.visibleRows).toBe(rows)
    expect(data.filterCount).toBe(1)
    expect(data.hasMore).toBe(false)
    expect(data.activeFilter).toBe('all')
    expect(data.searchText).toBe('')
  })
})

describe('PAGE_SIZE', () => {
  it('is 30', () => {
    expect(PAGE_SIZE).toBe(30)
  })
})
