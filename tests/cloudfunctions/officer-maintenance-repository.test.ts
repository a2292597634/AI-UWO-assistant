import { describe, expect, it } from 'vitest'

/* eslint-disable @typescript-eslint/no-require-imports */
const repositoryModule = require('../../cloudfunctions/officer-maintenance/repository') as {
  createRepository: (db: FakeDatabase) => WorkOrderRepository
}
/* eslint-enable @typescript-eslint/no-require-imports */

interface WorkOrderRecord {
  _id?: string
  workOrderId: string
  ownerUid: string
  status: string
  revision: number
  updatedAt: string
  [key: string]: unknown
}

interface Query {
  skip(count: number): Query
  limit(count: number): Query
  get(): Promise<{ data: WorkOrderRecord[] }>
  update(options: { data: Record<string, unknown> }): Promise<{ stats: { updated: number } }>
}

interface Collection {
  where(filter: Record<string, unknown>): Query
  add(options: { data: WorkOrderRecord }): Promise<{ _id: string }>
}

interface FakeDatabase {
  collection(name: string): Collection
  createCollection(name: string): Promise<void>
}

interface WorkOrderRepository {
  insert(record: WorkOrderRecord): Promise<WorkOrderRecord>
  findByWorkOrderId(workOrderId: string): Promise<WorkOrderRecord | null>
  listByOwner(ownerUid: string): Promise<WorkOrderRecord[]>
  listByStatus(status: string): Promise<WorkOrderRecord[]>
  updateIfCurrent(
    workOrderId: string,
    revision: number,
    updatedAt: string,
    patch: Record<string, unknown>,
  ): Promise<WorkOrderRecord | null>
}

function createFakeDatabase(seed: WorkOrderRecord[] = [], offsets: number[] = []): FakeDatabase {
  const records = new Map(seed.map((record) => [record._id!, { ...record }]))
  let nextId = seed.length
  const providerPageSize = 2
  return {
    collection() {
      return {
        where(filter) {
          const matches = () =>
            [...records.values()].filter((record) =>
              Object.entries(filter).every(([key, value]) => record[key] === value),
            )
          const query = (offset = 0, size = providerPageSize): Query => ({
            skip(count) {
              return query(offset + count, size)
            },
            limit(count) {
              return query(offset, count)
            },
            async get() {
              offsets.push(offset)
              return { data: matches().slice(offset, offset + size) }
            },
            async update({ data }) {
              const found = matches()
              for (const record of found) Object.assign(record, data)
              return { stats: { updated: found.length } }
            },
          })
          return query()
        },
        async add({ data }) {
          const _id = `doc_${nextId++}`
          records.set(_id, { ...data, _id })
          return { _id }
        },
      }
    },
    createCollection: async () => undefined,
  }
}

const record = (overrides: Partial<WorkOrderRecord> = {}): WorkOrderRecord => ({
  _id: overrides._id ?? 'doc_1',
  workOrderId: overrides.workOrderId ?? 'wo_1',
  ownerUid: overrides.ownerUid ?? 'openid_owner',
  status: overrides.status ?? 'draft',
  revision: overrides.revision ?? 1,
  updatedAt: overrides.updatedAt ?? '2026-09-08T00:00:00.000Z',
  ...overrides,
})

describe('航海士維護工單儲存庫', () => {
  it('以 workOrderId、revision 與 updatedAt 三者作為 CAS 條件', async () => {
    const repo = repositoryModule.createRepository(createFakeDatabase([record()]))

    await expect(
      repo.updateIfCurrent('wo_1', 1, 'stale', { status: 'published' }),
    ).resolves.toBeNull()
    await expect(
      repo.updateIfCurrent('wo_other', 1, '2026-09-08T00:00:00.000Z', { status: 'published' }),
    ).resolves.toBeNull()

    await expect(
      repo.updateIfCurrent('wo_1', 1, '2026-09-08T00:00:00.000Z', { status: 'pendingReview' }),
    ).resolves.toMatchObject({ status: 'pendingReview', revision: 2 })
    await expect(
      repo.updateIfCurrent('wo_1', 1, '2026-09-08T00:00:00.000Z', { status: 'published' }),
    ).resolves.toBeNull()
  })

  it('跨 CloudBase 分頁限制仍取得所有本人或指定狀態工單', async () => {
    const offsets: number[] = []
    const repo = repositoryModule.createRepository(
      createFakeDatabase(
        Array.from({ length: 101 }, (_, index) =>
          record({
            _id: `doc_${index}`,
            workOrderId: `wo_${index}`,
            status: 'approvedPendingPublish',
          }),
        ),
        offsets,
      ),
    )

    const mine = await repo.listByOwner('openid_owner')
    expect(mine).toHaveLength(101)
    expect(new Set(mine.map((item) => item.workOrderId)).size).toBe(101)
    await expect(repo.listByStatus('approvedPendingPublish')).resolves.toHaveLength(101)
    expect(offsets).toEqual([0, 100, 0, 100])
  })
})
