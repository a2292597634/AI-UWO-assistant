type Row = Record<string, unknown>
type Query = {
  eq?: Row
  before?: string | number
  beforeField?: string
  after?: string | null
  limit?: number
  order?: 'asc' | 'desc'
  field?: string
}
export function createMemoryRepository() {
  let rows = new Map<string, Row>()
  let tail = Promise.resolve()
  const port = (store: Map<string, Row>) => ({
    async get(collection: string, id: string) {
      return structuredClone(store.get(collection + ':' + id) ?? null)
    },
    async set(collection: string, id: string, data: Row) {
      store.set(collection + ':' + id, structuredClone({ ...data, _id: id }))
    },
    async remove(collection: string, id: string) {
      store.delete(collection + ':' + id)
    },
    async query(collection: string, query: Query = {}) {
      return [...store.entries()]
        .filter(
          ([key, row]) =>
            key.startsWith(collection + ':') &&
            Object.entries(query.eq ?? {}).every(([field, value]) => row[field] === value) &&
            (query.before === undefined ||
              row[query.beforeField ?? query.field ?? 'orderKey']! < query.before) &&
            (query.after === undefined ||
              query.after === null ||
              String(row[query.field ?? 'orderKey']) > query.after),
        )
        .map(([, row]) => structuredClone(row))
        .sort(
          (a, b) =>
            String(a[query.field ?? 'orderKey'] ?? a._id).localeCompare(
              String(b[query.field ?? 'orderKey'] ?? b._id),
            ) * (query.order === 'asc' ? 1 : -1),
        )
        .slice(0, query.limit ?? 100)
    },
  })
  return {
    get: (collection: string, id: string) => port(rows).get(collection, id),
    set: (collection: string, id: string, data: Row) => port(rows).set(collection, id, data),
    remove: (collection: string, id: string) => port(rows).remove(collection, id),
    query: (collection: string, query?: Query) => port(rows).query(collection, query),
    async transaction<T>(work: (tx: ReturnType<typeof port>) => Promise<T>): Promise<T> {
      const previous = tail
      let unlock: () => void = () => {}
      tail = new Promise<void>((resolve) => {
        unlock = resolve
      })
      await previous
      const candidate = structuredClone(rows)
      try {
        const result = await work(port(candidate))
        rows = candidate
        return result
      } finally {
        unlock()
      }
    },
  }
}
