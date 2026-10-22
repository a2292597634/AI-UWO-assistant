import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { createMemoryRepository } from './helpers/memory-repository'
const require = createRequire(import.meta.url)
const { createCleanup } = require('../../cloudfunctions/message-board/core/cleanup-service.js')
const C = require('../../cloudfunctions/message-board/core/collections.js')

function harness() {
  const repo = createMemoryRepository()
  let now = 1791340000000
  const removed: string[] = []
  let failure = false
  const cleanup = () =>
    createCleanup({
      repo,
      now: () => now,
      storage: {
        async remove(id: string) {
          if (failure) throw new Error('offline storage failure')
          removed.push(id)
        },
      },
    })
  return {
    repo,
    removed,
    cleanup,
    now: () => now,
    fail: (value: boolean) => {
      failure = value
    },
    advance: () => {
      now += 60001
    },
  }
}

describe('有界清理持續前進', () => {
  it('超過一批到期留言連跑仍擦除第 21 筆，tombstone 不再阻塞', async () => {
    const h = harness()
    for (let i = 0; i < 41; i++)
      await h.repo.set(C.messages, `message-${i}`, {
        status: i === 40 ? 'pending-review' : 'withdrawn',
        deleted: false,
        text: '到期正文',
        nickName: '到期暱稱',
        expiresAt: h.now() - 1000 + i,
        revision: 1,
      })
    for (let i = 0; i < 4; i++) await h.cleanup().run()
    expect(await h.repo.get(C.messages, 'message-20')).toMatchObject({
      deleted: true,
      text: '',
      nickName: '',
      expiresAt: null,
    })
    expect(await h.repo.get(C.messages, 'message-40')).toMatchObject({
      status: 'rejected',
      deleted: false,
    })
  })

  it('前 20 個活躍 profile 與 asset 不阻塞後續候選，重建服務後仍繼續', async () => {
    const h = harness()
    for (let i = 0; i < 21; i++) {
      const id = String(i).padStart(2, '0')
      await h.repo.set(C.profiles, id, {
        ownerKey: id,
        profileRevision: 1,
        avatarAssetId: id,
        createdAt: h.now() - 172800000,
      })
      await h.repo.set(C.assets, id, {
        createdAt: h.now() - 172800000,
        publicFileId: `cloud://${id}`,
      })
      if (i < 20) await h.repo.set(C.owners, id, { profileRevision: 1 })
    }
    await h.cleanup().run()
    expect(await h.repo.get(C.profiles, '20')).not.toBeNull()
    await h.cleanup().run()
    expect(await h.repo.get(C.profiles, '20')).toBeNull()
    expect(await h.repo.get(C.assets, '20')).toBeNull()
    expect(await h.repo.get(C.profiles, '00')).not.toBeNull()
    expect(await h.repo.get(C.assets, '00')).not.toBeNull()
    expect(h.removed).toContain('cloud://20')
    // 第二輪已到尾端；原本活躍的最小 ID 失去引用後，下輪應回繞處理。
    await h.repo.remove(C.owners, '00')
    await h.cleanup().run()
    expect(await h.repo.get(C.profiles, '00')).toBeNull()
    expect(await h.repo.get(C.assets, '00')).toBeNull()
  })

  it('儲存刪除失敗後不遺失候選，租約到期後重入可完成', async () => {
    const h = harness()
    await h.repo.set(C.assets, 'orphan', {
      createdAt: h.now() - 172800000,
      publicFileId: 'cloud://orphan',
    })
    h.fail(true)
    await expect(h.cleanup().run()).rejects.toThrow('offline storage failure')
    expect(await h.repo.get(C.assets, 'orphan')).not.toBeNull()
    h.fail(false)
    h.advance()
    await h.cleanup().run()
    expect(await h.repo.get(C.assets, 'orphan')).toBeNull()
    expect(h.removed).toContain('cloud://orphan')
  })
})
