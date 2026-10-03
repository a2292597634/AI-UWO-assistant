import mapping from '../../data/audit/skill-group-mapping.json'
import type {
  CanonicalAsset,
  CanonicalDatasetHeader,
  CanonicalOfficer,
  CanonicalSkill,
  DictionaryItem,
} from '../import/types'
import type { AuditFinding } from './types'

export interface MasterDatasetInput {
  dataset: CanonicalDatasetHeader
  officers: readonly CanonicalOfficer[]
  skills: readonly CanonicalSkill[]
  dictionaries: Readonly<Record<string, readonly DictionaryItem[]>>
  assets: readonly CanonicalAsset[]
}

/** 正式集合的純校驗；不依賴來源代表性樣本的固定數量。 */
export function validateMasterDataset(input: MasterDatasetInput): AuditFinding[] {
  const findings: AuditFinding[] = []
  const add = (
    code: string,
    path: string,
    observedValue: unknown,
    entityId: string,
    severity: 'error' | 'warning' = 'error',
  ) =>
    findings.push({
      severity,
      code,
      path,
      observedValue,
      entityId,
      entityType: path.split('/')[1],
      message: '正式主資料契約不一致：' + code,
      suggestedAction: '依明確來源證據修正主資料後重新校驗。',
    })
  const ids = (rows: readonly { id: string }[], base: string): Set<string> => {
    const result = new Set<string>()
    rows.forEach((row, i) => {
      if (result.has(row.id)) add('MASTER_DUPLICATE_ID', `${base}/${i}/id`, row.id, row.id)
      result.add(row.id)
    })
    return result
  }
  const officerIds = ids(input.officers, '/officers')
  const skillIds = ids(input.skills, '/skills')
  const assetIds = ids(input.assets, '/assets')
  const dictionaries = Object.fromEntries(
    Object.entries(input.dictionaries).map(([group, rows]) => [
      group,
      ids(rows, `/dictionaries/${group}`),
    ]),
  )
  const ref = (
    value: string | null,
    target: Set<string> | undefined,
    path: string,
    owner: string,
  ) => {
    if (value !== null && !target?.has(value)) add('MASTER_REFERENCE_MISSING', path, value, owner)
  }
  const skills = new Map(input.skills.map((skill) => [skill.id, skill]))
  input.skills.forEach((skill, i) => {
    ref(skill.categoryId, dictionaries.skillCategories, `/skills/${i}/categoryId`, skill.id)
    ref(skill.iconId, assetIds, `/skills/${i}/iconId`, skill.id)
  })
  input.officers.forEach((officer, i) => {
    const base = `/officers/${i}`
    for (const [field, group] of [
      ['rarityId', 'rarities'],
      ['typeId', 'types'],
      ['genderId', 'genders'],
      ['jobId', 'jobs'],
      ['nationalityId', 'nationalities'],
    ] as const)
      ref(officer[field], dictionaries[group], `${base}/${field}`, officer.id)
    ref(officer.portraitId, assetIds, `${base}/portraitId`, officer.id)
    const languages = new Set<string>()
    officer.languages.forEach((language, j) => {
      const path = `${base}/languages/${j}/languageId`
      ref(language.languageId, dictionaries.languages, path, officer.id)
      if (languages.has(language.languageId))
        add('MASTER_DUPLICATE_LANGUAGE', path, language.languageId, officer.id)
      languages.add(language.languageId)
    })
    const slots = new Set<string>()
    officer.skills.forEach((relation, j) => {
      const path = `${base}/skills/${j}`
      ref(relation.skillId, skillIds, `${path}/skillId`, officer.id)
      const slot = `${relation.sourceGroup}:${relation.slot}`
      if (slots.has(slot))
        add('MASTER_DUPLICATE_SKILL_SLOT', `${path}/slot`, relation.slot, officer.id)
      slots.add(slot)
      if (!Number.isInteger(relation.level) || relation.level < 1 || relation.level > 9)
        add('MASTER_SKILL_LEVEL_INVALID', `${path}/level`, relation.level, officer.id)
      if (!Number.isInteger(relation.unlockLevel) || relation.unlockLevel < 1)
        add('MASTER_UNLOCK_LEVEL_INVALID', `${path}/unlockLevel`, relation.unlockLevel, officer.id)
      const skill = skills.get(relation.skillId)
      if (
        relation.sourceGroup === 'sk1' &&
        skill?.categoryId === 'skill_category_innate_buff' &&
        (relation.kind !== 'passive' || relation.level !== 1 || relation.unlockLevel !== 1)
      )
        add('MASTER_INNATE_INVALID', path, relation, officer.id)
      if (skill) {
        const evidence = mapping.find(
          (row) =>
            row.sourceGroup === relation.sourceGroup &&
            row.categoryId === skill.categoryId &&
            row.evidence.length > 0,
        )
        if (evidence && relation.kind !== evidence.kind)
          add('MASTER_SKILL_KIND_CONFLICT', `${path}/kind`, relation.kind, officer.id)
        else if (!evidence)
          add(
            'MASTER_SKILL_MAPPING_UNVERIFIED',
            `${path}/kind`,
            { sourceGroup: relation.sourceGroup, categoryId: skill.categoryId },
            officer.id,
            'warning',
          )
      }
    })
    officer.recruitment.cityIds.forEach((id, j) =>
      ref(id, dictionaries.cities, `${base}/recruitment/cityIds/${j}`, officer.id),
    )
    ref(
      officer.recruitment.requirementId,
      dictionaries.requirements,
      `${base}/recruitment/requirementId`,
      officer.id,
    )
    officer.recruitment.requiredOfficerIds.forEach((id, j) =>
      ref(id, officerIds, `${base}/recruitment/requiredOfficerIds/${j}`, officer.id),
    )
  })
  input.assets.forEach((asset, i) => {
    if (asset.ownerType !== 'ui')
      ref(
        asset.ownerId,
        asset.ownerType === 'officer' ? officerIds : skillIds,
        `/assets/${i}/ownerId`,
        asset.id,
      )
  })
  const actual = {
    officers: input.officers.length,
    skills: input.skills.length,
    assets: input.assets.length,
    dictionaryItems: Object.values(input.dictionaries).reduce((sum, rows) => sum + rows.length, 0),
  }
  for (const key of Object.keys(actual) as Array<keyof typeof actual>)
    if (input.dataset.counts[key] !== actual[key])
      add(
        'MASTER_COUNT_MISMATCH',
        `/dataset/counts/${key}`,
        { declared: input.dataset.counts[key], actual: actual[key] },
        'dataset',
      )
  return findings
}
