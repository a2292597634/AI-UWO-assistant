const {
  signature,
  checkSignature,
  decodeEvent,
} = require('../message-board/core/wechat-event-crypto')
function createEventsEntry({
  readContext,
  runtimeEnvironment,
  environmentId,
  callbackPath,
  callback,
  service,
}) {
  const response = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body,
  })
  return async (event) => {
    const current = readContext(),
      runtime = runtimeEnvironment()
    if (
      current?.OPENID ||
      current?.APPID ||
      current?.FROM_APPID ||
      ['wx_client', 'wx_devtools'].includes(current?.SOURCE) ||
      (runtime.TCB_ENV || runtime.SCF_NAMESPACE) !== environmentId ||
      runtime.SCF_NAMESPACE !== environmentId
    )
      return response(403, 'forbidden')
    if (event?.httpMethod) {
      if (current?.SOURCE && !['wx_http'].includes(current.SOURCE))
        return response(403, 'forbidden')
      if (event.path === callbackPath + '/avatar') {
        if (event.httpMethod !== 'GET') return response(403, 'forbidden')
        try {
          return await service.servePrivateAvatar(event.queryStringParameters)
        } catch {
          return response(403, 'forbidden')
        }
      }
      if (event.path !== callbackPath) return response(404, 'not-found')
      const query = event.queryStringParameters
      if (
        !query ||
        typeof query.timestamp !== 'string' ||
        typeof query.nonce !== 'string' ||
        query.timestamp.length > 32 ||
        query.nonce.length > 80
      )
        return response(403, 'forbidden')
      if (event.httpMethod === 'GET') {
        if (
          !checkSignature(
            signature(callback.token, [query.timestamp, query.nonce]),
            query.signature,
          ) ||
          typeof query.echostr !== 'string' ||
          query.echostr.length > 1024
        )
          return response(403, 'forbidden')
        return response(200, query.echostr)
      }
      if (
        event.httpMethod !== 'POST' ||
        event.isBase64Encoded ||
        typeof event.body !== 'string' ||
        Buffer.byteLength(event.body) > 98304
      )
        return response(400, 'invalid')
      let payload
      try {
        const body = JSON.parse(event.body)
        if (
          typeof body.Encrypt !== 'string' ||
          !checkSignature(
            signature(callback.token, [query.timestamp, query.nonce, body.Encrypt]),
            query.msg_signature,
          )
        )
          return response(403, 'forbidden')
        payload = decodeEvent(body.Encrypt, callback.aesKey, callback.appId)
      } catch {
        return response(403, 'forbidden')
      }
      try {
        await service.acceptVerifiedEvent(payload)
        return response(200, 'success')
      } catch {
        return response(503, 'retry')
      }
    }
    if (current?.SOURCE && !['timer', 'wx_trigger'].includes(current.SOURCE))
      return response(403, 'forbidden')
    if (event?.Type !== 'Timer' || event.TriggerName !== 'message-board-worker')
      return response(403, 'forbidden')
    return { ok: true, data: await service.runDue() }
  }
}
module.exports = { createEventsEntry }
