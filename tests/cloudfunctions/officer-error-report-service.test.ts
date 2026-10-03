import { beforeEach, describe, expect, it } from 'vitest'

/* eslint-disable @typescript-eslint/no-require-imports */
const { createErrorReportService } =
  require('../../cloudfunctions/officer-maintenance/error-report-service') as {
    createErrorReportService: (
      repo: ReturnType<typeof createMemoryRepo>,
      options: { adminOpenIds: Set<string>; officerIds: Set<string> },
    ) => {
      dispatch(
        action: string,
        payload: Record<string, unknown>,
        openid: string | null,
      ): Promise<Result>
    }
  }
/* eslint-enable @typescript-eslint/no-require-imports */

interface StoredRecord extends Record<string, unknown> {
  reportId: string
  ownerOpenId: string
  status: string
  revision: number
  updatedAt: string
}

interface Result {
  ok: boolean
  code?: string
  data?: StoredRecord | StoredRecord[]
}

function createMemoryRepo() {
  const records: StoredRecord[] = []
  return {
    records,
    async insert(record: StoredRecord) {
      records.push(structuredClone(record))
      return structuredClone(record)
    },
    async findByReportId(reportId: string) {
      const value = records.find((item) => item.reportId === reportId)
      return value ? structuredClone(value) : null
    },
    async listByOwner(ownerOpenId: string) {
      return records
        .filter((item) => item.ownerOpenId === ownerOpenId)
        .map((item) => structuredClone(item))
    },
    async listByStatus(status: string) {
      return records.filter((item) => item.status === status).map((item) => structuredClone(item))
    },
    async updateIfCurrent(
      reportId: string,
      revision: number,
      updatedAt: string,
      patch: Record<string, unknown>,
    ) {
      const value = records.find(
        (item) =>
          item.reportId === reportId && item.revision === revision && item.updatedAt === updatedAt,
      )
      if (!value) return null
      Object.assign(value, structuredClone(patch), {
        revision: revision + 1,
        updatedAt: `2026-09-13T00:00:0${revision}.000Z`,
      })
      return structuredClone(value)
    },
  }
}

const draft = {
  officerId: 'officer_1',
  errorTypes: ['skill'],
  description: '技能等級錯誤',
  suggestedCorrection: '應為 Lv.2',
  sourceUrl: '',
  screenshotFileIds: [],
  supplement: '',
}

describe('錯誤回報服務', () => {
  let repo: ReturnType<typeof createMemoryRepo>
  let service: ReturnType<typeof createErrorReportService>

  beforeEach(() => {
    repo = createMemoryRepo()
    service = createErrorReportService(repo, {
      adminOpenIds: new Set(['admin']),
      officerIds: new Set(['officer_1']),
    })
  })

  const version = (record: StoredRecord) => ({
    reportId: record.reportId,
    revision: record.revision,
    updatedAt: record.updatedAt,
  })

  const needsInfo = async () => {
    const created = await service.dispatch(
      'createReport',
      { ...draft, supplement: '原始補充' },
      'owner',
    )
    const result = await service.dispatch(
      'requestReportInfo',
      { ...version(created.data as StoredRecord), reply: '請提供截圖' },
      'admin',
    )
    return result.data as StoredRecord
  }

  it.each([
    { text: '文字', sourceUrl: '', screenshotFileIds: [] },
    { text: '', sourceUrl: 'https://example.invalid/source', screenshotFileIds: [] },
    { text: '', sourceUrl: '', screenshotFileIds: ['cloud://evidence'] },
  ])(
    '三類單一補充皆成功回 pending 並保留原始證據：$text $sourceUrl $screenshotFileIds',
    async (content) => {
      const record = await needsInfo()
      const before = structuredClone(record)
      const result = await service.dispatch(
        'appendReportSupplement',
        { ...version(record), ...content },
        'owner',
      )
      expect(result).toMatchObject({
        ok: true,
        data: {
          status: 'pending',
          revision: 3,
          description: draft.description,
          supplement: '原始補充',
          supplements: [content],
        },
      })
      const updated = result.data as StoredRecord
      expect(updated.history).toEqual([
        ...(before.history as unknown[]),
        expect.objectContaining({ action: 'supplemented', actorRole: 'owner' }),
      ])
    },
  )

  it.each([
    { text: '  ', sourceUrl: '  ', screenshotFileIds: [] },
    { text: '文字', sourceUrl: 'not-a-url', screenshotFileIds: [] },
    { text: '', sourceUrl: 'ftp://example.invalid/a', screenshotFileIds: [] },
    { text: '文字', sourceUrl: '', screenshotFileIds: ['a', 'b', 'c', 'd'] },
    { text: '文字', sourceUrl: '', screenshotFileIds: [''] },
  ])(
    '空內容、無效URL或附件均拒絕並保持完整記錄：$sourceUrl $screenshotFileIds',
    async (content) => {
      const record = await needsInfo()
      const before = structuredClone(repo.records)
      await expect(
        service.dispatch('appendReportSupplement', { ...version(record), ...content }, 'owner'),
      ).resolves.toMatchObject({ ok: false, code: 'invalid-data' })
      expect(repo.records).toEqual(before)
    },
  )

  it('非擁有者不得只以截圖補充，舊版本和 CAS 競爭均不覆寫紀錄', async () => {
    const record = await needsInfo()
    const content = {
      ...version(record),
      text: '',
      sourceUrl: '',
      screenshotFileIds: ['cloud://evidence'],
    }
    const before = structuredClone(repo.records)
    await expect(
      service.dispatch('appendReportSupplement', content, 'other'),
    ).resolves.toMatchObject({ ok: false, code: 'not-found' })
    await expect(
      service.dispatch('appendReportSupplement', { ...content, revision: 1 }, 'owner'),
    ).resolves.toMatchObject({ ok: false, code: 'conflict' })
    expect(repo.records).toEqual(before)
    const update = repo.updateIfCurrent.bind(repo)
    repo.updateIfCurrent = async (...args) => {
      repo.records[0]!.revision += 1
      return update(...args)
    }
    await expect(
      service.dispatch('appendReportSupplement', content, 'owner'),
    ).resolves.toMatchObject({ ok: false, code: 'conflict' })
    expect(repo.records[0]?.supplements).toEqual([])
    expect(repo.records[0]?.history).toEqual(before[0]?.history)
  })

  it('needsInfo 再次要求補充追加歷史與版本但原始回報和補充不變', async () => {
    const record = await needsInfo()
    const extra = [
      { text: '先前補充', sourceUrl: '', screenshotFileIds: ['cloud://old'], createdAt: 't0' },
    ]
    repo.records[0]!.supplements = extra
    const before = structuredClone(repo.records[0]!)
    const result = await service.dispatch(
      'requestReportInfo',
      { ...version(record), reply: '請補上完整畫面' },
      'admin',
    )
    expect(result).toMatchObject({
      ok: true,
      data: {
        status: 'needsInfo',
        reviewReply: '請補上完整畫面',
        revision: 3,
        supplements: extra,
        description: before.description,
        supplement: before.supplement,
      },
    })
    const updated = result.data as StoredRecord
    expect(updated.history).toEqual([
      ...(before.history as unknown[]),
      expect.objectContaining({
        action: 'infoRequested',
        reason: '請補上完整畫面',
        actorRole: 'admin',
      }),
    ])
    expect(updated.updatedAt).not.toBe(before.updatedAt)
  })

  it('再次要求補充的無回覆、非管理員、舊版本及 CAS 競爭均拒絕且不倒退', async () => {
    const record = await needsInfo()
    const input = { ...version(record), reply: '新要求' }
    const before = structuredClone(repo.records)
    await expect(
      service.dispatch('requestReportInfo', { ...input, reply: ' ' }, 'admin'),
    ).resolves.toMatchObject({ ok: false, code: 'review-reply-required' })
    await expect(service.dispatch('requestReportInfo', input, 'owner')).resolves.toMatchObject({
      ok: false,
      code: 'forbidden',
    })
    await expect(
      service.dispatch('requestReportInfo', { ...input, revision: 1 }, 'admin'),
    ).resolves.toMatchObject({ ok: false, code: 'conflict' })
    expect(repo.records).toEqual(before)
    const update = repo.updateIfCurrent.bind(repo)
    repo.updateIfCurrent = async (...args) => {
      repo.records[0]!.revision += 1
      return update(...args)
    }
    await expect(service.dispatch('requestReportInfo', input, 'admin')).resolves.toMatchObject({
      ok: false,
      code: 'conflict',
    })
    expect(repo.records[0]?.history).toEqual(before[0]?.history)
    expect(repo.records[0]?.reviewReply).toBe('請提供截圖')
  })

  it.each(['fixed', 'rejected'])('終態 %s 維持拒絕再次要求補充且保留證據', async (status) => {
    const record = await needsInfo()
    repo.records[0]!.status = status
    const before = structuredClone(repo.records)
    await expect(
      service.dispatch('requestReportInfo', { ...version(record), reply: '新要求' }, 'admin'),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-state' })
    expect(repo.records).toEqual(before)
  })

  it('要求登入、忽略客戶端身份並拒絕未知航海士', async () => {
    await expect(service.dispatch('createReport', draft, null)).resolves.toMatchObject({
      ok: false,
      code: 'unauthenticated',
    })
    await service.dispatch('createReport', { ...draft, ownerOpenId: 'forged' }, 'owner')
    expect(repo.records[0]?.ownerOpenId).toBe('owner')
    await expect(
      service.dispatch('createReport', { ...draft, officerId: 'missing' }, 'owner'),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-data' })
  })

  it('只向使用者返回自己的報告且移除 ownerOpenId', async () => {
    await service.dispatch('createReport', draft, 'owner')
    await service.dispatch('createReport', draft, 'other')

    const result = await service.dispatch('listMyReports', {}, 'owner')
    expect(result.ok).toBe(true)
    const reports = result.data as StoredRecord[]
    expect(reports).toHaveLength(1)
    expect(reports[0]).not.toHaveProperty('ownerOpenId')
  })

  it('非管理員不能審核', async () => {
    await expect(
      service.dispatch('listReportsForAdmin', { status: 'pending' }, 'owner'),
    ).resolves.toMatchObject({
      ok: false,
      code: 'forbidden',
    })
  })

  it('要求補充與拒絕必須有回覆，標記已修正必須有資料版本', async () => {
    const created = await service.dispatch('createReport', draft, 'owner')
    const record = created.data as StoredRecord
    const current = {
      reportId: record.reportId,
      revision: record.revision,
      updatedAt: record.updatedAt,
    }

    await expect(service.dispatch('requestReportInfo', current, 'admin')).resolves.toMatchObject({
      ok: false,
      code: 'review-reply-required',
    })
    await expect(service.dispatch('rejectReport', current, 'admin')).resolves.toMatchObject({
      ok: false,
      code: 'review-reply-required',
    })
    const accepted = await service.dispatch(
      'acceptReport',
      { ...current, reply: '已確認' },
      'admin',
    )
    const acceptedRecord = accepted.data as StoredRecord
    await expect(
      service.dispatch(
        'markReportFixed',
        {
          reportId: acceptedRecord.reportId,
          revision: acceptedRecord.revision,
          updatedAt: acceptedRecord.updatedAt,
        },
        'admin',
      ),
    ).resolves.toMatchObject({ ok: false, code: 'dataset-version-required' })
  })

  it('只有擁有者能在要求補充狀態追加內容', async () => {
    const created = await service.dispatch('createReport', draft, 'owner')
    const record = created.data as StoredRecord
    const requested = await service.dispatch(
      'requestReportInfo',
      {
        reportId: record.reportId,
        revision: 1,
        updatedAt: record.updatedAt,
        reply: '請補充畫面文字',
      },
      'admin',
    )
    const pending = requested.data as StoredRecord

    await expect(
      service.dispatch(
        'appendReportSupplement',
        {
          reportId: pending.reportId,
          revision: pending.revision,
          updatedAt: pending.updatedAt,
          text: '補充內容',
        },
        'other',
      ),
    ).resolves.toMatchObject({ ok: false, code: 'not-found' })
    await expect(
      service.dispatch(
        'appendReportSupplement',
        {
          reportId: pending.reportId,
          revision: pending.revision,
          updatedAt: pending.updatedAt,
          text: '補充內容',
        },
        'owner',
      ),
    ).resolves.toMatchObject({ ok: true, data: { status: 'pending' } })
  })
})
