import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
type RecordData = Record<string, unknown>
type ProbeReply = {
  ok: boolean
  code?: string
  data?: RecordData
  statusCode?: number
  body?: string
}
type Probe = (event: RecordData) => Promise<ProbeReply>
const rpcModule = require('../../tools/message-board/probe-sources/rpc.js') as {
  createProbe: (cloud: ReturnType<typeof makeCloud>, config: RecordData) => Probe
}
const callbackModule =
  require('../../tools/message-board/probe-sources/callback.js') as typeof rpcModule
const workerModule =
  require('../../tools/message-board/probe-sources/worker.js') as typeof rpcModule

const appId = 'wx0000000000000001'
const envId = 'cloud1-board-test'
const actorHash = (openId: string) =>
  createHash('sha256')
    .update(appId + ':' + openId)
    .digest('hex')
const aesKey = Buffer.alloc(32, 7)
const config = () => ({
  enabled: true,
  testEnvironmentId: envId,
  productionEnvironmentId: 'cloud1-d7gxfuxfe813b4eaa',
  appId,
  runId: 'g0-test',
  candidateSha: 'a'.repeat(40),
  buildSha: 'b'.repeat(64),
  allowedActorHashes: [actorHash('author-a'), actorHash('author-b')],
  token: 'test-token',
  encodingAESKey: aesKey.toString('base64').replace(/=$/, ''),
  timerSource: 'timer',
})
const sharedConfig = () => ({
  ...config(),
  testEnvironmentId: 'cloud1-d7gxfuxfe813b4eaa',
  runId: 'g0-shared-test',
  sharedEnvironmentAuthorization: {
    environmentId: 'cloud1-d7gxfuxfe813b4eaa',
    runId: 'g0-shared-test',
    scope: 'identity-text',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  },
})

function makeCloud() {
  let context = { ENV: envId, APPID: appId, OPENID: 'author-a', SOURCE: 'wx_client' }
  const rows = new Map<string, RecordData>()
  const files = new Map<string, Buffer>()
  let writes = 0
  const collection = (name: string) => ({
    doc: (id: string) => ({
      async get() {
        const data = rows.get(name + ':' + id)
        if (!data) throw new Error('not found')
        return { data: { ...data } }
      },
      async set({ data }: { data: RecordData }) {
        rows.set(name + ':' + id, { ...data })
        writes++
        return { _id: id }
      },
      async update({ data }: { data: RecordData }) {
        rows.set(name + ':' + id, { ...rows.get(name + ':' + id), ...data })
        writes++
        return { stats: { updated: 1 } }
      },
      async remove() {
        rows.delete(name + ':' + id)
        writes++
        return { stats: { removed: 1 } }
      },
    }),
    where: (filter: RecordData) => ({
      limit: (_size: number) => ({
        async get() {
          return {
            data: [...rows.entries()]
              .filter(
                ([key, row]) =>
                  key.startsWith(name + ':') &&
                  Object.entries(filter).every(([k, v]) => row[k] === v),
              )
              .map(([key, row]) => ({ _id: key.slice(name.length + 1), ...row })),
          }
        },
      }),
    }),
  })
  let queue: Promise<unknown> = Promise.resolve()
  const cloud = {
    getWXContext: () => ({ ...context }),
    database: () => ({
      collection,
      runTransaction: <T>(fn: (tx: { collection: typeof collection }) => Promise<T>) => {
        const result = queue.then(() => fn({ collection }))
        queue = result.catch(() => undefined)
        return result
      },
    }),
    async uploadFile({ cloudPath, fileContent }: { cloudPath: string; fileContent: Buffer }) {
      const fileID = 'cloud://test/' + cloudPath
      files.set(fileID, Buffer.from(fileContent))
      writes++
      return { fileID }
    },
    async downloadFile({ fileID }: { fileID: string }) {
      const fileContent = files.get(fileID)
      if (!fileContent) throw new Error('not found')
      return { fileContent: Buffer.from(fileContent) }
    },
    async deleteFile({ fileList }: { fileList: string[] }) {
      for (const id of fileList) files.delete(id)
      writes++
      return { fileList: fileList.map((fileID) => ({ fileID, status: 0, errMsg: 'ok' })) }
    },
    async getTempFileURL() {
      return {
        fileList: [
          { status: 0, tempFileURL: 'https://example.invalid/private-signed', maxAge: 3600 },
        ],
      }
    },
    openapi: {
      security: {
        async msgSecCheck() {
          return { errCode: 0, result: { suggest: 'pass', label: 100 }, traceId: 'text-trace' }
        },
        async mediaCheckAsync() {
          return { errCode: 0, traceId: 'image-trace' }
        },
      },
    },
  }
  return {
    ...cloud,
    rows,
    files,
    writeCount: () => writes,
    setContext: (patch: Partial<typeof context>) => {
      context = { ...context, ...patch }
    },
  }
}

function encryptedEvent(event: RecordData, tailAppId = appId) {
  const message = Buffer.from(JSON.stringify(event))
  const length = Buffer.alloc(4)
  length.writeUInt32BE(message.length)
  const raw = Buffer.concat([randomBytes(16), length, message, Buffer.from(tailAppId)])
  const count = 32 - (raw.length % 32)
  const padded = Buffer.concat([raw, Buffer.alloc(count, count)])
  const cipher = createCipheriv('aes-256-cbc', aesKey, aesKey.subarray(0, 16))
  cipher.setAutoPadding(false)
  const Encrypt = Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64')
  const timestamp = '1791210000'
  const nonce = 'nonce-a'
  const msg_signature = createHash('sha1')
    .update(['test-token', timestamp, nonce, Encrypt].sort().join(''))
    .digest('hex')
  return {
    httpMethod: 'POST',
    queryStringParameters: { timestamp, nonce, msg_signature },
    body: JSON.stringify({ Encrypt }),
  }
}

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0S8AAAAASUVORK5CYII=',
  'base64',
)

describe('G0 探測入口的本地安全邊界', () => {
  it('傳輸範圍可往返有界圖片位元組，且不寫雲端素材或資料庫', async () => {
    const cloud = makeCloud()
    cloud.setContext({ ENV: 'cloud1-d7gxfuxfe813b4eaa', SOURCE: 'wx_devtools' })
    const approved = sharedConfig()
    approved.sharedEnvironmentAuthorization.scope = 'transport-only'
    const rpc = rpcModule.createProbe(cloud, approved)
    expect(await rpc({ action: 'echoImage', base64: image.toString('base64') })).toMatchObject({
      ok: true,
      data: {
        base64: image.toString('base64'),
        sha256: createHash('sha256').update(image).digest('hex'),
        byteSize: image.length,
      },
    })
    for (const action of ['checkText', 'stageAvatar', 'submitImage', 'makePublicAvatar']) {
      expect(await rpc({ action })).toMatchObject({ ok: false, code: 'environment-forbidden' })
    }
    expect(cloud.writeCount()).toBe(0)
  })
  it('圖片傳輸仍拒絕未批准操作者及超過 64 KiB 的位元組', async () => {
    const cloud = makeCloud()
    cloud.setContext({ ENV: 'cloud1-d7gxfuxfe813b4eaa' })
    const approved = sharedConfig()
    approved.sharedEnvironmentAuthorization.scope = 'transport-only'
    const rpc = rpcModule.createProbe(cloud, approved)
    expect(
      await rpc({ action: 'echoImage', base64: Buffer.alloc(65537).toString('base64') }),
    ).toMatchObject({ ok: false, code: 'invalid-image' })
    cloud.setContext({ OPENID: 'unapproved' })
    expect(await rpc({ action: 'echoImage', base64: image.toString('base64') })).toMatchObject({
      ok: false,
      code: 'actor-forbidden',
    })
    expect(cloud.writeCount()).toBe(0)
  })
  it('預設停用不執行任何雲端寫入', async () => {
    const cloud = makeCloud()
    const probe = rpcModule.createProbe(cloud, { ...config(), enabled: false })
    expect(await probe({ action: 'stageAvatar', base64: image.toString('base64') })).toMatchObject({
      ok: false,
      code: 'probe-disabled',
    })
    expect(cloud.writeCount()).toBe(0)
  })
  it('未固化共享授權時，即使啟用也拒絕使用現有正式環境', async () => {
    const cloud = makeCloud()
    cloud.setContext({ ENV: 'cloud1-d7gxfuxfe813b4eaa' })
    const probe = rpcModule.createProbe(cloud, {
      ...config(),
      testEnvironmentId: 'cloud1-d7gxfuxfe813b4eaa',
    })
    expect(await probe({ action: 'getIdentity' })).toMatchObject({
      ok: false,
      code: 'environment-forbidden',
    })
    expect(cloud.writeCount()).toBe(0)
  })
  it('固化共享授權只允許同環境同批次的身分與合成文字檢查', async () => {
    const cloud = makeCloud()
    cloud.setContext({ ENV: 'cloud1-d7gxfuxfe813b4eaa' })
    const rpc = rpcModule.createProbe(cloud, sharedConfig())
    expect(await rpc({ action: 'getIdentity' })).toMatchObject({
      ok: true,
      data: { environmentId: 'cloud1-d7gxfuxfe813b4eaa', actorHash: actorHash('author-a') },
    })
    expect(await rpc({ action: 'checkText' })).toMatchObject({
      ok: true,
      data: { suggest: 'pass', traceId: 'text-trace' },
    })
    expect(cloud.writeCount()).toBe(0)
  })
  it('共享授權仍拒絕非操作者的文字檢查', async () => {
    const cloud = makeCloud()
    cloud.setContext({ ENV: 'cloud1-d7gxfuxfe813b4eaa', OPENID: 'unapproved' })
    expect(await rpcModule.createProbe(cloud, sharedConfig())({ action: 'checkText' })).toEqual({
      ok: false,
      code: 'actor-forbidden',
    })
    expect(cloud.writeCount()).toBe(0)
  })
  it('共享文字 API 失敗只保留數字錯誤碼，不回傳含權杖的 SDK 原文', async () => {
    const cloud = makeCloud()
    cloud.setContext({ ENV: 'cloud1-d7gxfuxfe813b4eaa' })
    cloud.openapi.security.msgSecCheck = async () => {
      throw Object.assign(
        new Error('permission denied https://secret.invalid?token=private-token'),
        { errCode: -604101 },
      )
    }
    const reply = await rpcModule.createProbe(cloud, sharedConfig())({ action: 'checkText' })
    expect(reply).toMatchObject({
      ok: false,
      code: 'cloud-error',
      diagnostic: {
        api: 'security.msgSecCheck',
        errCode: -604101,
        errorType: 'Error',
        permissionHint: true,
      },
    })
    expect(JSON.stringify(reply)).not.toContain('private-token')
    expect(JSON.stringify(reply)).not.toContain('secret.invalid')
    expect(cloud.writeCount()).toBe(0)
  })
  it('共享身分診斷拒絕來源時僅返回有界來源觀察，不洩漏完整 OpenID', async () => {
    const cloud = makeCloud()
    cloud.setContext({ ENV: 'cloud1-d7gxfuxfe813b4eaa', SOURCE: 'wx_unknown' })
    const reply = await rpcModule.createProbe(cloud, sharedConfig())({ action: 'getIdentity' })
    expect(reply).toMatchObject({
      ok: false,
      code: 'source-forbidden',
      diagnostic: {
        source: 'wx_unknown',
        appId,
        hasOpenId: true,
        hasFromAppId: false,
      },
    })
    expect(JSON.stringify(reply)).not.toContain('author-a')
    expect(cloud.writeCount()).toBe(0)
    const ordinary = rpcModule.createProbe(cloud, config())
    cloud.setContext({ ENV: envId })
    expect(await ordinary({ action: 'getIdentity' })).not.toHaveProperty('diagnostic')
  })
  it('只在已固化共享測試授權中接受直接開發者工具來源', async () => {
    const cloud = makeCloud()
    cloud.setContext({ ENV: 'cloud1-d7gxfuxfe813b4eaa', SOURCE: 'wx_devtools' })
    const rpc = rpcModule.createProbe(cloud, sharedConfig())
    expect(await rpc({ action: 'getIdentity' })).toMatchObject({
      ok: true,
      data: { source: 'wx_devtools', actorHash: actorHash('author-a') },
    })
    expect(await rpc({ action: 'checkText' })).toMatchObject({ ok: true })
    expect(cloud.writeCount()).toBe(0)
    cloud.setContext({ ENV: envId })
    expect(await rpcModule.createProbe(cloud, config())({ action: 'getIdentity' })).toMatchObject({
      ok: false,
      code: 'source-forbidden',
    })
  })
  it.each(['wx_devtools,scf', 'wx_http', 'timer', 'wx_unknown', ''])(
    '共享测试仍拒絕 %s 來源，不能由 payload 冒充直接微信呼叫',
    async (source) => {
      const cloud = makeCloud()
      cloud.setContext({ ENV: 'cloud1-d7gxfuxfe813b4eaa', SOURCE: source })
      expect(
        await rpcModule.createProbe(
          cloud,
          sharedConfig(),
        )({ action: 'getIdentity', SOURCE: 'wx_devtools' }),
      ).toMatchObject({
        ok: false,
        code: 'source-forbidden',
      })
      expect(cloud.writeCount()).toBe(0)
    },
  )
  it('共享授權不能用來上傳圖片、寫回調或執行 worker', async () => {
    const cloud = makeCloud()
    cloud.setContext({ ENV: 'cloud1-d7gxfuxfe813b4eaa' })
    const approved = sharedConfig()
    const rpc = rpcModule.createProbe(cloud, approved)
    for (const action of [
      'stageAvatar',
      'previewAvatar',
      'submitImage',
      'makePublicAvatar',
      'removeAsset',
    ]) {
      expect(await rpc({ action, base64: image.toString('base64') })).toMatchObject({
        ok: false,
        code: 'environment-forbidden',
      })
    }
    cloud.setContext({ SOURCE: 'http', OPENID: '' })
    expect(await callbackModule.createProbe(cloud, approved)({})).toMatchObject({ statusCode: 403 })
    cloud.setContext({ SOURCE: 'timer', OPENID: '' })
    expect(await workerModule.createProbe(cloud, approved)({})).toMatchObject({
      ok: false,
      code: 'environment-forbidden',
    })
    expect(cloud.writeCount()).toBe(0)
  })
  it.each(['environment', 'run', 'expired', 'scope'])(
    '共享授權的 %s 不符時，不接受 payload 提供的授權',
    async (mismatch) => {
      const cloud = makeCloud()
      cloud.setContext({ ENV: 'cloud1-d7gxfuxfe813b4eaa' })
      const approved = sharedConfig()
      const auth = approved.sharedEnvironmentAuthorization
      if (mismatch === 'environment') auth.environmentId = 'other-env'
      if (mismatch === 'run') auth.runId = 'other-run'
      if (mismatch === 'expired') auth.expiresAt = new Date(Date.now() - 1000).toISOString()
      if (mismatch === 'scope') auth.scope = 'all'
      expect(
        await rpcModule.createProbe(
          cloud,
          approved,
        )({
          action: 'getIdentity',
          sharedEnvironmentAuthorization: sharedConfig().sharedEnvironmentAuthorization,
        }),
      ).toMatchObject({ ok: false, code: 'environment-forbidden' })
      expect(cloud.writeCount()).toBe(0)
    },
  )
  it('重新讀取本次身分而不快取第一位使用者', async () => {
    const cloud = makeCloud()
    const probe = rpcModule.createProbe(cloud, config())
    expect(await probe({ action: 'getIdentity' })).toMatchObject({
      ok: true,
      data: { actorHash: actorHash('author-a') },
    })
    cloud.setContext({ OPENID: 'author-b' })
    expect(await probe({ action: 'getIdentity' })).toMatchObject({
      ok: true,
      data: { actorHash: actorHash('author-b') },
    })
  })
  it('HTTP 或跨帳號不能冒充小程序身分', async () => {
    const cloud = makeCloud()
    const probe = rpcModule.createProbe(cloud, config())
    cloud.setContext({ SOURCE: 'http' })
    expect(
      await probe({ action: 'getIdentity', SOURCE: 'wx_client', OPENID: 'author-a' }),
    ).toMatchObject({ ok: false, code: 'source-forbidden' })
    cloud.setContext({ SOURCE: 'wx_client', APPID: 'wx0000000000000002' })
    expect(await probe({ action: 'getIdentity' })).toMatchObject({
      ok: false,
      code: 'source-forbidden',
    })
  })
  it('他人不能讀取探測中的私有頭像', async () => {
    const cloud = makeCloud()
    const probe = rpcModule.createProbe(cloud, config())
    const created = await probe({ action: 'stageAvatar', base64: image.toString('base64') })
    expect(created.ok).toBe(true)
    cloud.setContext({ OPENID: 'author-b' })
    expect(await probe({ action: 'previewAvatar', assetId: created.data?.assetId })).toMatchObject({
      ok: false,
      code: 'not-found',
    })
  })
  it('尚未收到合格的真實安全結果不準備公開副本', async () => {
    const cloud = makeCloud()
    const probe = rpcModule.createProbe(cloud, config())
    const created = await probe({ action: 'stageAvatar', base64: image.toString('base64') })
    expect(
      await probe({ action: 'makePublicAvatar', assetId: created.data?.assetId }),
    ).toMatchObject({ ok: false, code: 'safety-not-ready' })
    expect(cloud.files.size).toBe(1)
  })
  it('超過圖片預算在任何上傳前被拒絕', async () => {
    const cloud = makeCloud()
    const probe = rpcModule.createProbe(cloud, config())
    expect(
      await probe({ action: 'stageAvatar', base64: Buffer.alloc(65537).toString('base64') }),
    ).toMatchObject({ ok: false, code: 'invalid-image' })
    expect(cloud.writeCount()).toBe(0)
  })
  it('簽名錯誤不能寫入回調紀錄', async () => {
    const cloud = makeCloud()
    cloud.setContext({ SOURCE: 'http', OPENID: '' })
    const probe = callbackModule.createProbe(cloud, config())
    const event = encryptedEvent({
      appid: appId,
      MsgType: 'event',
      Event: 'wxa_media_check',
      version: 2,
      trace_id: 'image-trace',
      errcode: 0,
      result: { suggest: 'pass' },
    })
    event.queryStringParameters.msg_signature = '0'.repeat(40)
    expect(await probe(event)).toMatchObject({ statusCode: 403 })
    expect(cloud.writeCount()).toBe(0)
  })
  it('解密消息尾端 AppID 不一致不能落庫', async () => {
    const cloud = makeCloud()
    cloud.setContext({ SOURCE: 'http', OPENID: '' })
    const probe = callbackModule.createProbe(cloud, config())
    expect(
      await probe(
        encryptedEvent(
          {
            appid: appId,
            MsgType: 'event',
            Event: 'wxa_media_check',
            version: 2,
            trace_id: 'image-trace',
            errcode: 0,
            result: { suggest: 'pass' },
          },
          'wx0000000000000002',
        ),
      ),
    ).toMatchObject({ statusCode: 403 })
    expect(cloud.writeCount()).toBe(0)
  })
  it('有效安全事件即使早到也落庫，重複推送不新增另一事件', async () => {
    const cloud = makeCloud()
    cloud.setContext({ SOURCE: 'http', OPENID: '' })
    const probe = callbackModule.createProbe(cloud, config())
    const event = encryptedEvent({
      appid: appId,
      MsgType: 'event',
      Event: 'wxa_media_check',
      version: 2,
      trace_id: 'image-trace',
      errcode: 0,
      result: { suggest: 'pass' },
    })
    expect(await probe(event)).toMatchObject({ statusCode: 200, body: 'success' })
    expect(await probe(event)).toMatchObject({ statusCode: 200, body: 'success' })
    expect(
      [...cloud.rows.keys()].filter((key) => key.startsWith('message_board_probe_events:')),
    ).toHaveLength(1)
  })
  it('小程序 event 自稱 timer 不會執行定時工作', async () => {
    const cloud = makeCloud()
    const probe = workerModule.createProbe(cloud, config())
    expect(await probe({ SOURCE: 'timer', action: 'run' })).toMatchObject({
      ok: false,
      code: 'source-forbidden',
    })
    expect(cloud.writeCount()).toBe(0)
  })
  it('早到回調可在 trace 建立後匹配，且公開／清理確實作用於同一素材', async () => {
    const cloud = makeCloud()
    const rpc = rpcModule.createProbe(cloud, config())
    const callback = callbackModule.createProbe(cloud, config())
    const worker = workerModule.createProbe(cloud, config())
    const created = await rpc({ action: 'stageAvatar', base64: image.toString('base64') })
    cloud.setContext({ SOURCE: 'http', OPENID: '' })
    await callback(
      encryptedEvent({
        appid: appId,
        MsgType: 'event',
        Event: 'wxa_media_check',
        version: 2,
        trace_id: 'image-trace',
        errcode: 0,
        result: { suggest: 'pass' },
      }),
    )
    cloud.setContext({ SOURCE: 'timer', OPENID: '' })
    expect(await worker({})).toMatchObject({ ok: true, data: { matched: 0 } })
    cloud.setContext({ SOURCE: 'wx_client', OPENID: 'author-a' })
    expect(await rpc({ action: 'submitImage', assetId: created.data?.assetId })).toMatchObject({
      ok: true,
      data: { traceId: 'image-trace' },
    })
    cloud.setContext({ SOURCE: 'timer', OPENID: '' })
    expect(await worker({})).toMatchObject({ ok: true, data: { matched: 1 } })
    expect(await worker({})).toMatchObject({ ok: true, data: { matched: 0 } })
    cloud.setContext({ SOURCE: 'wx_client', OPENID: 'author-a' })
    expect(await rpc({ action: 'makePublicAvatar', assetId: created.data?.assetId })).toMatchObject(
      { ok: true },
    )
    expect(cloud.files.size).toBe(2)
    expect(await rpc({ action: 'previewAvatar', assetId: created.data?.assetId })).toMatchObject({
      ok: true,
      data: { base64: image.toString('base64') },
    })
    expect(await rpc({ action: 'removeAsset', assetId: created.data?.assetId })).toMatchObject({
      ok: true,
      data: { removed: true },
    })
    expect(cloud.files.size).toBe(0)
  })
  it('另一素材的安全結果不能用來公開當前頭像', async () => {
    const cloud = makeCloud()
    const rpc = rpcModule.createProbe(cloud, config())
    const created = await rpc({ action: 'stageAvatar', base64: image.toString('base64') })
    await rpc({ action: 'submitImage', assetId: created.data?.assetId })
    const id = createHash('sha256').update('g0-test:image-trace').digest('hex')
    cloud.rows.set('message_board_probe_results:' + id, {
      runId: 'g0-test',
      candidateSha: 'a'.repeat(40),
      assetId: 'other-asset',
      traceId: 'image-trace',
      errCode: 0,
      suggest: 'pass',
    })
    expect(await rpc({ action: 'makePublicAvatar', assetId: created.data?.assetId })).toMatchObject(
      { ok: false, code: 'safety-not-ready' },
    )
    expect(cloud.files.size).toBe(1)
  })
  it('服務端讀取失敗不能被當作資料不存在再寫入', async () => {
    const cloud = makeCloud()
    cloud.setContext({ SOURCE: 'http', OPENID: '' })
    let unexpectedWrites = 0
    const db = cloud.database()
    const brokenCollection: typeof db.collection = (name) => {
      const original = db.collection(name)
      return {
        ...original,
        doc: (id) => ({
          ...original.doc(id),
          async get() {
            throw Object.assign(new Error('database unavailable'), { errCode: -502001 })
          },
          async set() {
            unexpectedWrites++
            return { _id: 'unexpected' }
          },
        }),
      }
    }
    const runTransaction: typeof db.runTransaction = async (fn) =>
      fn({ collection: brokenCollection })
    cloud.database = () => ({ collection: brokenCollection, runTransaction })
    const callback = callbackModule.createProbe(cloud, config())
    expect(
      await callback(
        encryptedEvent({
          appid: appId,
          MsgType: 'event',
          Event: 'wxa_media_check',
          version: 2,
          trace_id: 'image-trace',
          errcode: 0,
          result: { suggest: 'pass' },
        }),
      ),
    ).toMatchObject({ statusCode: 503 })
    expect(unexpectedWrites).toBe(0)
  })
})
