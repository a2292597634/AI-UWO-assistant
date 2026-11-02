import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMajorEventReminderPlatform } from '../../miniprogram/runtime/major-event-reminder-platform'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const setup = () => {
  let close: ((value?: { isEnded?: boolean }) => void) | undefined
  let error: ((value?: unknown) => void) | undefined
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
    error: (value?: unknown) => error?.(value),
  }
}
describe('提醒原生平台生命週期', () => {
  it.each(['resolve', 'reject'])('重載事件終止後不再展示且無殘留計時：%s', async (outcome) => {
    const e = setup()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    e.ad.show.mockRejectedValueOnce({ errCode: 1003 })
    e.ad.load.mockImplementationOnce(() => {
      e.error({ errCode: 1007 })
      return outcome === 'resolve' ? Promise.resolve() : Promise.reject({ errCode: 1007 })
    })
    const p = createMajorEventReminderPlatform()
    expect(await p.watchAd('adunit-test').catch((error: unknown) => error)).toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 1007, phase: 'retry-load' }),
      ]),
    })
    expect(e.ad.show).toHaveBeenCalledOnce()
    const next = p.watchAd('adunit-test')
    let completed = false
    void next.then((value) => {
      completed = value
    })
    e.close({ isEnded: true })
    await Promise.resolve()
    try {
      expect(completed).toBe(true)
    } finally {
      p.destroy()
    }
  })
  it('錯誤結算前的完整觀看回調不能誤授權，銷毀則安靜中止', async () => {
    const e = setup()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = createMajorEventReminderPlatform()
    const first = p.watchAd('adunit-test').catch((error: unknown) => error)
    e.error({ errCode: 1007 })
    e.close({ isEnded: true })
    expect(await first).toMatchObject({ diagnostics: [expect.objectContaining({ code: 1007 })] })
    const second = p.watchAd('adunit-test')
    e.error({ errCode: 1007 })
    p.destroy()
    expect(await second).toBe(false)
  })
  it.each([undefined, 1005])('事件碼 %s 不能丟棄同次 Promise 的精確碼', async (eventCode) => {
    const e = setup()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    e.ad.show.mockImplementationOnce(() => {
      e.error({ errCode: eventCode })
      return Promise.reject({ errCode: 1007 })
    })
    const p = createMajorEventReminderPlatform()
    const error = await p.watchAd('adunit-test').catch((value: unknown) => value)
    expect(error).toMatchObject({
      diagnostics: [
        expect.objectContaining({ code: eventCode ?? null, source: 'event' }),
        expect.objectContaining({ code: 1007, source: 'promise' }),
      ],
    })
    expect(e.ad.load).not.toHaveBeenCalled()
    p.destroy()
  })
  it('事件先於 Promise 拒絕時只交付一次診斷，原始碼不丟失', async () => {
    const e = setup()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    e.ad.show.mockImplementationOnce(() => {
      e.error({ errCode: 1007 })
      return Promise.reject({ errCode: 1007 })
    })
    const p = createMajorEventReminderPlatform()
    const error = await p.watchAd('adunit-test').catch((value: unknown) => value)
    expect(error).toMatchObject({
      diagnostics: [expect.objectContaining({ code: 1007, source: 'event' })],
    })
    expect(e.ad.load).not.toHaveBeenCalled()
    p.destroy()
  })
  it('建立和重載同步例外保留精確階段及來源', async () => {
    const e = setup()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    e.createRewardedVideoAd.mockImplementationOnce(() => {
      throw { errCode: 1002 }
    })
    const p = createMajorEventReminderPlatform()
    expect(await p.watchAd('adunit-test').catch((error: unknown) => error)).toMatchObject({
      diagnostics: [expect.objectContaining({ code: 1002, phase: 'create', source: 'throw' })],
    })
    e.ad.show.mockRejectedValueOnce({ errCode: 1003 })
    e.ad.load.mockImplementationOnce(() => {
      throw { errCode: 1004 }
    })
    expect(await p.watchAd('adunit-test').catch((error: unknown) => error)).toMatchObject({
      diagnostics: [
        expect.objectContaining({ code: 1003, phase: 'show' }),
        expect.objectContaining({ code: 1004, phase: 'retry-load', source: 'throw' }),
      ],
    })
    p.destroy()
  })
  it('微信事件的真實錯誤碼與展示階段傳給呼叫者，日誌不含原始錯誤', async () => {
    const e = setup()
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = createMajorEventReminderPlatform()
    const result = p.watchAd('adunit-test').catch((error: unknown) => error)
    e.error({ errCode: 1007, errMsg: 'secret-token', openid: 'private' })
    expect(await result).toMatchObject({
      diagnostics: [expect.objectContaining({ code: 1007, phase: 'show', source: 'event' })],
    })
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret-token|private/)
    expect(log).toHaveBeenCalled()
    p.destroy()
  })

  it('Promise 失敗保留原碼與兩次展示軌跡，仍僅重載一次', async () => {
    const e = setup()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    e.ad.show.mockRejectedValue({ errCode: 1005, errMsg: 'private' })
    const p = createMajorEventReminderPlatform()
    const result = await p.watchAd('adunit-test').catch((error: unknown) => error)
    expect(result).toMatchObject({
      diagnostics: [
        expect.objectContaining({ code: 1005, phase: 'show' }),
        expect.objectContaining({ code: 1005, phase: 'retry-show' }),
      ],
    })
    expect(e.ad.load).toHaveBeenCalledOnce()
    p.destroy()
  })

  it('預載錯誤只記錄預載階段，不污染之後點擊的錯誤碼', async () => {
    const e = setup()
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    e.ad.load.mockRejectedValueOnce({ errCode: 1005 })
    const p = createMajorEventReminderPlatform()
    p.preloadAd?.('adunit-test')
    await vi.waitFor(() => expect(log).toHaveBeenCalled())
    const result = p.watchAd('adunit-test').catch((error: unknown) => error)
    e.error({ errCode: 1004 })
    expect(await result).toMatchObject({
      diagnostics: [expect.objectContaining({ code: 1004, phase: 'show' })],
    })
    expect(log.mock.calls[0]).toEqual([
      'major-reminder-ad-failure',
      expect.objectContaining({ code: 1005, phase: 'preload' }),
    ])
    p.destroy()
  })
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
