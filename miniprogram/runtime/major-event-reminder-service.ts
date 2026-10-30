import { MAJOR_EVENT_REMINDER_FUNCTION_NAME } from './cloudbase-config'
import type {
  ReminderAction,
  ReminderInputs,
  ReminderOutputs,
} from '../contracts/major-event-reminder'

export interface MajorEventReminderService {
  invoke<A extends ReminderAction>(action: A, input: ReminderInputs[A]): Promise<ReminderOutputs[A]>
}
export class ReminderServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ReminderServiceError'
  }
}
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Record<string, unknown>, expected: string[]): boolean =>
  Object.keys(v).length === expected.length &&
  expected.every((k) => Object.prototype.hasOwnProperty.call(v, k))
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200
const statuses = [
  'unsubscribed',
  'authorized',
  'pending',
  'sending',
  'sent',
  'failed',
  'unknown',
  'missed',
  'cancelled',
]
const subscription = (v: unknown): boolean => {
  if (
    !record(v) ||
    !keys(v, ['key', 'version', 'adCompleted', 'slots']) ||
    !text(v.key) ||
    !Number.isSafeInteger(v.version) ||
    Number(v.version) < 0 ||
    typeof v.adCompleted !== 'boolean' ||
    !Array.isArray(v.slots) ||
    v.slots.length !== 3
  )
    return false
  const parts = v.key.split(':')
  const trigger = Number(parts[2])
  if (
    parts.length !== 3 ||
    !parts[0] ||
    !parts[1] ||
    !Number.isSafeInteger(trigger) ||
    trigger <= 0
  )
    return false
  return v.slots.every(
    (s, i) =>
      record(s) &&
      keys(s, ['leadSeconds', 'dueAtUnixSeconds', 'status']) &&
      s.leadSeconds === [10800, 3600, 600][i] &&
      Number.isSafeInteger(s.dueAtUnixSeconds) &&
      s.dueAtUnixSeconds === trigger - Number(s.leadSeconds) &&
      statuses.includes(String(s.status)),
  )
}
const validData = (action: ReminderAction, v: unknown): boolean => {
  if (!record(v)) return false
  if (action === 'getBatchConfig')
    return (
      keys(v, ['enabled', 'reason', 'adUnitId', 'templates']) &&
      typeof v.enabled === 'boolean' &&
      (v.reason === null || text(v.reason)) &&
      text(v.adUnitId) &&
      Array.isArray(v.templates) &&
      (v.enabled
        ? v.templates.length === 3 &&
          v.templates.every(
            (t, i) =>
              record(t) &&
              keys(t, ['leadSeconds', 'templateId', 'title']) &&
              t.leadSeconds === [10800, 3600, 600][i] &&
              text(t.templateId) &&
              text(t.title),
          ) &&
          new Set(v.templates.map((t) => t.templateId)).size === 3 &&
          new Set(v.templates.map((t) => t.title)).size === 3
        : v.templates.length === 0)
    )
  if (action === 'getConfig')
    return (
      keys(v, ['enabled', 'reason', 'templateId', 'adUnitId']) &&
      typeof v.enabled === 'boolean' &&
      (v.reason === null || text(v.reason)) &&
      typeof v.templateId === 'string' &&
      v.templateId.length <= 200 &&
      text(v.adUnitId) &&
      (!v.enabled || text(v.templateId))
    )
  if (action === 'list')
    return (
      keys(v, ['subscriptions']) &&
      Array.isArray(v.subscriptions) &&
      v.subscriptions.every(subscription) &&
      new Set(v.subscriptions.map((s) => (s as { key: string }).key)).size ===
        v.subscriptions.length
    )
  return (
    keys(
      v,
      action === 'prepare' || action === 'prepareBatch'
        ? ['sessionId', 'subscription']
        : ['subscription'],
    ) &&
    ((action !== 'prepare' && action !== 'prepareBatch') || text(v.sessionId)) &&
    subscription(v.subscription)
  )
}
const unconfirmed = () =>
  new ReminderServiceError(
    'unconfirmed',
    '提醒服務暫時無法確認，請稍後回來確認；已完成的操作會保留。',
  )
export const createMajorEventReminderService = (timeoutMs = 12_000): MajorEventReminderService => ({
  async invoke(action, input) {
    let timer: ReturnType<typeof setTimeout> | undefined
    let response: unknown
    try {
      response = await Promise.race([
        wx.cloud.callFunction({
          name: MAJOR_EVENT_REMINDER_FUNCTION_NAME,
          data: { action, ...input },
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(unconfirmed()), Math.max(1, Math.min(timeoutMs, 30_000)))
        }),
      ])
    } catch {
      throw unconfirmed()
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
    if (!record(response) || !record(response.result)) throw unconfirmed()
    const result = response.result
    if (
      result.ok === false &&
      keys(result, ['ok', 'code', 'message']) &&
      text(result.code) &&
      text(result.message)
    )
      throw new ReminderServiceError(result.code, result.message)
    if (result.ok !== true || !keys(result, ['ok', 'data']) || !validData(action, result.data))
      throw unconfirmed()
    return result.data as unknown as ReminderOutputs[typeof action]
  },
})
