/**
 * Filter State — Pure Functions
 *
 * Immutable state management for catalog filter state. No dependency on
 * wx, Page, filesystem, or generated data.
 */

import type { CatalogFilterState, SkillKindFilter } from '../contracts/filter-state'

// ── Factory ──

export function createEmptyFilterState(): CatalogFilterState {
  return {
    searchText: '',
    selectedRarities: [],
    selectedTypes: [],
    selectedGenders: [],
    selectedLanguages: [],
    selectedJobs: [],
    selectedSkillCategories: [],
    activeFilter: 'all',
  }
}

// ── Queries ──

/** Check whether any filter is active. */
export function hasActiveFilters(state: Readonly<CatalogFilterState>): boolean {
  return (
    state.selectedRarities.length > 0 ||
    state.selectedTypes.length > 0 ||
    state.selectedGenders.length > 0 ||
    state.selectedLanguages.length > 0 ||
    state.selectedJobs.length > 0 ||
    state.selectedSkillCategories.length > 0 ||
    state.activeFilter !== 'all' ||
    state.searchText.trim() !== ''
  )
}

// ── Immutable Updates ──

/** Toggle a value in a multi-select field. Returns new array. */
export function toggleArrayFilter(arr: readonly string[], id: string): string[] {
  const idx = arr.indexOf(id)
  if (idx >= 0) {
    return arr.filter((_, i) => i !== idx)
  }
  return [...arr, id]
}

/** Replace a multi-select field. Returns same array if unchanged. */
export function setArrayFilter(current: readonly string[], next: readonly string[]): string[] {
  if (arraysEqual(current, next)) return current as string[]
  return [...next]
}

/** Set the skill kind filter. */
export function setActiveFilter(
  state: Readonly<CatalogFilterState>,
  kind: SkillKindFilter,
): CatalogFilterState {
  if (state.activeFilter === kind) return state
  return { ...state, activeFilter: kind }
}

/** Set search text. */
export function setSearchText(
  state: Readonly<CatalogFilterState>,
  text: string,
): CatalogFilterState {
  if (state.searchText === text) return state
  return { ...state, searchText: text }
}

// ── Helpers ──

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}
