import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { MaintenanceOfficerData } from '../../miniprogram/contracts/officer-maintenance'

const fixtures = vi.hoisted(() => {
  const data = {
    name: '原名',
    rarityId: 's',
    visualGradeId: 'grade_5',
    typeId: 'adventure',
    genderId: 'male',
    jobId: 'job',
    nationalityId: 'nation',
    languages: [],
    skills: [],
    recruitment: { cityIds: [], requirementId: null, requiredOfficerIds: [], note: null },
    portraitId: null,
    displayOrder: 1,
  }
  return {
    data,
    listAdmin: vi.fn(),
    saveReview: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    showModal: vi.fn(),
  }
})
vi.mock('../../miniprogram/runtime/main-data-store', () => ({
  getMaintenanceDictionaries: async () => ({
    rarities: [{ id: 's', name: 'S' }],
    types: [{ id: 'adventure', name: '冒險' }],
    genders: [{ id: 'male', name: '男' }],
    jobs: [
      { id: 'job', name: '航海師' },
      { id: 'job_b', name: '船長' },
    ],
    nationalities: [{ id: 'nation', name: '葡萄牙' }],
    languages: [],
    skillCategories: [],
    cities: [],
    requirements: [],
  }),
  getSkills: () => ({}),
  getCatalog: () => [{ id: 'officer', name: '原名' }],
  getMaintenanceOfficer: async () => ({ dataVersion: 'v1', data: fixtures.data }),
}))
vi.mock('../../miniprogram/runtime/officer-maintenance-service', async (original) => ({
  ...(await original<object>()),
  getOfficerMaintenanceService: () => fixtures,
}))
interface TestPage {
  data: {
    form: MaintenanceOfficerData
    error: string
    loadError: string
    notice: string
    readonly: boolean
    saving: boolean
    reviewDiff: unknown[]
    candidates: unknown[]
    portraitFileId: string
  }
  setData(update: Record<string, unknown>): void
  onLoad(query?: Record<string, string>): Promise<void>
  onFieldInput(event: unknown): void
  onPortraitTap(): void
  onCandidateMerge(event: unknown): void
  onRejectReasonInput(event: unknown): void
  onSaveReview(): Promise<void>
  onApprove(): Promise<void>
  onReject(): Promise<void>
}
let page: TestPage
const record = () => ({
  workOrderId: 'wo',
  operation: 'updateOfficer',
  targetOfficerId: 'officer',
  baseDataVersion: 'v1',
  baseSnapshot: fixtures.data,
  proposedData: { ...fixtures.data, name: '投稿名' },
  reviewedData: { ...fixtures.data, name: '已修訂名' },
  referenceCandidates: [{ key: 'c', kind: 'job', name: '船長別名', aliases: [] }],
  status: 'pendingReview',
  revision: 2,
  createdAt: 'created',
  updatedAt: 't2',
})
const event = (dataset: Record<string, unknown>, detail: Record<string, unknown>) => ({
  currentTarget: { dataset },
  detail,
})
beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  fixtures.listAdmin.mockResolvedValue([record()])
  fixtures.saveReview.mockImplementation(async (input) => ({
    ...record(),
    ...input,
    revision: 3,
    updatedAt: 't3',
  }))
  fixtures.approve.mockResolvedValue({
    ...record(),
    status: 'approvedPendingPublish',
    revision: 4,
    updatedAt: 't4',
  })
  fixtures.reject.mockResolvedValue({
    ...record(),
    status: 'rejected',
    revision: 3,
    updatedAt: 't3',
  })
  fixtures.showModal.mockImplementation(async () => ({ confirm: true }))
  vi.stubGlobal('wx', {
    setNavigationBarTitle: vi.fn(),
    navigateTo: vi.fn(),
    showModal: fixtures.showModal,
    chooseImage: vi.fn(),
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
})
afterEach(() => vi.unstubAllGlobals())
async function load() {
  await import('../../miniprogram/subpkg-maintenance/pages/work-order-review/index')
  await page.onLoad({ workOrderId: 'wo' })
}
describe('管理員審核頁', () => {
  it('載入 reviewedData 並將修正及候選合併保存，保留提案', async () => {
    await load()
    expect(page.data.form.name).toBe('已修訂名')
    page.onFieldInput(event({ field: 'name' }, { value: '最終名' }))
    page.onCandidateMerge(event({ key: 'c' }, { id: 'job_b' }))
    page.setData({ reviewReason: '合併重複職業候選並修正名稱' })
    await page.onSaveReview()
    expect(fixtures.saveReview).toHaveBeenCalledWith(
      expect.objectContaining({
        workOrderId: 'wo',
        revision: 2,
        updatedAt: 't2',
        reviewedData: expect.objectContaining({ name: '最終名', jobId: 'job_b' }),
        referenceCandidates: [],
        reason: '合併重複職業候選並修正名稱',
      }),
    )
    expect(fixtures.data.name).toBe('原名')
    expect(page.data.candidates).toEqual([])
  })
  it('拒絕不存在的合併 ID', async () => {
    await load()
    page.onCandidateMerge(event({ key: 'c' }, { id: 'missing' }))
    expect(page.data.form.jobId).toBe('job')
    expect(page.data.candidates).toHaveLength(1)
  })
  it('核准前保存最新修正，以最新版本確認差異再核准', async () => {
    await load()
    page.onFieldInput(event({ field: 'name' }, { value: '最終名' }))
    page.setData({ reviewReason: '確認修訂內容正確' })
    await page.onApprove()
    expect(fixtures.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('最終名') }),
    )
    expect(fixtures.approve).toHaveBeenCalledWith({
      workOrderId: 'wo',
      revision: 3,
      updatedAt: 't3',
    })
    expect(page.data.readonly).toBe(true)
    expect(page.data.notice).toContain('待發布')
  })
  it('取消確認不核准，表單保留', async () => {
    await load()
    fixtures.showModal.mockResolvedValue({ confirm: false })
    page.setData({ reviewReason: '確認無誤，準備核准' })
    await page.onApprove()
    expect(fixtures.approve).not.toHaveBeenCalled()
    expect(page.data.form.name).toBe('已修訂名')
  })
  it('駁回原因必填並以當前版本送出', async () => {
    await load()
    await page.onReject()
    expect(fixtures.reject).not.toHaveBeenCalled()
    expect(page.data.error).toContain('原因')
    page.onRejectReasonInput(event({}, { value: '  資料不符  ' }))
    await page.onReject()
    expect(fixtures.reject).toHaveBeenCalledWith({
      workOrderId: 'wo',
      revision: 2,
      updatedAt: 't2',
      reason: '資料不符',
    })
    expect(page.data.readonly).toBe(true)
  })
  it('保存版本衝突時不核准、不覆寫表單並展示衝突', async () => {
    await load()
    const { OfficerMaintenanceError } =
      await import('../../miniprogram/runtime/officer-maintenance-service')
    fixtures.saveReview.mockRejectedValue(
      new OfficerMaintenanceError('conflict', '工單已被更新，請重新載入'),
    )
    page.setData({ reviewReason: '嘗試保存修訂' })
    await page.onApprove()
    expect(fixtures.approve).not.toHaveBeenCalled()
    expect(page.data.error).toContain('重新載入')
    expect(page.data.form.name).toBe('已修訂名')
    expect(page.data.saving).toBe(false)
  })
  it('無管理員權限時阻止所有操作', async () => {
    fixtures.listAdmin.mockRejectedValue(new Error('forbidden'))
    await load()
    await page.onApprove()
    await page.onReject()
    expect(page.data.loadError).toBeTruthy()
    expect(fixtures.saveReview).not.toHaveBeenCalled()
    expect(fixtures.reject).not.toHaveBeenCalled()
  })

  it('管理員保存修訂必填原因，並提供專用輸入欄位', async () => {
    await load()
    await page.onSaveReview()
    expect(fixtures.saveReview).not.toHaveBeenCalled()
    expect(page.data.error).toContain('修訂原因')

    const wxml = await import('node:fs').then(({ readFileSync }) =>
      readFileSync(
        new URL(
          '../../miniprogram/subpkg-maintenance/pages/work-order-review/index.wxml',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    expect(wxml).toContain('本次修訂原因')
    expect(wxml).toContain('bindinput="onReviewReasonInput"')
  })

  it('審核修改既有航海士時顯示現有頭像唯讀預覽', async () => {
    const portrait = 'asset_portrait_existing'
    fixtures.listAdmin.mockResolvedValue([
      {
        ...record(),
        baseSnapshot: { ...fixtures.data, portraitId: portrait },
        proposedData: { ...fixtures.data, name: '投稿名', portraitId: portrait },
        reviewedData: { ...fixtures.data, name: '已修訂名', portraitId: portrait },
      },
    ])
    await load()

    expect(page.data.portraitFileId).toBe(portrait)
    page.onPortraitTap()
    expect(wx.chooseImage).not.toHaveBeenCalled()
    const wxml = await import('node:fs').then(({ readFileSync }) =>
      readFileSync(
        new URL(
          '../../miniprogram/subpkg-maintenance/pages/work-order-editor/index.wxml',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    expect(wxml).toContain('wx:if="{{!modifying || reviewMode}}"')
    expect(wxml).toContain('管理員審核模式僅供檢視，不能更換頭像')
    expect(wxml).toContain('wx:if="{{!reviewMode}}" bindtap="onPortraitTap"')
  })
})
