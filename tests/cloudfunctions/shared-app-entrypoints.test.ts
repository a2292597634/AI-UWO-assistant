import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const current = {
  SOURCE: 'wx_devtools',
  APPID: 'wx8f961bcd8b26996a',
  ENV: 'cloud1-d7gxfuxfe813b4eaa',
  FROM_APPID: 'wxd0bc7afdc9cd334a',
  FROM_OPENID: 'new-user',
}
describe('新 AppID 未配置平台能力時安全停用', () => {
  it('留言板只開放獨立身份的讀取，不承接舊管理員角色或未配置的內容寫入', async () => {
    const actors: unknown[] = []
    const invoke = require('../../cloudfunctions/message-board/entry.js').createRpcEntry({
      readContext: () => current,
      environmentId: current.ENV,
      appId: current.APPID,
      identitySecret: 's'.repeat(64),
      service: {
        async invoke(_action: string, _input: unknown, actor: unknown) {
          actors.push(actor)
          return { ok: true, data: { isAdmin: true, write: true, review: true } }
        },
      },
    })
    expect(await invoke({ action: 'getViewer', input: {} })).toMatchObject({
      ok: true,
      data: { isAdmin: false, write: false, review: false },
    })
    expect(actors[0]).toMatchObject({ appId: 'wxd0bc7afdc9cd334a', openId: 'new-user' })
    expect(await invoke({ action: 'revalidatePublic', input: { items: [] } })).toMatchObject({
      ok: true,
    })
    expect(await invoke({ action: 'createMessage', input: {} })).toMatchObject({
      ok: false,
      code: 'feature-disabled',
    })
    expect(actors).toHaveLength(2)
  })
  it('新 AppID 不使用舊模板或廣告位，也不建立待發提醒', async () => {
    const handle = require('../../cloudfunctions/major-event-reminder/handler.js').createHandler({
      database: () => ({}),
      getWXContext: () => current,
    })
    expect(await handle({ action: 'getBatchConfig' })).toEqual({
      ok: true,
      data: { enabled: false, reason: '新小程序提醒服務尚未完成設定', templates: [], adUnitId: '' },
    })
    expect(await handle({ action: 'getConfig' })).toMatchObject({
      ok: true,
      data: { enabled: false, templateId: '', adUnitId: '' },
    })
    expect(await handle({ action: 'prepareBatch' })).toMatchObject({ ok: false, code: 'disabled' })
  })
})
