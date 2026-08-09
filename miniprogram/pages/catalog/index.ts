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
  buildSkillCheckList,
  filterSkillCheckList,
  getOfficersForSkill,
  PAGE_SIZE,
} from '../../presenters/catalog-presenter'
import type {
  SkillCheckRowView,
  SkillCheckExpandedOfficerView,
} from '../../presenters/catalog-presenter'
import { buildSkillSheet } from '../../presenters/skill-sheet'
import { getDatasetString, isCatalogFilterField } from '../../contracts/page-events'

import type {
  CatalogRowView,
  CatalogViewMaps,
  FilterOption,
} from '../../presenters/catalog-presenter'
import type { SkillSheetView } from '../../presenters/skill-sheet'
import type { CatalogFilterState, SkillKindFilter } from '../../contracts/filter-state'
import type { RuntimeSkill } from '../../contracts/runtime-data'

type CatalogMode = 'officer' | 'skill'
type SkillCheckKind = 'all' | 'active' | 'passive'

// ── 輔助函式 ──

/** 安全取得事件目標的 dataset。 */
const eventDataset = (e: WechatMiniprogram.BaseEvent): Record<string, unknown> =>
  (e.currentTarget.dataset as unknown as Record<string, unknown>) ?? {}

// ── 頁面實例狀態（非響應式） ──

interface CatalogPageState {
  _enrichedCatalog: CatalogRowView[]
  _filteredAll: CatalogRowView[]
  _skills: Record<string, RuntimeSkill>
  _filterState: CatalogFilterState
  _loadOptions: Record<string, string | undefined>
  _assetRetryCount: number
  _draftFilterState: CatalogFilterState | null
  _draftSkillCheckKind: SkillCheckKind | null
  _draftSkillCheckCategories: string[] | null
  // 技能清單
  _fullSkillCheckList: SkillCheckRowView[]
  _filteredSkillList: SkillCheckRowView[]
  _skillCheckKind: 'all' | 'active' | 'passive'
  _skillCheckCategories: string[]
  _skillCheckSearchText: string
  _skillCheckVisible: number
  _expandedSkillId: string | null
  _expandedOfficers: SkillCheckExpandedOfficerView[]
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
      _assetRetryCount: 0,
      _draftFilterState: null,
      _draftSkillCheckKind: null,
      _draftSkillCheckCategories: null,
      _fullSkillCheckList: [],
      _filteredSkillList: [],
      _skillCheckKind: 'all',
      _skillCheckCategories: [],
      _skillCheckSearchText: '',
      _skillCheckVisible: 30,
      _expandedSkillId: null,
      _expandedOfficers: [],
    }
    pageStateByInstance.set(page, state)
  }
  return state
}

// ── 頁面資料型別（明確宣告，讓 setData 維持正確形狀） ──

interface PageData extends CatalogViewMaps {
  activeMode: CatalogMode
  assetLoading: boolean
  assetLoadError: string | null
  visibleRows: CatalogRowView[]
  filterCount: number
  hasActiveFilters: boolean
  hasMore: boolean
  sheetSkill: SkillSheetView | null
  // 篩選選項
  rarities: FilterOption[]
  types: FilterOption[]
  genders: FilterOption[]
  skillCategories: { id: string; name: string }[]
  languages: { id: string; name: string }[]
  jobs: { id: string; name: string }[]
  // 篩選狀態欄位
  activeFilter: SkillKindFilter
  selectedRarities: string[]
  selectedTypes: string[]
  selectedGenders: string[]
  selectedSkillCategories: string[]
  selectedLanguages: string[]
  selectedJobs: string[]
  selectedSkillId: string | null
  searchText: string
  filterSheetOpen: boolean
  filterSheetMode: CatalogMode
  filterDraftCount: number
  filterDraftHasActiveFilters: boolean
  draftActiveFilter: SkillKindFilter
  draftSelectedRarities: string[]
  draftSelectedTypes: string[]
  draftSelectedGenders: string[]
  draftSelectedLanguages: string[]
  draftSelectedJobs: string[]
  draftSelectedSkillCategories: string[]
  draftSelectedRarityMap: Record<string, boolean>
  draftSelectedTypeMap: Record<string, boolean>
  draftSelectedGenderMap: Record<string, boolean>
  draftSelectedLanguageMap: Record<string, boolean>
  draftSelectedJobMap: Record<string, boolean>
  draftSelectedSkillCategoryMap: Record<string, boolean>
  draftSkillCheckKind: SkillCheckKind
  draftSkillCheckCategoryMap: Record<string, boolean>
  // 技能清單模式
  skillCheckRows: SkillCheckRowView[]
  skillCheckTotal: number
  skillCheckHasMore: boolean
  skillCheckKind: 'all' | 'active' | 'passive'
  skillCheckCategoryMap: Record<string, boolean>
  skillCheckSearchText: string
  expandedSkillId: string | null
  expandedSkillMap: Record<string, boolean>
  expandedOfficers: SkillCheckExpandedOfficerView[]
  expandedOfficerAssetReady: boolean
}

interface CatalogPageUpdater {
  data: PageData
  setData(update: Record<string, unknown>): void
}

const rowsWithAssetState = (rows: readonly CatalogRowView[]): CatalogRowView[] =>
  rows.map((row) => ({ ...row, assetReady: true }))

const cloneFilterState = (state: Readonly<CatalogFilterState>): CatalogFilterState => ({
  searchText: state.searchText,
  selectedRarities: [...state.selectedRarities],
  selectedTypes: [...state.selectedTypes],
  selectedGenders: [...state.selectedGenders],
  selectedLanguages: [...state.selectedLanguages],
  selectedJobs: [...state.selectedJobs],
  selectedSkillCategories: [...state.selectedSkillCategories],
  activeFilter: state.activeFilter,
  selectedSkillId: state.selectedSkillId,
})

const buildDraftFilterData = (
  catalog: readonly CatalogRowView[],
  skills: Readonly<Record<string, RuntimeSkill>>,
  draft: Readonly<CatalogFilterState>,
): Record<string, unknown> => {
  const maps = buildViewMaps(draft)
  return {
    filterDraftCount: queryCatalog(catalog, skills, draft).length,
    filterDraftHasActiveFilters: hasActiveFilters(draft),
    draftActiveFilter: draft.activeFilter,
    draftSelectedRarities: draft.selectedRarities,
    draftSelectedTypes: draft.selectedTypes,
    draftSelectedGenders: draft.selectedGenders,
    draftSelectedLanguages: draft.selectedLanguages,
    draftSelectedJobs: draft.selectedJobs,
    draftSelectedSkillCategories: draft.selectedSkillCategories,
    draftSelectedRarityMap: maps.selectedRarityMap,
    draftSelectedTypeMap: maps.selectedTypeMap,
    draftSelectedGenderMap: maps.selectedGenderMap,
    draftSelectedLanguageMap: maps.selectedLanguageMap,
    draftSelectedJobMap: maps.selectedJobMap,
    draftSelectedSkillCategoryMap: maps.selectedSkillCategoryMap,
  }
}

const buildSkillDraftFilterData = (
  rows: readonly SkillCheckRowView[],
  kind: SkillCheckKind,
  categories: readonly string[],
  searchText: string,
): Record<string, unknown> => {
  const categoryMap: Record<string, boolean> = {}
  for (const category of categories) categoryMap[category] = true

  return {
    filterDraftCount: filterSkillCheckList(rows, kind, categories, searchText).length,
    filterDraftHasActiveFilters: kind !== 'all' || categories.length > 0,
    draftSkillCheckKind: kind,
    draftSkillCheckCategoryMap: categoryMap,
  }
}

const initializeCatalogPage = (
  page: CatalogPageUpdater,
  options: Record<string, string | undefined>,
): Promise<void> => {
  const state = getPageState(page)
  state._loadOptions = options
  state._draftFilterState = null
  state._draftSkillCheckKind = null
  state._draftSkillCheckCategories = null

  page.setData({
    assetLoading: true,
    assetLoadError: null,
  })

  const initialization = (async () => {
    try {
      const catalog = getCatalog()
      const skills = getSkills()
      const dicts = getDictionaries()
      state._skills = skills

      // 以預先計算的技能圖示擴充名冊資料
      const enriched = enrichCatalogWithIcons(catalog, skills)
      state._enrichedCatalog = enriched

      // 反向查詢：從詳情頁以 ?skillId=xxx 導入
      const skillId = options.skillId
      if (skillId) {
        const sk = skills[skillId]
        state._filterState = {
          ...createEmptyFilterState(),
          selectedSkillId: skillId,
          // 依技能情境設定主動／被動篩選
          activeFilter: 'all' as SkillKindFilter,
        }
        state._filteredAll = queryCatalog(enriched, skills, state._filterState)
        // 將技能名稱載入導覽列標題
        if (sk) {
          wx.setNavigationBarTitle({ title: sk.n })
        }
      } else {
        state._filterState = createEmptyFilterState()
        state._filteredAll = enriched
      }

      // 建立技能清單（只建立一次）
      state._fullSkillCheckList = buildSkillCheckList(catalog, skills)
      state._filteredSkillList = state._fullSkillCheckList
      state._skillCheckVisible = 30

      const filtered = state._filteredAll
      const maps = buildViewMaps(state._filterState)
      const visibleRows = filtered.slice(0, PAGE_SIZE)
      const skillCheckSlice = state._filteredSkillList.slice(0, state._skillCheckVisible)
      page.setData({
        assetLoading: false,
        assetLoadError: null,
        visibleRows: rowsWithAssetState(visibleRows),
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
        // 技能清單
        skillCheckRows: skillCheckSlice,
        skillCheckTotal: state._filteredSkillList.length,
        skillCheckHasMore: state._filteredSkillList.length > state._skillCheckVisible,
        ...maps,
      })
    } catch (error) {
      page.setData({
        assetLoading: false,
        assetLoadError: `圖片資料初始化失敗：${String(error)}`,
      })
    }
  })()

  return initialization
}

// ── 頁面 ──

Page({
  data: {
    activeMode: 'officer' as CatalogMode,
    assetLoading: true,
    assetLoadError: null,
    visibleRows: [],
    filterCount: 0,
    hasActiveFilters: false,
    hasMore: false,
    // 篩選選項
    rarities: [],
    types: [],
    genders: [],
    skillCategories: [],
    languages: [],
    jobs: [],
    sheetSkill: null,
    // 篩選狀態
    activeFilter: 'all',
    selectedRarities: [],
    selectedTypes: [],
    selectedGenders: [],
    selectedSkillCategories: [],
    selectedLanguages: [],
    selectedJobs: [],
    selectedSkillId: null,
    searchText: '',
    filterSheetOpen: false,
    filterSheetMode: 'officer' as CatalogMode,
    filterDraftCount: 0,
    filterDraftHasActiveFilters: false,
    draftActiveFilter: 'all' as SkillKindFilter,
    draftSelectedRarities: [],
    draftSelectedTypes: [],
    draftSelectedGenders: [],
    draftSelectedLanguages: [],
    draftSelectedJobs: [],
    draftSelectedSkillCategories: [],
    draftSelectedRarityMap: {},
    draftSelectedTypeMap: {},
    draftSelectedGenderMap: {},
    draftSelectedLanguageMap: {},
    draftSelectedJobMap: {},
    draftSelectedSkillCategoryMap: {},
    draftSkillCheckKind: 'all' as SkillCheckKind,
    draftSkillCheckCategoryMap: {},
    // 提供 WXML 使用的預先計算 map
    selectedRarityMap: {},
    selectedTypeMap: {},
    selectedGenderMap: {},
    selectedLanguageMap: {},
    selectedJobMap: {},
    selectedSkillCategoryMap: {},
    // 技能清單
    skillCheckRows: [],
    skillCheckTotal: 0,
    skillCheckHasMore: false,
    skillCheckKind: 'all',
    skillCheckCategoryMap: {},
    skillCheckSearchText: '',
    expandedSkillId: null,
    expandedSkillMap: {},
    expandedOfficers: [],
    expandedOfficerAssetReady: false,
  } as PageData,

  onLoad(options: Record<string, string | undefined> = {}) {
    return initializeCatalogPage(this, options)
  },

  onReady() {
    return Promise.resolve()
  },

  retryAssetLoading() {
    const state = getPageState(this)
    if (state._assetRetryCount >= 1) return Promise.resolve()
    state._assetRetryCount += 1
    return initializeCatalogPage(this, state._loadOptions)
  },

  // ── 內容模式 ──

  onModeTap(e: WechatMiniprogram.BaseEvent) {
    const mode = getDatasetString(eventDataset(e), 'mode')
    if (mode !== 'officer' && mode !== 'skill') return
    this.setData({ activeMode: mode })
  },

  // ── 篩選切換 ──

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

  // ── 搜尋 ──

  onCatalogSearchInput(e: WechatMiniprogram.Input) {
    const state = getPageState(this)
    const value = e.detail.value || ''
    if (this.data.activeMode === 'skill') {
      state._skillCheckSearchText = value
      this.applySkillCheckFilter()
      return
    }
    this.applyFilterUpdate('searchText', value)
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    this.onCatalogSearchInput(e)
  },

  onSearchClear() {
    if (this.data.activeMode === 'skill') {
      const state = getPageState(this)
      state._skillCheckSearchText = ''
      this.applySkillCheckFilter()
      return
    }
    this.applyFilterUpdate('searchText', '')
  },

  onSkillCheckSearchInput(e: WechatMiniprogram.Input) {
    const state = getPageState(this)
    state._skillCheckSearchText = e.detail.value || ''
    this.applySkillCheckFilter()
  },

  // ── 核心：套用單一篩選變更並重新計算 ──

  applyFilterUpdate(key: string, value: unknown) {
    const state = getPageState(this)
    // 建立下一個篩選狀態
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
    return this.applyFilterState(nextState)
  },

  applyFilterState(nextState: CatalogFilterState) {
    const state = getPageState(this)
    state._filterState = nextState

    // 對擴充後的名冊資料執行查詢
    const filtered = queryCatalog(state._enrichedCatalog, state._skills, nextState)

    // 保留肖像載入失敗標記
    const preserved = preservePortraitFails(filtered, this.data.visibleRows)

    // 保存完整結果供分頁使用
    state._filteredAll = preserved

    // 只將第一頁資料送至視圖層
    const visible = preserved.slice(0, PAGE_SIZE)
    const maps = buildViewMaps(nextState)

    this.setData({
      visibleRows: rowsWithAssetState(visible),
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
    return Promise.resolve()
  },

  // ── 篩選 Bottom Sheet 草稿 ──

  openFilterSheet() {
    const state = getPageState(this)
    if (this.data.activeMode === 'skill') {
      const kind = state._skillCheckKind
      const categories = [...state._skillCheckCategories]
      state._draftFilterState = null
      state._draftSkillCheckKind = kind
      state._draftSkillCheckCategories = categories
      this.setData({
        filterSheetOpen: true,
        filterSheetMode: 'skill' as CatalogMode,
        ...buildSkillDraftFilterData(
          state._fullSkillCheckList,
          kind,
          categories,
          state._skillCheckSearchText,
        ),
      })
      return
    }

    const draft = cloneFilterState(state._filterState)
    state._draftFilterState = draft
    state._draftSkillCheckKind = null
    state._draftSkillCheckCategories = null
    this.setData({
      filterSheetOpen: true,
      filterSheetMode: 'officer' as CatalogMode,
      ...buildDraftFilterData(state._enrichedCatalog, state._skills, draft),
    })
  },

  updateDraftFilter(draft: CatalogFilterState) {
    const state = getPageState(this)
    state._draftFilterState = draft
    this.setData(buildDraftFilterData(state._enrichedCatalog, state._skills, draft))
  },

  updateDraftSkillCheckFilter(kind: SkillCheckKind, categories: string[]) {
    const state = getPageState(this)
    state._draftSkillCheckKind = kind
    state._draftSkillCheckCategories = categories
    this.setData(
      buildSkillDraftFilterData(
        state._fullSkillCheckList,
        kind,
        categories,
        state._skillCheckSearchText,
      ),
    )
  },

  toggleDraftFilter(e: WechatMiniprogram.BaseEvent) {
    const dataset = eventDataset(e)
    const field = getDatasetString(dataset, 'field')
    const id = getDatasetString(dataset, 'id')
    const draft = getPageState(this)._draftFilterState
    if (!draft || !field || !id || !isCatalogFilterField(field)) return

    const current = draft[field]
    this.updateDraftFilter({ ...draft, [field]: toggleArrayFilter(current, id) })
  },

  onDraftSkillKindTap(e: WechatMiniprogram.BaseEvent) {
    const kind = getDatasetString(eventDataset(e), 'kind')
    if (kind !== 'all' && kind !== 'active' && kind !== 'passive') return

    if (this.data.filterSheetMode === 'skill') {
      const state = getPageState(this)
      const categories = state._draftSkillCheckCategories ?? []
      this.updateDraftSkillCheckFilter(kind, categories)
      return
    }

    const draft = getPageState(this)._draftFilterState
    if (!draft) return
    this.updateDraftFilter({ ...draft, activeFilter: kind })
  },

  toggleDraftSkillCategory(e: WechatMiniprogram.BaseEvent) {
    const id = getDatasetString(eventDataset(e), 'id')
    if (!id) return

    if (this.data.filterSheetMode === 'skill') {
      const state = getPageState(this)
      const kind = state._draftSkillCheckKind ?? 'all'
      const categories = state._draftSkillCheckCategories ?? []
      this.updateDraftSkillCheckFilter(kind, toggleArrayFilter(categories, id))
      return
    }

    const draft = getPageState(this)._draftFilterState
    if (!draft) return
    this.updateDraftFilter({
      ...draft,
      selectedSkillCategories: toggleArrayFilter(draft.selectedSkillCategories, id),
    })
  },

  clearDraftFilters() {
    if (this.data.filterSheetMode === 'skill') {
      this.updateDraftSkillCheckFilter('all', [])
      return
    }

    const empty = createEmptyFilterState()
    this.updateDraftFilter(empty)
  },

  stopFilterSheetPropagation() {
    // 讓篩選內容區可以操作，而不會觸發遮罩的取消事件。
  },

  cancelFilterSheet() {
    const state = getPageState(this)
    state._draftFilterState = null
    state._draftSkillCheckKind = null
    state._draftSkillCheckCategories = null
    this.setData({ filterSheetOpen: false })
  },

  applyDraftFilters() {
    const state = getPageState(this)

    if (this.data.filterSheetMode === 'skill') {
      const kind = state._draftSkillCheckKind
      const categories = state._draftSkillCheckCategories
      if (!kind || !categories) return
      state._skillCheckKind = kind
      state._skillCheckCategories = [...categories]
      state._draftSkillCheckKind = null
      state._draftSkillCheckCategories = null
      this.setData({ filterSheetOpen: false })
      this.applySkillCheckFilter()
      return
    }

    const draft = state._draftFilterState
    if (!draft) return
    state._draftFilterState = null
    state._draftSkillCheckKind = null
    state._draftSkillCheckCategories = null
    this.setData({ filterSheetOpen: false })
    this.applyFilterState(cloneFilterState(draft))
  },

  // ── 清除所有篩選 ──

  clearFilters() {
    const state = getPageState(this)
    const empty = createEmptyFilterState()
    state._filterState = empty
    state._filteredAll = state._enrichedCatalog
    const visible = state._enrichedCatalog.slice(0, PAGE_SIZE)

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
      visibleRows: rowsWithAssetState(visible),
      filterCount: state._enrichedCatalog.length,
      hasMore: state._enrichedCatalog.length > PAGE_SIZE,
      ...maps,
    })
    wx.setNavigationBarTitle({ title: '航海士名鑑' })
  },

  // ── 技能 Sheet（名冊列） ──

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

  /** 反向查詢：先清除所有篩選，再顯示擁有此技能的航海士。 */
  onReverseLookup() {
    const skill = this.data.sheetSkill
    if (!skill) return

    const state = getPageState(this)
    state._draftFilterState = null
    state._draftSkillCheckKind = null
    state._draftSkillCheckCategories = null
    // 清除所有篩選，只保留目標技能 ID
    state._filterState = {
      ...createEmptyFilterState(),
      selectedSkillId: skill.id,
    }
    state._filteredAll = queryCatalog(state._enrichedCatalog, state._skills, state._filterState)

    const filtered = state._filteredAll
    const visible = filtered.slice(0, PAGE_SIZE)
    const maps = buildViewMaps(state._filterState)
    this.setData({
      activeMode: 'officer' as CatalogMode,
      filterSheetOpen: false,
      selectedRarities: [],
      selectedTypes: [],
      selectedGenders: [],
      selectedLanguages: [],
      selectedJobs: [],
      selectedSkillCategories: [],
      activeFilter: 'all' as SkillKindFilter,
      searchText: '',
      selectedSkillId: skill.id,
      visibleRows: rowsWithAssetState(visible),
      filterCount: filtered.length,
      hasActiveFilters: hasActiveFilters(state._filterState),
      hasMore: filtered.length > PAGE_SIZE,
      sheetSkill: null,
      ...maps,
    })
    // 更新導覽列標題以顯示技能名稱
    wx.setNavigationBarTitle({ title: skill.name })
  },

  // ── 技能清單 ──

  applySkillCheckFilter() {
    const state = getPageState(this)
    const filtered = filterSkillCheckList(
      state._fullSkillCheckList,
      state._skillCheckKind,
      state._skillCheckCategories,
      state._skillCheckSearchText,
    )
    state._filteredSkillList = filtered
    state._skillCheckVisible = 30

    const catMap: Record<string, boolean> = {}
    for (const cat of state._skillCheckCategories) catMap[cat] = true

    const slice = filtered.slice(0, state._skillCheckVisible)
    this.setData({
      skillCheckRows: slice,
      skillCheckTotal: filtered.length,
      skillCheckHasMore: filtered.length > state._skillCheckVisible,
      skillCheckKind: state._skillCheckKind,
      skillCheckCategoryMap: catMap,
      skillCheckSearchText: state._skillCheckSearchText,
    })
  },

  onSkillCheckKindTap(e: WechatMiniprogram.BaseEvent) {
    const kind = getDatasetString(eventDataset(e), 'kind')
    if (kind !== 'all' && kind !== 'active' && kind !== 'passive') return

    const state = getPageState(this)
    state._skillCheckKind = kind
    this.applySkillCheckFilter()
  },

  onSkillCheckCategoryTap(e: WechatMiniprogram.BaseEvent) {
    const id = getDatasetString(eventDataset(e), 'id')
    if (!id) return

    const state = getPageState(this)
    const current = state._skillCheckCategories
    const next = toggleArrayFilter(current, id)
    state._skillCheckCategories = next
    this.applySkillCheckFilter()
  },

  onSkillCheckTap(e: WechatMiniprogram.BaseEvent) {
    const skillId = getDatasetString(eventDataset(e), 'skillId')
    if (!skillId) return

    const state = getPageState(this)

    // 切換：若已展開則收合
    if (state._expandedSkillId === skillId) {
      state._expandedSkillId = null
      state._expandedOfficers = []
      this.setData({
        expandedSkillId: null,
        expandedSkillMap: {},
        expandedOfficers: [],
        expandedOfficerAssetReady: false,
      })
      return
    }

    // 展開：尋找擁有此技能的航海士
    const officers = getOfficersForSkill(skillId, state._enrichedCatalog)
    state._expandedSkillId = skillId
    state._expandedOfficers = officers

    const expMap: Record<string, boolean> = {}
    expMap[skillId] = true

    this.setData({
      expandedSkillId: skillId,
      expandedSkillMap: expMap,
      expandedOfficers: officers,
      expandedOfficerAssetReady: true,
    })
  },

  onExpandedOfficerTap(e: WechatMiniprogram.BaseEvent) {
    const id = getDatasetString(eventDataset(e), 'id')
    if (!id) return
    wx.navigateTo({ url: `/subpkg-detail/pages/detail/index?id=${id}` })
  },

  skillCheckLoadMore(): Promise<void> {
    const state = getPageState(this)
    const currentLen = this.data.skillCheckRows.length
    if (currentLen >= state._filteredSkillList.length) return Promise.resolve()

    const next = state._filteredSkillList.slice(currentLen, currentLen + PAGE_SIZE)
    const nextRows = this.data.skillCheckRows.concat(next)
    this.setData({
      skillCheckRows: nextRows,
      skillCheckHasMore: currentLen + PAGE_SIZE < state._filteredSkillList.length,
    })
    return Promise.resolve()
  },

  // ── 分頁 ──

  loadMore(): Promise<void> {
    const state = getPageState(this)
    const currentLen = this.data.visibleRows.length
    if (currentLen >= state._filteredAll.length) return Promise.resolve()

    const nextBatch = state._filteredAll.slice(currentLen, currentLen + PAGE_SIZE)
    const nextVisibleRows = this.data.visibleRows.concat(rowsWithAssetState(nextBatch))
    this.setData({
      assetLoading: false,
      assetLoadError: null,
      visibleRows: nextVisibleRows,
      hasMore: currentLen + PAGE_SIZE < state._filteredAll.length,
    })
    return Promise.resolve()
  },

  // ── 圖片錯誤 ──

  onPortraitError(e: WechatMiniprogram.BaseEvent) {
    const idx = Number(eventDataset(e)['index'])
    if (isNaN(idx)) return

    const item = this.data.visibleRows[idx] as CatalogRowView | undefined
    if (!item || item.portraitFail) return

    this.setData({
      visibleRows: this.data.visibleRows.map((row, rowIndex) =>
        rowIndex === idx ? { ...row, portraitFail: true } : row,
      ),
    })
  },

  onSkillIconError(e: WechatMiniprogram.BaseEvent) {
    const dataset = eventDataset(e)
    const idx = Number(dataset['index'])
    const skillId = getDatasetString(dataset, 'skillId')
    if (isNaN(idx) || !skillId) return

    const item = this.data.visibleRows[idx] as CatalogRowView | undefined
    if (!item) return
    if (!item.activeSkillIcons[skillId] && !item.passiveSkillIcons[skillId]) return
    this.setData({
      visibleRows: this.data.visibleRows.map((row, rowIndex) => {
        if (rowIndex !== idx) return row
        return {
          ...row,
          activeSkillIcons: { ...row.activeSkillIcons, [skillId]: '' },
          passiveSkillIcons: { ...row.passiveSkillIcons, [skillId]: '' },
        }
      }),
    })
  },

  onPortraitLayerError(e: WechatMiniprogram.BaseEvent) {
    const dataset = eventDataset(e)
    const idx = Number(dataset['index'])
    const layer = getDatasetString(dataset, 'layer')
    if (isNaN(idx) || !layer) return
    if (layer !== 'frameFail' && layer !== 'rarityIconFail' && layer !== 'typeIconFail') return

    const item = this.data.visibleRows[idx] as CatalogRowView | undefined
    if (!item || item[layer]) return

    this.setData({
      visibleRows: this.data.visibleRows.map((row, rowIndex) =>
        rowIndex === idx ? { ...row, [layer]: true } : row,
      ),
    })
  },

  // ── 導航 ──

  onOfficerTap(e: WechatMiniprogram.BaseEvent) {
    const id = getDatasetString(eventDataset(e), 'id')
    if (!id) return
    wx.navigateTo({ url: `/subpkg-detail/pages/detail/index?id=${id}` })
  },
})
