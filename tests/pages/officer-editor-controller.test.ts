import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMaintenanceOfficer = vi.hoisted(() => vi.fn())
const getMaintenanceDictionaries = vi.hoisted(() => vi.fn())
const uploadScreenshots = vi.hoisted(() => vi.fn())
const createReport = vi.hoisted(() => vi.fn())
const pageScrollTo = vi.hoisted(() => vi.fn())
const redirectTo = vi.hoisted(() => vi.fn())

const catalogEntry = {
  id: 'officer_1',
  name: '克里斯蒂娜',
  rarityId: 'rarity_5',
  rarityName: 'S',
  rarityClass: 's',
  visualGradeId: 'grade_5',
  typeId: 'type_class_1',
  typeName: '冒險',
  genderId: 'gender_f',
  genderLabel: '女性',
  jobId: 'job_naturalist',
  jobName: '博物學者',
  portraitPath: '/assets/officers/officer_1.png',
  languages: ['lang_nl', 'lang_en'],
  activeSkills: [],
  passiveSkills: [],
  searchAliases: ['Christina'],
}

const maintenanceData = {
  name: '克里斯蒂娜',
  rarityId: 'rarity_5',
  visualGradeId: 'grade_5',
  typeId: 'type_class_1',
  genderId: 'gender_f',
  jobId: 'job_naturalist',
  nationalityId: 'nationality_nl',
  languages: [
    { languageId: 'lang_nl', level: 5 },
    { languageId: 'lang_en', level: 3 },
  ],
  skills: [],
  recruitment: {
    cityIds: [],
    requirementId: null,
    requiredOfficerIds: [],
    note: null,
  },
  portraitId: null,
  displayOrder: 1,
}

const dictionaries = {
  rarities: [{ id: 'rarity_5', name: 'S' }],
  types: [{ id: 'type_class_1', name: '冒險' }],
  genders: [{ id: 'gender_f', name: '女性' }],
  jobs: [{ id: 'job_naturalist', name: '博物學者' }],
  nationalities: [{ id: 'nationality_nl', name: '荷蘭' }],
  languages: [
    { id: 'lang_nl', name: '荷蘭語' },
    { id: 'lang_en', name: '英語' },
  ],
  cities: [],
  requirements: [],
  skillCategories: [],
}

vi.mock('../../miniprogram/runtime/main-data-store', () => ({
  getCatalog: () => [catalogEntry],
  getMaintenanceOfficer,
  getMaintenanceDictionaries,
}))

vi.mock('../../miniprogram/runtime/officer-error-report-service', async (original) => ({
  ...(await original<object>()),
  getOfficerErrorReportService: () => ({ uploadScreenshots, createReport }),
}))

interface TestPage {
  data: {
    officerOptions: Array<{ id: string; name: string; searchableText: string }>
    officerIdentity: null | { id: string; name: string; rarityName: string }
    selectingOfficer: boolean
    fieldErrors: Record<string, string>
    descriptionCount: number
    correctionCount: number
    evidenceExpanded: boolean
    evidenceSummary: string
    draft: {
      officerId: string
      errorTypes: string[]
      description: string
      suggestedCorrection: string
      sourceUrl: string
      screenshotFileIds: string[]
      supplement: string
    }
    screenshotTempPaths: string[]
    submitting: boolean
    submitError: string
    submittedReportId: string
    returnToOfficerId: string
  }
  setData(update: Record<string, unknown>): void
  onLoad(query?: Record<string, string | undefined>): Promise<void>
  onOfficerSelect(event: WechatMiniprogram.CustomEvent<{ id: string }>): Promise<void>
  onChangeOfficer(): void
  onErrorTypeTap(event: WechatMiniprogram.BaseEvent): void
  onDescriptionInput(event: WechatMiniprogram.Input): void
  onCorrectionInput(event: WechatMiniprogram.Input): void
  onSourceUrlInput(event: WechatMiniprogram.Input): void
  onToggleEvidence(): void
  onRemoveScreenshot(event: WechatMiniprogram.BaseEvent): void
  onSubmit(): Promise<void>
}

const setByPath = (target: Record<string, unknown>, path: string, value: unknown): void => {
  const parts = path.split('.')
  let current = target
  for (const part of parts.slice(0, -1)) {
    current = current[part] as Record<string, unknown>
  }
  current[parts[parts.length - 1]!] = value
}

const loadPage = async (): Promise<TestPage> => {
  let page: TestPage | undefined
  vi.stubGlobal('wx', {
    pageScrollTo,
    redirectTo,
    navigateTo: vi.fn(),
    chooseMedia: vi.fn(),
    showToast: vi.fn(),
  })
  vi.stubGlobal('Page', (definition: TestPage) => {
    page = {
      ...definition,
      data: structuredClone(definition.data),
      setData(update) {
        Object.entries(update).forEach(([path, value]) => setByPath(this.data, path, value))
      },
    }
  })
  await import('../../miniprogram/pages/officer-editor/index')
  return page!
}

const input = (value: string): WechatMiniprogram.Input => ({ detail: { value } }) as never
const tap = (id: string): WechatMiniprogram.BaseEvent =>
  ({ currentTarget: { dataset: { id } } }) as never

const submittedReport = {
  reportId: 'report_123',
  officerId: 'officer_1',
  errorTypes: ['basic'],
  description: '錯誤內容',
  suggestedCorrection: '正確內容',
  sourceUrl: '',
  screenshotFileIds: [],
  supplement: '',
  status: 'pending',
  reviewReply: null,
  fixedDatasetVersion: null,
  supplements: [],
  history: [],
  revision: 1,
  createdAt: '2026-09-14T01:00:00.000Z',
  updatedAt: '2026-09-14T01:00:00.000Z',
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  getMaintenanceOfficer.mockResolvedValue({ dataVersion: '2026.09.14', data: maintenanceData })
  getMaintenanceDictionaries.mockResolvedValue(dictionaries)
  uploadScreenshots.mockResolvedValue([])
  createReport.mockResolvedValue(submittedReport)
})

afterEach(() => vi.unstubAllGlobals())

describe('航海士資料錯誤回報 Controller', () => {
  it('從詳情頁 query 載入完整身份資訊並保留返回目標', async () => {
    const page = await loadPage()
    await page.onLoad({ officerId: 'officer_1' })

    expect(page.data.officerIdentity).toMatchObject({
      id: 'officer_1',
      name: '克里斯蒂娜',
      rarityName: 'S',
    })
    expect(page.data.returnToOfficerId).toBe('officer_1')
    expect(page.data.officerOptions[0]?.searchableText).toContain('Christina')
  })

  it('搜尋選擇航海士後原位顯示身份卡且保留其他表單內容', async () => {
    const page = await loadPage()
    await page.onLoad()
    page.onDescriptionInput(input('已填內容'))

    await page.onOfficerSelect({ detail: { id: 'officer_1' } } as never)

    expect(page.data.selectingOfficer).toBe(false)
    expect(page.data.officerIdentity?.name).toBe('克里斯蒂娜')
    expect(page.data.draft).toMatchObject({ officerId: 'officer_1', description: '已填內容' })
    page.onChangeOfficer()
    expect(page.data.selectingOfficer).toBe(true)
    expect(page.data.draft.description).toBe('已填內容')
  })

  it('輸入時計算字符數並即時清除對應字段錯誤', async () => {
    const page = await loadPage()
    await page.onLoad()
    page.data.fieldErrors = {
      description: '請填寫錯誤說明',
      suggestedCorrection: '請填寫建議的正確內容',
    }

    page.onDescriptionInput(input('錯誤內容'))
    page.onCorrectionInput(input('正確內容'))

    expect(page.data.descriptionCount).toBe(4)
    expect(page.data.correctionCount).toBe(4)
    expect(page.data.fieldErrors.description).toBeUndefined()
    expect(page.data.fieldErrors.suggestedCorrection).toBeUndefined()
  })

  it('提交校驗錯誤映射到字段並捲動至第一個錯誤', async () => {
    const page = await loadPage()
    await page.onLoad({ officerId: 'officer_1' })

    await page.onSubmit()

    expect(page.data.fieldErrors).toMatchObject({
      errorTypes: '請至少選擇一種錯誤類型',
      description: '請填寫錯誤說明',
    })
    expect(pageScrollTo).toHaveBeenCalledWith({ selector: '#field-errorTypes', duration: 240 })
    expect(createReport).not.toHaveBeenCalled()
  })

  it('證據區收合只改變顯示並保留網址及截圖', async () => {
    const page = await loadPage()
    await page.onLoad()
    page.onSourceUrlInput(input('https://example.com/source'))
    page.data.screenshotTempPaths = ['one.png', 'two.png']

    page.onToggleEvidence()
    page.onToggleEvidence()

    expect(page.data.evidenceExpanded).toBe(false)
    expect(page.data.draft.sourceUrl).toBe('https://example.com/source')
    expect(page.data.screenshotTempPaths).toEqual(['one.png', 'two.png'])
    expect(page.data.evidenceSummary).toBe('1 個網址 · 2 張截圖')
  })

  it('來源及截圖皆空仍可提交，提交期間防重並保留服務端編號', async () => {
    let resolveReport: ((value: typeof submittedReport) => void) | undefined
    createReport.mockImplementation(
      () => new Promise<typeof submittedReport>((resolve) => (resolveReport = resolve)),
    )
    const page = await loadPage()
    await page.onLoad({ officerId: 'officer_1' })
    page.onErrorTypeTap(tap('basic'))
    page.onDescriptionInput(input('錯誤內容'))
    page.onCorrectionInput(input('正確內容'))

    const firstSubmit = page.onSubmit()
    await Promise.resolve()
    const secondSubmit = page.onSubmit()
    expect(page.data.submitting).toBe(true)
    expect(createReport).toHaveBeenCalledOnce()

    resolveReport!(submittedReport)
    await Promise.all([firstSubmit, secondSubmit])
    expect(uploadScreenshots).toHaveBeenCalledWith([])
    expect(page.data.submittedReportId).toBe('report_123')
    expect(page.data.submitting).toBe(false)
    expect(redirectTo).not.toHaveBeenCalled()
  })

  it('提交失敗後保留所有內容並顯示可理解錯誤', async () => {
    createReport.mockRejectedValue(new Error('登入已失效'))
    const page = await loadPage()
    await page.onLoad({ officerId: 'officer_1' })
    page.onErrorTypeTap(tap('basic'))
    page.onDescriptionInput(input('錯誤內容'))
    page.onCorrectionInput(input('正確內容'))
    page.onSourceUrlInput(input('https://example.com/source'))

    await page.onSubmit()

    expect(page.data.draft).toMatchObject({
      officerId: 'officer_1',
      description: '錯誤內容',
      sourceUrl: 'https://example.com/source',
    })
    expect(page.data.submitError).toBe('登入已失效')
    expect(page.data.submitting).toBe(false)
  })
})
