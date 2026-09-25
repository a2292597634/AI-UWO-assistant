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
  instance.setData = (update) => {
    for (const [key, value] of Object.entries(update)) {
      const moduleIconMatch = /^modules\[(\d+)\]\.iconFailed$/.exec(key)
      if (moduleIconMatch) {
        const moduleIndex = Number(moduleIconMatch[1])
        if (instance.data.modules[moduleIndex] !== undefined) {
          instance.data.modules[moduleIndex]!.iconFailed = value === true
        }
      } else {
        Object.assign(instance.data, { [key]: value })
      }
    }
  }
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

    page.onModuleTap({
      currentTarget: { dataset: { route: '/subpkg-fleet/pages/index/index' } },
    } as never)

    expect(wxStub.navigateTo).toHaveBeenCalledWith({ url: '/subpkg-fleet/pages/index/index' })
  })

  it('顯示六個主要模組並將資料錯誤回報降級為次級入口', () => {
    expect(homePage.data.modules.map((module) => module.id)).toEqual([
      'officer-catalog',
      'battle-fleet',
      'adventure-fleet',
      'trade-goods',
      'major-events',
      'coupon-redemption',
      'error-report',
    ])
    expect(homePage.data.modules).toHaveLength(7)
    expect(homePage.data.modules[3]).toMatchObject({
      name: '交易品淡旺季查询',
      iconPath: '/assets/ui/feature-trade-goods.png',
      route: '/subpkg-trade/pages/index/index',
    })
    expect(homePage.data.modules[1]).toMatchObject({
      name: '戰鬥模擬艦隊',
      iconPath: '/assets/ui/feature-battle-fleet.png',
    })
    expect(homePage.data.modules[2]).toMatchObject({
      name: '冒險模擬艦隊',
      iconPath: '/assets/ui/feature-adventure-fleet.png',
    })
    expect(homePage.data.modules[4]).toMatchObject({
      id: 'major-events',
      name: '大流行時刻表',
      iconPath: '/assets/ui/feature-major-events.png',
      iconFailed: false,
      route: '/subpkg-trade/pages/popularity/index',
    })
    expect(homePage.data.modules[5]).toMatchObject({
      id: 'coupon-redemption',
      name: '兌換碼',
      iconPath: '/assets/ui/feature-coupon.png',
      iconFailed: false,
      route: '/subpkg-coupon/pages/redemption/index',
    })
    expect(homePage.data.modules[homePage.data.modules.length - 1]).toMatchObject({
      name: '資料錯誤回報',
      route: '/pages/officer-editor/index',
      iconPath: '/assets/ui/feature-data-maintenance.png',
    })
    expect(homeWxml).toContain('index < 6')
    expect(homeWxml).toContain("item.id === 'error-report'")
    expect(homeWxss).toMatch(/width:\s*33\.333333%/)
  })

  it('keeps the major-event entry visible and navigable after its icon fails', () => {
    const page = createPageInstance()
    page.onModuleIconError({ currentTarget: { dataset: { index: '4' } } } as never)

    expect(page.data.modules[4]).toMatchObject({
      id: 'major-events',
      name: '大流行時刻表',
      iconFailed: true,
    })
    page.onModuleTap({
      currentTarget: { dataset: { route: page.data.modules[4]?.route } },
    } as never)
    expect(wxStub.navigateTo).toHaveBeenCalledWith({
      url: '/subpkg-trade/pages/popularity/index',
    })
    expect(homeWxml).toContain('module-grid__icon-fallback')
  })

  it('不以 Emoji、Unicode 或首字作為正式圖標回退', () => {
    const legacyFallbackBinding = ['icon', 'Fallback'].join('')

    expect(homeWxml).not.toContain(legacyFallbackBinding)
    expect(homeWxml).toContain('module-grid__icon-fallback')
    expect(homeWxss).not.toMatch(/font-size:\s*34rpx/)
  })

  it('收斂 Hero 並保留資料錯誤回報次級入口的結構鉤子', () => {
    expect(homeWxss).toContain('height: 280rpx')
    expect(homeWxml).toContain('module-grid--secondary')
    expect(homeWxml).toContain('資料回報')
  })
})
