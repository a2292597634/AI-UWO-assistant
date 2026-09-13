/** 航海士資料錯誤回報服務；身份與狀態只由服務端決定。 */

const ERROR_TYPES = new Set([
  'basic',
  'skill',
  'skillLevel',
  'recruitment',
  'portrait',
  'text',
  'other',
])
const STATUSES = new Set(['pending', 'needsInfo', 'accepted', 'fixed', 'rejected'])
const USER_ACTIONS = new Set(['createReport', 'listMyReports', 'appendReportSupplement'])
const ADMIN_ACTIONS = new Set([
  'listReportsForAdmin',
  'requestReportInfo',
  'acceptReport',
  'rejectReport',
  'markReportFixed',
])
const ERROR_REPORT_ACTIONS = new Set([...USER_ACTIONS, ...ADMIN_ACTIONS])

const ok = (data) => ({ ok: true, data })
const fail = (code, message) => ({ ok: false, code, message })
const text = (value) => (typeof value === 'string' ? value.trim() : '')
const clone = (value) => JSON.parse(JSON.stringify(value))
const isStringArray = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim())

const toClient = (record) => {
  const { _id: _id, ownerOpenId: _ownerOpenId, ...safe } = record
  return clone(safe)
}

const historyEntry = (record, action, actorRole, reason = null) => ({
  action,
  actorRole,
  reason,
  at: new Date().toISOString(),
  revision: record.revision,
})

const appendHistory = (record, entry) => [
  ...(Array.isArray(record.history) ? record.history : []),
  entry,
]

const validOptionalUrl = (value) => !text(value) || /^https?:\/\/\S+$/i.test(text(value))

function validateDraft(payload, officerIds) {
  if (!officerIds.has(text(payload.officerId))) return fail('invalid-data', '航海士不存在')
  if (
    !Array.isArray(payload.errorTypes) ||
    payload.errorTypes.length === 0 ||
    payload.errorTypes.some((type) => !ERROR_TYPES.has(type))
  ) {
    return fail('invalid-data', '錯誤類型無效')
  }
  if (!text(payload.description)) return fail('invalid-data', '請填寫錯誤說明')
  if (!text(payload.suggestedCorrection)) return fail('invalid-data', '請填寫建議的正確內容')
  if (!validOptionalUrl(payload.sourceUrl)) return fail('invalid-data', '來源網址格式無效')
  if (!isStringArray(payload.screenshotFileIds ?? []) || payload.screenshotFileIds.length > 3) {
    return fail('invalid-data', '證據截圖格式無效')
  }
  return ok({
    officerId: text(payload.officerId),
    errorTypes: [...new Set(payload.errorTypes)],
    description: text(payload.description),
    suggestedCorrection: text(payload.suggestedCorrection),
    sourceUrl: text(payload.sourceUrl),
    screenshotFileIds: clone(payload.screenshotFileIds ?? []),
    supplement: text(payload.supplement),
  })
}

function createErrorReportService(repo, options) {
  const adminOpenIds = options.adminOpenIds ?? new Set()
  const officerIds = options.officerIds ?? new Set()
  const isAdmin = (openid) => Boolean(openid && adminOpenIds.has(openid))

  async function current(payload) {
    const record = await repo.findByReportId(text(payload.reportId))
    if (!record) return { error: fail('not-found', '找不到錯誤回報') }
    if (record.revision !== payload.revision || record.updatedAt !== payload.updatedAt) {
      return { error: fail('conflict', '錯誤回報已被更新，請重新載入') }
    }
    return { record }
  }

  async function update(payload, expectedStatuses, patch) {
    const loaded = await current(payload)
    if (loaded.error) return loaded.error
    const record = loaded.record
    if (!expectedStatuses.includes(record.status))
      return fail('invalid-state', '目前狀態不可執行此操作')
    const updated = await repo.updateIfCurrent(
      record.reportId,
      payload.revision,
      payload.updatedAt,
      patch(record),
    )
    return updated ? ok(toClient(updated)) : fail('conflict', '錯誤回報已被更新，請重新載入')
  }

  async function dispatch(action, payload = {}, openid) {
    if (!ERROR_REPORT_ACTIONS.has(action)) {
      return fail('unknown-action', `未知操作: ${action}`)
    }
    if (!openid) return fail('unauthenticated', '請先登入')
    if (ADMIN_ACTIONS.has(action) && !isAdmin(openid)) {
      return fail('forbidden', '只有白名單管理員可以執行此操作')
    }

    if (action === 'createReport') {
      const validated = validateDraft(payload, officerIds)
      if (!validated.ok) return validated
      const now = new Date().toISOString()
      const base = {
        ...validated.data,
        reportId: `report_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
        ownerOpenId: openid,
        status: 'pending',
        reviewReply: null,
        fixedDatasetVersion: null,
        supplements: [],
        history: [],
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }
      base.history.push(historyEntry(base, 'created', 'owner'))
      return ok(toClient(await repo.insert(base)))
    }
    if (action === 'listMyReports') {
      return ok((await repo.listByOwner(openid)).map(toClient))
    }
    if (action === 'listReportsForAdmin') {
      if (!STATUSES.has(payload.status)) return fail('invalid-status', '錯誤回報狀態無效')
      return ok((await repo.listByStatus(payload.status)).map(toClient))
    }
    if (action === 'appendReportSupplement') {
      const loaded = await current(payload)
      if (loaded.error) return loaded.error
      const record = loaded.record
      if (record.ownerOpenId !== openid) return fail('not-found', '找不到本人的錯誤回報')
      const supplementText = text(payload.text)
      const sourceUrl = text(payload.sourceUrl)
      const screenshots = payload.screenshotFileIds ?? []
      if (!supplementText && !sourceUrl && screenshots.length === 0) {
        return fail('invalid-data', '請填寫補充內容')
      }
      if (!validOptionalUrl(sourceUrl) || !isStringArray(screenshots) || screenshots.length > 3) {
        return fail('invalid-data', '補充資料格式無效')
      }
      if (record.status !== 'needsInfo') return fail('invalid-state', '目前不需要補充資料')
      const updated = await repo.updateIfCurrent(
        record.reportId,
        payload.revision,
        payload.updatedAt,
        {
          status: 'pending',
          supplements: [
            ...(Array.isArray(record.supplements) ? record.supplements : []),
            {
              text: supplementText,
              sourceUrl,
              screenshotFileIds: clone(screenshots),
              createdAt: new Date().toISOString(),
            },
          ],
          history: appendHistory(record, historyEntry(record, 'supplemented', 'owner')),
        },
      )
      return updated ? ok(toClient(updated)) : fail('conflict', '錯誤回報已被更新，請重新載入')
    }

    const reply = text(payload.reply)
    if ((action === 'requestReportInfo' || action === 'rejectReport') && !reply) {
      return fail('review-reply-required', '請填寫管理員回覆')
    }
    if (action === 'requestReportInfo') {
      return update(payload, ['pending', 'accepted'], (record) => ({
        status: 'needsInfo',
        reviewReply: reply,
        history: appendHistory(record, historyEntry(record, 'infoRequested', 'admin', reply)),
      }))
    }
    if (action === 'acceptReport') {
      return update(payload, ['pending', 'needsInfo'], (record) => ({
        status: 'accepted',
        reviewReply: reply || null,
        history: appendHistory(record, historyEntry(record, 'accepted', 'admin', reply || null)),
      }))
    }
    if (action === 'rejectReport') {
      return update(payload, ['pending', 'needsInfo'], (record) => ({
        status: 'rejected',
        reviewReply: reply,
        history: appendHistory(record, historyEntry(record, 'rejected', 'admin', reply)),
      }))
    }
    const datasetVersion = text(payload.datasetVersion)
    if (!datasetVersion) return fail('dataset-version-required', '請填寫修正資料版本')
    return update(payload, ['accepted'], (record) => ({
      status: 'fixed',
      fixedDatasetVersion: datasetVersion,
      reviewReply: reply || record.reviewReply,
      history: appendHistory(record, historyEntry(record, 'fixed', 'admin', datasetVersion)),
    }))
  }

  return { dispatch }
}

module.exports = {
  createErrorReportService,
  isErrorReportAction: (action) => ERROR_REPORT_ACTIONS.has(action),
  validateDraft,
}
