import { describe, expect, it } from 'vitest'
import {
  canTransitionErrorReport,
  validateOfficerErrorReportDraft,
} from '../../miniprogram/domain/officer-error-report'
import type { OfficerErrorReportDraft } from '../../miniprogram/contracts/officer-error-report'

const validDraft = (): OfficerErrorReportDraft => ({
  officerId: 'officer_chast089',
  errorTypes: ['skill'],
  description: '技能等級顯示錯誤',
  suggestedCorrection: '應顯示 Lv.2',
  sourceUrl: '',
  screenshotFileIds: [],
  supplement: '',
})

describe('航海士錯誤回報校驗', () => {
  it('允許來源網址與截圖同時留空', () => {
    expect(validateOfficerErrorReportDraft(validDraft())).toEqual([])
  })

  it.each([
    ['officerId', { officerId: '' }, '請選擇航海士'],
    ['errorTypes', { errorTypes: [] }, '請至少選擇一種錯誤類型'],
    ['description', { description: '  ' }, '請填寫錯誤說明'],
    ['suggestedCorrection', { suggestedCorrection: '' }, '請填寫建議的正確內容'],
  ] as const)('拒絕缺少 %s', (field, patch, message) => {
    expect(validateOfficerErrorReportDraft({ ...validDraft(), ...patch })).toContainEqual({
      field,
      message,
    })
  })

  it('拒絕未知錯誤類型、無效網址及超過三張截圖', () => {
    const errors = validateOfficerErrorReportDraft({
      ...validDraft(),
      errorTypes: ['skill', 'unknown' as 'skill'],
      sourceUrl: 'not-a-url',
      screenshotFileIds: ['a', 'b', 'c', 'd'],
    })

    expect(errors.map((error) => error.field)).toEqual([
      'errorTypes',
      'sourceUrl',
      'screenshotFileIds',
    ])
  })
})

describe('航海士錯誤回報狀態轉移', () => {
  it('允許管理員確認、要求補充、拒絕與標記已修正', () => {
    expect(canTransitionErrorReport('pending', 'accept', 'admin')).toBe(true)
    expect(canTransitionErrorReport('pending', 'requestInfo', 'admin')).toBe(true)
    expect(canTransitionErrorReport('pending', 'reject', 'admin')).toBe(true)
    expect(canTransitionErrorReport('accepted', 'markFixed', 'admin')).toBe(true)
  })

  it('只允許擁有者從要求補充返回待確認', () => {
    expect(canTransitionErrorReport('needsInfo', 'supplement', 'owner')).toBe(true)
    expect(canTransitionErrorReport('needsInfo', 'supplement', 'admin')).toBe(false)
  })

  it.each(['fixed', 'rejected'] as const)('終態 %s 不允許再轉移', (status) => {
    expect(canTransitionErrorReport(status, 'supplement', 'owner')).toBe(false)
    expect(canTransitionErrorReport(status, 'requestInfo', 'admin')).toBe(false)
  })
})
