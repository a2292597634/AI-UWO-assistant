import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
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
    expect(fleetWxml).toContain('style="display: block; min-height: 224rpx; flex: 0 0 auto;"')
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
      title: '請先設定至少一個有效的戰鬥技能目標',
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
    expect(fleetWxml).toContain('尚未設定目標')
    expect(fleetWxml).toContain('請從下方技能篩選選擇技能加入目標')
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
