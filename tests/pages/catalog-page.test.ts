/**
 * Catalog Page Regression Tests
 *
 * These tests exercise the registered Page configuration so navigation that
 * retains an older catalog Page cannot leak filters or pagination from a
 * newer Page instance.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

interface CatalogPageData {
  visibleRows: Array<{ rarityId: string; name: string }>
  selectedRarities: string[]
  searchText: string
  [key: string]: unknown
}

interface CatalogPageConfig {
  data: CatalogPageData
  onLoad(options?: Record<string, string | undefined>): void
  toggleFilter(event: WechatMiniprogram.BaseEvent): void
  onSearchInput(event: WechatMiniprogram.Input): void
  loadMore(): void
}

interface CatalogPageInstance extends CatalogPageConfig {
  data: CatalogPageData
  setData(update: Record<string, unknown>): void
}

let catalogPage: CatalogPageConfig

const createPageInstance = (): CatalogPageInstance => {
  const instance = Object.create(catalogPage) as CatalogPageInstance
  instance.data = structuredClone(catalogPage.data)
  instance.setData = (update) => {
    Object.assign(instance.data, update)
  }
  return instance
}

const filterEvent = (id: string): WechatMiniprogram.BaseEvent =>
  ({ currentTarget: { dataset: { field: 'selectedRarities', id } } }) as never

const searchEvent = (value: string): WechatMiniprogram.Input => ({ detail: { value } }) as never

beforeAll(async () => {
  vi.stubGlobal('Page', (config: CatalogPageConfig) => {
    catalogPage = config
  })
  vi.stubGlobal('wx', {
    setNavigationBarTitle: vi.fn(),
    navigateTo: vi.fn(),
  })

  await import('../../miniprogram/pages/catalog/index')
})

describe('catalog Page instance isolation', () => {
  it('loads normally when the lifecycle provides no query options', () => {
    const page = createPageInstance()

    page.onLoad()

    expect(page.data.visibleRows.length).toBeGreaterThan(0)
  })

  it('keeps an older rarity_2 page paginating and searching its own results after a newer rarity_5 page loads', () => {
    const olderPage = createPageInstance()
    olderPage.onLoad({})
    olderPage.toggleFilter(filterEvent('rarity_2'))

    expect(olderPage.data.visibleRows).toHaveLength(30)
    expect(olderPage.data.visibleRows.every((row) => row.rarityId === 'rarity_2')).toBe(true)

    const newerPage = createPageInstance()
    newerPage.onLoad({})
    newerPage.toggleFilter(filterEvent('rarity_5'))
    expect(newerPage.data.visibleRows.every((row) => row.rarityId === 'rarity_5')).toBe(true)

    olderPage.loadMore()
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
  it('uses bounded horizontal image-only filter controls with 88rpx hit targets and 58rpx rarity marks', () => {
    expect(catalogWxml).toMatch(
      /<scroll-view class="officer-filter-toolbar"[^>]*scroll-x="true"[^>]*>[\s\S]*class="officer-filter-toolbar__content"/,
    )
    expect(catalogWxml).toMatch(
      /class="image-filter-option[^>]*bindtap="toggleFilter"[^>]*>[\s\S]*?<image class="image-filter-icon image-filter-icon--rarity"/,
    )
    expect(catalogWxml).toMatch(
      /class="image-filter-option[^>]*data-field="selectedTypes"[^>]*>[\s\S]*?<image class="image-filter-icon image-filter-icon--type"/,
    )
    expect(catalogWxml).toMatch(
      /class="image-filter-option[^>]*data-field="selectedGenders"[^>]*>[\s\S]*?<image class="image-filter-icon image-filter-icon--gender"/,
    )
    expect([...catalogWxml.matchAll(/class="filter-separator"/g)]).toHaveLength(2)
    const imageOnlyControlBlocks = [
      ...catalogWxml.matchAll(
        /<view[^>]*class="image-filter-option[^>]*>\s*<image[^>]*class="image-filter-icon[^>]*\/>\s*<\/view>/g,
      ),
    ]
    expect(imageOnlyControlBlocks).toHaveLength(3)

    const targetRule = cssRule('.image-filter-option')
    expect(targetRule).toMatch(/width:\s*88rpx;/)
    expect(targetRule).toMatch(/height:\s*88rpx;/)
    expect(targetRule).not.toMatch(/(?:background|border|border-radius)\s*:/)
    expect(cssRule('.image-filter-icon--rarity')).toMatch(/width:\s*58rpx;[\s\S]*height:\s*58rpx;/)
    expect(cssRule('.officer-filter-toolbar')).toMatch(/height:\s*100rpx;/)
    expect(cssRule('.filter-separator')).toMatch(
      /width:\s*1rpx;[\s\S]*height:\s*48rpx;[\s\S]*margin:\s*0 10rpx;/,
    )
    expect(cssRule('.officer-filter-toolbar__content')).toMatch(/min-width:\s*834rpx;/)
  })

  it('wraps every catalog skill icon in an 88rpx catchtap target without expanding the compact row', () => {
    expect(catalogWxml).toMatch(
      /<scroll-view class="row-skills"[^>]*scroll-x="true"[^>]*>[\s\S]*?<view[^>]*class="row-skill-hit-target"[^>]*catchtap="onSkillIconTap"[^>]*>[\s\S]*?<image[^>]*class="row-skill-icon"/,
    )
    expect(catalogWxml).toMatch(
      /class="row-skill-hit-target"[^>]*catchtap="onSkillIconTap"[^>]*data-kind="active"[^>]*>\s*<image[^>]*class="row-skill-icon"/,
    )
    expect(catalogWxml).toMatch(
      /class="row-skill-hit-target"[^>]*catchtap="onSkillIconTap"[^>]*data-kind="passive"[^>]*>\s*<image[^>]*class="row-skill-icon"/,
    )
    expect(catalogWxml).toMatch(/class="officer-row" bindtap="onOfficerTap"/)

    const skillTargetRule = cssRule('.row-skill-hit-target')
    expect(skillTargetRule).toMatch(/width:\s*88rpx;/)
    expect(skillTargetRule).toMatch(/height:\s*88rpx;/)
    expect(skillTargetRule).not.toMatch(/(?:background|border|border-radius)\s*:/)
    expect(cssRule('.row-skill-icon')).toMatch(/width:\s*32rpx;[\s\S]*height:\s*32rpx;/)
    expect(cssRule('.officer-row')).toMatch(/min-height:\s*116rpx;/)
    expect(cssRule('.row-skills')).toMatch(/width:\s*176rpx;[\s\S]*height:\s*92rpx;/)
  })
})
