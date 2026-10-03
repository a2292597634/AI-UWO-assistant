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
    activeStatus: string
    reports: Array<{
      reportId: string
      status: string
      statusLabel: string
      evidence: Array<{
        text: string
        sourceUrl: string
        screenshotFileIds: string[]
        isOriginal: boolean
      }>
    }>
    selectedReportId: string
    reviewReply: string
    datasetVersion: string
    loading: boolean
    actionLoading: boolean
    loadError: string
    evidenceImageErrors: Record<string, boolean>
  }
  setData(update: Record<string, unknown>): void
  loadReports(): Promise<void>
  onStatusTap(event: WechatMiniprogram.BaseEvent): void
  onUnload(): void
  onPreviewEvidence(event: WechatMiniprogram.BaseEvent): void
  onEvidenceImageError(event: WechatMiniprogram.BaseEvent): void
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
    previewImage: vi.fn(),
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
  vi.resetAllMocks()
  service.listAdmin.mockResolvedValue([report()])
})
afterEach(() => vi.unstubAllGlobals())

describe('管理員錯誤回報審核', () => {
  it('原始與每次補充的每張圖片可預覽，非目前報告附件遭拒絕', async () => {
    const original = {
      ...report(),
      screenshotFileIds: ['cloud://original'],
      supplement: '原始补充',
      supplements: [
        {
          text: '補充一',
          sourceUrl: '',
          screenshotFileIds: ['cloud://one', 'cloud://two'],
          createdAt: 't2',
        },
        {
          text: '',
          sourceUrl: 'https://example.invalid/link',
          screenshotFileIds: ['cloud://three'],
          createdAt: 't3',
        },
      ],
    }
    const snapshot = structuredClone(original)
    service.listAdmin.mockResolvedValue([original])
    const page = await loadPage()
    await page.loadReports()
    expect(page.data.reports[0]?.evidence).toMatchObject([
      {
        text: '技能資料有誤\n\n原始补充',
        screenshotFileIds: ['cloud://original'],
        isOriginal: true,
      },
      { text: '補充一', screenshotFileIds: ['cloud://one', 'cloud://two'], isOriginal: false },
      {
        text: '',
        sourceUrl: 'https://example.invalid/link',
        screenshotFileIds: ['cloud://three'],
        isOriginal: false,
      },
    ])
    const urls = ['cloud://original', 'cloud://one', 'cloud://two', 'cloud://three']
    for (const fileId of urls) {
      page.onPreviewEvidence({
        currentTarget: { dataset: { reportId: 'report_1', fileId } },
      } as never)
      expect(wx.previewImage).toHaveBeenLastCalledWith(
        expect.objectContaining({ current: fileId, urls }),
      )
    }
    page.onPreviewEvidence({
      currentTarget: { dataset: { reportId: 'report_1', fileId: 'cloud://foreign' } },
    } as never)
    page.onPreviewEvidence({
      currentTarget: { dataset: { reportId: 'foreign', fileId: urls[0] } },
    } as never)
    expect(wx.previewImage).toHaveBeenCalledTimes(4)
    const options = vi.mocked(wx.previewImage).mock.calls[0]?.[0]
    options?.fail?.({ errMsg: '圖片無法開啟' })
    expect(wx.showToast).toHaveBeenCalledWith({ title: '圖片預覽失敗，請稍後再試', icon: 'none' })
    page.onEvidenceImageError({ currentTarget: { dataset: { fileId: urls[0] } } } as never)
    expect(page.data.evidenceImageErrors[urls[0]!]).toBe(true)
    page.onStatusTap({ currentTarget: { dataset: { status: 'fixed' } } } as never)
    page.onPreviewEvidence({
      currentTarget: { dataset: { reportId: 'report_1', fileId: urls[0] } },
    } as never)
    expect(wx.previewImage).toHaveBeenCalledTimes(4)
    expect(original).toEqual(snapshot)
  })
  const deferred = () => {
    let resolve!: (value: ReturnType<typeof report>[]) => void
    let reject!: (reason: Error) => void
    const promise = new Promise<ReturnType<typeof report>[]>((yes, no) => {
      resolve = yes
      reject = no
    })
    return { promise, resolve, reject }
  }
  const selectStatus = (page: TestPage, status: string) =>
    page.onStatusTap({ currentTarget: { dataset: { status } } } as never)

  it.each(['records', 'empty', 'error'])(
    '舊 pending 的 %s 回覆不得覆蓋最新 accepted',
    async (kind) => {
      const page = await loadPage()
      const pending = deferred()
      const accepted = deferred()
      service.listAdmin.mockReturnValueOnce(pending.promise).mockReturnValueOnce(accepted.promise)
      const old = page.loadReports()
      selectStatus(page, 'accepted')
      accepted.resolve([report('accepted')])
      await accepted.promise
      await Promise.resolve()
      if (kind === 'error') pending.reject(new Error('舊錯誤'))
      else pending.resolve(kind === 'empty' ? [] : [report()])
      await old
      expect(page.data.reports.map((item) => item.status)).toEqual(['accepted'])
      expect(page.data.loadError).toBe('')
      expect(page.data.loading).toBe(false)
    },
  )

  it('切換立即清列表與選擇，舊 finally 不清最新 loading，最新錯誤可重試', async () => {
    const page = await loadPage()
    await page.loadReports()
    page.onSelectReport({ currentTarget: { dataset: { id: 'report_1' } } } as never)
    const old = deferred()
    const latest = deferred()
    service.listAdmin.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    const first = page.loadReports()
    selectStatus(page, 'accepted')
    expect(page.data.reports).toEqual([])
    expect(page.data.selectedReportId).toBe('')
    old.resolve([])
    await first
    expect(page.data.loading).toBe(true)
    latest.reject(new Error('最新載入失敗'))
    await latest.promise.catch(() => {})
    await Promise.resolve()
    expect(page.data.loadError).toBe('最新載入失敗')
    service.listAdmin.mockResolvedValueOnce([report('accepted')])
    await page.loadReports()
    expect(page.data.reports[0]?.status).toBe('accepted')
    expect(page.data.loadError).toBe('')
  })

  it('切回同一狀態仍只採用最後請求且卸載後不更新任何資料', async () => {
    const page = await loadPage()
    const first = deferred()
    const second = deferred()
    service.listAdmin.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const request = page.loadReports()
    selectStatus(page, 'pending')
    first.resolve([report()])
    await request
    expect(page.data.reports).toEqual([])
    expect(page.data.loading).toBe(true)
    page.onUnload()
    const snapshot = structuredClone(page.data)
    second.reject(new Error('卸載後錯誤'))
    await second.promise.catch(() => {})
    await Promise.resolve()
    expect(page.data).toEqual(snapshot)
  })
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

  it('需要補充的回報再次要求補充保留完整證據並刷新版本', async () => {
    const previous = {
      ...report('needsInfo'),
      revision: 2,
      supplement: '原始補充',
      supplements: [
        { text: '補充內容', sourceUrl: '', screenshotFileIds: ['cloud://proof'], createdAt: 't1' },
      ],
    }
    service.listAdmin.mockResolvedValue([previous])
    const page = await loadPage()
    page.setData({ activeStatus: 'needsInfo' })
    await page.loadReports()
    page.onSelectReport({ currentTarget: { dataset: { id: 'report_1' } } } as never)
    page.onReviewReplyInput({ detail: { value: '請補完整截圖' } } as never)
    service.requestInfo.mockResolvedValue({
      ...previous,
      reviewReply: '請補完整截圖',
      revision: 3,
      updatedAt: 't2',
    })
    await page.onRequestInfo()
    expect(service.requestInfo).toHaveBeenCalledWith({
      reportId: 'report_1',
      revision: 2,
      updatedAt: 't1',
      reply: '請補完整截圖',
    })
    expect(page.data.reports[0]).toMatchObject({
      status: 'needsInfo',
      revision: 3,
      updatedAt: 't2',
      evidence: [
        { text: '技能資料有誤\n\n原始補充' },
        { text: '補充內容', screenshotFileIds: ['cloud://proof'] },
      ],
    })
    expect(page.data.actionLoading).toBe(false)
    expect(page.data.selectedReportId).toBe('')
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
