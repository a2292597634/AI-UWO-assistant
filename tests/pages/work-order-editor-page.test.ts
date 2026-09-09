import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => {
  const data = {
    name: '測試航海士',
    rarityId: 's',
    visualGradeId: 'grade_5',
    typeId: 'adventure',
    genderId: 'male',
    jobId: 'job',
    nationalityId: 'nation',
    languages: [],
    skills: [],
    recruitment: { cityIds: [], requirementId: null, requiredOfficerIds: [], note: null },
    portraitId: 'portrait',
    displayOrder: 42,
  }
  return { data, saveDraft: vi.fn(), submit: vi.fn(), loadMine: vi.fn() }
})
vi.mock('../../miniprogram/runtime/main-data-store', () => ({
  getMaintenanceDictionaries: async () => ({
    rarities: [{ id: 's', name: 'S' }],
    types: [{ id: 'adventure', name: '冒險' }],
    genders: [{ id: 'male', name: '男' }],
    jobs: [{ id: 'job', name: '航海師' }],
    nationalities: [{ id: 'nation', name: '葡萄牙' }],
    languages: [{ id: 'lang', name: '葡萄牙語' }],
    skillCategories: [{ id: 'category', name: '戰鬥' }],
    cities: [],
    requirements: [],
  }),
  getSkills: () => ({
    skill: { id: 'skill', n: '砲擊', cat: 'category', cn: '戰鬥', d: '說明', li: '', ip: '' },
    skill2: { id: 'skill2', n: '砲擊二', cat: 'category', cn: '戰鬥', d: '說明', li: '', ip: '' },
  }),
  getCatalog: () => [{ id: 'officer-1', name: '測試航海士' }],
  getMaintenanceOfficer: (id: string) =>
    id === 'officer-1' ? { dataVersion: 'v1', data: fixtures.data } : null,
}))
vi.mock('../../miniprogram/runtime/officer-maintenance-service', async (original) => ({
  ...(await original<object>()),
  getOfficerMaintenanceService: () => fixtures,
}))

interface TestPage {
  data: Record<string, unknown>
  setData(update: Record<string, unknown>): void
  onLoad(query?: Record<string, string>): Promise<void>
  onFieldInput(event: unknown): void
  onEntitySelect(event: unknown): void
  onRelationInput(event: unknown): void
  onCreateCandidate(event: unknown): void
  onCandidateCategoryChange(event: unknown): void
  onCandidateCategoryRemove(event: unknown): void
  onCandidateInput(event: unknown): void
  onSaveDraft(): Promise<void>
  onSubmit(): Promise<void>
}
let page: TestPage
const root = resolve(__dirname, '../../miniprogram/subpkg-maintenance/pages/work-order-editor')
const event = (dataset: Record<string, unknown>, detail: Record<string, unknown>) => ({
  currentTarget: { dataset },
  detail,
})

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubGlobal('wx', { setNavigationBarTitle: vi.fn(), navigateTo: vi.fn(), showToast: vi.fn() })
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

describe('維護工單編輯器', () => {
  it('提供修改提示、實體搜尋、送審操作與安全區', () => {
    const wxml = readFileSync(resolve(root, 'index.wxml'), 'utf8')
    expect(wxml).toContain('正在修改')
    expect(wxml).toContain('<entity-search-picker')
    expect(wxml).toContain('bindtap="onSubmit"')
    expect(readFileSync(resolve(root, 'index.wxss'), 'utf8')).toContain(
      'env(safe-area-inset-bottom)',
    )
  })

  it('修改時鎖定正式 ID 並保存完整且獨立的基準快照', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ targetOfficerId: 'officer-1' })
    page.onFieldInput(event({ field: 'name' }, { value: '新名稱' }))
    page.onFieldInput(event({ field: 'targetOfficerId' }, { value: 'other' }))
    expect(page.data.originalName).toBe('測試航海士')
    expect(page.data.baseDataVersion).toBe('v1')
    fixtures.saveDraft.mockImplementation(async (input) => ({
      ...input,
      workOrderId: 'wo-1',
      status: 'draft',
      revision: 1,
      updatedAt: 'now',
    }))
    await page.onSaveDraft()
    expect(fixtures.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        targetOfficerId: 'officer-1',
        baseDataVersion: 'v1',
        baseSnapshot: expect.objectContaining({
          name: '測試航海士',
          portraitId: 'portrait',
          displayOrder: 42,
        }),
        proposedData: expect.objectContaining({ name: '新名稱' }),
      }),
    )
    expect(fixtures.data.name).toBe('測試航海士')
  })

  it('缺少修改目標時禁止保存，不會降級為新增', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ operation: 'updateOfficer' })
    await page.onSaveDraft()
    expect(page.data.loadError).toBeTruthy()
    expect(fixtures.saveDraft).not.toHaveBeenCalled()
  })

  it('候選技能缺分類時阻止保存，補齊分類與說明後僅以候選項送出', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ targetOfficerId: 'officer-1' })
    page.onCreateCandidate(event({ kind: 'skill' }, { name: '新技能' }))
    await page.onSaveDraft()
    expect(fixtures.saveDraft).not.toHaveBeenCalled()
    expect(page.data.error).toContain('分類')
    page.onCandidateCategoryChange(event({ index: 0 }, { id: 'category' }))
    page.onCandidateInput(event({ index: 0, field: 'description' }, { value: '新技能說明' }))
    fixtures.saveDraft.mockImplementation(async (input) => ({
      ...input,
      workOrderId: 'wo-1',
      status: 'draft',
      revision: 1,
      updatedAt: 'now',
    }))
    await page.onSaveDraft()
    expect(fixtures.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceCandidates: [
          expect.objectContaining({
            kind: 'skill',
            name: '新技能',
            categoryId: 'category',
            description: '新技能說明',
          }),
        ],
        proposedData: expect.objectContaining({
          skills: [expect.objectContaining({ skillId: expect.stringMatching(/^candidate_/) })],
        }),
      }),
    )
  })

  it('新技能候選可暫以候選 key 掛入航海士提案，正式 ID 留待同步產生', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ targetOfficerId: 'officer-1' })
    page.onCreateCandidate(event({ kind: 'skill' }, { name: '待審技能' }))
    page.onCandidateCategoryChange(event({ index: 0 }, { id: 'category' }))
    page.onCandidateInput(event({ index: 0, field: 'description' }, { value: '待審技能說明' }))
    fixtures.saveDraft.mockImplementation(async (input) => ({
      ...input,
      workOrderId: 'wo-candidate',
      status: 'draft',
      revision: 1,
      updatedAt: 'now',
    }))
    await page.onSaveDraft()
    expect(fixtures.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        proposedData: expect.objectContaining({
          skills: [expect.objectContaining({ skillId: expect.stringMatching(/^candidate_/) })],
        }),
      }),
    )
  })

  it('送審失败保留已儲存工單版本、表單及可重試狀態', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ targetOfficerId: 'officer-1' })
    fixtures.saveDraft.mockImplementation(async (input) => ({
      ...input,
      workOrderId: 'wo-1',
      status: 'draft',
      revision: 2,
      updatedAt: 'now',
    }))
    fixtures.submit.mockRejectedValue(new Error('內部例外'))
    await page.onSubmit()
    expect(fixtures.submit).toHaveBeenCalledWith({
      workOrderId: 'wo-1',
      revision: 2,
      updatedAt: 'now',
    })
    expect(page.data.error).toContain('送審失敗')
    expect(page.data.submitting).toBe(false)
    expect(page.data.saving).toBe(false)
  })

  it('新增表單選用正式實體後不帶修改基準，技能與語言保留正式 ID', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad()
    page.onEntitySelect(event({ kind: 'language' }, { id: 'lang' }))
    page.onEntitySelect(event({ kind: 'skill' }, { id: 'skill' }))
    page.onEntitySelect(event({ kind: 'skill' }, { id: 'unknown' }))
    expect(page.data.form).toMatchObject({
      languages: [{ languageId: 'lang', level: 1 }],
      skills: [{ skillId: 'skill', sourceGroup: 'sk0', kind: 'passive', slot: 0 }],
    })
    expect(page.data.targetOfficerId).toBe('')
    expect(page.data.modifying).toBe(false)
  })

  it('工單續編沿用原始基準，已送審工單禁止改寫與重送', async () => {
    fixtures.loadMine.mockResolvedValue({
      operation: 'updateOfficer',
      targetOfficerId: 'officer-1',
      baseDataVersion: 'old-v',
      baseSnapshot: fixtures.data,
      proposedData: { ...fixtures.data, name: '已提交名稱' },
      referenceCandidates: [],
      workOrderId: 'wo-1',
      status: 'pendingReview',
      revision: 3,
      updatedAt: 'now',
    })
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ workOrderId: 'wo-1' })
    page.onFieldInput(event({ field: 'name' }, { value: '禁止修改' }))
    await page.onSubmit()
    expect(page.data.readonly).toBe(true)
    expect(page.data.form).toMatchObject({ name: '已提交名稱' })
    expect(page.data.originalName).toBe('測試航海士')
    expect(page.data.baseDataVersion).toBe('old-v')
    expect(fixtures.saveDraft).not.toHaveBeenCalled()
  })

  it('已駁回工單載入最近駁回原因，讓提交者補正後重提', async () => {
    fixtures.loadMine.mockResolvedValue({
      operation: 'updateOfficer',
      targetOfficerId: 'officer-1',
      baseDataVersion: 'old-v',
      baseSnapshot: fixtures.data,
      proposedData: fixtures.data,
      reviewedData: null,
      referenceCandidates: [],
      workOrderId: 'wo-rejected',
      status: 'rejected',
      revision: 3,
      updatedAt: 'now',
      history: [
        { action: 'rejected', reason: '缺少來源截圖' },
        { action: 'rejected', reason: '請補充技能證據' },
      ],
    })
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ workOrderId: 'wo-rejected' })
    expect(page.data.readonly).toBe(false)
    expect(page.data.rejectionReason).toBe('請補充技能證據')
    expect(readFileSync(resolve(root, 'index.wxml'), 'utf8')).toContain('rejectionReason')
  })

  it('儲存途中禁止重複送出與修改輸入', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ targetOfficerId: 'officer-1' })
    let finish: (value: unknown) => void = () => undefined
    fixtures.saveDraft.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              ...input,
              workOrderId: 'wo-1',
              status: 'draft',
              revision: 1,
              updatedAt: 'now',
            })
        }),
    )
    const pending = page.onSaveDraft()
    expect(page.data.saving).toBe(true)
    page.onFieldInput(event({ field: 'name' }, { value: '不應套用' }))
    await page.onSubmit()
    finish(undefined)
    await pending
    expect(fixtures.saveDraft).toHaveBeenCalledTimes(1)
    expect(fixtures.submit).not.toHaveBeenCalled()
    expect(page.data.form).toMatchObject({ name: '測試航海士' })
  })

  it('候選名稱可修正且保留說明，重複名稱立即提示並阻止送審', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ targetOfficerId: 'officer-1' })
    page.onCreateCandidate(event({ kind: 'job' }, { name: '職業甲' }))
    page.onCreateCandidate(event({ kind: 'job' }, { name: '職業乙' }))
    page.onCandidateInput(event({ index: 1, field: 'description' }, { value: '保留說明' }))
    page.onCandidateInput(event({ index: 1, field: 'name' }, { value: '職業甲' }))
    expect(page.data.candidates).toEqual([
      expect.objectContaining({ name: '職業甲' }),
      expect.objectContaining({ name: '職業甲', description: '保留說明' }),
    ])
    expect(page.data.error).toContain('重複')
    await page.onSubmit()
    expect(fixtures.saveDraft).not.toHaveBeenCalled()
    page.onCandidateInput(event({ index: 1, field: 'name' }, { value: '修正職業' }))
    expect(page.data.error).toBe('')
  })

  it('技能分類使用含名稱與 ID 的既有搜尋選項並拒絕未知分類', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ targetOfficerId: 'officer-1' })
    page.onCreateCandidate(event({ kind: 'skill' }, { name: '技能甲' }))
    expect(page.data.options).toMatchObject({
      skillCategory: [
        expect.objectContaining({ id: 'category', name: '戰鬥', searchableText: '戰鬥 category' }),
      ],
    })
    page.onCandidateCategoryChange(event({ index: 0 }, { id: 'unknown' }))
    expect(page.data.candidates).toEqual([expect.not.objectContaining({ categoryId: 'unknown' })])
    page.onCandidateCategoryChange(event({ index: 0 }, { id: 'category' }))
    expect(page.data.candidates).toEqual([
      expect.objectContaining({ categoryId: 'category', selectedCategoryIds: ['category'] }),
    ])
    page.onCandidateCategoryRemove(event({ index: 0 }, { id: 'category' }))
    expect(page.data.candidates).toEqual([expect.objectContaining({ selectedCategoryIds: [] })])
    await page.onSaveDraft()
    expect(page.data.error).toContain('分類')
    expect(fixtures.saveDraft).not.toHaveBeenCalled()
  })

  it.each(['-1', '1.5'])('顯示排序 %s 在呼叫保存前被拒絕', async (value) => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ targetOfficerId: 'officer-1' })
    page.onFieldInput(event({ field: 'displayOrder' }, { value }))
    await page.onSubmit()
    expect(page.data.error).toContain('顯示排序')
    expect(fixtures.saveDraft).not.toHaveBeenCalled()
  })

  it('同來源組重複槽位在呼叫保存前被拒絕', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ targetOfficerId: 'officer-1' })
    page.onEntitySelect(event({ kind: 'skill' }, { id: 'skill' }))
    page.onEntitySelect(event({ kind: 'skill' }, { id: 'skill2' }))
    page.onRelationInput(event({ kind: 'skill', id: 'skill2', field: 'slot' }, { value: '0' }))
    await page.onSubmit()
    expect(page.data.error).toContain('槽位')
    expect(fixtures.saveDraft).not.toHaveBeenCalled()
  })

  it('候選別名與同類名稱衝突時立即提示並阻止保存', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ targetOfficerId: 'officer-1' })
    page.onCreateCandidate(event({ kind: 'job' }, { name: '職業甲' }))
    page.onCreateCandidate(event({ kind: 'job' }, { name: '職業乙' }))
    page.onCandidateInput(event({ index: 0, field: 'aliases' }, { value: '職業乙' }))
    expect(page.data.error).toContain('衝突')
    await page.onSaveDraft()
    expect(fixtures.saveDraft).not.toHaveBeenCalled()
  })
})
