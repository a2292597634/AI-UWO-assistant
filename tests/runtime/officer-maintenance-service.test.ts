import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createOfficerMaintenanceService,
  OfficerMaintenanceError,
} from '../../miniprogram/runtime/officer-maintenance-service'

const mockCallFunction = vi.fn()

vi.stubGlobal('wx', {
  cloud: {
    callFunction: mockCallFunction,
  },
})

const draftInput = {
  operation: 'createOfficer' as const,
  targetOfficerId: null,
  baseDataVersion: null,
  baseSnapshot: null,
  proposedData: {
    name: '測試航海士',
    rarityId: 'rarity_5',
    visualGradeId: 'grade_5' as const,
    typeId: 'type_class_1',
    genderId: 'gender_f',
    jobId: 'job_admiral',
    nationalityId: 'nationality_portugal',
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
  },
  referenceCandidates: [],
  idempotencyKey: 'runtime-save-1',
}

const versionInput = {
  workOrderId: 'wo_1',
  revision: 3,
  updatedAt: '2026-09-08T00:00:00.000Z',
}

const maintenanceAppConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../../miniprogram/app.json'), 'utf8'),
) as {
  subpackages: Array<{ root: string; pages: string[] }>
}

describe('OfficerMaintenanceService 工單雲函數適配器', () => {
  it('管理員列表及駁回保留狀態、版本與原因', async () => {
    mockCallFunction.mockResolvedValueOnce({ result: { ok: true, data: [] } })
    await expect(createOfficerMaintenanceService().listAdmin('pendingReview')).resolves.toEqual([])
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'officer-maintenance',
      data: { action: 'listAdmin', status: 'pendingReview' },
    })
    mockCallFunction.mockResolvedValueOnce({
      result: { ok: true, data: { ...versionInput, status: 'rejected' } },
    })
    await expect(
      createOfficerMaintenanceService().reject({ ...versionInput, reason: '資料不符' }),
    ).resolves.toMatchObject({ status: 'rejected' })
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'officer-maintenance',
      data: { action: 'reject', ...versionInput, reason: '資料不符' },
    })
  })
  it('以本人工單 action 載入列表及指定草稿', async () => {
    mockCallFunction.mockResolvedValueOnce({ result: { ok: true, data: [] } })
    await expect(createOfficerMaintenanceService().listMine()).resolves.toEqual([])
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'officer-maintenance',
      data: { action: 'listMine' },
    })
    mockCallFunction.mockResolvedValueOnce({
      result: { ok: true, data: { ...draftInput, ...versionInput, status: 'draft' } },
    })
    await expect(createOfficerMaintenanceService().loadMine('wo_1')).resolves.toMatchObject({
      workOrderId: 'wo_1',
    })
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'officer-maintenance',
      data: { action: 'loadMine', workOrderId: 'wo_1' },
    })
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('儲存草稿時只傳送維護資料與 saveDraft action', async () => {
    mockCallFunction.mockResolvedValue({
      result: {
        ok: true,
        data: { ...versionInput, status: 'draft' },
      },
    })

    await createOfficerMaintenanceService().saveDraft(draftInput)

    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'officer-maintenance',
      data: {
        action: 'saveDraft',
        ...draftInput,
      },
    })
  })

  it('儲存草稿時傳送裁切後頭像附件，不把頭像欄位混入正式資料', async () => {
    mockCallFunction.mockResolvedValue({
      result: {
        ok: true,
        data: { ...versionInput, status: 'draft', portraitFileId: 'cloud://portrait' },
      },
    })
    const portraitUpload = {
      base64: 'portrait-base64',
      meta: { mimeType: 'image/png' as const, byteSize: 128, width: 256, height: 256 },
    }

    await createOfficerMaintenanceService().saveDraft({ ...draftInput, portraitUpload })

    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'officer-maintenance',
      data: expect.objectContaining({ action: 'saveDraft', portraitUpload }),
    })
    expect(mockCallFunction.mock.calls[0]?.[0].data.portraitId).toBeUndefined()
  })

  it('只在所有維護頁面已建立後註冊維護子包', () => {
    const maintenancePackage = maintenanceAppConfig.subpackages.find(
      ({ root }) => root === 'subpkg-maintenance',
    )

    for (const page of maintenancePackage?.pages ?? []) {
      expect(
        existsSync(
          resolve(__dirname, `../../miniprogram/${maintenancePackage?.root}/${page}.json`),
        ),
      ).toBe(true)
    }
  })

  it('送審時回傳雲函數確認的待審核工單狀態', async () => {
    mockCallFunction.mockResolvedValue({
      result: {
        ok: true,
        data: { ...versionInput, status: 'pendingReview' },
      },
    })

    await expect(createOfficerMaintenanceService().submit(versionInput)).resolves.toMatchObject({
      status: 'pendingReview',
    })
    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'officer-maintenance',
      data: { action: 'submit', ...versionInput },
    })
  })

  it('儲存審核時回傳成功工單並完整傳送 saveReview payload', async () => {
    const reviewInput = {
      ...versionInput,
      reviewedData: draftInput.proposedData,
      referenceCandidates: [
        {
          key: 'candidate_skill_1',
          kind: 'skill' as const,
          name: '候選技能',
          aliases: ['測試技能'],
          categoryId: 'skill_category_navigation',
        },
      ],
      reason: '已補齊技能分類資料',
    }
    mockCallFunction.mockResolvedValue({
      result: {
        ok: true,
        data: {
          ...versionInput,
          status: 'pendingReview',
          reviewedData: draftInput.proposedData,
        },
      },
    })

    await expect(createOfficerMaintenanceService().saveReview(reviewInput)).resolves.toMatchObject({
      status: 'pendingReview',
      reviewedData: draftInput.proposedData,
    })
    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'officer-maintenance',
      data: { action: 'saveReview', ...reviewInput },
    })
  })

  it('核准工單時只傳送版本欄位與 approve action', async () => {
    mockCallFunction.mockResolvedValue({
      result: {
        ok: true,
        data: { ...versionInput, status: 'approvedPendingPublish' },
      },
    })

    await expect(createOfficerMaintenanceService().approve(versionInput)).resolves.toMatchObject({
      status: 'approvedPendingPublish',
    })
    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'officer-maintenance',
      data: { action: 'approve', ...versionInput },
    })
  })

  it('將雲函數的版本衝突轉譯為可處理的 typed error', async () => {
    mockCallFunction.mockResolvedValue({
      result: {
        ok: false,
        code: 'conflict',
        message: '工單已被更新，請重新載入',
      },
    })

    const error = await createOfficerMaintenanceService()
      .approve(versionInput)
      .catch((value: unknown) => value)

    expect(error).toBeInstanceOf(OfficerMaintenanceError)
    expect(error).toMatchObject({ code: 'conflict', message: '工單已被更新，請重新載入' })
  })

  it('保留正式資料基準版本衝突，讓頁面要求重新比對', async () => {
    mockCallFunction.mockResolvedValue({
      result: {
        ok: false,
        code: 'base-version-conflict',
        message: '正式資料版本已更新，請重新比對後保存審核',
      },
    })

    await expect(createOfficerMaintenanceService().approve(versionInput)).rejects.toMatchObject({
      code: 'base-version-conflict',
      message: '正式資料版本已更新，請重新比對後保存審核',
    })
  })

  it('不暴露 CloudBase 連線例外內容', async () => {
    mockCallFunction.mockRejectedValue(new Error('internal detail'))

    const error = await createOfficerMaintenanceService()
      .approve(versionInput)
      .catch((value: unknown) => value)

    expect(error).toBeInstanceOf(OfficerMaintenanceError)
    expect(error).toMatchObject({ code: 'network' })
    expect((error as Error).message).not.toContain('internal detail')
  })
})
