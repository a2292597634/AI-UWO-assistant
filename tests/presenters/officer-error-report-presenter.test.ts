import { describe, expect, it } from 'vitest'
import type {
  MaintenanceDictionaries,
  MaintenanceOfficerData,
} from '../../miniprogram/contracts/officer-maintenance'
import type { RuntimeCatalogEntry } from '../../miniprogram/contracts/runtime-data'
import {
  buildOfficerReportOptions,
  mapOfficerReportFieldErrors,
  presentOfficerReportIdentity,
  searchOfficerReportOptions,
} from '../../miniprogram/presenters/officer-error-report-presenter'

const catalogEntry: RuntimeCatalogEntry = {
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
  searchAliases: ['Christina', '克里斯'],
}

const aliasOnlyCatalogEntry: RuntimeCatalogEntry = {
  ...catalogEntry,
  id: 'officer_2',
  name: '阿蘭',
  portraitPath: '/assets/officers/officer_2.png',
  searchAliases: ['克里'],
}

const prefixCatalogEntry: RuntimeCatalogEntry = {
  ...catalogEntry,
  id: 'officer_3',
  name: '克里斯多福',
  portraitPath: '/assets/officers/officer_3.png',
  searchAliases: ['Christopher'],
}

const maintenanceData: MaintenanceOfficerData = {
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

const dictionaries: MaintenanceDictionaries = {
  rarities: [{ id: 'rarity_5', name: 'S' }],
  types: [{ id: 'type_class_1', name: '冒險' }],
  genders: [{ id: 'gender_f', name: '女性' }],
  jobs: [{ id: 'job_naturalist', name: '博物學者' }],
  nationalities: [{ id: 'nationality_nl', name: '荷蘭' }],
  languages: [
    { id: 'lang_nl', name: '荷蘭語' },
    { id: 'lang_en', name: '英語' },
    { id: 'lang_fr', name: '法語' },
  ],
  cities: [],
  requirements: [],
  skillCategories: [],
}

describe('航海士錯誤回報 Presenter', () => {
  it('候選與身份卡共用稀有度分層頭像', () => {
    const option = buildOfficerReportOptions([catalogEntry])[0]!
    const identity = presentOfficerReportIdentity(catalogEntry, maintenanceData, dictionaries)

    expect(option).toMatchObject({
      portraitPath: '/assets/officers/officer_1.png',
      visuals: {
        framePath: '/assets/ui/uwo-bg-grade-5.png',
        rarityIconPath: '/assets/ui/uwo-icon-grade-5.png',
      },
    })
    expect(identity.visuals).toEqual(option.visuals)
  })

  it('只有輸入查詢後才按姓名、ID 或別名回傳受限候選', () => {
    const options = buildOfficerReportOptions([catalogEntry])

    expect(searchOfficerReportOptions(options, '   ')).toEqual([])
    expect(searchOfficerReportOptions(options, ' ＣＨＲＩＳＴＩＮＡ ')).toMatchObject([
      { id: 'officer_1', name: '克里斯蒂娜' },
    ])
    expect(searchOfficerReportOptions(options, 'officer_1')).toMatchObject([{ id: 'officer_1' }])
  })

  it('姓名查詢按姓名前綴優先排序並遵守結果數量限制', () => {
    const options = buildOfficerReportOptions([
      catalogEntry,
      aliasOnlyCatalogEntry,
      prefixCatalogEntry,
    ])

    expect(searchOfficerReportOptions(options, '蒂娜')).toMatchObject([
      { id: 'officer_1', name: '克里斯蒂娜' },
    ])

    const matches = searchOfficerReportOptions(options, '克里')
    expect(matches).toHaveLength(3)
    expect(matches.slice(0, 2).map(({ id }) => id)).toEqual(
      expect.arrayContaining(['officer_1', 'officer_3']),
    )
    expect(matches[2]?.id).toBe('officer_2')

    expect(searchOfficerReportOptions(options, '克里', 2)).toEqual(matches.slice(0, 2))
  })

  it('身份卡結合目錄展示資料與維護國籍、語言等級', () => {
    expect(presentOfficerReportIdentity(catalogEntry, maintenanceData, dictionaries)).toEqual({
      id: 'officer_1',
      name: '克里斯蒂娜',
      portraitPath: '/assets/officers/officer_1.png',
      visuals: {
        framePath: '/assets/ui/uwo-bg-grade-5.png',
        rarityIconPath: '/assets/ui/uwo-icon-grade-5.png',
        typeIconPath: '/assets/ui/uwo-icon-class-1.png',
        genderIconPath: '/assets/ui/gender-f.png',
      },
      rarityName: 'S',
      typeName: '冒險',
      jobName: '博物學者',
      genderLabel: '女性',
      nationalityName: '荷蘭',
      languageSummary: '荷蘭語 Lv.5、英語 Lv.3',
    })
  })

  it('超過兩種語言時只列首兩種並顯示總數', () => {
    expect(
      presentOfficerReportIdentity(
        catalogEntry,
        {
          ...maintenanceData,
          languages: [...maintenanceData.languages, { languageId: 'lang_fr', level: 2 }],
        },
        dictionaries,
      ).languageSummary,
    ).toBe('荷蘭語 Lv.5、英語 Lv.3 等 3 種語言')
  })

  it('字典無法匹配時不猜測資料內容', () => {
    expect(
      presentOfficerReportIdentity(
        catalogEntry,
        { ...maintenanceData, nationalityId: 'nationality_unknown', languages: [] },
        dictionaries,
      ),
    ).toMatchObject({ nationalityName: '資料未收錄', languageSummary: '資料未收錄' })
  })

  it('將校驗錯誤按字段映射並保留每個字段的首個訊息', () => {
    expect(
      mapOfficerReportFieldErrors([
        { field: 'officerId', message: '請選擇航海士' },
        { field: 'description', message: '請填寫錯誤說明' },
        { field: 'description', message: '錯誤說明過長' },
      ]),
    ).toEqual({
      officerId: '請選擇航海士',
      description: '請填寫錯誤說明',
    })
  })
})
