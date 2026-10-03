import { describe, expect, it } from 'vitest'
import {
  validateMasterDataset,
  type MasterDatasetInput,
} from '../../tools/data-audit/validate-master-dataset'

const fixture = (): MasterDatasetInput => ({
  dataset: {
    schemaVersion: '1.0.0',
    contentVersion: 'test',
    updatedAt: '2026-10-02T00:00:00Z',
    sourceSnapshot: 'test',
    counts: { officers: 1, skills: 1, assets: 0, dictionaryItems: 9 },
  },
  officers: [
    {
      id: 'officer_test',
      name: '測試',
      rarityId: 'rarity_test',
      visualGradeId: 'grade_2',
      typeId: 'type_test',
      genderId: 'gender_test',
      jobId: 'job_test',
      nationalityId: 'nationality_test',
      languages: [{ languageId: 'language_test', level: 1 }],
      skills: [
        {
          skillId: 'skill_test',
          kind: 'active',
          sourceGroup: 'sk2',
          slot: 0,
          unlockLevel: 1,
          level: 1,
        },
      ],
      recruitment: {
        cityIds: ['city_test'],
        requirementId: 'requirement_test',
        requiredOfficerIds: [],
        note: null,
      },
      portraitId: null,
      displayOrder: 1,
      sourceRefs: { workOrderId: 'wo_test' },
    },
  ],
  skills: [
    {
      id: 'skill_test',
      name: '測試技能',
      categoryId: 'skill_category_repair',
      description: '測試',
      levelInfo: 'Lv1: 1%',
      iconId: null,
      sourceRefs: { workOrderId: 'wo_test:skill' },
    },
  ],
  dictionaries: Object.fromEntries(
    [
      ['rarities', 'rarity_test'],
      ['types', 'type_test'],
      ['genders', 'gender_test'],
      ['jobs', 'job_test'],
      ['nationalities', 'nationality_test'],
      ['languages', 'language_test'],
      ['cities', 'city_test'],
      ['requirements', 'requirement_test'],
      ['skillCategories', 'skill_category_repair'],
    ].map(([group, id]) => [
      group,
      [{ id, name: '測試', displayOrder: 1, sourceRefs: { workOrderId: 'wo_test:dict' } }],
    ]),
  ),
  assets: [],
})

describe('正式 master 純校驗', () => {
  it('接受獨立最小集合，不要求代表性來源的固定數量', () =>
    expect(validateMasterDataset(fixture())).toEqual([]))
  const cases: Array<[string, string, (input: MasterDatasetInput) => void]> = [
    [
      'MASTER_REFERENCE_MISSING',
      '/officers/0/nationalityId',
      (x) => {
        x.officers[0].nationalityId = 'missing'
      },
    ],
    [
      'MASTER_REFERENCE_MISSING',
      '/officers/0/languages/0/languageId',
      (x) => {
        x.officers[0].languages[0].languageId = 'missing'
      },
    ],
    [
      'MASTER_REFERENCE_MISSING',
      '/officers/0/skills/0/skillId',
      (x) => {
        x.officers[0].skills[0].skillId = 'missing'
      },
    ],
    [
      'MASTER_REFERENCE_MISSING',
      '/officers/0/recruitment/cityIds/0',
      (x) => {
        x.officers[0].recruitment.cityIds[0] = 'missing'
      },
    ],
    [
      'MASTER_REFERENCE_MISSING',
      '/officers/0/recruitment/requiredOfficerIds/0',
      (x) => {
        x.officers[0].recruitment.requiredOfficerIds = ['missing']
      },
    ],
    [
      'MASTER_DUPLICATE_ID',
      '/officers/1/id',
      (x) => {
        ;(x.officers as unknown[]).push(structuredClone(x.officers[0]))
      },
    ],
    [
      'MASTER_DUPLICATE_LANGUAGE',
      '/officers/0/languages/1/languageId',
      (x) => {
        x.officers[0].languages.push({ ...x.officers[0].languages[0] })
      },
    ],
    [
      'MASTER_DUPLICATE_SKILL_SLOT',
      '/officers/0/skills/1/slot',
      (x) => {
        x.officers[0].skills.push({ ...x.officers[0].skills[0] })
      },
    ],
    [
      'MASTER_SKILL_LEVEL_INVALID',
      '/officers/0/skills/0/level',
      (x) => {
        x.officers[0].skills[0].level = 10
      },
    ],
    [
      'MASTER_UNLOCK_LEVEL_INVALID',
      '/officers/0/skills/0/unlockLevel',
      (x) => {
        x.officers[0].skills[0].unlockLevel = 0
      },
    ],
    [
      'MASTER_INNATE_INVALID',
      '/officers/0/skills/0',
      (x) => {
        x.officers[0].skills[0].sourceGroup = 'sk1'
        x.officers[0].skills[0].level = 2
        x.skills[0].categoryId = 'skill_category_innate_buff'
      },
    ],
    [
      'MASTER_SKILL_KIND_CONFLICT',
      '/officers/0/skills/0/kind',
      (x) => {
        x.officers[0].skills[0].kind = 'passive'
      },
    ],
    [
      'MASTER_COUNT_MISMATCH',
      '/dataset/counts/officers',
      (x) => {
        x.dataset.counts.officers = 8
      },
    ],
    [
      'MASTER_REFERENCE_MISSING',
      '/assets/0/ownerId',
      (x) => {
        ;(x.assets as unknown[]).push({
          id: 'asset_test',
          ownerType: 'officer',
          ownerId: 'missing',
        })
      },
    ],
  ]
  it.each(cases)('%s 精確定位 %s', (code, path, damage) => {
    const input = fixture()
    damage(input)
    expect(validateMasterDataset(input)).toContainEqual(
      expect.objectContaining({ severity: 'error', code, path }),
    )
  })
  it.each([0, -1, 1.5, 10, Number.NaN])('拒絕非法技能 level %s', (value) => {
    const input = fixture()
    input.officers[0].skills[0].level = value
    expect(validateMasterDataset(input)).toContainEqual(
      expect.objectContaining({
        code: 'MASTER_SKILL_LEVEL_INVALID',
        path: '/officers/0/skills/0/level',
      }),
    )
  })
  it.each([0, -1, 1.5, Number.NaN])('拒絕非正整數 unlockLevel %s', (value) => {
    const input = fixture()
    input.officers[0].skills[0].unlockLevel = value
    expect(validateMasterDataset(input)).toContainEqual(
      expect.objectContaining({
        code: 'MASTER_UNLOCK_LEVEL_INVALID',
        path: '/officers/0/skills/0/unlockLevel',
      }),
    )
  })
  it('獨立技能和字典的重複 ID 都精確定位', () => {
    const input = fixture()
    ;(input.skills as unknown[]).push(structuredClone(input.skills[0]))
    ;(input.dictionaries.languages as unknown[]).push(
      structuredClone(input.dictionaries.languages[0]),
    )
    expect(validateMasterDataset(input)).toContainEqual(
      expect.objectContaining({ code: 'MASTER_DUPLICATE_ID', path: '/skills/1/id' }),
    )
    expect(validateMasterDataset(input)).toContainEqual(
      expect.objectContaining({
        code: 'MASTER_DUPLICATE_ID',
        path: '/dictionaries/languages/1/id',
      }),
    )
  })
  it('不同關係的合法 kind 不互相覆蓋', () => {
    const input = fixture()
    input.officers[0].skills.push({
      ...input.officers[0].skills[0],
      sourceGroup: 'sk0',
      slot: 0,
      kind: 'passive',
    })
    expect(validateMasterDataset(input).filter((x) => x.severity === 'error')).toEqual([])
  })
})
