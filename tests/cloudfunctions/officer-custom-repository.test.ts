import { describe, expect, it } from 'vitest'

/* eslint-disable @typescript-eslint/no-require-imports */
const repositoryModule =
  require('../../cloudfunctions/officer-custom/officer-custom-repository') as {
    createRepository: (db: FakeDatabase) => OfficerRepository
  }
/* eslint-enable @typescript-eslint/no-require-imports */

interface StoredRecord {
  _id?: string
  submissionId: string
  ownerUid: string
  status: string
  revision: number
  updatedAt: string
  [key: string]: unknown
}

interface Query {
  skip(count: number): Query
  limit(count: number): Query
  get(): Promise<{ data: StoredRecord[] }>
  count(): Promise<{ total: number }>
  update(options: { data: Record<string, unknown> }): Promise<{ stats: { updated: number } }>
}

interface Document {
  get(): Promise<{ data?: StoredRecord }>
  set(options: { data: StoredRecord }): Promise<void>
}

interface Collection {
  where(filter: Record<string, unknown>): Query
  doc(id: string): Document
  add(options: { data: StoredRecord }): Promise<{ _id: string }>
}

interface FakeDatabase {
  collection(name: string): Collection
  createCollection(name: string): Promise<void>
  runTransaction<T>(
    callback: (transaction: { collection(name: string): Collection }) => Promise<T>,
  ): Promise<T>
}

interface OfficerRepository {
  listByOwner(ownerUid: string): Promise<StoredRecord[]>
  listLatestByStatus(status: string): Promise<StoredRecord[]>
  findBySubmissionIdAndRevision(
    submissionId: string,
    revision: number,
  ): Promise<StoredRecord | null>
  findLatestBySubmissionId(submissionId: string): Promise<StoredRecord | null>
  countLatestByOwner(ownerUid: string): Promise<number>
  insert(record: StoredRecord): Promise<StoredRecord>
  updateIfRevision(
    submissionId: string,
    revision: number,
    updatedAt: string,
    patch: Record<string, unknown>,
  ): Promise<StoredRecord | null>
  insertRevisionIfAbsent(record: StoredRecord): Promise<StoredRecord | null>
  insertIfOwnerBelowLimit(record: StoredRecord, maxRecords: number): Promise<StoredRecord | null>
}

function createFakeDatabase(seed: StoredRecord[] = []): FakeDatabase {
  const collections = new Map<string, Map<string, StoredRecord>>([
    ['custom_officers', new Map(seed.map((record) => [record._id!, { ...record }]))],
  ])
  let nextId = seed.length
  const providerPageSize = 2
  let transactionTail = Promise.resolve()
  const getCollectionData = (name: string): Map<string, StoredRecord> => {
    const existing = collections.get(name)
    if (existing) return existing
    const created = new Map<string, StoredRecord>()
    collections.set(name, created)
    return created
  }
  const makeCollection = (name: string): Collection => {
    const records = getCollectionData(name)
    return {
      where(filter) {
        const matches = () =>
          [...records.values()].filter((record) =>
            Object.entries(filter).every(([key, value]) => record[key] === value),
          )
        const makeQuery = (offset = 0, pageSize = providerPageSize): Query => ({
          skip(count) {
            return makeQuery(offset + count, pageSize)
          },
          limit(count) {
            return makeQuery(offset, count)
          },
          async get() {
            return { data: matches().slice(offset, offset + pageSize) }
          },
          async count() {
            return { total: matches().length }
          },
          async update({ data }) {
            const found = matches()
            for (const record of found) Object.assign(record, data)
            return { stats: { updated: found.length } }
          },
        })
        return makeQuery()
      },
      doc(id) {
        return {
          async get() {
            return { data: records.get(id) }
          },
          async set({ data }) {
            records.set(id, { ...data, _id: id })
          },
        }
      },
      async add({ data }) {
        const _id = `doc_${nextId++}`
        records.set(_id, { ...data, _id })
        return { _id }
      },
    }
  }
  return {
    collection: (name) => makeCollection(name),
    createCollection: async () => undefined,
    async runTransaction<T>(
      callback: (transaction: { collection(name: string): Collection }) => Promise<T>,
    ) {
      const previous = transactionTail
      let release!: () => void
      transactionTail = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous
      try {
        return await callback({ collection: (name) => makeCollection(name) })
      } finally {
        release()
      }
    },
  }
}

const record = (overrides: Partial<StoredRecord> = {}): StoredRecord => ({
  _id: overrides._id ?? 'doc_1',
  submissionId: overrides.submissionId ?? 'sub_1',
  ownerUid: overrides.ownerUid ?? 'openid_user',
  status: overrides.status ?? 'pending',
  revision: overrides.revision ?? 1,
  updatedAt: overrides.updatedAt ?? '2026-09-04T00:00:00.000Z',
  ...overrides,
})

describe('Officer custom repository', () => {
  it('按 submissionId 只返回最新 revision', async () => {
    const repo = repositoryModule.createRepository(
      createFakeDatabase([
        record({ _id: 'doc_1', revision: 1 }),
        record({ _id: 'doc_2', revision: 2, status: 'rejected' }),
      ]),
    )

    await expect(repo.listByOwner('openid_user')).resolves.toMatchObject([
      { submissionId: 'sub_1', revision: 2, status: 'rejected' },
    ])
  })

  it('跨越 CloudBase 分頁上限仍返回 owner 的全部投稿', async () => {
    const repo = repositoryModule.createRepository(
      createFakeDatabase([
        record({ _id: 'doc_1', submissionId: 'sub_1' }),
        record({ _id: 'doc_2', submissionId: 'sub_2' }),
        record({ _id: 'doc_3', submissionId: 'sub_3' }),
      ]),
    )

    await expect(repo.listByOwner('openid_user')).resolves.toHaveLength(3)
  })

  it('revision 或 updatedAt 不匹配时不更新记录', async () => {
    const repo = repositoryModule.createRepository(createFakeDatabase([record()]))

    await expect(
      repo.updateIfRevision('sub_1', 1, '2026-09-04T00:00:00.000Z', { status: 'approved' }),
    ).resolves.toMatchObject({ status: 'approved' })
    await expect(
      repo.updateIfRevision('sub_1', 1, '旧时间', { status: 'published' }),
    ).resolves.toBeNull()
  })

  it('同一 submission revision 的并发插入只允许一个成功', async () => {
    const repo = repositoryModule.createRepository(createFakeDatabase())
    const candidate = record({ submissionId: 'sub_cas', revision: 2 })

    const results = await Promise.all([
      repo.insertRevisionIfAbsent(candidate),
      repo.insertRevisionIfAbsent(candidate),
    ])

    expect(results.filter((item) => item !== null)).toHaveLength(1)
    expect(results.filter((item) => item === null)).toHaveLength(1)
  })

  it('同一 owner 的新投稿并发插入不会超过数量上限', async () => {
    const seed = Array.from({ length: 49 }, (_, index) =>
      record({ _id: `doc_${index}`, submissionId: `sub_${index}` }),
    )
    const repo = repositoryModule.createRepository(createFakeDatabase(seed))

    const results = await Promise.all([
      repo.insertIfOwnerBelowLimit(record({ submissionId: 'sub_new_a' }), 50),
      repo.insertIfOwnerBelowLimit(record({ submissionId: 'sub_new_b' }), 50),
    ])

    expect(results.filter((item) => item !== null)).toHaveLength(1)
    expect(results.filter((item) => item === null)).toHaveLength(1)
    await expect(repo.countLatestByOwner('openid_user')).resolves.toBe(50)
  })

  it('按状态筛选不把 pending 混入 approved 列表', async () => {
    const repo = repositoryModule.createRepository(
      createFakeDatabase([
        record({ _id: 'doc_1', status: 'pending' }),
        record({ _id: 'doc_2', submissionId: 'sub_2', status: 'approved' }),
      ]),
    )

    await expect(repo.listLatestByStatus('approved')).resolves.toMatchObject([
      { submissionId: 'sub_2', status: 'approved' },
    ])
  })
})
