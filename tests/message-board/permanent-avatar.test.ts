import { createRequire } from 'node:module'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createMemoryRepository } from './helpers/memory-repository'
const require = createRequire(import.meta.url)
const { createBoardService } = require('../../cloudfunctions/message-board/core/service.js')
const {
  decodeEvent,
  signature,
} = require('../../cloudfunctions/message-board/core/wechat-event-crypto.js')
const image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0S8AAAAASUVORK5CYII='
const A = { ownerKey: 'a'.repeat(64), openId: 'private-a', appId: 'test-app' },
  B = { ownerKey: 'b'.repeat(64), openId: 'private-b', appId: 'test-app' }
function h() {
  const repo = createMemoryRepository()
  let nonce = 0
  const media: string[] = []
  const service = createBoardService({
    repo,
    clock: () => 1791340000000,
    secret: 's'.repeat(64),
    catalog: { version: '1', servers: [{ id: 'UWOGL-US-01', name: 'Atlantic Ocean' }] },
    adminOpenIds: () => new Set(['admin']),
    policy: () => ({ read: true, write: true, review: true }),
    callback: {
      baseUrl: 'https://example.invalid/board',
      imageKey: 'c'.repeat(64),
      appId: 'test-app',
      token: 'test-token',
      aesKey: Buffer.alloc(32, 7).toString('base64').slice(0, 43),
    },
    safety: {
      async checkText() {
        return { suggest: 'pass', errCode: 0 }
      },
      async checkImage(url: string) {
        media.push(url)
        return { traceId: 'real-trace-1', errCode: 0 }
      },
    },
    storage: {
      async publish() {
        return 'cloud://test/public.png'
      },
      async remove() {},
    },
  })
  const op = () => ({ operationId: `1791340000000_${(++nonce).toString(16).padStart(32, '0')}` })
  return {
    service,
    repo,
    op,
    media,
    invoke: (action: string, input: Record<string, unknown>, actor = A) =>
      service.invoke(action, input, actor),
  }
}
describe('永久私有頭像與真正回調介面', () => {
  it('同一頭像超過100則留言時分批傳播，不能遺漏較早的留言', async () => {
    const t = h()
    await t.repo.set('message_board_assets', 'asset', { safety: 'risky' })
    for (let i = 0; i < 101; i++) {
      const id = i.toString(16).padStart(32, '0')
      await t.repo.set('message_board_messages', id, {
        avatarAssetId: 'asset',
        orderKey: '1791340000000:' + id,
        status: 'pending-review',
        safety: { avatar: 'checking' },
        revision: 1,
      })
    }
    const task = { _id: 'update', targetId: 'asset', lease: 'lease', state: 'leased' }
    await t.repo.set('message_board_tasks', 'update', task)
    await t.service.context.propagateAsset(task)
    const next = await t.repo.get('message_board_tasks', 'update')
    if (!next) throw new Error('圖片狀態傳播任務遺失')
    expect(next.state).toBe('queued')
    await t.service.context.propagateAsset(next)
    expect(
      (await t.repo.query('message_board_messages', { limit: 101 })).every(
        (row) => (row.safety as { avatar: string }).avatar === 'risky',
      ),
    ).toBe(true)
    expect((await t.repo.get('message_board_tasks', 'update'))?.state).toBe('done')
  })
  it('私有位元組與已綁定 SHA 不同時不能預覽', async () => {
    const t = h(),
      uploaded = await t.invoke('uploadAvatar', { ...t.op(), base64: image })
    const row = await t.repo.get('message_board_assets', uploaded.data.assetId)
    await t.repo.set('message_board_assets', uploaded.data.assetId, {
      ...row,
      base64: Buffer.concat([Buffer.from(image, 'base64'), Buffer.from('changed')]).toString(
        'base64',
      ),
    })
    expect((await t.invoke('loadPrivateAvatar', { assetId: uploaded.data.assetId })).ok).toBe(false)
  })
  it('本人可預覽，其他人不可；安全 pass 回調不能自動公開', async () => {
    const t = h(),
      uploaded = await t.invoke('uploadAvatar', { ...t.op(), base64: image })
    expect(uploaded.ok).toBe(true)
    expect(
      (await t.invoke('loadPrivateAvatar', { assetId: uploaded.data.assetId })).data.base64,
    ).toBe(image)
    expect((await t.invoke('loadPrivateAvatar', { assetId: uploaded.data.assetId }, B)).code).toBe(
      'not-found',
    )
    await t.service.runDue()
    expect(t.media).toHaveLength(1)
    await t.service.acceptVerifiedEvent({ traceId: 'real-trace-1', suggest: 'pass', errCode: 0 })
    await t.service.acceptVerifiedEvent({ traceId: 'real-trace-1', suggest: 'pass', errCode: 0 })
    const row = await t.repo.get('message_board_assets', uploaded.data.assetId)
    expect(row?.safety).toBe('pass')
    expect(row?.publicFileId).toBeNull()
    expect((await t.invoke('listPublic', {}, B)).data.items).toEqual([])
  })
  it('先到回調可等待 trace，未知 trace 不修改任何素材', async () => {
    const t = h(),
      uploaded = await t.invoke('uploadAvatar', { ...t.op(), base64: image })
    await t.service.acceptVerifiedEvent({ traceId: 'unrelated', suggest: 'risky', errCode: 0 })
    await t.service.acceptVerifiedEvent({ traceId: 'real-trace-1', suggest: 'pass', errCode: 0 })
    expect((await t.repo.get('message_board_assets', uploaded.data.assetId))?.safety).toBe(
      'checking',
    )
    await t.service.runDue()
    expect((await t.repo.get('message_board_assets', uploaded.data.assetId))?.safety).toBe('pass')
  })
  it('拒絕超預算與不能解析的圖片', async () => {
    const t = h()
    expect((await t.invoke('uploadAvatar', { ...t.op(), base64: 'a'.repeat(90000) })).ok).toBe(
      false,
    )
    expect(
      (await t.invoke('uploadAvatar', { ...t.op(), base64: Buffer.alloc(40).toString('base64') }))
        .ok,
    ).toBe(false)
    expect(
      (
        await t.invoke('uploadAvatar', {
          ...t.op(),
          base64: Buffer.from(image, 'base64').subarray(0, 24).toString('base64'),
        })
      ).ok,
    ).toBe(false)
  })
  it('加密回調核驗 AppID、消息結構和 padding', () => {
    const key = Buffer.alloc(32, 7),
      appid = 'test-app',
      payload = {
        appid,
        MsgType: 'event',
        Event: 'wxa_media_check',
        version: 2,
        trace_id: 'provider-trace',
        errcode: 0,
        result: { suggest: 'pass' },
      }
    const body = Buffer.from(JSON.stringify(payload)),
      size = Buffer.alloc(4)
    size.writeUInt32BE(body.length)
    const raw = Buffer.concat([randomBytes(16), size, body, Buffer.from(appid)]),
      padding = 32 - (raw.length % 32)
    const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16))
    cipher.setAutoPadding(false)
    const encrypted = Buffer.concat([
      cipher.update(Buffer.concat([raw, Buffer.alloc(padding, padding)])),
      cipher.final(),
    ]).toString('base64')
    expect(decodeEvent(encrypted, key.toString('base64').slice(0, 43), appid)).toEqual({
      traceId: 'provider-trace',
      errCode: 0,
      suggest: 'pass',
    })
    expect(() => decodeEvent(encrypted, key.toString('base64').slice(0, 43), 'wrong-app')).toThrow()
    expect(signature('test-token', ['123', 'nonce'])).toBe(
      createHash('sha1').update(['test-token', '123', 'nonce'].sort().join('')).digest('hex'),
    )
  })
})
