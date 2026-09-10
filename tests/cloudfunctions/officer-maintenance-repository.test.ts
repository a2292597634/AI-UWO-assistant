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

interface FakeSetOperator {
  readonly __cloudbaseOperator: 'set'
  readonly value: unknown
}

interface FakeDatabase {
  command: {
    set(value: unknown): FakeSetOperator
  }
  collection(name: string): Collection
  createCollection(name: string): Promise<void>
}

const isFakeSetOperator = (value: unknown): value is FakeSetOperator =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { __cloudbaseOperator?: unknown }).__cloudbaseOperator === 'set',
  )

interface WorkOrderRepository {
  insert(record: WorkOrderRecord): Promise<WorkOrderRecord>
  findByWorkOrderId(workOrderId: string): Promise<WorkOrderRecord | null>
  findByOwnerAndIdempotencyKey(
    ownerUid: string,
    idempotencyKey: string,
  ): Promise<WorkOrderRecord | null>
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
    command: {
      set(value) {
        return { __cloudbaseOperator: 'set', value }
      },
    },
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
              for (const record of found) {
                for (const [key, value] of Object.entries(data)) {
                  if (isFakeSetOperator(value)) {
                    record[key] = structuredClone(value.value)
                    continue
                  }
                  if (
                    key === 'portraitMeta' &&
                    value &&
                    typeof value === 'object' &&
                    !Array.isArray(value) &&
                    record[key] === null
                  ) {
                    throw new Error(
                      "Cannot create field 'byteSize' in element {portraitMeta: null}",
                    )
                  }
                  record[key] = structuredClone(value)
                }
              }
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

  it('portraitMeta 從 null 寫入完整 metadata 時整體替換欄位', async () => {
    const repo = repositoryModule.createRepository(
      createFakeDatabase([record({ portraitMeta: null })]),
    )

    await expect(
      repo.updateIfCurrent('wo_1', 1, '2026-09-08T00:00:00.000Z', {
        portraitMeta: { mimeType: 'image/png', byteSize: 128, width: 256, height: 256 },
      }),
    ).resolves.toMatchObject({
      portraitMeta: { mimeType: 'image/png', byteSize: 128, width: 256, height: 256 },
      revision: 2,
    })
  })

  it('以 owner 與幂等鍵找到同一筆新增工單', async () => {
    const repo = repositoryModule.createRepository(
      createFakeDatabase([
        record({ ownerUid: 'openid_other', idempotencyKey: 'client-save-1' }),
        record({
          _id: 'doc_2',
          workOrderId: 'wo_2',
          ownerUid: 'openid_owner',
          idempotencyKey: 'client-save-1',
        }),
      ]),
    )

    await expect(
      repo.findByOwnerAndIdempotencyKey('openid_owner', 'client-save-1'),
    ).resolves.toMatchObject({
      workOrderId: 'wo_2',
      ownerUid: 'openid_owner',
    })
    await expect(
      repo.findByOwnerAndIdempotencyKey('openid_owner', 'client-save-2'),
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
