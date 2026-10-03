/**
 * 資料頁回歸測試。
 *
 * 測試直接操作已註冊的 Page 設定，確保保留舊資料頁的導航不會把篩選
 * 或分頁狀態洩漏到新的頁面實例。
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

import * as mainStore from '../../miniprogram/runtime/main-data-store'
import type {
  SkillCheckRowView,
  SkillCheckExpandedOfficerView,
} from '../../miniprogram/presenters/catalog-presenter'
import { getCatalog, getSkills } from '../../miniprogram/runtime/main-data-store'

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
  skillCheckRows: SkillCheckRowView[]
  expandedSkillId: string | null
  expandedOfficers: SkillCheckExpandedOfficerView[]
  expandedSkillMap: Record<string, boolean>
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
  onSkillCheckKindTap(event: WechatMiniprogram.BaseEvent): void
  onSkillCheckTap(event: WechatMiniprogram.BaseEvent): void
  onPortraitLayerError(event: WechatMiniprogram.BaseEvent): void
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
    for (const [key, value] of Object.entries(update)) {
      const match =
        /^visibleRows\[(\d+)\](?:\.(portraitFail|frameFail|rarityIconFail|typeIconFail))?$/.exec(
          key,
        )
      if (match) {
        if (match[2])
          (instance.data.visibleRows[Number(match[1])] as unknown as Record<string, unknown>)[
            match[2]
          ] = value
        else
          instance.data.visibleRows[Number(match[1])] =
            value as CatalogPageData['visibleRows'][number]
      } else {
        Object.assign(instance.data, { [key]: value })
      }
    }
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
  it('合成mixed技能 all→passive→active：切換清舊展開，再展開只列當前kind持有者', async () => {
    const base = getCatalog()[0]!
    const sid = Object.keys(getSkills())[0]!
    vi.spyOn(mainStore, 'getCatalog').mockReturnValue([
      { ...base, id: 'officer_a', activeSkills: [sid], passiveSkills: [] },
      { ...base, id: 'officer_b', activeSkills: [], passiveSkills: [sid] },
    ])
    const page = createPageInstance()
    await loadCatalogPage(page)
    page.onModeTap(modeEvent('skill'))
    expect(page.data.skillCheckRows[0]).toMatchObject({ kind: 'mixed', officerCount: 2 })
    const tap = { currentTarget: { dataset: { skillId: sid } } } as never
    page.onSkillCheckTap(tap)
    expect(page.data.expandedOfficers).toHaveLength(2)
    for (const [kind, owner] of [
      ['passive', 'officer_b'],
      ['active', 'officer_a'],
    ] as const) {
      page.onSkillCheckKindTap(draftSkillKindEvent(kind))
      expect(page.data.expandedSkillId).toBeNull()
      expect(page.data.expandedSkillMap).toEqual({})
      expect(page.data.expandedOfficers).toEqual([])
      expect(page.data.skillCheckRows[0]).toMatchObject({ kind, officerCount: 1 })
      page.onSkillCheckTap(tap)
      expect(page.data.expandedOfficers.map(({ officerId }) => officerId)).toEqual([owner])
    }
    page.openFilterSheet()
    page.onDraftSkillKindTap(draftSkillKindEvent('all'))
    page.applyDraftFilters()
    expect(page.data.expandedSkillId).toBeNull()
    expect(page.data.skillCheckRows[0]).toMatchObject({ kind: 'mixed', officerCount: 2 })
  })

  it.each(['portraitFail', 'frameFail', 'rarityIconFail', 'typeIconFail'])(
    '630 列圖片失敗 %s 僅傳局部旗標且保持捲動資料',
    async (layer) => {
      const page = createPageInstance()
      await loadCatalogPage(page)
      for (let index = 0; index < 20; index += 1) await page.loadMore()
      expect(page.data.visibleRows).toHaveLength(630)
      const ids = page.data.visibleRows.map(({ id }) => id)
      const updates = vi.spyOn(page, 'setData')
      const event = { currentTarget: { dataset: { index: 0, layer } } } as never
      if (layer === 'portraitFail') page.onPortraitError(event)
      else page.onPortraitLayerError(event)
      const payload = updates.mock.calls[updates.mock.calls.length - 1]![0]
      expect(Buffer.byteLength(JSON.stringify(payload), 'utf8')).toBeLessThan(1024 * 1024)
      expect(payload).toEqual({ [`visibleRows[0].${layer}`]: true })
      expect((page.data.visibleRows[0] as unknown as Record<string, unknown>)[layer]).toBe(true)
      expect(page.data.visibleRows.map(({ id }) => id)).toEqual(ids)
      expect(page.data.visibleRows).toHaveLength(630)
      updates.mockClear()
      if (layer === 'portraitFail') page.onPortraitError(event)
      else page.onPortraitLayerError(event)
      expect(updates).not.toHaveBeenCalled()
    },
  )
  it('拒绝非法圖片 index 與非白名單 layer', async () => {
    const page = createPageInstance()
    await loadCatalogPage(page)
    const updates = vi.spyOn(page, 'setData')
    for (const index of [-1, 0.5, 30, NaN, Infinity, null, '', true, 'bad']) {
      const event = { currentTarget: { dataset: { index, layer: 'frameFail' } } } as never
      page.onPortraitError(event)
      page.onPortraitLayerError(event)
    }
    for (const layer of ['portraitFail', 'name', '__proto__', 'frameFail.deep'])
      page.onPortraitLayerError({ currentTarget: { dataset: { index: 0, layer } } } as never)
    expect(updates).not.toHaveBeenCalled()
  })

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

  it('keeps each paginated setData payload below the WeChat data limit', async () => {
    const page = createPageInstance()
    const payloadSizes: number[] = []
    page.setData = (update) => {
      payloadSizes.push(Buffer.byteLength(JSON.stringify(update), 'utf8'))
      for (const [key, value] of Object.entries(update)) {
        const match = /^visibleRows\[(\d+)\]$/.exec(key)
        if (match) {
          page.data.visibleRows[Number(match[1])] = value as CatalogPageData['visibleRows'][number]
        } else {
          Object.assign(page.data, { [key]: value })
        }
      }
    }
    await loadCatalogPage(page)

    for (let index = 0; index < 11; index += 1) await page.loadMore()

    expect(page.data.visibleRows).toHaveLength(360)
    expect(Math.max(...payloadSizes)).toBeLessThan(1024 * 1024)
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
  vi.restoreAllMocks()
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
const catalogJson = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/pages/catalog/index.json'),
  'utf8',
)
const catalogPageSource = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/pages/catalog/index.ts'),
  'utf8',
)

const cssRule = (selector: string): string => {
  return [...catalogWxss.matchAll(/([^{}]+)\{([^{}]*)\}/gs)]
    .filter(([, header]) =>
      header
        .split(',')
        .map((item) => item.trim())
        .includes(selector),
    )
    .map(([, , body]) => body)
    .join('\n')
}

describe('catalog touch target markup contracts', () => {
  it('技能badge讀kindLabel，mixed使用中性Token', () => {
    expect(catalogWxml).toContain('{{item.kindLabel}}')
    expect(catalogWxml).toContain('catalog-page__skill-row-kind--{{item.kind}}')
    expect(cssRule('.catalog-page__skill-row-kind--mixed')).toContain(
      'var(--uwo-color-surface-muted)',
    )
    expect(cssRule('.catalog-page__skill-row-kind--mixed')).toContain(
      'var(--uwo-color-text-primary)',
    )
  })

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
    expect(catalogWxml).not.toContain('職業')
    expect(catalogWxml).not.toContain('selectedJobs')
    expect(catalogWxml).not.toContain('wx:for="{{jobs}}"')
    expect(catalogWxml).not.toContain('draftSelectedJob')
    expect(catalogWxml).toContain('data-field="selectedRarities"')
    expect(catalogWxml).toContain('data-field="selectedTypes"')
    expect(catalogWxml).toContain('data-field="selectedGenders"')
    expect(catalogWxml).toContain('bindtap="toggleDraftSkillCategory"')
    expect(catalogWxml).not.toContain('bindtap="onSkillCheckKindTap"')
    expect(catalogWxml).not.toContain('bindtap="onSkillCheckCategoryTap"')
  })

  it('provides accessible state semantics for retained multi-select filters', () => {
    expect(catalogWxml).toContain(
      'role="button" aria-label="{{item.accessibilityLabel}}" aria-checked="{{draftSelectedRarityMap[item.id] ? \'true\' : \'false\'}}"',
    )
    expect(catalogWxml).toContain(
      'role="button" aria-label="{{item.accessibilityLabel}}" aria-checked="{{draftSelectedTypeMap[item.id] ? \'true\' : \'false\'}}"',
    )
    expect(catalogWxml).toContain(
      'role="button" aria-label="{{item.accessibilityLabel}}" aria-checked="{{draftSelectedGenderMap[item.id] ? \'true\' : \'false\'}}"',
    )
    expect(catalogWxml).toContain(
      'role="button" aria-label="{{item.name}}" aria-checked="{{draftSelectedLanguageMap[item.id] ? \'true\' : \'false\'}}"',
    )
    expect(catalogWxml).toContain(
      'role="button" aria-label="{{item.name}}" aria-checked="{{draftSelectedSkillCategoryMap[item.id] ? \'true\' : \'false\'}}"',
    )
    expect(catalogWxml).toContain(
      'role="button" aria-label="{{item.name}}" aria-checked="{{draftSkillCheckCategoryMap[item.id] ? \'true\' : \'false\'}}"',
    )
  })

  it('does not expose the removed occupation options in page data', async () => {
    const page = createPageInstance()
    await loadCatalogPage(page)
    expect(page.data).not.toHaveProperty('jobs')
    expect(page.data).not.toHaveProperty('selectedJobs')
    expect(page.data).not.toHaveProperty('draftSelectedJobMap')
  })

  it('keeps officer rows, image fallbacks and navigation handlers', () => {
    expect(catalogWxml).not.toContain('asset-loading-state')
    expect(catalogWxml).not.toContain('正在載入本地圖片素材')
    expect(catalogWxml).toMatch(/class="catalog-page__officer-row"[^>]*bindtap="onOfficerTap"/)
    expect(catalogWxml).not.toContain('lazy-load="true"')
    expect(catalogWxml).toContain('binderror="onPortraitError"')
    expect(catalogWxml).toContain('catchtap="onSkillIconTap"')
  })

  it('registers and renders the shared skill icon component', () => {
    expect(catalogJson).toContain('"skill-icon": "/components/skill-icon/index"')
    expect(catalogWxml).toContain('<skill-icon')
    expect(catalogWxml).toContain('icon-path="{{item.activeSkillIcons[sid]}}"')
    expect(catalogWxml).toContain('icon-path="{{item.passiveSkillIcons[sid]}}"')
    expect(catalogWxml).toContain('skill-name="{{item.activeSkillNames[sid]}}"')
    expect(catalogWxml).toContain('skill-name="{{item.passiveSkillNames[sid]}}"')
    expect(catalogWxml).toContain('category-name="{{item.activeSkillCategories[sid]}}"')
    expect(catalogWxml).toContain('category-name="{{item.passiveSkillCategories[sid]}}"')
  })

  it('keeps skill navigation in the page and removes page-owned icon failure mutation', () => {
    expect(catalogWxml).toContain('catchtap="onSkillIconTap"')
    expect(catalogWxml).toContain(
      'aria-label="查看技能詳情：{{item.activeSkillNames[sid] || \'技能\'}}"',
    )
    expect(catalogWxml).toContain(
      'aria-label="查看技能詳情：{{item.passiveSkillNames[sid] || \'技能\'}}"',
    )
    expect(catalogWxml).not.toContain('binderror="onSkillIconError"')
    expect(catalogWxml).not.toContain('class="catalog-page__skill-icon-wrapper"')
    expect(catalogWxml).not.toContain('class="catalog-page__skill-level-badge"')
    expect(catalogPageSource).not.toContain('onSkillIconError')
  })

  it('uses Design Foundation tokens and safe-area styling for the filter sheet', () => {
    const sheetRule = cssRule('.catalog-page__filter-sheet')
    expect(sheetRule).toMatch(
      /border-radius:\s*var\(--uwo-radius-sheet\) var\(--uwo-radius-sheet\) 0 0;/,
    )
    expect(cssRule('.catalog-page__filter-actions')).toMatch(/env\(safe-area-inset-bottom\)/)
    expect(sheetRule).toMatch(/var\(--uwo-shadow-sheet\)/)
    expect(cssRule('.catalog-page__filter-action--apply')).toMatch(/min-height:\s*88rpx;/)
    expect(cssRule('.catalog-page__skill-hit-target')).toMatch(/min-height:\s*88rpx;/)
  })

  it('技能圖標保持原尺寸並提供 88rpx 的獨立觸控區', () => {
    expect(catalogWxml).toMatch(
      /class="catalog-page__skill-hit-target"[^>]*catchtap="onSkillIconTap"/,
    )
    expect(catalogWxml).toContain(
      'role="button" aria-label="查看技能詳情：{{item.activeSkillNames[sid] || \'技能\'}}"',
    )
    expect(catalogWxml).toContain(
      'role="button" aria-label="查看技能詳情：{{item.passiveSkillNames[sid] || \'技能\'}}"',
    )
    expect(cssRule('.catalog-page__skill-hit-target')).toMatch(/min-width:\s*88rpx;/)
    expect(cssRule('.catalog-page__skill-hit-target')).toMatch(/width:\s*88rpx;/)
    expect(cssRule('.catalog-page__skill-hit-target')).toMatch(/min-height:\s*88rpx;/)
    expect(cssRule('.catalog-page__skill-hit-target')).toMatch(/height:\s*88rpx;/)
    expect(cssRule('.catalog-page__officer-skills')).toMatch(/height:\s*88rpx;/)
    expect(cssRule('.catalog-page__officer-skills-content')).toMatch(/height:\s*88rpx;/)
  })

  it('使用 voyage.tw 比例呈現名鑒人物角標', () => {
    for (const selector of [
      '.catalog-page__officer-rarity-icon',
      '.catalog-page__expanded-officer-rarity',
    ]) {
      expect(cssRule(selector)).toMatch(/top:\s*0;/)
      expect(cssRule(selector)).toMatch(/left:\s*0;/)
      expect(cssRule(selector)).toMatch(/width:\s*100%;/)
      expect(cssRule(selector)).toMatch(/height:\s*100%;/)
    }

    expect(cssRule('.catalog-page__officer-type-icon')).toMatch(/left:\s*var\(--uwo-space-1\);/)
    expect(cssRule('.catalog-page__officer-type-icon')).toMatch(/bottom:\s*var\(--uwo-space-1\);/)
    expect(cssRule('.catalog-page__officer-type-icon')).toMatch(/width:\s*28rpx;/)
    expect(cssRule('.catalog-page__officer-type-icon')).toMatch(/height:\s*28rpx;/)

    expect(cssRule('.catalog-page__expanded-officer-type')).toMatch(/left:\s*var\(--uwo-space-1\);/)
    expect(cssRule('.catalog-page__expanded-officer-type')).toMatch(
      /bottom:\s*var\(--uwo-space-1\);/,
    )
    expect(cssRule('.catalog-page__expanded-officer-type')).toMatch(/width:\s*21rpx;/)
    expect(cssRule('.catalog-page__expanded-officer-type')).toMatch(/height:\s*21rpx;/)
  })

  it('鎖定主列表與技能反查的四層 WXML 分層順序與素材綁定', () => {
    const visualLayers = [
      {
        container: 'catalog-page__officer-portrait',
        end: 'catalog-page__officer-info',
        paths: [
          'item.visuals.framePath',
          'item.portraitPath',
          'item.visuals.rarityIconPath',
          'item.visuals.typeIconPath',
        ],
        classes: [
          'catalog-page__officer-portrait-layer--frame',
          'catalog-page__officer-avatar',
          'catalog-page__officer-rarity-icon',
          'catalog-page__officer-type-icon',
        ],
      },
      {
        container: 'catalog-page__expanded-officer-visuals',
        end: 'catalog-page__expanded-officer-name',
        paths: [
          'officer.visuals.framePath',
          'officer.portraitPath',
          'officer.visuals.rarityIconPath',
          'officer.visuals.typeIconPath',
        ],
        classes: [
          'catalog-page__expanded-officer-frame',
          'catalog-page__expanded-officer-portrait',
          'catalog-page__expanded-officer-rarity',
          'catalog-page__expanded-officer-type',
        ],
      },
    ]

    for (const { container, end, paths, classes } of visualLayers) {
      const start = catalogWxml.indexOf(`class="${container}"`)
      const endPosition = catalogWxml.indexOf(`class="${end}"`, start)
      const block =
        start >= 0 && endPosition > start ? catalogWxml.slice(start, endPosition) : undefined
      expect(block).toBeDefined()
      const layerPositions = classes.map((className) => block!.indexOf(className))
      expect(layerPositions.every((position) => position >= 0)).toBe(true)
      expect(layerPositions).toEqual([...layerPositions].sort((a, b) => a - b))
      for (const path of paths) expect(block).toContain(`{{${path}}}`)
    }
  })
})
