import { describe, expect, it } from 'vitest'

/* eslint-disable @typescript-eslint/no-require-imports */
const { createErrorReportRepository } =
  require('../../cloudfunctions/officer-maintenance/error-report-repository') as {
    createErrorReportRepository: (db: FakeDatabase) => ErrorReportRepository
  }
/* eslint-enable @typescript-eslint/no-require-imports */

interface RecordShape {
  _id?: string
  reportId: string
  ownerOpenId: string
  status: string
  revision: number
  updatedAt: string
  [key: string]: unknown
}

interface Query {
  skip(count: number): Query
  limit(count: number): Query
  get(): Promise<{ data: RecordShape[] }>
  update(options: { data: Record<string, unknown> }): Promise<{ stats: { updated: number } }>
}

interface FakeDatabase {
  collection(name: string): {
    where(filter: Record<string, unknown>): Query
    add(options: { data: RecordShape }): Promise<{ _id: string }>
  }
  createCollection(name: string): Promise<void>
}

interface ErrorReportRepository {
  insert(record: RecordShape): Promise<RecordShape>
  findByReportId(reportId: string): Promise<RecordShape | null>
  listByOwner(ownerOpenId: string): Promise<RecordShape[]>
  listByStatus(status: string): Promise<RecordShape[]>
  updateIfCurrent(
    reportId: string,
    revision: number,
    updatedAt: string,
    patch: Record<string, unknown>,
  ): Promise<RecordShape | null>
}

const createFakeDatabase = (seed: RecordShape[] = []): FakeDatabase => {
  const records = seed.map((item) => ({ ...item }))
  return {
    async createCollection() {},
    collection() {
      return {
        where(filter) {
          const matches = () =>
            records.filter((record) =>
              Object.entries(filter).every(([key, value]) => record[key] === value),
            )
          const query = (offset = 0, limit = 100): Query => ({
            skip(count) {
              return query(count, limit)
            },
            limit(count) {
              return query(offset, count)
            },
            async get() {
              return {
                data: matches()
                  .slice(offset, offset + limit)
                  .map((item) => ({ ...item })),
              }
            },
            async update({ data }) {
              const found = matches()
              found.forEach((item) => Object.assign(item, structuredClone(data)))
              return { stats: { updated: found.length } }
            },
          })
          return query()
        },
        async add({ data }) {
          const _id = `doc_${records.length + 1}`
          records.push({ ...structuredClone(data), _id })
          return { _id }
        },
      }
    },
  }
}

const report = (overrides: Partial<RecordShape> = {}): RecordShape => ({
  _id: 'doc_1',
  reportId: 'report_1',
  ownerOpenId: 'owner_1',
  status: 'pending',
  revision: 1,
  updatedAt: '2026-09-13T00:00:00.000Z',
  ...overrides,
})

describe('錯誤回報儲存庫', () => {
  it('按擁有者與狀態隔離並以更新時間倒序排列', async () => {
    const repo = createErrorReportRepository(
      createFakeDatabase([
        report(),
        report({ _id: 'doc_2', reportId: 'report_2', updatedAt: '2026-09-14T00:00:00.000Z' }),
        report({ _id: 'doc_3', reportId: 'report_3', ownerOpenId: 'owner_2' }),
      ]),
    )

    await expect(repo.listByOwner('owner_1')).resolves.toMatchObject([
      { reportId: 'report_2' },
      { reportId: 'report_1' },
    ])
    await expect(repo.listByStatus('pending')).resolves.toHaveLength(3)
  })

  it('只在 reportId、revision 與 updatedAt 同時匹配時更新', async () => {
    const repo = createErrorReportRepository(createFakeDatabase([report()]))

    await expect(
      repo.updateIfCurrent('report_1', 1, 'stale', { status: 'accepted' }),
    ).resolves.toBeNull()
    await expect(
      repo.updateIfCurrent('report_1', 1, '2026-09-13T00:00:00.000Z', {
        status: 'accepted',
      }),
    ).resolves.toMatchObject({ status: 'accepted', revision: 2 })
  })
})
