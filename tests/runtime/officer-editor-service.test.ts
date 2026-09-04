import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  OfficerSubmissionReviewFields,
  SubmissionFormData,
} from '../../miniprogram/contracts/officer-submission'
import {
  createOfficerSubmissionService,
  OfficerSubmissionError,
} from '../../miniprogram/runtime/officer-editor-service'

const mockCallFunction = vi.fn()

vi.stubGlobal('wx', {
  cloud: {
    callFunction: mockCallFunction,
  },
})

const formData: SubmissionFormData = {
  name: '測試航海士',
  rarityId: 'rarity_5',
  typeId: 'type_class_1',
  genderId: 'gender_f',
  jobId: 'job_jobchasT089',
  nationalityId: 'nationality_ctn_swe',
  languages: [{ languageId: 'language_lang70', level: 5 }],
  skills: [{ skillId: 'skill_skill200681', unlockLevel: 1, level: 10 }],
  recruitment: { cityIds: [], requirementId: null, requiredOfficerIds: [] },
  portraitFileId: '',
}

const reviewFields: OfficerSubmissionReviewFields = {
  visualGradeId: 'grade_5',
  skills: [{ skillId: 'skill_skill200681', kind: 'passive', sourceGroup: 'sk0', slot: 0 }],
}

describe('OfficerSubmissionService adapter contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('提交时只发送投稿表单、头像与格式信息', async () => {
    mockCallFunction.mockResolvedValue({
      result: {
        ok: true,
        data: {
          submissionId: 'sub_1',
          revision: 1,
          status: 'pending',
          createdAt: '2026-09-04T00:00:00.000Z',
          updatedAt: '2026-09-04T00:00:00.000Z',
          message: '投稿已提交，等待審核',
        },
      },
    })

    await createOfficerSubmissionService().submit(formData, 'base64-data', {
      mimeType: 'image/png',
      byteSize: 128,
      width: 256,
      height: 256,
    })

    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'officer-custom',
      data: {
        action: 'submit',
        formData,
        portraitBase64: 'base64-data',
        portraitMimeType: 'image/png',
        portraitMeta: { byteSize: 128, width: 256, height: 256 },
      },
    })
    const payload = mockCallFunction.mock.calls[0]![0].data as Record<string, unknown>
    expect(payload).not.toHaveProperty('ownerUid')
    expect(payload).not.toHaveProperty('isAdmin')
  })

  it('驳回重提未更换头像时保留原头像，不发送空文件', async () => {
    mockCallFunction.mockResolvedValue({
      result: {
        ok: true,
        data: {
          submissionId: 'sub_1',
          revision: 2,
          status: 'pending',
        },
      },
    })

    await createOfficerSubmissionService().resubmit('sub_1', 1, formData)

    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'officer-custom',
      data: {
        action: 'resubmit',
        submissionId: 'sub_1',
        expectedRevision: 1,
        formData,
      },
    })
  })

  it('支援我的投稿、管理员权限与审核写操作', async () => {
    mockCallFunction.mockResolvedValue({ result: { ok: true, data: [] } })
    await createOfficerSubmissionService().listMine()
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'officer-custom',
      data: { action: 'listMine' },
    })

    mockCallFunction.mockResolvedValue({ result: { ok: true, data: { isAdmin: true } } })
    await expect(createOfficerSubmissionService().getAdminStatus()).resolves.toEqual({
      isAdmin: true,
    })

    mockCallFunction.mockResolvedValue({ result: { ok: true, data: { status: 'pending' } } })
    await createOfficerSubmissionService().saveAdmin({
      submissionId: 'sub_1',
      revision: 1,
      updatedAt: '2026-09-04T00:00:00.000Z',
      formData,
      reviewFields,
    })
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'officer-custom',
      data: {
        action: 'saveAdmin',
        submissionId: 'sub_1',
        revision: 1,
        updatedAt: '2026-09-04T00:00:00.000Z',
        formData,
        reviewFields,
      },
    })
  })

  it('将 CloudBase 错误映射成稳定的投稿错误', async () => {
    mockCallFunction.mockResolvedValue({
      result: { ok: false, code: 'forbidden', message: '只有小程序管理員可以執行此操作' },
    })
    await expect(createOfficerSubmissionService().getAdminStatus()).rejects.toMatchObject({
      code: 'forbidden',
    })
    await expect(createOfficerSubmissionService().getAdminStatus()).rejects.toBeInstanceOf(
      OfficerSubmissionError,
    )

    mockCallFunction.mockRejectedValue(new Error('network down'))
    await expect(createOfficerSubmissionService().listMine()).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('读取正式自定义航海士时使用 published 列表 action', async () => {
    mockCallFunction.mockResolvedValue({ result: { ok: true, data: [] } })
    await createOfficerSubmissionService().listPublishedCustomOfficers()
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'officer-custom',
      data: { action: 'listCustom' },
    })
  })
})
