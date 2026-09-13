import { beforeEach, describe, expect, it, vi } from 'vitest'

/* eslint-disable @typescript-eslint/no-require-imports */
const serviceModule = require('../../cloudfunctions/officer-maintenance/service') as {
  createOfficerMaintenanceService: (
    repo: ReturnType<typeof createMemoryRepo>,
    options: {
      adminOpenIds: Set<string>
      syncToken: string
      referenceData: ReferenceData
      cloud?: Record<string, unknown>
      uploadPortrait?: (...args: unknown[]) => Promise<Record<string, unknown>>
    },
  ) => {
    dispatch: (
      action: string,
      payload: Record<string, unknown>,
      openid: string | null,
    ) => Promise<Result>
  }
}
/* eslint-enable @typescript-eslint/no-require-imports */

interface ReferenceData {
  dataVersion: string
  rarityIds: string[]
  typeIds: string[]
  genderIds: string[]
  jobIds: string[]
  nationalityIds: string[]
  languageIds: string[]
  cityIds: string[]
  requirementIds: string[]
  skillCategoryIds: string[]
  skillIds: string[]
  officerIds: string[]
}

interface StoredRecord {
  _id: string
  workOrderId: string
  ownerUid: string
  operation: string
  targetOfficerId: string | null
  baseDataVersion: string | null
  baseSnapshot: Record<string, unknown> | null
  proposedData: Record<string, unknown>
  reviewedData: Record<string, unknown> | null
  referenceCandidates: Array<Record<string, unknown>>
  status: string
  revision: number
  updatedAt: string
  history: Array<Record<string, unknown>>
  [key: string]: unknown
}

interface Result {
  ok: boolean
  code?: string
  data?: StoredRecord | StoredRecord[]
}

function createMemoryRepo() {
  const records: StoredRecord[] = []
  let nextId = 1
  return {
    records,
    async insert(record: Omit<StoredRecord, '_id'>) {
      const saved = { ...structuredClone(record), _id: `doc_${nextId++}` } as StoredRecord
      records.push(saved)
      return structuredClone(saved)
    },
    async insertIfAbsent(record: Omit<StoredRecord, '_id'>) {
      const existing = records.find(
        (item) =>
          item.ownerUid === record.ownerUid && item.idempotencyKey === record.idempotencyKey,
      )
      if (existing) return structuredClone(existing)
      await new Promise((resolve) => setTimeout(resolve, 0))
      const raced = records.find(
        (item) =>
          item.ownerUid === record.ownerUid && item.idempotencyKey === record.idempotencyKey,
      )
      if (raced) return structuredClone(raced)
      const saved = { ...structuredClone(record), _id: `doc_${nextId++}` } as StoredRecord
      records.push(saved)
      return structuredClone(saved)
    },
    async findByWorkOrderId(workOrderId: string) {
      const found = records.find((record) => record.workOrderId === workOrderId)
      return found ? structuredClone(found) : null
    },
    async findByOwnerAndIdempotencyKey(ownerUid: string, idempotencyKey: string) {
      const found = records.find(
        (record) => record.ownerUid === ownerUid && record.idempotencyKey === idempotencyKey,
      )
      return found ? structuredClone(found) : null
    },
    async listByOwner(ownerUid: string) {
      return records
        .filter((record) => record.ownerUid === ownerUid)
        .map((record) => structuredClone(record))
    },
    async listByStatus(status: string) {
      return records
        .filter((record) => record.status === status)
        .map((record) => structuredClone(record))
    },
    async updateIfCurrent(
      workOrderId: string,
      revision: number,
      updatedAt: string,
      patch: Record<string, unknown>,
    ) {
      const current = records.find(
        (record) =>
          record.workOrderId === workOrderId &&
          record.revision === revision &&
          record.updatedAt === updatedAt,
      )
      if (!current) return null
      Object.assign(current, structuredClone(patch), {
        revision: revision + 1,
        updatedAt: `2026-09-08T00:00:0${revision}.000Z`,
      })
      return structuredClone(current)
    },
  }
}

const referenceData: ReferenceData = {
  dataVersion: 'dataset-v1',
  rarityIds: ['rarity_5'],
  typeIds: ['type_adventure'],
  genderIds: ['gender_f'],
  jobIds: ['job_navigator'],
  nationalityIds: ['nationality_eng'],
  languageIds: ['lang_eng'],
  cityIds: ['city_london'],
  requirementIds: ['requirement_none'],
  skillCategoryIds: ['skill_category_navigation', 'skill_category_trade'],
  skillIds: ['skill_navigation', 'skill_navigation_2'],
  officerIds: ['officer_existing'],
}

const officerData = (name = '測試航海士'): Record<string, unknown> => ({
  name,
  rarityId: 'rarity_5',
  visualGradeId: 'grade_5',
  typeId: 'type_adventure',
  genderId: 'gender_f',
  jobId: 'job_navigator',
  nationalityId: 'nationality_eng',
  languages: [{ languageId: 'lang_eng', level: 1 }],
  skills: [
    {
      skillId: 'skill_navigation',
      kind: 'active',
      sourceGroup: 'sk2',
      slot: 0,
      unlockLevel: 1,
      level: 1,
    },
  ],
  recruitment: {
    cityIds: ['city_london'],
    requirementId: 'requirement_none',
    requiredOfficerIds: ['officer_existing'],
    note: null,
  },
  portraitId: null,
  displayOrder: 1,
})

const updateDraft = (overrides: Record<string, unknown> = {}) => ({
  operation: 'updateOfficer',
  targetOfficerId: 'officer_existing',
  baseDataVersion: 'dataset-v1',
  baseSnapshot: officerData('原始航海士'),
  proposedData: officerData(),
  referenceCandidates: [],
  idempotencyKey: 'update-save-1',
  ...overrides,
})

describe('航海士維護工單狀態機', () => {
  let repo: ReturnType<typeof createMemoryRepo>
  let service: ReturnType<typeof serviceModule.createOfficerMaintenanceService>

  beforeEach(() => {
    repo = createMemoryRepo()
    service = serviceModule.createOfficerMaintenanceService(repo, {
      adminOpenIds: new Set(['admin-user']),
      syncToken: 'sync-secret',
      referenceData,
    })
  })

  it('新增航海士未上傳頭像不可送審', async () => {
    const draft = await service.dispatch(
      'saveDraft',
      {
        operation: 'createOfficer',
        targetOfficerId: null,
        baseDataVersion: null,
        baseSnapshot: null,
        proposedData: officerData('新增航海士'),
        referenceCandidates: [],
        idempotencyKey: 'create-no-portrait',
      },
      'owner-user',
    )
    expect(draft.ok).toBe(true)
    if (!draft.ok || Array.isArray(draft.data) || !draft.data) return
    await expect(
      service.dispatch(
        'submit',
        {
          workOrderId: draft.data.workOrderId,
          revision: draft.data.revision,
          updatedAt: draft.data.updatedAt,
        },
        'owner-user',
      ),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-portrait' })
  })

  it.each([0, 10, 50])('服務端拒絕維護資料中的技能等級 %s', async (level) => {
    const proposedData = officerData()
    const skills = proposedData.skills as Array<{ level: number }>
    skills[0]!.level = level

    await expect(
      service.dispatch(
        'saveDraft',
        updateDraft({ proposedData, idempotencyKey: `invalid-skill-level-${level}` }),
        'owner-user',
      ),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-data' })
    expect(repo.records).toHaveLength(0)
  })

  it('新增航海士保存裁切後頭像並忽略客戶端偽造的 file ID', async () => {
    const uploadPortrait = vi.fn(async () => ({
      ok: true,
      fileID: 'cloud://uploaded-portrait',
      meta: { mimeType: 'image/png', byteSize: 128, width: 256, height: 256 },
    }))
    const uploadService = serviceModule.createOfficerMaintenanceService(repo, {
      adminOpenIds: new Set(['admin-user']),
      syncToken: 'sync-secret',
      referenceData,
      cloud: {},
      uploadPortrait,
    })
    const draft = await uploadService.dispatch(
      'saveDraft',
      {
        operation: 'createOfficer',
        targetOfficerId: null,
        baseDataVersion: null,
        baseSnapshot: null,
        proposedData: officerData('含頭像航海士'),
        referenceCandidates: [],
        idempotencyKey: 'create-with-portrait',
        portraitFileId: 'cloud://偽造檔案',
        portraitUpload: {
          base64: 'valid-base64',
          meta: { mimeType: 'image/png', byteSize: 128, width: 256, height: 256 },
        },
      },
      'owner-user',
    )
    expect(draft).toMatchObject({ ok: true, data: { portraitFileId: 'cloud://uploaded-portrait' } })
    expect(uploadPortrait).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ portraitUpload: expect.any(Object) }),
      expect.stringMatching(/^wo_/),
      1,
    )
  })

  async function createPendingWorkOrder(overrides: Record<string, unknown> = {}) {
    const draft = await service.dispatch('saveDraft', updateDraft(overrides), 'owner-user')
    if (!draft.ok || Array.isArray(draft.data) || !draft.data) throw new Error('建立草稿失敗')
    const submitted = await service.dispatch(
      'submit',
      {
        workOrderId: draft.data.workOrderId,
        revision: draft.data.revision,
        updatedAt: draft.data.updatedAt,
      },
      'owner-user',
    )
    if (!submitted.ok || Array.isArray(submitted.data) || !submitted.data)
      throw new Error('送審失敗')
    return submitted.data
  }

  it('不以來源組推斷主動／被動，允許真實分類造成的混合來源組關聯', async () => {
    const mixedSkills = [
      {
        skillId: 'skill_navigation_2',
        kind: 'active',
        sourceGroup: 'sk0',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_navigation',
        kind: 'passive',
        sourceGroup: 'sk2',
        slot: 1,
        unlockLevel: 1,
        level: 1,
      },
    ]
    const validMixed = await service.dispatch(
      'saveDraft',
      updateDraft({
        proposedData: {
          ...officerData('混合來源組'),
          skills: mixedSkills,
        },
      }),
      'owner-user',
    )
    expect(validMixed.ok).toBe(true)
  })

  function saved(result: Result): StoredRecord {
    expect(result.ok).toBe(true)
    if (!result.data || Array.isArray(result.data)) throw new Error('缺少工單資料')
    return result.data
  }

  it('新增工單以 owner 與同一幂等鍵重試時回傳原工單，不重複建立', async () => {
    const payload = {
      operation: 'createOfficer',
      targetOfficerId: null,
      baseDataVersion: null,
      baseSnapshot: null,
      proposedData: officerData('可重試新增航海士'),
      referenceCandidates: [],
      idempotencyKey: 'client-save-retry-1',
    }

    const first = saved(await service.dispatch('saveDraft', payload, 'owner-user'))
    const retry = saved(await service.dispatch('saveDraft', payload, 'owner-user'))

    expect(retry.workOrderId).toBe(first.workOrderId)
    expect(repo.records).toHaveLength(1)
    expect(repo.records[0]).toHaveProperty('idempotencyKey', 'client-save-retry-1')
    expect(first).not.toHaveProperty('idempotencyKey')

    const otherOwner = saved(await service.dispatch('saveDraft', payload, 'other-user'))
    expect(otherOwner.workOrderId).not.toBe(first.workOrderId)
    expect(repo.records).toHaveLength(2)
  })

  it('新增工單同時保存時仍只建立一筆幂等結果', async () => {
    const payload = {
      operation: 'createOfficer',
      targetOfficerId: null,
      baseDataVersion: null,
      baseSnapshot: null,
      proposedData: officerData('並發新增航海士'),
      referenceCandidates: [],
      idempotencyKey: 'concurrent-save-1',
    }
    const results = await Promise.all([
      service.dispatch('saveDraft', payload, 'owner-user'),
      service.dispatch('saveDraft', payload, 'owner-user'),
    ])

    expect(results[0]).toMatchObject({ ok: true })
    expect(results[1]).toMatchObject({ ok: true })
    expect(repo.records).toHaveLength(1)
    if (
      !results[0].ok ||
      !results[1].ok ||
      !results[0].data ||
      !results[1].data ||
      Array.isArray(results[0].data) ||
      Array.isArray(results[1].data)
    )
      return
    expect(results[0].data.workOrderId).toBe(results[1].data.workOrderId)
  })

  it('送審請求已在伺服器成功但客戶端重試時回傳原結果', async () => {
    const draftResult = await service.dispatch('saveDraft', updateDraft(), 'owner-user')
    expect(draftResult).toMatchObject({ ok: true })
    if (!draftResult.ok || !draftResult.data || Array.isArray(draftResult.data)) return
    const draft = draftResult.data
    const submitKey = 'submit-retry-1'
    const first = saved(
      await service.dispatch('submit', { ...draft, submitIdempotencyKey: submitKey }, 'owner-user'),
    )
    const retry = saved(
      await service.dispatch('submit', { ...draft, submitIdempotencyKey: submitKey }, 'owner-user'),
    )

    expect(first.status).toBe('pendingReview')
    expect(retry).toEqual(first)
    expect(repo.records).toHaveLength(1)
  })

  it('新增工單保存缺少幂等鍵時拒絕建立', async () => {
    const result = await service.dispatch(
      'saveDraft',
      {
        operation: 'createOfficer',
        targetOfficerId: null,
        baseDataVersion: null,
        baseSnapshot: null,
        proposedData: officerData('缺少幂等鍵航海士'),
        referenceCandidates: [],
      },
      'owner-user',
    )

    expect(result).toMatchObject({ ok: false, code: 'invalid-data' })
    expect(repo.records).toHaveLength(0)
  })

  it('既有草稿保存逾時後以同一保存幂等鍵重試時回傳已保存版本', async () => {
    const draft = saved(await service.dispatch('saveDraft', updateDraft(), 'owner-user'))
    const payload = {
      ...draft,
      ...updateDraft({ proposedData: officerData('保存一次') }),
      workOrderId: draft.workOrderId,
      revision: draft.revision,
      updatedAt: draft.updatedAt,
      idempotencyKey: 'save:wo_1:1',
    }
    const first = saved(await service.dispatch('saveDraft', payload, 'owner-user'))
    const retry = saved(await service.dispatch('saveDraft', payload, 'owner-user'))

    expect(retry).toEqual(first)
    expect(repo.records).toHaveLength(1)
  })

  const candidate = (overrides: Record<string, unknown> = {}) => ({
    key: 'candidate_1',
    kind: 'skill',
    name: '原候選',
    aliases: [],
    categoryId: 'skill_category_navigation',
    description: '航行能力提升',
    ...overrides,
  })

  it('保存候選項修訂、分類更正與合併移除，保留原稿及連續審核快照', async () => {
    const original = [candidate()]
    const pending = await createPendingWorkOrder({ referenceCandidates: original })
    const revised = [candidate({ name: '修訂候選', categoryId: 'skill_category_trade' })]
    const first = saved(
      await service.dispatch(
        'saveReview',
        {
          ...pending,
          reviewedData: officerData('首次修訂'),
          referenceCandidates: revised,
          reason: '修訂候選技能分類',
        },
        'admin-user',
      ),
    )
    expect(first.referenceCandidates).toEqual(revised)
    expect(first.proposedReferenceCandidates).toEqual(original)
    expect(first.proposedData).toEqual(pending.proposedData)
    const firstHistory = structuredClone(first.history)
    const second = saved(
      await service.dispatch(
        'saveReview',
        {
          ...first,
          reviewedData: officerData('合併至正式技能'),
          referenceCandidates: [],
          reason: '合併候選至正式技能',
        },
        'admin-user',
      ),
    )
    expect(second.referenceCandidates).toEqual([])
    expect(second.proposedReferenceCandidates).toEqual(original)
    expect(second.history.slice(0, -1)).toEqual(firstHistory)
    expect(second.history[second.history.length - 1]).toMatchObject({
      snapshot: { referenceCandidates: revised, proposedReferenceCandidates: original },
      referenceCandidates: [],
      reviewedData: { name: '合併至正式技能' },
    })
    const approved = saved(await service.dispatch('approve', second, 'admin-user'))
    expect(approved.referenceCandidates).toEqual([])
    expect(approved.reviewedData?.name).toBe('合併至正式技能')
  })

  it('管理員保存與核准時允許 reviewedData 暫時引用候選 key', async () => {
    const pending = await createPendingWorkOrder({
      proposedData: {
        ...officerData('含候選引用'),
        jobId: 'candidate_job',
      },
      referenceCandidates: [
        {
          key: 'candidate_job',
          kind: 'job',
          name: '候選職業',
          aliases: [],
        },
      ],
    })
    const reviewedData = { ...officerData('管理員修訂'), jobId: 'candidate_job' }
    const savedReview = saved(
      await service.dispatch(
        'saveReview',
        {
          ...pending,
          reviewedData,
          referenceCandidates: pending.referenceCandidates,
          reason: '保留候選職業引用待同步合併',
        },
        'admin-user',
      ),
    )
    expect(savedReview.reviewedData?.jobId).toBe('candidate_job')
    const approved = saved(await service.dispatch('approve', savedReview, 'admin-user'))
    expect(approved.status).toBe('approvedPendingPublish')
  })

  it('直接駁回後改草稿並重提，仍能完整還原舊提交基準與候選項', async () => {
    const original = [candidate()]
    const pending = await createPendingWorkOrder({ referenceCandidates: original })
    const rejected = saved(
      await service.dispatch('reject', { ...pending, reason: '補資料' }, 'admin-user'),
    )
    const before = structuredClone(rejected.history)
    const draft = saved(
      await service.dispatch(
        'saveDraft',
        {
          ...rejected,
          ...updateDraft({
            proposedData: officerData('重提名稱'),
            baseDataVersion: 'dataset-v2',
            baseSnapshot: officerData('新基準'),
            referenceCandidates: [],
          }),
        },
        'owner-user',
      ),
    )
    const resubmitted = saved(await service.dispatch('submit', draft, 'owner-user'))
    expect(resubmitted.history.slice(0, before.length)).toEqual(before)
    for (const action of ['submitted', 'rejected']) {
      expect(resubmitted.history.find((entry) => entry.action === action)).toMatchObject({
        snapshot: {
          operation: 'updateOfficer',
          targetOfficerId: 'officer_existing',
          baseDataVersion: 'dataset-v1',
          baseSnapshot: officerData('原始航海士'),
          proposedData: officerData(),
          referenceCandidates: original,
          reviewedData: null,
        },
      })
    }
    expect(resubmitted.history[resubmitted.history.length - 1]).toMatchObject({
      action: 'resubmitted',
      snapshot: {
        baseDataVersion: 'dataset-v2',
        proposedData: { name: '重提名稱' },
        referenceCandidates: [],
      },
    })
  })

  it.each([
    ['缺 key', [candidate({ key: undefined })]],
    ['空白 key', [candidate({ key: ' ' })]],
    ['重複 key', [candidate(), candidate({ name: '另一候選' })]],
    ['缺技能說明', [candidate({ description: undefined })]],
    ['空白技能說明', [candidate({ description: ' ' })]],
    [
      '名稱與別名衝突',
      [candidate({ aliases: ['另一候選'] }), candidate({ key: 'c2', name: ' 另一候選 ' })],
    ],
    [
      '交叉別名衝突',
      [
        candidate({ aliases: ['共用別名'] }),
        candidate({ key: 'c2', name: '另一候選', aliases: [' 共用別名 '] }),
      ],
    ],
  ])('保存草稿拒絕%s', async (_label, candidates) => {
    await expect(
      service.dispatch('saveDraft', updateDraft({ referenceCandidates: candidates }), 'owner-user'),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-data' })
    expect(repo.records).toHaveLength(0)
  })

  it('審核保存拒絕無效候選項且不改動既有版本', async () => {
    const pending = await createPendingWorkOrder()
    await expect(
      service.dispatch(
        'saveReview',
        { ...pending, reviewedData: officerData(), referenceCandidates: [candidate({ key: '' })] },
        'admin-user',
      ),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-data' })
    expect(repo.records[0].revision).toBe(pending.revision)
  })

  it.each(['formal-id', 'candidate'])('核准重新驗證已儲存的%s', async (kind) => {
    const pending = await createPendingWorkOrder()
    const reviewed = saved(
      await service.dispatch(
        'saveReview',
        {
          ...pending,
          reviewedData: officerData(),
          referenceCandidates: [candidate()],
          reason: '完成審核修訂',
        },
        'admin-user',
      ),
    )
    // 模擬舊版服務留下的不合法紀錄，核准仍必須守住服務端邊界。
    if (kind === 'formal-id') repo.records[0].reviewedData!.jobId = 'job_unknown'
    else repo.records[0].referenceCandidates = [candidate({ description: '' })]
    await expect(service.dispatch('approve', reviewed, 'admin-user')).resolves.toMatchObject({
      ok: false,
      code: 'invalid-data',
    })
    expect(repo.records[0].status).toBe('pendingReview')
  })

  it('成功發布保存資料集版本，已發布工單不可再次發布', async () => {
    const pending = await createPendingWorkOrder()
    const reviewed = saved(
      await service.dispatch(
        'saveReview',
        { ...pending, reviewedData: officerData(), reason: '完成發布前審核' },
        'admin-user',
      ),
    )
    const approved = saved(await service.dispatch('approve', reviewed, 'admin-user'))
    await expect(
      service.dispatch('listApprovedForSync', { syncToken: 'sync-secret' }, null),
    ).resolves.toMatchObject({ ok: true, data: [{ workOrderId: approved.workOrderId }] })
    const published = saved(
      await service.dispatch(
        'markPublished',
        { ...approved, syncToken: 'sync-secret', datasetVersion: 'dataset-v2' },
        null,
      ),
    )
    expect(published).toMatchObject({ status: 'published', publishedDatasetVersion: 'dataset-v2' })
    await expect(
      service.dispatch(
        'markPublished',
        { ...published, syncToken: 'sync-secret', datasetVersion: 'dataset-v3' },
        null,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-state' })
    await expect(
      service.dispatch('listApprovedForSync', { syncToken: 'sync-secret' }, null),
    ).resolves.toEqual({ ok: true, data: [] })
  })

  it('同步端可取得核准工單已上傳頭像的臨時下載地址', async () => {
    const pending = await createPendingWorkOrder()
    repo.records[0]!.status = 'approvedPendingPublish'
    repo.records[0]!.portraitFileId = 'cloud://portrait-approved'
    const syncService = serviceModule.createOfficerMaintenanceService(repo, {
      adminOpenIds: new Set(['admin-user']),
      syncToken: 'sync-secret',
      referenceData,
      cloud: {
        async getTempFileURL(input: { fileList: string[] }) {
          expect(input).toEqual({ fileList: ['cloud://portrait-approved'] })
          return {
            fileList: [
              { fileID: 'cloud://portrait-approved', tempFileURL: 'https://temp.example/a.png' },
            ],
          }
        },
      },
    })

    await expect(
      syncService.dispatch(
        'getPortraitDownloadUrl',
        { ...pending, syncToken: 'sync-secret' },
        null,
      ),
    ).resolves.toMatchObject({
      ok: true,
      data: { tempFileURL: 'https://temp.example/a.png' },
    })
  })

  it('他人不可讀寫工單，updatedAt 單獨不符亦拒絕 CAS', async () => {
    const pending = await createPendingWorkOrder()
    for (const action of ['loadMine', 'saveDraft', 'submit']) {
      await expect(
        service.dispatch(action, { ...pending, ...updateDraft() }, 'other-user'),
      ).resolves.toMatchObject({ ok: false, code: 'not-found' })
    }
    await expect(service.dispatch('listMine', {}, 'other-user')).resolves.toEqual({
      ok: true,
      data: [],
    })
    await expect(
      service.dispatch(
        'saveReview',
        { ...pending, updatedAt: 'stale', reviewedData: officerData() },
        'admin-user',
      ),
    ).resolves.toMatchObject({ ok: false, code: 'conflict' })
    expect(repo.records[0].revision).toBe(pending.revision)
  })

  it('普通使用者即使夾帶 isAdmin 仍不能核准工單', async () => {
    await expect(
      service.dispatch('approve', { isAdmin: true, workOrderId: 'wo_missing' }, 'ordinary-user'),
    ).resolves.toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('管理員保存審核時保留 proposedData、只更新 reviewedData 並追加不可變歷史', async () => {
    const pending = await createPendingWorkOrder()
    const proposedBefore = structuredClone(pending.proposedData)
    const reviewed = officerData('管理員修訂名稱')

    const result = await service.dispatch(
      'saveReview',
      {
        workOrderId: pending.workOrderId,
        revision: pending.revision,
        updatedAt: pending.updatedAt,
        reviewedData: reviewed,
        referenceCandidates: [],
        reason: '更正繁中譯名',
      },
      'admin-user',
    )

    expect(result).toMatchObject({
      ok: true,
      data: { status: 'pendingReview', proposedData: proposedBefore },
    })
    expect(Array.isArray(result.data) ? [] : result.data?.reviewedData).toEqual(reviewed)
    const resultHistory = Array.isArray(result.data) ? [] : (result.data?.history ?? [])
    expect(resultHistory[resultHistory.length - 1]).toMatchObject({
      action: 'reviewSaved',
      reason: '更正繁中譯名',
    })
    expect(pending.proposedData).toEqual(proposedBefore)
  })

  it('管理員保存審核必須記錄非空修訂原因', async () => {
    const pending = await createPendingWorkOrder()

    await expect(
      service.dispatch(
        'saveReview',
        {
          workOrderId: pending.workOrderId,
          revision: pending.revision,
          updatedAt: pending.updatedAt,
          reviewedData: officerData('修訂後名稱'),
          referenceCandidates: [],
          reason: '   ',
        },
        'admin-user',
      ),
    ).resolves.toMatchObject({ ok: false, code: 'review-reason-required' })
    expect(repo.records[0].revision).toBe(pending.revision)
  })

  it('核准前驗證基準版本、正式 ID、候選項與 pendingReview 狀態', async () => {
    const pending = await createPendingWorkOrder()
    const reviewed = await service.dispatch(
      'saveReview',
      {
        workOrderId: pending.workOrderId,
        revision: pending.revision,
        updatedAt: pending.updatedAt,
        reviewedData: officerData(),
        referenceCandidates: [],
        reason: '確認正式資料內容',
      },
      'admin-user',
    )
    if (!reviewed.ok || Array.isArray(reviewed.data) || !reviewed.data)
      throw new Error('保存審核失敗')

    await expect(
      service.dispatch(
        'approve',
        {
          workOrderId: reviewed.data.workOrderId,
          revision: reviewed.data.revision,
          updatedAt: reviewed.data.updatedAt,
        },
        'admin-user',
      ),
    ).resolves.toMatchObject({ ok: true, data: { status: 'approvedPendingPublish' } })

    const invalidDraft = await service.dispatch(
      'saveDraft',
      updateDraft({
        baseDataVersion: 'dataset-old',
        proposedData: officerData('過期基準'),
        idempotencyKey: 'update-save-invalid-base',
      }),
      'owner-user',
    )
    if (!invalidDraft.ok || Array.isArray(invalidDraft.data) || !invalidDraft.data)
      throw new Error('建立草稿失敗')
    const invalidPending = await service.dispatch(
      'submit',
      {
        workOrderId: invalidDraft.data.workOrderId,
        revision: invalidDraft.data.revision,
        updatedAt: invalidDraft.data.updatedAt,
      },
      'owner-user',
    )
    if (!invalidPending.ok || Array.isArray(invalidPending.data) || !invalidPending.data) {
      throw new Error('送審失敗')
    }
    const invalidReviewed = await service.dispatch(
      'saveReview',
      {
        workOrderId: invalidPending.data.workOrderId,
        revision: invalidPending.data.revision,
        updatedAt: invalidPending.data.updatedAt,
        reviewedData: officerData(),
        referenceCandidates: [],
        reason: '確認過期基準內容',
      },
      'admin-user',
    )
    if (!invalidReviewed.ok || Array.isArray(invalidReviewed.data) || !invalidReviewed.data) {
      throw new Error('保存審核失敗')
    }
    await expect(
      service.dispatch(
        'approve',
        {
          workOrderId: invalidReviewed.data.workOrderId,
          revision: invalidReviewed.data.revision,
          updatedAt: invalidReviewed.data.updatedAt,
        },
        'admin-user',
      ),
    ).resolves.toMatchObject({ ok: false, code: 'base-version-conflict' })
  })

  it('CAS 衝突不覆蓋較新的工單，且同步僅能發布已核准工單', async () => {
    const pending = await createPendingWorkOrder()
    await expect(
      service.dispatch(
        'submit',
        {
          workOrderId: pending.workOrderId,
          revision: pending.revision - 1,
          updatedAt: pending.updatedAt,
        },
        'owner-user',
      ),
    ).resolves.toMatchObject({ ok: false, code: 'conflict' })
    await expect(
      service.dispatch('listApprovedForSync', { syncToken: 'wrong' }, null),
    ).resolves.toMatchObject({ ok: false, code: 'forbidden' })
    await expect(
      service.dispatch(
        'markPublished',
        {
          syncToken: 'sync-secret',
          workOrderId: pending.workOrderId,
          revision: pending.revision,
          updatedAt: pending.updatedAt,
          datasetVersion: 'dataset-v2',
        },
        null,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-state' })
  })
})
