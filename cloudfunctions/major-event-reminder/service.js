const { createHash, randomUUID } = require('node:crypto')
const { LEADS, availableLeads, occurrenceKey, validOccurrence } = require('./policy')
const { validateConfig, validateBatchConfig } = require('./config')
const RETENTION_SECONDS = 30 * 86400
const hash = (...values) => createHash('sha256').update(JSON.stringify(values)).digest('hex')
const subIdFor = (owner, key) => hash(owner, key)
const jobIdFor = (subId, lead) => hash(subId, lead)
const publicSubscription = (sub, now) => ({
  key: sub.key,
  version: sub.version,
  adCompleted: sub.adCompleted,
  slots: sub.slots.map(({ leadSeconds, dueAtUnixSeconds, status }) => ({
    leadSeconds,
    dueAtUnixSeconds,
    status:
      ['unsubscribed', 'authorized'].includes(status) && dueAtUnixSeconds <= now
        ? 'missed'
        : status,
  })),
})
function reject(code, message) {
  throw Object.assign(new Error(message), { code })
}
const fieldsByAction = {
  getConfig: [],
  getBatchConfig: [],
  prepareBatch: ['occurrence', 'requestId'],
  authorizeBatch: ['sessionId', 'templateIds', 'requestId'],
  list: [],
  prepare: ['occurrence', 'requestId'],
  authorize: ['sessionId', 'leadSeconds', 'requestId'],
  completeAd: ['sessionId', 'requestId'],
  activate: ['sessionId', 'requestId'],
  cancel: ['key', 'expectedVersion', 'requestId'],
}
const stableJson = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  )

function createService(
  repo,
  { reference, fingerprint, config, now = () => Math.floor(Date.now() / 1000) },
) {
  const publicConfig = validateConfig(config)
  const batchConfig = validateBatchConfig(config)
  const assertCurrent = (sub, session, owner, time) => {
    if (
      !sub ||
      !session ||
      sub.ownerUid !== owner ||
      session.ownerUid !== owner ||
      session.subId !== sub.id
    )
      reject('not-found', '找不到本人的提醒流程')
    if (
      session.fingerprint !== fingerprint ||
      sub.fingerprint !== fingerprint ||
      !validOccurrence(reference, sub.occurrence)
    )
      reject('data-changed', '日程資料已變更，原提醒已停止')
    if (session.epoch !== sub.epoch) reject('stale-session', '提醒流程已更新，請重新打開本場操作')
    if (sub.occurrence.triggerAtUnixSeconds <= time) reject('expired', '本場大流行已開始')
  }
  /** prepare 與恢復共用 owner 鎖；被修剪的場次須重新取得名額才可變回有效待辦。 */
  async function ensureOwnerActive(tx, owner, id, time) {
    const index = (await tx.get('owners', hash(owner))) || {
      ownerUid: owner,
      active: [],
      recent: [],
    }
    const stillActive = []
    for (const existingId of index.active) {
      const existing = await tx.get('subscriptions', existingId)
      if (
        existing &&
        existing.occurrence.triggerAtUnixSeconds > time &&
        existing.slots.some((slot) =>
          ['unsubscribed', 'authorized', 'pending', 'sending', 'unknown'].includes(slot.status),
        )
      )
        stillActive.push(existingId)
      else
        index.recent = [existingId, ...index.recent.filter((item) => item !== existingId)].slice(
          0,
          20,
        )
    }
    index.active = stillActive
    if (!index.active.includes(id)) {
      if (index.active.length >= 20) reject('limit', '最多可辦理20場尚未完成的大流行提醒')
      index.active.push(id)
      index.recent = index.recent.filter((item) => item !== id)
    }
    await tx.put('owners', hash(owner), index)
  }
  async function dispatch(action, input = {}, owner) {
    try {
      if (!fieldsByAction[action]) reject('invalid-action', '不支援的提醒操作')
      if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => !fieldsByAction[action].includes(key))
      )
        reject('invalid-input', '提醒參數無效')
      if (action === 'getConfig') return { ok: true, data: publicConfig }
      if (action === 'getBatchConfig') return { ok: true, data: batchConfig }
      if (typeof owner !== 'string' || !owner || owner.length > 128)
        reject('unauthorized', '請從微信小程序操作提醒')
      const time = now()
      if (action === 'list') {
        const data = await repo.transaction(async (tx) => {
          const index = await tx.get('owners', hash(owner))
          if (!index) return { subscriptions: [] }
          const subscriptions = []
          for (const id of [...new Set([...index.active, ...index.recent])]) {
            const sub = await tx.get('subscriptions', id)
            if (sub?.ownerUid === owner) subscriptions.push(publicSubscription(sub, time))
          }
          return { subscriptions }
        })
        return { ok: true, data }
      }
      const selectedConfig = ['prepareBatch', 'authorizeBatch'].includes(action)
        ? batchConfig
        : publicConfig
      if (
        action !== 'cancel' &&
        !(['completeAd', 'activate'].includes(action)
          ? publicConfig.enabled || batchConfig.enabled
          : selectedConfig.enabled)
      )
        reject('disabled', selectedConfig.reason)
      if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(input.requestId))
        reject('invalid-input', '操作編號無效')
      const operationId = hash(owner, input.requestId)
      const signature = stableJson({ action, input })
      const newSessionId = randomUUID()
      return await repo.transaction(async (tx) => {
        const previous = await tx.get('operations', operationId)
        if (previous) {
          if (previous.ownerUid !== owner || previous.signature !== signature)
            reject('request-conflict', '操作編號已用於其他提醒操作')
          return previous.response
        }
        let sub
        let responseData
        if (action === 'prepare' || action === 'prepareBatch') {
          const occurrence = input.occurrence
          if (!validOccurrence(reference, occurrence))
            reject('invalid-occurrence', '大流行場次不符合權威日程')
          if (!availableLeads(time, occurrence.triggerAtUnixSeconds).length)
            reject('missed', '本場所有提醒時點均已錯過')
          if (occurrence.triggerAtUnixSeconds > time + 379 * 3600)
            reject('invalid-occurrence', '場次超出可辦理範圍')
          const key = occurrenceKey(occurrence)
          const id = subIdFor(owner, key)
          await ensureOwnerActive(tx, owner, id, time)
          sub = await tx.get('subscriptions', id)
          if (!sub) {
            sub = {
              id,
              ownerUid: owner,
              key,
              occurrence: {
                zoneId: occurrence.zoneId,
                eventTypeId: occurrence.eventTypeId,
                triggerAtUnixSeconds: occurrence.triggerAtUnixSeconds,
              },
              fingerprint,
              version: 1,
              epoch: 1,
              adCompleted: false,
              createdAt: time,
              expiresAt: occurrence.triggerAtUnixSeconds + RETENTION_SECONDS,
              slots: LEADS.map((leadSeconds) => ({
                leadSeconds,
                dueAtUnixSeconds: occurrence.triggerAtUnixSeconds - leadSeconds,
                status:
                  time < occurrence.triggerAtUnixSeconds - leadSeconds ? 'unsubscribed' : 'missed',
                authorized: false,
                generation: 0,
              })),
            }
          } else if (sub.fingerprint !== fingerprint)
            reject('data-changed', '日程資料已變更，原提醒已停止')
          sub.cleanupEligible = !sub.slots.some((slot) =>
            ['pending', 'sending', 'unknown'].includes(slot.status),
          )
          await tx.put('subscriptions', id, sub)
          await tx.put('sessions', newSessionId, {
            ...(action === 'prepareBatch'
              ? { mode: 'batch', templates: batchConfig.templates }
              : {}),
            ownerUid: owner,
            subId: id,
            fingerprint,
            epoch: sub.epoch,
            createdAt: time,
            expiresAt: sub.expiresAt,
          })
          responseData = { sessionId: newSessionId, subscription: publicSubscription(sub, time) }
        } else if (action === 'cancel') {
          if (
            typeof input.key !== 'string' ||
            input.key.length > 200 ||
            !Number.isSafeInteger(input.expectedVersion)
          )
            reject('invalid-input', '取消參數無效')
          sub = await tx.get('subscriptions', subIdFor(owner, input.key))
          if (!sub || sub.ownerUid !== owner) reject('not-found', '找不到本人的提醒')
          if (sub.version !== input.expectedVersion)
            reject('version-conflict', '提醒狀態已更新，請重新確認')
          for (const slot of sub.slots) {
            if (['pending', 'authorized', 'unsubscribed'].includes(slot.status)) {
              slot.status = 'cancelled'
              const jobId = jobIdFor(sub.id, slot.leadSeconds)
              const job = await tx.get('jobs', jobId)
              if (job?.status === 'pending') {
                job.status = 'cancelled'
                job.updatedAt = time
                await tx.put('jobs', jobId, job)
              }
            }
          }
          sub.epoch += 1
          sub.version += 1
          sub.cleanupEligible = !sub.slots.some((slot) =>
            ['pending', 'sending', 'unknown'].includes(slot.status),
          )
          await tx.put('subscriptions', sub.id, sub)
          responseData = { subscription: publicSubscription(sub, time) }
        } else {
          if (typeof input.sessionId !== 'string' || input.sessionId.length > 100)
            reject('invalid-input', '流程編號無效')
          const session = await tx.get('sessions', input.sessionId)
          sub = session ? await tx.get('subscriptions', session.subId) : null
          assertCurrent(sub, session, owner, time)
          const sessionConfig = session.mode === 'batch' ? batchConfig : publicConfig
          if (!sessionConfig.enabled) reject('disabled', sessionConfig.reason)
          if (
            (action === 'authorizeBatch' && session.mode !== 'batch') ||
            (action === 'authorize' && session.mode === 'batch')
          )
            reject('invalid-session', '提醒授權流程類型不符')
          if (action === 'authorizeBatch') {
            const templates = session.templates
            if (
              !Array.isArray(input.templateIds) ||
              new Set(input.templateIds).size !== input.templateIds.length ||
              input.templateIds.some((id) => !templates.some((t) => t.templateId === id))
            )
              reject('invalid-input', '批次模板授權參數無效')
            const required = templates.filter(
              (t) => sub.occurrence.triggerAtUnixSeconds - t.leadSeconds > time,
            )
            if (!required.length) reject('missed', '本場所有提醒時點均已錯過')
            if (required.some((t) => !input.templateIds.includes(t.templateId)))
              reject('authorization-required', '請完整接受所有尚未錯過的提醒授權')
            await ensureOwnerActive(tx, owner, sub.id, time)
            for (const template of required) {
              const slot = sub.slots.find((item) => item.leadSeconds === template.leadSeconds)
              if (!['unsubscribed', 'cancelled', 'failed', 'authorized'].includes(slot.status))
                continue
              if (slot.status === 'authorized' && slot.templateId === template.templateId) continue
              slot.templateId = template.templateId
              slot.authorized = true
              slot.generation += 1
              slot.status = 'authorized'
              sub.version += 1
            }
            session.batchAuthorized = true
            await tx.put('sessions', input.sessionId, session)
          } else if (action === 'authorize') {
            if (!LEADS.includes(input.leadSeconds)) reject('invalid-input', '提醒提前量無效')
            const slot = sub.slots.find((item) => item.leadSeconds === input.leadSeconds)
            if (slot.dueAtUnixSeconds <= time) reject('missed', '該提醒時點已錯過')
            if (['unsubscribed', 'cancelled', 'failed'].includes(slot.status)) {
              await ensureOwnerActive(tx, owner, sub.id, time)
              slot.templateId = config.templateId
              slot.authorized = true
              slot.generation += 1
              slot.status = 'authorized'
              sub.version += 1
            }
          } else {
            if (session.mode === 'batch' && !session.batchAuthorized)
              reject('authorization-required', '請先完整接受本場批次提醒授權')
            if (action === 'activate' && !sub.adCompleted)
              reject('ad-required', '請先完整觀看本場激勵廣告')
            if (
              !sub.slots.some(
                (slot) =>
                  slot.authorized &&
                  (action === 'completeAd' || slot.dueAtUnixSeconds > time) &&
                  ['authorized', 'pending', 'cancelled'].includes(slot.status),
              )
            )
              reject('authorization-required', '請先授權至少一個尚未錯過的提醒時點')
            await ensureOwnerActive(tx, owner, sub.id, time)
            // 普通激勵廣告僅有前端回調；本欄位不是服務端驗簽的觀看證明。
            if (action === 'completeAd') sub.adCompleted = true
            for (const slot of sub.slots) {
              if (!slot.authorized || !['authorized', 'cancelled'].includes(slot.status)) continue
              if (slot.dueAtUnixSeconds <= time) {
                slot.status = 'missed'
                continue
              }
              const id = jobIdFor(sub.id, slot.leadSeconds)
              const oldJob = await tx.get('jobs', id)
              if (oldJob && ['sent', 'sending', 'unknown'].includes(oldJob.status)) {
                slot.status = oldJob.status
                continue
              }
              slot.status = 'pending'
              await tx.put('jobs', id, {
                id,
                subId: sub.id,
                ownerUid: owner,
                templateId: slot.templateId || config.templateId,
                fingerprint,
                occurrence: sub.occurrence,
                leadSeconds: slot.leadSeconds,
                generation: slot.generation,
                dueAt: slot.dueAtUnixSeconds,
                nextRunAt: slot.dueAtUnixSeconds,
                status: 'pending',
                attempts: 0,
                createdAt: time,
                updatedAt: time,
                expiresAt: sub.expiresAt,
              })
            }
            sub.version += 1
          }
          sub.cleanupEligible = !sub.slots.some((slot) =>
            ['pending', 'sending', 'unknown'].includes(slot.status),
          )
          await tx.put('subscriptions', sub.id, sub)
          responseData = { subscription: publicSubscription(sub, time) }
        }
        const response = { ok: true, data: responseData }
        await tx.put('operations', operationId, {
          ownerUid: owner,
          signature,
          response,
          expiresAt: sub.expiresAt,
        })
        return response
      })
    } catch (error) {
      return {
        ok: false,
        code: error.code || 'network',
        message: error.code ? error.message : '伺服器暫時無法確認提醒狀態，請稍後查詢',
      }
    }
  }
  return { dispatch }
}
module.exports = { createService, hash, subIdFor, jobIdFor, publicSubscription, RETENTION_SECONDS }
