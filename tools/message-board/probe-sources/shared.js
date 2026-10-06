/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash, randomUUID, timingSafeEqual, createDecipheriv } = require('node:crypto')
const { Buffer } = require('node:buffer')

const instanceId = randomUUID()
const fail = (code) => Object.assign(new Error(code), { code })
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const docId = (config, value) => sha256(config.runId + ':' + value)
const collections = {
  assets: 'message_board_probe_assets',
  traces: 'message_board_probe_traces',
  events: 'message_board_probe_events',
  results: 'message_board_probe_results',
}

function checkedContext(cloud, config, action) {
  if (!config || config.enabled !== true) throw fail('probe-disabled')
  const wxContext = cloud.getWXContext()
  // 真實 HTTP 網關沒有 ENV／SOURCE／OPENID；僅此受簽名保護入口可用服務端部署標識。
  // RPC 不走此分支，payload 不能提供標識；兩個 runtime 標識必須同時吻合。
  const httpRuntimeEnvironmentVerified =
    action === 'privateHttp' &&
    config.sharedEnvironmentAuthorization?.scope === 'private-avatar-callback' &&
    (wxContext.ENV == null || wxContext.ENV === '') &&
    (wxContext.SOURCE == null || wxContext.SOURCE === '') &&
    !wxContext.OPENID &&
    !wxContext.FROM_APPID &&
    config.platformEnvironmentId === config.testEnvironmentId &&
    config.platformNamespace === config.testEnvironmentId
  const current = {
    ...wxContext,
    ...(httpRuntimeEnvironmentVerified ? { ENV: config.platformEnvironmentId } : {}),
    httpRuntimeEnvironmentVerified,
  }
  if (
    !config.testEnvironmentId ||
    !config.productionEnvironmentId ||
    current.ENV !== config.testEnvironmentId
  )
    throw fail('environment-forbidden')
  if (config.testEnvironmentId === config.productionEnvironmentId) {
    // 共享正式環境的授權由組包器固化；每批只允許其列明的動作。
    const authorization = config.sharedEnvironmentAuthorization
    const expiresAt = Date.parse(authorization?.expiresAt || '')
    const allowedActions =
      authorization?.scope === 'identity-text'
        ? ['getIdentity', 'checkText']
        : authorization?.scope === 'transport-only'
          ? ['getIdentity', 'echoImage']
          : authorization?.scope === 'private-avatar-callback'
            ? [
                'getIdentity',
                'stagePrivateAvatar',
                'previewPrivateAvatar',
                'submitPrivateImage',
                'getPrivateImageStatus',
                'removePrivateAvatar',
                'privateHttp',
              ]
            : []
    if (
      authorization?.environmentId !== current.ENV ||
      authorization?.runId !== config.runId ||
      !/^g0-shared-[a-z0-9_-]{1,50}$/.test(config.runId || '') ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      expiresAt - Date.now() > 86400000 ||
      !allowedActions.includes(action)
    )
      throw fail('environment-forbidden')
  }
  if (
    !/^wx[a-f0-9]{16}$/.test(config.appId || '') ||
    !/^[a-f0-9]{40}$/.test(config.candidateSha || '') ||
    !/^[a-f0-9]{64}$/.test(config.buildSha || '') ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(config.runId || '')
  )
    throw fail('config-invalid')
  return current
}
function checkedActor(current, config, write = false) {
  const directDevtools =
    current.SOURCE === 'wx_devtools' &&
    config.testEnvironmentId === config.productionEnvironmentId &&
    ['identity-text', 'transport-only', 'private-avatar-callback'].includes(
      config.sharedEnvironmentAuthorization?.scope,
    )
  if (
    (current.SOURCE !== 'wx_client' && !directDevtools) ||
    current.APPID !== config.appId ||
    typeof current.OPENID !== 'string' ||
    !current.OPENID ||
    current.FROM_APPID
  ) {
    throw fail('source-forbidden')
  }
  const actorHash = sha256(config.appId + ':' + current.OPENID)
  if (
    write &&
    (!Array.isArray(config.allowedActorHashes) || !config.allowedActorHashes.includes(actorHash))
  ) {
    throw fail('actor-forbidden')
  }
  return actorHash
}
function metadata(config, current, extra = {}) {
  return {
    runId: config.runId,
    candidateSha: config.candidateSha,
    buildSha: config.buildSha || null,
    environmentId: current.ENV,
    appId: config.appId,
    source: current.SOURCE,
    instanceId,
    performedAt: new Date().toISOString(),
    ...extra,
  }
}
function missingDocument(error) {
  return (
    ['DATABASE_DOCUMENT_NOT_EXIST', 'DOCUMENT_NOT_FOUND'].includes(error?.code) ||
    error?.message === 'not found' ||
    /^document\.get:fail.*(?:document.*does not exist|no document found)/i.test(
      error?.errMsg || error?.message || '',
    )
  )
}
async function optionalDoc(db, collection, id) {
  try {
    return (await db.collection(collection).doc(id).get()).data || null
  } catch (error) {
    // 探測資料不存在的情況；其他服務端錯誤不冒充不存在。
    if (missingDocument(error)) return null
    throw error
  }
}
function imageBytes(base64) {
  if (
    typeof base64 !== 'string' ||
    !base64 ||
    base64.length > 87384 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
  )
    throw fail('invalid-image')
  const bytes = Buffer.from(base64, 'base64')
  if (!bytes.length || bytes.length > 65536 || bytes.toString('base64') !== base64)
    throw fail('invalid-image')
  let width = 0,
    height = 0,
    extension = ''
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.subarray(12, 16).toString('ascii') === 'IHDR'
  ) {
    width = bytes.readUInt32BE(16)
    height = bytes.readUInt32BE(20)
    extension = 'png'
  } else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) throw fail('invalid-image')
      while (offset < bytes.length && bytes[offset] === 255) offset++
      const marker = bytes[offset++]
      if (marker === 217 || marker === 218) break
      const length = bytes.readUInt16BE(offset)
      if (length < 2 || offset + length > bytes.length) throw fail('invalid-image')
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        if (length < 7) throw fail('invalid-image')
        height = bytes.readUInt16BE(offset + 3)
        width = bytes.readUInt16BE(offset + 5)
        extension = 'jpg'
        break
      }
      offset += length
    }
  }
  if (!width || !height || Math.max(width, height) > 256) throw fail('invalid-image')
  // 此處只界定傳輸簽名／尺寸；完整解碼與安全性仍須平台實測。
  return { bytes, width, height, extension }
}
function apiValue(value, camel, snake) {
  if (
    !value ||
    typeof value !== 'object' ||
    (value[camel] !== undefined && value[snake] !== undefined && value[camel] !== value[snake])
  )
    throw fail('provider-response-invalid')
  return value[camel] ?? value[snake]
}
function checkedApi(value, needTrace = true) {
  const code = apiValue(value, 'errCode', 'errcode')
  const traceId = apiValue(value, 'traceId', 'trace_id')
  if (
    code !== 0 ||
    (needTrace && (typeof traceId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(traceId)))
  )
    throw fail('provider-error')
  return traceId
}
function safeCode(error) {
  const allowed = [
    'probe-disabled',
    'environment-forbidden',
    'config-invalid',
    'source-forbidden',
    'actor-forbidden',
    'invalid-image',
    'not-found',
    'safety-not-ready',
    'provider-error',
    'provider-response-invalid',
    'unknown-action',
    'invalid-http',
    'invalid-signature',
    'invalid-encryption',
    'invalid-event',
  ]
  return allowed.includes(error?.code) ? error.code : 'cloud-error'
}
function signature(token, parts) {
  return createHash('sha1')
    .update([token, ...parts].sort().join(''))
    .digest('hex')
}
function checkSignature(expected, actual) {
  return (
    typeof actual === 'string' &&
    /^[a-f0-9]{40}$/.test(actual) &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
}
function decodeEvent(encrypted, keyText, appId) {
  if (
    typeof encrypted !== 'string' ||
    encrypted.length > 98304 ||
    typeof keyText !== 'string' ||
    !/^[A-Za-z0-9+/]{43}$/.test(keyText)
  )
    throw fail('invalid-encryption')
  const key = Buffer.from(keyText + '=', 'base64')
  const cipherBytes = Buffer.from(encrypted, 'base64')
  if (
    !cipherBytes.length ||
    cipherBytes.length % 16 ||
    cipherBytes.toString('base64') !== encrypted
  )
    throw fail('invalid-encryption')
  let plain
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16))
    decipher.setAutoPadding(false)
    plain = Buffer.concat([decipher.update(cipherBytes), decipher.final()])
  } catch {
    throw fail('invalid-encryption')
  }
  const padding = plain[plain.length - 1]
  if (
    !padding ||
    padding > 32 ||
    padding > plain.length ||
    !plain.subarray(plain.length - padding).equals(Buffer.alloc(padding, padding))
  )
    throw fail('invalid-encryption')
  plain = plain.subarray(0, plain.length - padding)
  if (plain.length < 20) throw fail('invalid-encryption')
  const length = plain.readUInt32BE(16)
  if (length > plain.length - 20 || plain.subarray(20 + length).toString('utf8') !== appId)
    throw fail('invalid-encryption')
  let payload
  try {
    payload = JSON.parse(plain.subarray(20, 20 + length).toString('utf8'))
  } catch {
    throw fail('invalid-event')
  }
  if (
    !payload ||
    payload.appid !== appId ||
    payload.MsgType !== 'event' ||
    payload.Event !== 'wxa_media_check' ||
    payload.version !== 2 ||
    typeof payload.trace_id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,160}$/.test(payload.trace_id) ||
    !Number.isInteger(payload.errcode) ||
    (payload.errcode === 0 && !['pass', 'review', 'risky'].includes(payload.result?.suggest))
  )
    throw fail('invalid-event')
  return {
    traceId: payload.trace_id,
    errCode: payload.errcode,
    suggest: payload.errcode === 0 ? payload.result.suggest : null,
  }
}

module.exports = {
  collections,
  checkedContext,
  checkedActor,
  metadata,
  optionalDoc,
  missingDocument,
  imageBytes,
  checkedApi,
  safeCode,
  signature,
  checkSignature,
  decodeEvent,
  sha256,
  docId,
  randomUUID,
}
