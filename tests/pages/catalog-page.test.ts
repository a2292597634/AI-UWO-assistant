/**
 * 資料頁回歸測試。
 *
 * 測試直接操作已註冊的 Page 設定，確保保留舊資料頁的導航不會把篩選
 * 或分頁狀態洩漏到新的頁面實例。
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { getCatalog } from '../../miniprogram/runtime/main-data-store'

interface CatalogPageData {
  visibleRows: Array<{
    id: string
    rarityId: string
    name: string
    assetReady?: boolean
    portraitFail?: boolean
  }>
  selectedRarities: string[]
  searchText: string
  skillCheckSearchText: string
  skillCheckKind: 'all' | 'active' | 'passive'
  skillCheckCategoryMap: Record<string, boolean>
  activeMode: 'officer' | 'skill'
  filterSheetOpen: boolean
  filterDraftCount: number
  filterDraftHasActiveFilters: boolean
  assetLoading: boolean
  assetLoadError: string | null
  [key: string]: unknown
}

interface CatalogPageConfig {
  data: CatalogPageData
  onLoad(options?: Record<string, string | undefined>): Promise<void>
  onReady(): Promise<void>
  retryAssetLoading(): Promise<void>
  onModeTap(event: WechatMiniprogram.BaseEvent): void
  onCatalogSearchInput(event: WechatMiniprogram.Input): void
  openFilterSheet(): void
  toggleDraftFilter(event: WechatMiniprogram.BaseEvent): void
  onDraftSkillKindTap(event: WechatMiniprogram.BaseEvent): void
  toggleDraftSkillCategory(event: WechatMiniprogram.BaseEvent): void
  clearDraftFilters(): void
  cancelFilterSheet(): void
  applyDraftFilters(): void
  toggleFilter(event: WechatMiniprogram.BaseEvent): void
  onSearchInput(event: WechatMiniprogram.Input): void
  loadMore(): Promise<void>
  onPortraitError(event: WechatMiniprogram.BaseEvent): void
}

interface CatalogPageInstance extends CatalogPageConfig {
  data: CatalogPageData
  setData(update: Record<string, unknown>): void
}

let catalogPage: CatalogPageConfig
const wxStub = {
  setNavigationBarTitle: vi.fn(),
  navigateTo: vi.fn(
    (options: { url: string; success?: () => void; fail?: (error: unknown) => void }) => {
      options.success?.()
    },
  ),
  navigateBack: vi.fn((options: { success?: () => void }) => {
    options.success?.()
  }),
}

const createPageInstance = (): CatalogPageInstance => {
  const instance = Object.create(catalogPage) as CatalogPageInstance
  instance.data = structuredClone(catalogPage.data)
  instance.setData = (update) => {
    Object.assign(instance.data, update)
  }
  return instance
}

const loadCatalogPage = async (
  page: CatalogPageInstance,
  options: Record<string, string | undefined> = {},
): Promise<void> => {
  await page.onLoad(options)
  await page.onReady()
}

const filterEvent = (id: string): WechatMiniprogram.BaseEvent =>
  ({ currentTarget: { dataset: { field: 'selectedRarities', id } } }) as never

const searchEvent = (value: string): WechatMiniprogram.Input => ({ detail: { value } }) as never

const skillSearchEvent = (value: string): WechatMiniprogram.Input =>
  ({ detail: { value } }) as never

const modeEvent = (mode: 'officer' | 'skill'): WechatMiniprogram.BaseEvent =>
  ({ currentTarget: { dataset: { mode } } }) as never

const draftFilterEvent = (field: string, id: string): WechatMiniprogram.BaseEvent =>
  ({ currentTarget: { dataset: { field, id } } }) as never

const draftSkillKindEvent = (kind: 'all' | 'active' | 'passive'): WechatMiniprogram.BaseEvent =>
  ({ currentTarget: { dataset: { kind } } }) as never

const draftSkillCategoryEvent = (id: string): WechatMiniprogram.BaseEvent =>
  ({ currentTarget: { dataset: { id } } }) as never

beforeAll(async () => {
  vi.stubGlobal('Page', (config: CatalogPageConfig) => {
    catalogPage = config
  })
  vi.stubGlobal('wx', {
    ...wxStub,
  })

  await import('../../miniprogram/pages/catalog/index')
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('catalog Page instance isolation', () => {
  it('loads normally when the lifecycle provides no query options', async () => {
    const page = createPageInstance()

    await loadCatalogPage(page)

    expect(page.data.visibleRows.length).toBeGreaterThan(0)
    expect(page.data.assetLoading).toBe(false)
    expect(page.data.assetLoadError).toBeNull()
    expect(page.data.visibleRows[0]!.assetReady).toBe(true)
  })

  it('renders CDN-backed rows during the initial lifecycle without package navigation', async () => {
    const page = createPageInstance()
    await loadCatalogPage(page)
    expect(page.data.visibleRows.every((row) => row.assetReady)).toBe(true)
    expect(wxStub.navigateTo).not.toHaveBeenCalled()
  })

  it('keeps text fallback available after a portrait URL fails', async () => {
    const page = createPageInstance()

    await loadCatalogPage(page)
    page.onPortraitError({ currentTarget: { dataset: { index: 0 } } } as never)
    expect(page.data.visibleRows[0]!.portraitFail).toBe(true)
  })

  it('appends paginated rows without loading a new asset package', async () => {
    const page = createPageInstance()
    await loadCatalogPage(page)
    await page.loadMore()
    await page.loadMore()
    expect(page.data.visibleRows).toHaveLength(90)

    const loading = page.loadMore()
    await loading
    expect(page.data.visibleRows).toHaveLength(120)
    expect(wxStub.navigateTo).not.toHaveBeenCalled()
  })

  it('updates search results without asset prefetch navigation', async () => {
    vi.useFakeTimers()
    const page = createPageInstance()
    await loadCatalogPage(page)
    vi.clearAllMocks()

    page.onSearchInput(searchEvent('不存在的第一個搜尋'))
    page.onSearchInput(searchEvent(getCatalog()[150]!.name))
    expect(wxStub.navigateTo).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(119)
    expect(wxStub.navigateTo).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
    expect(page.data.assetLoadError).toBeNull()
  })

  it('keeps an older rarity_2 page paginating and searching its own results after a newer rarity_5 page loads', async () => {
    const olderPage = createPageInstance()
    await loadCatalogPage(olderPage)
    olderPage.toggleFilter(filterEvent('rarity_2'))

    expect(olderPage.data.visibleRows).toHaveLength(30)
    expect(olderPage.data.visibleRows.every((row) => row.rarityId === 'rarity_2')).toBe(true)

    const newerPage = createPageInstance()
    await loadCatalogPage(newerPage)
    newerPage.toggleFilter(filterEvent('rarity_5'))
    expect(newerPage.data.visibleRows.every((row) => row.rarityId === 'rarity_5')).toBe(true)

    await olderPage.loadMore()
    expect(olderPage.data.visibleRows).toHaveLength(60)
    expect(olderPage.data.visibleRows.every((row) => row.rarityId === 'rarity_2')).toBe(true)

    olderPage.onSearchInput(searchEvent('不存在的航海士'))
    expect(olderPage.data.selectedRarities).toEqual(['rarity_2'])
    expect(olderPage.data.searchText).toBe('不存在的航海士')
    expect(olderPage.data.visibleRows).toEqual([])
    expect(newerPage.data.selectedRarities).toEqual(['rarity_5'])
    expect(newerPage.data.searchText).toBe('')
  })
})

describe('catalog information architecture', () => {
  it('only provides officer and skill content modes', async () => {
    const page = createPageInstance()
    await loadCatalogPage(page)

    expect(page.data.activeMode).toBe('officer')
    page.onModeTap(modeEvent('skill'))
    expect(page.data.activeMode).toBe('skill')
  })

  it('routes skill-mode search to the skill list without overwriting officer search', async () => {
    const page = createPageInstance()
    await loadCatalogPage(page)

    page.onCatalogSearchInput(searchEvent('航海士條件'))
    page.onModeTap(modeEvent('skill'))
    page.onCatalogSearchInput(skillSearchEvent('技能條件'))

    expect(page.data.searchText).toBe('航海士條件')
    expect(page.data.skillCheckSearchText).toBe('技能條件')
  })

  it('cancels a filter draft without changing the current officer list', async () => {
    const page = createPageInstance()
    await loadCatalogPage(page)
    const before = page.data.visibleRows.map((row) => row.id)

    page.openFilterSheet()
    page.toggleDraftFilter(draftFilterEvent('selectedRarities', 'rarity_2'))

    expect(page.data.filterSheetOpen).toBe(true)
    expect(page.data.filterDraftHasActiveFilters).toBe(true)
    expect(page.data.visibleRows.map((row) => row.id)).toEqual(before)

    page.cancelFilterSheet()
    expect(page.data.filterSheetOpen).toBe(false)
    expect(page.data.selectedRarities).toEqual([])
  })

  it('applies a filter draft before changing the current officer list', async () => {
    const page = createPageInstance()
    await loadCatalogPage(page)

    page.openFilterSheet()
    page.toggleDraftFilter(draftFilterEvent('selectedRarities', 'rarity_2'))
    page.applyDraftFilters()

    expect(page.data.filterSheetOpen).toBe(false)
    expect(page.data.selectedRarities).toEqual(['rarity_2'])
    expect(page.data.visibleRows.every((row) => row.rarityId === 'rarity_2')).toBe(true)
  })

  it('clears draft filters without applying them until the user confirms', async () => {
    const page = createPageInstance()
    await loadCatalogPage(page)

    page.openFilterSheet()
    page.toggleDraftFilter(draftFilterEvent('selectedRarities', 'rarity_2'))
    page.clearDraftFilters()

    expect(page.data.filterDraftHasActiveFilters).toBe(false)
    expect(page.data.filterDraftCount).toBe(getCatalog().length)
    expect(page.data.selectedRarities).toEqual([])
  })

  it('keeps skill kind and category changes inside the draft', async () => {
    const page = createPageInstance()
    await loadCatalogPage(page)

    page.openFilterSheet()
    page.onDraftSkillKindTap(draftSkillKindEvent('active'))
    page.toggleDraftSkillCategory(draftSkillCategoryEvent('cat_combat'))

    expect(page.data.filterSheetOpen).toBe(true)
    expect(page.data.activeFilter).toBe('all')
    expect(page.data.selectedSkillCategories).toEqual([])
    expect(page.data.filterDraftHasActiveFilters).toBe(true)
  })

  it('routes skill-mode filters through the same bottom sheet', async () => {
    const page = createPageInstance()
    await loadCatalogPage(page)
    page.onModeTap(modeEvent('skill'))

    page.openFilterSheet()
    page.onDraftSkillKindTap(draftSkillKindEvent('active'))
    page.toggleDraftSkillCategory(draftSkillCategoryEvent('cat_combat'))

    expect(page.data.skillCheckKind).toBe('all')
    page.applyDraftFilters()

    expect(page.data.skillCheckKind).toBe('active')
    expect(page.data.skillCheckCategoryMap.cat_combat).toBe(true)
  })
})

afterEach(() => {
  vi.useRealTimers()
})

const catalogWxml = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/pages/catalog/index.wxml'),
  'utf8',
)
const catalogWxss = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/pages/catalog/index.wxss'),
  'utf8',
)

const cssRule = (selector: string): string => {
  const match = catalogWxss.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`, 's'))
  return match?.[1] ?? ''
}

describe('catalog touch target markup contracts', () => {
  it('renders exactly two content modes and one search input per mode', () => {
    expect(catalogWxml).toContain('class="catalog-page__mode-tabs"')
    expect([...catalogWxml.matchAll(/data-mode="(?:officer|skill)"/g)]).toHaveLength(2)
    expect(catalogWxml.match(/placeholder="搜尋航海士名稱/g)?.length ?? 0).toBe(1)
    expect(catalogWxml.match(/placeholder="搜尋技能名稱/g)?.length ?? 0).toBe(1)
    expect(catalogWxml).not.toContain('技能清單')
    expect(catalogWxml).not.toContain('skill-check-panel')
  })

  it('places officer filters inside one page-local filter bottom sheet', () => {
    expect(catalogWxml).toContain('bindtap="openFilterSheet"')
    expect(catalogWxml).toContain('class="catalog-page__filter-sheet"')
    expect(catalogWxml).toContain('bindtap="cancelFilterSheet"')
    expect(catalogWxml).toContain('bindtap="applyDraftFilters"')
    expect(catalogWxml).toContain('bindtap="clearDraftFilters"')
    expect(catalogWxml).toContain('data-field="selectedLanguages"')
    expect(catalogWxml).toContain('data-field="selectedJobs"')
    expect(catalogWxml).toContain('data-field="selectedRarities"')
    expect(catalogWxml).toContain('data-field="selectedTypes"')
    expect(catalogWxml).toContain('data-field="selectedGenders"')
    expect(catalogWxml).toContain('bindtap="toggleDraftSkillCategory"')
    expect(catalogWxml).not.toContain('bindtap="onSkillCheckKindTap"')
    expect(catalogWxml).not.toContain('bindtap="onSkillCheckCategoryTap"')
  })

  it('keeps officer rows, skill hit targets, image fallbacks and navigation handlers', () => {
    expect(catalogWxml).not.toContain('asset-loading-state')
    expect(catalogWxml).not.toContain('正在載入本地圖片素材')
    expect(catalogWxml).toMatch(/class="catalog-page__officer-row"[^>]*bindtap="onOfficerTap"/)
    expect(catalogWxml).not.toContain('lazy-load="true"')
    expect(catalogWxml).toContain('binderror="onPortraitError"')
    expect(catalogWxml).toContain('binderror="onSkillIconError"')
    expect(catalogWxml).toContain('catchtap="onSkillIconTap"')
    expect(catalogWxml).toContain('class="catalog-page__skill-level-badge"')
  })

  it('uses Design Foundation tokens and safe-area styling for the filter sheet', () => {
    const sheetRule = cssRule('.catalog-page__filter-sheet')
    expect(sheetRule).toMatch(
      /border-radius:\s*var\(--uwo-radius-sheet\) var\(--uwo-radius-sheet\) 0 0;/,
    )
    expect(sheetRule).toMatch(/env\(safe-area-inset-bottom\)/)
    expect(sheetRule).toMatch(/var\(--uwo-shadow-sheet\)/)
    expect(cssRule('.catalog-page__filter-action--apply')).toMatch(/min-height:\s*88rpx;/)
    expect(cssRule('.catalog-page__skill-hit-target')).toMatch(/width:\s*52rpx;/)
    expect(cssRule('.catalog-page__skill-hit-target')).toMatch(/height:\s*52rpx;/)
  })
})
