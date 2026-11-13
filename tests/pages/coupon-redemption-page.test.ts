import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CouponProfile } from '../../miniprogram/contracts/coupon-redemption'
import type { CouponResultViewModel } from '../../miniprogram/presenters/coupon-redemption-presenter'

interface RedemptionPageData {
  couponNo: string
  submitDisabled: boolean
  isSubmitting: boolean
  players: Array<CouponProfile & { checked: boolean }>
  selectedCount: number
  completedCount: number
  results: Array<{ profile: CouponProfile; result: CouponResultViewModel | null }>
}

interface RedemptionPageConfig {
  data: RedemptionPageData
  onLoad(): void
  onShow(): void
  onUnload(): void
  onCouponInput(event: WechatMiniprogram.Input): void
  onSubmit(): Promise<void>
  onOpenSettings(): void
  onToggleAll(): void
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
  mockCallFunction.mockReset()
})

describe('兌換結果與發起玩家綁定', () => {
  const success = { result: { ok: true, data: { code: 'success', message: '獎勵已發送。' } } }
  it('同服同暱稱的歷史重複設定只計為一位玩家，保留目前設定', () => {
    seedProfile()
    const store = JSON.parse(storageValue as string)
    store.profiles.unshift({ ...store.profiles[0], id: 'duplicate' })
    storageValue = JSON.stringify(store)
    const page = createPageInstance()
    page.onLoad()
    expect(page.data.players).toMatchObject([{ id: 'profile-1', checked: true }])
    expect(page.data.selectedCount).toBe(1)
  })

  it('多選後逐批更新實際進度，保留逐位結果且不重送', async () => {
    seedProfile()
    const store = JSON.parse(storageValue as string)
    for (const [id, userNo] of [
      ['profile-2', '玩家乙'],
      ['profile-3', '玩家丙'],
    ]) {
      store.profiles.push({ ...store.profiles[0], id, userNo })
    }
    storageValue = JSON.stringify(store)
    const page = createPageInstance()
    page.onLoad()
    expect(page.data.selectedCount).toBe(1)
    page.onToggleAll()
    expect(page.data.selectedCount).toBe(3)

    let resolveFirst!: (value: unknown) => void
    let resolveSecond!: (value: unknown) => void
    mockCallFunction
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve
        }),
      )

    const submitting = page.onSubmit()
    expect(page.data.completedCount).toBe(0)
    expect(page.data.isSubmitting).toBe(true)
    page.onToggleAll()
    await page.onSubmit()
    expect(page.data.selectedCount).toBe(3)
    expect(mockCallFunction).toHaveBeenCalledTimes(1)
    resolveFirst({
      result: {
        ok: true,
        data: [
          { code: 'success', message: '獎勵已發送。' },
          { code: 'coupon-used', message: '已使用。' },
        ],
      },
    })
    await vi.waitFor(() => expect(page.data.completedCount).toBe(2))
    expect(page.data.isSubmitting).toBe(true)
    expect(page.data.results.map((row) => row.result?.label)).toEqual([
      '兌換成功',
      '兌換失敗',
      undefined,
    ])
    resolveSecond({ result: { ok: true, data: [{ code: 'unknown', message: '逾時' }] } })
    await submitting
    expect(page.data.completedCount).toBe(3)
    expect(page.data.isSubmitting).toBe(false)
    expect(page.data.results.map((row) => [row.profile.userNo, row.result?.label])).toEqual([
      ['航海家小明', '兌換成功'],
      ['玩家乙', '兌換失敗'],
      ['玩家丙', '需復核'],
    ])
    expect(mockCallFunction).toHaveBeenNthCalledWith(2, {
      name: 'coupon-redemption',
      data: {
        action: 'redeemBatch',
        couponNo: 'UPDATE2611',
        players: [{ gameServerId: 'UWOGL-US-01', userNo: '玩家丙' }],
      },
    })
  })

  const changeProfile = (key: keyof CouponProfile, value: string) => {
    const store = JSON.parse(storageValue as string)
    store.profiles[0][key] = value
    store.activeProfileId = store.profiles[0].id
    storageValue = JSON.stringify(store)
  }

  it('提交期間不能切換設定或改掉本次輸入', async () => {
    seedProfile()
    const page = createPageInstance()
    page.onLoad()
    let resolve!: (value: unknown) => void
    mockCallFunction.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const submitting = page.onSubmit()
    const code = page.data.couponNo
    page.onOpenSettings()
    page.onCouponInput({ detail: { value: 'NEW-CODE' } } as never)
    expect(wxStub.navigateTo).not.toHaveBeenCalled()
    expect(page.data.couponNo).toBe(code)
    resolve(success)
    await submitting
    expect(page.data.results[0]?.profile).toMatchObject({
      id: 'profile-1',
      name: '航海家小明',
      userNo: '航海家小明',
    })
  })

  it.each([
    ['id', 'profile-2'],
    ['gameServerId', 'UWOGL-US-02'],
    ['userNo', '第二暱稱'],
  ] as const)('成功結果遇玩家 %s 變更就清除，同一設定仍保留', async (key, value) => {
    seedProfile()
    mockCallFunction.mockResolvedValue(success)
    const page = createPageInstance()
    page.onLoad()
    await page.onSubmit()
    page.onShow()
    expect(page.data.results[0]?.result?.label).toBe('兌換成功')
    changeProfile(key, value)
    page.onShow()
    expect(page.data.results).toEqual([])
  })

  it.each(['success', 'failure'] as const)('A 的遲到 %s 不得在切換 B 後顯示', async (kind) => {
    seedProfile()
    const page = createPageInstance()
    page.onLoad()
    let resolve!: (value: unknown) => void
    mockCallFunction.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const submitting = page.onSubmit()
    changeProfile('id', 'profile-2')
    page.onShow()
    resolve(
      kind === 'success'
        ? success
        : { result: { ok: false, code: 'coupon-used', message: '已使用。' } },
    )
    await submitting
    expect(page.data.players).toMatchObject([{ id: 'profile-2', checked: true }])
    expect(page.data.results).toEqual([])
    expect(page.data.isSubmitting).toBe(false)
  })

  it.each(['coupon-used', 'coupon-expired', 'user-invalid', 'rate-limited'])(
    '已知 %s 保留失敗語義且不重試',
    async (code) => {
      seedProfile()
      mockCallFunction.mockResolvedValue({ result: { ok: false, code, message: '本次明確失敗。' } })
      const page = createPageInstance()
      page.onLoad()
      await page.onSubmit()
      expect(page.data.results[0]?.result).toMatchObject({
        label: '兌換失敗',
        message: '本次明確失敗。',
      })
      expect(mockCallFunction).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['unknown', 'transport'])('結果 %s 要先確認結果，無自動重試', async (kind) => {
    seedProfile()
    if (kind === 'transport') mockCallFunction.mockRejectedValue(new Error('連線已中斷'))
    else
      mockCallFunction.mockResolvedValue({
        result: { ok: false, code: 'unknown', message: '稍後再試。' },
      })
    const page = createPageInstance()
    page.onLoad()
    await page.onSubmit()
    expect(page.data.results[0]?.result).toMatchObject({ label: '需復核' })
    expect(page.data.results[0]?.result?.message).toContain('請先到官方頁面確認')
    expect(mockCallFunction).toHaveBeenCalledTimes(1)
  })

  it('卸載後遲到回覆不能再更新頁面', async () => {
    seedProfile()
    const page = createPageInstance()
    page.onLoad()
    let resolve!: (value: unknown) => void
    mockCallFunction.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const submitting = page.onSubmit()
    page.onUnload()
    const updates = vi.spyOn(page, 'setData')
    resolve(success)
    await submitting
    expect(updates).not.toHaveBeenCalled()
  })

  it('非法輸入不提交', async () => {
    seedProfile()
    const page = createPageInstance()
    page.onLoad()
    page.onCouponInput({ detail: { value: '' } } as never)
    await page.onSubmit()
    expect(mockCallFunction).not.toHaveBeenCalled()
  })
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
    expect(redemptionPage.data.couponNo).toBe('UPDATE2611')
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
    expect(redemptionWxss).toMatch(
      /\.coupon-redemption__actions\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*center;/s,
    )
    expect(redemptionWxss).toMatch(/\.coupon-redemption__submit\s*\{[^}]*max-width:\s*640rpx;/s)
  })
})
