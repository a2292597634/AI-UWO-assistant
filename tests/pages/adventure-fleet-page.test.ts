import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createFleetState } from '../../miniprogram/domain/battle-fleet'

interface AdventureTargetView {
  id: string
  skillId: string | null
  targetLevel: number
}

interface AdventurePageData {
  targets: AdventureTargetView[]
  canRecalculate: boolean
  showTargetPicker: boolean
  typeZones: unknown[]
  configStatus: string
  proposalPreview: Record<string, unknown> | null
  canUndoProposal: boolean
  [key: string]: unknown
}

interface AdventurePageConfig {
  data: AdventurePageData
  onLoad(): void
  onSkillSelect(event: WechatMiniprogram.BaseEvent): void
  onModeTap(event: WechatMiniprogram.BaseEvent): void
  onAddTarget(): void
  onTargetPickerClose(): void
  onRecalculate(): void
  onProposalCancel(): void
  onProposalApply(): void
  onUndoProposal(): void
  onUndoDismiss(): void
  onOfficerSelect(event: WechatMiniprogram.BaseEvent): void
  onConfigLogin(): Promise<void>
  onConfigSave(): Promise<void>
  onConfigToggle(): void
  onConfigClassify(event: WechatMiniprogram.BaseEvent): Promise<void>
  onConfigRetry(): Promise<void>
  onShareFleet(): Promise<void>
  onSharePreviewClose(): void
  onShareImage(): Promise<void>
  onSaveShareImage(): Promise<void>
  onShareRetry(): Promise<void>
}

interface AdventurePageInstance extends AdventurePageConfig {
  data: AdventurePageData
  setData(update: Record<string, unknown>, callback?: () => void): void
}

let adventurePage: AdventurePageConfig
const adventureMockCallFunction = vi.fn()
const wxStub = {
  showToast: vi.fn(),
  showModal: vi.fn(),
  setNavigationBarTitle: vi.fn(),
  navigateTo: vi.fn(),
  navigateBack: vi.fn(),
  createSelectorQuery: vi.fn(),
  canvasToTempFilePath: vi.fn(),
  saveImageToPhotosAlbum: vi.fn(),
  showShareImageMenu: vi.fn(),
  cloud: {
    callFunction: adventureMockCallFunction,
  },
}

const createPageInstance = (): AdventurePageInstance => {
  const instance = Object.create(adventurePage) as AdventurePageInstance
  instance.data = structuredClone(adventurePage.data)
  instance.setData = (update, callback) => {
    Object.assign(instance.data, update)
    callback?.()
  }
  return instance
}

beforeAll(async () => {
  vi.stubGlobal('Page', (config: AdventurePageConfig) => {
    adventurePage = config
  })
  vi.stubGlobal('wx', wxStub)

  await import('../../miniprogram/pages/adventure-fleet/index')
})

beforeEach(() => {
  vi.clearAllMocks()
  adventureMockCallFunction.mockReset()
})

describe('adventure fleet config lifecycle', () => {
  it('冒險頁只傳 adventure scope，載入成功後自動收起', async () => {
    const now = '2026-01-01T00:00:00.000Z'
    const fleetState = createFleetState()
    adventureMockCallFunction.mockImplementation(async ({ data }: { data: { action: string } }) => {
      switch (data.action) {
        case 'authenticate':
          return { result: { ok: true, data: { authenticated: true } } }
        case 'listMyConfigs':
          return {
            result: {
              ok: true,
              data: [
                {
                  configId: 'adventure-1',
                  name: '冒險配置',
                  scope: 'adventure',
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
                configId: 'adventure-1',
                name: '冒險配置',
                scope: 'adventure',
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
    page.onLoad()
    page.onConfigToggle()
    expect(page.data.expanded).toBe(true)

    await page.onConfigLogin()

    expect(adventureMockCallFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'listMyConfigs', scope: 'adventure' }),
      }),
    )
    expect(adventureMockCallFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'loadConfig', scope: 'adventure' }),
      }),
    )
    expect(page.data.expanded).toBe(false)
  })

  it('保存後以服務端回應的 fleetState 作為新的頁面基準', async () => {
    const now = '2026-01-01T00:00:00.000Z'
    const serverFleetState = createFleetState()
    adventureMockCallFunction.mockImplementation(async ({ data }: { data: { action: string } }) => {
      switch (data.action) {
        case 'authenticate':
          return { result: { ok: true, data: { authenticated: true } } }
        case 'listMyConfigs':
          return {
            result: {
              ok: true,
              data: [
                {
                  configId: 'adventure-1',
                  name: '冒險配置',
                  scope: 'adventure',
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
                configId: 'adventure-1',
                name: '冒險配置',
                scope: 'adventure',
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
                configId: 'adventure-1',
                name: '冒險配置',
                scope: 'adventure',
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
    expect(page.data.occupiedCount).toBe(0)
  })

  it('列表載入錯誤時保持配置模組展開', async () => {
    adventureMockCallFunction.mockImplementation(async ({ data }: { data: { action: string } }) => {
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
    page.onLoad()
    page.onConfigToggle()
    await page.onConfigLogin()

    expect(page.data.expanded).toBe(true)
    expect(page.data.configListState).toBe('error')
    expect(page.data.configListError).toBe('載入配置列表失敗')
  })

  it('待分類 action 傳遞 targetScope 並保留版本', async () => {
    const now = '2026-01-01T00:00:00.000Z'
    const fleetState = createFleetState()
    adventureMockCallFunction.mockImplementation(async ({ data }: { data: { action: string } }) => {
      switch (data.action) {
        case 'authenticate':
          return { result: { ok: true, data: { authenticated: true } } }
        case 'listMyConfigs':
          return { result: { ok: true, data: [] } }
        case 'listUnclassifiedConfigs':
          return {
            result: {
              ok: true,
              data: [
                {
                  configId: 'legacy-1',
                  name: '舊配置',
                  scope: 'unclassified',
                  version: 4,
                  updatedAt: now,
                  lastUsedAt: now,
                },
              ],
            },
          }
        case 'classifyConfig':
          return {
            result: {
              ok: true,
              data: {
                configId: 'legacy-1',
                name: '舊配置',
                scope: 'battle',
                fleetState,
                schemaVersion: 1,
                version: 5,
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
    await page.onConfigClassify({
      currentTarget: { dataset: { id: 'legacy-1', scope: 'battle' } },
    } as never)

    expect(adventureMockCallFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'classifyConfig',
          configId: 'legacy-1',
          expectedVersion: 4,
          targetScope: 'battle',
        }),
      }),
    )
  })
})

describe('adventure fleet page safety guard', () => {
  it('keeps preconfigured Lv.0 targets without showing an empty target row', () => {
    const page = createPageInstance()
    page.onLoad()

    expect(page.data.targets.length).toBeGreaterThan(0)
    expect(page.data.targets.every((target) => target.skillId !== null)).toBe(true)
    expect(page.data.targets.every((target) => target.targetLevel === 0)).toBe(true)
    expect(page.data.canRecalculate).toBe(false)
  })

  it('預設配置全部 28 個有效冒險技能目標', () => {
    const page = createPageInstance()
    page.onLoad()

    expect(page.data.targets).toHaveLength(28)
    expect(page.data.targets.map((target) => target.skillId)).toEqual(
      expect.arrayContaining([
        'skill_skillT0172',
        'skill_skillT0173',
        'skill_skillT0174',
        'skill_skillT0175',
        'skill_skillT0176',
      ]),
    )
  })

  it('預設目標未達 30 個時仍可新增目標', () => {
    const page = createPageInstance()
    page.onLoad()
    wxStub.showToast.mockClear()

    page.onAddTarget()

    expect(page.data.showTargetPicker).toBe(true)
    expect(wxStub.showToast).not.toHaveBeenCalled()
  })

  it('stops opening the target picker after the per-ship limit', () => {
    const page = createPageInstance()
    page.onLoad()

    for (let index = page.data.targets.length; index < 30; index += 1) {
      page.onAddTarget()
      page.onSkillSelect({ currentTarget: { dataset: { id: `skill-limit-${index}` } } } as never)
    }
    expect(page.data.targets).toHaveLength(30)
    wxStub.showToast.mockClear()

    page.onAddTarget()

    expect(page.data.showTargetPicker).toBe(false)
    expect(wxStub.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '每艘船最多設定 30 個目標' }),
    )
  })

  it('promotes a preconfigured Lv.0 skill to a Lv.1 target and closes the picker', () => {
    const page = createPageInstance()
    page.onLoad()
    const target = page.data.targets.find((item) => item.targetLevel === 0)
    expect(target).toBeDefined()

    page.onAddTarget()
    page.onSkillSelect({ currentTarget: { dataset: { id: target!.skillId } } } as never)

    expect(page.data.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skillId: target!.skillId, targetLevel: 1 }),
      ]),
    )
    expect(page.data.targets.every((item) => item.skillId !== null)).toBe(true)
    expect(page.data.showTargetPicker).toBe(false)
  })

  it('accepts mode and skill values emitted by shared components', () => {
    const page = createPageInstance()
    page.onLoad()
    const target = page.data.targets[0]!

    page.onModeTap({ detail: { value: 'auto' }, currentTarget: { dataset: {} } } as never)
    expect(page.data.mode).toBe('auto')

    page.onAddTarget()
    page.onSkillSelect({
      detail: { skillId: target.skillId },
      currentTarget: { dataset: {} },
    } as never)
    expect(page.data.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skillId: target.skillId, targetLevel: 1 }),
      ]),
    )
  })

  it('does not change configured officers when recalculating without a positive target', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    const beforeZones = structuredClone(page.data.typeZones)

    page.onRecalculate()

    expect(page.data.typeZones).toEqual(beforeZones)
    expect(wxStub.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '請先設定至少一個 Lv.1 以上的優化目標' }),
    )
  })

  it('closes the target picker without changing targets', () => {
    const page = createPageInstance()
    page.onLoad()
    const before = structuredClone(page.data.targets)

    page.onAddTarget()
    page.onTargetPickerClose()

    expect(page.data.showTargetPicker).toBe(false)
    expect(page.data.targets).toEqual(before)
    expect(page.data.configStatus).toBe('new')
  })

  it('opens a proposal preview without changing the current adventure fleet', () => {
    const page = createPageInstance()
    page.onLoad()
    const target = page.data.targets[0]!
    page.onAddTarget()
    page.onSkillSelect({ currentTarget: { dataset: { id: target.skillId } } } as never)
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    const before = {
      typeZones: structuredClone(page.data.typeZones),
      targets: structuredClone(page.data.targets),
      configStatus: page.data.configStatus,
    }

    page.onRecalculate()

    expect(page.data.proposalPreview).toBeDefined()
    expect(page.data.typeZones).toEqual(before.typeZones)
    expect(page.data.targets).toEqual(before.targets)
    expect(page.data.configStatus).toBe(before.configStatus)
  })

  it('cancels an adventure proposal without changing business state', () => {
    const page = createPageInstance()
    page.onLoad()
    const target = page.data.targets[0]!
    page.onAddTarget()
    page.onSkillSelect({ currentTarget: { dataset: { id: target.skillId } } } as never)
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    const before = {
      typeZones: structuredClone(page.data.typeZones),
      targets: structuredClone(page.data.targets),
      configStatus: page.data.configStatus,
    }

    page.onRecalculate()
    page.onProposalCancel()

    expect(page.data.proposalPreview).toBeNull()
    expect(page.data.typeZones).toEqual(before.typeZones)
    expect(page.data.targets).toEqual(before.targets)
    expect(page.data.configStatus).toBe(before.configStatus)
  })

  it('applies an adventure proposal and can undo the complete fleet snapshot', () => {
    const page = createPageInstance()
    page.onLoad()
    const target = page.data.targets[0]!
    page.onAddTarget()
    page.onSkillSelect({ currentTarget: { dataset: { id: target.skillId } } } as never)
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)
    const before = {
      typeZones: structuredClone(page.data.typeZones),
      targets: structuredClone(page.data.targets),
    }

    page.onRecalculate()
    page.onProposalApply()

    expect(page.data.proposalPreview).toBeNull()
    expect(page.data.canUndoProposal).toBe(true)
    expect(page.data.typeZones).not.toEqual(before.typeZones)

    page.onUndoProposal()

    expect(page.data.typeZones).toEqual(before.typeZones)
    expect(page.data.targets).toEqual(before.targets)
    expect(page.data.canUndoProposal).toBe(false)
  })

  it('closes the undo notice without reverting the applied fleet', () => {
    const page = createPageInstance()
    page.onLoad()
    const target = page.data.targets[0]!
    page.onAddTarget()
    page.onSkillSelect({ currentTarget: { dataset: { id: target.skillId } } } as never)
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)

    page.onRecalculate()
    page.onProposalApply()
    const applied = structuredClone(page.data.typeZones)

    page.onUndoDismiss()

    expect(page.data.canUndoProposal).toBe(false)
    expect(page.data.typeZones).toEqual(applied)
  })
})

const adventureWxml = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/pages/adventure-fleet/index.wxml'),
  'utf8',
)
const adventureWxss = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/pages/adventure-fleet/index.wxss'),
  'utf8',
)
const adventureJson = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../miniprogram/pages/adventure-fleet/index.json'),
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
  'status-badge',
  'empty-state',
] as const

const prepareShareCanvas = () => {
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
  wxStub.createSelectorQuery.mockReturnValue({
    select: vi.fn(() => ({
      node: vi.fn(() => ({
        exec: vi.fn((callback: (result: Array<{ node: unknown }>) => void) =>
          callback([{ node: canvas }]),
        ),
      })),
    })),
  })
  wxStub.canvasToTempFilePath.mockImplementation(
    (options: { success?: (result: { tempFilePath: string }) => void }) => {
      options.success?.({ tempFilePath: 'wxfile://adventure-share.png' })
    },
  )
  return canvas
}

describe('adventure fleet share entry', () => {
  it('uses config bar as the only share entry', () => {
    expect(adventureWxml).toContain('share-status="{{shareStatus}}"')
    expect(adventureWxml).toContain('bind:share="onShareFleet"')
    expect(adventureWxml).not.toContain('fleet-share-bar')
    expect(adventureWxss).not.toContain('.fleet-share-bar')
  })

  it('冒險配隊與戰鬥配隊共用突出配置卡', () => {
    expect(adventureWxml).toContain('prominent-share="{{true}}"')
    expect(adventureWxml).toContain('style="display: block; min-height: 144rpx; flex: 0 0 auto;"')
    expect(adventureWxml).toMatch(/<config-bar[\s\S]*bind:share="onShareFleet"[\s\S]*\/>/)
    expect(adventureWxml.indexOf('<view class="fleet-context">')).toBeLessThan(
      adventureWxml.indexOf('<config-bar'),
    )
  })

  it('dirty share action keeps the current fleet and records a share pending action', async () => {
    const page = createPageInstance()
    await page.onLoad()
    page.onOfficerSelect({ currentTarget: { dataset: { id: 'officer_chast089' } } } as never)

    page.onShareFleet()

    expect(page.data.showUnsavedGuard).toBe(true)
    expect(page.data.pendingAction).toEqual({ type: 'share' })
  })
})

describe('adventure fleet share generation', () => {
  it('generates a preview and passes the mini program home entrance when sharing', async () => {
    prepareShareCanvas()
    const page = createPageInstance()
    await page.onLoad()

    await page.onShareFleet()
    await page.onShareImage()

    expect(page.data.shareStatus).toBe('ready')
    expect(page.data.shareImagePath).toBe('wxfile://adventure-share.png')
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
    expect(wxStub.showShareImageMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'wxfile://adventure-share.png',
        entrancePath: 'pages/home/index',
      }),
    )
  })

  it('waits for the share canvas dimensions to render before selecting the canvas node', async () => {
    const canvas = prepareShareCanvas()
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
              callback([{ node: canvas }]),
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
    const canvas = prepareShareCanvas()
    const events: string[] = []
    canvas.requestAnimationFrame.mockImplementation((callback: () => void) => {
      events.push('request-animation-frame')
      callback()
      return 0
    })
    wxStub.canvasToTempFilePath.mockImplementation(
      (options: { success?: (result: { tempFilePath: string }) => void }) => {
        events.push('export')
        options.success?.({ tempFilePath: 'wxfile://adventure-share.png' })
      },
    )
    const page = createPageInstance()
    await page.onLoad()

    await page.onShareFleet()

    expect(events.indexOf('request-animation-frame')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('export')).toBeGreaterThan(events.indexOf('request-animation-frame'))
  })

  it('falls back to a timer when the Canvas repaint callback is unavailable', async () => {
    const share = prepareShareCanvas()
    ;(share as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame = undefined
    const page = createPageInstance()
    await page.onLoad()

    await page.onShareFleet()

    expect(page.data.shareStatus).toBe('ready')
  })

  it('不接受空的 Canvas 導出路徑，避免打開空白預覽層', async () => {
    prepareShareCanvas()
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
    prepareShareCanvas()
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
    prepareShareCanvas()
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
})

describe('adventure fleet page layout hooks', () => {
  it('loads the changed page files for structural assertions', () => {
    expect(adventureWxml.length).toBeGreaterThan(0)
    expect(adventureWxss.length).toBeGreaterThan(0)
  })

  it('renders the target picker and protects recalculation when no optimization target exists', () => {
    expect(adventureWxml).toContain('showTargetPicker')
    expect(adventureWxml).toContain('onTargetPickerClose')
    expect(adventureWxml).toContain('disabled="{{!canRecalculate}}"')
    expect(adventureWxml).toContain('onProposalCancel')
    expect(adventureWxml).toContain('onProposalApply')
    expect(adventureWxml).toContain('onUndoProposal')
    expect(adventureWxml).toContain('bind:dismiss-undo="onUndoDismiss"')
    expect(adventureWxml).toContain('proposalPreview')
    expect(adventureWxml).toContain('請先設定至少一個 Lv.1 以上的優化目標')
  })
})

describe('adventure fleet preview layout', () => {
  it('keeps the adventure preview outside the main fleet scroll container', () => {
    const fleetScrollEnd = adventureWxml.lastIndexOf('</scroll-view>')
    const previewIndex = adventureWxml.indexOf('<result-preview-sheet')

    expect(previewIndex).toBeGreaterThan(fleetScrollEnd)
    expect(
      adventureWxml.slice(
        adventureWxml.indexOf('<scroll-view class="fleet-scroll"'),
        fleetScrollEnd,
      ),
    ).not.toContain('<result-preview-sheet')
  })
})

describe('adventure fleet officer action surface', () => {
  it('uses compact direct actions per officer card', () => {
    const actionTag = adventureWxml.match(/<officer-action-sheet[\s\S]*?\/>/)?.[0] ?? ''
    expect(adventureWxml.match(/<officer-action-sheet\b/g)).toHaveLength(1)
    expect(actionTag).toMatch(/presentation="trigger"[\s\S]*?variant="card"/)
    expect(actionTag).not.toContain('presentation="sheet"')
    expect(adventureWxml).not.toContain('bind:open="onOfficerActionOpen"')
    expect(adventureWxml).toContain('allow-ban="{{true}}"')
    expect(adventureWxml.match(/bind:lock="onOfficerLock"/g)).toHaveLength(1)
    expect(adventureWxml.match(/bind:remove="onOfficerRemove"/g)).toHaveLength(1)
    expect(adventureWxml.match(/bind:ban="onBanOfficer"/g)).toHaveLength(1)
    expect(adventureWxss).not.toContain('.officer-slot__actions')
    expect(adventureWxss).not.toContain('.slot-action')
  })
})

describe('adventure fleet shared component wiring', () => {
  it('registers and renders the page shared components', () => {
    for (const name of sharedComponentNames) {
      expect(adventureJson.usingComponents?.[name]).toBe(`../../components/${name}/index`)
      expect(adventureWxml).toMatch(new RegExp(`<${name}(?:\\s|/?>)`))
    }
  })

  it('keeps existing handlers for inline and sheet skill pickers and proposal actions', () => {
    expect(adventureWxml).toContain('bind:toggle="onConfigToggle"')
    expect(adventureWxml).toContain('bind:load="onConfigLoad"')
    expect(adventureWxml).toContain('bind:classify="onConfigClassify"')
    expect(adventureWxml).toContain('bind:retry="onConfigRetry"')
    expect(adventureWxml).toContain('bind:exit="onConfigExit"')
    expect(adventureWxml).not.toContain('<config-list-modal')
    expect(adventureWxml).toContain('<config-name-modal')
    expect(adventureWxml).toContain('<config-conflict-modal')
    expect(adventureWxml).not.toContain('class="config-item')
    expect(adventureWxml).not.toContain('class="config-modal__input"')
    expect(adventureWxml).toContain('bind:change="onModeTap"')
    expect(adventureWxml).toContain('presentation="inline"')
    expect(adventureWxml).toContain('presentation="sheet"')
    expect(adventureWxml).toContain('bind:dismiss="onTargetPickerClose"')
    expect(adventureWxml).toContain('bind:skill-tap="onSkillTap"')
    expect(adventureWxml).toContain('bind:select="onSkillSelect"')
    expect(adventureWxml).toContain('bind:cancel="onProposalCancel"')
    expect(adventureWxml).toContain('bind:apply="onProposalApply"')
    expect(adventureWxml).toContain('bind:undo="onUndoProposal"')
    expect(adventureWxml).not.toContain('class="proposal-preview-sheet"')
    expect(adventureWxml).not.toContain('class="officer-card__actions"')
    expect(adventureWxml).toContain('selected-skill-id="{{selectedSkillId}}"')
    expect(adventureWxss).toMatch(
      /\.officer-card\s*\{[\s\S]*padding:\s*var\(--uwo-space-2\)\s+var\(--uwo-space-1\);/,
    )
    expect(adventureWxss).not.toMatch(/\.officer-card\s*\{[\s\S]*padding:\s*8rpx 4rpx;/)
  })

  it('keeps distinct inline and sheet copy plus adventure skill ownership meta', () => {
    expect(adventureWxml).toMatch(
      /presentation="inline"[\s\S]*?title="冒險技能列表"[\s\S]*?hint="點擊「選擇」篩選候選航海士"/,
    )
    expect(adventureWxml).toMatch(
      /presentation="sheet"[\s\S]*?title="選擇新增目標技能"[\s\S]*?hint="會建立 Lv\.1 優化目標"/,
    )
    expect(adventureWxml.match(/search-placeholder="搜尋冒險技能名稱"/g)).toHaveLength(2)
    expect(adventureWxml.match(/empty-label="沒有符合的冒險技能"/g)).toHaveLength(2)
  })

  it('整理冒險目標與低頻摘要區塊', () => {
    expect(adventureJson.usingComponents?.['disclosure-section']).toBe(
      '../../components/disclosure-section/index',
    )
    expect(adventureWxml).not.toContain('class="fleet-header"')
    expect(adventureWxml).toContain('class="fleet-context"')
    expect(adventureWxml).toContain('optimizationTargets')
    expect(adventureWxml).toContain('trackingTargets')
    expect(adventureWxml).toContain('title="技能追蹤"')
    expect(adventureWxml).toContain('title="全艦隊排除名單"')
    expect(adventureWxml).toContain('title="全艦隊冒險技能累計"')
    expect(adventureWxml).toMatch(
      /<disclosure-section[^>]*title="技能追蹤"[^>]*default-expanded="\{\{true\}\}"[^>]*>/,
    )
    expect(adventureWxml.match(/default-expanded="\{\{false\}\}"/g)).toHaveLength(2)

    for (const handler of [
      'onAddTarget',
      'onRemoveTarget',
      'onTargetLevelBlur',
      'onRecalculate',
      'onProposalCancel',
      'onProposalApply',
      'onUndoProposal',
      'onUnbanOfficer',
    ]) {
      expect(adventureWxml).toContain(handler)
    }
  })

  it('使用 Token 上下文與可讀操作文字', () => {
    expect(adventureWxss).toMatch(/\.fleet-context\s*\{[\s\S]*var\(--uwo-/)
    expect(adventureWxss).toMatch(/\.target-row\s*\{[\s\S]*min-height:\s*64rpx/)
    expect(adventureWxss).toMatch(/\.level-input\s*\{[\s\S]*min-height:\s*56rpx/)
    expect(adventureWxss).toMatch(
      /\.target-row__remove\s*\{[\s\S]*width:\s*112rpx[\s\S]*min-width:\s*112rpx[\s\S]*min-height:\s*56rpx/,
    )
    expect(adventureWxss).toMatch(
      /\.target-row__remove\s*\{[\s\S]*width:\s*112rpx\s*!important[\s\S]*min-width:\s*112rpx\s*!important[\s\S]*max-width:\s*112rpx\s*!important[\s\S]*flex:\s*0\s+0\s+112rpx\s*!important[\s\S]*margin:\s*0\s*!important[\s\S]*padding:\s*0\s*!important/,
    )
    expect(adventureWxss).toMatch(/\.candidate-row\s*\{[\s\S]*min-height:\s*88rpx/)
    expect(adventureWxss).toContain('overflow-wrap: anywhere')
    expect(adventureWxss).not.toMatch(/\.candidate-row--disabled\s*\{[\s\S]*opacity\s*:/)
    expect(adventureWxml).not.toContain('candidate-row--disabled')
  })

  it('移除追蹤目標內重複的狀態文字', () => {
    expect(adventureWxml).not.toContain('class="tracking-row__state"')
    expect(adventureWxml).not.toContain('技能追蹤 · 不參與計算')
    expect(adventureWxml).not.toContain('hint="Lv.0 僅供查看，不參與計算"')
  })

  it('不在冒險士頭像下顯示所在船名', () => {
    expect(adventureWxml).not.toContain('class="officer-card__ship"')
  })

  it('uses real buttons for target deletion and standard target actions', () => {
    expect(
      adventureWxml.match(
        /<button class="ui-button ui-button--secondary target-row__remove"[^>]*catchtap="onRemoveTarget"/g,
      ),
    ).toHaveLength(2)
    expect(adventureWxml).toContain('class="ui-button ui-button--secondary"')
    expect(adventureWxml).toContain('class="ui-button ui-button--primary"')
  })
})
