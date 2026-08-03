import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

interface FleetTestData {
  shipTabs: unknown[]
  mode: string
  currentShip: { slots: unknown[] }
  targets: unknown[]
  fleetOverview: unknown[]
  [key: string]: unknown
}

interface FleetPageConfig {
  data: FleetTestData
  onLoad(): void
  onModeTap(event: WechatMiniprogram.BaseEvent): void
  onSkillTap(event: WechatMiniprogram.BaseEvent): void
  onAddTarget(): void
  onTargetLevelBlur(event: WechatMiniprogram.Input): void
  onRemoveTarget(event: WechatMiniprogram.BaseEvent): void
  onRecalculate(): void
}

interface FleetPageInstance extends FleetPageConfig {
  data: FleetTestData
  setData(update: Record<string, unknown>): void
}

let fleetPage: FleetPageConfig

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
  vi.stubGlobal('wx', {
    showToast: vi.fn(),
    showModal: vi.fn(),
    setNavigationBarTitle: vi.fn(),
  })

  await import('../../miniprogram/pages/fleet/index')
})

describe('battle fleet page', () => {
  it('registers with seven ship tabs, eleven slots, and manual mode', () => {
    const page = createPageInstance()
    page.onLoad()

    expect(page.data.shipTabs).toHaveLength(7)
    expect(page.data.mode).toBe('manual')
    expect(page.data.currentShip.slots).toHaveLength(11)
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

  it('adds a filtered skill to the first target only after a double tap in auto mode', () => {
    const page = createPageInstance()
    page.onLoad()
    page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)

    page.onSkillTap({ currentTarget: { dataset: { id: 'skill-cannon' } }, timeStamp: 100 } as never)
    expect((page.data.targets[0] as { skillId: string | null }).skillId).toBeNull()

    page.onSkillTap({ currentTarget: { dataset: { id: 'skill-cannon' } }, timeStamp: 250 } as never)
    expect(page.data.targets[0]).toMatchObject({ skillId: 'skill-cannon', targetLevel: 1 })
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
})
