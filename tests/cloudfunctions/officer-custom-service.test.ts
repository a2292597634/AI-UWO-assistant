import { beforeEach, describe, expect, it } from 'vitest'

interface ServiceResultData {
  submissionId: string
  revision: number
  updatedAt: string
  status: string
  review: { reviewerUid: string | null; [key: string]: unknown }
  history: Array<Record<string, unknown>>
  [key: string]: unknown
}

interface ServiceResult {
  ok: boolean
  code?: string
  message?: string
  data: ServiceResultData
}

/* eslint-disable @typescript-eslint/no-require-imports */
const serviceModule = require('../../cloudfunctions/officer-custom/officer-custom-service') as {
  createOfficerCustomService: (
    repo: ReturnType<typeof createMemoryRepo>,
    cloud: ReturnType<typeof createFakeCloud>,
    options: {
      adminOpenIds: Set<string>
      syncToken: string
      referenceData: ReferenceData
    },
  ) => {
    dispatch: (
      action: string,
      payload: Record<string, unknown>,
      ownerUid: string,
    ) => Promise<ServiceResult>
  }
}
/* eslint-enable @typescript-eslint/no-require-imports */

interface ReferenceData {
  rarityIds: string[]
  typeIds: string[]
  genderIds: string[]
  jobIds: string[]
  nationalityIds: string[]
  languageIds: string[]
  cityIds: string[]
  requirementIds: string[]
  skillIds: string[]
  officerIds: string[]
}

interface StoredRecord {
  _id: string
  submissionId: string
  ownerUid: string
  status: string
  revision: number
  updatedAt: string
  formData: Record<string, unknown>
  canonicalData: Record<string, unknown> | null
  review: Record<string, unknown>
  publish: Record<string, unknown>
  history: unknown[]
  [key: string]: unknown
}

function createMemoryRepo() {
  const records: StoredRecord[] = []
  let nextId = 1

  const latestBySubmission = (ownerUid?: string): StoredRecord[] => {
    const latest = new Map<string, StoredRecord>()
    for (const record of records) {
      if (ownerUid !== undefined && record.ownerUid !== ownerUid) continue
      const current = latest.get(record.submissionId)
      if (!current || current.revision < record.revision) latest.set(record.submissionId, record)
    }
    return [...latest.values()]
  }

  return {
    records,
    async insert(record: Omit<StoredRecord, '_id'>) {
      const saved = { ...record, _id: `doc_${nextId++}` } as unknown as StoredRecord
      records.push(saved)
      return saved
    },
    async insertRevisionIfAbsent(record: Omit<StoredRecord, '_id'>) {
      if (
        records.some(
          (item) => item.submissionId === record.submissionId && item.revision === record.revision,
        )
      ) {
        return null
      }
      const saved = { ...record, _id: `doc_${nextId++}` } as unknown as StoredRecord
      records.push(saved)
      return saved
    },
    async listByOwner(ownerUid: string) {
      return latestBySubmission(ownerUid)
    },
    async listLatestByStatus(status: string) {
      return latestBySubmission().filter((record) => record.status === status)
    },
    async findBySubmissionIdAndRevision(submissionId: string, revision: number) {
      return (
        records.find(
          (record) => record.submissionId === submissionId && record.revision === revision,
        ) ?? null
      )
    },
    async findLatestBySubmissionId(submissionId: string) {
      return latestBySubmission().find((record) => record.submissionId === submissionId) ?? null
    },
    async countLatestByOwner(ownerUid: string) {
      return latestBySubmission(ownerUid).length
    },
    async updateIfRevision(
      submissionId: string,
      revision: number,
      updatedAt: string,
      patch: Record<string, unknown>,
    ) {
      const record = records.find(
        (item) =>
          item.submissionId === submissionId &&
          item.revision === revision &&
          item.updatedAt === updatedAt,
      )
      if (!record) return null
      Object.assign(record, patch)
      return record
    },
  }
}

function createFakeCloud() {
  const uploads: Array<{ cloudPath: string; fileContent: Buffer }> = []
  return {
    uploads,
    async uploadFile(input: { cloudPath: string; fileContent: Buffer }) {
      uploads.push(input)
      return { fileID: `cloud://${input.cloudPath}` }
    },
    async getTempFileURL(input: { fileList: string[] }) {
      return {
        fileList: input.fileList.map((fileID) => ({
          fileID,
          tempFileURL: `https://example.test/${fileID}`,
        })),
      }
    },
  }
}

const referenceData: ReferenceData = {
  rarityIds: ['rarity_5'],
  typeIds: ['type_class_1'],
  genderIds: ['gender_f'],
  jobIds: ['job_jobchasT089'],
  nationalityIds: ['nationality_ctn_swe'],
  languageIds: ['lang70'],
  cityIds: ['city_1'],
  requirementIds: ['requirement_1'],
  skillIds: ['skill_skill200681'],
  officerIds: ['officer_chast089'],
}

const validFormData = (): Record<string, unknown> => ({
  name: '測試航海士',
  rarityId: 'rarity_5',
  typeId: 'type_class_1',
  genderId: 'gender_f',
  jobId: 'job_jobchasT089',
  nationalityId: 'nationality_ctn_swe',
  languages: [{ languageId: 'lang70', level: 1 }],
  skills: [{ skillId: 'skill_skill200681', unlockLevel: 1, level: 1 }],
  recruitment: { cityIds: [], requirementId: null, requiredOfficerIds: [] },
  portraitFileId: '',
})

const validPortraitBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

const validPayload = () => ({
  formData: validFormData(),
  portraitBase64: validPortraitBase64,
  portraitMimeType: 'image/png',
})

describe('Officer custom submission service', () => {
  let repo: ReturnType<typeof createMemoryRepo>
  let cloud: ReturnType<typeof createFakeCloud>
  let service: ReturnType<typeof serviceModule.createOfficerCustomService>

  beforeEach(() => {
    repo = createMemoryRepo()
    cloud = createFakeCloud()
    service = serviceModule.createOfficerCustomService(repo, cloud, {
      adminOpenIds: new Set(['openid_admin']),
      syncToken: 'sync-secret',
      referenceData,
    })
  })

  const dispatchSubmit = (payload = validPayload(), ownerUid = 'openid_user') =>
    service.dispatch('submit', payload, ownerUid)

  it('非管理员不能列出或修改全部投稿', async () => {
    await expect(
      service.dispatch('listAdmin', { status: 'pending' }, 'openid_user'),
    ).resolves.toMatchObject({
      ok: false,
      code: 'forbidden',
    })
    await expect(
      service.dispatch('approve', { submissionId: 'sub_1', revision: 1 }, 'openid_user'),
    ).resolves.toMatchObject({
      ok: false,
      code: 'forbidden',
    })
  })

  it('管理员只能由服务端白名单身份通过', async () => {
    await expect(service.dispatch('getAdminStatus', {}, 'openid_admin')).resolves.toMatchObject({
      ok: true,
      data: { isAdmin: true },
    })
    await expect(
      service.dispatch('getAdminStatus', { isAdmin: true }, 'openid_user'),
    ).resolves.toMatchObject({
      ok: true,
      data: { isAdmin: false },
    })
  })

  it('投稿成功只产生 pending，不能被 approved 列表读取', async () => {
    await expect(dispatchSubmit()).resolves.toMatchObject({
      ok: true,
      data: { status: 'pending', revision: 1 },
    })
    await expect(
      service.dispatch('listApprovedForSync', { syncToken: 'sync-secret' }, ''),
    ).resolves.toMatchObject({
      ok: true,
      data: [],
    })
  })

  it('头像签名不合格时拒绝并不创建投稿', async () => {
    await expect(
      dispatchSubmit({
        ...validPayload(),
        portraitBase64: Buffer.from('not-an-image').toString('base64'),
      }),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-portrait' })
    expect(repo.records).toHaveLength(0)
  })

  it('招募条件缺省或类型异常时都不会触发服务端异常', async () => {
    const withoutRequirement = validFormData()
    withoutRequirement.recruitment = { cityIds: [], requiredOfficerIds: [] }
    await expect(
      dispatchSubmit({ ...validPayload(), formData: withoutRequirement }),
    ).resolves.toMatchObject({ ok: true })

    const invalidRequirement = validFormData()
    invalidRequirement.recruitment = {
      cityIds: [],
      requirementId: 123,
      requiredOfficerIds: [],
    }
    await expect(
      dispatchSubmit({ ...validPayload(), formData: invalidRequirement }),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-data' })
  })

  it('駁回必须有原因，重新提交沿用 submissionId 并递增 revision', async () => {
    const first = await dispatchSubmit()
    expect(first.ok).toBe(true)
    const { submissionId, updatedAt } = first.data
    const originalCreatedAt = first.data.createdAt

    await expect(
      service.dispatch('reject', { submissionId, revision: 1, rejectReason: '' }, 'openid_admin'),
    ).resolves.toMatchObject({ ok: false, code: 'reject-reason-required' })
    const rejected = await service.dispatch(
      'reject',
      { submissionId, revision: 1, updatedAt, rejectReason: '請補正頭像' },
      'openid_admin',
    )
    expect(rejected).toMatchObject({ ok: true, data: { status: 'rejected' } })

    const second = await service.dispatch(
      'resubmit',
      { submissionId, expectedRevision: 1, ...validPayload() },
      'openid_user',
    )
    expect(second).toMatchObject({
      ok: true,
      data: { submissionId, revision: 2, status: 'pending' },
    })
    expect(second.data.createdAt).toBe(originalCreatedAt)
    expect(repo.records[1]!.history.map((entry) => (entry as { action: string }).action)).toEqual([
      'submitted',
      'rejected',
      'resubmitted',
    ])
  })

  it('並發重提只建立一個新 revision，且每次頭像上傳使用獨立路徑', async () => {
    const first = await dispatchSubmit()
    const { submissionId, updatedAt } = first.data
    await service.dispatch(
      'reject',
      { submissionId, revision: 1, updatedAt, rejectReason: '請補正資料' },
      'openid_admin',
    )

    const [firstRetry, secondRetry] = await Promise.all([
      service.dispatch(
        'resubmit',
        { submissionId, expectedRevision: 1, ...validPayload() },
        'openid_user',
      ),
      service.dispatch(
        'resubmit',
        { submissionId, expectedRevision: 1, ...validPayload() },
        'openid_user',
      ),
    ])

    expect([firstRetry, secondRetry].filter((result) => result.ok)).toHaveLength(1)
    expect([firstRetry, secondRetry].find((result) => !result.ok)).toMatchObject({
      code: 'conflict',
    })
    const retryPaths = cloud.uploads.slice(1).map((upload) => upload.cloudPath)
    expect(new Set(retryPaths)).toHaveLength(2)
  })

  it('返回投稿详情时不泄露 owner 或审核者 OPENID', async () => {
    const first = await dispatchSubmit()
    const loaded = await service.dispatch(
      'loadMine',
      { submissionId: first.data.submissionId, revision: 1 },
      'openid_user',
    )
    expect(loaded).toMatchObject({ ok: true })
    expect(loaded.data).not.toHaveProperty('ownerUid')
    expect(loaded.data.review.reviewerUid).toBeNull()
    expect(loaded.data.history[0]).not.toHaveProperty('actorUid')
    expect(loaded.data.history[0].actorRole).toBe('owner')
  })

  it('管理员通过时生成服务端 officer ID 和 submission 来源', async () => {
    const first = await dispatchSubmit()
    const { submissionId, updatedAt } = first.data
    const reviewFields = {
      visualGradeId: 'grade_5',
      skills: [{ skillId: 'skill_skill200681', kind: 'passive', sourceGroup: 'sk0', slot: 0 }],
    }
    await expect(
      service.dispatch(
        'saveAdmin',
        { submissionId, revision: 1, updatedAt, formData: validFormData(), reviewFields },
        'openid_admin',
      ),
    ).resolves.toMatchObject({ ok: true, data: { status: 'pending' } })

    const saved = repo.records[0]!
    await expect(
      service.dispatch(
        'approve',
        { submissionId, revision: 1, updatedAt: saved.updatedAt },
        'openid_admin',
      ),
    ).resolves.toMatchObject({ ok: true, data: { status: 'approved' } })
    expect(repo.records[0]!.canonicalData).toMatchObject({
      id: `officer_custom_${submissionId}`,
      sourceRefs: { submissionId },
    })
  })

  it('同步 token 只能读取 approved，并可在发布后标记 published', async () => {
    const first = await dispatchSubmit()
    const saved = repo.records[0]!
    await service.dispatch(
      'saveAdmin',
      {
        submissionId: first.data.submissionId,
        revision: 1,
        updatedAt: saved.updatedAt,
        formData: validFormData(),
        reviewFields: {
          visualGradeId: 'grade_5',
          skills: [{ skillId: 'skill_skill200681', kind: 'passive', sourceGroup: 'sk0', slot: 0 }],
        },
      },
      'openid_admin',
    )
    const pending = repo.records[0]!
    await service.dispatch(
      'approve',
      { submissionId: first.data.submissionId, revision: 1, updatedAt: pending.updatedAt },
      'openid_admin',
    )

    await expect(
      service.dispatch('listApprovedForSync', { syncToken: 'wrong' }, ''),
    ).resolves.toMatchObject({
      ok: false,
      code: 'forbidden',
    })
    await expect(
      service.dispatch('listApprovedForSync', { syncToken: 'sync-secret' }, ''),
    ).resolves.toMatchObject({
      ok: true,
      data: [expect.objectContaining({ status: 'approved' })],
    })
  })
})
