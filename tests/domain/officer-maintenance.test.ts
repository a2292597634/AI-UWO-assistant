import { describe, expect, it } from 'vitest'
import type {
  MaintenanceValidationContext,
  MaintenanceWorkOrderDraft,
} from '../../miniprogram/contracts/officer-maintenance'
import {
  buildWorkOrderDiff,
  validateMaintenanceDraft,
} from '../../miniprogram/domain/officer-maintenance'

const context: MaintenanceValidationContext = {
  dictionaries: {
    rarities: [{ id: 'rarity_5', name: '★★★★★' }],
    types: [{ id: 'type_adventure', name: '冒險' }],
    genders: [{ id: 'gender_f', name: '女' }],
    jobs: [{ id: 'job_navigator', name: '航海士' }],
    nationalities: [{ id: 'nationality_eng', name: '英格蘭' }],
    languages: [{ id: 'lang_eng', name: '英語' }],
    cities: [{ id: 'city_london', name: '倫敦' }],
    requirements: [{ id: 'requirement_none', name: '無' }],
    skillCategories: [{ id: 'skill_category_navigation', name: '航海' }],
  },
  skills: [
    {
      id: 'skill_navigation',
      n: '導航術',
      cat: 'skill_category_navigation',
      cn: '航海',
      ip: '/assets/skills/navigation.png',
      d: '提升航行能力',
      li: 'Lv.1',
    },
  ],
  officers: [{ id: 'officer_existing' }],
}

const proposedData: MaintenanceWorkOrderDraft['proposedData'] = {
  name: '測試航海士',
  rarityId: 'rarity_5',
  visualGradeId: 'grade_5',
  typeId: 'type_adventure',
  genderId: 'gender_f',
  jobId: 'job_navigator',
  nationalityId: 'nationality_eng',
  languages: [{ languageId: 'lang_eng', level: 1 }],
  skills: [
    {
      skillId: 'skill_navigation',
      kind: 'active',
      sourceGroup: 'sk2',
      slot: 0,
      unlockLevel: 1,
      level: 1,
    },
  ],
  recruitment: {
    cityIds: ['city_london'],
    requirementId: 'requirement_none',
    requiredOfficerIds: ['officer_existing'],
    note: null,
  },
  portraitId: null,
  displayOrder: 1,
}

const updateDraft = (): MaintenanceWorkOrderDraft => ({
  operation: 'updateOfficer',
  targetOfficerId: 'officer_missing',
  baseDataVersion: '2026-09-08',
  baseSnapshot: proposedData,
  proposedData,
  referenceCandidates: [],
})

describe('航海士維護工單校驗', () => {
  it.each([-1, 0.5, NaN, Infinity])('拒絕無效顯示排序 %s', (displayOrder) => {
    const errors = validateMaintenanceDraft(
      {
        ...updateDraft(),
        targetOfficerId: 'officer_existing',
        proposedData: { ...proposedData, displayOrder },
      },
      context,
    )
    expect(errors).toContainEqual({
      field: 'proposedData.displayOrder',
      message: '顯示排序必須為非負整數',
    })
  })

  it('同組槽位不可重複，不同組可使用相同槽位', () => {
    const draft = {
      ...updateDraft(),
      targetOfficerId: 'officer_existing',
      proposedData: {
        ...proposedData,
        skills: [proposedData.skills[0]!, { ...proposedData.skills[0]! }],
      },
    }
    expect(validateMaintenanceDraft(draft, context)).toContainEqual({
      field: 'proposedData.skills[1].slot',
      message: '同來源組的技能槽位不可重複',
    })
    draft.proposedData.skills[1] = { ...draft.proposedData.skills[1]!, sourceGroup: 'sk3' }
    expect(
      validateMaintenanceDraft(draft, context).some((error) => error.field.endsWith('.slot')),
    ).toBe(false)
  })

  it.each([0, 10, 50])('維護工單技能等級拒絕解鎖門檻值 %s', (level) => {
    const draft = {
      ...updateDraft(),
      targetOfficerId: 'officer_existing',
      proposedData: {
        ...proposedData,
        skills: [{ ...proposedData.skills[0]!, level }],
      },
    }

    expect(validateMaintenanceDraft(draft, context)).toContainEqual({
      field: 'proposedData.skills[0].level',
      message: '技能等級範圍 1-9',
    })
  })

  it.each([
    [
      { key: 'a', kind: 'job' as const, name: '甲', aliases: ['乙'] },
      { key: 'b', kind: 'job' as const, name: '乙', aliases: [] },
    ],
    [
      { key: 'a', kind: 'job' as const, name: '甲', aliases: [] },
      { key: 'b', kind: 'job' as const, name: '乙', aliases: ['甲'] },
    ],
    [
      { key: 'a', kind: 'job' as const, name: '甲', aliases: ['共用'] },
      { key: 'b', kind: 'job' as const, name: '乙', aliases: [' 共用 '] },
    ],
    [{ key: 'a', kind: 'job' as const, name: '甲', aliases: ['甲'] }],
  ])('拒絕候選名稱與別名衝突 %#', (...referenceCandidates) => {
    const errors = validateMaintenanceDraft(
      { ...updateDraft(), targetOfficerId: 'officer_existing', referenceCandidates },
      context,
    )
    expect(errors.some((error) => error.message.includes('衝突'))).toBe(true)
  })

  it('不同類別的候選項可使用相同名稱與別名', () => {
    expect(
      validateMaintenanceDraft(
        {
          ...updateDraft(),
          targetOfficerId: 'officer_existing',
          referenceCandidates: [
            { key: 'a', kind: 'job', name: '甲', aliases: ['別名'] },
            { key: 'b', kind: 'language', name: '甲', aliases: ['別名'] },
          ],
        },
        context,
      ),
    ).toEqual([])
  })

  it('修改工單保留目標 ID 並拒絕未知正式引用', () => {
    const result = validateMaintenanceDraft(
      {
        ...updateDraft(),
        proposedData: { ...proposedData, jobId: 'job_missing' },
      },
      context,
    )

    expect(result).toContainEqual({ field: 'targetOfficerId', message: '航海士不存在' })
    expect(result).toContainEqual({ field: 'proposedData.jobId', message: '職業不存在' })
  })

  it('候選技能必須選取既有技能分類 ID', () => {
    const draftWithUnclassifiedSkill: MaintenanceWorkOrderDraft = {
      ...updateDraft(),
      targetOfficerId: 'officer_existing',
      referenceCandidates: [
        {
          key: 'candidate-skill-1',
          kind: 'skill',
          name: '新技能',
          aliases: [],
          categoryId: 'skill_category_missing',
        },
      ],
    }

    expect(validateMaintenanceDraft(draftWithUnclassifiedSkill, context)).toContainEqual({
      field: 'referenceCandidates[0].categoryId',
      message: '請選擇既有技能分類',
    })
  })

  it('新增工單不可夾帶既有目標 ID', () => {
    const result = validateMaintenanceDraft(
      {
        ...updateDraft(),
        operation: 'createOfficer',
        targetOfficerId: 'officer_existing',
        baseDataVersion: null,
        baseSnapshot: null,
      },
      context,
    )

    expect(result).toContainEqual({
      field: 'targetOfficerId',
      message: '新增工單不可指定目標航海士',
    })
  })

  it('拒絕空白與同類同名的候選項', () => {
    const result = validateMaintenanceDraft(
      {
        ...updateDraft(),
        targetOfficerId: 'officer_existing',
        referenceCandidates: [
          { key: 'candidate-job-1', kind: 'job', name: ' ', aliases: [] },
          { key: 'candidate-job-2', kind: 'job', name: '新職業', aliases: [] },
          { key: 'candidate-job-3', kind: 'job', name: ' 新職業 ', aliases: [] },
        ],
      },
      context,
    )

    expect(result).toContainEqual({
      field: 'referenceCandidates[0].name',
      message: '請輸入候選項名稱',
    })
    expect(result).toContainEqual({
      field: 'referenceCandidates[2].name',
      message: '同類候選項名稱不可重複',
    })
  })

  it('候選名稱以 NFKC 與大小寫不敏感規則判斷重複', () => {
    const result = validateMaintenanceDraft(
      {
        ...updateDraft(),
        targetOfficerId: 'officer_existing',
        referenceCandidates: [
          { key: 'candidate-job-1', kind: 'job', name: 'Navigation', aliases: ['航海'] },
          { key: 'candidate-job-2', kind: 'job', name: ' ｎａｖｉｇａｔｉｏｎ ', aliases: [] },
        ],
      },
      context,
    )

    expect(result).toContainEqual({
      field: 'referenceCandidates[1].name',
      message: '同類候選項名稱不可重複',
    })
  })

  it('拒絕無效候選 key、kind 與 aliases 型別', () => {
    const result = validateMaintenanceDraft(
      {
        ...updateDraft(),
        targetOfficerId: 'officer_existing',
        referenceCandidates: [
          { key: ' ', kind: 'job', name: '空白 key', aliases: [] },
          { key: 'candidate-job-1', kind: 'unknown', name: '無效類型', aliases: [] },
          {
            key: 'candidate-job-1',
            kind: 'job',
            name: '別名格式錯誤',
            aliases: '別名' as unknown as readonly string[],
          },
        ],
      } as unknown as MaintenanceWorkOrderDraft,
      context,
    )

    expect(result).toEqual(
      expect.arrayContaining([
        { field: 'referenceCandidates[0].key', message: '候選項 key 不可空白' },
        { field: 'referenceCandidates[1].kind', message: '候選項類型無效' },
        { field: 'referenceCandidates[2].aliases', message: '候選項別名格式無效' },
      ]),
    )
  })

  it('拒絕重複候選 key 與無效技能來源組和類型', () => {
    const result = validateMaintenanceDraft(
      {
        ...updateDraft(),
        targetOfficerId: 'officer_existing',
        referenceCandidates: [
          { key: 'candidate-job-1', kind: 'job', name: '職業甲', aliases: [] },
          { key: 'candidate-job-1', kind: 'job', name: '職業乙', aliases: [] },
        ],
        proposedData: {
          ...proposedData,
          skills: [
            {
              ...proposedData.skills[0]!,
              sourceGroup: 'sk9',
              kind: 'unknown',
            },
          ],
        },
      } as unknown as MaintenanceWorkOrderDraft,
      context,
    )

    expect(result).toEqual(
      expect.arrayContaining([
        { field: 'referenceCandidates[1].key', message: '候選項 key 不可重複' },
        { field: 'proposedData.skills[0].sourceGroup', message: '技能來源組無效' },
        { field: 'proposedData.skills[0].kind', message: '技能類型無效' },
      ]),
    )
  })

  it('不會將形似正式 ID 的候選名稱當成正式引用', () => {
    const result = validateMaintenanceDraft(
      {
        ...updateDraft(),
        targetOfficerId: 'officer_existing',
        referenceCandidates: [
          { key: 'candidate-job-1', kind: 'job', name: 'job_missing', aliases: [] },
          { key: 'candidate-language-1', kind: 'language', name: 'lang_missing', aliases: [] },
        ],
      },
      context,
    )

    expect(result).toEqual([])
  })

  it('不改寫草稿或正式資料校驗 context', () => {
    const draft = {
      ...updateDraft(),
      targetOfficerId: 'officer_existing',
    }
    const draftBefore = structuredClone(draft)
    const contextBefore = structuredClone(context)

    validateMaintenanceDraft(draft, context)

    expect(draft).toEqual(draftBefore)
    expect(context).toEqual(contextBefore)
  })
})

describe('工單欄位差異', () => {
  it('只回傳不同的正式資料欄位', () => {
    const result = buildWorkOrderDiff(proposedData, {
      ...proposedData,
      jobId: 'job_other',
    })

    expect(result).toEqual([{ field: 'jobId', before: 'job_navigator', after: 'job_other' }])
  })

  it('不改寫輸入，且差異巢狀值與輸入隔離', () => {
    const before = structuredClone(proposedData)
    const after = {
      ...structuredClone(proposedData),
      languages: [{ languageId: 'lang_other', level: 1 }],
    }
    const beforeSnapshot = structuredClone(before)
    const afterSnapshot = structuredClone(after)

    const result = buildWorkOrderDiff(before, after)
    const languages = result.find((entry) => entry.field === 'languages')!.before as readonly {
      languageId: string
    }[]
    const mutableLanguages = languages as unknown as Array<{ languageId: string }>
    mutableLanguages[0]!.languageId = 'lang_mutated'

    expect(before).toEqual(beforeSnapshot)
    expect(after).toEqual(afterSnapshot)
  })
})
