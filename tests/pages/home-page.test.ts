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
  openingNewMiniProgram: boolean
  migrationError: boolean
  modules: HomeModule[]
  supportEntries: Array<{ id: string; name: string; hint: string; route: string }>
}

interface HomePageConfig {
  data: HomePageData
  onLoad(): void
  onBannerError(): void
  onModuleIconError(event: WechatMiniprogram.BaseEvent): void
  onOpenNewMiniProgram(): void
}

interface HomePageInstance extends HomePageConfig {
  data: HomePageData
  setData(update: Record<string, unknown>): void
}

let homePage: HomePageConfig

const wxStub = {
  navigateToMiniProgram: vi.fn<(options: WechatMiniprogram.NavigateToMiniProgramOption) => void>(),
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
  it('留言板與資料錯誤回報同屬次級入口，且留言板仍有已註冊分包', () => {
    const page = createPageInstance()
    expect(page.data.supportEntries?.map((entry) => entry.id)).toEqual([
      'error-report',
      'message-board',
    ])
    const entry = page.data.supportEntries.find((item) => item.id === 'message-board')!
    expect(page.data.modules.slice(0, 6).some((item) => item.id === 'message-board')).toBe(false)
    const app = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../miniprogram/app.json'), 'utf8'),
    ) as { subpackages: Array<{ root: string; pages: string[] }> }
    const registered = app.subpackages.flatMap((part) =>
      part.pages.map((route) => '/' + part.root + '/' + route),
    )
    expect(registered).toContain(entry.route)
    expect(
      fs.existsSync(path.resolve(__dirname, '../../miniprogram' + entry.route + '.wxml')),
    ).toBe(true)
  })
  it('在首頁保留遮罩背景但移除舊功能入口的點擊操作', () => {
    expect(homeWxml).toContain('bindtap="onOpenNewMiniProgram"')
    expect(homeWxml).not.toContain('bindtap="onModuleTap"')
    expect(homeWxml).toContain('起源航海小助手')
  })

  it('只從按鈕開啟固定的新版正式版，等待微信回應期間防止連點', () => {
    const page = createPageInstance()
    page.onOpenNewMiniProgram()
    page.onOpenNewMiniProgram()

    expect(wxStub.navigateToMiniProgram).toHaveBeenCalledTimes(1)
    const options = wxStub.navigateToMiniProgram.mock.calls[0]![0]
    expect(options).toMatchObject({ appId: 'wxd0bc7afdc9cd334a', envVersion: 'release' })
    expect(options.path).toBeUndefined()
    expect(options.extraData).toBeUndefined()
    expect(page.data.openingNewMiniProgram).toBe(true)

    options.complete?.({ errMsg: 'navigateToMiniProgram:ok' })
    expect(page.data.openingNewMiniProgram).toBe(false)
  })

  it('取消後可重新開啟，其他失敗會顯示可重試的提示', () => {
    const page = createPageInstance()
    page.onOpenNewMiniProgram()
    const cancelled = wxStub.navigateToMiniProgram.mock.calls[0]![0]
    const cancelError = { errMsg: 'navigateToMiniProgram:fail cancel' }
    cancelled.fail?.(cancelError)
    cancelled.complete?.(cancelError)
    expect(page.data.migrationError).toBe(false)

    page.onOpenNewMiniProgram()
    const failed = wxStub.navigateToMiniProgram.mock.calls[1]![0]
    const otherError = { errMsg: 'navigateToMiniProgram:fail app not found' }
    failed.fail?.(otherError)
    failed.complete?.(otherError)
    expect(page.data.migrationError).toBe(true)

    page.onOpenNewMiniProgram()
    expect(wxStub.navigateToMiniProgram).toHaveBeenCalledTimes(3)
    expect(page.data.migrationError).toBe(false)
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
    expect(homeWxml).toContain('supportEntries')
    expect(homeWxss).toMatch(/width:\s*33\.333333%/)
  })

  it('大流行背景圖示失敗時仍顯示名稱與替代圖形', () => {
    const page = createPageInstance()
    page.onModuleIconError({ currentTarget: { dataset: { index: '4' } } } as never)

    expect(page.data.modules[4]).toMatchObject({
      id: 'major-events',
      name: '大流行時刻表',
      iconFailed: true,
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
    expect(homeWxml).toContain('交流與回報')
  })
})
