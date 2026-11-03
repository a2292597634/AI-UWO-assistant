import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCloudConnection } from '../../miniprogram/runtime/shared-cloud-client'

afterEach(() => vi.unstubAllGlobals())

const setup = (initialize: () => Promise<void> = async () => {}) => {
  const calls: unknown[] = []
  const nativeCalls: unknown[] = []
  const init = vi.fn(initialize)
  const construct = vi.fn()
  class Cloud {
    constructor(config: unknown) {
      construct(config)
    }
    init = init
    async callFunction(input: unknown) {
      calls.push(input)
      return { result: { ok: true, data: '共享結果' } }
    }
    async uploadFile(input: unknown) {
      calls.push(input)
      return { fileID: '共享檔案' }
    }
  }
  vi.stubGlobal('wx', {
    cloud: {
      Cloud,
      init: vi.fn(),
      async callFunction(input: unknown) {
        nativeCalls.push(input)
        return { result: { ok: true, data: '原生結果' } }
      },
      async uploadFile(input: unknown) {
        nativeCalls.push(input)
        return { fileID: '原生檔案' }
      },
    },
  })
  return { calls, nativeCalls, init, construct }
}

describe('新小程序共享連線', () => {
  it('等初始化完成後才發起並發業務請求，且僅初始化一次', async () => {
    let release!: () => void
    const f = setup(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const connection = createCloudConnection('wxd0bc7afdc9cd334a')
    const first = connection.callFunction({ name: 'fleet-config', data: { action: 'list' } })
    const second = connection.callFunction({
      name: 'major-event-reminder',
      data: { action: 'getConfig' },
    })
    await Promise.resolve()
    expect(f.calls).toEqual([])
    expect(f.init).toHaveBeenCalledTimes(1)
    release()
    expect(await first).toEqual({ result: { ok: true, data: '共享結果' } })
    await second
    expect(f.construct).toHaveBeenCalledExactlyOnceWith({
      resourceAppid: 'wx8f961bcd8b26996a',
      resourceEnv: 'cloud1-d7gxfuxfe813b4eaa',
    })
    expect(f.calls).toEqual([
      { name: 'fleet-config', data: { action: 'list' } },
      { name: 'major-event-reminder', data: { action: 'getConfig' } },
    ])
    expect(f.nativeCalls).toEqual([])
  })

  it('共享初始化失敗時不呼叫業務、不回退舊連線、不自動重試', async () => {
    const f = setup(async () => {
      throw new Error('共享未授權')
    })
    const connection = createCloudConnection('wxd0bc7afdc9cd334a')
    await expect(connection.callFunction({ name: 'fleet-config' })).rejects.toThrow('共享未授權')
    await expect(connection.callFunction({ name: 'fleet-config' })).rejects.toThrow('共享未授權')
    expect(f.init).toHaveBeenCalledTimes(1)
    expect(f.calls).toEqual([])
    expect(f.nativeCalls).toEqual([])
  })

  it('舊 AppID 使用原生呼叫，不建立共享實例', async () => {
    const f = setup()
    const connection = createCloudConnection('wx8f961bcd8b26996a')
    expect(await connection.callFunction({ name: 'fleet-config' })).toEqual({
      result: { ok: true, data: '原生結果' },
    })
    expect(f.construct).not.toHaveBeenCalled()
    expect(f.nativeCalls).toEqual([{ name: 'fleet-config', data: undefined }])
  })

  it('舊 AppID 啟動時同步初始化，初始化失敗後不發出業務', async () => {
    const f = setup()
    const order: string[] = []
    const connection = createCloudConnection('wx8f961bcd8b26996a')
    vi.mocked(wx.cloud.init).mockImplementation(() => {
      order.push('init')
      throw new Error('初始化失敗')
    })
    const starting = connection.init()
    void starting.catch(() => {})
    expect(order).toEqual(['init'])
    await expect(starting).rejects.toThrow('初始化失敗')
    await expect(connection.callFunction({ name: 'fleet-config' })).rejects.toThrow('初始化失敗')
    await expect(
      connection.uploadFile({
        cloudPath: 'officer-error-reports/1793600000000-0.png',
        filePath: '/tmp/a.png',
      }),
    ).rejects.toThrow('初始化失敗')
    expect(f.nativeCalls).toEqual([])
  })

  it('未知 AppID 不會取得任何連線', () => {
    const f = setup()
    expect(() => createCloudConnection('wx-unknown')).toThrow()
    expect(f.construct).not.toHaveBeenCalled()
    expect(f.nativeCalls).toEqual([])
  })

  it('拒絕未登記函數與非回報截圖路徑，保留允許的上傳結果', async () => {
    const f = setup()
    const connection = createCloudConnection('wxd0bc7afdc9cd334a')
    await expect(connection.callFunction({ name: 'major-event-reminder-worker' })).rejects.toThrow()
    await expect(
      connection.uploadFile({ cloudPath: 'public/admin.png', filePath: '/tmp/a.png' }),
    ).rejects.toThrow()
    expect(f.calls).toEqual([])
    expect(
      await connection.uploadFile({
        cloudPath: 'officer-error-reports/1793600000000-0.png',
        filePath: '/tmp/a.png',
      }),
    ).toEqual({ fileID: '共享檔案' })
    expect(f.calls).toEqual([
      { cloudPath: 'officer-error-reports/1793600000000-0.png', filePath: '/tmp/a.png' },
    ])
  })
})
