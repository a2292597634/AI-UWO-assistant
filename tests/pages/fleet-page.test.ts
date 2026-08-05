import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

interface FleetTestData {
  shipTabs: unknown[]
  mode: string
  currentShip: { slots: unknown[] }
  targets: unknown[]
  fleetOverview: unknown[]
  assetLoading: boolean
  assetLoadError: string | null
  assetReady: boolean
  sheetSkill: unknown
  manualSkillId: string | null
  bannedOfficers: unknown[]
  [key: string]: unknown
}

interface FleetPageConfig {
  data: FleetTestData
  onLoad(): Promise<void>
  onReady(): Promise<void>
  retryAssetLoading(): Promise<void>
  onImageError(event: WechatMiniprogram.BaseEvent): void
  onSkillListReachEnd(): void
  onModeTap(event: WechatMiniprogram.BaseEvent): void
  onSkillTap(event: WechatMiniprogram.BaseEvent): void
  onAddTarget(): void
  onTargetLevelBlur(event: WechatMiniprogram.Input): void
  onRemoveTarget(event: WechatMiniprogram.BaseEvent): void
  onRecalculate(): void
  onOfficerSelect(event: WechatMiniprogram.BaseEvent): void
  onOfficerRemove(event: WechatMiniprogram.BaseEvent): void
  onBanOfficer(event: WechatMiniprogram.BaseEvent): void
  onSkillSelect(event: WechatMiniprogram.BaseEvent): void
  onSheetDismiss(): void
}

interface FleetPageInstance extends FleetPageConfig {
  data: FleetTestData
  setData(update: Record<string, unknown>): void
}

let fleetPage: FleetPageConfig
const wxStub = {
  showToast: vi.fn(),
  showModal: vi.fn(),
  setNavigationBarTitle: vi.fn(),
  navigateTo: vi.fn(),
  navigateBack: vi.fn((options: { success?: () => void }) => options.success?.()),
}

const createPageInstance = (): FleetPageInstance => {
  const instance = Object.create(fleetPage) as FleetPageInstance
  instance.data = structuredClone(fleetPage.data)
  instance.setData = (update) => Object.assign(instance.data, update)
  return instance
}

beforeAll(async () => {
  vi.stubGlobal('Page', (config: FleetPageConfig) => {
    fleetPage = config
  })
  vi.stubGlobal('wx', wxStub)

  await import('../../miniprogram/pages/fleet/index')
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('battle fleet page', () => {
  it('renders direct assets during the initial lifecycle without package navigation', async () => {
    const page = createPageInstance()
    const loading = page.onLoad()

    await Promise.resolve()
    expect(wxStub.navigateTo).not.toHaveBeenCalled()

    await page.onReady()
    await loading

    expect(page.data.assetReady).toBe(true)
    expect(wxStub.navigateTo).not.toHaveBeenCalled()
  })

  it('registers with seven ship tabs, eleven slots, and manual mode', () => {
    const page = createPageInstance()
    page.onLoad()

    expect(page.data.shipTabs).toHaveLength(7)
    expect(page.data.mode).toBe('manual')
    expect(page.data.currentShip.slots).toHaveLength(11)
  })

  it('loads skill data when entering the fleet page directly', async () => {
    const page = createPageInstance()
    await page.onLoad()
    await page.onReady()

    expect(page.data.assetLoading).toBe(false)
    expect(page.data.assetLoadError).toBeNull()
    expect(page.data.assetReady).toBe(true)
    expect(wxStub.navigateTo).not.toHaveBeenCalled()
  })

  it('renders fleet skill icons in bounded scroll windows', async () => {
    const page = createPageInstance()
    await page.onLoad()

    const firstWindow = page.data.manualSkills as unknown[]
    expect(firstWindow.length).toBeGreaterThan(0)
    expect(firstWindow.length).toBeLessThanOrEqual(40)

    page.onSkillListReachEnd()
    expect((page.data.manualSkills as unknown[]).length).toBeGreaterThan(firstWindow.length)
  })

  it('keeps the fleet text view after a direct image failure and supports retry', async () => {
    const page = createPageInstance()
    await page.onLoad()
    await page.onReady()

    expect(page.data.currentShip).toBeDefined()
    page.onImageError({
      currentTarget: { dataset: { kind: 'portrait', id: 'officer_chast089' } },
    } as never)
    expect(page.data.assetReady).toBe(true)
    expect(page.data.assetLoadError).toBeNull()
    expect(page.data.failedPortraitImages).toEqual({ officer_chast089: true })

    await page.retryAssetLoading()
    expect(page.data.assetReady).toBe(true)
    expect(page.data.assetLoadError).toBeNull()
  })

  it('adds an auto target without changing another ship and recalculates explicitly', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)
    page.onAddTarget()

    expect(page.data.targets).toHaveLength(2)
    page.onRecalculate()
    expect(page.data.fleetOverview).toHaveLength(7)
  })

  it('assigns a skill to a target via the explicit select action in auto mode', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)

    page.onSkillSelect({ currentTarget: { dataset: { id: 'skill-cannon' } } } as never)
    expect(page.data.targets[0]).toMatchObject({ skillId: 'skill-cannon', targetLevel: 1 })
  })

  it('opens the skill sheet on single tap and sets manualSkillId on select in manual mode', () => {
    const page = createPageInstance()
    page.onLoad()

    page.onSkillTap({ currentTarget: { dataset: { id: 'skill_skill200681' } } } as never)
    expect(page.data.sheetSkill).toBeDefined()
    expect((page.data.sheetSkill as { id: string }).id).toBe('skill_skill200681')

    page.onSheetDismiss()
    expect(page.data.sheetSkill).toBeNull()

    page.onSkillSelect({ currentTarget: { dataset: { id: 'skill_skill200681' } } } as never)
    expect(page.data.manualSkillId).toBe('skill_skill200681')
  })

  it('excludes an unlocked officer from the current ship and adds to bannedOfficers', () => {
    const page = createPageInstance()
    page.onLoad()

    // Add an officer to ship-1
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    const shipAfterAdd = page.data.currentShip
    expect(
      shipAfterAdd.slots.some(
        (s: unknown) =>
          (s as { officer: { id: string } | null }).officer?.id === 'officer_chast089',
      ),
    ).toBe(true)

    // Ban the officer from the current ship
    page.onBanOfficer({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)

    // After ban, ship should be empty and bannedOfficers should contain the officer
    const shipAfterBan = page.data.currentShip
    expect(
      shipAfterBan.slots.some(
        (s: unknown) =>
          (s as { officer: { id: string } | null }).officer?.id === 'officer_chast089',
      ),
    ).toBe(false)
    expect(page.data.bannedOfficers).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'officer_chast089' })]),
    )
  })

  it('updates a target level from direct input and deletes the target row', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)
    const targetId = (page.data.targets[0] as { id: string }).id

    page.onTargetLevelBlur({
      currentTarget: { dataset: { id: targetId } },
      detail: { value: '10' },
    } as never)
    expect((page.data.targets[0] as { targetLevel: number }).targetLevel).toBe(10)

    page.onRemoveTarget({ currentTarget: { dataset: { id: targetId } } } as never)
    expect(page.data.targets).toEqual([])
  })
})

const fleetWxml = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/pages/fleet/index.wxml'),
  'utf8',
)
const fleetWxss = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/pages/fleet/index.wxss'),
  'utf8',
)

describe('fleet slot action touch targets', () => {
  it('keeps six columns and gives each fleet action a large bottom icon tile', () => {
    expect(fleetWxml).toMatch(/<view class="officer-slot__actions">/)
    expect(fleetWxml).toMatch(
      /<view\s+class="slot-action[^"]*"[\s\S]*?bindtap="onOfficerLock"[\s\S]*?class="slot-action__glyph"/,
    )
    expect(fleetWxml).toMatch(
      /<view\s+class="slot-action[^"]*"[\s\S]*?bindtap="onOfficerRemove"[\s\S]*?class="slot-action__glyph"/,
    )
    expect(fleetWxml).toMatch(
      /<view\s+class="slot-action[^"]*"[\s\S]*?bindtap="onBanOfficer"[\s\S]*?class="slot-action__glyph"/,
    )
    expect(fleetWxml).toMatch(/class="slot-action__label"/)
    // Visual layers
    expect(fleetWxml).toContain('officer-slot__visuals')
    expect(fleetWxml).toContain('officer-slot__frame')
    expect(fleetWxml).toContain('officer-slot__rarity-icon')
    expect(fleetWxml).toContain('officer-slot__type-icon')
    expect(fleetWxml).toContain('item.officer.visuals.framePath')
    expect(fleetWxss).toMatch(/\.slot-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,\s*1fr\)/)
    expect(fleetWxss).toMatch(/\.officer-slot\s*\{[\s\S]*min-height:\s*180rpx/)
    expect(fleetWxss).toMatch(
      /\.officer-slot__actions\s*\{[\s\S]*position:\s*absolute[\s\S]*bottom:/,
    )
    expect(fleetWxss).toMatch(
      /\.officer-slot__actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*1fr\)/,
    )
    expect(fleetWxss).toMatch(/\.slot-action\s*\{[\s\S]*min-height:\s*64rpx/)
  })

  it('uses direct image loading without a local asset loading route', () => {
    expect(fleetWxml).not.toContain('asset-loading-state')
    expect(fleetWxml).not.toContain('lazy-load="true"')
    expect(fleetWxml).toContain('binderror="onImageError"')
    expect(fleetWxml).toContain('bindscrolltolower="onSkillListReachEnd"')
  })
})
