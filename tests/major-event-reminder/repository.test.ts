import { describe, expect, it } from 'vitest'
import { forecastMajorEvents } from '../../miniprogram/subpkg-trade/domain/major-event-forecast'
import type { RuntimeMajorEventReference } from '../../miniprogram/contracts/runtime-data'
import { configured, load, memoryRepository, reference } from './helpers'

function fakeDatabase() {
  const memory = memoryRepository()
  const collection = (
    name: string,
    tx?: Parameters<Parameters<typeof memory.transaction>[0]>[0],
  ) => ({
    doc: (id: string) => ({
      get: async () => ({ data: (await (tx ? tx.get(name, id) : memory.get(name, id))) || [] }),
      set: ({ data }: { data: Record<string, unknown> }) => {
        if (!tx) throw new Error('寫入必須在交易內')
        return tx.put(name, id, data)
      },
      remove: () => {
        if (!tx) throw new Error('刪除必須在交易內')
        return tx.remove(name, id)
      },
    }),
    where: (filter: Record<string, unknown>) => ({
      orderBy: (order: string, direction: string) => ({
        limit: (limit: number) => ({
          get: async () => {
            expect(direction).toBe('asc')
            expect(limit).toBeLessThanOrEqual(100)
            return { data: await memory.scan(name, filter, order, limit) }
          },
        }),
      }),
    }),
  })
  return {
    collection,
    command: { lte: (value: number) => ({ lte: value }) },
    runTransaction: (fn: (tx: { collection: typeof collection }) => Promise<unknown>) =>
      memory.transaction((tx) => fn({ collection: (name: string) => collection(name, tx) })),
    memory,
  }
}
describe('CloudBase repository 真實交易適配', () => {
  it.each(['authorize', 'activate'])(
    '交易內的 %s 恢復與新 prepare 爭同一個剩餘名額，不會產生第21場或遺失待辦',
    async (action) => {
      const { createRepository } = load('repository')
      const db = fakeDatabase()
      const repo = createRepository(db)
      const { createService } = load('service')
      const now = 1793200000
      const service = createService(repo, {
        reference,
        fingerprint: 'v1',
        config: configured,
        now: () => now,
      })
      const call = (name: string, input: object = {}) => service.dispatch(name, input, 'owner-a')
      const events = forecastMajorEvents(reference as RuntimeMajorEventReference, {
        nowUnixSeconds: now + 12000,
        horizonHours: 168,
      }).slice(0, 21)
      const first = (await call('prepare', { occurrence: events[0], requestId: 'a-first' })).data
      await call('authorize', { sessionId: first.sessionId, leadSeconds: 600, requestId: 'a-auth' })
      const opened = await call('completeAd', { sessionId: first.sessionId, requestId: 'a-ad' })
      await call('cancel', {
        key: first.subscription.key,
        expectedVersion: opened.data.subscription.version,
        requestId: 'a-cancel',
      })
      const restored = (await call('prepare', { occurrence: events[0], requestId: 'a-restored' }))
        .data
      for (const [n, occurrence] of events.slice(1, 20).entries())
        expect((await call('prepare', { occurrence, requestId: `b-${n}` })).ok).toBe(true)
      const input =
        action === 'authorize'
          ? { sessionId: restored.sessionId, leadSeconds: 600, requestId: 'a-recover' }
          : { sessionId: restored.sessionId, requestId: 'a-recover' }
      const results = await Promise.all([
        call(action, input),
        call('prepare', { occurrence: events[20], requestId: 'last-prepare' }),
      ])
      expect(results.filter((result) => result.ok)).toHaveLength(1)
      expect(results.filter((result) => result.code === 'limit')).toHaveLength(1)
      const index = [...db.memory.snapshot().entries()].find(([key]) =>
        key.startsWith('major_reminder_owners/'),
      )![1]
      expect(index.active).toHaveLength(20)
      const listed = (await call('list')).data.subscriptions as { key: string }[]
      const unfinished = [...db.memory.snapshot().entries()].filter(
        ([key, row]) =>
          key.startsWith('major_reminder_subscriptions/') &&
          (row.slots as { status: string }[]).some((slot) =>
            ['unsubscribed', 'authorized', 'pending', 'sending', 'unknown'].includes(slot.status),
          ),
      )
      expect(unfinished).toHaveLength(20)
      expect(unfinished.every(([, row]) => listed.some((sub) => sub.key === row.key))).toBe(true)
    },
  )
  it('SDK 回傳非物件、空陣列或空物件時不當成 owner 或 session', async () => {
    const { createRepository } = load('repository')
    for (const data of [undefined, null, [], '', 'owner-a', 1, true, {}]) {
      const repo = createRepository({
        collection: () => ({ doc: () => ({ get: async () => ({ data }) }) }),
      })
      expect(await repo.get('sessions', 'missing')).toBeNull()
    }
  })
  it('對缺失文件、唯一身分、併發20場上限與待辦列出使用真實 service', async () => {
    const { createRepository } = load('repository')
    expect(typeof createRepository).toBe('function')
    const db = fakeDatabase()
    const repo = createRepository(db)
    expect(await repo.get('subscriptions', 'missing')).toBeNull()
    const { createService } = load('service')
    const now = 1793200000
    const service = createService(repo, {
      reference,
      fingerprint: 'v1',
      config: configured,
      now: () => now,
    })
    const events = forecastMajorEvents(reference as RuntimeMajorEventReference, {
      nowUnixSeconds: now + 12000,
      horizonHours: 168,
    }).slice(0, 21)
    const results = await Promise.all(
      events.map((event, n) =>
        service.dispatch('prepare', { occurrence: event, requestId: `p-${n}` }, 'owner-a'),
      ),
    )
    expect(results.filter((result) => result.ok)).toHaveLength(20)
    expect(results.filter((result) => result.code === 'limit')).toHaveLength(1)
    expect((await service.dispatch('list', {}, 'owner-a')).data.subscriptions).toHaveLength(20)
    expect((await service.dispatch('list', {}, 'owner-b')).data.subscriptions).toHaveLength(0)
    expect(
      [...db.memory.snapshot().keys()].filter((key) => key.startsWith('major_reminder_owners/')),
    ).toHaveLength(1)
  })
  it('查詢條件只接受服務端已知集合與有界索引掃描', async () => {
    const { createRepository } = load('repository')
    expect(typeof createRepository).toBe('function')
    const db = fakeDatabase()
    const repo = createRepository(db)
    await repo.transaction(
      async (tx: { put: (collection: string, id: string, data: object) => Promise<void> }) => {
        await tx.put('jobs', 'one', { status: 'pending', nextRunAt: 1 })
        await tx.put('jobs', 'two', { status: 'pending', nextRunAt: 100 })
      },
    )
    expect(
      await repo.scan('jobs', { status: 'pending', nextRunAt: { lte: 10 } }, 'nextRunAt', 50),
    ).toEqual([{ _id: 'one', status: 'pending', nextRunAt: 1 }])
    await expect(repo.scan('untrusted', {}, 'nextRunAt', 1)).rejects.toThrow()
    await expect(repo.scan('jobs', {}, 'nextRunAt', 10000)).rejects.toThrow()
  })
})

// 真雲 SDK 對缺失文件會拋 errCode -1，不能與其他資料庫錯誤混為一談。
describe('CloudBase 缺失文件拋錯適配', () => {
  function throwingDatabase(errorFor: (id: string) => Error) {
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          get: async () => {
            throw errorFor(id)
          },
        }),
      }),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(db),
    }
    return db
  }
  it.each([null, undefined, '非 Error 拒絕'])('非 Error 拒絕 %s 原樣拋出', async (rejection) => {
    const { createRepository } = load('repository')
    const repo = createRepository(
      throwingDatabase(() => {
        throw rejection
      }),
    )
    await expect(repo.get('owners', 'missing-owner')).rejects.toBe(rejection)
  })
  const missing = (id: string) =>
    Object.assign(new Error(`document.get:fail document with _id ${id} does not exist`), {
      errCode: -1,
    })
  it('交易內外只把當次文件的精確缺失錯誤轉為 null，新 owner 的 list 回空清單', async () => {
    const { createRepository } = load('repository')
    const repo = createRepository(throwingDatabase(missing))
    expect(await repo.get('owners', 'missing-owner')).toBeNull()
    expect(
      await repo.transaction((tx: { get: (name: string, id: string) => Promise<unknown> }) =>
        tx.get('owners', 'missing-owner'),
      ),
    ).toBeNull()
    const { createService } = load('service')
    const service = createService(repo, { reference, fingerprint: 'v1', config: configured })
    expect(await service.dispatch('list', {}, 'new-owner')).toEqual({
      ok: true,
      data: { subscriptions: [] },
    })
  })
  it.each([
    [-1, 'document.get:fail network timeout'],
    [-1, 'document.get:fail permission denied'],
    [-1, 'document.get:fail collection major_reminder_owners does not exist'],
    [-1, 'document.get:fail document with _id other-owner does not exist'],
    [-1, 'document.get:fail document with _id missing-owner does not exist; permission denied'],
    [-2, 'document.get:fail document with _id missing-owner does not exist'],
  ])('錯誤碼 %s 與訊息 %s 在交易內外均保持拋出', async (errCode, message) => {
    const error = Object.assign(new Error(message), { errCode })
    const { createRepository } = load('repository')
    const repo = createRepository(throwingDatabase(() => error))
    await expect(repo.get('owners', 'missing-owner')).rejects.toBe(error)
    await expect(
      repo.transaction((tx: { get: (name: string, id: string) => Promise<unknown> }) =>
        tx.get('owners', 'missing-owner'),
      ),
    ).rejects.toBe(error)
  })
})
