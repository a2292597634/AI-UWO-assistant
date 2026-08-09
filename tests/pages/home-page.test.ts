import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface HomeModule {
  id: string
  name: string
  iconPath: string
  route: string
  iconFailed: boolean
}

interface HomePageData {
  title: string
  count: number
  bannerFailed: boolean
  modules: HomeModule[]
}

interface HomePageConfig {
  data: HomePageData
  onLoad(): void
  onBannerError(): void
  onModuleIconError(event: WechatMiniprogram.BaseEvent): void
  onModuleTap(event: WechatMiniprogram.BaseEvent): void
}

interface HomePageInstance extends HomePageConfig {
  data: HomePageData
  setData(update: Record<string, unknown>): void
}

let homePage: HomePageConfig

const wxStub = {
  navigateTo: vi.fn(),
}

const createPageInstance = (): HomePageInstance => {
  const instance = Object.create(homePage) as HomePageInstance
  instance.data = structuredClone(homePage.data)
  instance.setData = (update) => Object.assign(instance.data, update)
  return instance
}

beforeAll(async () => {
  vi.stubGlobal('Page', (config: HomePageConfig) => {
    homePage = config
  })
  vi.stubGlobal('wx', wxStub)

  await import('../../miniprogram/pages/home/index')
})

beforeEach(() => {
  vi.clearAllMocks()
})

const homeWxml = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/pages/home/index.wxml'),
  'utf8',
)
const homeWxss = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/pages/home/index.wxss'),
  'utf8',
)

describe('首頁功能入口', () => {
  it('保留現有模組路由事件', () => {
    const page = createPageInstance()

    page.onModuleTap({ currentTarget: { dataset: { route: '/pages/fleet/index' } } } as never)

    expect(wxStub.navigateTo).toHaveBeenCalledWith({ url: '/pages/fleet/index' })
  })

  it('保留三個主要模組並將資料維護降級為次級入口', () => {
    expect(homePage.data.modules.map((module) => module.id)).toEqual([
      'officer-catalog',
      'battle-fleet',
      'adventure-fleet',
      'data-maintenance',
    ])
    expect(homePage.data.modules[1]).toMatchObject({
      name: '戰鬥模擬艦隊',
      iconPath: '/assets/ui/feature-battle-fleet.png',
    })
    expect(homePage.data.modules[2]).toMatchObject({
      name: '冒險模擬艦隊',
      iconPath: '/assets/ui/feature-adventure-fleet.png',
    })
    expect(homePage.data.modules[homePage.data.modules.length - 1]).toMatchObject({
      name: '資料維護',
      route: '/pages/officer-editor/index',
      iconPath: '/assets/ui/feature-data-maintenance.png',
    })
  })

  it('不以 Emoji、Unicode 或首字作為正式圖標回退', () => {
    const legacyFallbackBinding = ['icon', 'Fallback'].join('')

    expect(homeWxml).not.toContain(legacyFallbackBinding)
    expect(homeWxml).toContain('module-grid__icon-fallback')
    expect(homeWxss).not.toMatch(/font-size:\s*34rpx/)
  })

  it('收斂 Hero 並保留資料維護次級入口的結構鉤子', () => {
    expect(homeWxss).toContain('height: 240rpx')
    expect(homeWxml).toContain('module-grid--secondary')
    expect(homeWxml).toContain('資料維護')
  })
})
