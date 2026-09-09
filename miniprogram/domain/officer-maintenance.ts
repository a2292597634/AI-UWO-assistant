import type {
  MaintenanceOfficerData,
  MaintenanceValidationContext,
  MaintenanceValidationError,
  MaintenanceWorkOrderDiffEntry,
  MaintenanceWorkOrderDraft,
  ReadonlyDeep,
  ReferenceCandidate,
} from '../contracts/officer-maintenance'

const VISUAL_GRADE_IDS = new Set(['grade_2', 'grade_3', 'grade_4', 'grade_5', 'grade_6'])
const VALID_CANDIDATE_KINDS = new Set(['skill', 'job', 'language', 'nationality'])
const VALID_SKILL_KINDS = new Set(['active', 'passive'])
const VALID_SKILL_SOURCE_GROUPS = new Set(['sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5'])

const OFFICER_DATA_FIELDS: readonly (keyof MaintenanceOfficerData)[] = [
  'name',
  'rarityId',
  'visualGradeId',
  'typeId',
  'genderId',
  'jobId',
  'nationalityId',
  'languages',
  'skills',
  'recruitment',
  'portraitId',
  'displayOrder',
  'maintenanceNote',
]

const hasValue = (value: string | null): value is string =>
  value !== null && value.trim().length > 0

const normalizeLabel = (value: string): string => value.normalize('NFKC').trim().toLocaleLowerCase()

const dictionaryIds = (items: readonly { id: string }[]): ReadonlySet<string> =>
  new Set(items.map((item) => item.id))

const pushUnknownReference = (
  errors: MaintenanceValidationError[],
  field: string,
  id: string,
  validIds: ReadonlySet<string>,
  message: string,
  candidateIds: ReadonlySet<string> = new Set(),
): void => {
  if (!validIds.has(id) && !candidateIds.has(id)) errors.push({ field, message })
}

const validateReferenceCandidate = (
  candidate: ReferenceCandidate,
  index: number,
  skillCategoryIds: ReadonlySet<string>,
  seenNames: Set<string>,
  seenLabels: Set<string>,
  seenKeys: Set<string>,
  errors: MaintenanceValidationError[],
): void => {
  const field = `referenceCandidates[${index}]`
  if (!VALID_CANDIDATE_KINDS.has(candidate.kind)) {
    errors.push({ field: `${field}.kind`, message: '候選項類型無效' })
    return
  }

  if (typeof candidate.key !== 'string' || !normalizeLabel(candidate.key)) {
    errors.push({ field: `${field}.key`, message: '候選項 key 不可空白' })
  } else {
    const normalizedKey = normalizeLabel(candidate.key)
    if (seenKeys.has(normalizedKey)) {
      errors.push({ field: `${field}.key`, message: '候選項 key 不可重複' })
    }
    seenKeys.add(normalizedKey)
  }

  if (
    !Array.isArray(candidate.aliases) ||
    candidate.aliases.some((label) => typeof label !== 'string')
  ) {
    errors.push({ field: `${field}.aliases`, message: '候選項別名格式無效' })
    return
  }

  const normalizedName = typeof candidate.name === 'string' ? normalizeLabel(candidate.name) : ''
  const categoryId = typeof candidate.categoryId === 'string' ? candidate.categoryId.trim() : ''

  if (!normalizedName) {
    errors.push({ field: `${field}.name`, message: '請輸入候選項名稱' })
  } else {
    const duplicateKey = `${candidate.kind}:${normalizedName}`
    if (seenNames.has(duplicateKey)) {
      errors.push({ field: `${field}.name`, message: '同類候選項名稱不可重複' })
    }
    seenNames.add(duplicateKey)
  }

  for (const [labelIndex, label] of [
    typeof candidate.name === 'string' ? candidate.name : '',
    ...candidate.aliases,
  ].entries()) {
    const normalizedLabel = normalizeLabel(label)
    if (!normalizedLabel) continue
    const labelKey = `${candidate.kind}:${normalizedLabel}`
    if (seenLabels.has(labelKey)) {
      errors.push({
        field: labelIndex === 0 ? `${field}.name` : `${field}.aliases`,
        message: '同類候選項名稱與別名不可衝突',
      })
    }
    seenLabels.add(labelKey)
  }

  if (candidate.kind === 'skill') {
    if (!categoryId || !skillCategoryIds.has(categoryId)) {
      errors.push({ field: `${field}.categoryId`, message: '請選擇既有技能分類' })
    }
  }
}

/** 校驗草稿所引用的全部既有正式 ID 與候選項。 */
export const validateMaintenanceDraft = (
  draft: MaintenanceWorkOrderDraft,
  context: MaintenanceValidationContext,
): readonly MaintenanceValidationError[] => {
  const errors: MaintenanceValidationError[] = []
  const { dictionaries, skills, officers } = context
  const officerIds = new Set(officers.map((officer) => officer.id))

  if (draft.operation !== 'createOfficer' && draft.operation !== 'updateOfficer') {
    errors.push({ field: 'operation', message: '操作類型無效' })
  }

  if (draft.operation === 'createOfficer') {
    if (hasValue(draft.targetOfficerId)) {
      errors.push({ field: 'targetOfficerId', message: '新增工單不可指定目標航海士' })
    }
  } else if (!hasValue(draft.targetOfficerId)) {
    errors.push({ field: 'targetOfficerId', message: '請選擇既有航海士' })
  } else if (!officerIds.has(draft.targetOfficerId)) {
    errors.push({ field: 'targetOfficerId', message: '航海士不存在' })
  }

  const data = draft.proposedData
  const candidateIdsByKind = new Map<ReferenceCandidate['kind'], Set<string>>()
  for (const candidate of draft.referenceCandidates) {
    if (!VALID_CANDIDATE_KINDS.has(candidate.kind) || typeof candidate.key !== 'string') continue
    const ids = candidateIdsByKind.get(candidate.kind) ?? new Set<string>()
    ids.add(candidate.key)
    candidateIdsByKind.set(candidate.kind, ids)
  }
  if (!Number.isInteger(data.displayOrder) || data.displayOrder < 0) {
    errors.push({ field: 'proposedData.displayOrder', message: '顯示排序必須為非負整數' })
  }
  pushUnknownReference(
    errors,
    'proposedData.rarityId',
    data.rarityId,
    dictionaryIds(dictionaries.rarities),
    '稀有度不存在',
  )
  pushUnknownReference(
    errors,
    'proposedData.typeId',
    data.typeId,
    dictionaryIds(dictionaries.types),
    '類型不存在',
  )
  pushUnknownReference(
    errors,
    'proposedData.genderId',
    data.genderId,
    dictionaryIds(dictionaries.genders),
    '性別不存在',
  )
  pushUnknownReference(
    errors,
    'proposedData.jobId',
    data.jobId,
    dictionaryIds(dictionaries.jobs),
    '職業不存在',
    candidateIdsByKind.get('job'),
  )
  pushUnknownReference(
    errors,
    'proposedData.nationalityId',
    data.nationalityId,
    dictionaryIds(dictionaries.nationalities),
    '國籍不存在',
    candidateIdsByKind.get('nationality'),
  )
  if (!VISUAL_GRADE_IDS.has(data.visualGradeId)) {
    errors.push({ field: 'proposedData.visualGradeId', message: '視覺等級不存在' })
  }

  const languageIds = dictionaryIds(dictionaries.languages)
  for (const [index, language] of data.languages.entries()) {
    pushUnknownReference(
      errors,
      `proposedData.languages[${index}].languageId`,
      language.languageId,
      languageIds,
      '語言不存在',
      candidateIdsByKind.get('language'),
    )
  }

  const skillIds = new Set(skills.map((skill) => skill.id))
  const skillSlots = new Set<string>()
  for (const [index, skill] of data.skills.entries()) {
    if (!VALID_SKILL_SOURCE_GROUPS.has(skill.sourceGroup)) {
      errors.push({
        field: `proposedData.skills[${index}].sourceGroup`,
        message: '技能來源組無效',
      })
    }
    if (!VALID_SKILL_KINDS.has(skill.kind)) {
      errors.push({ field: `proposedData.skills[${index}].kind`, message: '技能類型無效' })
    }
    const slotKey = `${skill.sourceGroup}:${skill.slot}`
    if (skillSlots.has(slotKey)) {
      errors.push({
        field: `proposedData.skills[${index}].slot`,
        message: '同來源組的技能槽位不可重複',
      })
    }
    skillSlots.add(slotKey)
    pushUnknownReference(
      errors,
      `proposedData.skills[${index}].skillId`,
      skill.skillId,
      skillIds,
      '技能不存在',
      candidateIdsByKind.get('skill'),
    )
  }

  const cityIds = dictionaryIds(dictionaries.cities)
  for (const [index, cityId] of data.recruitment.cityIds.entries()) {
    pushUnknownReference(
      errors,
      `proposedData.recruitment.cityIds[${index}]`,
      cityId,
      cityIds,
      '城市不存在',
    )
  }
  if (data.recruitment.requirementId !== null) {
    pushUnknownReference(
      errors,
      'proposedData.recruitment.requirementId',
      data.recruitment.requirementId,
      dictionaryIds(dictionaries.requirements),
      '招募條件不存在',
    )
  }
  for (const [index, officerId] of data.recruitment.requiredOfficerIds.entries()) {
    pushUnknownReference(
      errors,
      `proposedData.recruitment.requiredOfficerIds[${index}]`,
      officerId,
      officerIds,
      '前置航海士不存在',
    )
  }

  const candidateNames = new Set<string>()
  const candidateLabels = new Set<string>()
  const candidateKeys = new Set<string>()
  const skillCategoryIds = dictionaryIds(dictionaries.skillCategories)
  for (const [index, candidate] of draft.referenceCandidates.entries()) {
    validateReferenceCandidate(
      candidate,
      index,
      skillCategoryIds,
      candidateNames,
      candidateLabels,
      candidateKeys,
      errors,
    )
  }

  return errors
}

const valuesEqual = (before: unknown, after: unknown): boolean =>
  JSON.stringify(before) === JSON.stringify(after)

const snapshotValue = <Value>(value: Value): ReadonlyDeep<Value> => {
  if (Array.isArray(value)) {
    return value.map((item) => snapshotValue(item)) as ReadonlyDeep<Value>
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, snapshotValue(item)]),
    ) as ReadonlyDeep<Value>
  }
  return value as ReadonlyDeep<Value>
}

/** 建立正式航海士資料的欄位級差異，供工單審核流程使用。 */
export const buildWorkOrderDiff = (
  before: MaintenanceOfficerData,
  after: MaintenanceOfficerData,
): readonly MaintenanceWorkOrderDiffEntry[] =>
  OFFICER_DATA_FIELDS.flatMap((field) =>
    valuesEqual(before[field], after[field])
      ? []
      : [
          {
            field,
            before: snapshotValue(before[field]),
            after: snapshotValue(after[field]),
          },
        ],
  )
