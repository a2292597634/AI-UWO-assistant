import { describe, expect, it } from 'vitest'
import { createBoardDraftStore } from '../../miniprogram/domain/message-board/draft-store'
describe('留言草稿隔離與到期', () => {
  it('切換微信使用者不讀取上一位的正文，七天後不恢復', () => {
    const storage = new Map<string, unknown>()
    let now = 1791340000000
    const port = {
      get: (key: string) => storage.get(key),
      set: (key: string, value: unknown) => {
        storage.set(key, value)
      },
      remove: (key: string) => {
        storage.delete(key)
      },
    }
    const a = createBoardDraftStore(port, 'a'.repeat(64), () => now),
      b = createBoardDraftStore(port, 'b'.repeat(64), () => now)
    a.write({ body: '原作者草稿', gameServerId: 'UWOGL-US-01', updatedAt: now })
    expect(b.read()).toBeNull()
    expect(a.read()?.body).toBe('原作者草稿')
    now += 604800001
    expect(a.read()).toBeNull()
  })
  it('未確認身分和夾帶頭像／私有欄位的待確認資料均拒絕', () => {
    expect(() =>
      createBoardDraftStore({ get: () => null, set: () => {}, remove: () => {} }, 'unknown'),
    ).toThrow()
    const draft = {
      body: '正文',
      gameServerId: 'UWOGL-US-01',
      updatedAt: 1791340000000,
      pending: {
        action: 'createMessage',
        input: {
          operationId: '1791340000000_' + 'a'.repeat(32),
          profileRevision: 1,
          gameServerId: 'UWOGL-US-01',
          catalogVersion: '1',
          text: '正文',
          base64: '私人頭像',
        },
      },
    }
    const store = createBoardDraftStore(
      { get: () => draft, set: () => {}, remove: () => {} },
      'a'.repeat(64),
      () => 1791340000000,
    )
    expect(store.read()).toBeNull()
  })
})
