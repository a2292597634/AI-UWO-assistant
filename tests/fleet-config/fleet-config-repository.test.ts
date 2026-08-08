import { describe, expect, it } from 'vitest'

/* eslint-disable @typescript-eslint/no-require-imports */
const { createRepository } =
  require('../../cloudfunctions/fleet-config/fleet-config-repository') as {
    createRepository: (db: FakeDatabase) => FleetConfigRepository
  }
/* eslint-enable @typescript-eslint/no-require-imports */

interface StoredRecord {
  _id?: string
  ownerUid: string
  configId: string
  name: string
  normalizedName?: string
  [key: string]: unknown
}

interface QueryResult {
  data: StoredRecord[]
}

interface FakeCollection {
  where(filter: Record<string, unknown>): FakeQuery
  doc(id: string): { set(options: { data: StoredRecord }): Promise<void> }
  add(options: { data: StoredRecord }): Promise<{ _id: string }>
}

interface FakeQuery {
  limit(count: number): FakeQuery
  get(): Promise<QueryResult>
  count(): Promise<{ total: number }>
  update(options: { data: Partial<StoredRecord> }): Promise<{ stats: { updated: number } }>
  remove(): Promise<{ stats: { removed: number } }>
}

interface FakeTransaction {
  collection(name: string): FakeCollection
}

interface FakeDatabase {
  collection(name: string): FakeCollection
  createCollection(name: string): Promise<void>
  runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>): Promise<T>
}

interface FleetConfigRepository {
  insertWithConstraints(
    record: StoredRecord,
    maxConfigsPerOwner: number,
  ): Promise<
    { ok: true; data: StoredRecord } | { ok: false; code: 'duplicate-name' | 'limit-reached' }
  >
  renameIfVersionAndNameAvailable(
    ownerUid: string,
    configId: string,
    expectedVersion: number,
    name: string,
    normalizedName: string,
  ): Promise<
    | { ok: true; data: StoredRecord }
    | { ok: false; code: 'not-found' | 'conflict' | 'duplicate-name' }
  >
  updateIfVersion(
    ownerUid: string,
    configId: string,
    expectedVersion: number,
    patch: Record<string, unknown>,
  ): Promise<StoredRecord | null>
  deleteByOwnerAndId(ownerUid: string, configId: string, expectedVersion: number): Promise<boolean>
}

function createFakeDatabase(): FakeDatabase {
  const collections = new Map<string, Map<string, StoredRecord>>()
  let nextId = 0
  let transactionTail = Promise.resolve()

  const getCollectionData = (name: string) => {
    const existing = collections.get(name)
    if (existing) return existing
    const created = new Map<string, StoredRecord>()
    collections.set(name, created)
    return created
  }

  const createCollection = (name: string): FakeCollection => {
    const collectionData = getCollectionData(name)
    const makeQuery = (filter: Record<string, unknown>, maxResults?: number): FakeQuery => ({
      limit(count) {
        return makeQuery(filter, count)
      },
      async get() {
        const matches = [...collectionData.values()].filter((record) =>
          Object.entries(filter).every(([field, expected]) => record[field] === expected),
        )
        return { data: maxResults === undefined ? matches : matches.slice(0, maxResults) }
      },
      async count() {
        const result = await this.get()
        return { total: result.data.length }
      },
      async update({ data: patch }) {
        const matches = [...collectionData.values()].filter((record) =>
          Object.entries(filter).every(([field, expected]) => record[field] === expected),
        )
        for (const record of matches) {
          Object.assign(record, patch)
        }
        return { stats: { updated: matches.length } }
      },
      async remove() {
        const matches = [...collectionData.values()].filter((record) =>
          Object.entries(filter).every(([field, expected]) => record[field] === expected),
        )
        for (const record of matches) {
          collectionData.delete(record._id ?? '')
        }
        return { stats: { removed: matches.length } }
      },
    })

    return {
      where(filter) {
        return makeQuery(filter)
      },
      doc(id) {
        return {
          async set({ data: record }) {
            collectionData.set(id, { ...record, _id: id })
          },
        }
      },
      async add({ data: record }) {
        const id = `doc_${nextId++}`
        collectionData.set(id, { ...record, _id: id })
        return { _id: id }
      },
    }
  }

  return {
    collection(name) {
      return createCollection(name)
    },
    async createCollection() {},
    async runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
      const previous = transactionTail
      let release!: () => void
      transactionTail = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous
      try {
        return await callback({
          collection: createCollection,
        })
      } finally {
        release()
      }
    },
  }
}

function makeRecord(ownerUid: string, configId: string, name: string): StoredRecord {
  return {
    ownerUid,
    configId,
    name,
    normalizedName: name.trim(),
    version: 1,
  }
}

describe('Fleet config repository atomic constraints', () => {
  it('allows only one concurrent insert with the same owner and name', async () => {
    const repo = createRepository(createFakeDatabase())

    const results = await Promise.all([
      repo.insertWithConstraints(makeRecord('owner_a', 'cfg_1', '並發同名'), 20),
      repo.insertWithConstraints(makeRecord('owner_a', 'cfg_2', '  並發同名  '), 20),
    ])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, code: 'duplicate-name' }])
  })

  it('enforces normalized-name uniqueness and owner isolation', async () => {
    const repo = createRepository(createFakeDatabase())

    const first = await repo.insertWithConstraints(makeRecord('owner_a', 'cfg_1', '主力艦隊'), 20)
    const duplicate = await repo.insertWithConstraints(
      makeRecord('owner_a', 'cfg_2', '  主力艦隊  '),
      20,
    )
    const otherOwner = await repo.insertWithConstraints(
      makeRecord('owner_b', 'cfg_3', '主力艦隊'),
      20,
    )

    expect(first.ok).toBe(true)
    expect(duplicate).toEqual({ ok: false, code: 'duplicate-name' })
    expect(otherOwner.ok).toBe(true)
  })

  it('enforces the 20-record limit across concurrent inserts', async () => {
    const repo = createRepository(createFakeDatabase())
    for (let i = 0; i < 19; i++) {
      const result = await repo.insertWithConstraints(
        makeRecord('owner_a', `cfg_${i}`, `配置${i}`),
        20,
      )
      expect(result.ok).toBe(true)
    }

    const results = await Promise.all([
      repo.insertWithConstraints(makeRecord('owner_a', 'cfg_20', '第20個'), 20),
      repo.insertWithConstraints(makeRecord('owner_a', 'cfg_21', '第21個'), 20),
    ])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, code: 'limit-reached' }])
  })

  it('protects rename uniqueness inside the owner transaction', async () => {
    const repo = createRepository(createFakeDatabase())
    await repo.insertWithConstraints(makeRecord('owner_a', 'cfg_1', '配置A'), 20)
    await repo.insertWithConstraints(makeRecord('owner_a', 'cfg_2', '配置B'), 20)

    const result = await repo.renameIfVersionAndNameAvailable(
      'owner_a',
      'cfg_2',
      1,
      '配置A',
      '配置A',
    )

    expect(result).toEqual({ ok: false, code: 'duplicate-name' })
  })
})

describe('Fleet config repository optimistic locking', () => {
  it('returns exactly one update success for two callers using the same version', async () => {
    const db = createFakeDatabase()
    const repo = createRepository(db)
    await repo.insertWithConstraints(makeRecord('owner_a', 'cfg_1', '配置A'), 20)

    const results = await Promise.all([
      repo.updateIfVersion('owner_a', 'cfg_1', 1, { name: '更新A' }),
      repo.updateIfVersion('owner_a', 'cfg_1', 1, { name: '更新B' }),
    ])

    expect(results.filter((result) => result !== null)).toHaveLength(1)
    expect(results.filter((result) => result === null)).toHaveLength(1)
  })

  it('rejects deleting a stale version', async () => {
    const db = createFakeDatabase()
    const repo = createRepository(db)
    await repo.insertWithConstraints(makeRecord('owner_a', 'cfg_1', '配置A'), 20)
    await repo.updateIfVersion('owner_a', 'cfg_1', 1, { name: '更新后' })

    await expect(repo.deleteByOwnerAndId('owner_a', 'cfg_1', 1)).resolves.toBe(false)
  })
})
