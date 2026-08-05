import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

interface DetailPageData {
  officer: { name: string } | null
  assetLoading: boolean
  assetLoadError: string | null
  assetReady: boolean
  [key: string]: unknown
}

interface DetailPageConfig {
  data: DetailPageData
  onLoad(options: Record<string, string | undefined>): Promise<void>
  onReady(): Promise<void>
  retryAssetLoading(): Promise<void>
  onPortraitError(): void
  onSkillImageError(event: WechatMiniprogram.BaseEvent): void
}

interface DetailPageInstance extends DetailPageConfig {
  data: DetailPageData
  setData(update: Record<string, unknown>): void
}

let detailPage: DetailPageConfig
const wxStub = {
  setNavigationBarTitle: vi.fn(),
  navigateTo: vi.fn(),
  navigateBack: vi.fn((options: { success?: () => void }) => options.success?.()),
}

const createPageInstance = (): DetailPageInstance => {
  const instance = Object.create(detailPage) as DetailPageInstance
  instance.data = structuredClone(detailPage.data)
  instance.setData = (update) => Object.assign(instance.data, update)
  return instance
}

beforeAll(async () => {
  vi.stubGlobal('Page', (config: DetailPageConfig) => {
    detailPage = config
  })
  vi.stubGlobal('wx', { ...wxStub })
  await import('../../miniprogram/subpkg-detail/pages/detail/index')
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('detail page CDN assets', () => {
  it('renders detail text and direct image URLs without package navigation', async () => {
    const page = createPageInstance()
    await page.onLoad({ id: 'officer_chast089' })
    await page.onReady()

    expect(page.data.assetReady).toBe(true)
    expect(page.data.assetLoading).toBe(false)
    expect(wxStub.navigateTo).not.toHaveBeenCalled()
  })

  it('loads direct detail data on an entry URL', async () => {
    const page = createPageInstance()
    await page.onLoad({ id: 'officer_chast089' })
    await page.onReady()

    expect(page.data.officer).not.toBeNull()
    expect(page.data.assetLoading).toBe(false)
    expect(page.data.assetLoadError).toBeNull()
    expect(page.data.assetReady).toBe(true)
    expect(page.data.officer).toEqual(expect.objectContaining({ name: expect.any(String) }))
  })

  it('keeps detail text visible after an image failure and supports retry', async () => {
    const page = createPageInstance()

    await page.onLoad({ id: 'officer_chast089' })
    await page.onReady()

    expect(page.data.officer).not.toBeNull()
    page.onPortraitError()
    expect(page.data.portraitFail).toBe(true)

    await page.retryAssetLoading()
    expect(page.data.assetReady).toBe(true)
    expect(page.data.assetLoadError).toBeNull()
  })

  it('isolates one failed skill icon without hiding the portrait or other skill text', async () => {
    const page = createPageInstance()
    await page.onLoad({ id: 'officer_chast089' })
    await page.onReady()

    const skillId = (page.data.activeSkills as Array<{ skillId: string }>)[0]!.skillId
    page.onSkillImageError({ currentTarget: { dataset: { skillId } } } as never)

    expect(page.data.assetReady).toBe(true)
    expect(page.data.assetLoadError).toBeNull()
    expect(page.data.failedSkillImages).toEqual({ [skillId]: true })
  })

  it('uses direct image loading and keeps a text fallback in the detail template', () => {
    const wxml = fs.readFileSync(
      path.resolve(__dirname, '../../miniprogram/subpkg-detail/pages/detail/index.wxml'),
      'utf8',
    )
    expect(wxml).not.toContain('asset-loading-state')
    expect(wxml).not.toContain('lazy-load="true"')
    expect(wxml).toContain('portrait-fallback')
    expect(wxml).toContain('skill-icon--placeholder')
    // Level badge wrapper and condition
    expect(wxml).toContain('detail-skill-icon-wrapper')
    expect(wxml).toContain('skill-level-badge')
    expect(wxml).toContain('item.level !== 1')
  })

  it('shows Lv.N badge only when detail skill level is not 1', () => {
    const wxss = fs.readFileSync(
      path.resolve(__dirname, '../../miniprogram/subpkg-detail/pages/detail/index.wxss'),
      'utf8',
    )
    expect(wxss).toMatch(/\.detail-skill-icon-wrapper\s*\{[\s\S]*position:\s*relative/)
    expect(wxss).toMatch(/\.skill-level-badge\s*\{[\s\S]*position:\s*absolute/)
  })
})
