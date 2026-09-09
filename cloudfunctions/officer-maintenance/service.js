/**
 * 航海士維護工單服務。
 *
 * 管理員權限只信任雲函數入口提供的 OpenID；正式資料引用、候選項、
 * 基準版本與狀態轉換均在伺服端重新驗證。
 */

const VALID_STATUSES = new Set([
  'draft',
  'pendingReview',
  'approvedPendingPublish',
  'published',
  'rejected',
])
const VALID_OPERATIONS = new Set(['createOfficer', 'updateOfficer'])
const VALID_GRADES = new Set(['grade_2', 'grade_3', 'grade_4', 'grade_5', 'grade_6'])
const VALID_GROUPS = new Set(['sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5'])
const VALID_CANDIDATE_KINDS = new Set(['skill', 'job', 'language', 'nationality'])
const USER_ACTIONS = new Set(['saveDraft', 'submit', 'loadMine', 'listMine'])
const ADMIN_ACTIONS = new Set(['listAdmin', 'saveReview', 'approve', 'reject'])
const SYNC_ACTIONS = new Set(['listApprovedForSync', 'markPublished'])

const ok = (data) => ({ ok: true, data })
const fail = (code, message) => ({ ok: false, code, message })
const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const asTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '')
const clone = (value) => JSON.parse(JSON.stringify(value))

const asReferenceSet = (referenceData, key) => new Set(referenceData?.[key] ?? [])
const isReference = (referenceData, key, value) =>
  typeof value === 'string' && asReferenceSet(referenceData, key).has(value)

const historyEntry = (record, action, actorUid, reason = null, extra = {}) => ({
  action,
  actorUid,
  reason,
  at: new Date().toISOString(),
  revision: record.revision,
  snapshot: clone({
    operation: record.operation,
    targetOfficerId: record.targetOfficerId,
    baseDataVersion: record.baseDataVersion,
    baseSnapshot: record.baseSnapshot,
    proposedData: record.proposedData,
    reviewedData: record.reviewedData ?? null,
    referenceCandidates: record.referenceCandidates,
    proposedReferenceCandidates: record.proposedReferenceCandidates ?? record.referenceCandidates,
    portraitFileId: record.portraitFileId ?? null,
    portraitMeta: record.portraitMeta ?? null,
  }),
  ...extra,
})

const appendHistory = (record, entry) => [
  ...(Array.isArray(record.history) ? record.history : []),
  entry,
]

const isValidStringArray = (value) =>
  Array.isArray(value) &&
  value.every((item) => typeof item === 'string' && item.trim().length > 0) &&
  new Set(value).size === value.length

function validateCandidates(candidates, referenceData) {
  if (!Array.isArray(candidates)) return fail('invalid-data', '候選項格式無效')
  const names = new Set()
  const keys = new Set()
  for (const candidate of candidates) {
    if (!isPlainObject(candidate) || !VALID_CANDIDATE_KINDS.has(candidate.kind)) {
      return fail('invalid-data', '候選項類型無效')
    }
    const name = asTrimmedString(candidate.name)
    if (!name) return fail('invalid-data', '候選項名稱不可空白')
    const key = asTrimmedString(candidate.key)
    if (!key || keys.has(key)) return fail('invalid-data', '候選項 key 必須非空且唯一')
    keys.add(key)
    if (!isValidStringArray(candidate.aliases ?? [])) return fail('invalid-data', '候選項別名無效')
    for (const label of [name, ...(candidate.aliases ?? [])]) {
      const nameKey = `${candidate.kind}:${label.trim()}`
      if (names.has(nameKey)) return fail('invalid-data', '同類候選項名稱與別名不可衝突')
      names.add(nameKey)
    }
    if (
      candidate.kind === 'skill' &&
      !isReference(referenceData, 'skillCategoryIds', candidate.categoryId)
    ) {
      return fail('invalid-data', '候選技能必須選擇既有技能分類')
    }
    if (candidate.kind === 'skill' && !asTrimmedString(candidate.description)) {
      return fail('invalid-data', '候選技能說明不可空白')
    }
  }
  return ok(clone(candidates))
}

const candidateReferenceKey = (kind) => (kind === 'skill' ? 'skillIds' : `${kind}Ids`)

const candidateIdsFor = (candidates) => {
  const candidateIds = {}
  for (const candidate of candidates) {
    const key = candidateReferenceKey(candidate.kind)
    const ids = candidateIds[key] ?? new Set()
    ids.add(candidate.key)
    candidateIds[key] = ids
  }
  return candidateIds
}

function validateOfficerData(data, referenceData, candidateIds = {}) {
  if (!isPlainObject(data)) return fail('invalid-data', '航海士資料格式無效')
  const requiredReferences = [
    ['rarityId', 'rarityIds', '稀有度'],
    ['typeId', 'typeIds', '類型'],
    ['genderId', 'genderIds', '性別'],
    ['jobId', 'jobIds', '職業'],
    ['nationalityId', 'nationalityIds', '國籍'],
  ]
  if (!asTrimmedString(data.name)) return fail('invalid-data', '航海士名稱不可空白')
  for (const [field, referenceKey, label] of requiredReferences) {
    if (
      !isReference(referenceData, referenceKey, data[field]) &&
      !candidateIds[referenceKey]?.has(data[field])
    ) {
      return fail('invalid-data', `${label}正式 ID 不存在`)
    }
  }
  if (!VALID_GRADES.has(data.visualGradeId)) return fail('invalid-data', '視覺等級無效')
  if (!Number.isInteger(data.displayOrder) || data.displayOrder < 0) {
    return fail('invalid-data', '顯示排序無效')
  }
  if (data.portraitId !== null && !asTrimmedString(data.portraitId)) {
    return fail('invalid-data', '頭像 ID 無效')
  }
  if (!Array.isArray(data.languages) || !Array.isArray(data.skills)) {
    return fail('invalid-data', '語言或技能資料格式無效')
  }
  const languageIds = new Set()
  for (const language of data.languages) {
    if (
      !isPlainObject(language) ||
      (!isReference(referenceData, 'languageIds', language.languageId) &&
        !candidateIds.languageIds?.has(language.languageId))
    ) {
      return fail('invalid-data', '語言正式 ID 不存在')
    }
    if (
      languageIds.has(language.languageId) ||
      !Number.isInteger(language.level) ||
      language.level < 1
    ) {
      return fail('invalid-data', '語言資料無效')
    }
    languageIds.add(language.languageId)
  }
  const skillIds = new Set()
  const slots = new Set()
  for (const skill of data.skills) {
    if (
      !isPlainObject(skill) ||
      (!isReference(referenceData, 'skillIds', skill.skillId) &&
        !candidateIds.skillIds?.has(skill.skillId))
    ) {
      return fail('invalid-data', '技能正式 ID 不存在')
    }
    if (
      skillIds.has(skill.skillId) ||
      !VALID_GROUPS.has(skill.sourceGroup) ||
      (skill.kind !== 'active' && skill.kind !== 'passive') ||
      !Number.isInteger(skill.slot) ||
      skill.slot < 0 ||
      !Number.isInteger(skill.unlockLevel) ||
      skill.unlockLevel < 1 ||
      !Number.isInteger(skill.level) ||
      skill.level < 1
    ) {
      return fail('invalid-data', '技能資料無效')
    }
    const slotKey = `${skill.sourceGroup}:${skill.slot}`
    if (slots.has(slotKey)) return fail('invalid-data', '技能槽位不可重複')
    skillIds.add(skill.skillId)
    slots.add(slotKey)
  }
  const recruitment = data.recruitment
  if (!isPlainObject(recruitment) || !isValidStringArray(recruitment.cityIds ?? [])) {
    return fail('invalid-data', '招募資料無效')
  }
  if (!recruitment.cityIds.every((id) => isReference(referenceData, 'cityIds', id))) {
    return fail('invalid-data', '招募城市正式 ID 不存在')
  }
  if (
    recruitment.requirementId !== null &&
    !isReference(referenceData, 'requirementIds', recruitment.requirementId)
  ) {
    return fail('invalid-data', '招募條件正式 ID 不存在')
  }
  if (!isValidStringArray(recruitment.requiredOfficerIds ?? [])) {
    return fail('invalid-data', '前置航海士資料無效')
  }
  if (!recruitment.requiredOfficerIds.every((id) => isReference(referenceData, 'officerIds', id))) {
    return fail('invalid-data', '前置航海士正式 ID 不存在')
  }
  return ok(clone(data))
}

function validateWorkOrderContent(workOrder, referenceData) {
  if (!VALID_OPERATIONS.has(workOrder.operation)) return fail('invalid-data', '工單操作類型無效')
  if (workOrder.operation === 'createOfficer') {
    if (
      workOrder.targetOfficerId !== null ||
      workOrder.baseDataVersion !== null ||
      workOrder.baseSnapshot !== null
    ) {
      return fail('invalid-data', '新增工單不可帶入既有航海士基準')
    }
  } else {
    if (!isReference(referenceData, 'officerIds', workOrder.targetOfficerId)) {
      return fail('invalid-data', '修改目標航海士不存在')
    }
    if (!asTrimmedString(workOrder.baseDataVersion) || !isPlainObject(workOrder.baseSnapshot)) {
      return fail('invalid-data', '修改工單缺少基準版本或快照')
    }
  }
  const candidates = validateCandidates(workOrder.referenceCandidates, referenceData)
  if (!candidates.ok) return candidates
  const data = validateOfficerData(
    workOrder.proposedData,
    referenceData,
    candidateIdsFor(candidates.data),
  )
  if (!data.ok) return data
  return candidates
}

function toClientRecord(record) {
  const { _id: _id, ownerUid: _ownerUid, idempotencyKey: _idempotencyKey, ...safe } = record
  return {
    ...clone(safe),
    history: (Array.isArray(record.history) ? record.history : []).map((entry) => {
      const { actorUid: _actorUid, ...clientEntry } = entry
      return {
        ...clientEntry,
        actorRole:
          entry.action === 'draftSaved' ||
          entry.action === 'submitted' ||
          entry.action === 'resubmitted'
            ? 'owner'
            : 'admin',
      }
    }),
  }
}

const generateWorkOrderId = () =>
  `wo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

const matchesCurrentVersion = (record, payload) =>
  record.revision === payload.revision && record.updatedAt === payload.updatedAt

function createOfficerMaintenanceService(repo, options = {}) {
  const adminOpenIds = options.adminOpenIds ?? new Set()
  const syncToken = options.syncToken ?? ''
  const referenceData = options.referenceData ?? {}
  const cloud = options.cloud
  const uploadPortrait = options.uploadPortrait
  const isAdmin = (openid) => Boolean(openid && adminOpenIds.has(openid))
  const isSyncAuthorized = (payload) =>
    Boolean(syncToken && typeof payload?.syncToken === 'string' && payload.syncToken === syncToken)

  const hasPortraitUpload = (payload) =>
    Boolean(
      payload?.portraitUpload ||
      (typeof payload?.portraitBase64 === 'string' && payload.portraitBase64.trim()),
    )

  const uploadNewPortrait = async (payload, workOrderId, revision) => {
    if (!hasPortraitUpload(payload)) return { ok: true, fileID: null, meta: null }
    if (typeof uploadPortrait !== 'function' || !cloud) {
      return fail('upload-failed', '頭像上傳服務尚未就緒，請稍後再試')
    }
    const uploaded = await uploadPortrait(cloud, payload, workOrderId, revision)
    if (!uploaded?.ok || !asTrimmedString(uploaded.fileID)) {
      return uploaded?.ok
        ? fail('upload-failed', '頭像上傳失敗，請重試')
        : (uploaded ?? fail('upload-failed', '頭像上傳失敗，請重試'))
    }
    return uploaded
  }

  async function getOwned(openid, workOrderId) {
    const record = await repo.findByWorkOrderId(workOrderId)
    return record?.ownerUid === openid ? record : null
  }

  async function saveDraft(payload, openid) {
    const workOrderId = asTrimmedString(payload.workOrderId)
    if (!workOrderId) {
      const idempotencyKey = asTrimmedString(payload.idempotencyKey)
      if (!idempotencyKey) return fail('invalid-data', '新增工單保存缺少幂等鍵')
      const existingByIdempotencyKey = await repo.findByOwnerAndIdempotencyKey(
        openid,
        idempotencyKey,
      )
      if (existingByIdempotencyKey) return ok(toClientRecord(existingByIdempotencyKey))

      const newWorkOrderId = generateWorkOrderId()
      const candidate = {
        workOrderId: newWorkOrderId,
        ownerUid: openid,
        idempotencyKey,
        operation: payload.operation,
        targetOfficerId: payload.targetOfficerId ?? null,
        baseDataVersion: payload.baseDataVersion ?? null,
        baseSnapshot: payload.baseSnapshot ?? null,
        proposedData: payload.proposedData,
        reviewedData: null,
        referenceCandidates: payload.referenceCandidates ?? [],
        proposedReferenceCandidates: payload.referenceCandidates ?? [],
        portraitFileId: null,
        portraitMeta: null,
        status: 'draft',
        revision: 1,
        history: [],
      }
      const content = validateWorkOrderContent(candidate, referenceData)
      if (!content.ok) return content
      const uploaded = await uploadNewPortrait(payload, newWorkOrderId, 1)
      if (!uploaded.ok) return uploaded
      candidate.portraitFileId = uploaded.fileID
      candidate.portraitMeta = uploaded.meta ?? null
      const now = new Date().toISOString()
      candidate.history = [historyEntry({ ...candidate, revision: 1 }, 'draftSaved', openid)]
      const stored = await repo.insert({ ...candidate, createdAt: now, updatedAt: now })
      return ok(toClientRecord(stored))
    }

    const existing = await getOwned(openid, workOrderId)
    if (!existing) return fail('not-found', '找不到本人工單')
    if (!matchesCurrentVersion(existing, payload)) {
      return fail('conflict', '工單已被更新，請重新載入')
    }
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      return fail('invalid-state', '目前狀態不可保存草稿')
    }
    if (
      payload.operation !== existing.operation ||
      (payload.targetOfficerId ?? null) !== existing.targetOfficerId
    ) {
      return fail('invalid-data', '工單操作與目標航海士不可變更')
    }
    const candidate = {
      ...existing,
      baseDataVersion: payload.baseDataVersion ?? null,
      baseSnapshot: payload.baseSnapshot ?? null,
      proposedData: payload.proposedData,
      referenceCandidates: payload.referenceCandidates ?? [],
      portraitFileId: existing.portraitFileId ?? null,
      portraitMeta: existing.portraitMeta ?? null,
    }
    const content = validateWorkOrderContent(candidate, referenceData)
    if (!content.ok) return content
    const uploaded = await uploadNewPortrait(payload, existing.workOrderId, existing.revision + 1)
    if (!uploaded.ok) return uploaded
    if (uploaded.fileID) {
      candidate.portraitFileId = uploaded.fileID
      candidate.portraitMeta = uploaded.meta ?? null
    }
    const updated = await repo.updateIfCurrent(workOrderId, payload.revision, payload.updatedAt, {
      status: 'draft',
      baseDataVersion: candidate.baseDataVersion,
      baseSnapshot: clone(candidate.baseSnapshot),
      proposedData: clone(candidate.proposedData),
      referenceCandidates: clone(candidate.referenceCandidates),
      portraitFileId: candidate.portraitFileId,
      portraitMeta: candidate.portraitMeta,
      proposedReferenceCandidates: clone(candidate.referenceCandidates),
      reviewedData: null,
      history: appendHistory(existing, historyEntry(existing, 'draftSaved', openid)),
    })
    return updated ? ok(toClientRecord(updated)) : fail('conflict', '工單已被更新，請重新載入')
  }

  async function submit(payload, openid) {
    const workOrderId = asTrimmedString(payload.workOrderId)
    const existing = await getOwned(openid, workOrderId)
    if (!existing) return fail('not-found', '找不到本人工單')
    if (!matchesCurrentVersion(existing, payload)) {
      return fail('conflict', '工單已被更新，請重新載入')
    }
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      return fail('invalid-state', '只有草稿或已駁回工單可以送審')
    }
    if (existing.operation === 'createOfficer' && !asTrimmedString(existing.portraitFileId)) {
      return fail('invalid-portrait', '請上傳正式版頭像')
    }
    const content = validateWorkOrderContent(existing, referenceData)
    if (!content.ok) return content
    const action = existing.history.some((entry) => entry.action === 'submitted')
      ? 'resubmitted'
      : 'submitted'
    const updated = await repo.updateIfCurrent(workOrderId, payload.revision, payload.updatedAt, {
      status: 'pendingReview',
      history: appendHistory(existing, historyEntry(existing, action, openid)),
    })
    return updated ? ok(toClientRecord(updated)) : fail('conflict', '工單已被更新，請重新載入')
  }

  async function saveReview(payload, openid) {
    const existing = await repo.findByWorkOrderId(asTrimmedString(payload.workOrderId))
    if (!existing) return fail('not-found', '找不到工單')
    if (!matchesCurrentVersion(existing, payload)) {
      return fail('conflict', '工單已被更新，請重新載入')
    }
    if (existing.status !== 'pendingReview')
      return fail('invalid-state', '只有待審核工單可保存審核')
    const candidates = validateCandidates(
      payload.referenceCandidates === undefined
        ? existing.referenceCandidates
        : payload.referenceCandidates,
      referenceData,
    )
    if (!candidates.ok) return candidates
    const reviewed = validateOfficerData(
      payload.reviewedData,
      referenceData,
      candidateIdsFor(candidates.data),
    )
    if (!reviewed.ok) return reviewed
    const reason = asTrimmedString(payload.reason)
    if (!reason) return fail('review-reason-required', '請填寫本次修訂原因')
    const updated = await repo.updateIfCurrent(
      existing.workOrderId,
      payload.revision,
      payload.updatedAt,
      {
        reviewedData: reviewed.data,
        referenceCandidates: candidates.data,
        proposedReferenceCandidates: clone(
          existing.proposedReferenceCandidates ?? existing.referenceCandidates,
        ),
        history: appendHistory(
          existing,
          historyEntry(existing, 'reviewSaved', openid, reason, {
            proposedData: clone(existing.proposedData),
            reviewedData: clone(reviewed.data),
            referenceCandidates: clone(candidates.data),
          }),
        ),
      },
    )
    return updated ? ok(toClientRecord(updated)) : fail('conflict', '工單已被更新，請重新載入')
  }

  async function approve(payload, openid) {
    const existing = await repo.findByWorkOrderId(asTrimmedString(payload.workOrderId))
    if (!existing) return fail('not-found', '找不到工單')
    if (!matchesCurrentVersion(existing, payload)) {
      return fail('conflict', '工單已被更新，請重新載入')
    }
    if (existing.status !== 'pendingReview' || !existing.reviewedData) {
      return fail('invalid-state', '只有已保存審核資料的待審核工單可以核准')
    }
    if (existing.operation === 'createOfficer' && !asTrimmedString(existing.portraitFileId)) {
      return fail('invalid-portrait', '新增航海士核准前必須有正式版頭像')
    }
    const content = validateWorkOrderContent(existing, referenceData)
    if (!content.ok) return content
    if (
      existing.operation === 'updateOfficer' &&
      existing.baseDataVersion !== referenceData.dataVersion
    ) {
      return fail('base-version-conflict', '正式資料版本已更新，請重新比對後保存審核')
    }
    const candidates = validateCandidates(existing.referenceCandidates, referenceData)
    if (!candidates.ok) return candidates
    const reviewed = validateOfficerData(
      existing.reviewedData,
      referenceData,
      candidateIdsFor(candidates.data),
    )
    if (!reviewed.ok) return reviewed
    const updated = await repo.updateIfCurrent(
      existing.workOrderId,
      payload.revision,
      payload.updatedAt,
      {
        status: 'approvedPendingPublish',
        history: appendHistory(existing, historyEntry(existing, 'approved', openid)),
      },
    )
    return updated ? ok(toClientRecord(updated)) : fail('conflict', '工單已被更新，請重新載入')
  }

  async function reject(payload, openid) {
    const existing = await repo.findByWorkOrderId(asTrimmedString(payload.workOrderId))
    if (!existing) return fail('not-found', '找不到工單')
    if (!matchesCurrentVersion(existing, payload)) {
      return fail('conflict', '工單已被更新，請重新載入')
    }
    if (existing.status !== 'pendingReview') return fail('invalid-state', '只有待審核工單可以駁回')
    const reason = asTrimmedString(payload.reason)
    if (!reason) return fail('reject-reason-required', '請填寫駁回原因')
    const updated = await repo.updateIfCurrent(
      existing.workOrderId,
      payload.revision,
      payload.updatedAt,
      {
        status: 'rejected',
        history: appendHistory(existing, historyEntry(existing, 'rejected', openid, reason)),
      },
    )
    return updated ? ok(toClientRecord(updated)) : fail('conflict', '工單已被更新，請重新載入')
  }

  async function markPublished(payload) {
    const existing = await repo.findByWorkOrderId(asTrimmedString(payload.workOrderId))
    if (!existing) return fail('not-found', '找不到工單')
    if (!matchesCurrentVersion(existing, payload)) {
      return fail('conflict', '工單已被更新，請重新載入')
    }
    if (existing.status !== 'approvedPendingPublish') {
      return fail('invalid-state', '只有待發布核准工單可以標記發布')
    }
    const datasetVersion = asTrimmedString(payload.datasetVersion)
    if (!datasetVersion) return fail('invalid-data', '缺少資料集版本')
    const updated = await repo.updateIfCurrent(
      existing.workOrderId,
      payload.revision,
      payload.updatedAt,
      {
        status: 'published',
        publishedDatasetVersion: datasetVersion,
        history: appendHistory(
          existing,
          historyEntry(existing, 'published', 'sync-tool', datasetVersion),
        ),
      },
    )
    return updated ? ok(toClientRecord(updated)) : fail('conflict', '工單已被更新，請重新載入')
  }

  async function dispatch(action, payload = {}, openid) {
    if (![...USER_ACTIONS, ...ADMIN_ACTIONS, ...SYNC_ACTIONS].includes(action)) {
      return fail('unknown-action', `未知操作: ${action}`)
    }
    if (USER_ACTIONS.has(action) && !openid) return fail('unauthenticated', '請先登入')
    if (ADMIN_ACTIONS.has(action) && !isAdmin(openid)) {
      return fail('forbidden', '只有白名單管理員可以執行此操作')
    }
    if (SYNC_ACTIONS.has(action) && !isSyncAuthorized(payload)) {
      return fail('forbidden', '同步授權無效')
    }
    switch (action) {
      case 'saveDraft':
        return saveDraft(payload, openid)
      case 'submit':
        return submit(payload, openid)
      case 'loadMine': {
        const record = await getOwned(openid, asTrimmedString(payload.workOrderId))
        return record ? ok(toClientRecord(record)) : fail('not-found', '找不到本人工單')
      }
      case 'listMine':
        return ok((await repo.listByOwner(openid)).map(toClientRecord))
      case 'listAdmin': {
        if (!VALID_STATUSES.has(payload.status)) return fail('invalid-status', '工單狀態無效')
        return ok((await repo.listByStatus(payload.status)).map(toClientRecord))
      }
      case 'saveReview':
        return saveReview(payload, openid)
      case 'approve':
        return approve(payload, openid)
      case 'reject':
        return reject(payload, openid)
      case 'listApprovedForSync':
        return ok((await repo.listByStatus('approvedPendingPublish')).map(toClientRecord))
      case 'markPublished':
        return markPublished(payload)
      default:
        return fail('unknown-action', `未知操作: ${action}`)
    }
  }

  return { dispatch }
}

module.exports = {
  createOfficerMaintenanceService,
  validateOfficerData,
  validateCandidates,
  validateWorkOrderContent,
}
