import { afterEach, describe, expect, it, vi } from 'vitest'
import { configured, event, load, memoryRepository, reference, require } from './helpers'

const { configFromEnvironment, resolveOwnerProfile } = load('config')
const { createHandler } = load('handler')
const { createService } = load('service')
const { createWorker } = require('../../cloudfunctions/major-event-reminder-worker/worker.js')
const OLD = 'wx8f961bcd8b26996a'
const NEW = 'wxd0bc7afdc9cd334a'
const newOwner = NEW + ':new-user'
const templates = (letters: string[]) =>
  [10800, 3600, 600].map((leadSeconds, i) => ({
    leadSeconds,
    templateId: letters[i]!.repeat(43),
    title: ['三小時通知', '一小時通知', '十分鐘通知'][i],
    fields: configured.fields,
  }))
const oldTemplates = templates(['A', 'B', 'C'])
const newTemplates = templates(['N', 'P', 'Q'])
const environment = {
  MAJOR_REMINDER_TEMPLATE_ID: configured.templateId,
  MAJOR_REMINDER_TEMPLATE_FIELDS: JSON.stringify(configured.fields),
  MAJOR_REMINDER_BATCH_TEMPLATES: JSON.stringify(oldTemplates),
  MAJOR_REMINDER_MINIPROGRAM_STATE: 'trial',
  MAJOR_REMINDER_ALLOW_DIRECT: 'true',
  MAJOR_REMINDER_NEW_ENABLED: 'true',
  MAJOR_REMINDER_NEW_TEMPLATE_ID: newTemplates[0]!.templateId,
  MAJOR_REMINDER_NEW_TEMPLATE_FIELDS: JSON.stringify(configured.fields),
  MAJOR_REMINDER_NEW_BATCH_TEMPLATES: JSON.stringify(newTemplates),
  MAJOR_REMINDER_NEW_MINIPROGRAM_STATE: 'trial',
}
const occurrence = {
  zoneId: event.zoneId,
  eventTypeId: event.eventTypeId,
  triggerAtUnixSeconds: event.triggerAtUnixSeconds,
}
const sharedContext = {
  SOURCE: 'wx_devtools',
  APPID: OLD,
  ENV: 'cloud1-d7gxfuxfe813b4eaa',
  FROM_APPID: NEW,
  FROM_OPENID: 'new-user',
}
const makeEntry = (env = environment, context = sharedContext) =>
  createHandler({ database: () => ({}), getWXContext: () => context }, env)

afterEach(() => vi.useRealTimers())

describe('新端獨立模板與無廣告提醒', () => {
  it('完整新配置僅暴露新模板、沒有廣告位；舊配置保持', async () => {
    const entry = makeEntry()
    expect(await entry({ action: 'getBatchConfig' })).toMatchObject({
      ok: true,
      data: {
        enabled: true,
        adUnitId: '',
        templates: newTemplates.map(({ fields: _, ...t }) => t),
      },
    })
    expect(await entry({ action: 'getConfig' })).toMatchObject({
      ok: true,
      data: { enabled: true, templateId: newTemplates[0]!.templateId, adUnitId: '' },
    })
    expect(
      await makeEntry(environment, { ...sharedContext, FROM_APPID: '', FROM_OPENID: '' })({
        action: 'getBatchConfig',
      }),
    ).toMatchObject({ ok: true, data: { enabled: true, templates: expect.any(Array) } })
  })

  it.each([
    { MAJOR_REMINDER_NEW_ENABLED: 'false' },
    { MAJOR_REMINDER_NEW_BATCH_TEMPLATES: '[]' },
    { MAJOR_REMINDER_NEW_BATCH_TEMPLATES: '{broken' },
    { MAJOR_REMINDER_NEW_MINIPROGRAM_STATE: '' },
    { MAJOR_REMINDER_NEW_TEMPLATE_ID: '' },
    { MAJOR_REMINDER_NEW_TEMPLATE_FIELDS: '[]' },
  ])('新配置缺失 %j 時停用，不借用舊模板', async (override) => {
    const result = await makeEntry({ ...environment, ...override })({ action: 'getBatchConfig' })
    expect(result).toMatchObject({
      ok: true,
      data: { enabled: false, templates: [], adUnitId: '' },
    })
  })

  it.each(['completeAd', 'activate', 'prepare', 'authorize'])(
    '新端不接受廣告／舊單槽動作 %s',
    async (action) => {
      expect(await makeEntry()({ action, sessionId: 'x', requestId: 'x' })).toMatchObject({
        ok: false,
        code: 'disabled',
      })
    },
  )

  it('新的直接開通已通過來源驗證，偽造AppID仍被拒絕', async () => {
    expect(
      await makeEntry()({ action: 'activateAuthorized', ownerUid: 'spoof', requestId: 'x' }),
    ).toMatchObject({ ok: false, code: 'invalid-input' })
    expect(
      await makeEntry(environment, { ...sharedContext, FROM_APPID: 'wxunknown' })({
        action: 'getBatchConfig',
      }),
    ).toMatchObject({ ok: false, code: 'unauthorized' })
  })

  it('只接受固定新命名空間及原生OpenID，不把ownerUID直接當收件者', () => {
    expect(typeof resolveOwnerProfile).toBe('function')
    const config = configFromEnvironment(environment)
    expect(resolveOwnerProfile(config, newOwner)).toMatchObject({ appId: NEW, openId: 'new-user' })
    expect(resolveOwnerProfile(config, 'old-user')).toMatchObject({
      appId: OLD,
      openId: 'old-user',
    })
    for (const owner of ['wxunknown:user', NEW + ':', NEW + ':one:two', null])
      expect(resolveOwnerProfile(config, owner)).toBeNull()
    expect(
      resolveOwnerProfile(
        configFromEnvironment({ ...environment, MAJOR_REMINDER_NEW_ENABLED: 'false' }),
        newOwner,
      ),
    ).toBeNull()
  })

  it('同一worker將新舊任務送往各自帳號的原生OpenID，沒有廣告權益', async () => {
    let time = event.triggerAtUnixSeconds - 12000
    const repo = memoryRepository()
    const config = configFromEnvironment(environment)
    expect(config.sharedApp).toBeDefined()
    for (const [owner, selected, selectedTemplates] of [
      ['old-user', config, oldTemplates],
      [newOwner, config.sharedApp, newTemplates],
    ] as const) {
      const service = createService(repo, {
        reference,
        fingerprint: 'test-v1',
        config: selected,
        allowDirect: true,
        now: () => time,
      })
      const prepared = await service.dispatch('prepareBatch', { occurrence, requestId: 'p' }, owner)
      expect(prepared.ok).toBe(true)
      const sessionId = prepared.data.sessionId
      expect(
        (
          await service.dispatch(
            'authorizeBatch',
            {
              sessionId,
              templateIds: selectedTemplates.map((t) => t.templateId),
              requestId: 'a',
            },
            owner,
          )
        ).ok,
      ).toBe(true)
      expect(
        await service.dispatch('activateAuthorized', { sessionId, requestId: 'd' }, owner),
      ).toMatchObject({ ok: true, data: { subscription: { adCompleted: false } } })
    }
    time = event.triggerAtUnixSeconds - 10800
    const send = vi.fn(async (_payload: unknown, _appId?: string) => ({ errCode: 0 }))
    const worker = createWorker(repo, {
      reference,
      fingerprint: 'test-v1',
      config,
      send,
      now: () => time,
    })
    expect(await worker.run()).toMatchObject({ enabled: true, claimed: 2 })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        touser: 'old-user',
        templateId: oldTemplates[0]!.templateId,
      }),
    )
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        touser: 'new-user',
        templateId: newTemplates[0]!.templateId,
      }),
      NEW,
    )
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ touser: newOwner }))
  })
})
