import { describe, expect, it } from 'vitest'
import { configured, event, load, reference } from './helpers'
const { validateConfig, configFromEnvironment, notificationData } = load('config')
describe('服務端模板欄位', () => {
  it('無效 JSON、null 欄位與原始型別均回報停用，不讓配置解析中止入口', () => {
    for (const raw of ['null', '[null,null,null,null,null]', 'false', '{', '[1,2,3,4,5]']) {
      expect(
        validateConfig(
          configFromEnvironment({
            MAJOR_REMINDER_TEMPLATE_ID: configured.templateId,
            MAJOR_REMINDER_TEMPLATE_FIELDS: raw,
            MAJOR_REMINDER_MINIPROGRAM_STATE: 'trial',
          }),
        ).enabled,
      ).toBe(false)
    }
  })
  it('正文按 thing 的20字符與 time 格式校驗，拒絕長海域名', () => {
    const data = notificationData(configured, reference, event, 600)
    expect(data.thing4.value).toBe('開始前10分鐘')
    expect(data.time3.value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(() =>
      notificationData(
        configured,
        {
          ...reference,
          zones: reference.zones.map((zone: { id: string }) => ({
            ...zone,
            name: '長'.repeat(21),
          })),
        },
        event,
        600,
      ),
    ).toThrow('限制')
  })
})

// key 僅為測試 fixture，不能用作真模板配置。
const activityConfig = {
  ...configured,
  fields: [
    { source: 'activity', key: 'thing8', type: 'thing' },
    { source: 'start', key: 'time6', type: 'time' },
  ],
}
describe('活動兩欄位 profile', () => {
  it('接受兩欄位及原五欄位完整 profile', () => {
    expect(validateConfig(activityConfig).enabled).toBe(true)
    expect(validateConfig(configured).enabled).toBe(true)
  })
  it('合併完整語義並保持東八區時間', () => {
    const fixture = {
      zones: [{ id: 'north', name: '北極海' }],
      eventTypes: [{ id: 'luxury', name: '奢侈' }],
    }
    const occurrence = { zoneId: 'north', eventTypeId: 'luxury', triggerAtUnixSeconds: 0 }
    for (const [lead, text] of [
      [10800, '北極海·奢侈預報｜3小時後'],
      [3600, '北極海·奢侈預報｜1小時後'],
      [600, '北極海·奢侈預報｜10分鐘後'],
    ] as const) {
      expect(notificationData(activityConfig, fixture, occurrence, lead)).toEqual({
        thing8: { value: text },
        time6: { value: '1970-01-01 08:00' },
      })
    }
  })
  it('全部權威海域及類型三個提前量都保留完整語義且不超過20字', () => {
    for (const zone of reference.zones)
      for (const type of reference.eventTypes)
        for (const lead of [10800, 3600, 600]) {
          const data = notificationData(
            activityConfig,
            reference,
            { ...event, zoneId: zone.id, eventTypeId: type.id },
            lead,
          )
          expect(data.thing8.value).toContain(`${zone.name}·${type.name}預報`)
          expect([...data.thing8.value].length).toBeLessThanOrEqual(20)
        }
  })
  it('長名稱明確拒絕而不截斷', () => {
    expect(() =>
      notificationData(
        activityConfig,
        {
          ...reference,
          zones: reference.zones.map((zone: { id: string }) => ({
            ...zone,
            name: '長'.repeat(21),
          })),
        },
        event,
        600,
      ),
    ).toThrow('限制')
  })
  it('拒絕子集、額外來源、重複source或key及錯誤type', () => {
    const [activity, start] = activityConfig.fields
    for (const fields of [
      [activity],
      [activity, start, configured.fields[0]],
      [activity, activity],
      [activity, { ...start, key: activity!.key }],
      [activity, { ...start, type: 'thing', key: 'thing6' }],
      [{ ...activity, source: 'zone' }, start],
      configured.fields.slice(0, 4),
      [...configured.fields, activity],
      [null, start],
    ]) {
      expect(validateConfig({ ...configured, fields }).enabled).toBe(false)
    }
  })
})
