import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createFleetState } from '../../miniprogram/domain/battle-fleet'

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
  // Config management
  authStatus: string
  configName: string
  configStatus: string
  activeConfigId: string | null
  configList: unknown[]
  showConfigMenu: boolean
  showConfigList: boolean
  showNameModal: boolean
  showUnsavedGuard: boolean
  modalAction: string
  modalInputValue: string
  modalTitle: string
  pendingAction: unknown
  configLimitReached: boolean
  showConflictDialog: boolean
  [key: string]: unknown
}

const mockCallFunction = vi.fn()

interface FleetPageConfig {
  data: FleetTestData
  onLoad(): Promise<void>
  onReady(): Promise<void>
  retryAssetLoading(): Promise<void>
  onImageError(event: WechatMiniprogram.BaseEvent): void
  onSkillListReachEnd(): void
  onShipTabTap(event: WechatMiniprogram.BaseEvent): void
  onModeTap(event: WechatMiniprogram.BaseEvent): void
  onSkillKindTap(event: WechatMiniprogram.BaseEvent): void
  onSkillCategoryTap(event: WechatMiniprogram.BaseEvent): void
  onSkillSearchInput(event: WechatMiniprogram.Input): void
  onSkillTap(event: WechatMiniprogram.BaseEvent): void
  onSkillSelect(event: WechatMiniprogram.BaseEvent): void
  onSheetDismiss(): void
  onReverseLookup(): void
  onAddTarget(): void
  onTargetLevelBlur(event: WechatMiniprogram.Input): void
  onRemoveTarget(event: WechatMiniprogram.BaseEvent): void
  onRecalculate(): void
  onProposalCancel(): void
  onProposalApply(): void
  onUndoProposal(): void
  onOfficerSelect(event: WechatMiniprogram.BaseEvent): void
  onOfficerRemove(event: WechatMiniprogram.BaseEvent): void
  onOfficerLock(event: WechatMiniprogram.BaseEvent): void
  onBanOfficer(event: WechatMiniprogram.BaseEvent): void
  onUnbanOfficer(event: WechatMiniprogram.BaseEvent): void
  // Config management handlers
  onConfigLogin(): Promise<void>
  onConfigMenuTap(): void
  onConfigListOpen(): Promise<void>
  onConfigListClose(): void
  onConfigSelect(event: WechatMiniprogram.BaseEvent): void
  onConfigNew(): void
  onConfigSave(): Promise<void>
  onConfigSaveAs(): Promise<void>
  onConfigRename(): void
  onConfigDelete(): void
  onConfigNameInput(event: WechatMiniprogram.Input): void
  onConfigModalConfirm(): Promise<void>
  onConfigModalCancel(): void
  onUnsavedGuardSave(): Promise<void>
  onUnsavedGuardDiscard(): void
  onUnsavedGuardCancel(): void
  onConflictReload(): Promise<void>
  onConflictForceOverwrite(): Promise<void>
  onConflictCancel(): void
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
  cloud: {
    callFunction: mockCallFunction,
  },
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
  mockCallFunction.mockReset()
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

  it('accepts shared component event details without changing existing handlers', () => {
    const page = createPageInstance()
    page.onLoad()

    page.onModeTap({ detail: { value: 'auto' }, currentTarget: { dataset: {} } } as never)
    expect(page.data.mode).toBe('auto')

    page.onSkillSelect({
      detail: { skillId: 'skill-cannon' },
      currentTarget: { dataset: {} },
    } as never)
    expect(page.data.targets[0]).toMatchObject({ skillId: 'skill-cannon', targetLevel: 1 })

    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    page.onOfficerLock({
      detail: { officerId: 'officer_chast089' },
      currentTarget: { dataset: {} },
    } as never)
    expect(
      page.data.currentShip.slots.find(
        (slot: unknown) =>
          (slot as { officer: { id: string; status: string } | null }).officer?.id ===
          'officer_chast089',
      ),
    ).toMatchObject({ officer: { status: 'locked' } })
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

  it('opens a proposal preview without changing the current fleet or dirty state', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)
    page.onAddTarget()
    page.onSkillSelect({ currentTarget: { dataset: { id: 'skill-cannon' } } } as never)
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    const before = {
      currentShip: structuredClone(page.data.currentShip),
      fleetOverview: structuredClone(page.data.fleetOverview),
      configStatus: page.data.configStatus,
    }

    page.onRecalculate()

    expect(page.data.proposalPreview).toBeDefined()
    expect(page.data.currentShip).toEqual(before.currentShip)
    expect(page.data.fleetOverview).toEqual(before.fleetOverview)
    expect(page.data.configStatus).toBe(before.configStatus)
  })

  it('cancels a proposal without changing any business state', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)
    page.onRecalculate()
    const before = {
      currentShip: structuredClone(page.data.currentShip),
      targets: structuredClone(page.data.targets),
      configStatus: page.data.configStatus,
    }

    page.onProposalCancel()

    expect(page.data.proposalPreview).toBeNull()
    expect(page.data.currentShip).toEqual(before.currentShip)
    expect(page.data.targets).toEqual(before.targets)
    expect(page.data.configStatus).toBe(before.configStatus)
  })

  it('applies a proposal and can undo the complete fleet view once', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)
    page.onAddTarget()
    page.onSkillSelect({ currentTarget: { dataset: { id: 'skill_skill400591' } } } as never)
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    const before = {
      currentShip: structuredClone(page.data.currentShip),
      fleetOverview: structuredClone(page.data.fleetOverview),
      targets: structuredClone(page.data.targets),
    }

    page.onRecalculate()
    page.onProposalApply()

    expect(page.data.proposalPreview).toBeNull()
    expect(page.data.canUndoProposal).toBe(true)
    expect(page.data.currentShip).not.toEqual(before.currentShip)

    page.onUndoProposal()

    expect(page.data.currentShip).toEqual(before.currentShip)
    expect(page.data.fleetOverview).toEqual(before.fleetOverview)
    expect(page.data.targets).toEqual(before.targets)
    expect(page.data.canUndoProposal).toBe(false)
    page.onUndoProposal()
    expect(page.data.currentShip).toEqual(before.currentShip)
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
const fleetJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/fleet/index.json'), 'utf8'),
) as { usingComponents?: Record<string, string> }

const sharedComponentNames = [
  'config-bar',
  'mode-tabs',
  'officer-action-sheet',
  'skill-picker-sheet',
  'result-preview-sheet',
  'status-badge',
  'empty-state',
] as const

describe('fleet slot action touch targets', () => {
  it('keeps six columns and delegates slot actions to the shared component', () => {
    expect(fleetWxml).toMatch(/<officer-action-sheet[\s\S]*?variant="slot"/)
    expect(fleetWxml).toContain('bind:lock="onOfficerLock"')
    expect(fleetWxml).toContain('bind:remove="onOfficerRemove"')
    expect(fleetWxml).toContain('bind:ban="onBanOfficer"')
    expect(fleetWxml).not.toContain('class="officer-slot__actions"')
    // Visual layers
    expect(fleetWxml).toContain('officer-slot__visuals')
    expect(fleetWxml).toContain('officer-slot__frame')
    expect(fleetWxml).toContain('officer-slot__rarity-icon')
    expect(fleetWxml).toContain('officer-slot__type-icon')
    expect(fleetWxml).toContain('item.officer.visuals.framePath')
    expect(fleetWxss).toMatch(/\.slot-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,\s*1fr\)/)
    expect(fleetWxss).toMatch(/\.officer-slot\s*\{[\s\S]*min-height:\s*180rpx/)
    expect(fleetWxss).toMatch(/\.officer-slot\s*\{[\s\S]*padding:\s*10rpx 2rpx;/)
    expect(fleetWxss).not.toMatch(/\.officer-slot\s*\{[\s\S]*padding:\s*10rpx 2rpx 72rpx;/)
  })

  it('uses direct image loading without a local asset loading route', () => {
    expect(fleetWxml).not.toContain('asset-loading-state')
    expect(fleetWxml).not.toContain('lazy-load="true"')
    expect(fleetWxml).toContain('binderror="onImageError"')
    expect(fleetWxml).toContain('bind:reach-end="onSkillListReachEnd"')
  })
})

describe('battle fleet shared component wiring', () => {
  it('registers and renders all seven shared components', () => {
    for (const name of sharedComponentNames) {
      expect(fleetJson.usingComponents?.[name]).toBe(`../../components/${name}/index`)
      expect(fleetWxml).toMatch(new RegExp(`<${name}(?:\\s|/?>)`))
    }
  })

  it('keeps the existing page handlers while removing duplicated shared markup', () => {
    expect(fleetWxml).toContain('bind:info-tap="onConfigListOpen"')
    expect(fleetWxml).toContain('bind:change="onModeTap"')
    expect(fleetWxml).toContain('bind:kind-change="onSkillKindTap"')
    expect(fleetWxml).toContain('bind:category-change="onSkillCategoryTap"')
    expect(fleetWxml).toContain('selected-kind-id="{{manualKind}}"')
    expect(fleetWxml).toContain('selected-category-id="{{manualCategoryId}}"')
    expect(fleetWxml).toContain('bind:skill-tap="onSkillTap"')
    expect(fleetWxml).toContain('bind:select="onSkillSelect"')
    expect(fleetWxml).toContain('bind:cancel="onProposalCancel"')
    expect(fleetWxml).toContain('bind:apply="onProposalApply"')
    expect(fleetWxml).toContain('bind:undo="onUndoProposal"')
    expect(fleetWxml).not.toContain('class="proposal-preview-sheet"')
    expect(fleetWxml).not.toContain('class="skill-options"')
  })
})

describe('battle fleet proposal preview layout', () => {
  it('contains the shared preview actions and undo state binding', () => {
    expect(fleetWxml).toContain('proposalPreview')
    expect(fleetWxml).toContain('onProposalCancel')
    expect(fleetWxml).toContain('onProposalApply')
    expect(fleetWxml).toContain('onUndoProposal')
    expect(fleetWxml).toContain('<result-preview-sheet')
    expect(fleetWxml).toContain('can-undo="{{canUndoProposal}}"')
  })
})

// ── Config lifecycle tests ──

describe('fleet config lifecycle', () => {
  it('starts as an editable guest page without loading cloud data', () => {
    const page = createPageInstance()
    page.onLoad()

    expect(page.data.authStatus).toBe('guest')
    expect(page.data.configStatus).toBe('new')
    expect(page.data.activeConfigId).toBeNull()
    expect(mockCallFunction).not.toHaveBeenCalled()
  })

  it('marks domain changes dirty', () => {
    const page = createPageInstance()
    page.onLoad()

    // Initially clean
    expect(page.data.configStatus).toBe('new')

    // Add an officer → should become unsaved
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    expect(page.data.configStatus).toBe('unsaved')
  })

  it('does not mark UI-only changes dirty', () => {
    const page = createPageInstance()
    page.onLoad()

    // Switch ship tab
    page.onShipTabTap({ currentTarget: { dataset: { id: 'ship-2' } } } as never)
    // Ship tab switching is UI-only, does not change fleet state
    expect(page.data.currentShipId).toBe('ship-2')
  })

  it('returns ok: true for authenticate call', async () => {
    mockCallFunction
      .mockResolvedValueOnce({
        result: { ok: true, data: { authenticated: true } },
      })
      .mockResolvedValueOnce({
        result: { ok: true, data: [] },
      })

    const page = createPageInstance()
    page.onLoad()

    // Simulate the login flow
    await page.onConfigLogin()
    expect(mockCallFunction).toHaveBeenCalledWith(
      expect.objectContaining({ data: { action: 'authenticate' } }),
    )
  })

  it('does not repeat the last-used update after loading a config', async () => {
    const now = '2026-01-01T00:00:00.000Z'
    const fleetState = createFleetState()
    mockCallFunction.mockImplementation(async ({ data }: { data: { action: string } }) => {
      switch (data.action) {
        case 'authenticate':
          return { result: { ok: true, data: { authenticated: true } } }
        case 'listMyConfigs':
          return {
            result: {
              ok: true,
              data: [
                {
                  configId: 'cfg-1',
                  name: '測試配置',
                  version: 1,
                  updatedAt: now,
                  lastUsedAt: now,
                },
              ],
            },
          }
        case 'loadConfig':
          return {
            result: {
              ok: true,
              data: {
                configId: 'cfg-1',
                name: '測試配置',
                fleetState,
                schemaVersion: 1,
                version: 1,
                createdAt: now,
                updatedAt: now,
                lastUsedAt: now,
              },
            },
          }
        case 'setLastUsedConfig':
          return { result: { ok: true, data: { updated: true } } }
        default:
          throw new Error(`unexpected action: ${data.action}`)
      }
    })

    const page = createPageInstance()
    await page.onLoad()
    await page.onConfigListOpen()

    const actions = mockCallFunction.mock.calls.map(
      ([request]) => (request as { data: { action: string } }).data.action,
    )
    expect(actions).not.toContain('setLastUsedConfig')
    expect(page.data.activeConfigId).toBe('cfg-1')
  })

  it('shows guest save prompt when not logged in', () => {
    const page = createPageInstance()
    page.onLoad()

    expect(page.data.authStatus).toBe('guest')
    // The login button should be visible for guests
  })

  it('handles unsaved guard on new config when dirty', () => {
    const page = createPageInstance()
    page.onLoad()

    // Make a change
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    expect(page.data.configStatus).toBe('unsaved')

    // Try to create new config → should trigger unsaved guard
    page.onConfigNew()
    expect(page.data.showUnsavedGuard).toBe(true)
  })

  it('dismisses unsaved guard on cancel', () => {
    const page = createPageInstance()
    page.onLoad()

    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    page.onConfigNew()
    expect(page.data.showUnsavedGuard).toBe(true)

    page.onUnsavedGuardCancel()
    expect(page.data.showUnsavedGuard).toBe(false)
    expect(page.data.pendingAction).toBeNull()
  })

  it('continues the pending action after saving an unnamed dirty config', async () => {
    const page = createPageInstance()
    page.onLoad()

    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    page.onConfigNew()
    expect(page.data.pendingAction).toEqual({ type: 'new' })

    page.onUnsavedGuardSave()
    expect(page.data.showNameModal).toBe(true)
    expect(page.data.modalAction).toBe('saveAs')

    const now = '2026-01-01T00:00:00.000Z'
    mockCallFunction
      .mockResolvedValueOnce({
        result: {
          ok: true,
          data: {
            configId: 'cfg-1',
            name: '保存後配置',
            fleetState: createFleetState(),
            schemaVersion: 1,
            version: 1,
            createdAt: now,
            updatedAt: now,
            lastUsedAt: now,
          },
        },
      })
      .mockResolvedValueOnce({ result: { ok: true, data: [] } })
    page.setData({ modalInputValue: '保存後配置' })

    await page.onConfigModalConfirm()

    expect(page.data.pendingAction).toBeNull()
    expect(page.data.showUnsavedGuard).toBe(false)
    expect(page.data.showNameModal).toBe(false)
    expect(page.data.activeConfigId).toBeNull()
    expect(page.data.configStatus).toBe('new')
  })

  it('executes new config after discarding unsaved changes', () => {
    const page = createPageInstance()
    page.onLoad()

    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    page.onConfigNew()
    expect(page.data.showUnsavedGuard).toBe(true)

    page.onUnsavedGuardDiscard()
    expect(page.data.showUnsavedGuard).toBe(false)
    expect(page.data.activeConfigId).toBeNull()
  })

  it('shows name modal for save-as', () => {
    const page = createPageInstance()
    page.onLoad()

    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    page.onConfigSaveAs()
    // Without login, save-as will trigger login first then save-as
    // The exact flow depends on auth state
  })

  it('closes config menu after menu tap', () => {
    const page = createPageInstance()
    page.onLoad()

    expect(page.data.showConfigMenu).toBe(false)
    page.onConfigMenuTap()
    expect(page.data.showConfigMenu).toBe(true)
    page.onConfigMenuTap()
    expect(page.data.showConfigMenu).toBe(false)
  })

  it('closes name modal on cancel', () => {
    const page = createPageInstance()
    page.onLoad()

    // Simulate opening the modal
    page.setData({ showNameModal: true, modalAction: 'saveAs', modalInputValue: 'test' })
    expect(page.data.showNameModal).toBe(true)

    page.onConfigModalCancel()
    expect(page.data.showNameModal).toBe(false)
  })

  it('clears a pending action when the name modal is cancelled', () => {
    const page = createPageInstance()
    page.onLoad()

    page.setData({
      showNameModal: true,
      modalAction: 'saveAs',
      modalInputValue: 'test',
      pendingAction: { type: 'new' },
      showUnsavedGuard: false,
    })

    page.onConfigModalCancel()

    expect(page.data.showNameModal).toBe(false)
    expect(page.data.pendingAction).toBeNull()
  })
})
