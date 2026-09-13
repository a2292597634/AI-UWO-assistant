import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const service = vi.hoisted(() => ({
  listAdmin: vi.fn(),
  requestInfo: vi.fn(),
  accept: vi.fn(),
  reject: vi.fn(),
  markFixed: vi.fn(),
}))
vi.mock('../../miniprogram/runtime/officer-error-report-service', async (original) => ({
  ...(await original<object>()),
  getOfficerErrorReportService: () => service,
}))
vi.mock('../../miniprogram/runtime/main-data-store', () => ({
  getCatalog: () => [{ id: 'officer_1', name: '測試航海士' }],
}))

interface TestPage {
  data: {
    reports: Array<{ reportId: string; status: string; statusLabel: string }>
    selectedReportId: string
    reviewReply: string
    datasetVersion: string
    loading: boolean
    actionLoading: boolean
    loadError: string
  }
  setData(update: Record<string, unknown>): void
  loadReports(): Promise<void>
  onSelectReport(event: WechatMiniprogram.BaseEvent): void
  onReviewReplyInput(event: WechatMiniprogram.Input): void
  onDatasetVersionInput(event: WechatMiniprogram.Input): void
  onRequestInfo(): Promise<void>
  onAccept(): Promise<void>
  onReject(): Promise<void>
  onMarkFixed(): Promise<void>
}

const report = (status = 'pending') => ({
  reportId: 'report_1',
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
  createdAt: 'created',
  updatedAt: 't1',
})

const loadPage = async (): Promise<TestPage> => {
  let page: TestPage | undefined
  vi.stubGlobal('wx', {
    setNavigationBarTitle: vi.fn(),
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
  await import('../../miniprogram/subpkg-maintenance/pages/work-order-review/index')
  return page!
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  service.listAdmin.mockResolvedValue([report()])
})
afterEach(() => vi.unstubAllGlobals())

describe('管理員錯誤回報審核', () => {
  it('顯示各狀態篩選、原始回報與只處理不直接修改資料的提示', () => {
    const wxml = readFileSync(
      resolve(__dirname, '../../miniprogram/subpkg-maintenance/pages/work-order-review/index.wxml'),
      'utf8',
    )
    const ts = readFileSync(
      resolve(__dirname, '../../miniprogram/subpkg-maintenance/pages/work-order-review/index.ts'),
      'utf8',
    )
    expect(ts).toContain("pending: '待確認'")
    expect(ts).toContain("needsInfo: '需要補充'")
    expect(ts).toContain("accepted: '已採納'")
    expect(ts).toContain("fixed: '已修正'")
    expect(ts).toContain("rejected: '不採納'")
    expect(wxml).toContain('不會直接修改正式名鑑資料')
    expect(wxml).toContain('錯誤說明')
    expect(wxml).toContain('建議的正確內容')
  })

  it('預設載入待確認並按服務端順序顯示', async () => {
    const page = await loadPage()
    await page.loadReports()
    expect(service.listAdmin).toHaveBeenCalledWith('pending')
    expect(page.data.reports[0]).toMatchObject({
      reportId: 'report_1',
      statusLabel: '待確認',
    })
  })

  it('要求補充與不採納都必填理由', async () => {
    const page = await loadPage()
    await page.loadReports()
    page.onSelectReport({ currentTarget: { dataset: { id: 'report_1' } } } as never)
    await page.onRequestInfo()
    await page.onReject()
    expect(service.requestInfo).not.toHaveBeenCalled()
    expect(service.reject).not.toHaveBeenCalled()
    page.onReviewReplyInput({ detail: { value: '請補上來源畫面' } } as never)
    service.requestInfo.mockResolvedValue(report('needsInfo'))
    await page.onRequestInfo()
    expect(service.requestInfo).toHaveBeenCalledWith(
      expect.objectContaining({ reply: '請補上來源畫面', revision: 1, updatedAt: 't1' }),
    )
  })

  it('已修正必填資料版本，操作期間禁止重複提交', async () => {
    const page = await loadPage()
    await page.loadReports()
    page.onSelectReport({ currentTarget: { dataset: { id: 'report_1' } } } as never)
    await page.onMarkFixed()
    expect(service.markFixed).not.toHaveBeenCalled()
    page.onDatasetVersionInput({ detail: { value: '2026-09-13' } } as never)
    let resolveAction: ((value: unknown) => void) | undefined
    service.markFixed.mockReturnValue(new Promise((resolve) => (resolveAction = resolve)))
    const action = page.onMarkFixed()
    const duplicate = page.onMarkFixed()
    expect(service.markFixed).toHaveBeenCalledOnce()
    resolveAction?.(report('fixed'))
    await Promise.all([action, duplicate])
  })

  it('版本衝突時重新載入当前狀態', async () => {
    const { OfficerErrorReportError } =
      await import('../../miniprogram/runtime/officer-error-report-service')
    const page = await loadPage()
    await page.loadReports()
    page.onSelectReport({ currentTarget: { dataset: { id: 'report_1' } } } as never)
    page.onReviewReplyInput({ detail: { value: '確認採納' } } as never)
    service.accept.mockRejectedValue(new OfficerErrorReportError('conflict', '回報已更新'))
    await page.onAccept()
    expect(service.listAdmin).toHaveBeenCalledTimes(2)
    expect(page.data.actionLoading).toBe(false)
  })
})
