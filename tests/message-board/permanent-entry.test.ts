import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { createRpcEntry } = require('../../cloudfunctions/message-board/entry.js')
const { createEventsEntry } = require('../../cloudfunctions/message-board-events/entry.js')
describe('永久入口的當次可信來源', () => {
  it('安全任務修改版本後返回去重回執的最新版本，避免使用過期 revision', async () => {
    let revision = 1
    const invoke = createRpcEntry({
      readContext: () => ({
        SOURCE: 'wx_client',
        OPENID: 'user-a',
        APPID: 'test-app',
        ENV: 'test-env',
      }),
      environmentId: 'test-env',
      appId: 'test-app',
      identitySecret: 's'.repeat(64),
      service: {
        async invoke() {
          return { ok: true, data: { revision } }
        },
        async runDue() {
          revision++
        },
      },
    })
    expect((await invoke({ action: 'createMessage', input: {} })).data.revision).toBe(2)
  })
  it('成功提交後以平台身分處理本人隊列，失敗請求不啟動安全接口', async () => {
    const owners: string[] = []
    let ok = true
    const invoke = createRpcEntry({
      readContext: () => ({
        SOURCE: 'wx_client',
        OPENID: 'user-a',
        APPID: 'test-app',
        ENV: 'test-env',
      }),
      environmentId: 'test-env',
      appId: 'test-app',
      identitySecret: 's'.repeat(64),
      service: {
        async invoke() {
          return { ok }
        },
        async runDue(owner: string) {
          owners.push(owner)
        },
      },
    })
    await invoke({ action: 'createMessage', input: {} })
    expect(owners).toHaveLength(1)
    expect(owners[0]).toMatch(/^[a-f0-9]{64}$/)
    ok = false
    await invoke({ action: 'createMessage', input: {} })
    expect(owners).toHaveLength(1)
  })
  it('定時觸發器缺少 TCB_ENV 時使用平台 SCF_NAMESPACE，仍拒絕環境不符', async () => {
    let runtime: { TCB_ENV?: string; SCF_NAMESPACE: string } = { SCF_NAMESPACE: 'test-env' }
    const invoke = createEventsEntry({
      readContext: () => ({}),
      runtimeEnvironment: () => runtime,
      environmentId: 'test-env',
      callbackPath: '/board',
      callback: {},
      service: {
        async runDue() {
          return { completed: 1 }
        },
      },
    })
    const timer = { Type: 'Timer', TriggerName: 'message-board-worker' }
    expect((await invoke(timer)).ok).toBe(true)
    runtime = { TCB_ENV: 'wrong-env', SCF_NAMESPACE: 'test-env' }
    expect((await invoke(timer)).statusCode).toBe(403)
    runtime = { SCF_NAMESPACE: 'wrong-env' }
    expect((await invoke(timer)).statusCode).toBe(403)
  })
  it('實例重用時重新讀取微信身分，不相信 payload 角色或 OpenID', async () => {
    let current = { SOURCE: 'wx_client', OPENID: 'user-a', APPID: 'test-app', ENV: 'test-env' }
    const calls: Record<string, unknown>[] = []
    const invoke = createRpcEntry({
      readContext: () => current,
      environmentId: 'test-env',
      appId: 'test-app',
      identitySecret: 's'.repeat(64),
      service: {
        async invoke(action: string, input: unknown, actor: Record<string, unknown>) {
          calls.push(actor)
          return { ok: true, data: { action, input } }
        },
      },
    })
    expect(
      (
        await invoke({
          action: 'getViewer',
          input: {},
          userInfo: { openid: 'admin', appid: 'fake' },
          tcbContext: { OPENID: 'admin', SOURCE: 'timer' },
        })
      ).ok,
    ).toBe(true)
    current = { ...current, OPENID: 'user-b' }
    await invoke({ action: 'getViewer', input: {} })
    expect(calls[0].openId).toBe('user-a')
    expect(calls[1].openId).toBe('user-b')
    current = { ...current, SOURCE: 'wx_http', OPENID: '' }
    expect((await invoke({ action: 'getViewer', input: {} })).ok).toBe(false)
    current = { ...current, SOURCE: 'wx_client', OPENID: 'user-a', APPID: 'wrong' }
    expect((await invoke({ action: 'getViewer', input: {} })).ok).toBe(false)
    current = { ...current, APPID: 'test-app' }
    expect(
      (await invoke({ action: 'getViewer', input: {}, openId: 'admin', isAdmin: true })).ok,
    ).toBe(false)
    expect(calls).toHaveLength(2)
  })
  it('普通小程序不能以假 timer／HTTP 事件呼叫後台工作入口', async () => {
    let current = { SOURCE: 'wx_client', OPENID: 'user-a' }
    let calls = 0
    const invoke = createEventsEntry({
      readContext: () => current,
      runtimeEnvironment: () => ({ TCB_ENV: 'test-env', SCF_NAMESPACE: 'test-env' }),
      environmentId: 'test-env',
      callbackPath: '/board',
      callback: { token: 'test-token' },
      service: {
        async runDue() {
          calls++
          return { completed: 0 }
        },
      },
    })
    expect((await invoke({ Type: 'Timer', TriggerName: 'message-board-worker' })).statusCode).toBe(
      403,
    )
    expect(
      (await invoke({ httpMethod: 'GET', path: '/board', queryStringParameters: {} })).statusCode,
    ).toBe(403)
    expect(calls).toBe(0)
    current = { SOURCE: '', OPENID: '' }
    expect((await invoke({ Type: 'Timer', TriggerName: 'message-board-worker' })).ok).toBe(true)
    expect(calls).toBe(1)
  })
})
