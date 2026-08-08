import { describe, expect, it } from 'vitest'

/* eslint-disable @typescript-eslint/no-require-imports */
const { createRepository } =
  require('../../cloudfunctions/fleet-config/fleet-config-repository') as {
    createRepository: (db: FakeDatabase) => FleetConfigRepository
  }
/* eslint-enable @typescript-eslint/no-require-imports */

interface FleetConfigRecord {
  _id?: string
  configId: string
  ownerUid: string
  version: number
  updatedAt: string
  [key: string]: unknown
}

interface QueryResult {
  data: FleetConfigRecord[]
}

interface Query {
  get(): Promise<QueryResult>
  limit(count: number): Query
  update(input: { data: Record<string, unknown> }): Promise<{ stats: { updated: number } }>
  remove(): Promise<{ stats: { removed: number } }>
}

interface FakeCollection {
  where(query: Record<string, unknown>): Query
  add(input: { data: Record<string, unknown> }): Promise<{ _id: string }>
}

interface FakeDatabase {
  createCollection(name: string): Promise<void>
  collection(name: string): FakeCollection
}

interface FleetConfigRepository {
  listByOwner(ownerUid: string): Promise<FleetConfigRecord[]>
  updateIfVersion(
    ownerUid: string,
    configId: string,
    expectedVersion: number,
    patch: Record<string, unknown>,
  ): Promise<FleetConfigRecord | null>
  deleteByOwnerAndId(ownerUid: string, configId: string, expectedVersion: number): Promise<boolean>
}

function createFakeDatabase(options: {
  records?: FleetConfigRecord[]
  createCollection?: () => Promise<void>
  waitForGets?: number
}) {
  const records = options.records ?? []
  let createCollectionCalls = 0
  let getCalls = 0
  let releaseGets: (() => void) | undefined
  const allGetsReady = new Promise<void>((resolve) => {
    releaseGets = resolve
  })

  const matches = (record: FleetConfigRecord, query: Record<string, unknown>) =>
    Object.entries(query).every(([key, value]) => record[key] === value)

  const db: FakeDatabase = {
    async createCollection(name: string) {
      expect(name).toBe('fleet_configs')
      createCollectionCalls += 1
      await options.createCollection?.()
    },
    collection(name: string) {
      expect(name).toBe('fleet_configs')
      return {
        where(query: Record<string, unknown>) {
          let limitCount: number | undefined
          const queryApi: Query = {
            async get() {
              if (options.waitForGets) {
                getCalls += 1
                if (getCalls === options.waitForGets) releaseGets?.()
                await allGetsReady
              }
              const matched = records.filter((record) => matches(record, query))
              return { data: limitCount ? matched.slice(0, limitCount) : matched }
            },
            limit(count: number) {
              limitCount = count
              return queryApi
            },
            async update(input: { data: Record<string, unknown> }) {
              const matched = records.filter((record) => matches(record, query))
              for (const record of matched) Object.assign(record, input.data)
              return { stats: { updated: matched.length } }
            },
            async remove() {
              const matched = records.filter((record) => matches(record, query))
              for (const record of matched) records.splice(records.indexOf(record), 1)
              return { stats: { removed: matched.length } }
            },
          }
          return queryApi
        },
        async add(input: { data: Record<string, unknown> }) {
          const record = input.data as FleetConfigRecord
          records.push(record)
          return { _id: record._id ?? 'new-id' }
        },
      }
    },
  }

  return { db, records, getCreateCollectionCalls: () => createCollectionCalls }
}

function createRecord(overrides: Partial<FleetConfigRecord> = {}): FleetConfigRecord {
  return {
    _id: 'mongo-id',
    configId: 'cfg_1',
    ownerUid: 'owner_1',
    version: 1,
    updatedAt: '2026-08-08T00:00:00.000Z',
    name: '測試配置',
    ...overrides,
  }
}

describe('fleet-config repository optimistic locking', () => {
  it('returns exactly one success when two updates use the same version', async () => {
    const { db, records } = createFakeDatabase({ records: [createRecord()], waitForGets: 2 })
    const repo = createRepository(db)
    const patch = { fleetState: { ships: [] } }

    const results = await Promise.all([
      repo.updateIfVersion('owner_1', 'cfg_1', 1, patch),
      repo.updateIfVersion('owner_1', 'cfg_1', 1, patch),
    ])

    expect(results.filter((result) => result !== null)).toHaveLength(1)
    expect(results.filter((result) => result === null)).toHaveLength(1)
    expect(records[0].version).toBe(2)
  })

  it('returns conflict when deleting a stale version', async () => {
    const { db, records } = createFakeDatabase({ records: [createRecord({ version: 2 })] })
    const repo = createRepository(db)

    const deleted = await repo.deleteByOwnerAndId('owner_1', 'cfg_1', 1)

    expect(deleted).toBe(false)
    expect(records).toHaveLength(1)
  })
})

describe('fleet-config repository collection setup', () => {
  it('propagates unknown collection creation errors and retries after failure', async () => {
    let attempts = 0
    const { db, getCreateCollectionCalls } = createFakeDatabase({
      createCollection: async () => {
        attempts += 1
        if (attempts === 1) throw { errCode: 'DATABASE_PERMISSION_DENIED' }
      },
    })
    const repo = createRepository(db)

    await expect(repo.listByOwner('owner_1')).rejects.toMatchObject({
      errCode: 'DATABASE_PERMISSION_DENIED',
    })
    await expect(repo.listByOwner('owner_1')).resolves.toEqual([])
    expect(getCreateCollectionCalls()).toBe(2)
  })

  it('continues when CloudBase reports that the collection already exists', async () => {
    const { db, getCreateCollectionCalls } = createFakeDatabase({
      createCollection: async () => {
        throw { errCode: 'DATABASE_COLLECTION_ALREADY_EXIST' }
      },
    })
    const repo = createRepository(db)

    await expect(repo.listByOwner('owner_1')).resolves.toEqual([])
    expect(getCreateCollectionCalls()).toBe(1)
  })
})
