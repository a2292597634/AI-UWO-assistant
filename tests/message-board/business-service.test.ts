import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { createMemoryRepository } from './helpers/memory-repository'
const require = createRequire(import.meta.url)
const { createBoardService } = require('../../cloudfunctions/message-board/core/service.js')
const catalog = require('../../cloudfunctions/message-board/game-servers.json')
const A = { ownerKey: 'a'.repeat(64), openId: 'author-a-private', appId: 'test-app' }
const B = { ownerKey: 'b'.repeat(64), openId: 'author-b-private', appId: 'test-app' }
const ADMIN = { ownerKey: 'c'.repeat(64), openId: 'admin-private', appId: 'test-app' }
function harness() {
  const repo = createMemoryRepository()
  let now = 1791340000000,
    nonce = 0
  const admins = new Set([ADMIN.openId])
  const safetyCalls: string[] = []
  const service = createBoardService({
    repo,
    catalog,
    clock: () => now,
    secret: 's'.repeat(64),
    adminOpenIds: () => admins,
    policy: () => ({ read: true, write: true, review: true }),
    safety: {
      async checkText(text: string) {
        safetyCalls.push(text)
        return { suggest: 'pass', errCode: 0 }
      },
    },
    storage: {
      async publish() {
        return 'cloud://test/public-approved.png'
      },
      async remove() {},
    },
  })
  const op = () => ({ operationId: `${now}_${(++nonce).toString(16).padStart(32, '0')}` })
  const invoke = (action: string, input: Record<string, unknown>, actor = A) =>
    service.invoke(action, input, actor)
  const profile = async (nickName = '航海者') => {
    const result = await invoke('saveProfile', {
      ...op(),
      profileRevision: 0,
      nickName,
      avatarAssetId: null,
    })
    expect(result.ok).toBe(true)
    return result.data
  }
  const create = async (text = '第一次留言', profileRevision = 1) => {
    const result = await invoke('createMessage', {
      ...op(),
      profileRevision,
      gameServerId: 'UWOGL-US-01',
      catalogVersion: '1',
      text,
    })
    expect(result.ok).toBe(true)
    return result.data
  }
  const target = (message: { messageId: string; revision: number }) => ({
    ...op(),
    messageId: message.messageId,
    expectedRevision: message.revision,
  })
  return {
    repo,
    service,
    invoke,
    op,
    profile,
    create,
    target,
    admins,
    safetyCalls,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('永久留言板權限與審核業務', () => {
  it('微信呼叫只處理本人的安全任務；缺少平台憑證時不消耗重試次數', async () => {
    const h = harness()
    await h.profile('本人暱稱')
    await h.invoke(
      'saveProfile',
      { ...h.op(), profileRevision: 0, nickName: '另一用戶', avatarAssetId: null },
      B,
    )
    h.service.context.safety.available = () => false
    await h.service.runDue()
    expect(h.safetyCalls).toEqual([])
    h.service.context.safety.available = () => true
    await h.service.runDue(A.ownerKey)
    expect(h.safetyCalls).toEqual(['本人暱稱'])
    const rows = await h.repo.query('message_board_tasks')
    expect(rows.find((row) => row.ownerKey === B.ownerKey)?.attempts).toBe(0)
  })
  it('已檢查內容與實際正文不一致時，新的公開查詢立即排除', async () => {
    const h = harness()
    await h.profile()
    await h.create()
    await h.service.runDue()
    const m = (await h.invoke('listMine', {})).data.items[0]
    await h.invoke('approve', h.target(m), ADMIN)
    const row = await h.repo.get('message_board_messages', m.messageId)
    await h.repo.set('message_board_messages', m.messageId, { ...row, text: '與已檢查內容不同' })
    expect((await h.invoke('listPublic', {}, B)).data.items).toEqual([])
  })
  it('失敗的寫入也受嘗試額度限制，但不留下部分留言或重複扣同一操作', async () => {
    const h = harness()
    await h.profile()
    await h.create()
    h.advance(60001)
    for (let i = 0; i < 5; i++)
      expect(
        (
          await h.invoke('withdrawMessage', {
            ...h.op(),
            messageId: '0'.repeat(32),
            expectedRevision: 1,
          })
        ).code,
      ).toBe('not-found')
    expect(
      (
        await h.invoke('withdrawMessage', {
          ...h.op(),
          messageId: '0'.repeat(32),
          expectedRevision: 1,
        })
      ).code,
    ).toBe('rate-limited')
    expect((await h.invoke('listMine', {})).data.items).toHaveLength(1)
  })
  it('管理員限制自己時，操作額度寫回不能覆蓋限制狀態', async () => {
    const h = harness()
    await h.profile()
    const m = await h.create()
    h.admins.add(A.openId)
    expect((await h.invoke('restrictAuthor', { ...h.target(m), reason: '暫停自身投稿' })).ok).toBe(
      true,
    )
    expect((await h.invoke('getViewer', {})).data.restricted).toBe(true)
  })
  it('窗口剩餘量可縮小批次，游標從最後真正返回的項目繼續', async () => {
    const h = harness()
    await h.profile()
    await h.create()
    await h.service.runDue()
    const first = (await h.invoke('listMine', {})).data.items[0]
    await h.invoke('approve', h.target(first), ADMIN)
    const source = await h.repo.get('message_board_messages', first.messageId)
    for (let i = 1; i <= 5; i++) {
      const id = i.toString(16).padStart(32, '0')
      await h.repo.set('message_board_messages', id, {
        ...source,
        publishedKey: '1791330000000:' + id,
      })
    }
    const page = await h.invoke('listPublic', { limit: 3 }, B)
    expect(page.ok).toBe(true)
    expect(page.data.items).toHaveLength(3)
    const next = await h.invoke('listPublic', { limit: 3, cursor: page.data.nextCursor }, B)
    expect(next.data.items).toHaveLength(3)
    expect(
      new Set([...page.data.items, ...next.data.items].map((item) => item.messageId)).size,
    ).toBe(6)
  })
  it('自動 pass 後仍待審核，人工批准才進公開列表且不泄漏私有欄位', async () => {
    const h = harness()
    await h.profile()
    const created = await h.create()
    await h.service.runDue()
    expect((await h.invoke('listPublic', {}, B)).data.items).toEqual([])
    const current = (await h.invoke('listMine', {})).data.items[0]
    expect(current.status).toBe('pending-review')
    expect(current.safety.body).toBe('pass')
    expect((await h.invoke('approve', h.target(current), ADMIN)).ok).toBe(true)
    const listed = (await h.invoke('listPublic', {}, B)).data.items
    expect(listed).toHaveLength(1)
    expect(listed[0].messageId).toBe(created.messageId)
    expect(Object.keys(listed[0]).sort()).toEqual(
      [
        'messageId',
        'revision',
        'nickName',
        'avatarFileId',
        'gameServerId',
        'gameServerName',
        'text',
        'createdAt',
        'publishedAt',
        'reply',
      ].sort(),
    )
    expect(JSON.stringify(listed)).not.toContain(A.openId)
  })
  it('普通玩家不能偽造角色或查看別人的私人留言', async () => {
    const h = harness()
    await h.profile()
    const m = await h.create()
    expect((await h.invoke('approve', h.target(m), { ...B, isAdmin: true } as typeof B)).code).toBe(
      'forbidden',
    )
    expect((await h.invoke('withdrawMessage', h.target(m), B)).code).toBe('not-found')
    expect((await h.invoke('listMine', {}, B)).data.items).toEqual([])
    expect((await h.invoke('listAdmin', {}, B)).code).toBe('forbidden')
  })
  it('重複投稿只建立一次，同 ID 改內容拒絕，並發亦不重複扣額', async () => {
    const h = harness()
    await h.profile()
    const input = {
      ...h.op(),
      profileRevision: 1,
      gameServerId: 'UWOGL-US-01',
      catalogVersion: '1',
      text: '去重留言',
    }
    const [first, second] = await Promise.all([
      h.invoke('createMessage', input),
      h.invoke('createMessage', input),
    ])
    expect(first.ok).toBe(true)
    expect(second.data.messageId).toBe(first.data.messageId)
    expect((await h.invoke('listMine', {})).data.items).toHaveLength(1)
    expect((await h.invoke('createMessage', { ...input, text: '改成別的內容' })).code).toBe(
      'operation-conflict',
    )
    expect((await h.invoke('createMessage', { ...input, ...h.op() })).code).toBe('rate-limited')
  })
  it('資料更新不修改舊留言快照', async () => {
    const h = harness()
    await h.profile('原暱稱')
    await h.create()
    expect(
      (
        await h.invoke('saveProfile', {
          ...h.op(),
          profileRevision: 1,
          nickName: '新暱稱',
          avatarAssetId: null,
        })
      ).ok,
    ).toBe(true)
    expect((await h.invoke('listMine', {})).data.items[0].nickName).toBe('原暱稱')
  })
  it('撤回不可復活，角色撤銷後不能靠舊回執取得管理資料', async () => {
    const h = harness()
    await h.profile()
    await h.create()
    await h.service.runDue()
    const latest = (await h.invoke('listMine', {})).data.items[0]
    expect((await h.invoke('withdrawMessage', h.target(latest))).ok).toBe(true)
    expect((await h.invoke('approve', h.target(latest), ADMIN)).ok).toBe(false)
    expect((await h.invoke('listPublic', {}, B)).data.items).toEqual([])
    h.admins.clear()
    expect((await h.invoke('listAdmin', {}, ADMIN)).code).toBe('forbidden')
  })
  it('清除閘門立即排除公开內容，不能依赖背景已刪除', async () => {
    const h = harness()
    await h.profile()
    await h.create()
    await h.service.runDue()
    const m = (await h.invoke('listMine', {})).data.items[0]
    await h.invoke('approve', h.target(m), ADMIN)
    expect((await h.invoke('clearMyData', h.op())).ok).toBe(true)
    expect((await h.invoke('listPublic', {}, B)).data.items).toEqual([])
    expect((await h.invoke('getViewer', {})).data.clearing).toBe(true)
  })
  it('checking 和 risky 不能被強制批准，輸入不能夾帶作者 OpenID', async () => {
    const h = harness()
    await h.profile()
    const m = await h.create()
    expect((await h.invoke('approve', h.target(m), ADMIN)).code).toBe('safety-not-ready')
    expect(
      (
        await h.invoke('createMessage', {
          ...h.op(),
          profileRevision: 1,
          gameServerId: 'UWOGL-US-01',
          catalogVersion: '1',
          text: '正文',
          openId: A.openId,
        })
      ).code,
    ).toBe('input-invalid')
  })
})
