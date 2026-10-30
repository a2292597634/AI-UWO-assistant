import { describe, expect, it, vi } from 'vitest'
import type {
  ReminderAction,
  ReminderInputs,
  ReminderOutputs,
  ReminderSubscription,
} from '../../miniprogram/contracts/major-event-reminder'
import {
  createMajorEventReminderController,
  readReminderLocalOperation,
  type ReminderLocalOperation,
} from '../../miniprogram/subpkg-trade/controllers/major-event-reminder-controller'
import { ReminderServiceError } from '../../miniprogram/runtime/major-event-reminder-service'
const occurrence = { zoneId: 'zone_1', eventTypeId: 'pop1', triggerAtUnixSeconds: 20000 }
const templates = ([10800, 3600, 600] as const).map((leadSeconds, i) => ({
  leadSeconds,
  templateId: `template-${i}`,
  title: `標題${i}`,
}))
const key = 'zone_1:pop1:20000'
function setup() {
  let time = 1000,
    serial = 0,
    saved: ReminderLocalOperation | null = null,
    fail: ReminderAction | null = null
  const calls: Array<{ action: ReminderAction; input: unknown }> = []
  const order: string[] = []
  const subs: Record<string, ReminderSubscription> = {}
  let current = key
  const service = {
    async invoke<A extends ReminderAction>(
      action: A,
      input: ReminderInputs[A],
    ): Promise<ReminderOutputs[A]> {
      order.push(action)
      calls.push({ action, input: structuredClone(input) })
      if (action === fail) throw new ReminderServiceError('unconfirmed', '正在確認')
      if (action === 'getBatchConfig')
        return { enabled: true, reason: null, adUnitId: 'adunit', templates } as ReminderOutputs[A]
      if (action === 'list')
        return {
          subscriptions: Object.values(subs).map((s) => structuredClone(s)),
        } as ReminderOutputs[A]
      if (action === 'prepareBatch' || action === 'prepare') {
        const o = (input as ReminderInputs['prepare']).occurrence
        current = [o.zoneId, o.eventTypeId, o.triggerAtUnixSeconds].join(':')
        subs[current] ??= {
          key: current,
          version: 1,
          adCompleted: false,
          slots: templates.map((t) => ({
            leadSeconds: t.leadSeconds,
            dueAtUnixSeconds: o.triggerAtUnixSeconds - t.leadSeconds,
            status: 'unsubscribed',
          })),
        }
      }
      if (action === 'cancel') current = (input as ReminderInputs['cancel']).key
      const s = subs[current]!
      if (action === 'authorizeBatch')
        s.slots.forEach((slot) => {
          if (slot.dueAtUnixSeconds > time) slot.status = 'authorized'
        })
      if (action === 'authorize')
        s.slots.find(
          (slot) => slot.leadSeconds === (input as ReminderInputs['authorize']).leadSeconds,
        )!.status = 'authorized'
      if (action === 'completeAd' || action === 'activate') {
        s.adCompleted = true
        s.slots.forEach((slot) => {
          if (slot.status === 'authorized')
            slot.status = slot.dueAtUnixSeconds > time ? 'pending' : 'missed'
        })
      }
      if (action === 'cancel') {
        s.version++
        s.slots.forEach((slot) => {
          if (slot.status === 'pending') slot.status = 'cancelled'
        })
      }
      return {
        ...(action === 'prepareBatch' || action === 'prepare' ? { sessionId: 'session' } : {}),
        subscription: structuredClone(s),
      } as ReminderOutputs[A]
    },
  }
  const platform = {
    subscribeBatch: vi.fn(async (ids: string[]) => {
      order.push('native')
      return Object.fromEntries(ids.map((id) => [id, 'accept' as const]))
    }),
    subscribe: vi.fn(async () => true),
    watchAd: vi.fn(async () => true),
    destroy: vi.fn(),
  }
  const storage = {
    read: () => saved,
    write: (value: ReminderLocalOperation | null) => {
      saved = value ? structuredClone(value) : null
    },
  }
  const notice = vi.fn(),
    change = vi.fn()
  const create = () =>
    createMajorEventReminderController({
      service,
      platform,
      storage,
      now: () => time,
      requestId: () => `r-${++serial}`,
      onChange: change,
      onNotice: notice,
    })
  return {
    create,
    service,
    platform,
    storage,
    calls,
    order,
    subs,
    notice,
    change,
    setTime: (v: number) => {
      time = v
    },
    fail: (v: ReminderAction | null) => {
      fail = v
    },
  }
}
describe('單開關批次提醒與恢復', () => {
  it('配置尚未完成時也並行取得清單，但未全部完成不能操作', async () => {
    const e = setup()
    const invoke = e.service.invoke.bind(e.service)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    e.service.invoke = async (action, input) => {
      if (action === 'getBatchConfig') await gate
      return invoke(action, input)
    }
    const c = e.create()
    const refresh = c.refresh()
    await Promise.resolve()
    expect(e.calls.some((call) => call.action === 'list')).toBe(true)
    expect(c.state.ready).toBe(false)
    release()
    await refresh
    expect(c.state.ready).toBe(true)
  })

  it.each(['expired', 'data-changed', 'stale-session', 'not-found', 'missed'])(
    '確定%s退役保存原場收據，重開可操作B',
    async (code) => {
      const e = setup()
      e.storage.write({
        version: 1,
        mode: 'batch',
        occurrence,
        prepareRequestId: 'old-p',
        sessionId: 'old-s',
        adFinished: true,
        pending: { action: 'completeAd', input: { sessionId: 'old-s', requestId: 'old-ad' } },
      })
      const invoke = e.service.invoke.bind(e.service)
      e.service.invoke = async (action, input) => {
        if (
          action === 'completeAd' &&
          (input as ReminderInputs['completeAd']).sessionId === 'old-s'
        )
          throw new ReminderServiceError(code, '原流程失效')
        return invoke(action, input)
      }
      const c = e.create()
      await c.refresh()
      expect(c.state.ready).toBe(true)
      expect(c.state.unconfirmed).toBe(false)
      expect(e.storage.read()).toMatchObject({
        adFinished: false,
        pending: null,
        receipts: [{ prepareRequestId: 'old-p', completionRequestId: 'old-ad', reason: code }],
      })
      c.destroy()
      const next = e.create()
      await next.refresh()
      expect(next.state.ready).toBe(true)
      await next.toggle({ ...occurrence, zoneId: 'zone_2' })
      expect(e.platform.watchAd).toHaveBeenCalledOnce()
      expect(e.platform.subscribeBatch).toHaveBeenCalledOnce()
      expect(e.storage.read()).toMatchObject({ receipts: [{ prepareRequestId: 'old-p' }] })
    },
  )
  it('沒有完整廣告的失效操作不宣稱已保留完整廣告', async () => {
    const e = setup()
    e.storage.write({
      version: 1,
      occurrence,
      prepareRequestId: 'p',
      sessionId: 's',
      adFinished: false,
      pending: {
        action: 'authorize',
        input: { sessionId: 's', leadSeconds: 10800, requestId: 'a' },
      },
    })
    const invoke = e.service.invoke.bind(e.service)
    e.service.invoke = async (action, input) => {
      if (action === 'authorize') throw new ReminderServiceError('stale-session', '原流程失效')
      return invoke(action, input)
    }
    const c = e.create()
    await c.refresh()
    expect(c.state.ready).toBe(true)
    expect(c.state.message).not.toContain('已保留原場完整廣告')
    expect(e.storage.read()?.receipts ?? []).toHaveLength(0)
  })
  it('退役儲存失敗保留原pending及adFinished，不丟收據或拋未處理錯誤', async () => {
    const e = setup()
    e.storage.write({
      version: 1,
      occurrence,
      prepareRequestId: 'p',
      sessionId: 's',
      adFinished: true,
      pending: { action: 'completeAd', input: { sessionId: 's', requestId: 'original-ad' } },
    })
    const original = structuredClone(e.storage.read())
    const invoke = e.service.invoke.bind(e.service)
    e.service.invoke = async (action, input) => {
      if (action === 'completeAd') throw new ReminderServiceError('expired', '本場已開始')
      return invoke(action, input)
    }
    e.storage.write = () => {
      throw Error('收據儲存失敗')
    }
    const c = e.create()
    await expect(c.refresh()).resolves.toBeUndefined()
    expect(e.storage.read()).toEqual(original)
    expect(c.state.unconfirmed).toBe(true)
    expect(c.state.ready).toBe(false)
  })
  it('重辦流程再次失效仍保存原始廣告收據，不把重辦請求當新廣告', async () => {
    const e = setup()
    const receipt = {
      occurrence,
      prepareRequestId: 'earned-ad-p',
      sessionId: 'earned-ad-s',
      completionRequestId: 'earned-ad-c',
      reason: 'stale-session',
    }
    e.storage.write({
      version: 1,
      mode: 'batch',
      occurrence,
      prepareRequestId: 'retry-p',
      sessionId: 'retry-s',
      adFinished: true,
      pending: { action: 'completeAd', input: { sessionId: 'retry-s', requestId: 'retry-c' } },
      receipts: [receipt],
    })
    const invoke = e.service.invoke.bind(e.service)
    e.service.invoke = async (action, input) => {
      if (action === 'completeAd') throw new ReminderServiceError('stale-session', '會話已更新')
      return invoke(action, input)
    }
    const c = e.create()
    await c.refresh()
    expect(c.state.ready).toBe(true)
    expect(e.storage.read()?.receipts).toEqual([receipt])
    expect(e.platform.watchAd).not.toHaveBeenCalled()
  })
  it('退役回應晚於destroy時不覆寫B及原場收據', async () => {
    const e = setup()
    e.storage.write({
      version: 1,
      occurrence,
      prepareRequestId: 'a-p',
      sessionId: 'a-s',
      adFinished: true,
      pending: { action: 'completeAd', input: { sessionId: 'a-s', requestId: 'a-c' } },
    })
    let reject!: (reason: unknown) => void
    const invoke = e.service.invoke.bind(e.service)
    e.service.invoke = async (action, input) => {
      if (action === 'completeAd')
        await new Promise((_resolve, r) => {
          reject = r
        })
      return invoke(action, input)
    }
    const c = e.create()
    const pending = c.refresh()
    c.destroy()
    const saved: ReminderLocalOperation = {
      version: 1,
      mode: 'batch',
      occurrence: { ...occurrence, zoneId: 'zone_2' },
      prepareRequestId: 'b-p',
      sessionId: 'b-s',
      adFinished: true,
      pending: { action: 'completeAd', input: { sessionId: 'b-s', requestId: 'b-c' } },
      receipts: [
        {
          occurrence,
          prepareRequestId: 'older-p',
          sessionId: 'older-s',
          completionRequestId: 'older-c',
          reason: 'expired',
        },
      ],
    }
    e.storage.write(saved)
    reject(new ReminderServiceError('expired', '本場已開始'))
    await pending
    expect(e.storage.read()).toEqual(saved)
  })
  it('收據沿用v1 key可解析且有界，拒絕重複或畸形資料', () => {
    const receipt = {
      occurrence,
      prepareRequestId: 'a-p',
      sessionId: 'a-s',
      completionRequestId: 'a-c',
      reason: 'expired',
    }
    const op = {
      version: 1,
      occurrence,
      prepareRequestId: 'b-p',
      sessionId: null,
      adFinished: false,
      pending: null,
      receipts: [receipt],
    }
    expect(readReminderLocalOperation(op)).toEqual(op)
    expect(readReminderLocalOperation({ ...op, receipts: [receipt, receipt] })).toBeNull()
    expect(
      readReminderLocalOperation({
        ...op,
        receipts: Array.from({ length: 21 }, (_, i) => ({
          ...receipt,
          occurrence: { ...occurrence, zoneId: `zone_${i}` },
        })),
      }),
    ).toBeNull()
    expect(
      readReminderLocalOperation({ ...op, receipts: [{ ...receipt, completionRequestId: 3 }] }),
    ).toBeNull()
  })
  it.each(['server-credit', 'receipt', 'cancel', 'new-ad'] as const)(
    '20份有效收據時%s僅擋新增廣告收據，不擋恢復或取消',
    async (kind) => {
      const e = setup()
      const receipts = Array.from({ length: 20 }, (_, i) => ({
        occurrence: { ...occurrence, zoneId: `receipt_${i}` },
        prepareRequestId: `receipt-p-${i}`,
        sessionId: `receipt-s-${i}`,
        completionRequestId: `receipt-c-${i}`,
        reason: 'stale-session',
      }))
      if (kind === 'receipt') receipts[0]!.occurrence = { ...occurrence }
      if (kind === 'server-credit' || kind === 'cancel')
        e.subs[key] = {
          key,
          version: 8,
          adCompleted: kind === 'server-credit',
          slots: templates.map((t) => ({
            leadSeconds: t.leadSeconds,
            dueAtUnixSeconds: 20000 - t.leadSeconds,
            status: kind === 'cancel' ? 'pending' : 'cancelled',
          })),
        }
      e.storage.write({
        version: 1,
        occurrence,
        prepareRequestId: 'none',
        sessionId: null,
        adFinished: false,
        pending: null,
        receipts,
      })
      const c = e.create()
      await c.refresh()
      await c.toggle(occurrence)
      expect(e.platform.watchAd).not.toHaveBeenCalled()
      if (kind === 'new-ad') {
        expect(e.platform.subscribeBatch).not.toHaveBeenCalled()
        expect(e.notice).toHaveBeenLastCalledWith(expect.stringContaining('收據已滿'))
      } else if (kind === 'cancel') {
        expect(e.platform.subscribeBatch).not.toHaveBeenCalled()
        expect(c.isChecked(key)).toBe(false)
        expect(e.calls.some((call) => call.action === 'cancel')).toBe(true)
      } else {
        expect(e.platform.subscribeBatch).toHaveBeenCalledOnce()
        expect(c.isChecked(key)).toBe(true)
        expect(
          e.calls.some((call) => call.action === (kind === 'receipt' ? 'completeAd' : 'activate')),
        ).toBe(true)
      }
    },
  )
  it('收據容量滿但有已開始場次時只淘汰歷史收據，不丟仍有效原場權益', async () => {
    const e = setup()
    const receipts = Array.from({ length: 20 }, (_, i) => ({
      occurrence: {
        ...occurrence,
        zoneId: `receipt_${i}`,
        triggerAtUnixSeconds: i === 0 ? 1 : 20000,
      },
      prepareRequestId: `receipt-p-${i}`,
      sessionId: `receipt-s-${i}`,
      completionRequestId: `receipt-c-${i}`,
      reason: 'stale-session',
    }))
    e.storage.write({
      version: 1,
      occurrence,
      prepareRequestId: 'none',
      sessionId: null,
      adFinished: false,
      pending: null,
      receipts,
    })
    const invoke = e.service.invoke.bind(e.service)
    e.service.invoke = async (action, input) => {
      if (action === 'completeAd') throw new ReminderServiceError('expired', '本場已開始')
      return invoke(action, input)
    }
    const c = e.create()
    await c.refresh()
    await c.toggle(occurrence)
    expect(e.platform.watchAd).toHaveBeenCalledOnce()
    expect(e.storage.read()?.receipts).toHaveLength(20)
    expect(
      e.storage.read()?.receipts?.some((receipt) => receipt.prepareRequestId === 'receipt-p-0'),
    ).toBe(false)
    expect(
      e.storage
        .read()
        ?.receipts?.filter((receipt) => receipt.prepareRequestId.startsWith('receipt-p-')),
    ).toHaveLength(19)
  })
  it.each([
    ['legacy', 'once'],
    ['legacy', 'persistent'],
    ['batch', 'once'],
    ['batch', 'persistent'],
  ] as const)(
    '%s退役寫入%s失敗後同controller恢復保留原completeAd requestId',
    async (mode, pattern) => {
      const e = setup()
      const original: ReminderLocalOperation = {
        version: 1,
        ...(mode === 'batch' ? { mode: 'batch' as const } : {}),
        occurrence,
        prepareRequestId: 'original-p',
        sessionId: 'original-s',
        adFinished: true,
        pending: {
          action: 'completeAd',
          input: { sessionId: 'original-s', requestId: 'original-ad' },
        },
      }
      e.storage.write(original)
      const ids: string[] = []
      const invoke = e.service.invoke.bind(e.service)
      e.service.invoke = async (action, input) => {
        if (action === 'completeAd') {
          ids.push((input as ReminderInputs['completeAd']).requestId)
          throw new ReminderServiceError('stale-session', '原流程已更新')
        }
        return invoke(action, input)
      }
      const write = e.storage.write.bind(e.storage)
      let writes = 0,
        recovered = false
      e.storage.write = (value) => {
        writes++
        if (!recovered && (pattern === 'persistent' || writes === 1))
          throw Error('收據暫時無法儲存')
        write(value)
      }
      const c = e.create()
      await c.refresh()
      expect(writes).toBe(1)
      expect(e.storage.read()).toEqual(original)
      expect(c.state.ready).toBe(false)
      expect(c.state.unconfirmed).toBe(true)
      if (pattern === 'persistent') {
        await c.refresh()
        expect(writes).toBe(2)
        expect(e.storage.read()).toEqual(original)
        expect(ids).toEqual(['original-ad', 'original-ad'])
      }
      recovered = true
      await c.refresh()
      expect(c.state.ready).toBe(true)
      expect(c.state.unconfirmed).toBe(false)
      expect(ids).toEqual(Array(pattern === 'persistent' ? 3 : 2).fill('original-ad'))
      expect(e.storage.read()).toMatchObject({
        adFinished: false,
        pending: null,
        receipts: [
          {
            prepareRequestId: 'original-p',
            sessionId: 'original-s',
            completionRequestId: 'original-ad',
          },
        ],
      })
      expect(e.platform.subscribeBatch).not.toHaveBeenCalled()
      expect(e.platform.watchAd).not.toHaveBeenCalled()
    },
  )
  it('同一點擊同步發起一次原生授權，早於任何服務；確認前不checked', async () => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    e.order.length = 0
    const p = c.toggle(occurrence)
    expect(e.order).toEqual(['native'])
    expect(c.isChecked(key)).toBe(false)
    await p
    expect(e.order).toEqual(['native', 'prepareBatch', 'authorizeBatch', 'completeAd'])
    expect(e.platform.subscribeBatch).toHaveBeenCalledWith(templates.map((t) => t.templateId))
    expect(e.platform.watchAd).toHaveBeenCalledOnce()
    expect(c.isChecked(key)).toBe(true)
    expect(e.notice).toHaveBeenLastCalledWith(expect.stringContaining('3 次'))
  })
  it.each(['reject', 'ban', 'filter', 'error'])('部分%s不準備、不播放廣告', async (status) => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    e.order.length = 0
    e.platform.subscribeBatch.mockResolvedValueOnce(
      Object.fromEntries(
        templates.map((t, i) => [t.templateId, i === 1 ? status : 'accept']),
      ) as never,
    )
    await c.toggle(occurrence)
    expect(e.order).toEqual([])
    expect(e.platform.watchAd).not.toHaveBeenCalled()
    expect(c.isChecked(key)).toBe(false)
  })
  it.each([
    [9300, 2],
    [16500, 1],
    [19400, 0],
  ])('過期時點只要求有效模板 %s', async (time, count) => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    e.setTime(time)
    await c.toggle(occurrence)
    expect(e.platform.subscribeBatch).toHaveBeenCalledTimes(count ? 1 : 0)
    if (count)
      expect(e.platform.subscribeBatch).toHaveBeenCalledWith(
        templates.slice(3 - count).map((t) => t.templateId),
      )
    else expect(e.platform.watchAd).not.toHaveBeenCalled()
  })
  it('拒絕的已過時點可忽略，其餘有效完整接受才開通', async () => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    e.platform.subscribeBatch.mockImplementationOnce(async (ids) => {
      e.setTime(9300)
      return Object.fromEntries(ids.map((id, i) => [id, i === 0 ? 'reject' : 'accept'])) as never
    })
    await c.toggle(occurrence)
    expect(e.platform.watchAd).toHaveBeenCalledOnce()
  })
  it('取消使用點擊場版本，免授權廣告；重開已完成廣告不重看', async () => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    await c.toggle(occurrence)
    await c.toggle(occurrence)
    expect(e.calls.find((x) => x.action === 'cancel')?.input).toMatchObject({
      key,
      expectedVersion: 1,
    })
    expect(c.isChecked(key)).toBe(false)
    await c.toggle(occurrence)
    expect(c.isChecked(key)).toBe(true)
    expect(e.platform.watchAd).toHaveBeenCalledOnce()
    expect(e.calls.some((x) => x.action === 'activate')).toBe(true)
  })
  it('未確認completeAd同requestId恢復且不再原生授權或廣告', async () => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    e.fail('completeAd')
    await c.toggle(occurrence)
    const saved = e.storage.read()!
    expect(saved.adFinished).toBe(true)
    expect(saved.pending?.action).toBe('completeAd')
    c.destroy()
    e.fail(null)
    const next = e.create()
    await next.refresh()
    expect(next.isChecked(key)).toBe(true)
    expect(e.calls.filter((x) => x.action === 'completeAd').map((x) => x.input)).toEqual([
      saved.pending!.input,
      saved.pending!.input,
    ])
    expect(e.platform.subscribeBatch).toHaveBeenCalledOnce()
    expect(e.platform.watchAd).toHaveBeenCalledOnce()
  })
  it('儲存失敗不播放廣告', async () => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    e.storage.write = () => {
      throw Error('儲存失敗')
    }
    await c.toggle(occurrence)
    expect(e.platform.watchAd).not.toHaveBeenCalled()
  })
  it('v1 pending保留原requestId，adFinished恢復無授權廣告', async () => {
    const e = setup()
    e.subs[key] = {
      key,
      version: 1,
      adCompleted: false,
      slots: templates.map((t) => ({
        leadSeconds: t.leadSeconds,
        dueAtUnixSeconds: 20000 - t.leadSeconds,
        status: 'authorized',
      })),
    }
    e.storage.write({
      version: 1,
      occurrence,
      prepareRequestId: 'old-p',
      sessionId: 'session',
      adFinished: true,
      pending: { action: 'completeAd', input: { sessionId: 'session', requestId: 'old-ad' } },
    })
    const c = e.create()
    await c.refresh()
    expect(c.isChecked(key)).toBe(true)
    expect(e.calls.find((x) => x.action === 'completeAd')?.input).toEqual({
      sessionId: 'session',
      requestId: 'old-ad',
    })
    expect(e.platform.watchAd).not.toHaveBeenCalled()
    expect(e.platform.subscribeBatch).not.toHaveBeenCalled()
  })
  it.each(['prepareBatch', 'authorizeBatch'] as const)(
    '未確認%s前景只重放原request，不自動授權或廣告',
    async (action) => {
      const e = setup(),
        c = e.create()
      await c.refresh()
      e.fail(action)
      await c.toggle(occurrence)
      const saved = e.storage.read()!
      expect(saved.pending?.action).toBe(action)
      c.destroy()
      e.fail(null)
      const next = e.create()
      await next.refresh()
      expect(e.calls.filter((x) => x.action === action).map((x) => x.input)).toEqual([
        saved.pending!.input,
        saved.pending!.input,
      ])
      expect(e.platform.subscribeBatch).toHaveBeenCalledOnce()
      expect(e.platform.watchAd).not.toHaveBeenCalled()
    },
  )
  it('跨場取消取該場版本，不借前場session；sending／unknown保留checked及Toast', async () => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    await c.toggle(occurrence)
    const other = { ...occurrence, zoneId: 'zone_2' }
    const otherKey = 'zone_2:pop1:20000'
    e.subs[otherKey] = { ...structuredClone(e.subs[key]!), key: otherKey, version: 9 }
    e.subs[otherKey]!.slots[0]!.status = 'sending'
    e.subs[otherKey]!.slots[1]!.status = 'unknown'
    await c.refresh()
    await c.toggle(other)
    expect([...e.calls].reverse().find((x) => x.action === 'cancel')?.input).toMatchObject({
      key: otherKey,
      expectedVersion: 9,
    })
    expect(c.isChecked(otherKey)).toBe(true)
    expect(e.notice).toHaveBeenLastCalledWith(expect.stringContaining('可能仍會收到'))
    expect(e.platform.watchAd).toHaveBeenCalledOnce()
  })
  it('忙碌切場及前景不改操作快照，不提前再次授權', async () => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    let finish!: (v: boolean) => void
    e.platform.watchAd.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r
        }),
    )
    const p = c.toggle(occurrence)
    while (!finish) await Promise.resolve()
    const count = e.calls.length
    await c.toggle({ ...occurrence, zoneId: 'zone_2' })
    await c.refresh()
    expect(c.state.occurrence).toEqual(occurrence)
    expect(e.calls).toHaveLength(count)
    expect(e.platform.subscribeBatch).toHaveBeenCalledOnce()
    finish(true)
    await p
  })
  it('讀取action不能成為pending', () => {
    expect(
      readReminderLocalOperation({
        version: 1,
        occurrence,
        prepareRequestId: 'r',
        sessionId: null,
        adFinished: false,
        pending: { action: 'getBatchConfig', input: { requestId: 'r' } },
      }),
    ).toBeNull()
  })
  it('廣告取消不開通；destroy遲到完成不覆蓋另一操作', async () => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    e.platform.watchAd.mockResolvedValueOnce(false)
    await c.toggle(occurrence)
    expect(c.isChecked(key)).toBe(false)
    let finish!: (v: boolean) => void
    e.platform.watchAd.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r
        }),
    )
    const p = c.toggle(occurrence)
    while (!finish) await Promise.resolve()
    c.destroy()
    const saved: ReminderLocalOperation = {
      version: 1,
      mode: 'batch',
      occurrence: { ...occurrence, zoneId: 'zone_2' },
      prepareRequestId: 'new-operation',
      sessionId: 'b-session',
      adFinished: true,
      pending: { action: 'completeAd', input: { sessionId: 'b-session', requestId: 'b-complete' } },
    }
    e.storage.write(saved)
    finish(true)
    await p
    expect(e.storage.read()).toEqual(saved)
  })
  it('destroy後完整廣告只補存同一操作adFinished，恢復不重看', async () => {
    const e = setup(),
      c = e.create()
    await c.refresh()
    let finish!: (v: boolean) => void
    e.platform.watchAd.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r
        }),
    )
    const pending = c.toggle(occurrence)
    while (!finish) await Promise.resolve()
    c.destroy()
    const changes = e.change.mock.calls.length
    finish(true)
    await pending
    expect(e.storage.read()?.adFinished).toBe(true)
    expect(e.change).toHaveBeenCalledTimes(changes)
    const next = e.create()
    await next.refresh()
    expect(next.isChecked(key)).toBe(true)
    expect(e.platform.watchAd).toHaveBeenCalledOnce()
  })
  it.each(['success', 'failure', 'unconfirmed'])(
    'destroy遲到%s服務不能覆寫新storage',
    async (outcome) => {
      const e = setup(),
        c = e.create()
      await c.refresh()
      const invoke = e.service.invoke.bind(e.service)
      let finish!: () => void
      const wait = new Promise<void>((r) => {
        finish = r
      })
      e.service.invoke = async (action, input) => {
        const result = await invoke(action, input)
        if (action === 'authorizeBatch') {
          await wait
          if (outcome !== 'success')
            throw new ReminderServiceError(
              outcome === 'failure' ? 'expired' : 'unconfirmed',
              '遲到',
            )
        }
        return result
      }
      const p = c.toggle(occurrence)
      while (e.storage.read()?.pending?.action !== 'authorizeBatch') await Promise.resolve()
      c.destroy()
      const saved: ReminderLocalOperation = {
        version: 1,
        mode: 'batch',
        occurrence: { ...occurrence, zoneId: 'zone_2' },
        prepareRequestId: 'new-operation',
        sessionId: 'b-session',
        adFinished: true,
        pending: {
          action: 'completeAd',
          input: { sessionId: 'b-session', requestId: 'b-complete' },
        },
      }
      e.storage.write(saved)
      finish()
      await p
      expect(e.storage.read()).toEqual(saved)
    },
  )
})
