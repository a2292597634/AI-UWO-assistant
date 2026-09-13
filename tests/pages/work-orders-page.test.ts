import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listMine = vi.hoisted(() => vi.fn())
const listAdmin = vi.hoisted(() => vi.fn())
const appendSupplement = vi.hoisted(() => vi.fn())
const uploadScreenshots = vi.hoisted(() => vi.fn())
const navigateTo = vi.hoisted(() => vi.fn())

vi.mock('../../miniprogram/runtime/officer-error-report-service', async (original) => ({
  ...(await original<object>()),
  getOfficerErrorReportService: () => ({
    listMine,
    listAdmin,
    appendSupplement,
    uploadScreenshots,
  }),
}))
vi.mock('../../miniprogram/runtime/main-data-store', () => ({
  getCatalog: () => [{ id: 'officer_1', name: '測試航海士' }],
}))

interface TestPage {
  data: {
    loading: boolean
    loadError: string
    rows: Array<{
      reportId: string
      status: string
      statusLabel: string
      officerName: string
      reviewReply: string
      canSupplement: boolean
    }>
    supplementReportId: string
    supplementText: string
    supplementSourceUrl: string
    supplementTempPaths: string[]
    submittingSupplement: boolean
    adminReviewVisible: boolean
  }
  setData(update: Record<string, unknown>): void
  loadReports(): Promise<void>
  checkAdminPermission(): Promise<void>
  onOpenSupplement(event: WechatMiniprogram.BaseEvent): void
  onSupplementInput(event: WechatMiniprogram.Input): void
  onSubmitSupplement(): Promise<void>
  onAdminReview(): void
}

const report = (status: string, overrides: Record<string, unknown> = {}) => ({
  reportId: `report_${status}`,
  officerId: 'officer_1',
  errorTypes: ['skill'],
  description: '技能資料有誤',
  suggestedCorrection: '應改為正確技能',
  sourceUrl: '',
  screenshotFileIds: [],
  supplement: '',
  status,
  reviewReply: null,
  fixedDatasetVersion: null,
  supplements: [],
  history: [],
  revision: 1,
  createdAt: '2026-09-13T01:00:00.000Z',
  updatedAt: '2026-09-13T02:00:00.000Z',
  ...overrides,
})

const loadPage = async (): Promise<TestPage> => {
  let page: TestPage | undefined
  vi.stubGlobal('wx', {
    setNavigationBarTitle: vi.fn(),
    navigateTo,
    showToast: vi.fn(),
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
  })
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
  return page!
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})
afterEach(() => vi.unstubAllGlobals())

describe('我的錯誤回報', () => {
  it('顯示五種文字狀態、管理員回覆、空列表與重試入口', () => {
    const wxml = readFileSync(
      resolve(__dirname, '../../miniprogram/subpkg-maintenance/pages/work-orders/index.wxml'),
      'utf8',
    )
    expect(wxml).toContain('我的回報')
    expect(wxml).toContain('待確認')
    expect(wxml).toContain('需要補充')
    expect(wxml).toContain('已採納')
    expect(wxml).toContain('已修正')
    expect(wxml).toContain('不採納')
    expect(wxml).toContain('管理員回覆')
    expect(wxml).toContain('目前尚無錯誤回報')
    expect(wxml).toContain('onRetry')
  })

  it('載入目前帳號的回報並把航海士 ID 轉為名稱', async () => {
    listMine.mockResolvedValue([
      report('pending'),
      report('needsInfo', { reviewReply: '請提供技能畫面' }),
      report('accepted'),
      report('fixed'),
      report('rejected'),
    ])
    const page = await loadPage()
    await page.loadReports()
    expect(listMine).toHaveBeenCalledOnce()
    expect(page.data.rows.map(({ statusLabel }) => statusLabel)).toEqual([
      '待確認',
      '需要補充',
      '已採納',
      '已修正',
      '不採納',
    ])
    expect(page.data.rows[0]?.officerName).toBe('測試航海士')
    expect(page.data.rows[1]).toMatchObject({ reviewReply: '請提供技能畫面', canSupplement: true })
    expect(page.data.rows[3]?.canSupplement).toBe(false)
  })

  it('載入失敗時保留可重試錯誤', async () => {
    listMine.mockRejectedValue(new Error('失敗'))
    const page = await loadPage()
    await page.loadReports()
    expect(page.data.loading).toBe(false)
    expect(page.data.loadError).toContain('重試')
  })

  it('只有 needsInfo 能追加內容，成功後以服務端記錄替換並回到待確認', async () => {
    listMine.mockResolvedValue([report('needsInfo')])
    uploadScreenshots.mockResolvedValue([])
    appendSupplement.mockResolvedValue(
      report('pending', { reportId: 'report_needsInfo', revision: 2 }),
    )
    const page = await loadPage()
    await page.loadReports()
    page.onOpenSupplement({ currentTarget: { dataset: { id: 'report_needsInfo' } } } as never)
    page.onSupplementInput({ detail: { value: '補充技能截圖說明' } } as never)
    await page.onSubmitSupplement()
    expect(appendSupplement).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: 'report_needsInfo',
        revision: 1,
        text: '補充技能截圖說明',
      }),
    )
    expect(page.data.rows[0]).toMatchObject({ status: 'pending', statusLabel: '待確認' })
    expect(page.data.supplementReportId).toBe('')
  })

  it('管理員權限探測只控制審核入口', async () => {
    listAdmin.mockResolvedValue([report('pending')])
    const page = await loadPage()
    await page.checkAdminPermission()
    expect(listAdmin).toHaveBeenCalledWith('pending')
    expect(page.data.adminReviewVisible).toBe(true)
    page.onAdminReview()
    expect(navigateTo).toHaveBeenCalledWith({
      url: '/subpkg-maintenance/pages/work-order-review/index',
    })
  })
})
