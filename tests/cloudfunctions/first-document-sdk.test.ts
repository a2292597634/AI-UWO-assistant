import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

// 忠實重現 wx-server-sdk 4.0.2 的預設行為：普通及交易 doc.get 缺文件均拋錯。
// 此替身不依賴雲函數 ignored node_modules，乾淨 npm ci 環境也必須執行。
function loadRepository(name: string, fault?: Error) {
  const filename = resolve('cloudfunctions', name, 'index.js')
  const localRequire = createRequire(filename)
  let repo: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  const database = (options: Record<string, unknown> = {}) => {
    const collection = (_name: string) => {
      const query = {
        where: () => query,
        skip: () => query,
        limit: () => query,
        get: async () => ({ data: [] }),
        add: async () => ({ _id: 'offline-document' }),
        doc: (id: string) => ({
          get: async () => {
            if (fault) throw fault
            if (options.throwOnNotFound !== false)
              throw new Error(`document.get:fail document with _id ${id} does not exist`)
            return { data: null }
          },
          set: async () => ({ updated: 0, upsertedId: id }),
        }),
      }
      return query
    }
    return {
      collection,
      runTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({ collection }),
      createCollection: async () => ({}),
    }
  }
  const repositoryFile = name === 'officer-maintenance' ? './repository' : `./${name}-repository`
  runInNewContext(readFileSync(filename, 'utf8'), {
    exports: {},
    console,
    process: { env: {} },
    require: (request: string) => {
      if (request === 'wx-server-sdk')
        return { DYNAMIC_CURRENT_ENV: 'offline', init: () => {}, database }
      if (request === repositoryFile)
        return {
          createRepository: (db: unknown) => {
            repo = localRequire(request).createRepository(db)
            return repo
          },
        }
      return localRequire(request)
    },
  })
  return repo
}

const cases = [
  {
    name: 'fleet-config',
    method: 'insertWithConstraints',
    args: [{ ownerUid: 'new-user', configId: 'first', name: '首次配置', scope: 'battle' }, 10],
    want: { ok: true, data: { ownerUid: 'new-user', configId: 'first' } },
  },
  {
    name: 'officer-custom',
    method: 'insertIfOwnerBelowLimit',
    args: [{ ownerUid: 'new-user', submissionId: 'first', revision: 1 }, 50],
    want: { ownerUid: 'new-user', submissionId: 'first', revision: 1 },
  },
  {
    name: 'officer-custom',
    method: 'insertRevisionIfAbsent',
    args: [{ ownerUid: 'new-user', submissionId: 'first', revision: 2 }],
    want: { ownerUid: 'new-user', submissionId: 'first', revision: 2 },
  },
  {
    name: 'officer-maintenance',
    method: 'insertIfAbsent',
    args: [{ ownerUid: 'new-user', idempotencyKey: 'first', workOrderId: 'first' }],
    want: { ownerUid: 'new-user', workOrderId: 'first', revision: 1 },
  },
]

describe('三雲函數入口的首次文件建立', () => {
  it.each(cases)('$name $method 在 SDK 缺文件語義下仍完成首次建立', async (item) => {
    const repo = loadRepository(item.name)
    await expect(repo[item.method]!(...item.args)).resolves.toMatchObject(item.want)
  })

  it.each(cases)('$name $method 不吞掉非缺文件的資料庫故障', async (item) => {
    const fault = new Error('offline permission denied')
    const repo = loadRepository(item.name, fault)
    await expect(repo[item.method]!(...item.args)).rejects.toThrow('offline permission denied')
  })
})
