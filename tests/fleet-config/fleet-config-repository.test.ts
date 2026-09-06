import { describe, expect, it } from 'vitest'

/* eslint-disable @typescript-eslint/no-require-imports */
const { createRepository, getStoredScope } =
  require('../../cloudfunctions/fleet-config/fleet-config-repository') as {
    createRepository: (db: FakeDatabase) => FleetConfigRepository
    getStoredScope: (record: StoredRecord) => 'battle' | 'adventure' | 'unclassified'
  }
/* eslint-enable @typescript-eslint/no-require-imports */

interface StoredRecord {
  _id?: string
  ownerUid: string
  configId: string
  name: string
  normalizedName?: string
  scope?: 'battle' | 'adventure' | 'unclassified'
  [key: string]: unknown
}

interface QueryResult {
  data: StoredRecord[]
}

interface FakeDocument {
  get(): Promise<{ data?: StoredRecord }>
  set(options: { data: StoredRecord }): Promise<void>
  update(options: { data: Partial<StoredRecord> }): Promise<{ stats: { updated: number } }>
  remove(): Promise<{ stats: { removed: number } }>
}

interface FakeCollection {
  where(filter: Record<string, unknown>): FakeQuery
  doc(id: string): FakeDocument
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
  listByOwner(
    ownerUid: string,
    scope?: 'battle' | 'adventure' | 'unclassified',
  ): Promise<StoredRecord[]>
  insert(record: StoredRecord): Promise<StoredRecord>
  insertWithConstraints(
    record: StoredRecord,
    maxConfigsPerScope: number,
  ): Promise<
    { ok: true; data: StoredRecord } | { ok: false; code: 'duplicate-name' | 'limit-reached' }
  >
  renameIfVersionAndNameAvailable(
    ownerUid: string,
    configId: string,
    expectedVersion: number,
    name: string,
    normalizedName: string,
    scope: 'battle' | 'adventure',
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
  classifyIfVersionAndConstraints(
    ownerUid: string,
    configId: string,
    expectedVersion: number,
    targetScope: 'battle' | 'adventure',
    maxConfigsPerScope: number,
  ): Promise<
    | { ok: true; data: StoredRecord }
    | {
        ok: false
        code: 'not-found' | 'conflict' | 'invalid-state' | 'duplicate-name' | 'limit-reached'
      }
  >
}

function createFakeDatabase(
  options: { createCollectionError?: unknown; documentUpdateNoop?: boolean } = {},
): FakeDatabase {
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

  const createCollection = (name: string, inTransaction = false): FakeCollection => {
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
        if (inTransaction) {
          throw new Error('CloudBase transaction does not support where()')
        }
        return makeQuery(filter)
      },
      doc(id) {
        return {
          async get() {
            return { data: collectionData.get(id) }
          },
          async set({ data: record }) {
            collectionData.set(id, { ...record, _id: id })
          },
          async update({ data: patch }) {
            const record = collectionData.get(id)
            if (!record) return { stats: { updated: 0 } }
            if (options.documentUpdateNoop) return { stats: { updated: 0 } }
            Object.assign(record, patch)
            return { stats: { updated: 1 } }
          },
          async remove() {
            const removed = collectionData.delete(id)
            return { stats: { removed: removed ? 1 : 0 } }
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
    async createCollection() {
      if (options.createCollectionError) throw options.createCollectionError
    },
    async runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
      const previous = transactionTail
      let release!: () => void
      transactionTail = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous
      try {
        return await callback({
          collection: (name) => createCollection(name, true),
        })
      } finally {
        release()
      }
    },
  }
}

function makeRecord(
  ownerUid: string,
  configId: string,
  name: string,
  scope: 'battle' | 'adventure' = 'battle',
): StoredRecord {
  return {
    ownerUid,
    configId,
    name,
    normalizedName: name.trim(),
    scope,
    version: 1,
  }
}

describe('Fleet config repository atomic constraints', () => {
  it('忽略 CloudBase 已存在集合的數值 errCode 並繼續查詢', async () => {
    const repo = createRepository(
      createFakeDatabase({
        createCollectionError: {
          errCode: -1,
          code: 'DATABASE_COLLECTION_ALREADY_EXIST',
        },
      }),
    )

    await expect(repo.listByOwner('owner_a', 'battle')).resolves.toEqual([])
  })

  it('缺少 scope 的舊記錄視為 unclassified', () => {
    const legacy = makeRecord('owner_a', 'cfg_legacy', '舊配置')
    delete legacy.scope
    expect(getStoredScope(legacy)).toBe('unclassified')
  })

  it('allows only one concurrent insert with the same owner and name', async () => {
    const repo = createRepository(createFakeDatabase())

    const results = await Promise.all([
      repo.insertWithConstraints(makeRecord('owner_a', 'cfg_1', '並發同名'), 10),
      repo.insertWithConstraints(makeRecord('owner_a', 'cfg_2', '  並發同名  '), 10),
    ])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, code: 'duplicate-name' }])
  })

  it('enforces normalized-name uniqueness and owner isolation', async () => {
    const repo = createRepository(createFakeDatabase())

    const first = await repo.insertWithConstraints(makeRecord('owner_a', 'cfg_1', '主力艦隊'), 10)
    const duplicate = await repo.insertWithConstraints(
      makeRecord('owner_a', 'cfg_2', '  主力艦隊  '),
      10,
    )
    const otherOwner = await repo.insertWithConstraints(
      makeRecord('owner_b', 'cfg_3', '主力艦隊'),
      10,
    )

    expect(first.ok).toBe(true)
    expect(duplicate).toEqual({ ok: false, code: 'duplicate-name' })
    expect(otherOwner.ok).toBe(true)
  })

  it('不同 scope 可以使用相同名稱，但同 scope 仍拒絕重名', async () => {
    const repo = createRepository(createFakeDatabase())

    const battle = await repo.insertWithConstraints(
      makeRecord('owner_a', 'cfg_battle', '主力艦隊', 'battle'),
      10,
    )
    const adventure = await repo.insertWithConstraints(
      makeRecord('owner_a', 'cfg_adventure', '主力艦隊', 'adventure'),
      10,
    )
    const duplicate = await repo.insertWithConstraints(
      makeRecord('owner_a', 'cfg_duplicate', '主力艦隊', 'battle'),
      10,
    )

    expect(battle.ok).toBe(true)
    expect(adventure.ok).toBe(true)
    expect(duplicate).toEqual({ ok: false, code: 'duplicate-name' })
  })

  it('enforces the 10-record limit independently for each scope', async () => {
    const repo = createRepository(createFakeDatabase())
    for (let i = 0; i < 10; i++) {
      const result = await repo.insertWithConstraints(
        makeRecord('owner_a', `cfg_${i}`, `配置${i}`),
        10,
      )
      expect(result.ok).toBe(true)
    }

    for (let i = 0; i < 10; i++) {
      const result = await repo.insertWithConstraints(
        makeRecord('owner_a', `adventure_${i}`, `冒險${i}`, 'adventure'),
        10,
      )
      expect(result.ok).toBe(true)
    }

    const results = await Promise.all([
      repo.insertWithConstraints(makeRecord('owner_a', 'cfg_20', '第11個'), 10),
      repo.insertWithConstraints(makeRecord('owner_a', 'cfg_21', '第12個'), 10),
    ])

    expect(results).toEqual([
      { ok: false, code: 'limit-reached' },
      { ok: false, code: 'limit-reached' },
    ])

    const adventureOverflow = await repo.insertWithConstraints(
      makeRecord('owner_a', 'adventure_10', '冒險11', 'adventure'),
      10,
    )
    expect(adventureOverflow).toEqual({ ok: false, code: 'limit-reached' })
  })

  it('protects rename uniqueness inside the owner transaction', async () => {
    const repo = createRepository(createFakeDatabase())
    await repo.insertWithConstraints(makeRecord('owner_a', 'cfg_1', '配置A'), 10)
    await repo.insertWithConstraints(makeRecord('owner_a', 'cfg_2', '配置B'), 10)

    const result = await repo.renameIfVersionAndNameAvailable(
      'owner_a',
      'cfg_2',
      1,
      '配置A',
      '配置A',
      'battle',
    )

    expect(result).toEqual({ ok: false, code: 'duplicate-name' })
  })
})

describe('Fleet config repository optimistic locking', () => {
  it('returns exactly one update success for two callers using the same version', async () => {
    const db = createFakeDatabase()
    const repo = createRepository(db)
    await repo.insertWithConstraints(makeRecord('owner_a', 'cfg_1', '配置A'), 10)

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

  it('removes deleted names from the owner lock index', async () => {
    const repo = createRepository(createFakeDatabase())
    await expect(
      repo.insertWithConstraints(makeRecord('owner_a', 'cfg_1', '可重用名稱'), 10),
    ).resolves.toMatchObject({ ok: true })

    await expect(repo.deleteByOwnerAndId('owner_a', 'cfg_1', 1)).resolves.toBe(true)
    await expect(
      repo.insertWithConstraints(makeRecord('owner_a', 'cfg_2', '可重用名稱'), 10),
    ).resolves.toMatchObject({ ok: true })
  })

  it('條件更新影響零筆時回報 conflict 而不是成功', async () => {
    const repo = createRepository(createFakeDatabase({ documentUpdateNoop: true }))
    await repo.insert(makeRecord('owner_a', 'cfg_1', '配置A'))

    await expect(
      repo.renameIfVersionAndNameAvailable('owner_a', 'cfg_1', 1, '配置B', '配置B', 'battle'),
    ).resolves.toEqual({ ok: false, code: 'conflict' })
  })

  it('分類舊記錄時檢查版本、scope 上限與名稱唯一性', async () => {
    const db = createFakeDatabase()
    const repo = createRepository(db)
    const legacy = {
      ...makeRecord('owner_a', 'legacy', '主力艦隊'),
      fleetState: { preserved: true },
    }
    delete legacy.scope
    await repo.insert(legacy)

    const result = await repo.classifyIfVersionAndConstraints(
      'owner_a',
      'legacy',
      1,
      'adventure',
      10,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.scope).toBe('adventure')
      expect(result.data.version).toBe(2)
      expect(result.data.fleetState).toEqual({ preserved: true })
    }
  })

  it('不能將已分類記錄再次分類', async () => {
    const repo = createRepository(createFakeDatabase())
    await repo.insert(makeRecord('owner_a', 'cfg_1', '配置A', 'battle'))

    await expect(
      repo.classifyIfVersionAndConstraints('owner_a', 'cfg_1', 1, 'adventure', 10),
    ).resolves.toEqual({ ok: false, code: 'invalid-state' })
  })
})
