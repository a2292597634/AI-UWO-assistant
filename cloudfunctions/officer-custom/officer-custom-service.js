/**
 * 航海士投稿与审核服务。
 *
 * 投稿者只提交人类表单；CanonicalOfficer、状态、审核者与发布记录均由服务端维护。
 * 小程序管理员身份来自服务端白名单，不能由客户端 payload 覆盖。
 */

const { validateImageBuffer } = require('./image-validation')

const MAX_CUSTOM_OFFICERS_PER_USER = 50
const MAX_NAME_LENGTH = 50
const MAX_REJECT_REASON_LENGTH = 500
const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'published'])
const VALID_GROUPS = new Set(['sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5'])
const ACTIVE_GROUPS = new Set(['sk2', 'sk3', 'sk4'])
const VALID_GRADES = new Set(['grade_2', 'grade_3', 'grade_4', 'grade_5', 'grade_6'])
const FORM_KEYS = new Set([
  'name',
  'rarityId',
  'typeId',
  'genderId',
  'jobId',
  'nationalityId',
  'languages',
  'skills',
  'recruitment',
  'portraitFileId',
])
const RECRUITMENT_KEYS = new Set(['cityIds', 'requirementId', 'requiredOfficerIds'])
const REVIEW_KEYS = new Set(['visualGradeId', 'skills'])
const REVIEW_SKILL_KEYS = new Set(['skillId', 'kind', 'sourceGroup', 'slot'])
const ADMIN_ACTIONS = new Set(['listAdmin', 'loadAdmin', 'saveAdmin', 'approve', 'reject'])
const SYNC_ACTIONS = new Set(['listApprovedForSync', 'getPortraitDownloadUrl', 'markPublished'])
const USER_ACTIONS = new Set([
  'submit',
  'resubmit',
  'listMine',
  'loadMine',
  'listCustom',
  'getMyOpenId',
])

const ok = (data) => ({ ok: true, data })
const fail = (code, message) => ({ ok: false, code, message })

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value, allowed) =>
  isPlainObject(value) && Object.keys(value).every((key) => allowed.has(key))

const asTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '')

const uniqueStrings = (value) =>
  Array.isArray(value) &&
  value.every((item) => typeof item === 'string' && item.trim().length > 0) &&
  new Set(value).size === value.length

const referenceSet = (referenceData, key) => new Set(referenceData?.[key] ?? [])

const referenceMatches = (referenceData, key, value, prefix = '') => {
  if (typeof value !== 'string') return false
  const references = referenceSet(referenceData, key)
  if (references.has(value)) return true
  if (!prefix) return false
  if (value.startsWith(prefix) && references.has(value.slice(prefix.length))) return true
  return !value.startsWith(prefix) && references.has(`${prefix}${value}`)
}

const addHistory = (record, action, actorUid, reason = null) => [
  ...(Array.isArray(record.history) ? record.history : []),
  {
    action,
    actorUid,
    reason,
    at: new Date().toISOString(),
    revision: record.revision,
  },
]

const historyRole = (action) => {
  if (action === 'submitted' || action === 'resubmitted') return 'owner'
  if (action === 'published') return 'sync'
  return 'admin'
}

const toClientRecord = (record) => {
  const { ownerUid: _ownerUid, _id: _id, ...clientRecord } = record
  return {
    ...clientRecord,
    review: {
      ...(record.review ?? {}),
      reviewerUid: null,
    },
    history: (Array.isArray(record.history) ? record.history : []).map((entry) => {
      const { actorUid: _actorUid, ...safeEntry } = entry
      return { ...safeEntry, actorRole: historyRole(entry.action) }
    }),
  }
}

const toSummary = (record) => ({
  submissionId: record.submissionId,
  revision: record.revision,
  name: record.formData?.name ?? '',
  portraitFileId: record.formData?.portraitFileId ?? '',
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  status: record.status,
  skillCount: Array.isArray(record.formData?.skills) ? record.formData.skills.length : 0,
  hasRecruitment: Boolean(
    record.formData?.recruitment?.cityIds?.length ||
    record.formData?.recruitment?.requirementId ||
    record.formData?.recruitment?.requiredOfficerIds?.length,
  ),
  rejectReason: record.review?.rejectReason ?? null,
})

const generateSubmissionId = () =>
  `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

const generateUploadToken = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const isAdmin = (openid, adminOpenIds) => Boolean(openid && adminOpenIds.has(openid))

const isSyncAuthorized = (token, expectedToken) =>
  Boolean(expectedToken && typeof token === 'string' && token === expectedToken)

const normalizeFormData = (raw, referenceData, portraitFileId = '') => {
  if (!hasOnlyKeys(raw, FORM_KEYS)) return fail('invalid-data', '投稿資料包含不支援的欄位')

  const name = asTrimmedString(raw.name)
  if (!name) return fail('invalid-data', '缺少航海士名稱')
  if ([...name].length > MAX_NAME_LENGTH) {
    return fail('invalid-data', `名稱不可超過 ${MAX_NAME_LENGTH} 個字元`)
  }

  const fieldReferences = [
    ['rarityId', 'rarityIds', '稀有度', ''],
    ['typeId', 'typeIds', '類型', ''],
    ['genderId', 'genderIds', '性別', ''],
    ['jobId', 'jobIds', '職業', ''],
    ['nationalityId', 'nationalityIds', '國籍', 'nationality_'],
  ]
  const normalizedFields = {}
  for (const [field, referenceKey, label, prefix] of fieldReferences) {
    const value = asTrimmedString(raw[field])
    if (!referenceMatches(referenceData, referenceKey, value, prefix)) {
      return fail('invalid-data', `${label}無效`)
    }
    normalizedFields[field] = value
  }

  if (!Array.isArray(raw.languages) || raw.languages.length === 0) {
    return fail('invalid-data', '請至少提交一種語言能力')
  }
  const languageIds = new Set()
  const languages = []
  for (const language of raw.languages) {
    if (!hasOnlyKeys(language, new Set(['languageId', 'level']))) {
      return fail('invalid-data', '語言資料格式無效')
    }
    const languageId = asTrimmedString(language.languageId)
    if (!referenceMatches(referenceData, 'languageIds', languageId, 'language_')) {
      return fail('invalid-data', '語言無效')
    }
    if (languageIds.has(languageId)) return fail('invalid-data', '語言不可重複')
    if (!Number.isInteger(language.level) || language.level < 1 || language.level > 10) {
      return fail('invalid-data', '語言等級範圍 1-10')
    }
    languageIds.add(languageId)
    languages.push({ languageId, level: language.level })
  }

  if (!Array.isArray(raw.skills) || raw.skills.length === 0) {
    return fail('invalid-data', '請至少提交一項技能')
  }
  const skillIds = new Set()
  const skills = []
  for (const skill of raw.skills) {
    if (!hasOnlyKeys(skill, new Set(['skillId', 'unlockLevel', 'level']))) {
      return fail('invalid-data', '技能資料格式無效')
    }
    const skillId = asTrimmedString(skill.skillId)
    if (!referenceSet(referenceData, 'skillIds').has(skillId)) {
      return fail('invalid-data', '技能無效')
    }
    if (skillIds.has(skillId)) return fail('invalid-data', '技能不可重複')
    if (!Number.isInteger(skill.unlockLevel) || skill.unlockLevel < 1) {
      return fail('invalid-data', '解鎖等級不可小於 1')
    }
    if (!Number.isInteger(skill.level) || skill.level < 1 || skill.level > 100) {
      return fail('invalid-data', '技能等級範圍 1-100')
    }
    skillIds.add(skillId)
    skills.push({ skillId, unlockLevel: skill.unlockLevel, level: skill.level })
  }

  const recruitment = isPlainObject(raw.recruitment)
    ? raw.recruitment
    : { cityIds: [], requirementId: null, requiredOfficerIds: [] }
  if (!hasOnlyKeys(recruitment, RECRUITMENT_KEYS)) {
    return fail('invalid-data', '招募資料格式無效')
  }
  const cityIds = Array.isArray(recruitment.cityIds)
    ? recruitment.cityIds.map((id) => (typeof id === 'string' ? id.trim() : id))
    : (recruitment.cityIds ?? [])
  const requiredOfficerIds = Array.isArray(recruitment.requiredOfficerIds)
    ? recruitment.requiredOfficerIds.map((id) => (typeof id === 'string' ? id.trim() : id))
    : (recruitment.requiredOfficerIds ?? [])
  if (
    !uniqueStrings(cityIds) ||
    !cityIds.every((id) => referenceMatches(referenceData, 'cityIds', id, 'city_'))
  ) {
    return fail('invalid-data', '招募城市無效')
  }
  let requirementId = null
  if (recruitment.requirementId !== undefined && recruitment.requirementId !== null) {
    if (typeof recruitment.requirementId !== 'string') {
      return fail('invalid-data', '招募條件無效')
    }
    requirementId = recruitment.requirementId.trim()
    if (
      requirementId &&
      !referenceMatches(referenceData, 'requirementIds', requirementId, 'requirement_')
    ) {
      return fail('invalid-data', '招募條件無效')
    }
    if (!requirementId) requirementId = null
  }
  if (
    !uniqueStrings(requiredOfficerIds) ||
    !requiredOfficerIds.every((id) => referenceSet(referenceData, 'officerIds').has(id))
  ) {
    return fail('invalid-data', '前置航海士無效')
  }

  return {
    ok: true,
    data: {
      name,
      rarityId: normalizedFields.rarityId,
      typeId: normalizedFields.typeId,
      genderId: normalizedFields.genderId,
      jobId: normalizedFields.jobId,
      nationalityId: normalizedFields.nationalityId,
      languages,
      skills,
      recruitment: {
        cityIds: [...cityIds],
        requirementId,
        requiredOfficerIds: [...requiredOfficerIds],
      },
      portraitFileId: portraitFileId || '',
    },
  }
}

const normalizeReviewFields = (raw, formData) => {
  if (!hasOnlyKeys(raw, REVIEW_KEYS)) return fail('invalid-review', '審核資料格式無效')
  if (!VALID_GRADES.has(raw.visualGradeId)) return fail('invalid-review', '視覺檔位無效')
  if (!Array.isArray(raw.skills) || raw.skills.length !== formData.skills.length) {
    return fail('invalid-review', '審核技能數量與投稿不一致')
  }

  const formSkillIds = new Set(formData.skills.map((skill) => skill.skillId))
  const seenSkillIds = new Set()
  const seenSlots = new Set()
  const skills = []
  for (const skill of raw.skills) {
    if (!hasOnlyKeys(skill, REVIEW_SKILL_KEYS)) return fail('invalid-review', '審核技能格式無效')
    if (!formSkillIds.has(skill.skillId) || seenSkillIds.has(skill.skillId)) {
      return fail('invalid-review', '審核技能清單無效')
    }
    if (skill.kind !== 'active' && skill.kind !== 'passive') {
      return fail('invalid-review', '技能類型無效')
    }
    if (!VALID_GROUPS.has(skill.sourceGroup)) return fail('invalid-review', '技能組別無效')
    const expectedKind = ACTIVE_GROUPS.has(skill.sourceGroup) ? 'active' : 'passive'
    if (skill.kind !== expectedKind) return fail('invalid-review', '技能類型與組別不一致')
    if (!Number.isInteger(skill.slot) || skill.slot < 0) {
      return fail('invalid-review', '技能槽位無效')
    }
    const slotKey = `${skill.sourceGroup}:${skill.slot}`
    if (seenSlots.has(slotKey)) return fail('invalid-review', '同組技能槽位不可重複')
    seenSkillIds.add(skill.skillId)
    seenSlots.add(slotKey)
    skills.push({
      skillId: skill.skillId,
      kind: skill.kind,
      sourceGroup: skill.sourceGroup,
      slot: skill.slot,
    })
  }

  return { ok: true, data: { visualGradeId: raw.visualGradeId, skills } }
}

const buildCanonicalData = (formData, reviewFields, submissionId) => {
  const reviewBySkillId = new Map(reviewFields.skills.map((skill) => [skill.skillId, skill]))
  return {
    id: `officer_custom_${submissionId}`,
    name: formData.name,
    rarityId: formData.rarityId,
    visualGradeId: reviewFields.visualGradeId,
    typeId: formData.typeId,
    genderId: formData.genderId,
    jobId: formData.jobId,
    nationalityId: formData.nationalityId.startsWith('nationality_')
      ? formData.nationalityId
      : `nationality_${formData.nationalityId}`,
    languages: formData.languages.map((language) => ({
      languageId: language.languageId.startsWith('language_')
        ? language.languageId
        : `language_${language.languageId}`,
      level: language.level,
    })),
    skills: formData.skills.map((skill) => {
      const reviewed = reviewBySkillId.get(skill.skillId)
      return {
        skillId: skill.skillId,
        kind: reviewed.kind,
        sourceGroup: reviewed.sourceGroup,
        slot: reviewed.slot,
        unlockLevel: skill.unlockLevel,
        level: skill.level,
      }
    }),
    recruitment: {
      cityIds: formData.recruitment.cityIds.map((id) =>
        id.startsWith('city_') ? id : `city_${id}`,
      ),
      requirementId: formData.recruitment.requirementId
        ? formData.recruitment.requirementId.startsWith('requirement_')
          ? formData.recruitment.requirementId
          : `requirement_${formData.recruitment.requirementId}`
        : null,
      requiredOfficerIds: [...formData.recruitment.requiredOfficerIds],
      note: null,
    },
    portraitId: null,
    displayOrder: 0,
    sourceRefs: { submissionId },
  }
}

const getPortraitPayload = (payload) => {
  if (typeof payload?.portraitBase64 !== 'string' || !payload.portraitBase64) return null
  return {
    base64: payload.portraitBase64,
    mimeType: payload.portraitMimeType,
  }
}

const uploadPortrait = async (cloud, payload, submissionId, revision) => {
  const portrait = getPortraitPayload(payload)
  if (!portrait) return fail('invalid-portrait', '請上傳正式版頭像')
  let buffer
  try {
    buffer = Buffer.from(portrait.base64, 'base64')
  } catch {
    return fail('invalid-portrait', '頭像檔案無效')
  }
  const validation = validateImageBuffer(buffer, portrait.mimeType)
  if (!validation.ok) return validation
  try {
    const result = await cloud.uploadFile({
      cloudPath: `officer-submissions/${submissionId}/revision-${revision}-${generateUploadToken()}.${validation.extension}`,
      fileContent: buffer,
    })
    if (!result?.fileID) return fail('upload-failed', '頭像上傳失敗，請重試')
    return { ok: true, fileID: result.fileID }
  } catch (error) {
    console.error('[officer-custom] portrait upload error:', error)
    return fail('upload-failed', '頭像上傳失敗，請重試')
  }
}

const createOfficerCustomService = (repo, cloud, options = {}) => {
  const adminOpenIds = options.adminOpenIds ?? new Set()
  const syncToken = options.syncToken ?? ''
  const referenceData = options.referenceData ?? {}

  const requireAdmin = (ownerUid) => isAdmin(ownerUid, adminOpenIds)
  const requireSync = (payload) => isSyncAuthorized(payload?.syncToken, syncToken)

  const getOwnedRecord = async (ownerUid, submissionId, revision) => {
    const record =
      revision === undefined
        ? await repo.findLatestBySubmissionId(submissionId)
        : await repo.findBySubmissionIdAndRevision(submissionId, revision)
    if (!record || record.ownerUid !== ownerUid) return null
    return record
  }

  const handleSubmit = async (
    ownerUid,
    payload,
    sourceSubmissionId = null,
    previousRecord = null,
  ) => {
    const normalized = normalizeFormData(
      payload?.formData,
      referenceData,
      previousRecord?.formData?.portraitFileId ?? '',
    )
    if (!normalized.ok) return normalized

    const submissionId = sourceSubmissionId ?? generateSubmissionId()
    const revision = sourceSubmissionId ? (payload.expectedRevision ?? 0) + 1 : 1
    const portraitPayload = getPortraitPayload(payload)
    if (portraitPayload) {
      const portrait = await uploadPortrait(cloud, payload, submissionId, revision)
      if (!portrait.ok) return portrait
      normalized.data.portraitFileId = portrait.fileID
    }
    if (!normalized.data.portraitFileId) return fail('invalid-portrait', '請上傳正式版頭像')
    const now = new Date().toISOString()
    const recordData = {
      submissionId,
      ownerUid,
      status: 'pending',
      revision,
      formData: normalized.data,
      canonicalData: null,
      review: { reviewerUid: null, reviewedAt: null, rejectReason: null },
      publish: { datasetVersion: null, publishedAt: null },
      history: [
        ...(Array.isArray(previousRecord?.history) ? previousRecord.history : []),
        {
          action: sourceSubmissionId ? 'resubmitted' : 'submitted',
          actorUid: ownerUid,
          reason: null,
          at: now,
          revision,
        },
      ],
      createdAt: previousRecord?.createdAt ?? now,
      updatedAt: now,
    }
    const record = sourceSubmissionId
      ? await repo.insertRevisionIfAbsent(recordData)
      : await repo.insertIfOwnerBelowLimit(recordData, MAX_CUSTOM_OFFICERS_PER_USER)
    if (!record) {
      return sourceSubmissionId
        ? fail('conflict', '投稿已被更新，請重新載入')
        : fail('limit-reached', `每位用戶最多提交 ${MAX_CUSTOM_OFFICERS_PER_USER} 位航海士`)
    }
    return ok({
      submissionId: record.submissionId,
      revision: record.revision,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      status: record.status,
      message: '投稿已提交，等待審核',
    })
  }

  const dispatch = async (action, payload = {}, ownerUid) => {
    if (![...USER_ACTIONS, ...ADMIN_ACTIONS, ...SYNC_ACTIONS, 'getAdminStatus'].includes(action)) {
      return fail('unknown-action', `未知操作: ${action}`)
    }
    if (!ownerUid && !SYNC_ACTIONS.has(action)) return fail('unauthenticated', '請先登入')
    if (ADMIN_ACTIONS.has(action) && !requireAdmin(ownerUid)) {
      return fail('forbidden', '只有小程序管理員可以執行此操作')
    }
    if (SYNC_ACTIONS.has(action) && !requireSync(payload)) {
      return fail('forbidden', '同步授權無效')
    }

    switch (action) {
      case 'getAdminStatus':
        return ok({ isAdmin: requireAdmin(ownerUid) })
      case 'getMyOpenId':
        return ok({ openid: ownerUid })
      case 'submit':
        return handleSubmit(ownerUid, payload)
      case 'resubmit': {
        const submissionId = asTrimmedString(payload.submissionId)
        if (!submissionId || !Number.isInteger(payload.expectedRevision)) {
          return fail('invalid-data', '投稿版本資料無效')
        }
        const previous = await getOwnedRecord(ownerUid, submissionId)
        if (!previous || previous.revision !== payload.expectedRevision) {
          return fail('conflict', '投稿已被更新，請重新載入')
        }
        if (previous.status !== 'rejected') return fail('invalid-state', '只有已駁回投稿可以重提')
        return handleSubmit(ownerUid, payload, submissionId, previous)
      }
      case 'listMine':
        return ok((await repo.listByOwner(ownerUid)).map(toSummary))
      case 'loadMine': {
        const record = await getOwnedRecord(
          ownerUid,
          asTrimmedString(payload.submissionId),
          payload.revision,
        )
        return record ? ok(toClientRecord(record)) : fail('not-found', '找不到投稿')
      }
      case 'listCustom':
        return ok(
          (await repo.listLatestByStatus('published'))
            .map((record) => record.canonicalData)
            .filter(Boolean),
        )
      case 'listAdmin': {
        if (!VALID_STATUSES.has(payload.status)) return fail('invalid-status', '投稿狀態無效')
        return ok((await repo.listLatestByStatus(payload.status)).map(toSummary))
      }
      case 'loadAdmin': {
        const record = await repo.findBySubmissionIdAndRevision(
          asTrimmedString(payload.submissionId),
          payload.revision,
        )
        return record ? ok(toClientRecord(record)) : fail('not-found', '找不到投稿')
      }
      case 'saveAdmin': {
        const submissionId = asTrimmedString(payload.submissionId)
        const revision = payload.revision
        const existing = await repo.findBySubmissionIdAndRevision(submissionId, revision)
        if (!existing) return fail('not-found', '找不到投稿')
        if (existing.status !== 'pending' && existing.status !== 'approved') {
          return fail('invalid-state', '目前狀態不可保存修改')
        }
        const normalized = normalizeFormData(
          payload.formData,
          referenceData,
          existing.formData?.portraitFileId ?? '',
        )
        if (!normalized.ok) return normalized
        const review = normalizeReviewFields(payload.reviewFields, normalized.data)
        if (!review.ok) return review
        const portraitPayload = getPortraitPayload(payload)
        if (portraitPayload) {
          const uploaded = await uploadPortrait(cloud, payload, submissionId, revision)
          if (!uploaded.ok) return uploaded
          normalized.data.portraitFileId = uploaded.fileID
        }
        const canonicalData = buildCanonicalData(normalized.data, review.data, submissionId)
        const updated = await repo.updateIfRevision(submissionId, revision, payload.updatedAt, {
          formData: normalized.data,
          canonicalData,
          review: {
            reviewerUid: ownerUid,
            reviewedAt: new Date().toISOString(),
            rejectReason: null,
          },
          history: addHistory(existing, 'admin_saved', ownerUid),
        })
        return updated ? ok(toClientRecord(updated)) : fail('conflict', '投稿已被更新，請重新載入')
      }
      case 'approve': {
        const submissionId = asTrimmedString(payload.submissionId)
        const existing = await repo.findBySubmissionIdAndRevision(submissionId, payload.revision)
        if (!existing) return fail('not-found', '找不到投稿')
        if (existing.status !== 'pending') return fail('invalid-state', '只有待審核投稿可以通過')
        if (!existing.canonicalData) return fail('invalid-state', '請先保存完整的審核資料')
        const updated = await repo.updateIfRevision(
          submissionId,
          payload.revision,
          payload.updatedAt,
          {
            status: 'approved',
            review: {
              reviewerUid: ownerUid,
              reviewedAt: new Date().toISOString(),
              rejectReason: null,
            },
            history: addHistory(existing, 'approved', ownerUid),
          },
        )
        return updated ? ok(toClientRecord(updated)) : fail('conflict', '投稿已被更新，請重新載入')
      }
      case 'reject': {
        const submissionId = asTrimmedString(payload.submissionId)
        const reason = asTrimmedString(payload.rejectReason)
        if (!reason) return fail('reject-reason-required', '請填寫駁回原因')
        if ([...reason].length > MAX_REJECT_REASON_LENGTH) {
          return fail(
            'reject-reason-too-long',
            `駁回原因不可超過 ${MAX_REJECT_REASON_LENGTH} 個字元`,
          )
        }
        const existing = await repo.findBySubmissionIdAndRevision(submissionId, payload.revision)
        if (!existing) return fail('not-found', '找不到投稿')
        if (existing.status !== 'pending') return fail('invalid-state', '只有待審核投稿可以駁回')
        const updated = await repo.updateIfRevision(
          submissionId,
          payload.revision,
          payload.updatedAt,
          {
            status: 'rejected',
            review: {
              reviewerUid: ownerUid,
              reviewedAt: new Date().toISOString(),
              rejectReason: reason,
            },
            history: addHistory(existing, 'rejected', ownerUid, reason),
          },
        )
        return updated ? ok(toClientRecord(updated)) : fail('conflict', '投稿已被更新，請重新載入')
      }
      case 'listApprovedForSync':
        return ok((await repo.listLatestByStatus('approved')).map(toClientRecord))
      case 'getPortraitDownloadUrl': {
        const record = await repo.findBySubmissionIdAndRevision(
          asTrimmedString(payload.submissionId),
          payload.revision,
        )
        if (!record || record.status !== 'approved') return fail('not-found', '找不到可同步的投稿')
        const fileID = record.formData?.portraitFileId
        if (!fileID) return fail('invalid-portrait', '投稿缺少正式版頭像')
        const result = await cloud.getTempFileURL({ fileList: [fileID] })
        const url = result?.fileList?.[0]?.tempFileURL
        if (!url) return fail('portrait-url-failed', '無法取得頭像下載地址')
        return ok({
          submissionId: record.submissionId,
          revision: record.revision,
          tempFileURL: url,
        })
      }
      case 'markPublished': {
        const datasetVersion = asTrimmedString(payload.datasetVersion)
        if (!datasetVersion) return fail('invalid-data', '缺少資料版本')
        const existing = await repo.findBySubmissionIdAndRevision(
          asTrimmedString(payload.submissionId),
          payload.revision,
        )
        if (!existing) return fail('not-found', '找不到投稿')
        if (existing.status !== 'approved')
          return fail('invalid-state', '只有已審核投稿可以標記發布')
        const updated = await repo.updateIfRevision(
          existing.submissionId,
          existing.revision,
          payload.updatedAt ?? existing.updatedAt,
          {
            status: 'published',
            publish: {
              datasetVersion,
              publishedAt: new Date().toISOString(),
            },
            history: addHistory(existing, 'published', 'sync-tool', datasetVersion),
          },
        )
        return updated ? ok(toClientRecord(updated)) : fail('conflict', '投稿已被更新，請重新同步')
      }
      default:
        return fail('unknown-action', `未知操作: ${action}`)
    }
  }

  return { dispatch }
}

module.exports = {
  createOfficerCustomService,
  MAX_CUSTOM_OFFICERS_PER_USER,
  normalizeFormData,
  normalizeReviewFields,
  buildCanonicalData,
  isAdmin,
  isSyncAuthorized,
}
