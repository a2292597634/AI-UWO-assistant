import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

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
  onOfficerSelect(event: WechatMiniprogram.BaseEvent): void
}

interface AdventurePageInstance extends AdventurePageConfig {
  data: AdventurePageData
  setData(update: Record<string, unknown>): void
}

let adventurePage: AdventurePageConfig
const wxStub = {
  showToast: vi.fn(),
  showModal: vi.fn(),
  setNavigationBarTitle: vi.fn(),
  navigateTo: vi.fn(),
  navigateBack: vi.fn(),
  cloud: {
    callFunction: vi.fn(),
  },
}

const createPageInstance = (): AdventurePageInstance => {
  const instance = Object.create(adventurePage) as AdventurePageInstance
  instance.data = structuredClone(adventurePage.data)
  instance.setData = (update) => Object.assign(instance.data, update)
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

  it('opens target picker without adding a blank target', () => {
    const page = createPageInstance()
    page.onLoad()
    const before = structuredClone(page.data.targets)

    page.onAddTarget()

    expect(page.data.showTargetPicker).toBe(true)
    expect(page.data.targets).toEqual(before)
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
  'mode-tabs',
  'officer-action-sheet',
  'skill-picker-sheet',
  'result-preview-sheet',
  'status-badge',
  'empty-state',
] as const

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

describe('adventure fleet shared component wiring', () => {
  it('registers and renders all seven shared components', () => {
    for (const name of sharedComponentNames) {
      expect(adventureJson.usingComponents?.[name]).toBe(`../../components/${name}/index`)
      expect(adventureWxml).toMatch(new RegExp(`<${name}(?:\\s|/?>)`))
    }
  })

  it('keeps existing handlers for inline and sheet skill pickers and proposal actions', () => {
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
    expect(adventureWxss).toMatch(/\.officer-card\s*\{[\s\S]*padding:\s*8rpx 4rpx;/)
    expect(adventureWxss).not.toMatch(/\.officer-card\s*\{[\s\S]*padding:\s*8rpx 4rpx 68rpx;/)
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
    expect(adventureWxss).toMatch(/\.target-row\s*\{[\s\S]*min-height:\s*88rpx/)
    expect(adventureWxss).toMatch(/\.level-input\s*\{[\s\S]*min-height:\s*88rpx/)
    expect(adventureWxss).toMatch(/\.target-row__remove\s*\{[\s\S]*min-height:\s*88rpx/)
    expect(adventureWxss).toMatch(/\.candidate-row\s*\{[\s\S]*min-height:\s*88rpx/)
    expect(adventureWxss).toContain('overflow-wrap: anywhere')
    expect(adventureWxss).not.toMatch(/\.candidate-row--disabled\s*\{[\s\S]*opacity\s*:/)
    expect(adventureWxml).not.toContain('candidate-row--disabled')
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
