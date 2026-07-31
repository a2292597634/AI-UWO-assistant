import { getCatalog, getSkills, getDictionaries } from '../../runtime/main-data-store'
import { queryCatalog } from '../../domain/catalog-query'
import {
  hasActiveFilters,
  toggleArrayFilter,
  createEmptyFilterState,
} from '../../domain/filter-state'
import {
  enrichCatalogWithIcons,
  preservePortraitFails,
  buildViewMaps,
  PAGE_SIZE,
} from '../../presenters/catalog-presenter'
import { getDatasetString, isCatalogFilterField } from '../../contracts/page-events'

import type { CatalogRowView, CatalogViewMaps } from '../../presenters/catalog-presenter'
import type { CatalogFilterState, SkillKindFilter } from '../../contracts/filter-state'
import type { RuntimeSkill, RuntimeDictionaryItem } from '../../contracts/runtime-data'

// ── Icon mappings for filter chips ──

interface FilterOption {
  id: string
  name: string
  icon: string
}

const RARITY_ICONS: Record<string, string> = {
  rarity_5: '◆', // S — gold
  rarity_4: '◆', // A — silver
  rarity_3: '◆', // B — bronze
  rarity_2: '◆', // C — dark
}

const TYPE_ICONS: Record<string, string> = {
  type_class_1: '🧭', // 冒險
  type_class_2: '💰', // 交易
  type_class_3: '⚔️', // 戰鬥
}

const GENDER_ICONS: Record<string, string> = {
  gender_f: '♀',
  gender_m: '♂',
}

/** Attach icon glyphs to raw dictionary items for WXML rendering. */
function withIcons(items: RuntimeDictionaryItem[], map: Record<string, string>): FilterOption[] {
  return items.map((it) => ({ ...it, icon: map[it.id] ?? '' }))
}

// ── Helpers ──

/** Extract dataset from event target, typed safely. */
const eventDataset = (e: WechatMiniprogram.BaseEvent): Record<string, unknown> =>
  (e.currentTarget.dataset as unknown as Record<string, unknown>) ?? {}

// ── Page instance state (not reactive) ──

const _state = {
  _enrichedCatalog: [] as CatalogRowView[],
  _filteredAll: [] as CatalogRowView[],
  _skills: {} as Record<string, RuntimeSkill>,
  _filterState: createEmptyFilterState(),
}

// ── Page data type (explicit, so setData sees the right shape) ──

interface PageData extends CatalogViewMaps {
  tabs: string[]
  activeTab: number
  visibleRows: CatalogRowView[]
  filterCount: number
  hasActiveFilters: boolean
  hasMore: boolean
  // Filter options
  rarities: FilterOption[]
  types: FilterOption[]
  genders: FilterOption[]
  skillCategories: { id: string; name: string }[]
  languages: { id: string; name: string }[]
  jobs: { id: string; name: string }[]
  // Filter state fields
  activeFilter: SkillKindFilter
  selectedRarities: string[]
  selectedTypes: string[]
  selectedGenders: string[]
  selectedSkillCategories: string[]
  selectedLanguages: string[]
  selectedJobs: string[]
  searchText: string
}

// ── Page ──

Page({
  data: {
    tabs: ['航海士', '技能', '語言', '職業'],
    activeTab: 0,
    visibleRows: [],
    filterCount: 0,
    hasActiveFilters: false,
    hasMore: false,
    // Filter options
    rarities: [],
    types: [],
    genders: [],
    skillCategories: [],
    languages: [],
    jobs: [],
    // Filter state
    activeFilter: 'all',
    selectedRarities: [],
    selectedTypes: [],
    selectedGenders: [],
    selectedSkillCategories: [],
    selectedLanguages: [],
    selectedJobs: [],
    searchText: '',
    // Precomputed maps for WXML
    selectedRarityMap: {},
    selectedTypeMap: {},
    selectedGenderMap: {},
    selectedLanguageMap: {},
    selectedJobMap: {},
    selectedSkillCategoryMap: {},
  } as PageData,

  onLoad() {
    const catalog = getCatalog()
    const skills = getSkills()
    const dicts = getDictionaries()

    _state._skills = skills

    // Enrich catalog with precomputed skill icons
    const enriched = enrichCatalogWithIcons(catalog, skills)
    _state._enrichedCatalog = enriched
    _state._filteredAll = enriched

    // Build initial data
    const maps = buildViewMaps(_state._filterState)
    this.setData({
      visibleRows: enriched.slice(0, PAGE_SIZE),
      filterCount: enriched.length,
      hasMore: enriched.length > PAGE_SIZE,
      rarities: withIcons(dicts.rarities, RARITY_ICONS),
      types: withIcons(dicts.types, TYPE_ICONS),
      genders: withIcons(dicts.genders, GENDER_ICONS),
      skillCategories: dicts.skillCategories,
      languages: dicts.languages,
      jobs: dicts.jobs,
      ...maps,
    })
  },

  // ── Tab ──

  onTabTap(e: WechatMiniprogram.BaseEvent) {
    const idx = Number(eventDataset(e)['index'])
    if (!isNaN(idx)) {
      this.setData({ activeTab: idx })
    }
  },

  // ── Filter toggles ──

  toggleFilter(e: WechatMiniprogram.BaseEvent) {
    const dataset = eventDataset(e)
    const field = getDatasetString(dataset, 'field')
    const id = getDatasetString(dataset, 'id')
    if (!field || !id || !isCatalogFilterField(field)) return

    const current = (this.data as PageData)[field] as string[]
    const next = toggleArrayFilter(current, id)
    this.applyFilterUpdate(field, next)
  },

  onSkillKindTap(e: WechatMiniprogram.BaseEvent) {
    const kind = getDatasetString(eventDataset(e), 'kind')
    if (kind !== 'all' && kind !== 'active' && kind !== 'passive') return
    this.applyFilterUpdate('activeFilter', kind)
  },

  toggleSkillCategory(e: WechatMiniprogram.BaseEvent) {
    const id = getDatasetString(eventDataset(e), 'id')
    if (!id) return

    const next = toggleArrayFilter(this.data.selectedSkillCategories, id)
    this.applyFilterUpdate('selectedSkillCategories', next)
  },

  // ── Search ──

  onSearchInput(e: WechatMiniprogram.Input) {
    this.applyFilterUpdate('searchText', e.detail.value || '')
  },

  onSearchClear() {
    this.applyFilterUpdate('searchText', '')
  },

  // ── Core: apply one filter change and recompute ──

  applyFilterUpdate(key: string, value: unknown) {
    // Build next filter state
    const ps = _state._filterState
    const nextState: CatalogFilterState = {
      searchText: key === 'searchText' ? (value as string) : ps.searchText,
      selectedRarities: key === 'selectedRarities' ? (value as string[]) : ps.selectedRarities,
      selectedTypes: key === 'selectedTypes' ? (value as string[]) : ps.selectedTypes,
      selectedGenders: key === 'selectedGenders' ? (value as string[]) : ps.selectedGenders,
      selectedLanguages: key === 'selectedLanguages' ? (value as string[]) : ps.selectedLanguages,
      selectedJobs: key === 'selectedJobs' ? (value as string[]) : ps.selectedJobs,
      selectedSkillCategories:
        key === 'selectedSkillCategories' ? (value as string[]) : ps.selectedSkillCategories,
      activeFilter: key === 'activeFilter' ? (value as SkillKindFilter) : ps.activeFilter,
    }
    _state._filterState = nextState

    // Query against enriched catalog (which extends RuntimeCatalogEntry)
    const filtered = queryCatalog(_state._enrichedCatalog, _state._skills, nextState)

    // Preserve portrait fail flags
    const preserved = preservePortraitFails(filtered, this.data.visibleRows)

    // Store full result for pagination
    _state._filteredAll = preserved

    // Only send first page to view layer
    const visible = preserved.slice(0, PAGE_SIZE)
    const maps = buildViewMaps(nextState)

    this.setData({
      visibleRows: visible,
      filterCount: preserved.length,
      hasActiveFilters: hasActiveFilters(nextState),
      hasMore: preserved.length > PAGE_SIZE,
      activeFilter: nextState.activeFilter,
      selectedRarities: nextState.selectedRarities,
      selectedTypes: nextState.selectedTypes,
      selectedGenders: nextState.selectedGenders,
      selectedLanguages: nextState.selectedLanguages,
      selectedJobs: nextState.selectedJobs,
      selectedSkillCategories: nextState.selectedSkillCategories,
      searchText: nextState.searchText,
      ...maps,
    })
  },

  // ── Clear all filters ──

  clearFilters() {
    const empty = createEmptyFilterState()
    _state._filterState = empty
    _state._filteredAll = _state._enrichedCatalog

    const maps = buildViewMaps(empty)
    this.setData({
      selectedRarities: [],
      selectedTypes: [],
      selectedGenders: [],
      selectedLanguages: [],
      selectedJobs: [],
      selectedSkillCategories: [],
      activeFilter: 'all' as SkillKindFilter,
      searchText: '',
      hasActiveFilters: false,
      visibleRows: _state._enrichedCatalog.slice(0, PAGE_SIZE),
      filterCount: _state._enrichedCatalog.length,
      hasMore: _state._enrichedCatalog.length > PAGE_SIZE,
      ...maps,
    })
  },

  // ── Pagination ──

  loadMore() {
    const currentLen = this.data.visibleRows.length
    if (currentLen >= _state._filteredAll.length) return

    const nextBatch = _state._filteredAll.slice(currentLen, currentLen + PAGE_SIZE)
    this.setData({
      visibleRows: this.data.visibleRows.concat(nextBatch),
      hasMore: currentLen + PAGE_SIZE < _state._filteredAll.length,
    })
  },

  // ── Image error ──

  onPortraitError(e: WechatMiniprogram.BaseEvent) {
    const idx = Number(eventDataset(e)['index'])
    if (isNaN(idx)) return

    const item = this.data.visibleRows[idx] as CatalogRowView | undefined
    if (!item || item.portraitFail) return

    const update: Record<string, boolean> = {}
    update[`visibleRows[${idx}].portraitFail`] = true
    this.setData(update)
  },

  // ── Navigate ──

  onOfficerTap(e: WechatMiniprogram.BaseEvent) {
    const id = getDatasetString(eventDataset(e), 'id')
    if (!id) return
    wx.navigateTo({ url: `/subpkg-detail/pages/detail/index?id=${id}` })
  },
})
