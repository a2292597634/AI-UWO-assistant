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
