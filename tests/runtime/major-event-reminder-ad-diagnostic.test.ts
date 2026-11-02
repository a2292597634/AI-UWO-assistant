import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createReminderAdDiagnostic,
  ReminderAdError,
  showReminderAdDiagnostic,
} from '../../miniprogram/runtime/major-event-reminder-ad-diagnostic'

afterEach(() => vi.unstubAllGlobals())

describe('激勵廣告安全診斷', () => {
  it('只收集碼與白名單環境，不收集原始錯誤及身份；可複製完整診斷', () => {
    const clipboard = vi.fn()
    const modal = vi.fn(({ success }) => success({ confirm: true }))
    vi.stubGlobal('wx', {
      getAccountInfoSync: () => ({
        miniProgram: { appId: 'secret-id', envVersion: 'release', version: '1.2.3' },
      }),
      getAppBaseInfo: () => ({ version: '8.0.64', SDKVersion: '3.17.0', token: 'secret-token' }),
      getDeviceInfo: () => ({ platform: 'ios', model: 'private-model' }),
      showModal: modal,
      setClipboardData: clipboard,
    })
    const d = createReminderAdDiagnostic('adunit-accfb914625e0bc7', 'show', 'event', {
      errCode: 1007,
      errMsg: 'secret-token',
      openid: 'secret-owner',
    })
    expect(d).toMatchObject({
      code: 1007,
      phase: 'show',
      source: 'event',
      envVersion: 'release',
      version: '1.2.3',
      SDKVersion: '3.17.0',
      platform: 'ios',
    })
    showReminderAdDiagnostic(new ReminderAdError([d]))
    const content = modal.mock.calls[0]![0].content
    expect(content).toContain('封禁')
    expect(content).toContain('1007')
    expect(content).toContain('release')
    expect(content).toContain('adunit-accfb914625e0bc7')
    expect(clipboard).toHaveBeenCalledWith(expect.objectContaining({ data: content }))
    expect(JSON.stringify(d) + content).not.toMatch(/secret|private-model|openid|appId/)
  })

  it('無碼不推測封禁，環境查詢失敗不掩蓋原失敗；取消不複製', () => {
    const clipboard = vi.fn()
    vi.stubGlobal('wx', {
      getAccountInfoSync: () => {
        throw new Error('環境不可讀')
      },
      showModal: vi.fn(({ success }) => success({ confirm: false })),
      setClipboardData: clipboard,
    })
    const d = createReminderAdDiagnostic('bad\nsecret', 'create', 'throw', { errCode: 'secret' })
    expect(d).toMatchObject({
      code: null,
      envVersion: 'unknown',
      version: 'unknown',
      adUnitId: 'unknown',
    })
    const error = new ReminderAdError([d])
    expect(error.message).not.toContain('封禁')
    showReminderAdDiagnostic(error)
    expect(clipboard).not.toHaveBeenCalled()
  })

  it('保留有碼的第一次失敗與最後無碼失敗的路徑，不丟失平台原因', () => {
    vi.stubGlobal('wx', {})
    const a = createReminderAdDiagnostic('adunit-test', 'show', 'promise', { errCode: 1005 })
    const b = createReminderAdDiagnostic(
      'adunit-test',
      'retry-load',
      'promise',
      new Error('private'),
    )
    const error = new ReminderAdError([a, b])
    expect(error.message).toContain('1005')
    expect(error.diagnostics.map((d) => [d.phase, d.code])).toEqual([
      ['show', 1005],
      ['retry-load', null],
    ])
  })
})
