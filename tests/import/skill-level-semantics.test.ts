import { describe, expect, it } from 'vitest'
import {
  migrateSkillLevelSemantics,
  migrateSkillLevelSemanticsText,
} from '../../tools/import/migrate-skill-level-semantics'
import type { CanonicalOfficer, SourceOfficer } from '../../tools/import/types'

const makeOfficer = (
  sourceRefs: CanonicalOfficer['sourceRefs'],
  skills: CanonicalOfficer['skills'] = [],
): CanonicalOfficer => ({
  id: 'officer_test',
  name: '測試航海士',
  rarityId: 'rarity_5',
  visualGradeId: 'grade_5',
  typeId: 'type_class_1',
  genderId: 'gender_f',
  jobId: 'job_test',
  nationalityId: 'nationality_unknown',
  languages: [],
  skills,
  recruitment: {
    cityIds: [],
    requirementId: null,
    requiredOfficerIds: [],
    note: null,
  },
  portraitId: null,
  displayOrder: 1,
  sourceRefs,
})

const makeSourceOfficer = (): SourceOfficer => ({
  rank: '5',
  type: 'class_1',
  job: 'job_test',
  country: '',
  gender: 'f',
  lang: {},
  skill: {
    sk0: { skill203426: '70' },
    sk2: { skill400581: '50' },
  },
  slv: { skill203426: '2', skill400581: 2 },
  city: [],
  req: '',
})

describe('migrateSkillLevelSemantics', () => {
  it('maps nested skill values to unlockLevel and slv values to level', () => {
    const canonical = [
      makeOfficer({ voyageTw: 'source_test' }, [
        {
          skillId: 'skill_skill203426',
          kind: 'passive',
          sourceGroup: 'sk0',
          slot: 0,
          unlockLevel: 2,
          level: 70,
        },
        {
          skillId: 'skill_skill400581',
          kind: 'active',
          sourceGroup: 'sk2',
          slot: 0,
          unlockLevel: 2,
          level: 50,
        },
      ]),
    ]

    expect(
      migrateSkillLevelSemantics(canonical, { source_test: makeSourceOfficer() })[0]!.skills,
    ).toEqual([
      {
        skillId: 'skill_skill203426',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 0,
        unlockLevel: 70,
        level: 2,
      },
      {
        skillId: 'skill_skill400581',
        kind: 'active',
        sourceGroup: 'sk2',
        slot: 0,
        unlockLevel: 50,
        level: 2,
      },
    ])
  })

  it('leaves maintenance records unchanged and is idempotent', () => {
    const canonical = [
      makeOfficer({ workOrderId: 'work-order-test' }, [
        {
          skillId: 'skill_skill400581',
          kind: 'active',
          sourceGroup: 'sk2',
          slot: 0,
          unlockLevel: 50,
          level: 2,
        },
      ]),
    ]

    const migrated = migrateSkillLevelSemantics(canonical, {})
    expect(migrated).toEqual(canonical)
    expect(migrateSkillLevelSemantics(migrated, {})).toEqual(migrated)
  })

  it('rejects a missing voyage.tw source record', () => {
    expect(() => migrateSkillLevelSemantics([makeOfficer({ voyageTw: 'missing' })], {})).toThrow(
      'SKILL_LEVEL_SOURCE_MISSING',
    )
  })

  it('只替換 voyage.tw 技能關係，不會誤改欄位順序相同的手動記錄', () => {
    const sourceOfficer = makeOfficer({ voyageTw: 'source_test' }, [
      {
        skillId: 'skill_skill203426',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 0,
        unlockLevel: 2,
        level: 70,
      },
    ])
    const manualOfficer = makeOfficer({ workOrderId: 'work-order-test' }, [
      {
        skillId: 'skill_skill203426',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 0,
        unlockLevel: 50,
        level: 2,
      },
    ])
    const migrated = JSON.parse(
      migrateSkillLevelSemanticsText(JSON.stringify([sourceOfficer, manualOfficer], null, 2), {
        source_test: makeSourceOfficer(),
      }),
    ) as CanonicalOfficer[]

    expect(migrated[0]!.skills[0]).toMatchObject({ unlockLevel: 70, level: 2 })
    expect(migrated[1]!.skills[0]).toMatchObject({ unlockLevel: 50, level: 2 })
  })
})
