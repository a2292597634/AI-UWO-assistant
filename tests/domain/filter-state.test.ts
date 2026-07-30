/**
 * Filter State Tests
 */

import { describe, it, expect } from 'vitest'
import {
  createEmptyFilterState,
  hasActiveFilters,
  toggleArrayFilter,
  setSearchText,
  setActiveFilter,
} from '../../miniprogram/domain/filter-state'

describe('createEmptyFilterState', () => {
  it('returns state with all filters empty', () => {
    const state = createEmptyFilterState()
    expect(state.searchText).toBe('')
    expect(state.selectedRarities).toEqual([])
    expect(state.selectedTypes).toEqual([])
    expect(state.selectedGenders).toEqual([])
    expect(state.selectedLanguages).toEqual([])
    expect(state.selectedJobs).toEqual([])
    expect(state.selectedSkillCategories).toEqual([])
    expect(state.activeFilter).toBe('all')
  })
})

describe('hasActiveFilters', () => {
  it('returns false for empty state', () => {
    expect(hasActiveFilters(createEmptyFilterState())).toBe(false)
  })

  it('returns true when rarity is selected', () => {
    const state = { ...createEmptyFilterState(), selectedRarities: ['rarity_5'] }
    expect(hasActiveFilters(state)).toBe(true)
  })

  it('returns true when type is selected', () => {
    const state = { ...createEmptyFilterState(), selectedTypes: ['type_class_1'] }
    expect(hasActiveFilters(state)).toBe(true)
  })

  it('returns true when gender is selected', () => {
    const state = { ...createEmptyFilterState(), selectedGenders: ['gender_m'] }
    expect(hasActiveFilters(state)).toBe(true)
  })

  it('returns true when language is selected', () => {
    const state = { ...createEmptyFilterState(), selectedLanguages: ['lang10'] }
    expect(hasActiveFilters(state)).toBe(true)
  })

  it('returns true when job is selected', () => {
    const state = { ...createEmptyFilterState(), selectedJobs: ['job_a'] }
    expect(hasActiveFilters(state)).toBe(true)
  })

  it('returns true when skill category is selected', () => {
    const state = {
      ...createEmptyFilterState(),
      selectedSkillCategories: ['cat_combat'],
    }
    expect(hasActiveFilters(state)).toBe(true)
  })

  it('returns true when active skill filter is not "all"', () => {
    const state = { ...createEmptyFilterState(), activeFilter: 'active' as const }
    expect(hasActiveFilters(state)).toBe(true)
  })

  it('returns true when passive skill filter is selected', () => {
    const state = { ...createEmptyFilterState(), activeFilter: 'passive' as const }
    expect(hasActiveFilters(state)).toBe(true)
  })

  it('returns true when searchText has non-whitespace content', () => {
    const state = { ...createEmptyFilterState(), searchText: 'test' }
    expect(hasActiveFilters(state)).toBe(true)
  })

  it('returns false when searchText is only whitespace', () => {
    const state = { ...createEmptyFilterState(), searchText: '   ' }
    expect(hasActiveFilters(state)).toBe(false)
  })
})

describe('toggleArrayFilter', () => {
  it('adds an ID if not present', () => {
    const result = toggleArrayFilter(['a', 'b'], 'c')
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('removes an ID if present', () => {
    const result = toggleArrayFilter(['a', 'b', 'c'], 'b')
    expect(result).toEqual(['a', 'c'])
  })

  it('handles empty array', () => {
    const result = toggleArrayFilter([], 'a')
    expect(result).toEqual(['a'])
  })

  it('does not mutate the input', () => {
    const arr: readonly string[] = ['a', 'b']
    const snapshot = [...arr]
    toggleArrayFilter(arr, 'c')
    expect(arr).toEqual(snapshot)
  })
})

describe('setSearchText', () => {
  it('returns same state if text unchanged', () => {
    const state = createEmptyFilterState()
    const result = setSearchText(state, '')
    expect(result).toBe(state)
  })

  it('returns new state when text changes', () => {
    const state = createEmptyFilterState()
    const result = setSearchText(state, 'test')
    expect(result).not.toBe(state)
    expect(result.searchText).toBe('test')
  })
})

describe('setActiveFilter', () => {
  it('returns same state if kind unchanged', () => {
    const state = createEmptyFilterState()
    const result = setActiveFilter(state, 'all')
    expect(result).toBe(state)
  })

  it('returns new state when kind changes', () => {
    const state = createEmptyFilterState()
    const result = setActiveFilter(state, 'active')
    expect(result).not.toBe(state)
    expect(result.activeFilter).toBe('active')
  })
})
