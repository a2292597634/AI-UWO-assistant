import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface SettingsPageData {
  gameServers: Array<{ id: string; name: string }>
  profiles: unknown[]
  form: { gameServerId: string; userNo: string }
  editingId: string | null
  deleteTargetId: string | null
  isEmpty: boolean
}

interface SettingsPageConfig {
  data: SettingsPageData
  onLoad(): void
  onServerChange(event: WechatMiniprogram.PickerChange): void
  onSaveProfile(): void
  onRequestDeleteProfile(event: WechatMiniprogram.BaseEvent): void
  onConfirmDeleteProfile(): void
  onUseProfile(event: WechatMiniprogram.BaseEvent): void
}

interface SettingsPageInstance extends SettingsPageConfig {
  data: SettingsPageData
  setData(update: Record<string, unknown>): void
}

let settingsPage: SettingsPageConfig
let storageValue: unknown

const wxStub = {
  getStorageSync: vi.fn(() => storageValue),
  setStorageSync: vi.fn((_key: string, value: unknown) => {
    storageValue = value
  }),
  showToast: vi.fn(),
  showModal: vi.fn(),
  navigateBack: vi.fn(),
}

const createPageInstance = (): SettingsPageInstance => {
  const instance = Object.create(settingsPage) as SettingsPageInstance
  instance.data = structuredClone(settingsPage.data)
  instance.setData = (update) => Object.assign(instance.data, update)
  return instance
}

beforeAll(async () => {
  vi.stubGlobal('Page', (config: SettingsPageConfig) => {
    settingsPage = config
  })
  vi.stubGlobal('wx', wxStub)
  await import('../../miniprogram/subpkg-coupon/pages/settings/index')
})

beforeEach(() => {
  storageValue = undefined
  vi.clearAllMocks()
})

const settingsWxml = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/subpkg-coupon/pages/settings/index.wxml'),
  'utf8',
)
const settingsWxss = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/subpkg-coupon/pages/settings/index.wxss'),
  'utf8',
)

describe('兌換設定頁', () => {
  it('空設定時顯示新增狀態', () => {
    const page = createPageInstance()
    page.onLoad()

    expect(page.data.isEmpty).toBe(true)
    expect(page.data.profiles).toEqual([])
  })

  it('保存設定後寫入本機 storage', () => {
    const page = createPageInstance()
    page.data.form = {
      gameServerId: 'UWOGL-US-01',
      userNo: '航海家小明',
    }

    page.onSaveProfile()

    expect(wxStub.setStorageSync).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(storageValue)).profiles).toEqual([
      expect.objectContaining({
        name: '航海家小明',
        gameServerId: 'UWOGL-US-01',
        userNo: '航海家小明',
      }),
    ])
  })

  it('使用官方伺服器 picker、刪除確認與 Design Foundation 控件', () => {
    expect(settingsWxml).toContain('picker mode="selector"')
    expect(settingsWxml).toContain('range="{{gameServers}}"')
    expect(settingsWxml).toContain('bindtap="onConfirmDeleteProfile"')
    expect(settingsWxml).not.toContain('設定名稱')
    expect(settingsWxml).not.toContain('form.name')
    expect(settingsWxml).toContain('coupon-settings__profile-actions--row')
    expect(settingsWxml).toContain('ui-button--compact')
    expect(settingsWxss).toContain('var(--uwo-color-canvas)')
    expect(settingsWxss).toContain('min-height: 88rpx')
    expect(settingsWxss).not.toMatch(
      /\.coupon-settings__profile-actions\s*\{[^}]*flex-direction:\s*column/s,
    )
  })
})
