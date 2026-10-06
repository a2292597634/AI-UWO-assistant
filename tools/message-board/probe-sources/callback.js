/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { Buffer } = require('node:buffer')
const {
  collections,
  checkedContext,
  signature,
  checkSignature,
  decodeEvent,
  metadata,
  docId,
  safeCode,
  missingDocument,
} = require('./shared')
const privateAvatar = require('./private-avatar')

function createProbe(cloud, config) {
  return async (event) => {
    const response = (statusCode, body) => ({
      statusCode,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body,
    })
    try {
      const privateScope =
        config.sharedEnvironmentAuthorization?.scope === 'private-avatar-callback'
      const current = checkedContext(cloud, config, privateScope ? 'privateHttp' : undefined)
      if (['wx_client', 'wx_devtools'].includes(current.SOURCE)) throw { code: 'source-forbidden' }
      if (privateScope) {
        if (
          (current.SOURCE !== 'wx_http' && !current.httpRuntimeEnvironmentVerified) ||
          current.OPENID ||
          current.FROM_APPID
        )
          throw { code: 'source-forbidden' }
        if (event?.path === '/message-board-g0/' + config.runId + '/avatar')
          return await privateAvatar.serve(cloud.database(), config, event)
        if (event?.path !== '/message-board-g0/' + config.runId) throw { code: 'invalid-http' }
      }
      if (
        typeof config.token !== 'string' ||
        !config.token ||
        typeof event?.httpMethod !== 'string'
      )
        throw { code: 'invalid-http' }
      const query = event.queryStringParameters
      if (
        !query ||
        typeof query.timestamp !== 'string' ||
        typeof query.nonce !== 'string' ||
        query.timestamp.length > 32 ||
        query.nonce.length > 80
      )
        throw { code: 'invalid-http' }
      if (event.httpMethod === 'GET') {
        if (
          !checkSignature(
            signature(config.token, [query.timestamp, query.nonce]),
            query.signature,
          ) ||
          typeof query.echostr !== 'string' ||
          query.echostr.length > 1024
        )
          throw { code: 'invalid-signature' }
        return response(200, query.echostr)
      }
      if (
        event.httpMethod !== 'POST' ||
        typeof event.body !== 'string' ||
        event.isBase64Encoded ||
        Buffer.byteLength(event.body, 'utf8') > 98304
      )
        throw { code: 'invalid-http' }
      let body
      try {
        body = JSON.parse(event.body)
      } catch {
        throw { code: 'invalid-http' }
      }
      if (
        typeof body?.Encrypt !== 'string' ||
        !checkSignature(
          signature(config.token, [query.timestamp, query.nonce, body.Encrypt]),
          query.msg_signature,
        )
      )
        throw { code: 'invalid-signature' }
      const payload = decodeEvent(body.Encrypt, config.encodingAESKey, config.appId)
      const db = cloud.database()
      if (privateScope) {
        await privateAvatar.accept(db, config, payload)
        return response(200, 'success')
      }
      const id = docId(config, payload.traceId)
      // 驗簽後的早到事件先落庫；尚未建立 trace 映射時不猜測資產歸屬。
      await db.runTransaction(async (tx) => {
        const doc = tx.collection(collections.events).doc(id)
        let existing
        try {
          existing = (await doc.get()).data
        } catch (error) {
          if (!missingDocument(error)) throw error
        }
        if (!existing)
          await doc.set({ data: { ...metadata(config, current), ...payload, matched: false } })
      })
      return response(200, 'success')
    } catch (error) {
      const code = safeCode(error)
      const result = response(code === 'cloud-error' ? 503 : 403, code)
      // 新 HTTP 網關上下文尚待實測；僅觀察公開環境／來源字串與存在性，不回原始上下文。
      if (
        config.sharedEnvironmentAuthorization?.scope === 'private-avatar-callback' &&
        ['environment-forbidden', 'source-forbidden', 'invalid-http'].includes(code)
      ) {
        const observed = cloud.getWXContext()
        const safeHeader = (value) =>
          typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : 'absent'
        result.headers['X-Probe-Environment'] = safeHeader(observed.ENV)
        result.headers['X-Probe-Source'] = safeHeader(observed.SOURCE)
        result.headers['X-Probe-Has-Openid'] = String(Boolean(observed.OPENID))
        result.headers['X-Probe-Runtime-Environment'] = safeHeader(config.platformEnvironmentId)
        result.headers['X-Probe-Runtime-Namespace'] = safeHeader(config.platformNamespace)
        const safePath = (value) =>
          typeof value === 'string' && /^[a-zA-Z0-9_/-]{1,180}$/.test(value) ? value : 'absent'
        const fieldNames = (value) =>
          value && typeof value === 'object'
            ? Object.keys(value)
                .filter((key) => /^[a-zA-Z_]{1,40}$/.test(key))
                .slice(0, 25)
                .join(',') || 'none'
            : 'none'
        result.headers['X-Probe-Event-Type'] = typeof event
        result.headers['X-Probe-Event-Fields'] = fieldNames(event)
        result.headers['X-Probe-Request-Fields'] = fieldNames(event?.requestContext)
        result.headers['X-Probe-Body-Type'] = typeof event?.body
        result.headers['X-Probe-Path'] = safePath(event?.path)
        result.headers['X-Probe-Method'] = safeHeader(event?.httpMethod)
      }
      return result
    }
  }
}
module.exports = { createProbe }
