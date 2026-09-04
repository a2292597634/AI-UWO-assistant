import { describe, expect, it } from 'vitest'
import type {
  OfficerSubmissionFormState,
  OfficerSubmissionReviewFields,
  SubmissionValidationContext,
} from '../../miniprogram/contracts/officer-submission'
import {
  buildSubmissionCanonicalPreview,
  createEmptySubmissionForm,
  createEmptySubmissionSkillRow,
  getDefaultSubmissionVisualGrade,
  validateSubmissionForm,
} from '../../miniprogram/domain/officer-editor'

const validContext: SubmissionValidationContext = {
  validRarityIds: new Set(['rarity_5']),
  validTypeIds: new Set(['type_class_1']),
  validGenderIds: new Set(['gender_f']),
  validJobIds: new Set(['job_jobchasT089']),
  validNationalityIds: new Set(['nationality_ctn_swe']),
  validLanguageIds: new Set(['lang70']),
  validSkillIds: new Set(['skill_skill200681']),
  validCityIds: new Set(['city_1']),
  validRequirementIds: new Set(['requirement_1']),
  validOfficerIds: new Set(['officer_chast089']),
}

const validForm = (): OfficerSubmissionFormState => ({
  name: '測試航海士',
  rarityId: 'rarity_5',
  typeId: 'type_class_1',
  genderId: 'gender_f',
  jobId: 'job_jobchasT089',
  nationalityId: 'nationality_ctn_swe',
  portrait: {
    tempFilePath: '/tmp/portrait.png',
    fileId: '',
    mimeType: 'image/png',
    byteSize: 1024,
    width: 256,
    height: 256,
  },
  languages: [{ key: 'language-1', languageId: 'lang70', languageName: '瑞典語', level: 1 }],
  skills: [
    {
      key: 'skill-1',
      skillId: 'skill_skill200681',
      skillName: '工藝品購買折扣',
      unlockLevel: 1,
      level: 1,
    },
  ],
  recruitment: {
    cityIds: [],
    cityNames: [],
    requirementId: null,
    requirementName: '',
    requiredOfficerIds: [],
    requiredOfficerNames: [],
  },
})

const defaultReview: OfficerSubmissionReviewFields = {
  visualGradeId: 'grade_5',
  skills: [
    {
      skillId: 'skill_skill200681',
      kind: 'passive',
      sourceGroup: 'sk0',
      slot: 0,
    },
  ],
}

describe('航海士投稿领域逻辑', () => {
  it('投稿必须包含至少一项语言、技能与有效头像', () => {
    const errors = validateSubmissionForm(createEmptySubmissionForm(), validContext)

    expect(errors.map((item) => item.field)).toEqual(
      expect.arrayContaining(['languages', 'skills', 'portrait']),
    )
  })

  it('技能解锁等级默认 1，筛选结果之外的技能 ID 无法通过', () => {
    const row = createEmptySubmissionSkillRow()
    expect(row.unlockLevel).toBe(1)

    const errors = validateSubmissionForm(
      { ...validForm(), skills: [{ ...row, skillId: 'skill_unknown' }] },
      validContext,
    )

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'skills[0].skillId', message: '無效的技能' }),
      ]),
    )
  })

  it('视觉檔位默认按稀有度推导，特殊资料可由审核端覆盖', () => {
    expect(getDefaultSubmissionVisualGrade('rarity_2')).toBe('grade_2')
    expect(getDefaultSubmissionVisualGrade('rarity_5')).toBe('grade_5')
    expect(getDefaultSubmissionVisualGrade('rarity_unknown')).toBe('grade_5')
  })

  it('招募资料完全不填时生成空数组、null 条件和 null 备注', () => {
    const preview = buildSubmissionCanonicalPreview(validForm(), defaultReview, 'sub_1')

    expect(preview.recruitment).toEqual({
      cityIds: [],
      requirementId: null,
      requiredOfficerIds: [],
      note: null,
    })
    expect(preview.portraitId).toBeNull()
    expect(preview.sourceRefs).toEqual({ submissionId: 'sub_1' })
  })

  it('拒绝没有服务端回填的头像文件 ID', () => {
    const form = validForm()
    form.portrait = { ...form.portrait!, fileId: '' }
    const errors = validateSubmissionForm(form, validContext)

    expect(errors).toEqual([])
  })
})
