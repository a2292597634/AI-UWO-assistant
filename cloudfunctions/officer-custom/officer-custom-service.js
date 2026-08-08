/**
 * Custom Officer Service
 *
 * 纯业务规则：数据校验、ID 唯一性、提交上限。
 * 所有 ownerUid 来自云函数入口（服务端上下文），绝不来自客户端。
 */

const MAX_CUSTOM_OFFICERS_PER_USER = 50

// ── 结果封装 ──

/**
 * @template T
 * @param {T} data
 * @returns {{ ok: true, data: T }}
 */
function ok(data) {
  return { ok: true, data }
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {{ ok: false, code: string, message: string }}
 */
function fail(code, message) {
  return { ok: false, code, message }
}

// ── 校验函数 ──

/**
 * 校验 CanonicalOfficer 结构
 * @param {object} data
 * @returns {string|null} 错误消息或 null
 */
function validateCanonicalOfficer(data) {
  if (!data || typeof data !== 'object') {
    return '資料格式無效'
  }

  // 必填字段检查
  if (!data.id || typeof data.id !== 'string') {
    return '缺少航海士 ID'
  }
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    return '缺少航海士名稱'
  }
  if (!data.rarityId || typeof data.rarityId !== 'string') {
    return '缺少稀有度'
  }
  if (!data.typeId || typeof data.typeId !== 'string') {
    return '缺少類型'
  }
  if (!data.genderId || typeof data.genderId !== 'string') {
    return '缺少性別'
  }
  if (!data.jobId || typeof data.jobId !== 'string') {
    return '缺少職業'
  }
  if (!data.nationalityId || typeof data.nationalityId !== 'string') {
    return '缺少國籍'
  }

  // 数组字段检查
  if (!Array.isArray(data.languages)) {
    return '語言列表格式無效'
  }
  if (!Array.isArray(data.skills)) {
    return '技能列表格式無效'
  }
  if (!data.recruitment || typeof data.recruitment !== 'object') {
    return '招募資訊格式無效'
  }
  if (!Array.isArray(data.recruitment.cityIds)) {
    return '招募城市列表格式無效'
  }

  // 技能结构检查
  for (let i = 0; i < data.skills.length; i++) {
    const skill = data.skills[i]
    if (!skill.skillId || typeof skill.skillId !== 'string') {
      return `技能[${i}] 缺少 skillId`
    }
    if (skill.kind !== 'active' && skill.kind !== 'passive') {
      return `技能[${i}] kind 必須是 active 或 passive`
    }
    if (typeof skill.level !== 'number' || skill.level < 1) {
      return `技能[${i}] 等級無效`
    }
  }

  return null
}

// ── 服务工厂 ──

/**
 * @param {object} repo - Repository 实例
 * @returns {object} Service
 */
function createOfficerCustomService(repo, cloud) {
  /**
   * 处理 action 分发
   * @param {string} action
   * @param {object} payload
   * @param {string} ownerUid - 来自服务端上下文
   * @returns {Promise<object>}
   */
  async function dispatch(action, payload, ownerUid) {
    if (!ownerUid) {
      return fail('unauthenticated', '請先登入')
    }

    switch (action) {
      case 'submit':
        return handleSubmit(ownerUid, payload)
      case 'listCustom':
        return handleListCustom()
      default:
        return fail('unknown-action', `未知操作: ${action}`)
    }
  }

  /**
   * 提交新航海士
   */
  async function handleSubmit(ownerUid, payload) {
    const officerId = payload?.officerId
    const canonicalData = payload?.canonicalData
    const portraitBase64 = payload?.portraitBase64

    if (!officerId || typeof officerId !== 'string') {
      return fail('invalid-data', '缺少航海士 ID')
    }

    // 上传头像到云存储（base64 方式，通过云函数中转）
    if (portraitBase64 && typeof portraitBase64 === 'string' && canonicalData) {
      try {
        const uploadResult = await cloud.uploadFile({
          cloudPath: `custom-officers/${officerId}.png`,
          fileContent: Buffer.from(portraitBase64, 'base64'),
        })
        if (uploadResult.fileID) {
          canonicalData.portraitId = uploadResult.fileID
        }
      } catch (err) {
        console.error('[officer-custom] portrait upload error:', err)
        // 头像上传失败不阻塞提交
      }
    }

    // 结构校验
    const validationError = validateCanonicalOfficer(canonicalData)
    if (validationError) {
      return fail('invalid-data', validationError)
    }

    // 全局唯一性检查
    const existing = await repo.findByOfficerId(officerId)
    if (existing) {
      return fail('duplicate', '此航海士 ID 已存在')
    }

    // 用户提交上限
    const count = await repo.countByOwner(ownerUid)
    if (count >= MAX_CUSTOM_OFFICERS_PER_USER) {
      return fail(
        'limit-reached',
        `每位用戶最多提交 ${MAX_CUSTOM_OFFICERS_PER_USER} 位航海士`,
      )
    }

    // 插入记录
    const record = {
      officerId,
      canonicalData,
      ownerUid,
    }
    const saved = await repo.insert(record)

    console.log(
      `[officer-custom] submit: owner=${ownerUid.slice(0, 8)}... officerId=${officerId}`,
    )

    return ok({
      ok: true,
      officerId: saved.officerId,
      message: '航海士已新增',
    })
  }

  /**
   * 列出所有自定义航海士（供运行时合并用）
   */
  async function handleListCustom() {
    const records = await repo.listAll()
    const officers = records.map((r) => r.canonicalData)
    return ok({ officers })
  }

  return { dispatch }
}

module.exports = {
  createOfficerCustomService,
  MAX_CUSTOM_OFFICERS_PER_USER,
  validateCanonicalOfficer,
}
