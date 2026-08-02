import { describe, expect, it } from 'vitest'
import { migrateVisualGrades } from '../../tools/import/migrate-visual-grades'
import type { CanonicalOfficer, SourceOfficer } from '../../tools/import/types'
import { deriveVisualGradeId } from '../../tools/import/visual-grade'

type PreVisualGradeOfficer = Omit<CanonicalOfficer, 'visualGradeId'>

const makeOfficer = (id: string, sourceId: string): PreVisualGradeOfficer => ({
  id,
  name: id,
  rarityId: 'rarity_5',
  typeId: 'type_class_1',
  genderId: 'gender_f',
  jobId: 'job_test',
  nationalityId: 'nationality_unknown',
  languages: [],
  skills: [],
  recruitment: {
    cityIds: [],
    requirementId: null,
    requiredOfficerIds: [],
    note: null,
  },
  portraitId: null,
  displayOrder: 1,
  sourceRefs: { voyageTw: sourceId },
})

const makeSourceOfficer = (rank: string, boss?: number): SourceOfficer => ({
  rank,
  type: 'class_1',
  job: 'job_test',
  country: '',
  gender: 'f',
  lang: {},
  skill: {},
  city: [],
  req: '',
  boss,
})

describe('deriveVisualGradeId', () => {
  it('derives a grade from a supported source rank', () => {
    expect(deriveVisualGradeId({ rank: '2' })).toBe('grade_2')
    expect(deriveVisualGradeId({ rank: '5' })).toBe('grade_5')
  })

  it('uses grade 6 for boss officers regardless of source rank', () => {
    expect(deriveVisualGradeId({ rank: '5', boss: 1 })).toBe('grade_6')
  })

  it('rejects unsupported source ranks', () => {
    expect(() => deriveVisualGradeId({ rank: '99' })).toThrow('VISUAL_GRADE_UNSUPPORTED')
  })
})

describe('migrateVisualGrades', () => {
  it('adds visual grades from referenced sources without changing order or other fields', () => {
    const canonical = [
      makeOfficer('officer_boss', 'sourceBoss'),
      makeOfficer('officer_normal', 'sourceNormal'),
    ]
    const source = {
      sourceBoss: makeSourceOfficer('5', 1),
      sourceNormal: makeSourceOfficer('3'),
    }

    expect(migrateVisualGrades(canonical, source)).toEqual([
      { ...canonical[0], visualGradeId: 'grade_6' },
      { ...canonical[1], visualGradeId: 'grade_3' },
    ])
  })

  it('rejects an officer whose referenced source is missing', () => {
    expect(() => migrateVisualGrades([makeOfficer('officer_missing', 'missing')], {})).toThrow(
      'VISUAL_GRADE_SOURCE_MISSING',
    )
  })
})
