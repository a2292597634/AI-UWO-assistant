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
    skillCategories: [
      { id: 'skill_category_naval_active_cannon', name: '海戰主動-砲擊' },
      { id: 'skill_category_naval_passive_cannon', name: '海戰被動-砲擊' },
    ],
    cities: [],
    requirements: [],
  }),
  getSkills: () => ({
    skill: {
      id: 'skill',
      n: '砲擊',
      cat: 'skill_category_naval_active_cannon',
      cn: '海戰主動-砲擊',
      d: '說明',
      li: '',
      ip: '',
    },
    skill2: {
      id: 'skill2',
      n: '砲擊二',
      cat: 'skill_category_naval_active_cannon',
      cn: '海戰主動-砲擊',
      d: '說明',
      li: '',
      ip: '',
    },
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
  data: Record<string, unknown> & {
    candidates: readonly { key: string }[]
    form: { skills: readonly unknown[] }
  }
  setData(update: Record<string, unknown>): void
  onLoad(query?: Record<string, string>): Promise<void>
  onFieldInput(event: unknown): void
  onBasicChange(event: unknown): void
  onEntitySelect(event: unknown): void
  onRelationInput(event: unknown): void
  onSkillTypeChange(event: unknown): void
  onToggleSkill(event: unknown): void
  onCreateCandidate(event: unknown): void
  onCandidateCategoryChange(event: unknown): void
  onCandidateCategoryRemove(event: unknown): void
  onCandidateInput(event: unknown): void
  onCandidateRemove(event: unknown): void
  onPortraitTap(): void
  onPortraitRemove(): void
  onPortraitImageError(): void
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
    expect(wxml).toContain('bindtap="onToggleSkill"')
    expect(wxml).toContain('wx:if="{{item.expanded}}"')
    expect(wxml).not.toContain('data-field="portraitId"')
    expect(wxml).not.toContain('data-field="displayOrder"')
    expect(wxml).not.toContain('{{targetOfficerId}}')
    expect(wxml).not.toContain('{{baseDataVersion}}')
    expect(wxml).toContain('bindtap="onPortraitTap"')
    expect(wxml).toContain('binderror="onPortraitImageError"')
    expect(wxml).toContain('portraitTempPath')
    expect(wxml).toContain('portraitStatusText')
    expect(wxml).toContain('不超過 512 KB')
  })

  it('新增工單提供頭像裁切入口，修改工單不允許更換既有頭像', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad()
    expect(page.data.portraitTempPath).toBe('')
    await page.onLoad({ targetOfficerId: 'officer-1' })
    expect(page.data.portraitTempPath).toBe('')
  })

  it('草稿可先不附頭像，選圖後以 1:1 裁切結果傳送附件', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad()
    page.onFieldInput(event({ field: 'name' }, { value: '含頭像航海士' }))
    for (const field of ['rarityId', 'typeId', 'genderId']) {
      page.onBasicChange(event({ field }, { value: '0' }))
    }
    page.onEntitySelect(event({ kind: 'job' }, { id: 'job' }))
    page.onEntitySelect(event({ kind: 'nationality' }, { id: 'nation' }))
    fixtures.saveDraft.mockImplementation(async (input) => ({
      ...input,
      workOrderId: 'wo-portrait',
      status: 'draft',
      revision: 1,
      updatedAt: 'now',
      portraitFileId: 'cloud://portrait',
    }))
    await page.onSaveDraft()
    expect(fixtures.saveDraft).toHaveBeenCalledTimes(1)
    expect(page.data.error).toBe('')

    const chooseImage = vi.fn(({ success }: { success: (result: unknown) => void }) =>
      success({ tempFilePaths: ['/tmp/source.jpg'] }),
    )
    const cropImage = vi.fn(({ success }: { success: (result: unknown) => void }) =>
      success({ tempFilePath: '/tmp/cropped.jpg' }),
    )
    const compressImage = vi.fn(({ success }: { success: (result: unknown) => void }) =>
      success({ tempFilePath: '/tmp/compressed.jpg' }),
    )
    const getImageInfo = vi.fn(({ success }: { success: (result: unknown) => void }) =>
      success({ type: 'jpg', width: 256, height: 256 }),
    )
    const readFileSync = vi.fn(() => 'portrait-base64')
    const statSync = vi.fn(() => ({ size: 128 }))
    vi.stubGlobal('wx', {
      setNavigationBarTitle: vi.fn(),
      navigateTo: vi.fn(),
      showToast: vi.fn(),
      chooseImage,
      cropImage,
      compressImage,
      getImageInfo,
      getFileSystemManager: () => ({ readFileSync, statSync }),
    })
    page.onPortraitTap()
    expect(cropImage).toHaveBeenCalledWith(
      expect.objectContaining({ src: '/tmp/source.jpg', cropScale: '1:1' }),
    )
    await page.onSaveDraft()
    expect(fixtures.saveDraft).toHaveBeenCalledTimes(2)
    expect(fixtures.saveDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        portraitUpload: expect.objectContaining({
          base64: 'portrait-base64',
          meta: expect.objectContaining({ mimeType: 'image/jpeg', width: 256, height: 256 }),
        }),
      }),
    )
    expect(fixtures.saveDraft.mock.calls[1]?.[0]).not.toHaveProperty('portraitId')
  })

  it('選圖後顯示待上傳狀態，保存成功後顯示頭像已上傳', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad()
    page.onFieldInput(event({ field: 'name' }, { value: '狀態提示航海士' }))
    for (const field of ['rarityId', 'typeId', 'genderId']) {
      page.onBasicChange(event({ field }, { value: '0' }))
    }
    page.onEntitySelect(event({ kind: 'job' }, { id: 'job' }))
    page.onEntitySelect(event({ kind: 'nationality' }, { id: 'nation' }))

    vi.stubGlobal('wx', {
      setNavigationBarTitle: vi.fn(),
      navigateTo: vi.fn(),
      showToast: vi.fn(),
      chooseImage: vi.fn(({ success }: { success: (result: unknown) => void }) =>
        success({ tempFilePaths: ['/tmp/source.jpg'] }),
      ),
      cropImage: vi.fn(({ success }: { success: (result: unknown) => void }) =>
        success({ tempFilePath: '/tmp/cropped.jpg' }),
      ),
      compressImage: vi.fn(({ success }: { success: (result: unknown) => void }) =>
        success({ tempFilePath: '/tmp/compressed.jpg' }),
      ),
      getImageInfo: vi.fn(({ success }: { success: (result: unknown) => void }) =>
        success({ type: 'jpg', width: 256, height: 256 }),
      ),
      getFileSystemManager: () => ({
        readFileSync: vi.fn(() => 'portrait-base64'),
        statSync: vi.fn(() => ({ size: 128 })),
      }),
    })
    page.onPortraitTap()
    expect(page.data.portraitStatusText).toContain('待上傳')

    fixtures.saveDraft.mockResolvedValue({
      workOrderId: 'wo-portrait-status',
      status: 'draft',
      revision: 1,
      updatedAt: 'now',
      proposedData: page.data.form,
      referenceCandidates: [],
      portraitFileId: 'cloud://portrait-status',
      portraitMeta: { mimeType: 'image/jpeg', byteSize: 128, width: 256, height: 256 },
    })
    await page.onSaveDraft()
    expect(page.data.portraitStatusText).toContain('已上傳')
  })

  it('頭像上傳失敗時顯示可重試的錯誤狀態', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad()
    page.onFieldInput(event({ field: 'name' }, { value: '頭像失敗航海士' }))
    for (const field of ['rarityId', 'typeId', 'genderId']) {
      page.onBasicChange(event({ field }, { value: '0' }))
    }
    page.onEntitySelect(event({ kind: 'job' }, { id: 'job' }))
    page.onEntitySelect(event({ kind: 'nationality' }, { id: 'nation' }))
    vi.stubGlobal('wx', {
      setNavigationBarTitle: vi.fn(),
      navigateTo: vi.fn(),
      showToast: vi.fn(),
      chooseImage: vi.fn(({ success }: { success: (result: unknown) => void }) =>
        success({ tempFilePaths: ['/tmp/source.jpg'] }),
      ),
      cropImage: vi.fn(({ success }: { success: (result: unknown) => void }) =>
        success({ tempFilePath: '/tmp/cropped.jpg' }),
      ),
      compressImage: vi.fn(({ success }: { success: (result: unknown) => void }) =>
        success({ tempFilePath: '/tmp/compressed.jpg' }),
      ),
      getImageInfo: vi.fn(({ success }: { success: (result: unknown) => void }) =>
        success({ type: 'jpg', width: 256, height: 256 }),
      ),
      getFileSystemManager: () => ({
        readFileSync: vi.fn(() => 'portrait-base64'),
        statSync: vi.fn(() => ({ size: 128 })),
      }),
    })
    page.onPortraitTap()
    fixtures.saveDraft.mockRejectedValue(new Error('portrait-upload-failed'))
    await page.onSaveDraft()
    expect(page.data.portraitStatusText).toContain('上傳失敗')
  })

  it('已上傳頭像預覽載入失敗時顯示回退提示', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad()
    page.setData({ portraitFileId: 'cloud://portrait-status' })
    page.onPortraitImageError()
    expect(page.data.portraitImageFailed).toBe(true)
    expect(page.data.portraitStatusText).toContain('預覽載入失敗')
  })

  it('系統欄位不出現在輸入表單，新增使用系統預設，修改保留既有值', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad()
    expect(page.data.form).toMatchObject({
      visualGradeId: 'grade_2',
      portraitId: null,
      displayOrder: 0,
    })
    expect((page.data.basicFields as { field: string }[]).map((item) => item.field)).toEqual([
      'rarityId',
      'typeId',
      'genderId',
    ])
    page.onFieldInput(event({ field: 'visualGradeId' }, { value: 'grade_6' }))
    page.onFieldInput(event({ field: 'portraitId' }, { value: 'portrait-override' }))
    page.onFieldInput(event({ field: 'displayOrder' }, { value: '88' }))
    expect(page.data.form).toMatchObject({
      visualGradeId: 'grade_2',
      portraitId: null,
      displayOrder: 0,
    })

    await page.onLoad({ targetOfficerId: 'officer-1' })
    expect(page.data.form).toMatchObject({
      visualGradeId: 'grade_5',
      portraitId: 'portrait',
      displayOrder: 42,
    })
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
    page.onCandidateCategoryChange(
      event({ index: 0 }, { id: 'skill_category_naval_active_cannon' }),
    )
    expect(page.data.form).toMatchObject({
      skills: [expect.objectContaining({ kind: 'active', sourceGroup: 'sk2', slot: 0 })],
    })
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
            categoryId: 'skill_category_naval_active_cannon',
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
    page.onCandidateCategoryChange(
      event({ index: 0 }, { id: 'skill_category_naval_active_cannon' }),
    )
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
      skills: [{ skillId: 'skill', sourceGroup: 'sk2', kind: 'active', slot: 0 }],
    })
    expect(page.data.targetOfficerId).toBe('')
    expect(page.data.modifying).toBe(false)
  })

  it('技能分類選擇會回寫主被動與來源組，既有來源組不再反推主被動', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad()
    page.onEntitySelect(event({ kind: 'skill' }, { id: 'skill' }))
    expect((page.data.skillRows as { typeLabel: string; expanded: boolean }[])[0]).toMatchObject({
      typeLabel: '海戰主動-砲擊',
      expanded: true,
    })
    page.onSkillTypeChange(event({ id: 'skill' }, { value: '1' }))
    expect(page.data.form).toMatchObject({
      skills: [expect.objectContaining({ kind: 'passive', sourceGroup: 'sk0', slot: 0 })],
    })
  })

  it('技能列預設收合，新增時展開，手動切換可收回且槽位依來源組自動遞增', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ targetOfficerId: 'officer-1' })
    expect((page.data.skillRows as { expanded: boolean }[]).every((item) => !item.expanded)).toBe(
      true,
    )
    page.onEntitySelect(event({ kind: 'skill' }, { id: 'skill' }))
    page.onEntitySelect(event({ kind: 'skill' }, { id: 'skill2' }))
    expect(page.data.form).toMatchObject({
      skills: [
        expect.objectContaining({ skillId: 'skill', sourceGroup: 'sk2', slot: 0 }),
        expect.objectContaining({ skillId: 'skill2', sourceGroup: 'sk2', slot: 1 }),
      ],
    })
    expect((page.data.skillRows as { expanded: boolean }[]).every((item) => item.expanded)).toBe(
      true,
    )
    page.onToggleSkill(event({ id: 'skill' }, {}))
    expect(page.data.skillRows as { id: string; expanded: boolean }[]).toEqual([
      expect.objectContaining({ id: 'skill', expanded: false }),
      expect.objectContaining({ id: 'skill2', expanded: true }),
    ])
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
      skillCategory: expect.arrayContaining([
        expect.objectContaining({
          id: 'skill_category_naval_active_cannon',
          name: '海戰主動-砲擊',
          meta: '',
          searchableText: '海戰主動-砲擊 skill_category_naval_active_cannon',
        }),
      ]),
    })
    page.onCandidateCategoryChange(event({ index: 0 }, { id: 'unknown' }))
    expect(page.data.candidates).toEqual([expect.not.objectContaining({ categoryId: 'unknown' })])
    page.onCandidateCategoryChange(
      event({ index: 0 }, { id: 'skill_category_naval_active_cannon' }),
    )
    expect(page.data.candidates).toEqual([
      expect.objectContaining({
        categoryId: 'skill_category_naval_active_cannon',
        selectedCategoryIds: ['skill_category_naval_active_cannon'],
      }),
    ])
    page.onCandidateCategoryRemove(
      event({ index: 0 }, { id: 'skill_category_naval_active_cannon' }),
    )
    expect(page.data.candidates).toEqual([expect.objectContaining({ selectedCategoryIds: [] })])
    await page.onSaveDraft()
    expect(page.data.error).toContain('分類')
    expect(fixtures.saveDraft).not.toHaveBeenCalled()
  })

  it('系統欄位不接受表單事件修改', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad({ targetOfficerId: 'officer-1' })
    page.onFieldInput(event({ field: 'visualGradeId' }, { value: 'grade_2' }))
    page.onFieldInput(event({ field: 'portraitId' }, { value: 'new-portrait' }))
    page.onFieldInput(event({ field: 'displayOrder' }, { value: '1' }))
    expect(page.data.form).toMatchObject({
      visualGradeId: 'grade_5',
      portraitId: 'portrait',
      displayOrder: 42,
    })
  })

  it('移除候選項時一併移除 proposedData 中的候選引用', async () => {
    await import('../../miniprogram/subpkg-maintenance/pages/work-order-editor/index')
    await page.onLoad()
    page.onCreateCandidate(event({ kind: 'skill' }, { name: '待移除技能' }))
    const candidate = page.data.candidates[0]
    expect(candidate).toBeDefined()
    expect(page.data.form.skills).toEqual([expect.objectContaining({ skillId: candidate!.key })])
    page.onCandidateRemove(event({ index: 0 }, {}))
    expect(page.data.candidates).toEqual([])
    expect(page.data.form.skills).toEqual([])
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
