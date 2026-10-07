import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { createMemoryRepository } from './helpers/memory-repository'
const require = createRequire(import.meta.url)
const { createBoardService } = require('../../cloudfunctions/message-board/core/service.js')
const A = { ownerKey: 'a'.repeat(64), openId: 'private-a' },
  B = { ownerKey: 'b'.repeat(64), openId: 'private-b' },
  ADMIN = { ownerKey: 'c'.repeat(64), openId: 'admin' }
function h() {
  const repo = createMemoryRepository()
  let now = 1791340000000,
    nonce = 0,
    suggest = 'pass'
  const service = createBoardService({
    repo,
    clock: () => now,
    secret: 's'.repeat(64),
    catalog: { version: '1', servers: [{ id: 'UWOGL-US-01', name: 'Atlantic Ocean' }] },
    adminOpenIds: () => new Set([ADMIN.openId]),
    policy: () => ({ read: true, write: true, review: true }),
    safety: {
      async checkText() {
        return { suggest, errCode: 0 }
      },
    },
    storage: {
      async publish() {
        return 'cloud://test/public.png'
      },
      async remove() {},
    },
  })
  const op = () => ({ operationId: `${now}_${(++nonce).toString(16).padStart(32, '0')}` })
  const call = (action: string, input: Record<string, unknown>, actor = A) =>
    service.invoke(action, input, actor)
  const target = (m: { messageId: string; revision: number }) => ({
    ...op(),
    messageId: m.messageId,
    expectedRevision: m.revision,
  })
  const seed = async () => {
    await call('saveProfile', {
      ...op(),
      profileRevision: 0,
      nickName: '原作者',
      avatarAssetId: null,
    })
    await call('createMessage', {
      ...op(),
      profileRevision: 1,
      gameServerId: 'UWOGL-US-01',
      catalogVersion: '1',
      text: '正文',
    })
    await service.runDue()
    const m = (await call('listMine', {})).data.items[0]
    await call('approve', target(m), ADMIN)
    return (await call('listMine', {})).data.items[0]
  }
  return {
    repo,
    service,
    op,
    call,
    target,
    seed,
    advance: (ms: number) => {
      now += ms
    },
    risk: () => {
      suggest = 'risky'
    },
  }
}
describe('管理與資料處置閉環', () => {
  it('清除資料後不在安全隊列保留暱稱或正文', async () => {
    const t = h()
    await t.seed()
    expect(
      (await t.repo.query('message_board_tasks')).some((row) => typeof row.text === 'string'),
    ).toBe(true)
    await t.call('clearMyData', t.op())
    await t.service.runDue()
    expect(
      (await t.repo.query('message_board_tasks')).some((row) => typeof row.text === 'string'),
    ).toBe(false)
  })
  it('待審核超過30天轉未通過，再到期後移除正文與作者快照', async () => {
    const t = h()
    await t.call('saveProfile', {
      ...t.op(),
      profileRevision: 0,
      nickName: '期限測試',
      avatarAssetId: null,
    })
    await t.call('createMessage', {
      ...t.op(),
      profileRevision: 1,
      gameServerId: 'UWOGL-US-01',
      catalogVersion: '1',
      text: '保留期限正文',
    })
    t.advance(31 * 86400000)
    await t.service.runDue()
    const rejected = (await t.call('listMine', {})).data.items[0]
    expect(rejected.status).toBe('rejected')
    expect(rejected.reason).toContain('保留期限')
    t.advance(31 * 86400000)
    await t.service.runDue()
    expect((await t.call('listMine', {})).data.items).toEqual([])
  })
  it('回覆候選未完成前保留舊回覆，風險新候選不得覆蓋舊值', async () => {
    const t = h()
    let m = await t.seed()
    expect((await t.call('saveReply', { ...t.target(m), text: '第一則回覆' }, ADMIN)).ok).toBe(true)
    expect((await t.call('listPublic', {}, B)).data.items[0].reply).toBeNull()
    await t.service.runDue()
    m = (await t.call('listMine', {})).data.items[0]
    expect(m.reply.text).toBe('第一則回覆')
    await t.call('saveReply', { ...t.target(m), text: '更新後的合格回覆' }, ADMIN)
    await t.service.runDue()
    m = (await t.call('listMine', {})).data.items[0]
    expect(m.reply.text).toBe('更新後的合格回覆')
    t.risk()
    await t.call('saveReply', { ...t.target(m), text: '不合格候選' }, ADMIN)
    await t.service.runDue()
    expect((await t.call('listPublic', {}, B)).data.items[0].reply.text).toBe('更新後的合格回覆')
  })
  it('檢舉去重、不可檢舉自己，處理下架不復活終態', async () => {
    const t = h(),
      m = await t.seed()
    expect(
      (await t.call('reportMessage', { ...t.op(), messageId: m.messageId, fixedReason: 'abuse' }))
        .code,
    ).toBe('input-invalid')
    expect(
      (
        await t.call(
          'reportMessage',
          { ...t.op(), messageId: m.messageId, fixedReason: 'abuse' },
          B,
        )
      ).ok,
    ).toBe(true)
    expect(
      (
        await t.call(
          'reportMessage',
          { ...t.op(), messageId: m.messageId, fixedReason: 'abuse' },
          B,
        )
      ).ok,
    ).toBe(true)
    const reports = (await t.call('listReports', {}, ADMIN)).data.items
    expect(reports).toHaveLength(1)
    expect(JSON.stringify(reports)).not.toContain(B.openId)
    expect(
      (
        await t.call(
          'resolveReport',
          {
            ...t.target(m),
            reportId: reports[0].reportId,
            outcome: 'hide',
            reason: '違反留言規則',
          },
          ADMIN,
        )
      ).ok,
    ).toBe(true)
    expect((await t.call('listPublic', {}, B)).data.items).toEqual([])
  })
  it('清除超過一批留言仍保持閘門；完成後再次清除也可執行', async () => {
    const t = h(),
      m = await t.seed(),
      source = await t.repo.get('message_board_messages', m.messageId)
    for (let i = 0; i < 125; i++)
      await t.repo.set('message_board_messages', 'old-' + i, {
        ...source,
        orderKey: '1791330000000:' + String(i).padStart(3, '0'),
      })
    await t.call('clearMyData', t.op())
    await t.service.runDue()
    expect((await t.call('listMine', {})).data.items).toEqual([])
    expect((await t.call('getViewer', {})).data.clearing).toBe(true)
    for (let i = 0; i < 10; i++) {
      t.advance(1001)
      await t.service.runDue()
    }
    expect((await t.call('getViewer', {})).data.clearing).toBe(false)
    expect((await t.call('listMine', {})).data.items).toEqual([])
    const profile = await t.call('saveProfile', {
      ...t.op(),
      profileRevision: 0,
      nickName: '重新設定',
      avatarAssetId: null,
    })
    expect(profile.ok).toBe(true)
    expect(profile.data.profileRevision).toBeGreaterThan(1)
    t.advance(60001)
    await t.call('clearMyData', t.op())
    await t.service.runDue()
    expect((await t.call('getProfile', {})).data).toBeNull()
    expect((await t.call('getViewer', {})).data.clearing).toBe(false)
  })
  it('受限玩家不能建立新投稿，解除後仍遵守正常限流', async () => {
    const t = h(),
      m = await t.seed()
    expect((await t.call('restrictAuthor', { ...t.target(m), reason: '暫停投稿' }, ADMIN)).ok).toBe(
      true,
    )
    t.advance(60001)
    expect(
      (
        await t.call('createMessage', {
          ...t.op(),
          profileRevision: 1,
          gameServerId: 'UWOGL-US-01',
          catalogVersion: '1',
          text: '新留言',
        })
      ).code,
    ).toBe('restricted')
    const latest = (await t.call('listMine', {})).data.items[0]
    expect(
      (await t.call('unrestrictAuthor', { ...t.target(latest), reason: '已解除' }, ADMIN)).ok,
    ).toBe(true)
    expect(
      (
        await t.call('createMessage', {
          ...t.op(),
          profileRevision: 1,
          gameServerId: 'UWOGL-US-01',
          catalogVersion: '1',
          text: '恢復留言',
        })
      ).ok,
    ).toBe(true)
  })
})
