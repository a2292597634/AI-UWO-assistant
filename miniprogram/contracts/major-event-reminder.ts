/** 單場大流行提醒的前後端共享契約，所有時間均為 Unix 秒。 */
export type ReminderLeadSeconds = 10800 | 3600 | 600
export interface ReminderOccurrence {
  zoneId: string
  eventTypeId: string
  triggerAtUnixSeconds: number
}
export type ReminderSlotStatus =
  | 'unsubscribed'
  | 'authorized'
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'unknown'
  | 'missed'
  | 'cancelled'
export interface ReminderSlot {
  leadSeconds: ReminderLeadSeconds
  dueAtUnixSeconds: number
  status: ReminderSlotStatus
}
export interface ReminderSubscription {
  key: string
  version: number
  adCompleted: boolean
  slots: ReminderSlot[]
}
export interface ReminderConfig {
  enabled: boolean
  reason: string | null
  templateId: string
  adUnitId: string
}
export interface ReminderBatchConfig {
  enabled: boolean
  reason: string | null
  adUnitId: string
  templates: { leadSeconds: ReminderLeadSeconds; templateId: string; title: string }[]
}
export interface ReminderInputs {
  getBatchConfig: Record<string, never>
  prepareBatch: { occurrence: ReminderOccurrence; requestId: string }
  authorizeBatch: { sessionId: string; templateIds: string[]; requestId: string }
  getConfig: Record<string, never>
  list: Record<string, never>
  prepare: { occurrence: ReminderOccurrence; requestId: string }
  authorize: { sessionId: string; leadSeconds: ReminderLeadSeconds; requestId: string }
  completeAd: { sessionId: string; requestId: string }
  activate: { sessionId: string; requestId: string }
  cancel: { key: string; expectedVersion: number; requestId: string }
}
export interface ReminderOutputs {
  getBatchConfig: ReminderBatchConfig
  prepareBatch: { sessionId: string; subscription: ReminderSubscription }
  authorizeBatch: { subscription: ReminderSubscription }
  getConfig: ReminderConfig
  list: { subscriptions: ReminderSubscription[] }
  prepare: { sessionId: string; subscription: ReminderSubscription }
  authorize: { subscription: ReminderSubscription }
  completeAd: { subscription: ReminderSubscription }
  activate: { subscription: ReminderSubscription }
  cancel: { subscription: ReminderSubscription }
}
export type ReminderAction = keyof ReminderInputs
export type ReminderResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }
