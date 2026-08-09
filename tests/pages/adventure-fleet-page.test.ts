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
  [key: string]: unknown
}

interface AdventurePageConfig {
  data: AdventurePageData
  onLoad(): void
  onSkillSelect(event: WechatMiniprogram.BaseEvent): void
  onAddTarget(): void
  onTargetPickerClose(): void
  onRecalculate(): void
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
})

const adventureWxml = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/pages/adventure-fleet/index.wxml'),
  'utf8',
)
const adventureWxss = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/pages/adventure-fleet/index.wxss'),
  'utf8',
)

describe('adventure fleet page layout hooks', () => {
  it('loads the changed page files for structural assertions', () => {
    expect(adventureWxml.length).toBeGreaterThan(0)
    expect(adventureWxss.length).toBeGreaterThan(0)
  })

  it('renders the target picker and protects recalculation when no optimization target exists', () => {
    expect(adventureWxml).toContain('showTargetPicker')
    expect(adventureWxml).toContain('onTargetPickerClose')
    expect(adventureWxml).toContain('disabled="{{!canRecalculate}}"')
    expect(adventureWxml).toContain('請先設定至少一個 Lv.1 以上的優化目標')
    expect(adventureWxss).toMatch(/env\(safe-area-inset-bottom\)/)
  })
})
