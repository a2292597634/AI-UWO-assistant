/** 模板與正文只由服務端配置。缺失或型別不符時必須先停用。 */
const AD_UNIT_ID = 'adunit-accfb914625e0bc7'
const PROFILES = [
  { activity: 'thing', start: 'time' },
  { eventType: 'thing', zone: 'thing', start: 'time', lead: 'thing', note: 'thing' },
]
function validFields(fields) {
  return (
    Array.isArray(fields) &&
    PROFILES.some(
      (sources) =>
        fields.length === Object.keys(sources).length &&
        Object.entries(sources).every(
          ([source, type]) =>
            fields.filter(
              (field) =>
                field?.source === source &&
                field.type === type &&
                new RegExp(`^${type}[1-9][0-9]*$`).test(field.key),
            ).length === 1,
        ) &&
        new Set(fields.map((field) => field.key)).size === fields.length,
    )
  )
}
function validateConfig(config = {}) {
  let reason = null
  if (typeof config.templateId !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(config.templateId)) {
    reason = '尚未配置有效的微信訂閱消息模板'
  } else if (!validFields(config.fields)) {
    reason = '微信訂閱消息模板欄位配置不完整或型別無效'
  } else if (!['developer', 'trial', 'formal'].includes(config.miniprogramState)) {
    reason = '尚未配置有效的微信消息跳轉版本'
  }
  return {
    enabled: reason === null,
    reason,
    templateId: reason ? '' : config.templateId,
    adUnitId: AD_UNIT_ID,
  }
}
function configFromEnvironment(env) {
  let fields = []
  try {
    fields = JSON.parse(env.MAJOR_REMINDER_TEMPLATE_FIELDS || '[]')
  } catch {
    /* 無效 JSON 維持停用。 */
  }
  let batchTemplates = []
  try {
    batchTemplates = JSON.parse(env.MAJOR_REMINDER_BATCH_TEMPLATES || '[]')
  } catch {
    /* registry 空窗不影響舊模板。 */
  }
  return {
    batchTemplates,
    templateId: env.MAJOR_REMINDER_TEMPLATE_ID || '',
    fields,
    miniprogramState: env.MAJOR_REMINDER_MINIPROGRAM_STATE || '',
  }
}
function notificationData(config, reference, occurrence, leadSeconds) {
  if (!validateConfig(config).enabled) throw new Error('提醒配置不可用')
  const zone = reference.zones.find((item) => item.id === occurrence.zoneId)?.name
  const eventType = reference.eventTypes.find((item) => item.id === occurrence.eventTypeId)?.name
  const activityLead = { 10800: '3小時', 3600: '1小時', 600: '10分鐘' }[leadSeconds]
  const sources = {
    eventType,
    zone,
    activity:
      zone && eventType && activityLead ? `${zone}·${eventType}預報｜${activityLead}後` : undefined,
    start: new Date((occurrence.triggerAtUnixSeconds + 8 * 3600) * 1000)
      .toISOString()
      .slice(0, 16)
      .replace('T', ' '),
    lead: { 10800: '開始前3小時', 3600: '開始前1小時', 600: '開始前10分鐘' }[leadSeconds],
    note: '依週期預測，實際狀態以遊戲為準',
  }
  const data = {}
  for (const field of config.fields) {
    const value = sources[field.source]
    if (
      typeof value !== 'string' ||
      (field.type === 'thing' && [...value].length > 20) ||
      (field.type === 'time' && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value))
    )
      throw new Error('通知欄位超出微信型別限制')
    data[field.key] = { value }
  }
  return data
}
function sameFields(a, b) {
  const canonical = (fields) =>
    JSON.stringify(
      [...fields]
        .map(({ source, key, type }) => ({ source, key, type }))
        .sort((x, y) => x.source.localeCompare(y.source)),
    )
  return validFields(a) && validFields(b) && canonical(a) === canonical(b)
}
function validateBatchConfig(config = {}) {
  const templates = config.batchTemplates
  const valid =
    Array.isArray(templates) &&
    templates.length === 3 &&
    [10800, 3600, 600].every((lead, i) => {
      const item = templates[i]
      return (
        item?.leadSeconds === lead &&
        typeof item.title === 'string' &&
        item.title.trim().length > 0 &&
        item.title.length <= 100 &&
        validateConfig({ ...config, ...item }).enabled &&
        (item.templateId !== config.templateId || sameFields(item.fields, config.fields))
      )
    }) &&
    new Set(templates.map((t) => t.templateId)).size === 3 &&
    new Set(templates.map((t) => t.title)).size === 3
  return {
    enabled: !!valid,
    reason: valid ? null : '尚未配置完整且相容的三個微信訂閱消息模板',
    adUnitId: AD_UNIT_ID,
    templates: valid
      ? templates.map(({ leadSeconds, templateId, title }) => ({ leadSeconds, templateId, title }))
      : [],
  }
}
/** 舊 primary 優先；registry 空窗不可改寫舊任務正文。 */
function resolveJobConfig(config, templateId) {
  if (templateId === config.templateId && validateConfig(config).enabled) return config
  if (!validateBatchConfig(config).enabled) return null
  const template = config.batchTemplates.find((t) => t.templateId === templateId)
  return template ? { ...config, ...template } : null
}
module.exports = {
  AD_UNIT_ID,
  validateConfig,
  validateBatchConfig,
  resolveJobConfig,
  configFromEnvironment,
  notificationData,
}
