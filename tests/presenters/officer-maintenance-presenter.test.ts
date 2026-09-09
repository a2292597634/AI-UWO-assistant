import { describe, expect, it } from 'vitest'
import type {
  MaintenanceOfficerData,
  ReferenceCandidate,
} from '../../miniprogram/contracts/officer-maintenance'
import {
  buildMaintenanceDiff,
  mergeMaintenanceCandidate,
} from '../../miniprogram/presenters/officer-maintenance-presenter'

const base: MaintenanceOfficerData = {
  name: '航海士',
  rarityId: 's',
  visualGradeId: 'grade_5',
  typeId: 'adventure',
  genderId: 'male',
  jobId: 'job_a',
  nationalityId: 'nation',
  languages: [],
  skills: [],
  recruitment: { cityIds: [], requirementId: null, requiredOfficerIds: [], note: null },
  portraitId: null,
  displayOrder: 1,
}
describe('維護審核展示', () => {
  it('顯示欄位名稱與前後值，新增時列出全部資料', () => {
    expect(buildMaintenanceDiff(base, { ...base, jobId: 'job_b' })).toEqual([
      expect.objectContaining({ field: 'jobId', label: '職業', before: 'job_a', after: 'job_b' }),
    ])
    expect(buildMaintenanceDiff(null, base)).toContainEqual(
      expect.objectContaining({ field: 'name', beforeText: '未設定', afterText: '航海士' }),
    )
    expect(buildMaintenanceDiff(base, base)).toEqual([])
  })
  it.each(['job', 'nationality', 'language', 'skill'] as const)(
    '合併 %s 候選項只更新相應關聯並移除該候選',
    (kind) => {
      const candidates: ReferenceCandidate[] = [
        { key: 'candidate', kind, name: '候選', aliases: [] },
        { key: 'other', kind: 'job', name: '另一個', aliases: [] },
      ]
      const result = mergeMaintenanceCandidate(base, candidates, 'candidate', 'existing')
      expect(result.referenceCandidates.map((item) => item.key)).toEqual(['other'])
      if (kind === 'job') expect(result.reviewedData.jobId).toBe('existing')
      if (kind === 'nationality') expect(result.reviewedData.nationalityId).toBe('existing')
      if (kind === 'language')
        expect(result.reviewedData.languages).toEqual([{ languageId: 'existing', level: 1 }])
      if (kind === 'skill')
        expect(result.reviewedData.skills).toEqual([
          {
            skillId: 'existing',
            kind: 'passive',
            sourceGroup: 'sk0',
            slot: 0,
            level: 1,
            unlockLevel: 1,
          },
        ])
      expect(candidates).toHaveLength(2)
      expect(base.jobId).toBe('job_a')
    },
  )
  it('合併到已關聯技能時保留槽位與等級，不增加重複關聯', () => {
    const data = {
      ...base,
      skills: [
        {
          skillId: 'existing',
          kind: 'active' as const,
          sourceGroup: 'sk2' as const,
          slot: 4,
          level: 3,
          unlockLevel: 5,
        },
      ],
    }
    expect(
      mergeMaintenanceCandidate(
        data,
        [{ key: 'c', kind: 'skill', name: '砲擊', aliases: [] }],
        'c',
        'existing',
      ).reviewedData.skills,
    ).toEqual(data.skills)
  })
})
