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
  buildCatalogFilterOptions,
  PAGE_SIZE,
} from '../../presenters/catalog-presenter'
import { buildSkillSheet } from '../../presenters/skill-sheet'
import { getDatasetString, isCatalogFilterField } from '../../contracts/page-events'
import { assetPackageLoader } from '../../runtime/asset-package-loader'

import type {
  CatalogRowView,
  CatalogViewMaps,
  FilterOption,
} from '../../presenters/catalog-presenter'
import type { SkillSheetView } from '../../presenters/skill-sheet'
import type { CatalogFilterState, SkillKindFilter } from '../../contracts/filter-state'
import type { RuntimeSkill } from '../../contracts/runtime-data'

// ── Helpers ──

/** Extract dataset from event target, typed safely. */
const eventDataset = (e: WechatMiniprogram.BaseEvent): Record<string, unknown> =>
  (e.currentTarget.dataset as unknown as Record<string, unknown>) ?? {}

// ── Page instance state (not reactive) ──

interface CatalogPageState {
  _enrichedCatalog: CatalogRowView[]
  _filteredAll: CatalogRowView[]
  _skills: Record<string, RuntimeSkill>
  _filterState: CatalogFilterState
  _loadOptions: Record<string, string | undefined>
  _initializationPromise?: Promise<void>
}

const pageStateByInstance = new WeakMap<object, CatalogPageState>()

const getPageState = (page: object): CatalogPageState => {
  let state = pageStateByInstance.get(page)
  if (!state) {
    state = {
      _enrichedCatalog: [],
      _filteredAll: [],
      _skills: {},
      _filterState: createEmptyFilterState(),
      _loadOptions: {},
    }
    pageStateByInstance.set(page, state)
  }
  return state
}

// ── Page data type (explicit, so setData sees the right shape) ──

interface PageData extends CatalogViewMaps {
  tabs: string[]
  activeTab: number
  assetLoading: boolean
  assetLoadError: string | null
  visibleRows: CatalogRowView[]
  filterCount: number
  hasActiveFilters: boolean
  hasMore: boolean
  sheetSkill: SkillSheetView | null
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
  selectedSkillId: string | null
  searchText: string
}

interface CatalogPageUpdater {
  setData(update: Record<string, unknown>): void
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

const initializeCatalogPage = (
  page: CatalogPageUpdater,
  options: Record<string, string | undefined>,
): Promise<void> => {
  const state = getPageState(page)
  state._loadOptions = options
  if (state._initializationPromise) return state._initializationPromise

  page.setData({
    assetLoading: true,
    assetLoadError: null,
    visibleRows: [],
  })

  const initialization = (async () => {
    try {
      await assetPackageLoader.loadAll()

      const catalog = getCatalog()
      const skills = getSkills()
      const dicts = getDictionaries()
      state._skills = skills

      // Enrich catalog with precomputed skill icons
      const enriched = enrichCatalogWithIcons(catalog, skills)
      state._enrichedCatalog = enriched

      // Reverse lookup: navigate from detail page with ?skillId=xxx
      const skillId = options.skillId
      if (skillId) {
        const sk = skills[skillId]
        state._filterState = {
          ...createEmptyFilterState(),
          selectedSkillId: skillId,
          // Set active/passive tab based on skill context
          activeFilter: 'all' as SkillKindFilter,
        }
        state._filteredAll = queryCatalog(enriched, skills, state._filterState)
        // Load skill name into nav title
        if (sk) {
          wx.setNavigationBarTitle({ title: sk.n })
        }
      } else {
        state._filterState = createEmptyFilterState()
        state._filteredAll = enriched
      }

      const filtered = state._filteredAll
      const maps = buildViewMaps(state._filterState)
      page.setData({
        assetLoading: false,
        assetLoadError: null,
        visibleRows: filtered.slice(0, PAGE_SIZE),
        filterCount: filtered.length,
        hasActiveFilters: hasActiveFilters(state._filterState),
        hasMore: filtered.length > PAGE_SIZE,
        rarities: buildCatalogFilterOptions(dicts.rarities, 'rarity'),
        types: buildCatalogFilterOptions(dicts.types, 'type'),
        genders: buildCatalogFilterOptions(dicts.genders, 'gender'),
        skillCategories: dicts.skillCategories,
        languages: dicts.languages,
        jobs: dicts.jobs,
        activeFilter: state._filterState.activeFilter,
        selectedSkillId: state._filterState.selectedSkillId,
        ...maps,
      })
    } catch (error) {
      state._filteredAll = []
      page.setData({
        assetLoading: false,
        assetLoadError: `本地圖片素材載入失敗：${getErrorMessage(error)}`,
        visibleRows: [],
        filterCount: 0,
        hasActiveFilters: false,
        hasMore: false,
      })
    } finally {
      state._initializationPromise = undefined
    }
  })()

  state._initializationPromise = initialization
  return initialization
}

// ── Page ──

Page({
  data: {
    tabs: ['航海士', '技能', '語言', '職業'],
    activeTab: 0,
    assetLoading: true,
    assetLoadError: null,
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
    sheetSkill: null,
    // Filter state
    activeFilter: 'all',
    selectedRarities: [],
    selectedTypes: [],
    selectedGenders: [],
    selectedSkillCategories: [],
    selectedLanguages: [],
    selectedJobs: [],
    selectedSkillId: null,
    searchText: '',
    // Precomputed maps for WXML
    selectedRarityMap: {},
    selectedTypeMap: {},
    selectedGenderMap: {},
    selectedLanguageMap: {},
    selectedJobMap: {},
    selectedSkillCategoryMap: {},
  } as PageData,

  onLoad(options: Record<string, string | undefined> = {}) {
    return initializeCatalogPage(this, options)
  },

  retryAssetLoading() {
    return initializeCatalogPage(this, getPageState(this)._loadOptions)
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
    const state = getPageState(this)
    // Build next filter state
    const ps = state._filterState
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
      selectedSkillId: key === 'selectedSkillId' ? (value as string | null) : ps.selectedSkillId,
    }
    state._filterState = nextState

    // Query against enriched catalog (which extends RuntimeCatalogEntry)
    const filtered = queryCatalog(state._enrichedCatalog, state._skills, nextState)

    // Preserve portrait fail flags
    const preserved = preservePortraitFails(filtered, this.data.visibleRows)

    // Store full result for pagination
    state._filteredAll = preserved

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
      selectedSkillId: nextState.selectedSkillId,
      searchText: nextState.searchText,
      ...maps,
    })
  },

  // ── Clear all filters ──

  clearFilters() {
    const state = getPageState(this)
    const empty = createEmptyFilterState()
    state._filterState = empty
    state._filteredAll = state._enrichedCatalog

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
      selectedSkillId: null,
      hasActiveFilters: false,
      visibleRows: state._enrichedCatalog.slice(0, PAGE_SIZE),
      filterCount: state._enrichedCatalog.length,
      hasMore: state._enrichedCatalog.length > PAGE_SIZE,
      ...maps,
    })
    wx.setNavigationBarTitle({ title: '航海士名鑑' })
  },

  // ── Skill sheet (catalog row) ──

  onSkillIconTap(e: WechatMiniprogram.BaseEvent) {
    const dataset = eventDataset(e)
    const skillId = getDatasetString(dataset, 'skillId')
    const kind = getDatasetString(dataset, 'kind') as 'active' | 'passive' | undefined
    if (!skillId || !kind) return

    const sk = getPageState(this)._skills[skillId]
    if (!sk) return

    this.setData({ sheetSkill: buildSkillSheet(sk, kind) })
  },

  onSheetDismiss() {
    this.setData({ sheetSkill: null })
  },

  /** Reverse lookup: clear all filters first, then show every officer who has this skill. */
  onReverseLookup() {
    const skill = this.data.sheetSkill
    if (!skill) return

    const state = getPageState(this)
    // Clear all filters, keep only the target skill ID
    state._filterState = {
      ...createEmptyFilterState(),
      selectedSkillId: skill.id,
    }
    state._filteredAll = queryCatalog(state._enrichedCatalog, state._skills, state._filterState)

    const filtered = state._filteredAll
    const maps = buildViewMaps(state._filterState)
    this.setData({
      selectedRarities: [],
      selectedTypes: [],
      selectedGenders: [],
      selectedLanguages: [],
      selectedJobs: [],
      selectedSkillCategories: [],
      activeFilter: 'all' as SkillKindFilter,
      searchText: '',
      selectedSkillId: skill.id,
      visibleRows: filtered.slice(0, PAGE_SIZE),
      filterCount: filtered.length,
      hasActiveFilters: hasActiveFilters(state._filterState),
      hasMore: filtered.length > PAGE_SIZE,
      sheetSkill: null,
      ...maps,
    })
    // Update nav title to show skill name
    wx.setNavigationBarTitle({ title: skill.name })
  },

  // ── Pagination ──

  loadMore() {
    const state = getPageState(this)
    const currentLen = this.data.visibleRows.length
    if (currentLen >= state._filteredAll.length) return

    const nextBatch = state._filteredAll.slice(currentLen, currentLen + PAGE_SIZE)
    this.setData({
      visibleRows: this.data.visibleRows.concat(nextBatch),
      hasMore: currentLen + PAGE_SIZE < state._filteredAll.length,
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

  onPortraitLayerError(e: WechatMiniprogram.BaseEvent) {
    const dataset = eventDataset(e)
    const idx = Number(dataset['index'])
    const layer = getDatasetString(dataset, 'layer')
    if (isNaN(idx) || !layer) return
    if (layer !== 'frameFail' && layer !== 'rarityIconFail' && layer !== 'typeIconFail') return

    const item = this.data.visibleRows[idx] as CatalogRowView | undefined
    if (!item || item[layer]) return

    const update: Record<string, boolean> = {}
    update[`visibleRows[${idx}].${layer}`] = true
    this.setData(update)
  },

  // ── Navigate ──

  onOfficerTap(e: WechatMiniprogram.BaseEvent) {
    const id = getDatasetString(eventDataset(e), 'id')
    if (!id) return
    wx.navigateTo({ url: `/subpkg-detail/pages/detail/index?id=${id}` })
  },
})
