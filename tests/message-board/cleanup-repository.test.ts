import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { createRepository } = require('../../cloudfunctions/message-board/core/repository.js')

describe('回收掃描的資料庫查詢邊界', () => {
  it('相同建立時間按文件 ID 跨批前進，並排除未到期候選', async () => {
    const rows = Array.from({ length: 22 }, (_, i) => ({
      _id: String(i).padStart(2, '0'),
      createdAt: i === 21 ? 2000 : 1000,
    }))
    const db = {
      command: {
        lt: (value: number) => ({ lt: value }),
        gt: (value: string) => ({ gt: value }),
      },
      collection: () => ({
        where: (filters: Record<string, { lt?: number; gt?: string }>) => ({
          orderBy: (field: string, direction: string) => ({
            limit: (limit: number) => ({
              get: async () => ({
                data: rows
                  .filter((row) =>
                    Object.entries(filters).every(([key, condition]) => {
                      const value = row[key as keyof typeof row]
                      return condition.lt === undefined
                        ? String(value) > condition.gt!
                        : Number(value) < condition.lt
                    }),
                  )
                  .sort(
                    (a, b) =>
                      String(a[field as keyof typeof a]).localeCompare(
                        String(b[field as keyof typeof b]),
                      ) * (direction === 'asc' ? 1 : -1),
                  )
                  .slice(0, limit),
              }),
            }),
          }),
        }),
      }),
    }
    const repo = createRepository(db)
    const first = await repo.query('assets', {
      field: '_id',
      beforeField: 'createdAt',
      before: 1500,
      order: 'asc',
      limit: 20,
    })
    const next = await repo.query('assets', {
      field: '_id',
      beforeField: 'createdAt',
      before: 1500,
      after: first[19]._id,
      order: 'asc',
      limit: 20,
    })
    expect(first.map((row: { _id: string }) => row._id)).toHaveLength(20)
    expect(next.map((row: { _id: string }) => row._id)).toEqual(['20'])
  })
})
