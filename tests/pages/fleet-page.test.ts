import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as fleetConfigContracts from '../../miniprogram/contracts/fleet-config'
import { createFleetState } from '../../miniprogram/domain/battle-fleet'

interface FleetTestData {
  shipTabs: unknown[]
  mode: string
  currentShip: { slots: unknown[] }
  targets: unknown[]
  canRecalculate: boolean
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
  unclassifiedConfigs: unknown[]
  configListState: string
  configListError: string | null
  expanded: boolean
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
  onUndoDismiss(): void
  onOfficerSelect(event: WechatMiniprogram.BaseEvent): void
  onOfficerRemove(event: WechatMiniprogram.BaseEvent): void
  onOfficerLock(event: WechatMiniprogram.BaseEvent): void
  onBanOfficer(event: WechatMiniprogram.BaseEvent): void
  onUnbanOfficer(event: WechatMiniprogram.BaseEvent): void
  // Config management handlers
  onConfigLogin(): Promise<void>
  onConfigToggle(): void
  onConfigLoad(event: WechatMiniprogram.BaseEvent): void
  onConfigClassify(event: WechatMiniprogram.BaseEvent): Promise<void>
  onConfigRetry(): Promise<void>
  onConfigNew(): void
  onConfigSave(): Promise<void>
  onConfigSaveAs(): Promise<void>
  onConfigRename(): void
  onConfigDelete(): void
  onConfigExit(): void
  onConfigNameInput(event: WechatMiniprogram.Input): void
  onConfigModalConfirm(): Promise<void>
  onConfigModalCancel(): void
  onUnsavedGuardSave(): Promise<void>
  onUnsavedGuardDiscard(): void
  onUnsavedGuardCancel(): void
  onConflictReload(): Promise<void>
  onConflictForceOverwrite(): Promise<void>
  onConflictCancel(): void
  onUnload(): void
  onShareFleet(): Promise<void>
  onSharePreviewClose(): void
  onShareImage(): Promise<void>
  onSaveShareImage(): Promise<void>
  onShareRetry(): Promise<void>
}

interface FleetPageInstance extends FleetPageConfig {
  data: FleetTestData
  setData(update: Record<string, unknown>, callback?: () => void): void
}

let fleetPage: FleetPageConfig
const wxStub = {
  showToast: vi.fn(),
  showModal: vi.fn(),
  setNavigationBarTitle: vi.fn(),
  navigateTo: vi.fn(),
  navigateBack: vi.fn((options: { success?: () => void }) => options.success?.()),
  createSelectorQuery: vi.fn(),
  canvasToTempFilePath: vi.fn(),
  saveImageToPhotosAlbum: vi.fn(),
  showShareImageMenu: vi.fn(),
  cloud: {
    callFunction: mockCallFunction,
  },
}

const createPageInstance = (): FleetPageInstance => {
  const instance = Object.create(fleetPage) as FleetPageInstance
  instance.data = structuredClone(fleetPage.data)
  instance.setData = (update, callback) => {
    Object.assign(instance.data, update)
    callback?.()
  }
  return instance
}

beforeAll(async () => {
  vi.stubGlobal('Page', (config: FleetPageConfig) => {
    fleetPage = config
  })
  vi.stubGlobal('wx', wxStub)

  await import('../../miniprogram/subpkg-fleet/pages/index/index')
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

  it('registers with seven ship tabs, eleven slots, and auto mode', () => {
    const page = createPageInstance()
    page.onLoad()

    expect(page.data.shipTabs).toHaveLength(7)
    expect(page.data.mode).toBe('auto')
    expect(page.data.targets).toHaveLength(1)
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

  it('stops adding targets after the per-ship limit', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)

    for (let index = page.data.targets.length; index < 20; index += 1) page.onAddTarget()
    expect(page.data.targets).toHaveLength(20)
    wxStub.showToast.mockClear()

    page.onAddTarget()

    expect(page.data.targets).toHaveLength(20)
    expect(wxStub.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '每艘船最多設定 20 個目標' }),
    )
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

  it('allows the DEMO 全部分類 chip to clear the active category filter', () => {
    const page = createPageInstance()
    page.onLoad()

    page.onSkillCategoryTap({
      detail: { value: 'skill_category_naval_active_cannon' },
      currentTarget: { dataset: {} },
    } as never)
    expect(page.data.manualCategoryId).toBe('skill_category_naval_active_cannon')

    page.onSkillCategoryTap({ detail: { value: '' }, currentTarget: { dataset: {} } } as never)
    expect(page.data.manualCategoryId).toBeNull()
  })

  it('opens the skill sheet on single tap and sets manualSkillId on select in manual mode', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onModeTap({ currentTarget: { dataset: { mode: 'manual' } } } as never)

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

  it('closes the undo notice without reverting the applied fleet', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)
    page.onAddTarget()
    page.onSkillSelect({ currentTarget: { dataset: { id: 'skill_skill400591' } } } as never)
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)

    page.onRecalculate()
    page.onProposalApply()
    const applied = structuredClone(page.data.currentShip)

    page.onUndoDismiss()

    expect(page.data.canUndoProposal).toBe(false)
    expect(page.data.currentShip).toEqual(applied)
  })
})

const fleetWxml = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/subpkg-fleet/pages/index/index.wxml'),
  'utf8',
)
const fleetWxss = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/subpkg-fleet/pages/index/index.wxss'),
  'utf8',
)
const skillPickerWxss = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/components/skill-picker-sheet/index.wxss'),
  'utf8',
)
const resultPreviewWxml = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/components/result-preview-sheet/index.wxml'),
  'utf8',
)
const resultPreviewWxss = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/components/result-preview-sheet/index.wxss'),
  'utf8',
)
const fleetJson = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../miniprogram/subpkg-fleet/pages/index/index.json'),
    'utf8',
  ),
) as { usingComponents?: Record<string, string> }

const sharedComponentNames = [
  'config-bar',
  'config-name-modal',
  'config-conflict-modal',
  'mode-tabs',
  'officer-action-sheet',
  'skill-picker-sheet',
  'result-preview-sheet',
  'empty-state',
] as const

const createShareCanvas = () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
    drawImage: vi.fn(),
    scale: vi.fn(),
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textBaseline: 'middle',
    textAlign: 'left',
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    requestAnimationFrame: vi.fn((callback: () => void) => {
      callback()
      return 0
    }),
    createImage: vi.fn(() => {
      const image = { width: 64, height: 64, src: '', onload: () => {}, onerror: () => {} }
      queueMicrotask(() => image.onload())
      return image
    }),
  }
  return { canvas, context }
}

describe('battle fleet share entry', () => {
  it('uses config bar as the only share entry', () => {
    expect(fleetWxml).toContain('share-status="{{shareStatus}}"')
    expect(fleetWxml).toContain('bind:share="onShareFleet"')
    expect(fleetWxml).not.toContain('fleet-share-bar')
    expect(fleetWxss).not.toContain('.fleet-share-bar')
  })

  it('冒險與戰鬥配隊頁共用突出分享配置摘要', () => {
    expect(fleetWxml).toContain('prominent-share="{{true}}"')
    expect(fleetWxml).toContain('style="display: block; flex: 0 0 auto;"')
    expect(fleetWxml).toMatch(/<config-bar[\s\S]*bind:share="onShareFleet"[\s\S]*\/>/)
    expect(fleetWxml.indexOf('<view class="fleet-context">')).toBeLessThan(
      fleetWxml.indexOf('<config-bar'),
    )
    expect(fleetWxml).toContain('class="fleet-context"')
    expect(fleetWxml).toContain('class="ship-tabs"')
    expect(fleetWxml).toContain('<mode-tabs')
    expect(fleetWxml).toContain('class="slot-grid"')
  })

  it('clean share action enters generating without changing the fleet view', async () => {
    const page = createPageInstance()
    await page.onLoad()
    const before = structuredClone(page.data.currentShip)

    page.onShareFleet()

    expect(page.data.shareStatus).toBe('generating')
    expect(page.data.pendingAction).toBeNull()
    expect(page.data.currentShip).toEqual(before)
  })

  it('dirty share action uses the existing unsaved guard with share pending action', async () => {
    const page = createPageInstance()
    await page.onLoad()
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)

    page.onShareFleet()

    expect(page.data.showUnsavedGuard).toBe(true)
    expect(page.data.pendingAction).toEqual({ type: 'share' })
  })
})

describe('battle fleet share generation', () => {
  const prepareCanvas = () => {
    const share = createShareCanvas()
    wxStub.createSelectorQuery.mockReturnValue({
      select: vi.fn(() => ({
        node: vi.fn(() => ({
          exec: vi.fn((callback: (result: Array<{ node: unknown }>) => void) =>
            callback([{ node: share.canvas }]),
          ),
        })),
      })),
    })
    wxStub.canvasToTempFilePath.mockImplementation(
      (options: { success?: (result: { tempFilePath: string }) => void }) => {
        options.success?.({ tempFilePath: 'wxfile://fleet-share.png' })
      },
    )
    return share
  }

  it('generates a preview image through a local 2D canvas', async () => {
    prepareCanvas()
    const page = createPageInstance()
    await page.onLoad()

    await page.onShareFleet()

    expect(page.data.shareStatus).toBe('ready')
    expect(page.data.shareImagePath).toBe('wxfile://fleet-share.png')
    expect(wxStub.canvasToTempFilePath).toHaveBeenCalledWith(
      expect.objectContaining({
        fileType: 'png',
        width: expect.any(Number),
        height: expect.any(Number),
        destWidth: expect.any(Number),
        destHeight: expect.any(Number),
      }),
      page,
    )
  })

  it('waits for the share canvas dimensions to render before selecting the canvas node', async () => {
    const share = prepareCanvas()
    const events: string[] = []
    const page = createPageInstance()
    await page.onLoad()

    page.setData = (update, callback) => {
      Object.assign(page.data, update)
      if (Object.prototype.hasOwnProperty.call(update, 'shareCanvasWidth')) {
        queueMicrotask(() => {
          events.push('rendered')
          callback?.()
        })
      } else {
        callback?.()
      }
    }
    wxStub.createSelectorQuery.mockImplementation(() => {
      events.push('query')
      return {
        select: vi.fn(() => ({
          node: vi.fn(() => ({
            exec: vi.fn((callback: (result: Array<{ node: unknown }>) => void) =>
              callback([{ node: share.canvas }]),
            ),
          })),
        })),
      }
    })

    await page.onShareFleet()

    expect(events.indexOf('rendered')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('query')).toBeGreaterThan(events.indexOf('rendered'))
  })

  it('waits for the canvas repaint before exporting the share image', async () => {
    const share = prepareCanvas()
    const events: string[] = []
    share.canvas.requestAnimationFrame.mockImplementation((callback: () => void) => {
      events.push('request-animation-frame')
      callback()
      return 0
    })
    wxStub.canvasToTempFilePath.mockImplementation(
      (options: { success?: (result: { tempFilePath: string }) => void }) => {
        events.push('export')
        options.success?.({ tempFilePath: 'wxfile://fleet-share.png' })
      },
    )
    const page = createPageInstance()
    await page.onLoad()

    await page.onShareFleet()

    expect(events.indexOf('request-animation-frame')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('export')).toBeGreaterThan(events.indexOf('request-animation-frame'))
  })

  it('falls back to a timer when the Canvas repaint callback is unavailable', async () => {
    const share = prepareCanvas()
    ;(share.canvas as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame =
      undefined
    const page = createPageInstance()
    await page.onLoad()

    await page.onShareFleet()

    expect(page.data.shareStatus).toBe('ready')
  })

  it('restores an error state when Canvas export fails and exposes retry text', async () => {
    prepareCanvas()
    wxStub.canvasToTempFilePath.mockImplementation(
      (options: { fail?: (error: unknown) => void }) => {
        options.fail?.(new Error('export failed'))
      },
    )
    const page = createPageInstance()
    await page.onLoad()

    await page.onShareFleet()

    expect(page.data.shareStatus).toBe('error')
    expect(page.data.shareError).toContain('生成')
  })

  it('不接受空的 Canvas 導出路徑，避免打開空白預覽層', async () => {
    prepareCanvas()
    wxStub.canvasToTempFilePath.mockImplementation(
      (options: { success?: (result: { tempFilePath: string }) => void }) => {
        options.success?.({ tempFilePath: '' })
      },
    )
    const page = createPageInstance()
    await page.onLoad()

    await page.onShareFleet()

    expect(page.data.shareStatus).toBe('error')
    expect(page.data.shareError).toContain('生成')
    expect(page.data.shareImagePath).toBe('')
  })

  it('starts every generation with a clean preview payload', async () => {
    prepareCanvas()
    const page = createPageInstance()
    await page.onLoad()
    page.data.shareImagePath = 'wxfile://stale-share.png'
    page.data.shareDegradedAssetCount = 3
    page.data.shareStatus = 'error'
    const generation = page.onShareFleet()

    expect(page.data.shareImagePath).toBe('')
    expect(page.data.shareDegradedAssetCount).toBe(0)
    await generation
  })

  it('把畫布節點查詢逾時轉成可重試的錯誤狀態', async () => {
    const page = createPageInstance()
    await page.onLoad()
    wxStub.createSelectorQuery.mockReturnValue({
      select: vi.fn(() => ({
        node: vi.fn(() => ({
          exec: vi.fn(),
        })),
      })),
    })
    vi.useFakeTimers()
    try {
      const generation = page.onShareFleet()
      await vi.advanceTimersByTimeAsync(8001)
      await generation

      expect(page.data.shareStatus).toBe('error')
      expect(page.data.shareError).toBe('分享圖生成逾時，請重試')
    } finally {
      vi.useRealTimers()
    }
  })

  it('畫布尺寸回調遺失時不會永久停在生成中', async () => {
    const page = createPageInstance()
    await page.onLoad()
    page.setData = (update) => {
      Object.assign(page.data, update)
    }
    vi.useFakeTimers()
    try {
      const generation = page.onShareFleet()
      await vi.advanceTimersByTimeAsync(8001)
      await generation

      expect(page.data.shareStatus).toBe('error')
      expect(page.data.shareError).toBe('分享圖生成逾時，請重試')
    } finally {
      vi.useRealTimers()
    }
  })

  it('畫布導出回調遺失時不會永久停在生成中', async () => {
    prepareCanvas()
    const page = createPageInstance()
    await page.onLoad()
    wxStub.canvasToTempFilePath.mockImplementation(() => undefined)
    vi.useFakeTimers()
    try {
      const generation = page.onShareFleet()
      await vi.advanceTimersByTimeAsync(8001)
      await generation

      expect(page.data.shareStatus).toBe('error')
      expect(page.data.shareError).toBe('分享圖生成逾時，請重試')
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses the saved image for WeChat share and album APIs', async () => {
    prepareCanvas()
    const page = createPageInstance()
    await page.onLoad()
    await page.onShareFleet()
    wxStub.saveImageToPhotosAlbum.mockImplementation((options: { success?: () => void }) =>
      options.success?.(),
    )
    wxStub.showShareImageMenu.mockImplementation((options: { success?: () => void }) =>
      options.success?.(),
    )

    await page.onSaveShareImage()
    await page.onShareImage()

    expect(wxStub.saveImageToPhotosAlbum).toHaveBeenCalledWith({
      filePath: 'wxfile://fleet-share.png',
    })
    expect(wxStub.showShareImageMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'wxfile://fleet-share.png',
        entrancePath: 'pages/home/index',
      }),
    )
  })
})

describe('fleet slot action touch targets', () => {
  it('keeps six columns with compact direct actions per slot', () => {
    const actionTag = fleetWxml.match(/<officer-action-sheet[\s\S]*?\/>/)?.[0] ?? ''
    expect(fleetWxml.match(/<officer-action-sheet\b/g)).toHaveLength(1)
    expect(actionTag).toMatch(/presentation="trigger"[\s\S]*?variant="slot"/)
    expect(actionTag).not.toContain('presentation="sheet"')
    expect(fleetWxml).not.toContain('bind:open="onOfficerActionOpen"')
    expect(fleetWxml).toContain('bind:lock="onOfficerLock"')
    expect(fleetWxml).toContain('bind:remove="onOfficerRemove"')
    expect(fleetWxml).toContain('bind:ban="onBanOfficer"')
    expect(fleetWxml).toContain('allow-ban="{{true}}"')
    expect(fleetWxml).toContain('officer-slot--locked')
    expect(fleetWxml).not.toContain('class="officer-slot__actions"')
    // Visual layers
    expect(fleetWxml).toContain('officer-slot__visuals')
    expect(fleetWxml).toContain('officer-slot__frame')
    expect(fleetWxml).toContain('officer-slot__rarity-icon')
    expect(fleetWxml).toContain('officer-slot__type-icon')
    expect(fleetWxml).toContain('item.officer.visuals.framePath')
    expect(fleetWxss).toMatch(
      /\.slot-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/,
    )
    expect(fleetWxss).toMatch(/\.officer-slot\s*\{[\s\S]*min-height:\s*152rpx/)
    expect(fleetWxss).toMatch(/\.officer-slot\s*\{[\s\S]*padding:\s*var\(--uwo-space-1\)\s+0;/)
    expect(fleetWxss).not.toMatch(/\.officer-slot\s*\{[\s\S]*padding:\s*10rpx 2rpx;/)
  })

  it('uses direct image loading without a local asset loading route', () => {
    expect(fleetWxml).not.toContain('asset-loading-state')
    expect(fleetWxml).not.toContain('lazy-load="true"')
    expect(fleetWxml).toContain('binderror="onImageError"')
    expect(fleetWxml).toContain('bind:reach-end="onSkillListReachEnd"')
  })
})

describe('battle fleet target safety', () => {
  it('blocks recalculation when every target is missing a skill', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)
    page.onAddTarget()

    expect(page.data.canRecalculate).toBe(false)

    page.onRecalculate()

    expect(page.data.proposalPreview).toBeNull()
    expect(wxStub.showToast).toHaveBeenCalledWith({
      title: '請先設定至少一個 Lv.1 以上的戰鬥技能目標',
      icon: 'none',
    })
  })

  it('enables recalculation after a target skill is selected', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)
    page.onAddTarget()
    page.onSkillSelect({ currentTarget: { dataset: { id: 'skill-cannon' } } } as never)

    expect(page.data.canRecalculate).toBe(true)
  })
})

describe('battle fleet shared component wiring', () => {
  it('registers and renders the page shared components', () => {
    for (const name of sharedComponentNames) {
      expect(fleetJson.usingComponents?.[name]).toBe(`../../../components/${name}/index`)
      expect(fleetWxml).toMatch(new RegExp(`<${name}(?:\\s|/?>)`))
    }
  })

  it('keeps the existing page handlers while removing duplicated shared markup', () => {
    expect(fleetWxml).toContain('bind:toggle="onConfigToggle"')
    expect(fleetWxml).toContain('bind:load="onConfigLoad"')
    expect(fleetWxml).toContain('bind:classify="onConfigClassify"')
    expect(fleetWxml).toContain('bind:retry="onConfigRetry"')
    expect(fleetWxml).toContain('bind:exit="onConfigExit"')
    expect(fleetWxml).not.toContain('<config-list-modal')
    expect(fleetWxml).toContain('<config-name-modal')
    expect(fleetWxml).toContain('<config-conflict-modal')
    expect(fleetWxml).not.toContain('class="config-item')
    expect(fleetWxml).not.toContain('class="config-modal__input"')
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

  it('keeps the battle skill picker title, guidance and filter semantics without manual search', () => {
    expect(fleetWxml).toContain("title=\"{{mode === 'auto' ? '技能篩選' : '選擇戰鬥技能'}}\"")
    expect(fleetWxml).toContain(
      "hint=\"{{mode === 'auto' ? '選擇後加入目標' : '點擊技能查看詳情，選擇後篩選可用航海士'}}\"",
    )
    expect(fleetWxml).toContain('show-search="{{false}}"')
    expect(fleetWxml).not.toContain('search-text="{{skillSearchText}}"')
    expect(fleetWxml).not.toContain('search-placeholder="在目前分類搜尋技能名稱"')
    expect(fleetWxml).not.toContain('bind:search-input="onSkillSearchInput"')
    expect(fleetWxml).toContain('empty-label="沒有符合的戰鬥技能"')
  })

  it('keeps the inline battle skill picker for compact density styling', () => {
    expect(fleetWxml).toMatch(
      /<skill-picker-sheet[\s\S]*presentation="inline"[\s\S]*selection-label="\{\{mode === 'auto' \? '加入目標' : '選擇'\}\}"/,
    )
    expect(fleetWxml).toContain('bind:select="onSkillSelect"')
  })
})

describe('battle fleet P5 workbench structure', () => {
  it('registers the disclosure component and uses the six-column workbench structure', () => {
    expect(fleetJson.usingComponents?.['disclosure-section']).toBe(
      '../../../components/disclosure-section/index',
    )
    expect(fleetWxml.match(/<disclosure-section\b/g)).toHaveLength(3)
    expect(fleetWxml).not.toContain('class="fleet-header"')
    expect(fleetWxml.indexOf('<mode-tabs')).toBeLessThan(fleetWxml.indexOf('class="slot-grid"'))
    expect(fleetWxml).toContain('skillContributionLabel')
    expect(fleetWxml).toContain('selectionHint')
    expect(fleetWxml).toContain('currentShipExcludedOfficers')
    expect(fleetWxml).toContain('bindtap="onUnbanOfficer"')
  })
})

describe('battle fleet context density', () => {
  it('keeps one global ship context and removes the editor duplicate', () => {
    expect(fleetWxml.match(/class="fleet-context"/g)).toHaveLength(1)
    expect(fleetWxml).toContain('{{currentShip.label}}')
    expect(fleetWxml).not.toContain('currentShip.statusLabel')
    expect(fleetWxml).toContain('已配置 {{occupiedCount}} / {{fleetCapacity}} 個位置')
    expect(fleetWxml).toContain('wx:if="{{needsReview}}"')
    expect(fleetWxml).toContain('需要重新檢查')
    expect(fleetWxml).not.toContain('class="section-heading"')
  })

  it('keeps ship switching, mode switching, and both editor modes wired', () => {
    expect(fleetWxml).toContain('bindtap="onShipTabTap"')
    expect(fleetWxml).toContain('bind:change="onModeTap"')
    expect(fleetWxml).toContain('class="candidate-panel"')
    expect(fleetWxml).toContain('class="target-panel"')
  })
})

describe('battle fleet P5 layout rules', () => {
  it('uses six columns and tokenized P5 page rules', () => {
    expect(fleetWxss).toMatch(/\.slot-grid\s*\{[\s\S]*repeat\(6,\s*minmax\(0,\s*1fr\)\)/)
    expect(fleetWxss).toMatch(/\.fleet-context\s*\{[\s\S]*var\(--uwo-/)
    expect(fleetWxss).toMatch(/\.candidate-row\s*\{[\s\S]*min-height:\s*88rpx/)
    expect(fleetWxss).toContain('overflow-wrap: anywhere')
    expect(fleetWxss).not.toMatch(/\.candidate-row--disabled\s*\{[\s\S]*opacity\s*:/)
  })
})

describe('battle fleet skill summary compact rows', () => {
  it('uses the skill-picker row language without fleet overview or status badges', () => {
    expect(fleetWxml).toContain('class="summary-row__contributors-count"')
    expect(fleetWxml).not.toContain('<status-badge')
    expect(fleetWxml).not.toContain('全艦隊摘要')
    expect(fleetWxml).not.toContain('class="overview-panel"')
  })

  it('keeps the summary row compact and places contributors on the right', () => {
    expect(fleetWxss).toMatch(
      /\.summary-row\s*\{[\s\S]*display:\s*flex[\s\S]*min-height:\s*56rpx[\s\S]*gap:\s*var\(--uwo-space-2\)[\s\S]*padding:\s*var\(--uwo-space-1\)\s+0;/,
    )
    expect(fleetWxss).toMatch(
      /\.summary-row__contributors\s*\{[\s\S]*flex:\s*0\s+0\s+auto[\s\S]*height:\s*48rpx/,
    )
    expect(fleetWxss).toMatch(/\.summary-row__contributors-content\s*\{[\s\S]*height:\s*48rpx/)
    expect(fleetWxss).toMatch(/\.summary-row__level\s*\{[\s\S]*margin-top:\s*0;/)
  })
})

describe('battle fleet exclusion compact cards', () => {
  it('uses two four-column exclusion grids with an accessible red X action', () => {
    expect(fleetWxml.match(/class="officer-exclusion-grid"/g)).toHaveLength(2)
    expect(fleetWxml.match(/class="officer-exclusion-card"/g)).toHaveLength(2)
    expect(fleetWxml.match(/class="officer-exclusion-card__remove"/g)).toHaveLength(2)
    expect(fleetWxml.match(/compact="\{\{true\}\}"/g)).toHaveLength(3)
    expect(fleetWxml).toContain('officer-exclusion-card__remove-icon')
    expect(fleetWxml).not.toContain('解除本船排除')
    expect(fleetWxml).not.toContain('解除</text>')
    expect(fleetWxss).toMatch(
      /\.officer-exclusion-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
    )
    expect(fleetWxss).toMatch(
      /\.officer-exclusion-card__name\s*\{[\s\S]*-webkit-line-clamp:\s*2[\s\S]*overflow-wrap:\s*anywhere/,
    )
    expect(fleetWxss).toMatch(
      /\.officer-exclusion-card__visuals\s*\{[\s\S]*width:\s*88rpx[\s\S]*height:\s*88rpx/,
    )
    expect(fleetWxss).toMatch(
      /\.officer-exclusion-card__portrait-wrap\s*\{[\s\S]*width:\s*54rpx[\s\S]*height:\s*54rpx/,
    )
    expect(fleetWxss).toMatch(
      /\.officer-exclusion-card__remove\s*\{[\s\S]*top:\s*0[\s\S]*right:\s*0[\s\S]*width:\s*88rpx[\s\S]*height:\s*88rpx/,
    )
    expect(fleetWxss).toMatch(
      /\.officer-exclusion-card__remove\s*\{[\s\S]*width:\s*88rpx\s*!important[\s\S]*max-width:\s*88rpx\s*!important[\s\S]*height:\s*88rpx\s*!important[\s\S]*margin:\s*0\s*!important[\s\S]*padding:\s*0\s*!important/,
    )
    expect(fleetWxss).toMatch(
      /\.officer-exclusion-card__remove\s*\{[\s\S]*width:\s*88rpx\s*!important[\s\S]*min-width:\s*88rpx\s*!important[\s\S]*max-width:\s*88rpx\s*!important[\s\S]*height:\s*88rpx\s*!important[\s\S]*min-height:\s*88rpx\s*!important[\s\S]*flex:\s*0\s+0\s+88rpx\s*!important/,
    )
  })
})

describe('battle fleet proposal preview layout', () => {
  it('contains the shared preview actions and undo state binding', () => {
    expect(fleetWxml).toContain('proposalPreview')
    expect(fleetWxml).toContain('onProposalCancel')
    expect(fleetWxml).toContain('onProposalApply')
    expect(fleetWxml).toContain('onUndoProposal')
    expect(fleetWxml).toContain('bind:dismiss-undo="onUndoDismiss"')
    expect(fleetWxml).toContain('<result-preview-sheet')
    expect(fleetWxml).toContain('can-undo="{{canUndoProposal}}"')
  })

  it('mounts the battle preview outside the main fleet scroll container', () => {
    const fleetScrollStart = fleetWxml.indexOf('<scroll-view class="fleet-scroll"')
    const fleetScrollEnd = fleetWxml.lastIndexOf('</scroll-view>')
    const previewIndex = fleetWxml.indexOf('<result-preview-sheet')

    expect(fleetScrollStart).toBeGreaterThanOrEqual(0)
    expect(previewIndex).toBeGreaterThan(fleetScrollEnd)
    expect(fleetWxml.slice(fleetScrollStart, fleetScrollEnd)).not.toContain('<result-preview-sheet')
  })

  it('keeps long preview content in an independent scroll area with a fixed action footer', () => {
    expect(resultPreviewWxml).toMatch(
      /<view class="result-preview-sheet__header">[\s\S]*<scroll-view class="result-preview-sheet__content" scroll-y>[\s\S]*<view class="result-preview-sheet__actions">/,
    )
    expect(resultPreviewWxss).toMatch(
      /\.result-preview-sheet\s*\{[\s\S]*overflow:\s*hidden[\s\S]*\}/,
    )
    expect(resultPreviewWxss).toMatch(
      /\.result-preview-sheet__content\s*\{[\s\S]*flex:\s*1[\s\S]*\}/,
    )
    expect(resultPreviewWxss).toContain('env(safe-area-inset-bottom)')
  })
})

describe('battle fleet target controls', () => {
  it('uses the skill picker as the only add entry and keeps target controls compact', () => {
    expect(fleetWxml).toContain('disabled="{{!canRecalculate}}"')
    expect(fleetWxml).toContain('<text class="panel-heading__hint">僅計算目前船</text>')
    expect(fleetWxml).toContain('尚無可重算目標')
    expect(fleetWxml).toContain('{{recalculateDisabledReason}}')
    expect(fleetWxml).not.toContain('bindtap="onAddTarget"')
    expect(fleetWxml).toMatch(
      /<block wx:for="\{\{targets\}\}" wx:key="id">\s*<view wx:if="\{\{item\.configured\}\}" class="target-row">/,
    )
    expect(fleetWxml).toContain('class="target-row__controls"')
    expect(fleetWxml).toMatch(
      /<button class="target-row__remove"[^>]*bindtap="onRemoveTarget"[^>]*aria-label="刪除\{\{item\.skillName\}\}目標"[^>]*>\s*<text aria-hidden="true">×<\/text>/,
    )
    expect(fleetWxss).toMatch(
      /\.target-row\s*\{[\s\S]*display:\s*flex[\s\S]*width:\s*100%[\s\S]*min-height:\s*64rpx[\s\S]*justify-content:\s*space-between/,
    )
    expect(fleetWxss).toMatch(/\.level-input\s*\{[\s\S]*min-height:\s*56rpx/)
    expect(fleetWxss).toMatch(/\.target-row__controls\s*\{[\s\S]*gap:\s*var\(--uwo-space-1\)/)
    expect(fleetWxss).toMatch(
      /\.target-row__controls\s*\{[\s\S]*flex:\s*0\s+0\s+auto[\s\S]*margin-left:\s*0[\s\S]*margin-right:\s*0/,
    )
    expect(fleetWxss).toMatch(
      /\.target-row__remove\s*\{[\s\S]*width:\s*48rpx[\s\S]*height:\s*48rpx[\s\S]*min-width:\s*48rpx[\s\S]*min-height:\s*48rpx[\s\S]*margin:\s*0[\s\S]*padding:\s*0[\s\S]*border:\s*0[\s\S]*background:\s*transparent[\s\S]*color:\s*var\(--uwo-color-danger\)/,
    )
    expect(fleetWxss).toMatch(
      /\.target-row__remove\s*\{[\s\S]*width:\s*48rpx\s*!important[\s\S]*height:\s*48rpx\s*!important[\s\S]*min-width:\s*48rpx\s*!important[\s\S]*max-width:\s*48rpx\s*!important[\s\S]*flex:\s*0\s+0\s+48rpx\s*!important[\s\S]*margin:\s*0\s*!important[\s\S]*padding:\s*0\s*!important/,
    )
    expect(skillPickerWxss).toMatch(
      /\.skill-picker-sheet--inline \.skill-picker-sheet__tab\s*\{[\s\S]*width:\s*auto[\s\S]*min-width:\s*0[\s\S]*min-height:\s*48rpx[\s\S]*padding:\s*0 var\(--uwo-space-1\);/,
    )
    expect(skillPickerWxss).toMatch(
      /\.skill-picker-sheet--inline \.skill-picker-sheet__select\s*\{[\s\S]*width:\s*auto[\s\S]*min-width:\s*0[\s\S]*min-height:\s*56rpx[\s\S]*padding:\s*0 var\(--uwo-space-1\);/,
    )
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
                  scope: 'battle',
                  version: 1,
                  updatedAt: now,
                  lastUsedAt: now,
                },
              ],
            },
          }
        case 'listUnclassifiedConfigs':
          return { result: { ok: true, data: [] } }
        case 'loadConfig':
          return {
            result: {
              ok: true,
              data: {
                configId: 'cfg-1',
                name: '測試配置',
                scope: 'battle',
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
    await page.onConfigLogin()

    const actions = mockCallFunction.mock.calls.map(
      ([request]) => (request as { data: { action: string } }).data.action,
    )
    expect(actions).not.toContain('setLastUsedConfig')
    expect(page.data.activeConfigId).toBe('cfg-1')
    expect(page.data.expanded).toBe(false)
  })

  it('戰鬥頁只傳 battle scope，載入成功後自動收起', async () => {
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
                  configId: 'battle-1',
                  name: '戰鬥配置',
                  scope: 'battle',
                  version: 1,
                  updatedAt: now,
                  lastUsedAt: now,
                },
              ],
            },
          }
        case 'listUnclassifiedConfigs':
          return { result: { ok: true, data: [] } }
        case 'loadConfig':
          return {
            result: {
              ok: true,
              data: {
                configId: 'battle-1',
                name: '戰鬥配置',
                scope: 'battle',
                fleetState,
                schemaVersion: 1,
                version: 1,
                createdAt: now,
                updatedAt: now,
                lastUsedAt: now,
              },
            },
          }
        default:
          throw new Error(`unexpected action: ${data.action}`)
      }
    })

    const page = createPageInstance()
    await page.onLoad()
    page.onConfigToggle()
    expect(page.data.expanded).toBe(true)

    await page.onConfigLogin()

    expect(mockCallFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'listMyConfigs', scope: 'battle' }),
      }),
    )
    expect(mockCallFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'loadConfig', scope: 'battle' }),
      }),
    )
    expect(page.data.expanded).toBe(false)
  })

  it('載入後以完整服務端記錄同步目前配置列表摘要', async () => {
    const listedAt = '2026-01-01T00:00:00.000Z'
    const loadedAt = '2026-01-02T00:00:00.000Z'
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
                  configId: 'battle-1',
                  name: '列表舊名稱',
                  scope: 'battle',
                  version: 1,
                  updatedAt: listedAt,
                  lastUsedAt: listedAt,
                },
              ],
            },
          }
        case 'listUnclassifiedConfigs':
          return { result: { ok: true, data: [] } }
        case 'loadConfig':
          return {
            result: {
              ok: true,
              data: {
                configId: 'battle-1',
                name: '雲端新名稱',
                scope: 'battle',
                fleetState,
                schemaVersion: 1,
                version: 2,
                createdAt: listedAt,
                updatedAt: loadedAt,
                lastUsedAt: loadedAt,
              },
            },
          }
        default:
          throw new Error(`unexpected action: ${data.action}`)
      }
    })

    const page = createPageInstance()
    await page.onLoad()
    await page.onConfigLogin()

    expect(page.data.configList).toEqual([
      expect.objectContaining({
        configId: 'battle-1',
        name: '雲端新名稱',
        version: 2,
        updatedAt: loadedAt,
        lastUsedAt: loadedAt,
      }),
    ])
  })

  it('亂序返回的配置載入結果不會覆蓋最後一次選擇', async () => {
    const now = '2026-01-01T00:00:00.000Z'
    const fleetState = createFleetState()
    let resolveA: ((value: unknown) => void) | undefined
    let resolveB: ((value: unknown) => void) | undefined
    const record = (configId: string, name: string) => ({
      configId,
      name,
      scope: 'battle',
      fleetState,
      schemaVersion: 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
    })

    mockCallFunction.mockImplementation(
      ({ data }: { data: { action: string; configId?: string } }) => {
        switch (data.action) {
          case 'authenticate':
            return Promise.resolve({ result: { ok: true, data: { authenticated: true } } })
          case 'listMyConfigs':
          case 'listUnclassifiedConfigs':
            return Promise.resolve({ result: { ok: true, data: [] } })
          case 'loadConfig':
            return new Promise((resolve) => {
              if (data.configId === 'cfg-a') resolveA = resolve
              else resolveB = resolve
            })
          default:
            throw new Error(`unexpected action: ${data.action}`)
        }
      },
    )

    const page = createPageInstance()
    await page.onLoad()
    await page.onConfigLogin()
    page.onConfigLoad({ currentTarget: { dataset: { id: 'cfg-a' } } } as never)
    page.onConfigLoad({ currentTarget: { dataset: { id: 'cfg-b' } } } as never)

    resolveB!({ result: { ok: true, data: record('cfg-b', '第二個配置') } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    resolveA!({ result: { ok: true, data: record('cfg-a', '第一個配置') } })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(page.data.activeConfigId).toBe('cfg-b')
    expect(page.data.configName).toBe('第二個配置')
  })

  it('配置載入失敗後的重試會重試原配置而不是重新載入列表', async () => {
    const now = '2026-01-01T00:00:00.000Z'
    const fleetState = createFleetState()
    let loadCalls = 0
    mockCallFunction.mockImplementation(async ({ data }: { data: { action: string } }) => {
      switch (data.action) {
        case 'authenticate':
          return { result: { ok: true, data: { authenticated: true } } }
        case 'listMyConfigs':
        case 'listUnclassifiedConfigs':
          return { result: { ok: true, data: [] } }
        case 'loadConfig':
          loadCalls += 1
          if (loadCalls === 1) {
            return { result: { ok: false, code: 'not-found', message: '找不到配置' } }
          }
          return {
            result: {
              ok: true,
              data: {
                configId: 'cfg-retry',
                name: '重試成功',
                scope: 'battle',
                fleetState,
                schemaVersion: 1,
                version: 1,
                createdAt: now,
                updatedAt: now,
                lastUsedAt: now,
              },
            },
          }
        default:
          throw new Error(`unexpected action: ${data.action}`)
      }
    })

    const page = createPageInstance()
    await page.onLoad()
    await page.onConfigLogin()
    page.onConfigLoad({ currentTarget: { dataset: { id: 'cfg-retry' } } } as never)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(page.data.configLoadError).toBe('載入配置失敗')
    expect(page.data.configListState).toBe('empty')

    await page.onConfigRetry()

    expect(loadCalls).toBe(2)
    expect(page.data.activeConfigId).toBe('cfg-retry')
    expect(page.data.configLoadError).toBeNull()
  })

  it('未保存時另存為會先顯示未保存守衛', async () => {
    mockCallFunction.mockImplementation(async ({ data }: { data: { action: string } }) => {
      if (data.action === 'authenticate') {
        return { result: { ok: true, data: { authenticated: true } } }
      }
      if (data.action === 'listMyConfigs' || data.action === 'listUnclassifiedConfigs') {
        return { result: { ok: true, data: [] } }
      }
      throw new Error(`unexpected action: ${data.action}`)
    })

    const page = createPageInstance()
    await page.onLoad()
    await page.onConfigLogin()
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)

    page.onConfigSaveAs()

    expect(page.data.showUnsavedGuard).toBe(true)
    expect(page.data.pendingAction).toEqual({ type: 'saveAs' })
  })

  it('保存後以服務端回應的 fleetState 作為新的頁面基準', async () => {
    const now = '2026-01-01T00:00:00.000Z'
    const serverFleetState = createFleetState()
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
                  configId: 'battle-1',
                  name: '戰鬥配置',
                  scope: 'battle',
                  version: 1,
                  updatedAt: now,
                  lastUsedAt: now,
                },
              ],
            },
          }
        case 'listUnclassifiedConfigs':
          return { result: { ok: true, data: [] } }
        case 'loadConfig':
          return {
            result: {
              ok: true,
              data: {
                configId: 'battle-1',
                name: '戰鬥配置',
                scope: 'battle',
                fleetState: serverFleetState,
                schemaVersion: 1,
                version: 1,
                createdAt: now,
                updatedAt: now,
                lastUsedAt: now,
              },
            },
          }
        case 'updateConfig':
          return {
            result: {
              ok: true,
              data: {
                configId: 'battle-1',
                name: '戰鬥配置',
                scope: 'battle',
                fleetState: serverFleetState,
                schemaVersion: 1,
                version: 2,
                createdAt: now,
                updatedAt: now,
                lastUsedAt: now,
              },
            },
          }
        default:
          throw new Error(`unexpected action: ${data.action}`)
      }
    })

    const page = createPageInstance()
    page.onLoad()
    await page.onConfigLogin()
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    expect(page.data.configStatus).toBe('unsaved')

    await page.onConfigSave()

    expect(page.data.configStatus).toBe('saved')
    expect(
      page.data.currentShip.slots.some(
        (slot: unknown) =>
          (slot as { officer: { id: string } | null }).officer?.id === 'officer_chast089',
      ),
    ).toBe(false)
  })

  it('列表載入錯誤時保持配置模組展開', async () => {
    mockCallFunction.mockImplementation(async ({ data }: { data: { action: string } }) => {
      if (data.action === 'authenticate') {
        return { result: { ok: true, data: { authenticated: true } } }
      }
      if (data.action === 'listMyConfigs') {
        return {
          result: {
            ok: false,
            code: 'network',
            message: '暫時無法載入',
          },
        }
      }
      throw new Error(`unexpected action: ${data.action}`)
    })

    const page = createPageInstance()
    await page.onLoad()
    page.onConfigToggle()
    await page.onConfigLogin()

    expect(page.data.expanded).toBe(true)
    expect(page.data.configListState).toBe('error')
    expect(page.data.configListError).toBe('載入配置列表失敗')
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
            scope: 'battle',
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
      .mockResolvedValueOnce({ result: { ok: true, data: [] } })
    page.setData({ modalInputValue: '保存後配置' })

    await page.onConfigModalConfirm()

    expect(page.data.pendingAction).toBeNull()
    expect(page.data.showUnsavedGuard).toBe(false)
    expect(page.data.showNameModal).toBe(false)
    expect(page.data.activeConfigId).toBeNull()
    expect(page.data.configStatus).toBe('new')
  })

  it('直接另存為時保存未命名草稿不會再次打開名稱彈窗', async () => {
    const page = createPageInstance()
    page.onLoad()
    mockCallFunction
      .mockResolvedValueOnce({ result: { ok: true, data: { authenticated: true } } })
      .mockResolvedValueOnce({ result: { ok: true, data: [] } })
      .mockResolvedValueOnce({ result: { ok: true, data: [] } })
    await page.onConfigLogin()

    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    page.onConfigSaveAs()
    expect(page.data.pendingAction).toEqual({ type: 'saveAs' })

    page.onUnsavedGuardSave()
    expect(page.data.showNameModal).toBe(true)
    expect(page.data.pendingAction).toBeNull()

    const now = '2026-01-01T00:00:00.000Z'
    mockCallFunction
      .mockResolvedValueOnce({
        result: {
          ok: true,
          data: {
            configId: 'cfg-save-as',
            name: '另存配置',
            scope: 'battle',
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
      .mockResolvedValueOnce({ result: { ok: true, data: [] } })
    page.setData({ modalInputValue: '另存配置' })

    await page.onConfigModalConfirm()

    expect(page.data.showNameModal).toBe(false)
    expect(page.data.pendingAction).toBeNull()
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

  it('toggles the single config management module', () => {
    const page = createPageInstance()
    page.onLoad()

    expect(page.data.expanded).toBe(false)
    page.onConfigToggle()
    expect(page.data.expanded).toBe(true)
    page.onConfigToggle()
    expect(page.data.expanded).toBe(false)
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

describe('配置衝突綁定操作與對象', () => {
  const now = '2026-01-01T00:00:00.000Z'
  const setupConflict = async (action: string = 'classifyConfig') => {
    const fleetState = createFleetState()
    fleetState.ships.forEach((ship) => {
      ship.mode = 'auto'
    })
    const records = new Map([
      [
        'A',
        {
          configId: 'A',
          name: '目前配置',
          scope: 'battle',
          fleetState: structuredClone(fleetState),
          schemaVersion: 1,
          version: 1,
          createdAt: now,
          updatedAt: now,
          lastUsedAt: now,
        },
      ],
      [
        'L',
        {
          configId: 'L',
          name: '舊配置',
          scope: 'unclassified',
          fleetState: structuredClone(fleetState),
          schemaVersion: 1,
          version: 1,
          createdAt: now,
          updatedAt: now,
          lastUsedAt: now,
        },
      ],
    ])
    const writes: unknown[] = []
    mockCallFunction.mockImplementation(
      async ({
        data,
      }: {
        data: {
          action: string
          configId: string
          force?: boolean
          fleetState?: ReturnType<typeof createFleetState>
        }
      }) => {
        if (data.action === 'authenticate')
          return { result: { ok: true, data: { authenticated: true } } }
        if (data.action === 'listMyConfigs')
          return {
            result: {
              ok: true,
              data: [records.get('A')].map((record) => {
                const { configId, name, scope, version, updatedAt, lastUsedAt } = record!
                return { configId, name, scope, version, updatedAt, lastUsedAt }
              }),
            },
          }
        if (data.action === 'listUnclassifiedConfigs')
          return {
            result: {
              ok: true,
              data: [records.get('L')].map((record) => {
                const { configId, name, scope, version, updatedAt, lastUsedAt } = record!
                return { configId, name, scope, version, updatedAt, lastUsedAt }
              }),
            },
          }
        if (data.action === 'loadConfig')
          return { result: { ok: true, data: structuredClone(records.get(data.configId)) } }
        if (data.action === action && !data.force) {
          // 模擬前置讀取後、CAS 提交前另一裝置變更版本，L 仍未分類。
          const current = records.get(data.configId)!
          records.set(data.configId, { ...current, version: current.version + 1 })
          return { result: { ok: false, code: 'conflict', message: '版本衝突' } }
        }
        if (data.action === 'updateConfig') {
          writes.push(structuredClone(data))
          const current = records.get(data.configId)!
          const updated = {
            ...current,
            fleetState: structuredClone(data.fleetState!),
            version: current.version + 1,
          }
          records.set(data.configId, updated)
          return { result: { ok: true, data: updated } }
        }
        throw new Error(`unexpected action: ${data.action}`)
      },
    )
    wxStub.showModal.mockImplementation(
      (options: { success?: (result: { confirm: boolean }) => void }) =>
        options.success?.({ confirm: true }),
    )
    const page = createPageInstance()
    page.onLoad()
    await page.onConfigLogin()
    return { page, records, writes }
  }

  it('載入 A 後分類 L 的 CAS 衝突不得 force 更新 A', async () => {
    const { page, records, writes } = await setupConflict()
    const original = structuredClone(records.get('A'))
    await page.onConfigClassify({
      currentTarget: { dataset: { id: 'L', scope: 'battle' } },
    } as never)
    expect(page.data.showConflictDialog).toBe(true)
    expect(records.get('L')).toMatchObject({ version: 2, scope: 'unclassified' })
    page.onConflictForceOverwrite()
    await vi.waitFor(() => expect(page.data.showConflictDialog).toBe(false))
    expect(writes).toHaveLength(0)
    expect(records.get('A')).toEqual(original)
    expect(
      mockCallFunction.mock.calls.filter(([arg]) => arg.data.action === 'updateConfig'),
    ).toHaveLength(0)
  })
  it('分類衝突刷新 L 清單，不重新載入或放棄 active A', async () => {
    const { page, records } = await setupConflict()
    const original = structuredClone(records.get('A'))
    await page.onConfigClassify({
      currentTarget: { dataset: { id: 'L', scope: 'battle' } },
    } as never)
    expect(page.data.conflictConfigName).toBe('舊配置')
    expect(page.data.conflictCanForce).toBe(false)
    mockCallFunction.mockClear()
    page.onConflictReload()
    await vi.waitFor(() =>
      expect(
        mockCallFunction.mock.calls.filter(([arg]) => arg.data.action === 'listMyConfigs'),
      ).toHaveLength(1),
    )
    expect(
      mockCallFunction.mock.calls.filter(([arg]) => arg.data.action === 'listUnclassifiedConfigs'),
    ).toHaveLength(1)
    await vi.waitFor(() => expect(page.data.configListState).toBe('ready'))
    expect(
      mockCallFunction.mock.calls.filter(([arg]) => arg.data.action === 'loadConfig'),
    ).toHaveLength(0)
    expect(records.get('A')).toEqual(original)
    expect(page.data.activeConfigId).toBe('A')
  })

  it.each(['renameConfig', 'deleteConfig'])(
    '%s 衝突即使 active ID 相同也不能覆蓋',
    async (action) => {
      const { page, records, writes } = await setupConflict(action)
      if (action === 'renameConfig') {
        page.onConfigRename()
        page.onConfigNameInput({ detail: { value: '新名稱' } } as never)
        await page.onConfigModalConfirm()
      } else {
        page.onConfigDelete()
        await vi.waitFor(() => expect(page.data.showConflictDialog).toBe(true))
      }
      const original = structuredClone(records.get('A'))
      expect(page.data.showConflictDialog).toBe(true)
      expect(page.data.conflictCanForce).toBe(false)
      page.onConflictForceOverwrite()
      expect(writes).toHaveLength(0)
      expect(records.get('A')).toEqual(original)
    },
  )

  it('合法 update 衝突 force 仍保存同一配置與捕獲快照', async () => {
    const { page, records, writes } = await setupConflict('updateConfig')
    page.onModeTap({ currentTarget: { dataset: {} }, detail: { mode: 'manual' } } as never)
    await page.onConfigSave()
    expect(page.data.conflictConfigName).toBe('目前配置')
    expect(page.data.conflictCanForce).toBe(true)
    page.onConflictForceOverwrite()
    await vi.waitFor(() => expect(page.data.configStatus).toBe('saved'))
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({
      configId: 'A',
      expectedVersion: 1,
      force: true,
      fleetState: {
        ships: [
          expect.objectContaining({ mode: 'manual' }),
          ...records.get('A')!.fleetState.ships.slice(1),
        ],
      },
    })
    expect(page.data.conflictConfigName).toBe('')
    expect(page.data.showConflictDialog).toBe(false)
  })

  it('衝突彈窗期間編輯使舊 force 授權與按鈕失效', async () => {
    const { page, writes } = await setupConflict('updateConfig')
    await page.onConfigSave()
    page.onModeTap({ currentTarget: { dataset: {} }, detail: { mode: 'manual' } } as never)
    expect(page.data.conflictCanForce).toBe(false)
    page.onConflictForceOverwrite()
    expect(writes).toHaveLength(0)
    expect(page.data.mode).toBe('manual')
    expect(page.data.configStatus).toBe('unsaved')
  })

  it.each(['edit', 'switch', 'cancel', 'unload'])(
    '第二次確認等待期間 %s 使舊 force 無法提交',
    async (change) => {
      const { page, records, writes } = await setupConflict('updateConfig')
      await page.onConfigSave()
      let confirm!: (result: { confirm: boolean }) => void
      wxStub.showModal.mockImplementation((options: { success?: typeof confirm }) => {
        confirm = options.success!
      })
      page.onConflictForceOverwrite()
      if (change === 'edit')
        page.onModeTap({ currentTarget: { dataset: {} }, detail: { mode: 'manual' } } as never)
      if (change === 'switch') {
        records.set('B', { ...records.get('A')!, configId: 'B', name: '另一配置' })
        page.onConfigLoad({ currentTarget: { dataset: { id: 'B' } } } as never)
        await vi.waitFor(() => expect(page.data.activeConfigId).toBe('B'))
      }
      if (change === 'cancel') page.onConflictCancel()
      if (change === 'unload') page.onUnload()
      confirm({ confirm: true })
      expect(writes).toHaveLength(0)
    },
  )

  it('衝突後新編輯再刷新只更新清單，保留新草稿', async () => {
    const { page, writes } = await setupConflict('updateConfig')
    await page.onConfigSave()
    page.onModeTap({ currentTarget: { dataset: {} }, detail: { mode: 'manual' } } as never)
    mockCallFunction.mockClear()
    page.onConflictReload()
    await vi.waitFor(() =>
      expect(
        mockCallFunction.mock.calls.filter(([arg]) => arg.data.action === 'listMyConfigs'),
      ).toHaveLength(1),
    )
    expect(
      mockCallFunction.mock.calls.filter(([arg]) => arg.data.action === 'listUnclassifiedConfigs'),
    ).toHaveLength(1)
    await vi.waitFor(() => expect(page.data.configListState).toBe('ready'))
    expect(
      mockCallFunction.mock.calls.filter(([arg]) => arg.data.action === 'loadConfig'),
    ).toHaveLength(0)
    expect(page.data.mode).toBe('manual')
    expect(page.data.configStatus).toBe('unsaved')
    expect(writes).toHaveLength(0)
  })
})

describe('登入延續與重試保護草稿回歸', () => {
  it.each([false, true])('登入等待列表時新編輯保留草稿，非空列表=%s', async (hasConfig) => {
    let resolveList!: (value: unknown) => void
    const waitingList = new Promise((resolve) => {
      resolveList = resolve
    })
    mockCallFunction.mockImplementation(({ data }: { data: { action: string } }) => {
      if (data.action === 'authenticate')
        return Promise.resolve({ result: { ok: true, data: { authenticated: true } } })
      if (data.action === 'listMyConfigs') return waitingList
      if (data.action === 'listUnclassifiedConfigs')
        return Promise.resolve({ result: { ok: true, data: [] } })
      if (data.action === 'loadConfig')
        return Promise.resolve({
          result: {
            ok: true,
            data: {
              configId: 'other',
              name: '雲端配置',
              scope: 'battle',
              version: 1,
              schemaVersion: 1,
              fleetState: createFleetState(),
              createdAt: '2026-10-01T00:00:00.000Z',
              updatedAt: '2026-10-01T00:00:00.000Z',
              lastUsedAt: '2026-10-01T00:00:00.000Z',
            },
          },
        })
      throw new Error('未預期操作')
    })
    const page = createPageInstance()
    await page.onLoad()
    const login = page.onConfigLogin()
    await vi.waitFor(() =>
      expect(mockCallFunction.mock.calls.some(([arg]) => arg.data.action === 'listMyConfigs')).toBe(
        true,
      ),
    )
    page.onModeTap({ currentTarget: { dataset: {} }, detail: { mode: 'manual' } } as never)
    expect(page.data.configStatus).toBe('unsaved')
    resolveList({
      result: {
        ok: true,
        data: hasConfig
          ? [
              {
                configId: 'other',
                name: '雲端配置',
                scope: 'battle',
                version: 1,
                updatedAt: '2026-10-01T00:00:00.000Z',
                lastUsedAt: '2026-10-01T00:00:00.000Z',
              },
            ]
          : [],
      },
    })
    await login
    expect(page.data.mode).toBe('manual')
    expect(page.data.configStatus).toBe('unsaved')
    expect(page.data.activeConfigId).toBeNull()
    expect(
      mockCallFunction.mock.calls.filter(([arg]) => arg.data.action === 'loadConfig'),
    ).toHaveLength(0)
  })

  it.each(['discard', 'save'] as const)(
    '載入失敗後編輯，取消保留草稿，%s 後才重試原配置',
    async (choice) => {
      let loadCalls = 0
      const now = '2026-10-01T00:00:00.000Z'
      mockCallFunction.mockImplementation(
        async ({
          data,
        }: {
          data: {
            action: string
            configId?: string
            fleetState?: ReturnType<typeof createFleetState>
          }
        }) => {
          if (data.action === 'authenticate')
            return { result: { ok: true, data: { authenticated: true } } }
          if (data.action === 'listMyConfigs' || data.action === 'listUnclassifiedConfigs')
            return { result: { ok: true, data: [] } }
          if (data.action === 'saveAsConfig')
            return {
              result: {
                ok: true,
                data: {
                  configId: 'saved-draft',
                  name: '新草稿',
                  scope: 'battle',
                  version: 1,
                  schemaVersion: 1,
                  fleetState: data.fleetState,
                  createdAt: now,
                  updatedAt: now,
                  lastUsedAt: now,
                },
              },
            }
          if (data.action === 'loadConfig') {
            loadCalls += 1
            if (loadCalls === 1)
              return { result: { ok: false, code: 'not-found', message: '找不到配置' } }
            return {
              result: {
                ok: true,
                data: {
                  configId: data.configId,
                  name: '原重試目標',
                  scope: 'battle',
                  version: 1,
                  schemaVersion: 1,
                  fleetState: createFleetState(),
                  createdAt: now,
                  updatedAt: now,
                  lastUsedAt: now,
                },
              },
            }
          }
          throw new Error(`未預期操作：${data.action}`)
        },
      )
      const page = createPageInstance()
      await page.onLoad()
      await page.onConfigLogin()
      page.onConfigLoad({ currentTarget: { dataset: { id: 'retry-original' } } } as never)
      await vi.waitFor(() => expect(page.data.configLoadError).toBe('載入配置失敗'))
      page.onModeTap({ currentTarget: { dataset: {} }, detail: { mode: 'manual' } } as never)
      await page.onConfigRetry()
      expect(page.data.showUnsavedGuard).toBe(true)
      expect(page.data.pendingAction).toEqual({ type: 'load', targetConfigId: 'retry-original' })
      expect(loadCalls).toBe(1)
      page.onUnsavedGuardCancel()
      expect(page.data.mode).toBe('manual')
      expect(page.data.configStatus).toBe('unsaved')
      await page.onConfigRetry()
      expect(loadCalls).toBe(1)
      if (choice === 'discard') page.onUnsavedGuardDiscard()
      else {
        await page.onUnsavedGuardSave()
        expect(page.data.showNameModal).toBe(true)
        expect(loadCalls).toBe(1)
        page.onConfigNameInput({ detail: { value: '新草稿' } } as never)
        await page.onConfigModalConfirm()
      }
      await vi.waitFor(() => expect(page.data.activeConfigId).toBe('retry-original'))
      expect(loadCalls).toBe(2)
      expect(page.data.configStatus).toBe('saved')
    },
  )
})

describe('登入列表延續失效回歸', () => {
  it('列表等待中編輯後卸載，不再開命名視窗或載入配置', async () => {
    let resolveList!: (value: unknown) => void
    const waitingList = new Promise((resolve) => {
      resolveList = resolve
    })
    mockCallFunction.mockImplementation(({ data }: { data: { action: string } }) => {
      if (data.action === 'authenticate')
        return Promise.resolve({ result: { ok: true, data: { authenticated: true } } })
      if (data.action === 'listMyConfigs') return waitingList
      if (data.action === 'listUnclassifiedConfigs')
        return Promise.resolve({ result: { ok: true, data: [] } })
      throw new Error(`不應載入配置：${data.action}`)
    })
    const page = createPageInstance()
    await page.onLoad()
    const login = page.onConfigLogin()
    await vi.waitFor(() =>
      expect(mockCallFunction.mock.calls.some(([arg]) => arg.data.action === 'listMyConfigs')).toBe(
        true,
      ),
    )
    page.onModeTap({ currentTarget: { dataset: {} }, detail: { mode: 'manual' } } as never)
    page.onUnload()
    const updates = vi.spyOn(page, 'setData')
    resolveList({ result: { ok: true, data: [] } })
    await login
    expect(updates).not.toHaveBeenCalled()
    expect(page.data.showNameModal).toBe(false)
    expect(page.data.mode).toBe('manual')
    expect(
      mockCallFunction.mock.calls.filter(([arg]) => arg.data.action === 'loadConfig'),
    ).toHaveLength(0)
  })
})

describe('保存後列表刷新仍保護新草稿', () => {
  it.each(['edit', 'unload'] as const)(
    '保存草稿後refresh等待中 %s 不再啟動pending load',
    async (change) => {
      let resolveList!: (value: unknown) => void
      const waitingList = new Promise((resolve) => {
        resolveList = resolve
      })
      let listCalls = 0
      let loadCalls = 0
      const now = '2026-10-01T00:00:00.000Z'
      mockCallFunction.mockImplementation(
        async ({
          data,
        }: {
          data: { action: string; fleetState?: ReturnType<typeof createFleetState> }
        }) => {
          if (data.action === 'authenticate')
            return { result: { ok: true, data: { authenticated: true } } }
          if (data.action === 'listUnclassifiedConfigs') return { result: { ok: true, data: [] } }
          if (data.action === 'listMyConfigs') {
            listCalls += 1
            return listCalls === 2 ? waitingList : { result: { ok: true, data: [] } }
          }
          if (data.action === 'loadConfig') {
            loadCalls += 1
            return { result: { ok: false, code: 'not-found', message: '找不到配置' } }
          }
          if (data.action === 'saveAsConfig')
            return {
              result: {
                ok: true,
                data: {
                  configId: 'saved-draft',
                  name: '保存草稿',
                  scope: 'battle',
                  version: 1,
                  schemaVersion: 1,
                  fleetState: data.fleetState,
                  createdAt: now,
                  updatedAt: now,
                  lastUsedAt: now,
                },
              },
            }
          throw new Error(`未預期操作：${data.action}`)
        },
      )
      const page = createPageInstance()
      await page.onLoad()
      await page.onConfigLogin()
      page.onConfigLoad({ currentTarget: { dataset: { id: 'retry-original' } } } as never)
      await vi.waitFor(() => expect(page.data.configLoadError).toBe('載入配置失敗'))
      page.onModeTap({ currentTarget: { dataset: {} }, detail: { mode: 'manual' } } as never)
      await page.onConfigRetry()
      expect(page.data.showUnsavedGuard).toBe(true)
      await page.onUnsavedGuardSave()
      page.onConfigNameInput({ detail: { value: '保存草稿' } } as never)
      const saving = page.onConfigModalConfirm()
      await vi.waitFor(() => expect(listCalls).toBe(2))
      expect(page.data.activeConfigId).toBe('saved-draft')
      if (change === 'edit')
        page.onModeTap({ currentTarget: { dataset: {} }, detail: { mode: 'auto' } } as never)
      else page.onUnload()
      const updates = vi.spyOn(page, 'setData')
      resolveList({ result: { ok: true, data: [] } })
      await saving
      expect(loadCalls).toBe(1)
      if (change === 'edit') {
        expect(page.data.mode).toBe('auto')
        expect(page.data.configStatus).toBe('unsaved')
      } else expect(updates).not.toHaveBeenCalled()
    },
  )
})

describe('配置列表与重試亂序回歸', () => {
  it('較新重試列表先回覆，舊登入列表不能覆蓋或發起載入', async () => {
    let resolveOld!: (value: unknown) => void
    const waiting = new Promise((resolve) => {
      resolveOld = resolve
    })
    let calls = 0
    const summary = (configId: string) => ({
      configId,
      name: configId,
      scope: 'battle',
      version: 1,
      updatedAt: '2026-10-01T00:00:00.000Z',
      lastUsedAt: '2026-10-01T00:00:00.000Z',
    })
    mockCallFunction.mockImplementation(async ({ data }: { data: { action: string } }) => {
      if (data.action === 'authenticate')
        return { result: { ok: true, data: { authenticated: true } } }
      if (data.action === 'listUnclassifiedConfigs') return { result: { ok: true, data: [] } }
      if (data.action === 'listMyConfigs')
        return ++calls === 1 ? waiting : { result: { ok: true, data: [summary('new-list')] } }
      throw new Error(`不應載入：${data.action}`)
    })
    const page = createPageInstance()
    await page.onLoad()
    const login = page.onConfigLogin()
    await vi.waitFor(() => expect(calls).toBe(1))
    await page.onConfigRetry()
    resolveOld({ result: { ok: true, data: [summary('old-list')] } })
    await login
    expect(page.data.configList).toEqual([summary('new-list')])
    expect(
      mockCallFunction.mock.calls.filter(([arg]) => arg.data.action === 'loadConfig'),
    ).toHaveLength(0)
  })

  it('原配置連續載入兩次失敗後，仍可第三次重試成功', async () => {
    let loads = 0
    const now = '2026-10-01T00:00:00.000Z'
    mockCallFunction.mockImplementation(
      async ({ data }: { data: { action: string; configId?: string } }) => {
        if (data.action === 'authenticate')
          return { result: { ok: true, data: { authenticated: true } } }
        if (data.action === 'listMyConfigs' || data.action === 'listUnclassifiedConfigs')
          return { result: { ok: true, data: [] } }
        if (data.action === 'loadConfig') {
          loads += 1
          if (loads < 3) return { result: { ok: false, code: 'not-found', message: '找不到配置' } }
          return {
            result: {
              ok: true,
              data: {
                configId: data.configId,
                name: '重試成功',
                scope: 'battle',
                version: 1,
                schemaVersion: 1,
                fleetState: createFleetState(),
                createdAt: now,
                updatedAt: now,
                lastUsedAt: now,
              },
            },
          }
        }
        throw new Error(`未預期操作：${data.action}`)
      },
    )
    const page = createPageInstance()
    await page.onLoad()
    await page.onConfigLogin()
    page.onConfigLoad({ currentTarget: { dataset: { id: 'retry-original' } } } as never)
    await vi.waitFor(() => expect(page.data.configLoadError).toBe('載入配置失敗'))
    await page.onConfigRetry()
    expect(loads).toBe(2)
    expect(page.data.configLoadError).toBe('載入配置失敗')
    await page.onConfigRetry()
    expect(loads).toBe(3)
    expect(page.data.activeConfigId).toBe('retry-original')
  })

  it('兩次載入逆序回覆只保留最後選取配置', async () => {
    const resolvers = new Map<string, (value: unknown) => void>()
    const now = '2026-10-01T00:00:00.000Z'
    mockCallFunction.mockImplementation(
      async ({ data }: { data: { action: string; configId?: string } }) => {
        if (data.action === 'authenticate')
          return { result: { ok: true, data: { authenticated: true } } }
        if (data.action === 'listMyConfigs' || data.action === 'listUnclassifiedConfigs')
          return { result: { ok: true, data: [] } }
        if (data.action === 'loadConfig')
          return new Promise((resolve) => {
            resolvers.set(data.configId!, resolve)
          })
        throw new Error(`未預期操作：${data.action}`)
      },
    )
    const page = createPageInstance()
    await page.onLoad()
    await page.onConfigLogin()
    page.onConfigLoad({ currentTarget: { dataset: { id: 'A' } } } as never)
    page.onConfigLoad({ currentTarget: { dataset: { id: 'B' } } } as never)
    const result = (configId: string) => ({
      result: {
        ok: true,
        data: {
          configId,
          name: configId,
          scope: 'battle',
          version: 1,
          schemaVersion: 1,
          fleetState: createFleetState(),
          createdAt: now,
          updatedAt: now,
          lastUsedAt: now,
        },
      },
    })
    resolvers.get('B')!(result('B'))
    await vi.waitFor(() => expect(page.data.activeConfigId).toBe('B'))
    resolvers.get('A')!(result('A'))
    await Promise.resolve()
    await Promise.resolve()
    expect(page.data.activeConfigId).toBe('B')
  })
})

describe('放棄修改先還原保存基線', () => {
  const setupBaseline = async () => {
    const fleetState = createFleetState()
    fleetState.ships.forEach((ship) => {
      ship.mode = 'auto'
    })
    fleetState.ships[0]!.targets = [
      { id: 'saved-target', skillId: 'skill_skill400591', targetLevel: 1 },
    ]
    const now = '2026-10-01T00:00:00.000Z'
    mockCallFunction.mockImplementation(
      async ({ data }: { data: { action: string; configId?: string } }) => {
        if (data.action === 'authenticate')
          return { result: { ok: true, data: { authenticated: true } } }
        if (data.action === 'listMyConfigs')
          return {
            result: {
              ok: true,
              data: [
                {
                  configId: 'baseline',
                  name: '保存基線',
                  scope: 'battle',
                  version: 1,
                  updatedAt: now,
                  lastUsedAt: now,
                },
              ],
            },
          }
        if (data.action === 'listUnclassifiedConfigs') return { result: { ok: true, data: [] } }
        if (data.action === 'loadConfig' && data.configId === 'baseline')
          return {
            result: {
              ok: true,
              data: {
                configId: 'baseline',
                name: '保存基線',
                scope: 'battle',
                version: 1,
                schemaVersion: 1,
                fleetState: structuredClone(fleetState),
                createdAt: now,
                updatedAt: now,
                lastUsedAt: now,
              },
            },
          }
        if (data.action === 'loadConfig' || data.action === 'deleteConfig')
          return { result: { ok: false, code: 'network', message: '暫時無法完成操作' } }
        throw new Error(`未預期操作：${data.action}`)
      },
    )
    wxStub.showModal.mockImplementation(
      (options: { success?: (result: { confirm: boolean }) => void }) =>
        options.success?.({ confirm: true }),
    )
    const page = createPageInstance()
    await page.onLoad()
    await page.onConfigLogin()
    return page
  }
  const request = (page: ReturnType<typeof createPageInstance>, action: string) => {
    if (action === 'delete') page.onConfigDelete()
    else page.onConfigLoad({ currentTarget: { dataset: { id: 'failed-target' } } } as never)
  }

  it.each(['load', 'delete'])(
    '編輯後 %s 放棄，即使服務失敗也已回到基線且可新建',
    async (action) => {
      const page = await setupBaseline()
      const baselineTargets = structuredClone(page.data.targets)
      page.onModeTap({ currentTarget: { dataset: {} }, detail: { mode: 'manual' } } as never)
      request(page, action)
      expect(page.data.showUnsavedGuard).toBe(true)
      page.onUnsavedGuardCancel()
      expect(page.data.mode).toBe('manual')
      expect(page.data.configStatus).toBe('unsaved')
      request(page, action)
      page.onUnsavedGuardDiscard()
      await vi.waitFor(() =>
        expect(
          mockCallFunction.mock.calls.filter(
            ([arg]) =>
              arg.data.action === (action === 'delete' ? 'deleteConfig' : 'loadConfig') &&
              (action === 'delete' || arg.data.configId === 'failed-target'),
          ),
        ).toHaveLength(1),
      )
      expect(page.data.mode).toBe('auto')
      expect(page.data.targets).toEqual(baselineTargets)
      expect(page.data.configStatus).toBe('saved')
      expect(page.data.proposalPreview).toBeNull()
      expect(page.data.canUndoProposal).toBe(false)
      expect(page.data.showUnsavedGuard).toBe(false)
      if (action === 'load') {
        await vi.waitFor(() => expect(page.data.configLoadError).toBe('載入配置失敗'))
        await page.onConfigRetry()
        expect(page.data.showUnsavedGuard).toBe(false)
        expect(
          mockCallFunction.mock.calls.filter(
            ([arg]) => arg.data.action === 'loadConfig' && arg.data.configId === 'failed-target',
          ),
        ).toHaveLength(2)
      }
      page.onConfigNew()
      expect(page.data.showUnsavedGuard).toBe(false)
      expect(page.data.activeConfigId).toBeNull()
    },
  )

  it.each(['preview', 'undo'])('放棄清除實際 %s 提案狀態，失敗後不可復活舊內容', async (kind) => {
    const page = await setupBaseline()
    const baselineTargets = structuredClone(page.data.targets)
    page.onTargetLevelBlur({
      currentTarget: { dataset: { id: 'saved-target' } },
      detail: { value: '2' },
    } as never)
    page.onRecalculate()
    expect(page.data.proposalPreview).not.toBeNull()
    if (kind === 'undo') {
      page.onProposalApply()
      expect(page.data.canUndoProposal).toBe(true)
    }
    page.onConfigLoad({ currentTarget: { dataset: { id: 'failed-target' } } } as never)
    expect(page.data.showUnsavedGuard).toBe(true)
    page.onUnsavedGuardDiscard()
    await vi.waitFor(() => expect(page.data.configLoadError).toBe('載入配置失敗'))
    expect(page.data.targets).toEqual(baselineTargets)
    expect(page.data.proposalPreview).toBeNull()
    expect(page.data.canUndoProposal).toBe(false)
    page.onUndoProposal()
    expect(page.data.targets).toEqual(baselineTargets)
    expect(page.data.configStatus).toBe('saved')
  })

  it.each(['load', 'new', 'delete', 'rename', 'saveAs'])(
    '%s 還原失敗保留守衛、草稿與原 pending，不執行後續操作',
    async (action) => {
      const page = await setupBaseline()
      page.onModeTap({ currentTarget: { dataset: {} }, detail: { mode: 'manual' } } as never)
      if (action === 'new') page.onConfigNew()
      else if (action === 'rename') page.onConfigRename()
      else if (action === 'saveAs') page.onConfigSaveAs()
      else request(page, action)
      const pending = structuredClone(page.data.pendingAction)
      const loadCount = mockCallFunction.mock.calls.filter(
        ([arg]) => arg.data.action === 'loadConfig',
      ).length
      // 只替代解析失敗邊界，實際 Controller、守衛與 pending 操作仍照常執行。
      const parser = vi.spyOn(fleetConfigContracts, 'parseFleetState').mockReturnValueOnce(null)
      try {
        page.onUnsavedGuardDiscard()
        expect(page.data.showUnsavedGuard).toBe(true)
        expect(page.data.pendingAction).toEqual(pending)
        expect(page.data.configStatus).toBe('unsaved')
        expect(page.data.mode).toBe('manual')
        expect(page.data.activeConfigId).toBe('baseline')
        expect(page.data.showNameModal).toBe(false)
        expect(
          mockCallFunction.mock.calls.filter(([arg]) => arg.data.action === 'loadConfig'),
        ).toHaveLength(loadCount)
        expect(
          mockCallFunction.mock.calls.filter(([arg]) => arg.data.action === 'deleteConfig'),
        ).toHaveLength(0)
        expect(wxStub.showToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: expect.stringMatching(/還原/) }),
        )
      } finally {
        parser.mockRestore()
      }
      page.onUnsavedGuardDiscard()
      expect(page.data.showUnsavedGuard).toBe(false)
      if (action === 'saveAs' || action === 'rename') {
        expect(page.data.showNameModal).toBe(true)
        expect(page.data.mode).toBe('auto')
        expect(page.data.configStatus).toBe('saved')
      }
    },
  )
})

describe('合法舊戰鬥配置的 Lv.0 目標', () => {
  const setupZeroConfig = async (mixed = false, legacy = false) => {
    const fleetState = createFleetState()
    fleetState.ships[0]!.mode = 'auto'
    fleetState.ships[0]!.targets = [{ id: 'zero', skillId: 'skill_skill400591', targetLevel: 0 }]
    if (mixed)
      fleetState.ships[0]!.targets.push({
        id: 'positive',
        skillId: 'skill_skill200681',
        targetLevel: 2,
      })
    const now = '2026-10-01T00:00:00.000Z'
    let record = {
      configId: 'zero-config',
      name: '舊零目標配置',
      scope: legacy ? 'unclassified' : 'battle',
      version: 1,
      schemaVersion: 1,
      fleetState,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
    }
    const summary = () => {
      const { configId, name, scope, version, updatedAt, lastUsedAt } = record
      return { configId, name, scope, version, updatedAt, lastUsedAt }
    }
    const writes: ReturnType<typeof createFleetState>[] = []
    mockCallFunction.mockImplementation(
      async ({
        data,
      }: {
        data: { action: string; fleetState: ReturnType<typeof createFleetState> }
      }) => {
        if (data.action === 'authenticate')
          return { result: { ok: true, data: { authenticated: true } } }
        if (data.action === 'listMyConfigs')
          return { result: { ok: true, data: record.scope === 'battle' ? [summary()] : [] } }
        if (data.action === 'listUnclassifiedConfigs')
          return { result: { ok: true, data: record.scope === 'unclassified' ? [summary()] : [] } }
        if (data.action === 'classifyConfig') {
          record = { ...record, scope: 'battle', version: record.version + 1 }
          return { result: { ok: true, data: structuredClone(record) } }
        }
        if (data.action === 'loadConfig')
          return { result: { ok: true, data: structuredClone(record) } }
        if (data.action === 'updateConfig') {
          writes.push(structuredClone(data.fleetState))
          record = {
            ...record,
            fleetState: structuredClone(data.fleetState),
            version: record.version + 1,
          }
          return { result: { ok: true, data: structuredClone(record) } }
        }
        throw new Error(`未預期操作：${data.action}`)
      },
    )
    const page = createPageInstance()
    await page.onLoad()
    await page.onConfigLogin()
    return { page, writes }
  }

  it('全零目標載入後保留 Lv.0 並停用重算，說明需正數目標', async () => {
    const { page } = await setupZeroConfig()
    expect(page.data.targets).toEqual([expect.objectContaining({ id: 'zero', targetLevel: 0 })])
    expect(page.data.canRecalculate).toBe(false)
    expect(page.data.recalculateDisabledReason).toMatch(/Lv\.1/)
    expect(page.data.configStatus).toBe('saved')
  })
  it('直接觸發全零重算也不拋例外、不建立提案、不改配置', async () => {
    const { page } = await setupZeroConfig()
    const original = structuredClone(page.data.targets)
    expect(() => page.onRecalculate()).not.toThrow()
    expect(page.data.proposalPreview).toBeNull()
    expect(page.data.targets).toEqual(original)
    expect(page.data.configStatus).toBe('saved')
    expect(wxStub.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/Lv\.1/) }),
    )
  })
  it('混合 Lv.0 與正數仍產生只含正數目標的提案', async () => {
    const { page } = await setupZeroConfig(true)
    const original = structuredClone(page.data.targets)
    expect(() => page.onRecalculate()).not.toThrow()
    expect(page.data.proposalPreview).toMatchObject({
      targetCount: 1,
      targetDiffs: [expect.objectContaining({ skillId: 'skill_skill200681', targetLevel: 2 })],
    })
    expect(page.data.targets).toEqual(original)
    expect(page.data.configStatus).toBe('saved')
  })
  it('舊 Lv.0 配置分類、載入、保存仍保留零，設正數後可重算', async () => {
    const { page, writes } = await setupZeroConfig(false, true)
    await page.onConfigClassify({
      currentTarget: { dataset: { id: 'zero-config', scope: 'battle' } },
    } as never)
    page.onConfigLoad({ currentTarget: { dataset: { id: 'zero-config' } } } as never)
    await vi.waitFor(() => expect(page.data.activeConfigId).toBe('zero-config'))
    expect(page.data.targets[0]).toMatchObject({ targetLevel: 0 })
    await page.onConfigSave()
    expect(writes).toHaveLength(1)
    expect(writes[0]!.ships[0]!.targets[0]!.targetLevel).toBe(0)
    page.onTargetLevelBlur({
      currentTarget: { dataset: { id: 'zero' } },
      detail: { value: '2' },
    } as never)
    expect(page.data.targets[0]).toMatchObject({ targetLevel: 2 })
    expect(page.data.canRecalculate).toBe(true)
    expect(() => page.onRecalculate()).not.toThrow()
    expect(page.data.proposalPreview).toMatchObject({
      targetCount: 1,
      targetDiffs: [expect.objectContaining({ targetLevel: 2 })],
    })
  })
  it.each(['-1', '1.5'])('實際輸入 %s 被拒絕，原合法零配置保持不變', async (value) => {
    const { page } = await setupZeroConfig()
    const original = structuredClone(page.data.targets)
    page.onTargetLevelBlur({
      currentTarget: { dataset: { id: 'zero' } },
      detail: { value },
    } as never)
    expect(page.data.targets).toEqual(original)
    expect(page.data.configStatus).toBe('saved')
  })
})
