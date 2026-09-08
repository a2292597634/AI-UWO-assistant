import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface RedemptionPageData {
  couponNo: string
  activeProfile: unknown | null
  submitDisabled: boolean
  isSubmitting: boolean
  result: unknown | null
}

interface RedemptionPageConfig {
  data: RedemptionPageData
  onLoad(): void
  onShow(): void
  onCouponInput(event: WechatMiniprogram.Input): void
  onSubmit(): Promise<void>
  onOpenSettings(): void
}

interface RedemptionPageInstance extends RedemptionPageConfig {
  data: RedemptionPageData
  setData(update: Record<string, unknown>): void
}

let redemptionPage: RedemptionPageConfig
let storageValue: unknown
const mockCallFunction = vi.fn()
const wxStub = {
  getStorageSync: vi.fn(() => storageValue),
  setStorageSync: vi.fn((_key: string, value: unknown) => {
    storageValue = value
  }),
  navigateTo: vi.fn(),
  showToast: vi.fn(),
  cloud: { callFunction: mockCallFunction },
}

const createPageInstance = (): RedemptionPageInstance => {
  const instance = Object.create(redemptionPage) as RedemptionPageInstance
  instance.data = structuredClone(redemptionPage.data)
  instance.setData = (update) => Object.assign(instance.data, update)
  return instance
}

const seedProfile = () => {
  storageValue = JSON.stringify({
    profiles: [
      {
        id: 'profile-1',
        name: '主力商會',
        gameServerId: 'UWOGL-US-01',
        userNo: '航海家小明',
      },
    ],
    activeProfileId: 'profile-1',
  })
}

beforeAll(async () => {
  vi.stubGlobal('Page', (config: RedemptionPageConfig) => {
    redemptionPage = config
  })
  vi.stubGlobal('wx', wxStub)
  await import('../../miniprogram/subpkg-coupon/pages/redemption/index')
})

beforeEach(() => {
  storageValue = undefined
  vi.clearAllMocks()
})

const redemptionWxml = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/subpkg-coupon/pages/redemption/index.wxml'),
  'utf8',
)
const redemptionWxss = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/subpkg-coupon/pages/redemption/index.wxss'),
  'utf8',
)

describe('兌換碼頁', () => {
  it('首次進入時預填指定兌換碼', () => {
    expect(redemptionPage.data.couponNo).toBe('FULLMOON2026')
  })

  it('沒有目前設定時禁用提交並可導向設定頁', () => {
    const page = createPageInstance()
    page.onLoad()

    expect(page.data.submitDisabled).toBe(true)
    page.onOpenSettings()
    expect(wxStub.navigateTo).toHaveBeenCalledWith({ url: '/subpkg-coupon/pages/settings/index' })
  })

  it('提交期間鎖定重複請求，結束後清空兌換碼', async () => {
    seedProfile()
    const page = createPageInstance()
    page.onLoad()
    page.onCouponInput({ detail: { value: 'UWO-1' } } as never)

    let resolveRequest: (value: unknown) => void = () => undefined
    mockCallFunction.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )

    const first = page.onSubmit()
    await page.onSubmit()
    expect(mockCallFunction).toHaveBeenCalledTimes(1)

    resolveRequest({
      result: { ok: true, data: { code: 'success', message: '獎勵已發送至遊戲內信箱。' } },
    })
    await first

    expect(page.data.couponNo).toBe('')
    expect(page.data.isSubmitting).toBe(false)
  })

  it('使用 Design Foundation 狀態與主要按鈕結構', () => {
    expect(redemptionWxml).toContain('ui-button ui-button--primary')
    expect(redemptionWxml).toContain('coupon-redemption__compact-button')
    expect(redemptionWxml).toContain('ui-status')
    expect(redemptionWxss).toContain('var(--uwo-color-canvas)')
    expect(redemptionWxss).toContain('env(safe-area-inset-bottom)')
    expect(redemptionWxss).toContain('min-height: 88rpx')
  })
})
