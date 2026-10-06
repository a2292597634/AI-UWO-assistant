import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
type Row = Record<string, unknown>
type Reply = { ok: boolean; data: Row; code: string; statusCode: number; body: string }
type Probe = (input: Row) => Promise<Reply>
const rpcModule = require('../../tools/message-board/probe-sources/rpc.js') as {
  createProbe: (cloud: ReturnType<typeof harness>['cloud'], config: Row) => Probe
}
const callbackModule =
  require('../../tools/message-board/probe-sources/callback.js') as typeof rpcModule
const helpers = require('../../tools/message-board/probe-sources/shared.js') as {
  docId: (config: Row, value: string) => string
}
const appId = 'wx0000000000000001'
const envId = 'cloud1-d7gxfuxfe813b4eaa'
const actorHash = (openid: string) =>
  createHash('sha256')
    .update(appId + ':' + openid)
    .digest('hex')
const aes = Buffer.alloc(32, 9)
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0S8AAAAASUVORK5CYII=',
  'base64',
)
const assets = 'message_board_probe_assets'
const events = 'message_board_probe_events'
const results = 'message_board_probe_results'
const config = () => ({
  enabled: true,
  testEnvironmentId: envId,
  productionEnvironmentId: envId,
  appId,
  runId: 'g0-shared-private-test',
  candidateSha: 'a'.repeat(40),
  buildSha: 'b'.repeat(64),
  allowedActorHashes: [actorHash('author-a'), actorHash('author-b')],
  sharedEnvironmentAuthorization: {
    environmentId: envId,
    runId: 'g0-shared-private-test',
    scope: 'private-avatar-callback',
    expiresAt: new Date(Date.now() + 14400000).toISOString(),
  },
  token: 'test-token',
  encodingAESKey: aes.toString('base64').slice(0, 43),
  imageSigningKey: 'c'.repeat(64),
  privateAvatarBaseUrl: 'https://example.invalid/message-board-g0/g0-shared-private-test',
})

function harness() {
  let current = { ENV: envId, APPID: appId, OPENID: 'author-a', SOURCE: 'wx_devtools' }
  let rows = new Map<string, Row>()
  let failDb = false
  let providerHook: (() => Promise<void>) | undefined
  let transactionReplay: ((data: Map<string, Row>) => Promise<void>) | undefined
  const mediaUrls: string[] = []
  const collection = (name: string) => ({
    doc: (id: string) => ({
      async get() {
        if (failDb) throw new Error('db unavailable')
        const data = rows.get(name + ':' + id)
        if (!data) throw new Error('not found')
        return { data: structuredClone(data) }
      },
      async set({ data }: { data: Row }) {
        if (failDb) throw new Error('db unavailable')
        rows.set(name + ':' + id, structuredClone(data))
      },
      async update({ data }: { data: Row }) {
        if (failDb) throw new Error('db unavailable')
        if (!rows.has(name + ':' + id)) throw new Error('not found')
        rows.set(name + ':' + id, { ...rows.get(name + ':' + id), ...structuredClone(data) })
      },
      async remove() {
        if (failDb) throw new Error('db unavailable')
        rows.delete(name + ':' + id)
      },
    }),
  })
  let queue: Promise<unknown> = Promise.resolve()
  const storage = vi.fn(async () => {
    throw new Error('本方案不得操作公共儲存桶')
  })
  const cloud = {
    getWXContext: () => ({ ...current }),
    database: () => ({
      collection,
      runTransaction: <T>(fn: (tx: { collection: typeof collection }) => Promise<T>) => {
        const operation = queue.then(async () => {
          let before = structuredClone(rows)
          try {
            const value = await fn({ collection })
            if (!transactionReplay) return value
            // 模擬提交衝突：本次寫入回滾，另一請求完成後 SDK 重播交易回調。
            const replay = transactionReplay
            transactionReplay = undefined
            rows = before
            await replay(rows)
            before = structuredClone(rows)
            return await fn({ collection })
          } catch (error) {
            rows = before
            throw error
          }
        })
        queue = operation.catch(() => undefined)
        return operation
      },
    }),
    uploadFile: storage,
    downloadFile: storage,
    getTempFileURL: storage,
    deleteFile: storage,
    openapi: {
      security: {
        mediaCheckAsync: vi.fn(async (input: { mediaUrl: string }) => {
          mediaUrls.push(input.mediaUrl)
          await providerHook?.()
          return { errCode: 0, traceId: 'image-trace' }
        }),
      },
    },
  }
  const cfg = config()
  const rpc = rpcModule.createProbe(cloud, cfg)
  const callback = callbackModule.createProbe(cloud, cfg)
  const http = async (input: Row) => {
    const previous = current
    current = { ...current, SOURCE: 'wx_http', OPENID: '' }
    try {
      return await callback(input)
    } finally {
      current = previous
    }
  }
  const staged = async () => {
    const response = await rpc({ action: 'stagePrivateAvatar', base64: image.toString('base64') })
    expect(response.ok).toBe(true)
    return response.data.assetId as string
  }
  return {
    cloud,
    cfg,
    rpc,
    http,
    staged,
    storage,
    mediaUrls,
    rows: () => rows,
    setContext: (patch: Partial<typeof current>) => {
      current = { ...current, ...patch }
    },
    failDb: () => {
      failDb = true
    },
    providerHook: (hook: () => Promise<void>) => {
      providerHook = hook
    },
    replayNextTransaction: (hook: (data: Map<string, Row>) => Promise<void>) => {
      transactionReplay = hook
    },
  }
}

function callbackEvent(suggest = 'pass', traceId = 'image-trace', tailAppId = appId) {
  const payload = {
    appid: appId,
    MsgType: 'event',
    Event: 'wxa_media_check',
    version: 2,
    trace_id: traceId,
    errcode: 0,
    result: { suggest },
  }
  const bytes = Buffer.from(JSON.stringify(payload)),
    length = Buffer.alloc(4)
  length.writeUInt32BE(bytes.length)
  const raw = Buffer.concat([randomBytes(16), length, bytes, Buffer.from(tailAppId)]),
    count = 32 - (raw.length % 32)
  const cipher = createCipheriv('aes-256-cbc', aes, aes.subarray(0, 16))
  cipher.setAutoPadding(false)
  const Encrypt = Buffer.concat([
    cipher.update(Buffer.concat([raw, Buffer.alloc(count, count)])),
    cipher.final(),
  ]).toString('base64')
  const timestamp = String(Math.floor(Date.now() / 1000)),
    nonce = 'test-nonce'
  const msg_signature = createHash('sha1')
    .update(['test-token', timestamp, nonce, Encrypt].sort().join(''))
    .digest('hex')
  return {
    path: '/message-board-g0/g0-shared-private-test',
    httpMethod: 'POST',
    queryStringParameters: { timestamp, nonce, msg_signature },
    body: JSON.stringify({ Encrypt }),
  }
}
const fromUrl = (value: string) => {
  const url = new URL(value)
  return {
    path: url.pathname,
    httpMethod: 'GET',
    queryStringParameters: Object.fromEntries(url.searchParams),
  }
}

describe('私有集合頭像與安全事件閉環', () => {
  it('交易衝突重播後沿用另一請求的 trace，不殘留初次 claim 而重發 provider', async () => {
    const h = harness(),
      assetId = await h.staged()
    h.replayNextTransaction(async (rows) => {
      const accepted = await h.cloud.openapi.security.mediaCheckAsync({
        mediaUrl: 'https://example.invalid/concurrent-check',
      })
      const asset = rows.get(assets + ':' + assetId)!
      rows.set(assets + ':' + assetId, {
        ...asset,
        status: 'checking',
        traceId: accepted.traceId,
        attemptId: 'concurrent-attempt',
        startedAt: Date.now(),
      })
    })
    expect(await h.rpc({ action: 'submitPrivateImage', assetId })).toMatchObject({
      ok: true,
      data: { assetId, traceId: 'image-trace' },
    })
    expect(h.cloud.openapi.security.mediaCheckAsync).toHaveBeenCalledTimes(1)
    expect(h.rows().get(assets + ':' + assetId)?.attemptId).toBe('concurrent-attempt')
  })
  it('實測 HTTP 網關沒有微信上下文時，使用兩個一致的服務端環境標識再驗簽', async () => {
    const h = harness()
    h.setContext({ ENV: '', SOURCE: '', OPENID: '' })
    Object.assign(h.cfg, { platformEnvironmentId: envId, platformNamespace: envId })
    const callback = callbackModule.createProbe(h.cloud, h.cfg)
    const query = {
      timestamp: '1791286500',
      nonce: 'native-http',
      echostr: 'ok',
      signature: createHash('sha1')
        .update(['test-token', '1791286500', 'native-http'].sort().join(''))
        .digest('hex'),
    }
    expect(
      await callback({
        path: '/message-board-g0/' + h.cfg.runId,
        httpMethod: 'GET',
        queryStringParameters: query,
      }),
    ).toMatchObject({ statusCode: 200, body: 'ok' })
    query.signature = '0'.repeat(40)
    expect(
      (
        await callback({
          path: '/message-board-g0/' + h.cfg.runId,
          httpMethod: 'GET',
          queryStringParameters: query,
        })
      ).statusCode,
    ).toBe(403)
    expect(await h.rpc({ action: 'getIdentity' })).toMatchObject({
      ok: false,
      code: 'environment-forbidden',
    })
  })
  it.each(['namespace', 'runtime-env', 'client', 'openid', 'unknown-source', 'claimed-env'])(
    'HTTP 相容分支仍拒絕 %s',
    async (kind) => {
      const h = harness()
      h.setContext({ ENV: '', SOURCE: '', OPENID: '' })
      Object.assign(h.cfg, { platformEnvironmentId: envId, platformNamespace: envId })
      if (kind === 'namespace') Object.assign(h.cfg, { platformNamespace: 'wrong-env' })
      if (kind === 'runtime-env') Object.assign(h.cfg, { platformEnvironmentId: 'wrong-env' })
      if (kind === 'client') h.setContext({ SOURCE: 'wx_devtools' })
      if (kind === 'openid') h.setContext({ OPENID: 'author-a' })
      if (kind === 'unknown-source') h.setContext({ SOURCE: 'unknown' })
      if (kind === 'claimed-env') Object.assign(h.cfg, { platformEnvironmentId: '' })
      const callback = callbackModule.createProbe(h.cloud, h.cfg)
      const event = callbackEvent()
      expect((await callback({ ...event, ENV: envId, SOURCE: 'wx_http' })).statusCode).toBe(403)
      expect(h.rows().size).toBe(0)
    },
  )
  it('暫存與本人預覽保留原位元組，完全不操作公開桶或回傳連結', async () => {
    const h = harness(),
      assetId = await h.staged()
    const preview = await h.rpc({ action: 'previewPrivateAvatar', assetId })
    expect(preview).toMatchObject({ ok: true, data: { assetId, base64: image.toString('base64') } })
    expect(JSON.stringify(preview)).not.toMatch(/https:|privateFileId|ownerHash/)
    expect(h.storage).not.toHaveBeenCalled()
    expect(h.rows().get(assets + ':' + assetId)?.base64).toBe(image.toString('base64'))
  })
  it('他人與錯誤批次不得預覽，同樣回 not-found', async () => {
    const h = harness(),
      assetId = await h.staged()
    h.setContext({ OPENID: 'author-b' })
    expect(await h.rpc({ action: 'previewPrivateAvatar', assetId })).toMatchObject({
      ok: false,
      code: 'not-found',
    })
    h.setContext({ OPENID: 'author-a' })
    h.rows().get(assets + ':' + assetId)!.buildSha = 'd'.repeat(64)
    expect(await h.rpc({ action: 'previewPrivateAvatar', assetId })).toMatchObject({
      ok: false,
      code: 'not-found',
    })
  })
  it('超過預算、錯誤簽名或未批准操作者不寫入', async () => {
    const h = harness()
    for (const base64 of [Buffer.alloc(65537).toString('base64'), 'AAAA'])
      expect(await h.rpc({ action: 'stagePrivateAvatar', base64 })).toMatchObject({
        ok: false,
        code: 'invalid-image',
      })
    h.setContext({ OPENID: 'unapproved' })
    expect(
      await h.rpc({ action: 'stagePrivateAvatar', base64: image.toString('base64') }),
    ).toMatchObject({ ok: false, code: 'actor-forbidden' })
    expect(h.rows().size).toBe(0)
  })
  it('資料庫損壞位元組不可被預覽或供檢查', async () => {
    const h = harness(),
      assetId = await h.staged()
    h.rows().get(assets + ':' + assetId)!.base64 = image.subarray(0, 24).toString('base64')
    expect(await h.rpc({ action: 'previewPrivateAvatar', assetId })).toMatchObject({
      ok: false,
      code: 'provider-response-invalid',
    })
    expect(h.cloud.openapi.security.mediaCheckAsync).not.toHaveBeenCalled()
  })
  it('共享範圍禁止所有原 storage 動作和公開動作', async () => {
    const h = harness()
    for (const action of [
      'stageAvatar',
      'previewAvatar',
      'makePublicAvatar',
      'checkText',
      'removeAsset',
    ])
      expect(await h.rpc({ action })).toMatchObject({ ok: false, code: 'environment-forbidden' })
    expect(h.storage).not.toHaveBeenCalled()
  })
  it('只給檢查服務的連結有效至少 60 分鐘，有效 GET 原樣返回 PNG', async () => {
    const h = harness(),
      assetId = await h.staged(),
      response = await h.rpc({ action: 'submitPrivateImage', assetId })
    expect(response).toMatchObject({ ok: true, data: { traceId: 'image-trace' } })
    expect(JSON.stringify(response)).not.toMatch(/https:|signature|base64/)
    const event = fromUrl(h.mediaUrls[0]),
      expires = Number(event.queryStringParameters.expires)
    expect(expires - Date.now()).toBeGreaterThanOrEqual(3599000)
    const http = await h.http(event)
    expect(http.statusCode).toBe(200)
    expect(Buffer.from(http.body, 'base64')).toEqual(image)
  })
  it.each(['signature', 'expires', 'assetId', 'sha256'])(
    '篡改 %s 或沒有簽名均不得讀取',
    async (field) => {
      const h = harness(),
        assetId = await h.staged()
      await h.rpc({ action: 'submitPrivateImage', assetId })
      const event = fromUrl(h.mediaUrls[0])
      event.queryStringParameters[field] = 'forged'
      expect((await h.http(event)).statusCode).toBe(403)
      expect(
        (await h.http({ path: event.path, httpMethod: 'GET', queryStringParameters: {} }))
          .statusCode,
      ).toBe(403)
    },
  )
  it('連結到期、HTTP POST 素材與錯路徑均拒絕', async () => {
    const h = harness(),
      assetId = await h.staged()
    await h.rpc({ action: 'submitPrivateImage', assetId })
    const event = fromUrl(h.mediaUrls[0])
    vi.spyOn(Date, 'now').mockReturnValue(Number(event.queryStringParameters.expires) + 1)
    try {
      expect((await h.http(event)).statusCode).toBe(403)
    } finally {
      vi.restoreAllMocks()
    }
    expect((await h.http({ ...event, httpMethod: 'POST' })).statusCode).toBe(403)
    expect((await h.http({ ...event, path: '/other/avatar' })).statusCode).toBe(403)
  })
  it('有效晚到回調持久匹配，pass 仍不產生公開檔案', async () => {
    const h = harness(),
      assetId = await h.staged()
    await h.rpc({ action: 'submitPrivateImage', assetId })
    expect(await h.http(callbackEvent())).toMatchObject({ statusCode: 200, body: 'success' })
    expect(await h.rpc({ action: 'getPrivateImageStatus', assetId })).toMatchObject({
      ok: true,
      data: { suggest: 'pass', status: 'matched' },
    })
    expect(h.rows().get(assets + ':' + assetId)?.publicFileId).toBeUndefined()
    expect(h.storage).not.toHaveBeenCalled()
  })
  it('早到事件在 trace 建立前先保存，映射建立後同交易匹配', async () => {
    const h = harness(),
      assetId = await h.staged()
    h.providerHook(async () => {
      expect(await h.http(callbackEvent())).toMatchObject({ statusCode: 200 })
      expect([...h.rows().keys()].filter((k) => k.startsWith(results + ':'))).toHaveLength(0)
    })
    expect(await h.rpc({ action: 'submitPrivateImage', assetId })).toMatchObject({ ok: true })
    expect(await h.rpc({ action: 'getPrivateImageStatus', assetId })).toMatchObject({
      ok: true,
      data: { status: 'matched', suggest: 'pass' },
    })
  })
  it('重複回調幂等，衝突結果拒絕且不覆蓋首次結果', async () => {
    const h = harness(),
      assetId = await h.staged()
    await h.rpc({ action: 'submitPrivateImage', assetId })
    const event = callbackEvent()
    expect((await h.http(event)).statusCode).toBe(200)
    expect((await h.http(event)).statusCode).toBe(200)
    expect((await h.http(callbackEvent('risky'))).statusCode).toBe(403)
    expect(await h.rpc({ action: 'getPrivateImageStatus', assetId })).toMatchObject({
      data: { suggest: 'pass' },
    })
  })
  it('未知 trace 不猜資產，錯簽名與錯 AppID 不落庫', async () => {
    const h = harness(),
      assetId = await h.staged()
    await h.rpc({ action: 'submitPrivateImage', assetId })
    expect((await h.http(callbackEvent('pass', 'unknown-trace'))).statusCode).toBe(200)
    expect(await h.rpc({ action: 'getPrivateImageStatus', assetId })).toMatchObject({
      data: { status: 'checking' },
    })
    const before = h.rows().size,
      bad = callbackEvent()
    bad.queryStringParameters.msg_signature = '0'.repeat(40)
    expect((await h.http(bad)).statusCode).toBe(403)
    expect(
      (await h.http(callbackEvent('pass', 'wrong-app', 'wx0000000000000002'))).statusCode,
    ).toBe(403)
    expect(h.rows().size).toBe(before)
  })
  it('45 分鐘以後結果不放行，狀態可見為 timed-out', async () => {
    const h = harness(),
      assetId = await h.staged()
    await h.rpc({ action: 'submitPrivateImage', assetId })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2700001)
    try {
      expect((await h.http(callbackEvent())).statusCode).toBe(200)
      expect(await h.rpc({ action: 'getPrivateImageStatus', assetId })).toMatchObject({
        data: { status: 'timed-out', suggest: null },
      })
    } finally {
      vi.restoreAllMocks()
    }
    expect([...h.rows().keys()].filter((k) => k.startsWith(results + ':'))).toHaveLength(0)
  })
  it('資料庫故障回 503，不虛假應答 success', async () => {
    const h = harness()
    h.failDb()
    expect(await h.http(callbackEvent())).toMatchObject({ statusCode: 503, body: 'cloud-error' })
  })
  it('同一素材不重複提交 provider，清除後舊回調不恢復', async () => {
    const h = harness(),
      assetId = await h.staged()
    expect(await h.rpc({ action: 'submitPrivateImage', assetId })).toMatchObject({ ok: true })
    expect(await h.rpc({ action: 'submitPrivateImage', assetId })).toMatchObject({ ok: true })
    expect(h.cloud.openapi.security.mediaCheckAsync).toHaveBeenCalledTimes(1)
    expect(await h.rpc({ action: 'removePrivateAvatar', assetId })).toMatchObject({
      ok: true,
      data: { removed: true },
    })
    expect((await h.http(callbackEvent())).statusCode).toBe(200)
    expect(h.rows().has(assets + ':' + assetId)).toBe(false)
    expect([...h.rows().keys()].filter((k) => k.startsWith(results + ':'))).toHaveLength(0)
  })
  it('trace 的內容 hash 不符時不匹配', async () => {
    const h = harness(),
      assetId = await h.staged()
    await h.rpc({ action: 'submitPrivateImage', assetId })
    const trace = h.rows().get('message_board_probe_traces:' + helpers.docId(h.cfg, 'image-trace'))!
    trace.sha256 = 'e'.repeat(64)
    expect((await h.http(callbackEvent())).statusCode).toBe(200)
    expect(await h.rpc({ action: 'getPrivateImageStatus', assetId })).toMatchObject({
      data: { status: 'checking' },
    })
    expect([...h.rows().keys()].filter((k) => k.startsWith(results + ':'))).toHaveLength(0)
  })
  it('超過一小時未匹配的早到事件不接受新的 trace 映射', async () => {
    const h = harness()
    await h.http(callbackEvent())
    const id = helpers.docId(h.cfg, 'image-trace')
    h.rows().get(events + ':' + id)!.receivedAt = Date.now() - 3600001
    const assetId = await h.staged()
    await h.rpc({ action: 'submitPrivateImage', assetId })
    expect(await h.rpc({ action: 'getPrivateImageStatus', assetId })).toMatchObject({
      data: { status: 'checking' },
    })
  })
})
