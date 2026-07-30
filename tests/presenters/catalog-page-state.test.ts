/**
 * Catalog Page State Tests
 */

import { describe, it, expect } from 'vitest'
import {
  initPageState,
  getFirstPage,
  hasMore,
  getNextPage,
  getFilterCount,
  setFilteredResults,
  resetToFull,
} from '../../miniprogram/presenters/catalog-page-state'
import type { CatalogPageStateInstance } from '../../miniprogram/presenters/catalog-page-state'
import type { CatalogRowView } from '../../miniprogram/presenters/catalog-presenter'
import type { RuntimeCatalogEntry } from '../../miniprogram/contracts/runtime-data'
import { PAGE_SIZE } from '../../miniprogram/presenters/catalog-presenter'

// ── Helpers ──

const makeRow = (id: string): CatalogRowView => {
  const entry: RuntimeCatalogEntry = {
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
    activeSkills: [],
    passiveSkills: [],
    searchAliases: [],
  }
  return { ...entry, activeSkillIcons: {}, passiveSkillIcons: {} }
}

const makeState = (rows?: CatalogRowView[]): CatalogPageStateInstance => ({
  _enrichedCatalog: rows ?? [],
  _filteredAll: rows ?? [],
})

// ── Tests ──

describe('initPageState', () => {
  it('sets both enriched and filtered arrays', () => {
    const state = makeState()
    const rows = [makeRow('001'), makeRow('002')]
    initPageState(state, rows)

    expect(state._enrichedCatalog).toBe(rows)
    expect(state._filteredAll).toBe(rows)
  })
})

describe('getFirstPage', () => {
  it('returns first PAGE_SIZE rows', () => {
    const rows = Array.from({ length: 50 }, (_, i) => makeRow(String(i)))
    const state = makeState(rows)

    const firstPage = getFirstPage(state)
    expect(firstPage).toHaveLength(PAGE_SIZE)
    expect(firstPage[0]!.id).toBe('0')
  })

  it('returns all rows when total is less than PAGE_SIZE', () => {
    const rows = [makeRow('001'), makeRow('002')]
    const state = makeState(rows)

    const firstPage = getFirstPage(state)
    expect(firstPage).toHaveLength(2)
  })
})

describe('hasMore', () => {
  it('returns true when more rows exist', () => {
    const rows = Array.from({ length: 50 }, (_, i) => makeRow(String(i)))
    const state = makeState(rows)
    expect(hasMore(state, 30)).toBe(true)
  })

  it('returns false when all rows shown', () => {
    const rows = [makeRow('001'), makeRow('002')]
    const state = makeState(rows)
    expect(hasMore(state, 2)).toBe(false)
  })
})

describe('getNextPage', () => {
  it('returns next PAGE_SIZE rows from current position', () => {
    const rows = Array.from({ length: 50 }, (_, i) => makeRow(String(i)))
    const state = makeState(rows)

    const next = getNextPage(state, PAGE_SIZE)
    // 50 rows total, 30 shown → 20 remaining
    expect(next).toHaveLength(20)
    expect(next[0]!.id).toBe('30')
  })
})

describe('getFilterCount', () => {
  it('returns the length of filtered results', () => {
    const rows = [makeRow('001'), makeRow('002'), makeRow('003')]
    const state = makeState(rows)
    expect(getFilterCount(state)).toBe(3)
  })
})

describe('setFilteredResults', () => {
  it('replaces the filtered array without affecting enriched', () => {
    const all = [makeRow('001'), makeRow('002'), makeRow('003')]
    const state = makeState(all)
    const filtered = [makeRow('001')]

    setFilteredResults(state, filtered)
    expect(state._filteredAll).toBe(filtered)
    expect(state._enrichedCatalog).toBe(all)
  })
})

describe('resetToFull', () => {
  it('resets filtered results to the full enriched catalog', () => {
    const all = [makeRow('001'), makeRow('002'), makeRow('003')]
    const state = makeState(all)
    setFilteredResults(state, [makeRow('001')])
    expect(state._filteredAll).toHaveLength(1)

    resetToFull(state)
    expect(state._filteredAll).toBe(all)
    expect(state._filteredAll).toHaveLength(3)
  })
})
