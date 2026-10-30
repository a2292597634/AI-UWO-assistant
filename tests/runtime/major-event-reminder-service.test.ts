import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMajorEventReminderService } from '../../miniprogram/runtime/major-event-reminder-service'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('大流行提醒傳輸邊界', () => {
  it('固定函數與扁平資料，缺配置仍作為正常資料返回', async () => {
    const config = {
      enabled: false,
      reason: '尚未配置模板',
      templateId: '',
      adUnitId: 'adunit-test',
    }
    const callFunction = vi.fn(async () => ({ result: { ok: true, data: config } }))
    vi.stubGlobal('wx', { cloud: { callFunction } })
    expect(await createMajorEventReminderService().invoke('getConfig', {})).toEqual(config)
    expect(callFunction).toHaveBeenCalledWith({
      name: 'major-event-reminder',
      data: { action: 'getConfig' },
    })
  })
  it('批次配置嚴格鍵、順序及唯一ID／標題，停用只能空模板', async () => {
    const config = {
      enabled: true,
      reason: null,
      adUnitId: 'ad',
      templates: [10800, 3600, 600].map((leadSeconds, i) => ({
        leadSeconds,
        templateId: `t${i}`,
        title: `標題${i}`,
      })),
    }
    const invoke = async (data: unknown) => {
      vi.stubGlobal('wx', { cloud: { callFunction: async () => ({ result: { ok: true, data } }) } })
      return createMajorEventReminderService().invoke('getBatchConfig', {})
    }
    expect(await invoke(config)).toEqual(config)
    for (const invalid of [
      { ...config, extra: 1 },
      { ...config, templates: [...config.templates].reverse() },
      { ...config, templates: config.templates.map((t) => ({ ...t, templateId: 'same' })) },
      { ...config, templates: config.templates.map((t) => ({ ...t, title: 'same' })) },
      { ...config, enabled: false },
    ])
      await expect(invoke(invalid)).rejects.toMatchObject({ code: 'unconfirmed' })
    expect(await invoke({ ...config, enabled: false, templates: [] })).toMatchObject({
      enabled: false,
    })
  })
  it('prepareBatch嚴格包含sessionId；authorizeBatch仍只允許subscription', async () => {
    const sub = {
      key: 'z:p:20000',
      version: 1,
      adCompleted: false,
      slots: [10800, 3600, 600].map((leadSeconds) => ({
        leadSeconds,
        dueAtUnixSeconds: 20000 - leadSeconds,
        status: 'authorized',
      })),
    }
    const invoke = async (action: 'prepareBatch' | 'authorizeBatch', data: unknown) => {
      vi.stubGlobal('wx', { cloud: { callFunction: async () => ({ result: { ok: true, data } }) } })
      return createMajorEventReminderService().invoke(action, {} as never)
    }
    expect(await invoke('prepareBatch', { sessionId: 's', subscription: sub })).toMatchObject({
      sessionId: 's',
    })
    await expect(invoke('prepareBatch', { subscription: sub })).rejects.toMatchObject({
      code: 'unconfirmed',
    })
    await expect(
      invoke('authorizeBatch', { sessionId: 's', subscription: sub }),
    ).rejects.toMatchObject({ code: 'unconfirmed' })
    expect(await invoke('authorizeBatch', { subscription: sub })).toEqual({ subscription: sub })
  })
  it('逾時屬未確認且有界，不把傳輸失敗當成功', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('wx', { cloud: { callFunction: () => new Promise(() => {}) } })
    const pending = createMajorEventReminderService(100).invoke('completeAd', {
      sessionId: 's',
      requestId: 'r',
    })
    const assertion = expect(pending).rejects.toMatchObject({ code: 'unconfirmed' })
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each([
    { subscriptions: [{ key: 'z:p:1', version: 1, adCompleted: true, slots: [] }] },
    {
      subscriptions: [
        {
          key: 'z:p:1',
          version: 1,
          adCompleted: true,
          slots: [{ leadSeconds: 123, dueAtUnixSeconds: 1, status: 'pending' }],
        },
      ],
    },
    { subscriptions: [], extra: '隱藏欄位' },
  ])('拒絕不完整或越界的清單回應 %j', async (data) => {
    vi.stubGlobal('wx', { cloud: { callFunction: async () => ({ result: { ok: true, data } }) } })
    await expect(createMajorEventReminderService().invoke('list', {})).rejects.toMatchObject({
      code: 'unconfirmed',
    })
  })
  it('保留服務端明確失敗，不靜默吞掉 disabled', async () => {
    vi.stubGlobal('wx', {
      cloud: {
        callFunction: async () => ({
          result: { ok: false, code: 'disabled', message: '尚未配置模板' },
        }),
      },
    })
    await expect(
      createMajorEventReminderService().invoke('prepare', {
        occurrence: { zoneId: 'z', eventTypeId: 'p', triggerAtUnixSeconds: 1 },
        requestId: 'r',
      }),
    ).rejects.toMatchObject({ code: 'disabled', message: '尚未配置模板' })
  })
})
