import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMajorEventReminderPlatform } from '../../miniprogram/runtime/major-event-reminder-platform'

afterEach(() => vi.unstubAllGlobals())
const setup = () => {
  let close: ((value?: { isEnded?: boolean }) => void) | undefined
  let error: (() => void) | undefined
  const ad = {
    show: vi.fn(async () => {}),
    load: vi.fn(async () => {}),
    destroy: vi.fn(),
    onClose: vi.fn((fn) => {
      close = fn
    }),
    offClose: vi.fn(),
    onError: vi.fn((fn) => {
      error = fn
    }),
    offError: vi.fn(),
  }
  const createRewardedVideoAd = vi.fn(() => ad)
  vi.stubGlobal('wx', {
    createRewardedVideoAd,
    requestSubscribeMessage: vi.fn(({ tmplIds, success }) => success({ [tmplIds[0]]: 'accept' })),
  })
  return {
    ad,
    createRewardedVideoAd,
    close: (value?: { isEnded?: boolean }) => close?.(value),
    error: () => error?.(),
  }
}
describe('提醒原生平台生命週期', () => {
  it('預載只建立並載入廣告，不展示；點擊重用，銷毀後不再預載', async () => {
    const e = setup()
    const p = createMajorEventReminderPlatform()
    p.preloadAd?.('ad')
    await Promise.resolve()
    expect(e.ad.load).toHaveBeenCalledOnce()
    expect(e.ad.show).not.toHaveBeenCalled()
    const watch = p.watchAd('ad')
    expect(e.createRewardedVideoAd).toHaveBeenCalledOnce()
    e.close({ isEnded: true })
    expect(await watch).toBe(true)
    p.destroy()
    p.preloadAd?.('ad')
    expect(e.ad.load).toHaveBeenCalledOnce()
  })

  it('預載在途錯誤不結束點擊操作，失敗後仍展示並可重試', async () => {
    const e = setup()
    let reject!: (error: Error) => void
    e.ad.load.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail
        }),
    )
    const p = createMajorEventReminderPlatform()
    p.preloadAd?.('ad')
    p.preloadAd?.('ad')
    const watch = p.watchAd('ad')
    e.error()
    reject(new Error('預載失敗'))
    await vi.waitFor(() => expect(e.ad.show).toHaveBeenCalledOnce())
    e.close({ isEnded: true })
    expect(await watch).toBe(true)
    expect(e.createRewardedVideoAd).toHaveBeenCalledOnce()
    p.destroy()
  })
  it('預載在途銷毀後不展示，結束等待並只銷毀一次', async () => {
    const e = setup()
    let release!: () => void
    e.ad.load.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const p = createMajorEventReminderPlatform()
    p.preloadAd?.('ad')
    const watch = p.watchAd('ad')
    p.destroy()
    release()
    await Promise.resolve()
    expect(await watch).toBe(false)
    expect(e.ad.show).not.toHaveBeenCalled()
    expect(e.ad.destroy).toHaveBeenCalledOnce()
  })
  it('批次同步一次原生呼叫，逐ID保留accept／reject／ban／filter；未知及fail視error', async () => {
    setup()
    const native = vi.fn(({ success }) => success({ a: 'accept', b: 'reject', c: 'ban' }))
    vi.stubGlobal('wx', { requestSubscribeMessage: native })
    const platform = createMajorEventReminderPlatform()
    const pending = platform.subscribeBatch(['a', 'b', 'c'])
    expect(native).toHaveBeenCalledOnce()
    expect(native.mock.calls[0]![0]).toMatchObject({ tmplIds: ['a', 'b', 'c'] })
    expect(await pending).toEqual({ a: 'accept', b: 'reject', c: 'ban' })
    native.mockImplementation(({ success }) => success({ a: 'filter', b: 'unexpected' }))
    expect(await platform.subscribeBatch(['a', 'b', 'c'])).toEqual({
      a: 'filter',
      b: 'error',
      c: 'error',
    })
    vi.stubGlobal('wx', { requestSubscribeMessage: ({ fail }: { fail(): void }) => fail() })
    expect(await platform.subscribeBatch(['a'])).toEqual({ a: 'error' })
    platform.destroy()
    expect(await platform.subscribeBatch(['a'])).toEqual({ a: 'error' })
  })
  it('批次重複ID或超過三個不呼叫原生，廣告同時只容許一個', async () => {
    const e = setup(),
      p = createMajorEventReminderPlatform()
    await p.subscribeBatch(['a', 'a'])
    await p.subscribeBatch(['a', 'b', 'c', 'd'])
    expect(wx.requestSubscribeMessage).not.toHaveBeenCalled()
    const first = p.watchAd('ad')
    await expect(p.watchAd('ad')).rejects.toThrow('廣告')
    e.close({ isEnded: true })
    expect(await first).toBe(true)
  })
  it.each([undefined, {}, { isEnded: false }, { isEnded: true }])(
    '完整觀看必須嚴格 true：%j',
    async (value) => {
      const env = setup()
      const platform = createMajorEventReminderPlatform()
      const result = platform.watchAd('adunit-test')
      env.close(value)
      expect(await result).toBe(value?.isEnded === true)
      platform.destroy()
      expect(env.ad.offClose).toHaveBeenCalledOnce()
      expect(env.ad.offError).toHaveBeenCalledOnce()
    },
  )
  it('一次展示失敗最多 load 一次，第二次失敗結束並清理', async () => {
    const env = setup()
    env.ad.show.mockRejectedValue(new Error('無廣告'))
    const platform = createMajorEventReminderPlatform()
    await expect(platform.watchAd('adunit-test')).rejects.toThrow('廣告')
    expect(env.ad.show).toHaveBeenCalledTimes(2)
    expect(env.ad.load).toHaveBeenCalledOnce()
    platform.destroy()
  })
  it('同頁單例、銷毀中斷等待、授權同步發起且拒絕不算 accept', async () => {
    const env = setup()
    const platform = createMajorEventReminderPlatform()
    expect(await platform.subscribe('template')).toBe(true)
    const first = platform.watchAd('adunit-test')
    env.close({ isEnded: true })
    await first
    const second = platform.watchAd('adunit-test')
    platform.destroy()
    expect(await second).toBe(false)
    expect(env.createRewardedVideoAd).toHaveBeenCalledOnce()
  })
  it('同步展示例外也只重試一次，失敗後能再次嘗試', async () => {
    const env = setup()
    env.ad.show.mockImplementation(() => {
      throw new Error('同步錯誤')
    })
    const platform = createMajorEventReminderPlatform()
    await expect(platform.watchAd('adunit-test')).rejects.toThrow()
    expect(env.ad.load).toHaveBeenCalledOnce()
    env.ad.show.mockImplementation(async () => {})
    const pending = platform.watchAd('adunit-test')
    env.close({ isEnded: true })
    expect(await pending).toBe(true)
    platform.destroy()
  })
  it('拒絕與原生 fail 均不算 accept，不把記住偏好當授權次數', async () => {
    setup()
    vi.stubGlobal('wx', {
      requestSubscribeMessage: ({ success }: { success(value: Record<string, string>): void }) =>
        success({ template: 'reject' }),
    })
    const platform = createMajorEventReminderPlatform()
    expect(await platform.subscribe('template')).toBe(false)
    vi.stubGlobal('wx', { requestSubscribeMessage: ({ fail }: { fail(): void }) => fail() })
    expect(await platform.subscribe('template')).toBe(false)
  })
})
