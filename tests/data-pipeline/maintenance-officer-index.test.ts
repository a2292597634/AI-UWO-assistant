import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'
import * as pipeline from '../../tools/data-pipeline/build-runtime-data'
import type { CanonicalOfficer } from '../../tools/import/types'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true })))

const officer: CanonicalOfficer = {
  id: 'officer_fixture',
  name: '測試航海士',
  rarityId: 'rarity_5',
  visualGradeId: 'grade_6',
  typeId: 'type_class_2',
  genderId: 'gender_f',
  jobId: 'job_fixture',
  nationalityId: 'nationality_fixture',
  languages: [{ languageId: 'language_fixture', level: 5 }],
  skills: [
    {
      skillId: 'skill_fixture',
      kind: 'passive',
      sourceGroup: 'sk5',
      slot: 2,
      unlockLevel: 70,
      level: 3,
    },
  ],
  recruitment: {
    cityIds: ['city_fixture'],
    requirementId: 'requirement_fixture',
    requiredOfficerIds: ['officer_other'],
    note: '招募備註',
  },
  portraitId: 'asset_portrait_fixture',
  displayOrder: 27,
  maintenanceNote: '維護備註',
  sourceRefs: { voyageTw: 'fixture' },
}

describe('完整維護索引生成', () => {
  it('直接保留正式字典四類前綴 ID，包含未被航海士使用的項目且排序確定', () => {
    const dir = mkdtempSync(join(tmpdir(), 'maintenance-index-'))
    directories.push(dir)
    const dictionaries = {
      nationalities: [
        {
          id: 'nationality_ctn_swe',
          name: '瑞典',
          displayOrder: 0,
          sourceRefs: { voyageTw: 'ctn_swe' },
        },
      ],
      languages: [
        {
          id: 'language_lang70',
          name: '瑞典語',
          displayOrder: 0,
          sourceRefs: { voyageTw: 'lang70' },
        },
      ],
      cities: [
        {
          id: 'city_unused',
          name: '未使用城市',
          displayOrder: 0,
          sourceRefs: { voyageTw: 'unused' },
        },
        {
          id: 'city_town4105',
          name: '科科拉',
          displayOrder: 0,
          sourceRefs: { voyageTw: 'town4105' },
        },
      ],
      requirements: [
        {
          id: 'requirement_reqchasT089',
          name: '招募條件',
          displayOrder: 0,
          sourceRefs: { voyageTw: 'reqchasT089' },
        },
      ],
    }
    pipeline.writeMaintenanceOfficerIndex([], 'v1', dir, dictionaries)
    const first = readFileSync(join(dir, 'maintenance-officers.js'), 'utf8')
    const context = { module: { exports: {} } }
    runInNewContext(first, context)
    expect(context.module.exports).toMatchObject({
      dictionaries: {
        nationalities: [{ id: 'nationality_ctn_swe', name: '瑞典' }],
        languages: [{ id: 'language_lang70', name: '瑞典語' }],
        cities: [
          { id: 'city_town4105', name: '科科拉' },
          { id: 'city_unused', name: '未使用城市' },
        ],
        requirements: [{ id: 'requirement_reqchasT089', name: '招募條件' }],
      },
    })
    pipeline.writeMaintenanceOfficerIndex([], 'v1', dir, {
      ...dictionaries,
      cities: [...dictionaries.cities].reverse(),
    })
    expect(readFileSync(join(dir, 'maintenance-officers.js'), 'utf8')).toBe(first)
  })

  it('輸出全部維護欄位及資料版本，保留正式 ID 並排除來源資訊', () => {
    const dir = mkdtempSync(join(tmpdir(), 'maintenance-index-'))
    directories.push(dir)
    expect(pipeline).toHaveProperty('writeMaintenanceOfficerIndex')
    pipeline.writeMaintenanceOfficerIndex([officer], 'version-42', dir, {})
    const context = { module: { exports: {} } }
    runInNewContext(readFileSync(join(dir, 'maintenance-officers.js'), 'utf8'), context)
    expect(context.module.exports).toEqual({
      dataVersion: 'version-42',
      dictionaries: {
        rarities: [],
        types: [],
        genders: [],
        jobs: [],
        nationalities: [],
        languages: [],
        cities: [],
        requirements: [],
        skillCategories: [],
      },
      officers: {
        officer_fixture: {
          name: '測試航海士',
          rarityId: 'rarity_5',
          visualGradeId: 'grade_6',
          typeId: 'type_class_2',
          genderId: 'gender_f',
          jobId: 'job_fixture',
          nationalityId: 'nationality_fixture',
          languages: [{ languageId: 'language_fixture', level: 5 }],
          skills: [
            {
              skillId: 'skill_fixture',
              kind: 'passive',
              sourceGroup: 'sk5',
              slot: 2,
              unlockLevel: 70,
              level: 3,
            },
          ],
          recruitment: {
            cityIds: ['city_fixture'],
            requirementId: 'requirement_fixture',
            requiredOfficerIds: ['officer_other'],
            note: '招募備註',
          },
          portraitId: 'asset_portrait_fixture',
          displayOrder: 27,
          maintenanceNote: '維護備註',
        },
      },
    })
  })

  it('相同輸入順序不同時仍生成相同位元組，並保留空值與無備註資料', () => {
    const dir = mkdtempSync(join(tmpdir(), 'maintenance-index-'))
    directories.push(dir)
    const emptyOfficer: CanonicalOfficer = {
      ...officer,
      id: 'officer_empty',
      languages: [],
      skills: [],
      portraitId: null,
      maintenanceNote: undefined,
      recruitment: { cityIds: [], requiredOfficerIds: [], requirementId: null, note: null },
    }
    pipeline.writeMaintenanceOfficerIndex([officer, emptyOfficer], 'v1', dir, {})
    const first = readFileSync(join(dir, 'maintenance-officers.js'), 'utf8')
    pipeline.writeMaintenanceOfficerIndex([emptyOfficer, officer], 'v1', dir, {})
    expect(readFileSync(join(dir, 'maintenance-officers.js'), 'utf8')).toBe(first)
    const context = { module: { exports: {} as { officers: Record<string, unknown> } } }
    runInNewContext(first, context)
    expect(context.module.exports.officers.officer_empty).toMatchObject({
      languages: [],
      skills: [],
      portraitId: null,
      recruitment: { cityIds: [], requiredOfficerIds: [], requirementId: null, note: null },
    })
    expect(context.module.exports.officers.officer_empty).not.toHaveProperty('maintenanceNote')
  })
})
