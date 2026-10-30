const { createHash, randomUUID } = require('node:crypto')
const { validOccurrence } = require('./shared/policy')
const {
  validateConfig,
  validateBatchConfig,
  resolveJobConfig,
  notificationData,
} = require('./shared/config')
const lockIdFor = (owner, template) =>
  createHash('sha256')
    .update(JSON.stringify([owner, template]))
    .digest('hex')
const PROTECTED = ['pending', 'sending', 'unknown']
const TERMINAL = ['sent', 'failed', 'missed', 'cancelled']
function safeDeliveryDiagnostic(error) {
  const value = error && typeof error === 'object' ? error : {}
  const code = value.errCode ?? value.errcode
  const errCode = Number.isSafeInteger(code) ? code : undefined
  const networkCode = [
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EPIPE',
  ].includes(value.code)
    ? value.code
    : undefined
  // 僅辨認固定 SDK 錯誤類別；原文不儲存，也不影響重試判斷。
  const message =
    typeof value.errMsg === 'string'
      ? value.errMsg
      : typeof value.message === 'string'
        ? value.message
        : ''
  const reason = /missing wxCloudApiToken/i.test(message)
    ? 'missing-wx-cloud-api-token'
    : [48001, 48002].includes(errCode)
      ? 'permission-denied'
      : networkCode
        ? 'network-error'
        : errCode !== undefined
          ? 'sdk-error'
          : 'unknown'
  return {
    reason,
    ...(errCode !== undefined ? { errCode } : {}),
    ...(networkCode ? { networkCode } : {}),
  }
}
function createWorker(
  repo,
  {
    reference,
    fingerprint,
    config,
    send,
    now = () => Math.floor(Date.now() / 1000),
    timeoutMilliseconds = 20000,
  },
) {
  async function updateSlot(tx, job, status) {
    const sub = await tx.get('subscriptions', job.subId)
    if (!sub) return
    const slot = sub.slots.find((item) => item.leadSeconds === job.leadSeconds)
    if (slot && slot.generation === job.generation) {
      slot.status = status
      sub.version += 1
      sub.cleanupEligible = !sub.slots.some((item) => PROTECTED.includes(item.status))
      await tx.put('subscriptions', job.subId, sub)
    }
  }
  async function claim(id, deferOnly = false) {
    const attemptId = randomUUID()
    return repo.transaction(async (tx) => {
      const job = await tx.get('jobs', id)
      const time = now()
      if (!job || job.status !== 'pending' || job.nextRunAt > time) return null
      const sub = await tx.get('subscriptions', job.subId)
      const slot = sub?.slots.find((item) => item.leadSeconds === job.leadSeconds)
      let excluded = null
      if (
        !sub ||
        !sub.adCompleted ||
        slot?.status !== 'pending' ||
        slot.generation !== job.generation ||
        sub.ownerUid !== job.ownerUid
      )
        excluded = 'cancelled'
      else if (
        job.fingerprint !== fingerprint ||
        sub.fingerprint !== fingerprint ||
        !validOccurrence(reference, job.occurrence)
      )
        excluded = 'failed'
      else if (time > job.dueAt + 300 || time >= job.occurrence.triggerAtUnixSeconds)
        excluded = 'missed'
      if (excluded) {
        job.status = excluded
        job.resultCode = excluded === 'failed' ? 'data-changed' : excluded
        job.updatedAt = time
        await tx.put('jobs', id, job)
        // 掃描後槽可能已被另一交易更新；不能用舊pending任務覆寫其在途／終態。
        if (slot?.status === 'pending') await updateSlot(tx, job, excluded)
        return null
      }
      // 缺registry仍先核對狀態及窗口，保留有效pending並讓出全域掃描首批。
      if (!resolveJobConfig(config, job.templateId)) {
        job.nextRunAt = Math.min(time + 30, job.dueAt + 301, job.occurrence.triggerAtUnixSeconds)
        job.updatedAt = time
        await tx.put('jobs', id, job)
        return null
      }
      if (deferOnly) return null
      const lockId = lockIdFor(job.ownerUid, job.templateId)
      const lock = await tx.get('locks', lockId)
      // 部署必須限制函數最長執行60秒；120秒隔離期後只准不同 job 繼續。
      // 原 unknown 永不回 pending；這不是利用租約重試原來的微信請求。
      if (lock) {
        if (!Number.isFinite(lock.blockedUntil) || lock.blockedUntil > time) return null
        const previous = await tx.get('jobs', lock.jobId)
        if (previous?.status === 'sending') {
          previous.status = 'unknown'
          previous.resultCode = 'lease-expired'
          previous.updatedAt = time
          await tx.put('jobs', lock.jobId, previous)
          await updateSlot(tx, previous, 'unknown')
        }
      }
      job.status = 'sending'
      job.attemptId = attemptId
      job.claimEpoch = sub.epoch
      job.attempts += 1
      job.startedAt = time
      job.leaseUntil = time + 120
      job.nextRunAt = job.leaseUntil
      job.updatedAt = time
      await tx.put('locks', lockId, {
        ownerUid: job.ownerUid,
        templateId: job.templateId,
        jobId: id,
        attemptId,
        status: 'sending',
        leaseUntil: job.leaseUntil,
        blockedUntil: job.leaseUntil,
        expiresAt: job.expiresAt,
      })
      await tx.put('jobs', id, job)
      await updateSlot(tx, job, 'sending')
      return { ...job, lockId }
    })
  }
  async function staleSending(id) {
    return repo.transaction(async (tx) => {
      const job = await tx.get('jobs', id)
      if (!job || job.status !== 'sending' || job.leaseUntil > now()) return
      job.status = 'unknown'
      job.resultCode = 'lease-expired'
      job.updatedAt = now()
      await tx.put('jobs', id, job)
      await updateSlot(tx, job, 'unknown')
      const lockId = lockIdFor(job.ownerUid, job.templateId)
      const lock = await tx.get('locks', lockId)
      if (!lock || lock.jobId === id)
        await tx.put('locks', lockId, {
          ...(lock || {}),
          jobId: id,
          attemptId: job.attemptId,
          status: 'unknown',
          blockedUntil: job.leaseUntil,
        })
    })
  }
  async function finish(job, response, internalStatus = null, diagnostic = null) {
    await repo.transaction(async (tx) => {
      const current = await tx.get('jobs', job.id)
      if (
        !current ||
        current.attemptId !== job.attemptId ||
        !['sending', 'unknown'].includes(current.status)
      )
        return
      const time = now()
      const code = response?.errcode ?? response?.errCode
      const sub = await tx.get('subscriptions', current.subId)
      const cancelledDuringSend = !sub || sub.epoch !== current.claimEpoch
      let status =
        internalStatus ||
        (typeof code === 'number' && Number.isInteger(code)
          ? code === 0
            ? 'sent'
            : 'failed'
          : 'unknown')
      if (
        !cancelledDuringSend &&
        [-1, 45009].includes(code) &&
        current.attempts < 3 &&
        time + 30 <= current.dueAt + 300 &&
        time + 30 < current.occurrence.triggerAtUnixSeconds
      ) {
        status = 'pending'
        current.nextRunAt = time + 30
      }
      // 已明確未受理時遵守發送期間的取消；sent／unknown 仍不能宣稱撤回。
      if (
        cancelledDuringSend &&
        !internalStatus &&
        typeof code === 'number' &&
        Number.isInteger(code) &&
        code !== 0
      )
        status = 'cancelled'
      current.status = status
      current.resultCode = internalStatus ? response.reason : (code ?? 'network-unknown')
      current.updatedAt = time
      if (diagnostic) current.deliveryDiagnostic = diagnostic
      await tx.put('jobs', current.id, current)
      await updateSlot(tx, current, status)
      const lock = await tx.get('locks', job.lockId)
      if (lock?.attemptId === job.attemptId) {
        if (status === 'unknown') await tx.put('locks', job.lockId, { ...lock, status: 'unknown' })
        else await tx.remove('locks', job.lockId)
      }
    })
  }
  async function deliver(job) {
    // 領取後進程暫停超過租約／窗口時不再進入外部 API。
    if (
      now() >= job.leaseUntil ||
      now() > job.dueAt + 300 ||
      now() >= job.occurrence.triggerAtUnixSeconds
    ) {
      await finish(job, { reason: 'window-expired-before-send' }, 'missed')
      return
    }
    const jobConfig = resolveJobConfig(config, job.templateId)
    let data
    try {
      data = notificationData(jobConfig, reference, job.occurrence, job.leadSeconds)
    } catch {
      await finish(job, { reason: 'invalid-template-data' }, 'failed')
      return
    }
    let timer
    let response
    let diagnostic = null
    try {
      response = await Promise.race([
        send({
          touser: job.ownerUid,
          templateId: job.templateId,
          page: `subpkg-trade/pages/popularity/index?zoneId=${encodeURIComponent(job.occurrence.zoneId)}&eventTypeId=${encodeURIComponent(job.occurrence.eventTypeId)}&triggerAtUnixSeconds=${job.occurrence.triggerAtUnixSeconds}`,
          miniprogramState: jobConfig.miniprogramState,
          lang: 'zh_TW',
          data,
        }),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMilliseconds)
        }),
      ])
    } catch (error) {
      // 拋出例外不能證明微信未受理，不解析錯誤字串來推測是否可重送。
      response = null
      diagnostic = safeDeliveryDiagnostic(error)
    } finally {
      clearTimeout(timer)
    }
    await finish(job, response, null, diagnostic)
  }
  async function cleanup() {
    const time = now()
    let deleted = 0
    for (const collection of ['operations', 'sessions', 'jobs', 'subscriptions', 'locks']) {
      const records = []
      // 依終態索引查詢，避免大量永不清理的 unknown 佔滿前50筆。
      const filters =
        collection === 'jobs'
          ? TERMINAL.map((status) => ({ status }))
          : collection === 'subscriptions'
            ? [{ cleanupEligible: true }]
            : [{}]
      for (const filter of filters) {
        if (records.length >= 50) break
        records.push(
          ...(await repo.scan(
            collection,
            { ...filter, expiresAt: { lte: time } },
            'expiresAt',
            50 - records.length,
          )),
        )
      }
      for (const row of records) {
        await repo.transaction(async (tx) => {
          const record = await tx.get(collection, row._id)
          if (!record || record.expiresAt > time) return
          if (collection === 'jobs' && !TERMINAL.includes(record.status)) return
          if (
            collection === 'subscriptions' &&
            record.slots.some((slot) => PROTECTED.includes(slot.status))
          )
            return
          if (collection === 'locks' && record.blockedUntil > time) return
          await tx.remove(collection, row._id)
          deleted += 1
        })
      }
    }
    return { deleted }
  }
  async function run() {
    if (!validateConfig(config).enabled && !validateBatchConfig(config).enabled)
      return { enabled: false, claimed: 0 }
    const time = now()
    const stale = await repo.scan(
      'jobs',
      { status: 'sending', nextRunAt: { lte: time } },
      'nextRunAt',
      50,
    )
    for (const row of stale) await staleSending(row._id)
    const pending = await repo.scan(
      'jobs',
      { status: 'pending', nextRunAt: { lte: time } },
      'nextRunAt',
      50,
    )
    // 可解析模板各自有界查詢，避免再多未知模板積壓遮蔽legacy／其他有效模板。
    // 全域首批仍負責未知模板的延後與過窗清理；每次最多讀取5批各50筆。
    const templateIds = new Set([
      ...(validateConfig(config).enabled ? [config.templateId] : []),
      ...validateBatchConfig(config).templates.map((template) => template.templateId),
    ])
    const candidates = new Map()
    for (const row of pending) {
      if (resolveJobConfig(config, row.templateId)) candidates.set(row._id, row)
      else await claim(row._id, true)
    }
    for (const templateId of templateIds) {
      const rows = await repo.scan(
        'jobs',
        { status: 'pending', templateId, nextRunAt: { lte: time } },
        'nextRunAt',
        50,
      )
      for (const row of rows) candidates.set(row._id, row)
    }
    // 每輪每個用戶模板最多發一次，避免一輪長時間佔用以及鎖釋放後搶第二項。
    const seen = new Set()
    let claimed = 0
    const ready = [...candidates.values()].sort((a, b) => a.nextRunAt - b.nextRunAt).slice(0, 50)
    for (const row of ready) {
      const identity = lockIdFor(row.ownerUid, row.templateId)
      if (seen.has(identity)) continue
      const job = await claim(row._id)
      if (!job) continue
      seen.add(identity)
      claimed += 1
      await deliver(job)
    }
    return { enabled: true, claimed }
  }
  return { run, cleanup }
}
module.exports = { createWorker }
