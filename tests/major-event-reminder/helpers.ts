import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { forecastMajorEvents } from '../../miniprogram/subpkg-trade/domain/major-event-forecast'
import type { RuntimeMajorEventReference } from '../../miniprogram/contracts/runtime-data'

export const require = createRequire(import.meta.url)
export const load = (name: string) =>
  existsSync(`cloudfunctions/major-event-reminder/${name}.js`)
    ? require(`../../cloudfunctions/major-event-reminder/${name}.js`)
    : {}
export const reference = JSON.parse(readFileSync('data/master/major-events.json', 'utf8'))
export const event = forecastMajorEvents(reference as RuntimeMajorEventReference, {
  nowUnixSeconds: 1793200000,
  horizonHours: 168,
})[0]!
export const configured = {
  templateId: 'T'.repeat(43),
  fields: [
    { source: 'eventType', key: 'thing1', type: 'thing' },
    { source: 'zone', key: 'thing2', type: 'thing' },
    { source: 'start', key: 'time3', type: 'time' },
    { source: 'lead', key: 'thing4', type: 'thing' },
    { source: 'note', key: 'thing5', type: 'thing' },
  ],
  miniprogramState: 'trial',
}

/** 交易保留完整狀態，只有 callback 成功才提交；模擬資料庫快照隔離。 */
export function memoryRepository() {
  let records = new Map<string, Record<string, unknown>>()
  let tail = Promise.resolve()
  const copy = <T>(value: T): T => structuredClone(value)
  const transaction = async (fn: (tx: ReturnType<typeof access>) => Promise<unknown>) => {
    let unlock!: () => void
    const previous = tail
    tail = new Promise<void>((resolve) => {
      unlock = resolve
    })
    await previous
    const snapshot = copy(records)
    try {
      const result = await fn(access(snapshot))
      records = snapshot
      return copy(result)
    } finally {
      unlock()
    }
  }
  function access(map: typeof records) {
    return {
      get: async (collection: string, id: string) => copy(map.get(`${collection}/${id}`) ?? null),
      put: async (collection: string, id: string, data: Record<string, unknown>) => {
        map.set(`${collection}/${id}`, copy(data))
      },
      remove: async (collection: string, id: string) => {
        map.delete(`${collection}/${id}`)
      },
    }
  }
  return {
    transaction,
    get: async (collection: string, id: string) => access(records).get(collection, id),
    scan: async (
      collection: string,
      filter: Record<string, unknown>,
      order: string,
      limit: number,
    ) =>
      [...records.entries()]
        .filter(
          ([key, row]) =>
            key.startsWith(`${collection}/`) &&
            Object.entries(filter).every(([name, value]) => {
              if (value && typeof value === 'object' && 'lte' in value)
                return Number(row[name]) <= Number(value.lte)
              return row[name] === value
            }),
        )
        .map(([key, row]) => ({ ...copy(row), _id: key.slice(collection.length + 1) }))
        .sort(
          (a, b) =>
            Number((a as Record<string, unknown>)[order]) -
            Number((b as Record<string, unknown>)[order]),
        )
        .slice(0, limit),
    snapshot: () => copy(records),
  }
}
