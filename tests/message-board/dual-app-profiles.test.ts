import { createRequire } from 'node:module'
import { createCipheriv, createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRepository } from './helpers/memory-repository'
const require = createRequire(import.meta.url)
const { createRpcEntry } = require('../../cloudfunctions/message-board/entry.js')
const { createEventsEntry } = require('../../cloudfunctions/message-board-events/entry.js')
const {
  readConfig,
  createRuntimePorts,
} = require('../../cloudfunctions/message-board/core/assembly.js')
const { createBoardService } = require('../../cloudfunctions/message-board/core/service.js')
const {
  createSafetyProvider,
} = require('../../cloudfunctions/message-board/core/safety-provider.js')
const { signature } = require('../../cloudfunctions/message-board/core/wechat-event-crypto.js')
const OLD = 'wx8f961bcd8b26996a',
  NEW = 'wxd0bc7afdc9cd334a'
const ENV = 'cloud1-d7gxfuxfe813b4eaa'
const now = 1791340000000
const oldCallback = {
  appId: OLD,
  baseUrl: 'https://example.invalid/board',
  token: 'old-token',
  aesKey: Buffer.alloc(32, 7).toString('base64').slice(0, 43),
  imageKey: 'c'.repeat(64),
}
const newCallback = {
  appId: NEW,
  baseUrl: 'https://example.invalid/board-new',
  token: 'new-token',
  aesKey: Buffer.alloc(32, 8).toString('base64').slice(0, 43),
  imageKey: 'd'.repeat(64),
}
const newProfile = { enabled: true, callback: newCallback }
const image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0S8AAAAASUVORK5CYII='
const actor = (appId: string, openId = 'same-id') => ({
  appId,
  openId,
  ownerKey: createHmac('sha256', 's'.repeat(64))
    .update(appId + ':' + openId)
    .digest('hex'),
})
function harness(enabled = true) {
  const repo = createMemoryRepository()
  const calls: { appId: string; openid: string; kind: string; url?: string }[] = []
  let nonce = 0
  const safety = createSafetyProvider(
    {
      getWXContext: () => ({ SOURCE: 'wx_client' }),
      openapi: ({ appid }: { appid: string }) => ({
        security: {
          async msgSecCheck({ openid }: { openid: string }) {
            calls.push({ appId: appid, openid, kind: 'text' })
            return { errCode: 0, result: { suggest: 'pass' } }
          },
          async mediaCheckAsync({ openid, mediaUrl }: { openid: string; mediaUrl: string }) {
            calls.push({ appId: appid, openid, kind: 'image', url: mediaUrl })
            return { errCode: 0, traceId: appid + '-trace' }
          },
        },
      }),
    },
    OLD,
    enabled ? [NEW] : [],
  )
  const service = createBoardService({
    repo,
    clock: () => now,
    secret: 's'.repeat(64),
    catalog: { version: '1', servers: [{ id: 'UWOGL-US-01', name: 'Atlantic Ocean' }] },
    callback: oldCallback,
    newProfile: enabled ? newProfile : null,
    adminOpenIds: (appId: string) => new Set(appId === NEW ? ['new-admin'] : ['old-admin']),
    policy: () => ({ read: true, write: true, review: true }),
    safety,
    storage: {
      async publish() {
        return 'cloud://public.png'
      },
      async remove() {},
    },
  })
  const rpc = (openId = 'same-id', overrides = {}) =>
    createRpcEntry({
      environmentId: ENV,
      appId: OLD,
      identitySecret: 's'.repeat(64),
      newProfile: enabled ? newProfile : null,
      service,
      readContext: () => ({
        SOURCE: 'wx_client',
        APPID: OLD,
        ENV,
        OPENID: 'resource-id',
        FROM_APPID: NEW,
        FROM_OPENID: openId,
        ...overrides,
      }),
    })
  const events = createEventsEntry({
    environmentId: ENV,
    callbackPath: '/board',
    callback: oldCallback,
    newProfile: enabled ? newProfile : null,
    service,
    readContext: () => ({ SOURCE: 'wx_http' }),
    runtimeEnvironment: () => ({ TCB_ENV: ENV, SCF_NAMESPACE: ENV }),
  })
  const op = () => ({ operationId: `${now}_${(++nonce).toString(16).padStart(32, '0')}` })
  return { repo, service, rpc, events, calls, op }
}
function encryptedEvent(
  callback: typeof oldCallback,
  path = new URL(callback.baseUrl).pathname,
  payloadAppId = callback.appId,
  traceId = NEW + '-trace',
) {
  const data = Buffer.from(
    JSON.stringify({
      appid: payloadAppId,
      MsgType: 'event',
      Event: 'wxa_media_check',
      version: 2,
      trace_id: traceId,
      errcode: 0,
      result: { suggest: 'pass' },
    }),
  )
  const size = Buffer.alloc(4)
  size.writeUInt32BE(data.length)
  const raw = Buffer.concat([Buffer.alloc(16), size, data, Buffer.from(payloadAppId)])
  const padding = 32 - (raw.length % 32),
    key = Buffer.from(callback.aesKey + '=', 'base64')
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16))
  cipher.setAutoPadding(false)
  const Encrypt = Buffer.concat([
    cipher.update(Buffer.concat([raw, Buffer.alloc(padding, padding)])),
    cipher.final(),
  ]).toString('base64')
  return {
    httpMethod: 'POST',
    path,
    body: JSON.stringify({ Encrypt }),
    queryStringParameters: {
      timestamp: '123',
      nonce: 'nonce',
      msg_signature: signature(callback.token, ['123', 'nonce', Encrypt]),
    },
  }
}
afterEach(() => vi.unstubAllEnvs())
describe('留言雙 AppID 固定安全 profile', () => {
  async function pendingMessage(h: ReturnType<typeof harness>) {
    await h.rpc()({
      action: 'saveProfile',
      input: { ...h.op(), profileRevision: 0, nickName: '新航海者', avatarAssetId: null },
    })
    const created = await h.rpc()({
      action: 'createMessage',
      input: {
        ...h.op(),
        profileRevision: 1,
        gameServerId: 'UWOGL-US-01',
        catalogVersion: '1',
        text: '待審核留言',
      },
    })
    expect(created).toMatchObject({ ok: true, data: { status: 'pending-review' } })
    return created.data
  }
  it.each([
    'reject',
    'hide',
    'restrictAuthor',
    'unrestrictAuthor',
    'approve',
    'restore',
    'resolveReport',
  ])('新管理員 %s 的同步理由安全檢查使用新AppID與原生OpenID', async (action) => {
    const h = harness()
    let message = await pendingMessage(h)
    const admin = h.rpc('new-admin')
    const target = () => ({
      ...h.op(),
      messageId: message.messageId,
      expectedRevision: message.revision,
    })
    if (['hide', 'restore', 'resolveReport'].includes(action)) {
      const approved = await admin({ action: 'approve', input: target() })
      expect(approved.ok).toBe(true)
      message = approved.data
    }
    if (action === 'restore') {
      const hidden = await admin({
        action: 'hide',
        input: { ...target(), reason: '管理員暫時隱藏' },
      })
      expect(hidden.ok).toBe(true)
      message = hidden.data
    }
    let reportId: string | undefined
    if (action === 'resolveReport') {
      const reported = await h.rpc('reporter')({
        action: 'reportMessage',
        input: { ...h.op(), messageId: message.messageId, fixedReason: 'other' },
      })
      expect(reported.ok).toBe(true)
      const reports = await admin({ action: 'listReports' })
      expect(reports).toMatchObject({
        ok: true,
        data: { items: [{ messageId: message.messageId }] },
      })
      reportId = reports.data.items[0].reportId
    }
    h.calls.length = 0
    const input = ['approve', 'restore'].includes(action)
      ? { ...target(), manualReviewReason: '管理員已完成人工核對' }
      : action === 'resolveReport'
        ? { ...target(), reportId, outcome: 'keep', reason: '核對後保留留言' }
        : { ...target(), reason: '管理員核對理由' }
    expect(await admin({ action, input })).toMatchObject({ ok: true })
    expect(h.calls).toEqual([{ appId: NEW, openid: 'new-admin', kind: 'text' }])
  })
  it.each(['unknown-app', undefined, null])(
    '管理員AppID為 %s 時不得回落舊AppID檢查理由',
    async (appId) => {
      const h = harness(),
        message = await pendingMessage(h)
      h.calls.length = 0
      const result = await h.service.invoke(
        'reject',
        {
          ...h.op(),
          messageId: message.messageId,
          expectedRevision: message.revision,
          reason: '來源不明的管理理由',
        },
        { ...actor(OLD, 'old-admin'), appId },
      )
      expect(result.ok).toBe(false)
      expect(h.calls).toEqual([])
      expect((await h.repo.get('message_board_messages', message.messageId))?.status).toBe(
        'pending-review',
      )
    },
  )
  it('配置完整才啟用新端，缺鍵或路徑衝突保持停用且舊配置可用', () => {
    const values = {
      MESSAGE_BOARD_ENV: ENV,
      MESSAGE_BOARD_APP_ID: OLD,
      MESSAGE_BOARD_IDENTITY_SECRET: 's'.repeat(64),
      MESSAGE_BOARD_CALLBACK_URL: oldCallback.baseUrl,
      MESSAGE_BOARD_CALLBACK_TOKEN: oldCallback.token,
      MESSAGE_BOARD_CALLBACK_AES_KEY: oldCallback.aesKey,
      MESSAGE_BOARD_IMAGE_KEY: oldCallback.imageKey,
      MESSAGE_BOARD_NEW_ENABLED: 'true',
      MESSAGE_BOARD_NEW_CALLBACK_URL: newCallback.baseUrl,
      MESSAGE_BOARD_NEW_CALLBACK_TOKEN: newCallback.token,
      MESSAGE_BOARD_NEW_CALLBACK_AES_KEY: newCallback.aesKey,
      MESSAGE_BOARD_NEW_IMAGE_KEY: newCallback.imageKey,
      MESSAGE_BOARD_NEW_ADMIN_OPENIDS: 'new-admin',
    }
    for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
    expect(readConfig().newProfile).toMatchObject(newProfile)
    vi.stubEnv('MESSAGE_BOARD_ADMIN_OPENIDS', 'old-admin')
    const { service } = createRuntimePorts({ database: () => ({}) })
    expect(service.context.isAdmin(actor(NEW, 'new-admin'))).toBe(true)
    expect(service.context.isAdmin(actor(NEW, 'old-admin'))).toBe(false)
    expect(service.context.isAdmin(actor(OLD, 'old-admin'))).toBe(true)
    expect(service.context.isAdmin(actor(OLD, 'new-admin'))).toBe(false)
    for (const key of [
      'MESSAGE_BOARD_NEW_CALLBACK_URL',
      'MESSAGE_BOARD_NEW_CALLBACK_TOKEN',
      'MESSAGE_BOARD_NEW_CALLBACK_AES_KEY',
      'MESSAGE_BOARD_NEW_IMAGE_KEY',
    ]) {
      vi.stubEnv(key, '')
      expect(readConfig().newProfile).toBeNull()
      vi.stubEnv(key, values[key as keyof typeof values])
    }
    vi.stubEnv('MESSAGE_BOARD_NEW_CALLBACK_URL', oldCallback.baseUrl + '/avatar')
    expect(readConfig().newProfile).toBeNull()
    expect(readConfig().callback).toEqual(oldCallback)
    vi.stubEnv('MESSAGE_BOARD_APP_ID', 'unknown-app')
    expect(() => readConfig()).toThrow('留言板服務端配置不完整')
  })
  it('新端完整配置開放投稿且 owner 保存可信 appId，僅新白名單可管理', async () => {
    const h = harness()
    expect(
      await h.rpc()({
        action: 'saveProfile',
        input: { ...h.op(), profileRevision: 0, nickName: '新航海者', avatarAssetId: null },
      }),
    ).toMatchObject({ ok: true })
    expect(await h.repo.get('message_board_owner_state', actor(NEW).ownerKey)).toMatchObject({
      appId: NEW,
      openId: 'same-id',
    })
    expect(await h.rpc('new-admin')({ action: 'getViewer' })).toMatchObject({
      ok: true,
      data: { isAdmin: true, write: true },
    })
    expect(await h.rpc('old-admin')({ action: 'getViewer' })).toMatchObject({
      ok: true,
      data: { isAdmin: false },
    })
    expect(await h.rpc('old-admin')({ action: 'listAdmin' })).toMatchObject({ code: 'forbidden' })
    expect(await h.rpc('new-admin')({ action: 'listAdmin' })).toMatchObject({ ok: true })
    const created = await h.rpc()({
      action: 'createMessage',
      input: {
        ...h.op(),
        profileRevision: 1,
        gameServerId: 'UWOGL-US-01',
        catalogVersion: '1',
        text: '新端留言',
      },
    })
    expect(created).toMatchObject({ ok: true, data: { status: 'pending-review' } })
    expect(await h.rpc()({ action: 'listMine' })).toMatchObject({
      ok: true,
      data: { items: [{ messageId: created.data.messageId }] },
    })
    expect(await h.service.invoke('listMine', {}, actor(OLD))).toMatchObject({
      ok: true,
      data: { items: [] },
    })
    expect(await h.rpc()({ action: 'listPublic' })).toMatchObject({ ok: true, data: { items: [] } })
    expect(
      await h.rpc('new-admin')({
        action: 'approve',
        input: {
          ...h.op(),
          messageId: created.data.messageId,
          expectedRevision: created.data.revision,
        },
      }),
    ).toMatchObject({ ok: true, data: { status: 'published' } })
    expect(await h.service.invoke('listPublic', {}, actor(OLD))).toMatchObject({
      ok: true,
      data: { items: [{ messageId: created.data.messageId }] },
    })
  })
  it('未配置仍只讀，未知共享來源與自稱 appId 不能借用舊身份', async () => {
    const h = harness(false)
    expect(await h.rpc()({ action: 'saveProfile', input: {} })).toMatchObject({
      code: 'feature-disabled',
    })
    expect(await h.rpc()({ action: 'getViewer' })).toMatchObject({
      ok: true,
      data: { write: false, isAdmin: false },
    })
    expect(
      await h.rpc('same-id', { FROM_APPID: 'unknown' })({ action: 'getViewer' }),
    ).toMatchObject({ code: 'forbidden' })
    expect(
      await h.rpc('same-id', { FROM_APPID: '', FROM_OPENID: 'forged' })({ action: 'getViewer' }),
    ).toMatchObject({ code: 'forbidden' })
    expect(await h.rpc()({ action: 'getViewer', input: { appId: OLD } })).toMatchObject({
      code: 'input-invalid',
    })
  })
  it('混合定時隊列逐owner選用AppID和原生OpenID，歷史owner回落舊端', async () => {
    const h = harness()
    for (const appId of [OLD, NEW]) {
      expect(
        await h.service.invoke(
          'saveProfile',
          { ...h.op(), profileRevision: 0, nickName: '航海者', avatarAssetId: null },
          actor(appId),
        ),
      ).toMatchObject({ ok: true })
    }
    const legacy = await h.repo.get('message_board_owner_state', actor(OLD).ownerKey)
    if (!legacy) throw new Error('舊owner不存在')
    delete legacy.appId
    await h.repo.set('message_board_owner_state', actor(OLD).ownerKey, legacy)
    await h.service.runDue()
    expect(h.calls).toEqual(
      expect.arrayContaining([
        { appId: OLD, openid: 'same-id', kind: 'text' },
        { appId: NEW, openid: 'same-id', kind: 'text' },
      ]),
    )
  })
  it('新圖片URL與回調按profile驗證，跨路徑簽名、AES AppID及舊回調不能確認新資產', async () => {
    const h = harness()
    const upload = await h.rpc()({ action: 'uploadAvatar', input: { ...h.op(), base64: image } })
    expect(upload.ok).toBe(true)
    const call = h.calls.find((item) => item.kind === 'image')
    expect(call).toMatchObject({ appId: NEW, openid: 'same-id' })
    const url = new URL(call!.url!)
    expect(url.pathname).toBe('/board-new/avatar')
    const queryStringParameters = Object.fromEntries(url.searchParams)
    expect(
      await h.events({ httpMethod: 'GET', path: '/board-new/avatar', queryStringParameters }),
    ).toMatchObject({ statusCode: 200 })
    expect(
      await h.events({ httpMethod: 'GET', path: '/board/avatar', queryStringParameters }),
    ).toMatchObject({ statusCode: 403 })
    expect(await h.events(encryptedEvent(newCallback, '/board'))).toMatchObject({ statusCode: 403 })
    expect(await h.events(encryptedEvent(newCallback, '/board-new', OLD))).toMatchObject({
      statusCode: 403,
    })
    const tampered = { ...queryStringParameters, signature: '0'.repeat(64) }
    expect(
      await h.events({
        httpMethod: 'GET',
        path: '/board-new/avatar',
        queryStringParameters: tampered,
      }),
    ).toMatchObject({ statusCode: 403 })
    await h.events(encryptedEvent(oldCallback))
    expect((await h.repo.get('message_board_assets', upload.data.assetId))?.safety).toBe('checking')
    expect(await h.events(encryptedEvent(newCallback))).toMatchObject({ statusCode: 200 })
    expect((await h.repo.get('message_board_assets', upload.data.assetId))?.safety).toBe('pass')
    expect(
      await h.service.invoke('loadPrivateAvatar', { assetId: upload.data.assetId }, actor(OLD)),
    ).toMatchObject({ code: 'not-found' })
    expect(
      await h.service.invoke(
        'loadPrivateAvatar',
        { assetId: upload.data.assetId },
        actor(OLD, 'old-admin'),
      ),
    ).toMatchObject({ ok: true })
  })
  it('新profile停用時不消耗新任務重試額度，舊任務仍可執行', async () => {
    const h = harness(false)
    // 模擬停用前已存在的兩端隊列，直接透過內部服務建構，不穿過RPC啟用門禁。
    for (const appId of [OLD, NEW]) {
      await h.service.invoke(
        'saveProfile',
        { ...h.op(), profileRevision: 0, nickName: '航海者', avatarAssetId: null },
        actor(appId),
      )
    }
    await h.service.runDue()
    const tasks = await h.repo.query('message_board_tasks', {
      eq: { ownerKey: actor(NEW).ownerKey },
      limit: 10,
    })
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ attempts: 0, state: 'queued' })
    expect(h.calls).toEqual([{ appId: OLD, openid: 'same-id', kind: 'text' }])
  })
  it('舊owner和歷史trace不含appId時舊HTTP回調與簽名URL仍可使用', async () => {
    const h = harness(false)
    const upload = await h.service.invoke('uploadAvatar', { ...h.op(), base64: image }, actor(OLD))
    const owner = await h.repo.get('message_board_owner_state', actor(OLD).ownerKey)
    if (!owner) throw new Error('舊owner不存在')
    delete owner.appId
    await h.repo.set('message_board_owner_state', actor(OLD).ownerKey, owner)
    await h.service.runDue()
    const [trace] = await h.repo.query('message_board_safety_traces', { limit: 10 })
    if (!trace || typeof trace._id !== 'string') throw new Error('舊安全追蹤記錄不存在')
    delete trace.appId
    await h.repo.set('message_board_safety_traces', trace._id, trace)
    const url = new URL(h.calls[0].url!)
    expect(url.pathname).toBe('/board/avatar')
    expect(
      await h.events({
        httpMethod: 'GET',
        path: url.pathname,
        queryStringParameters: Object.fromEntries(url.searchParams),
      }),
    ).toMatchObject({ statusCode: 200 })
    expect(
      await h.events(encryptedEvent(oldCallback, '/board', OLD, OLD + '-trace')),
    ).toMatchObject({ statusCode: 200 })
    expect((await h.repo.get('message_board_assets', upload.data.assetId))?.safety).toBe('pass')
  })
  it('停用的新端任務佔滿首批時，後續批次仍可取得舊端任務', async () => {
    const h = harness(false)
    await h.service.invoke('getViewer', {}, actor(NEW))
    for (let i = 0; i < 20; i++) {
      await h.repo.set('message_board_tasks', 'disabled-' + i, {
        type: 'text',
        state: 'queued',
        ownerKey: actor(NEW).ownerKey,
        orderKey: '0:' + i,
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
        expiresAt: now + 2592000000,
      })
    }
    await h.service.invoke(
      'saveProfile',
      { ...h.op(), profileRevision: 0, nickName: '舊航海者', avatarAssetId: null },
      actor(OLD),
    )
    await h.service.runDue()
    await h.service.runDue()
    expect(h.calls).toEqual([{ appId: OLD, openid: 'same-id', kind: 'text' }])
    const disabled = await h.repo.query('message_board_tasks', {
      eq: { ownerKey: actor(NEW).ownerKey },
      limit: 30,
    })
    expect(disabled).toHaveLength(20)
    expect(disabled.every((task) => task.attempts === 0 && task.state === 'queued')).toBe(true)
  })
})
