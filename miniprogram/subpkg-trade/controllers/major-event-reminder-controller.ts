import type {
  ReminderAction,
  ReminderBatchConfig,
  ReminderInputs,
  ReminderOccurrence,
  ReminderSubscription,
} from '../../contracts/major-event-reminder'
import type { MajorEventReminderService } from '../../runtime/major-event-reminder-service'
import { ReminderServiceError } from '../../runtime/major-event-reminder-service'
import type { MajorEventReminderPlatform } from '../../runtime/major-event-reminder-platform'

type Mutation = Exclude<ReminderAction, 'getConfig' | 'list' | 'getBatchConfig'>
type PendingOperation = { [A in Mutation]: { action: A; input: ReminderInputs[A] } }[Mutation]
export interface ReminderAdReceipt {
  occurrence: ReminderOccurrence
  mode?: 'batch'
  prepareRequestId: string
  sessionId: string | null
  completionRequestId: string | null
  reason: string
}
const MAX_AD_RECEIPTS = 20
/** 退役持久化失敗必須保留整筆活動操作，不能套用一般業務失敗清理。 */
class ReminderReceiptStorageError extends Error {
  constructor(error: unknown) {
    super(error instanceof Error ? error.message : '完整廣告紀錄無法保存，請稍後再試。')
  }
}
export interface ReminderLocalOperation {
  version: 1
  mode?: 'batch'
  occurrence: ReminderOccurrence
  prepareRequestId: string
  sessionId: string | null
  adFinished: boolean
  pending: PendingOperation | null
  receipts?: ReminderAdReceipt[]
}
export interface ReminderControllerState {
  occurrence: ReminderOccurrence | null
  config: ReminderBatchConfig | null
  subscription: ReminderSubscription | null
  subscriptions: Record<string, ReminderSubscription>
  ready: boolean
  busy: boolean
  unconfirmed: boolean
  message: string
}
interface Options {
  service: MajorEventReminderService
  platform: MajorEventReminderPlatform
  storage: {
    read(): ReminderLocalOperation | null
    write(value: ReminderLocalOperation | null): void
  }
  now(): number
  requestId(): string
  onChange(state: ReminderControllerState): void
  onNotice?(message: string): void
}
export const reminderKey = (o: ReminderOccurrence): string =>
  [o.zoneId, o.eventTypeId, o.triggerAtUnixSeconds].join(':')
export const REMINDER_STORAGE_KEY = 'major_event_reminder_operation_v1'
/** 本機只保存操作參數，不把本機紀錄當成已開通的證據。 */
export const readReminderLocalOperation = (value: unknown): ReminderLocalOperation | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const op = value as ReminderLocalOperation
  if (
    op.version !== 1 ||
    !op.occurrence ||
    typeof op.occurrence.zoneId !== 'string' ||
    typeof op.occurrence.eventTypeId !== 'string' ||
    !Number.isSafeInteger(op.occurrence.triggerAtUnixSeconds) ||
    typeof op.prepareRequestId !== 'string' ||
    (op.sessionId !== null && typeof op.sessionId !== 'string') ||
    typeof op.adFinished !== 'boolean'
  )
    return null
  if (op.mode !== undefined && op.mode !== 'batch') return null
  if (
    op.receipts !== undefined &&
    (!Array.isArray(op.receipts) ||
      op.receipts.length > MAX_AD_RECEIPTS ||
      op.receipts.some(
        (receipt) =>
          !receipt ||
          !receipt.occurrence ||
          typeof receipt.occurrence.zoneId !== 'string' ||
          typeof receipt.occurrence.eventTypeId !== 'string' ||
          !Number.isSafeInteger(receipt.occurrence.triggerAtUnixSeconds) ||
          (receipt.mode !== undefined && receipt.mode !== 'batch') ||
          typeof receipt.prepareRequestId !== 'string' ||
          (receipt.sessionId !== null && typeof receipt.sessionId !== 'string') ||
          (receipt.completionRequestId !== null &&
            typeof receipt.completionRequestId !== 'string') ||
          typeof receipt.reason !== 'string',
      ) ||
      new Set(op.receipts.map((receipt) => reminderKey(receipt.occurrence))).size !==
        op.receipts.length)
  )
    return null
  if (op.pending !== null) {
    if (
      !op.pending ||
      ![
        'prepare',
        'authorize',
        'completeAd',
        'activate',
        'cancel',
        'prepareBatch',
        'authorizeBatch',
      ].includes(op.pending.action) ||
      !op.pending.input ||
      typeof op.pending.input.requestId !== 'string'
    )
      return null
    const p = op.pending
    if (
      (p.action === 'prepare' || p.action === 'prepareBatch') &&
      (!p.input.occurrence || reminderKey(p.input.occurrence) !== reminderKey(op.occurrence))
    )
      return null
    if (
      p.action === 'cancel' &&
      (p.input.key !== reminderKey(op.occurrence) || !Number.isSafeInteger(p.input.expectedVersion))
    )
      return null
    if (
      p.action !== 'prepare' &&
      p.action !== 'prepareBatch' &&
      p.action !== 'cancel' &&
      p.input.sessionId !== op.sessionId
    )
      return null
    if (
      p.action === 'authorizeBatch' &&
      (!Array.isArray(p.input.templateIds) ||
        p.input.templateIds.length < 1 ||
        p.input.templateIds.length > 3 ||
        p.input.templateIds.some((id) => typeof id !== 'string' || !id) ||
        new Set(p.input.templateIds).size !== p.input.templateIds.length)
    )
      return null
    if (p.action === 'authorize' && ![10800, 3600, 600].includes(p.input.leadSeconds)) return null
  }
  return JSON.parse(JSON.stringify(op)) as ReminderLocalOperation
}
export const createMajorEventReminderController = (options: Options) => {
  const { service, platform, storage, now, requestId } = options
  const state: ReminderControllerState = {
    occurrence: null,
    config: null,
    subscription: null,
    subscriptions: {},
    ready: false,
    busy: false,
    unconfirmed: false,
    message: '',
  }
  let operation: ReminderLocalOperation | null = null
  let destroyed = false
  let storageFailed = false
  try {
    operation = readReminderLocalOperation(storage.read())
  } catch {
    storageFailed = true
  }
  if (operation) {
    state.occurrence = { ...operation.occurrence }
    state.unconfirmed = operation.pending !== null || operation.adFinished
  }
  const emit = () => {
    if (!destroyed) options.onChange(state)
  }
  const save = () => {
    if (destroyed) return
    storage.write(operation)
    storageFailed = false
  }
  const updateSubscription = (sub: ReminderSubscription) => {
    if (!operation || sub.key !== reminderKey(operation.occurrence))
      throw new ReminderServiceError('unconfirmed', '提醒場次回應不一致，請稍後確認。')
    state.subscriptions = { ...state.subscriptions, [sub.key]: sub }
    state.subscription = sub
  }
  const replay = async () => {
    const op = operation
    if (!op?.pending) return
    const pending = op.pending
    const result = await service.invoke(pending.action, pending.input)
    if (destroyed) return
    updateSubscription(result.subscription)
    if ('sessionId' in result) op.sessionId = result.sessionId
    op.pending = null
    if (pending.action === 'completeAd' || pending.action === 'activate') {
      op.adFinished = false
      // 只有同場服務端完成確認才能消耗本機收據；不可轉給其他場次。
      op.receipts = op.receipts?.filter(
        (receipt) => reminderKey(receipt.occurrence) !== result.subscription.key,
      )
    }
    if (pending.action === 'cancel') op.sessionId = null
    state.unconfirmed = op.adFinished
    save()
  }
  const mutate = async (pending: PendingOperation) => {
    if (destroyed || !operation) return
    operation.pending = pending
    state.unconfirmed = true
    save()
    await replay()
  }
  const retire = (error: unknown): boolean => {
    if (
      destroyed ||
      !operation ||
      !(error instanceof ReminderServiceError) ||
      ![
        'expired',
        'missed',
        'data-changed',
        'stale-session',
        'not-found',
        'authorization-required',
        'invalid-occurrence',
      ].includes(error.code)
    )
      return false
    const op = operation
    let receipts = op.receipts
    if (
      op.adFinished &&
      !op.receipts?.some(
        (receipt) => reminderKey(receipt.occurrence) === reminderKey(op.occurrence),
      )
    ) {
      receipts = [...(op.receipts ?? [])]
      // 收據容量有界；只淘汰已開始場次的歷史收據，仍有效的完整廣告不可丟棄。
      if (receipts.length >= MAX_AD_RECEIPTS) {
        const expired = receipts.findIndex(
          (receipt) => receipt.occurrence.triggerAtUnixSeconds <= now(),
        )
        if (expired < 0) throw new Error('完整廣告收據已滿，請先恢復原場提醒。')
        receipts.splice(expired, 1)
      }
      receipts.push({
        occurrence: { ...op.occurrence },
        ...(op.mode ? { mode: op.mode } : {}),
        prepareRequestId: op.prepareRequestId,
        sessionId: op.sessionId,
        completionRequestId:
          op.pending?.action === 'completeAd' ? op.pending.input.requestId : null,
        reason: error.code,
      })
    }
    const retired = { ...op, receipts, pending: null, sessionId: null, adFinished: false }
    // 先持久化才替換活動操作；寫入失敗時仍保留原待確認參數及完整廣告。
    try {
      storage.write(retired)
    } catch (error) {
      throw new ReminderReceiptStorageError(error)
    }
    operation = retired
    storageFailed = false
    state.unconfirmed = false
    const hasReceipt = receipts?.some(
      (receipt) => reminderKey(receipt.occurrence) === reminderKey(op.occurrence),
    )
    notice(
      `${error.message}；${hasReceipt ? '已保留原場完整廣告紀錄，可繼續操作其他場次。' : '原操作已停止，可重新操作提醒。'}`,
    )
    return true
  }
  const storageFailure = (error: unknown) => {
    storageFailed = true
    state.unconfirmed = !!operation && (operation.adFinished || operation.pending !== null)
    notice(error instanceof Error ? error.message : '完整廣告紀錄無法保存，請稍後再試。')
  }
  const failure = (error: unknown) => {
    if (destroyed) return
    if (error instanceof ReminderReceiptStorageError) {
      storageFailure(error)
      return
    }
    try {
      if (retire(error)) return
    } catch (storageError) {
      storageFailure(storageError)
      return
    }
    const uncertain =
      error instanceof ReminderServiceError &&
      (error.code === 'unconfirmed' || error.code === 'network')
    state.unconfirmed =
      !!operation && (operation.adFinished || (uncertain && operation.pending != null))
    notice(error instanceof Error ? error.message : '提醒服務暫時無法使用，請稍後再試。')
    if (!uncertain && operation) {
      operation.pending = null
      if (
        error instanceof ReminderServiceError &&
        ['stale-session', 'expired', 'data-changed', 'authorization-required'].includes(error.code)
      )
        operation.sessionId = null
      try {
        save()
      } catch {
        storageFailed = true
      }
    }
  }
  const notice = (message: string) => {
    if (!destroyed) {
      state.message = message
      options.onNotice?.(message)
    }
  }
  const run = (work: () => Promise<void>): Promise<void> => {
    if (destroyed || state.busy) return Promise.resolve()
    state.busy = true
    state.message = ''
    emit()
    return (async () => {
      try {
        await work()
      } catch (error) {
        failure(error)
      } finally {
        state.busy = false
        emit()
      }
    })()
  }
  const load = async () => {
    state.ready = false
    state.config = null
    // 原v1操作按原requestId先恢復；確定失效改存原場收據，不讓舊操作永久鎖頁。
    try {
      if (operation?.pending) await replay()
      if (destroyed) return
      if (operation?.adFinished) {
        if (!operation.sessionId)
          await mutate({
            action: operation.mode === 'batch' ? 'prepareBatch' : 'prepare',
            input: {
              occurrence: { ...operation.occurrence },
              requestId: operation.prepareRequestId,
            },
          })
        if (operation.sessionId)
          await mutate({
            action: 'completeAd',
            input: { sessionId: operation.sessionId, requestId: requestId() },
          })
      }
    } catch (error) {
      if (!retire(error)) throw error
    }
    if (destroyed) return
    // 恢復操作完成後，兩個唯讀請求互不依賴；全部確認後才開放操作。
    const [config, list] = await Promise.all([
      service.invoke('getBatchConfig', {}),
      service.invoke('list', {}),
    ])
    if (destroyed) return
    state.config = config
    if (config.enabled) platform.preloadAd?.(config.adUnitId)
    state.subscriptions = Object.fromEntries(list.subscriptions.map((sub) => [sub.key, sub]))
    state.subscription = state.occurrence
      ? (state.subscriptions[reminderKey(state.occurrence)] ?? null)
      : null
    state.ready = true
  }
  const controller = {
    state,
    isChecked(key: string): boolean {
      const sub = state.subscriptions[key]
      return (
        Number(key.split(':')[2]) > now() &&
        !!sub?.slots.some((slot) => ['pending', 'sending', 'unknown'].includes(slot.status))
      )
    },
    refresh: () => run(load),
    toggle(occurrence: ReminderOccurrence): Promise<void> {
      if (destroyed || state.busy) return Promise.resolve()
      if (!state.ready) {
        notice(state.message || '提醒狀態尚未載入，請稍後再試。')
        return Promise.resolve()
      }
      if (operation?.pending || operation?.adFinished) {
        notice('上一個提醒操作尚待確認，請回到頁面重新確認。')
        return Promise.resolve()
      }
      const snapshot = {
        zoneId: occurrence.zoneId,
        eventTypeId: occurrence.eventTypeId,
        triggerAtUnixSeconds: occurrence.triggerAtUnixSeconds,
      }
      const key = reminderKey(snapshot)
      const sub = state.subscriptions[key]
      const cancel = controller.isChecked(key)
      if (!cancel && !state.config?.enabled) {
        notice(state.config?.reason ?? '微信提醒尚未開放。')
        return Promise.resolve()
      }
      const config = state.config
      const validTemplates = () =>
        config?.templates.filter((t) => snapshot.triggerAtUnixSeconds - t.leadSeconds > now()) ?? []
      if (!cancel && !validTemplates().length) {
        notice('本場所有提醒時點均已錯過。')
        return Promise.resolve()
      }
      const receipts = operation?.receipts ?? []
      const receipt = receipts.find((item) => reminderKey(item.occurrence) === key)
      if (
        !cancel &&
        !receipt &&
        !sub?.adCompleted &&
        receipts.length >= MAX_AD_RECEIPTS &&
        receipts.every((item) => item.occurrence.triggerAtUnixSeconds > now())
      ) {
        notice('完整廣告收據已滿，請先恢復原場提醒。')
        return Promise.resolve()
      }
      state.occurrence = snapshot
      state.subscription = sub ?? null
      return run(async () => {
        if (cancel) {
          operation = {
            version: 1,
            mode: 'batch',
            receipts,
            occurrence: snapshot,
            prepareRequestId: requestId(),
            sessionId: null,
            adFinished: false,
            pending: null,
          }
          await mutate({
            action: 'cancel',
            input: { key, expectedVersion: sub!.version, requestId: requestId() },
          })
          if (destroyed) return
          notice(
            state.subscription?.slots.some((s) => ['sending', 'unknown'].includes(s.status))
              ? '已取消尚未發送的提醒；已開始發送的項目可能仍會收到。'
              : '本場尚未發送的提醒已取消。',
          )
          return
        }
        // 第一個await及任何服務呼叫之前，同一點擊堆疊只發起一次原生授權。
        const results = await platform.subscribeBatch(validTemplates().map((t) => t.templateId))
        if (destroyed) return
        const valid = validTemplates()
        if (!valid.length) {
          notice('本場所有提醒時點均已錯過。')
          return
        }
        if (!valid.every((t) => results[t.templateId] === 'accept')) {
          notice('尚未完整接受所有有效時點的微信授權，提醒未開通。')
          return
        }
        operation = {
          version: 1,
          mode: 'batch',
          receipts,
          occurrence: snapshot,
          prepareRequestId: requestId(),
          sessionId: null,
          adFinished: false,
          pending: null,
        }
        await mutate({
          action: 'prepareBatch',
          input: { occurrence: snapshot, requestId: operation.prepareRequestId },
        })
        if (destroyed) return
        await mutate({
          action: 'authorizeBatch',
          input: {
            sessionId: operation.sessionId!,
            templateIds: valid.map((t) => t.templateId),
            requestId: requestId(),
          },
        })
        if (destroyed) return
        if (receipt && !state.subscription?.adCompleted) {
          operation.adFinished = true
          save()
          await mutate({
            action: 'completeAd',
            input: { sessionId: operation.sessionId!, requestId: requestId() },
          })
        } else if (state.subscription?.adCompleted) {
          await mutate({
            action: 'activate',
            input: { sessionId: operation.sessionId!, requestId: requestId() },
          })
        } else {
          if (storageFailed) throw new Error('操作紀錄無法保存，請稍後再試。')
          save()
          const op = operation
          const storedBeforeAd = JSON.stringify(op)
          if (!(await platform.watchAd(config!.adUnitId))) {
            notice('未完整觀看廣告，提醒尚未開通。')
            return
          }
          if (destroyed) {
            if (JSON.stringify(readReminderLocalOperation(storage.read())) === storedBeforeAd)
              storage.write({ ...op, adFinished: true })
            return
          }
          op.adFinished = true
          save()
          await mutate({
            action: 'completeAd',
            input: { sessionId: op.sessionId!, requestId: requestId() },
          })
        }
        if (destroyed) return
        const leads =
          state.subscription?.slots
            .filter((s) => ['pending', 'sending', 'unknown'].includes(s.status))
            .map((s) =>
              s.leadSeconds === 10800 ? '3 小時' : s.leadSeconds === 3600 ? '1 小時' : '10 分鐘',
            ) ?? []
        notice(
          leads.length
            ? `本場已開通 ${leads.length} 次提醒：開始前 ${leads.join('、')}。`
            : '本場完整廣告已確認；提醒時點已過，不補發通知。',
        )
      })
    },
    destroy() {
      destroyed = true
      platform.destroy()
    },
  }
  return controller
}
export type MajorEventReminderController = ReturnType<typeof createMajorEventReminderController>
