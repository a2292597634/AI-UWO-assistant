import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listMine = vi.hoisted(() => vi.fn())
const navigateTo = vi.hoisted(() => vi.fn())
vi.mock('../../miniprogram/runtime/officer-maintenance-service', async (original) => ({
  ...(await original<object>()),
  getOfficerMaintenanceService: () => ({ listMine }),
}))
vi.mock('../../miniprogram/runtime/main-data-store', () => ({
  getCatalog: () => [{ id: 'officer-1', name: '測試航海士', searchAliases: ['測試'] }],
}))
interface TestPage {
  data: {
    loading: boolean
    loadError: string
    rows: { statusLabel: string; rejectionReason?: string }[]
    officerOptions: { id: string; name: string; meta: string; searchableText: string }[]
    selectedOfficerIds: string[]
    selectedOfficerId: string
  }
  setData(update: Record<string, unknown>): void
  onLoad(): void
  loadWorkOrders(): Promise<void>
  onOfficerSelect(event: unknown): void
  onOfficerRemove(event: unknown): void
  onModifyOfficer(): void
}
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})
afterEach(() => vi.unstubAllGlobals())
describe('我的維護工單', () => {
  it('提供新增、草稿續編、駁回原因與錯誤重試入口', () => {
    const wxml = readFileSync(
      resolve(__dirname, '../../miniprogram/subpkg-maintenance/pages/work-orders/index.wxml'),
      'utf8',
    )
    expect(wxml).toContain('onNewWorkOrder')
    expect(wxml).toContain('onRetry')
    expect(wxml).toContain('item.statusLabel')
    expect(wxml).toContain('item.rejectionReason')
  })
  it('提供搜尋正式航海士並進入修改工單的入口', () => {
    const wxml = readFileSync(
      resolve(__dirname, '../../miniprogram/subpkg-maintenance/pages/work-orders/index.wxml'),
      'utf8',
    )
    expect(wxml).toContain('entity-search-picker')
    expect(wxml).toContain('onModifyOfficer')
    expect(wxml).toContain('selectedOfficerIds')
  })
  it('選取正式航海士後導向修改編輯器並保留正式 ID', async () => {
    let page: TestPage | undefined
    vi.stubGlobal('wx', { setNavigationBarTitle: vi.fn(), navigateTo })
    vi.stubGlobal('Page', (definition: TestPage) => {
      page = {
        ...definition,
        data: structuredClone(definition.data),
        setData(update) {
          Object.assign(this.data, update)
        },
      }
    })
    await import('../../miniprogram/subpkg-maintenance/pages/work-orders/index')
    page!.onLoad()
    page!.onOfficerSelect({ detail: { id: 'officer-1' } })
    expect(page!.data.selectedOfficerIds).toEqual(['officer-1'])
    expect(page!.data.officerOptions[0]).toMatchObject({
      id: 'officer-1',
      name: '測試航海士',
      meta: 'officer-1',
    })
    page!.onModifyOfficer()
    expect(navigateTo).toHaveBeenCalledWith({
      url: '/subpkg-maintenance/pages/work-order-editor/index?targetOfficerId=officer-1',
    })
  })
  it('將服務端狀態轉為繁體中文，失敗時呈現可重試錯誤', async () => {
    let page: TestPage | undefined
    vi.stubGlobal('Page', (definition: TestPage) => {
      page = {
        ...definition,
        data: structuredClone(definition.data),
        setData(update) {
          Object.assign(this.data, update)
        },
      }
    })
    listMine.mockResolvedValue([
      {
        workOrderId: 'wo',
        status: 'pendingReview',
        proposedData: { name: '航海士' },
        operation: 'createOfficer',
        history: [
          { action: 'submitted', reason: null },
          { action: 'rejected', reason: '請補上來源截圖' },
        ],
      },
    ])
    await import('../../miniprogram/subpkg-maintenance/pages/work-orders/index')
    await page!.loadWorkOrders()
    expect(page!.data.rows[0]?.statusLabel).toBe('待審核')
    listMine.mockResolvedValue([
      {
        workOrderId: 'rejected',
        status: 'rejected',
        proposedData: { name: '待補正航海士' },
        operation: 'createOfficer',
        history: [
          { action: 'rejected', reason: '請補上來源截圖' },
          { action: 'rejected', reason: '請確認技能等級' },
        ],
      },
    ])
    await page!.loadWorkOrders()
    expect(page!.data.rows[0]?.rejectionReason).toBe('請確認技能等級')
    listMine.mockRejectedValue(new Error('失敗'))
    await page!.loadWorkOrders()
    expect(page!.data.loading).toBe(false)
    expect(page!.data.loadError).toContain('重試')
  })
})
