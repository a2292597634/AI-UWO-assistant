const { createHmac } = require('node:crypto')
function createRpcEntry({ readContext, environmentId, appId, identitySecret, service }) {
  return async (event) => {
    const current = readContext()
    if (
      !current ||
      !['wx_client', 'wx_devtools'].includes(current.SOURCE) ||
      !current.OPENID ||
      current.APPID !== appId ||
      current.ENV !== environmentId ||
      current.FROM_APPID
    )
      return { ok: false, code: 'forbidden', message: '無法確認本次小程序呼叫來源。' }
    if (
      !event ||
      typeof event.action !== 'string' ||
      Object.keys(event).some((key) => !['action', 'input', 'userInfo', 'tcbContext'].includes(key))
    ) {
      return { ok: false, code: 'input-invalid', message: '輸入資料不正確。' }
    }
    // 平台可附加 userInfo／tcbContext；一律忽略其值，只使用本次平台上下文。
    const actor = {
      openId: current.OPENID,
      appId: current.APPID,
      ownerKey: createHmac('sha256', identitySecret)
        .update(current.APPID + ':' + current.OPENID)
        .digest('hex'),
    }
    const result = await service.invoke(event.action, event.input ?? {}, actor)
    if (
      result.ok &&
      [
        'uploadAvatar',
        'saveProfile',
        'createMessage',
        'retrySafety',
        'saveReply',
        'listMine',
      ].includes(event.action)
    ) {
      try {
        // 業務交易先提交；微信安全接口只處理本次可信身分的有界隊列。
        await service.runDue(actor.ownerKey)
        // 相同 operationId 讀取已提交回執，回傳安全任務更新後的最新版本。
        const refreshed = await service.invoke(event.action, event.input ?? {}, actor)
        if (refreshed.ok) return refreshed
      } catch {
        // 已提交結果保持可確認；未完成任務由租約恢復及本人重試繼續處理。
      }
    }
    return result
  }
}
module.exports = { createRpcEntry }
