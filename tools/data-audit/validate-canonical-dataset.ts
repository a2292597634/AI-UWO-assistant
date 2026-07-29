import { readFileSync } from 'node:fs'
import type { AuditFinding, SkillMappingRecord } from './types'
import { sourceConfig } from './source-config'

type DictionaryItem = { id: string }
type AssetResolution = {
  ownerSourceId: string
  resolvedImageId: string
  url: string
  rule: string
  metadataSourceRange?: string
  sourceRef?: string
}

export interface CanonicalDataset {
  dataset: {
    counts: { officers: number; skills: number; assets: number; dictionaryItems: number }
  }
  officers: Array<{
    id: string
    name: string
    rarityId: string
    typeId: string
    genderId: string
    jobId: string
    nationalityId: string
    languages: Array<{ languageId: string; level: number }>
    skills: Array<{
      skillId: string
      kind: 'active' | 'passive'
      sourceGroup: `sk${0 | 1 | 2 | 3 | 4 | 5}`
      slot: number
      unlockLevel: number
      level: number
    }>
    recruitment: {
      cityIds: string[]
      requirementId: string | null
      requiredOfficerIds: string[]
      note: string | null
    }
    portraitId: string | null
    sourceRefs: { voyageTw: string }
  }>
  skills: Array<{ id: string; categoryId: string; iconId: string | null; sourceRefs: { voyageTw: string } }>
  dictionaries: Record<string, DictionaryItem[]>
  assets: Array<{ id: string; ownerType: 'officer' | 'skill'; ownerId: string }>
  skillIconResolutions: AssetResolution[]
  portraitResolutions: AssetResolution[]
}

const compareText = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))

const finding = (
  code: string,
  entityType: string,
  entityId: string,
  path: string,
  observedValue: unknown,
  message: string,
): AuditFinding => ({
  severity: 'error',
  code,
  entityType,
  entityId,
  path,
  observedValue,
  message,
  suggestedAction: 'Correct the canonical dataset relationship or its bounded evidence.',
})

const hasAlias = (value: unknown, path = ''): string | undefined => {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = hasAlias(item, `${path}/${index}`)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (value === null || typeof value !== 'object') return undefined
  for (const [key, item] of Object.entries(value)) {
    const nextPath = `${path}/${key}`
    if (key === 'alias' || key === 'aliases') return nextPath
    const found = hasAlias(item, nextPath)
    if (found !== undefined) return found
  }
  return undefined
}

const addUniqueFindings = (
  findings: AuditFinding[],
  entityType: string,
  items: Array<{ id: string }>,
  path: string,
) => {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) {
      findings.push(
        finding('DATA_ID_DUPLICATE', entityType, item.id, path, item.id, 'ID is not unique.'),
      )
    }
    seen.add(item.id)
  }
}

const resolutionFindings = (
  findings: AuditFinding[],
  kind: 'skill' | 'portrait',
  resolutions: AssetResolution[],
  knownSourceIds: Set<string>,
) => {
  const seen = new Set<string>()
  for (const [index, resolution] of resolutions.entries()) {
    const path = `/${kind}Resolutions/${index}`
    if (seen.has(resolution.ownerSourceId)) {
      findings.push(
        finding(
          'DATA_ASSET_RESOLUTION_DUPLICATE',
          `${kind}Resolution`,
          resolution.ownerSourceId,
          path,
          resolution.ownerSourceId,
          'Resolution evidence has a duplicate source owner.',
        ),
      )
    }
    seen.add(resolution.ownerSourceId)
    if (!knownSourceIds.has(resolution.ownerSourceId)) {
      findings.push(
        finding(
          'DATA_ASSET_RESOLUTION_UNKNOWN',
          `${kind}Resolution`,
          resolution.ownerSourceId,
          path,
          resolution.ownerSourceId,
          'Resolution evidence has an unknown source owner.',
        ),
      )
    }
    if (
      resolution.resolvedImageId.trim() === '' ||
      !resolution.url.startsWith('https://voyage.tw/img/') ||
      resolution.rule.trim() === ''
    ) {
      findings.push(
        finding(
          'DATA_ASSET_RESOLUTION_UNRESOLVED',
          `${kind}Resolution`,
          resolution.ownerSourceId,
          path,
          resolution,
          'Resolution evidence must contain an image ID, approved URL, and deterministic rule.',
        ),
      )
    }
  }
}

export const validateCanonicalDataset = (dataset: CanonicalDataset): AuditFinding[] => {
  const findings: AuditFinding[] = []
  const aliasPath = hasAlias(dataset)
  if (aliasPath !== undefined) {
    findings.push(
      finding('DATA_ALIAS_FORBIDDEN', 'dataset', '*', aliasPath, null, 'Aliases are forbidden.'),
    )
  }

  addUniqueFindings(findings, 'officer', dataset.officers, '/officers')
  addUniqueFindings(findings, 'skill', dataset.skills, '/skills')
  addUniqueFindings(findings, 'asset', dataset.assets, '/assets')
  for (const [group, items] of Object.entries(dataset.dictionaries)) {
    addUniqueFindings(findings, `dictionary:${group}`, items, `/dictionaries/${group}`)
  }

  const officers = new Map(dataset.officers.map((officer) => [officer.id, officer]))
  const skills = new Map(dataset.skills.map((skill) => [skill.id, skill]))
  const assets = new Map(dataset.assets.map((asset) => [asset.id, asset]))
  const dictionary = (group: string) => new Set((dataset.dictionaries[group] ?? []).map((item) => item.id))
  const sourceOfficerIds = new Set(dataset.officers.map((officer) => officer.sourceRefs.voyageTw))
  const sourceSkillIds = new Set(dataset.skills.map((skill) => skill.sourceRefs.voyageTw))
  resolutionFindings(findings, 'skill', dataset.skillIconResolutions, sourceSkillIds)
  resolutionFindings(findings, 'portrait', dataset.portraitResolutions, sourceOfficerIds)
  const skillResolutions = new Set(dataset.skillIconResolutions.map((item) => item.ownerSourceId))
  const portraitResolutions = new Set(dataset.portraitResolutions.map((item) => item.ownerSourceId))
  const mappings = JSON.parse(
    readFileSync('data/audit/skill-group-mapping.json', 'utf8'),
  ) as SkillMappingRecord[]

  const expectedSelection: Array<[string, readonly string[], string[]]> = [
    ['officers', sourceConfig.officerIds, dataset.officers.map((officer) => officer.sourceRefs.voyageTw)],
    ['skills', sourceConfig.skillIds, dataset.skills.map((skill) => skill.sourceRefs.voyageTw)],
  ]
  for (const [kind, expected, actual] of expectedSelection) {
    if (expected.length !== actual.length || expected.some((id) => !actual.includes(id))) {
      findings.push(
        finding(
          'DATA_SELECTION_MISMATCH',
          'dataset',
          '*',
          `/selection/${kind}`,
          actual,
          'Canonical source selection must exactly match the approved representative selection.',
        ),
      )
    }
  }

  const expectedCounts = { officers: 8, skills: 20, assets: 9, dictionaryItems: 72 }
  const counts = {
    officers: dataset.officers.length,
    skills: dataset.skills.length,
    assets: dataset.assets.length,
    dictionaryItems: Object.values(dataset.dictionaries).reduce((total, items) => total + items.length, 0),
  }
  for (const [key, actual] of Object.entries(counts)) {
    const expected = expectedCounts[key as keyof typeof expectedCounts]
    if (actual !== expected || dataset.dataset.counts[key as keyof typeof counts] !== actual) {
      findings.push(
        finding(
          'DATA_COUNT_MISMATCH',
          'dataset',
          '*',
          `/dataset/counts/${key}`,
          dataset.dataset.counts[key as keyof typeof counts],
          'Dataset count does not equal the collection count.',
        ),
      )
    }
  }

  for (const [index, officer] of dataset.officers.entries()) {
    const base = `/officers/${index}`
    const dictionaryReferences: Array<[string, string, string]> = [
      ['rarities', officer.rarityId, 'rarityId'],
      ['types', officer.typeId, 'typeId'],
      ['genders', officer.genderId, 'genderId'],
      ['jobs', officer.jobId, 'jobId'],
      ['nationalities', officer.nationalityId, 'nationalityId'],
    ]
    for (const [group, id, field] of dictionaryReferences) {
      if (!dictionary(group).has(id)) {
        findings.push(finding('DATA_REFERENCE_MISSING', 'officer', officer.id, `${base}/${field}`, id, 'Dictionary reference is missing.'))
      }
    }
    const languages = new Set<string>()
    for (const [languageIndex, language] of officer.languages.entries()) {
      if (languages.has(language.languageId)) {
        findings.push(finding('DATA_LANGUAGE_DUPLICATE', 'officer', officer.id, `${base}/languages/${languageIndex}/languageId`, language.languageId, 'Officer has the same language more than once.'))
      }
      languages.add(language.languageId)
      if (!dictionary('languages').has(language.languageId)) {
        findings.push(finding('DATA_REFERENCE_MISSING', 'officer', officer.id, `${base}/languages/${languageIndex}/languageId`, language.languageId, 'Language dictionary reference is missing.'))
      }
    }
    const slots = new Set<string>()
    for (const [skillIndex, relationship] of officer.skills.entries()) {
      const slotKey = `${relationship.sourceGroup}\0${relationship.slot}`
      if (slots.has(slotKey)) {
        findings.push(finding('DATA_SKILL_SLOT_DUPLICATE', 'officer', officer.id, `${base}/skills/${skillIndex}`, slotKey, 'Officer has the same skill source group and slot more than once.'))
      }
      slots.add(slotKey)
      const skill = skills.get(relationship.skillId)
      if (skill === undefined) {
        findings.push(finding('DATA_REFERENCE_MISSING', 'officer', officer.id, `${base}/skills/${skillIndex}/skillId`, relationship.skillId, 'Skill reference is missing.'))
        continue
      }
      const mapping = mappings.find(
        (item) => item.sourceGroup === relationship.sourceGroup && item.categoryId === skill.categoryId,
      )
      if (mapping === undefined || mapping.kind !== relationship.kind) {
        findings.push(finding('DATA_SKILL_MAPPING_INVALID', 'officer', officer.id, `${base}/skills/${skillIndex}`, relationship, 'Skill relationship kind/category is not approved.'))
      }
    }
    for (const [cityIndex, cityId] of officer.recruitment.cityIds.entries()) {
      if (cityId.startsWith('officer_')) {
        findings.push(finding('DATA_CITY_VALUE_REJECTED', 'officer', officer.id, `${base}/recruitment/cityIds/${cityIndex}`, cityId, 'Officer-shaped source values are not approved city IDs.'))
      } else if (!dictionary('cities').has(cityId)) {
        findings.push(finding('DATA_REFERENCE_MISSING', 'officer', officer.id, `${base}/recruitment/cityIds/${cityIndex}`, cityId, 'City dictionary reference is missing.'))
      }
    }
    if (officer.recruitment.requirementId !== null && !dictionary('requirements').has(officer.recruitment.requirementId)) {
      findings.push(finding('DATA_REFERENCE_MISSING', 'officer', officer.id, `${base}/recruitment/requirementId`, officer.recruitment.requirementId, 'Requirement dictionary reference is missing.'))
    }
    for (const [requiredIndex, requiredOfficerId] of officer.recruitment.requiredOfficerIds.entries()) {
      if (!officers.has(requiredOfficerId)) {
        findings.push(finding('DATA_REFERENCE_MISSING', 'officer', officer.id, `${base}/recruitment/requiredOfficerIds/${requiredIndex}`, requiredOfficerId, 'Required officer reference is missing.'))
      }
    }
    if (officer.portraitId === null) {
      if (!portraitResolutions.has(officer.sourceRefs.voyageTw)) {
        findings.push(finding('DATA_ASSET_RESOLUTION_MISSING', 'officer', officer.id, `${base}/portraitId`, null, 'Nullable portrait requires deterministic resolution evidence.'))
      }
    } else {
      const asset = assets.get(officer.portraitId)
      if (asset === undefined || asset.ownerType !== 'officer' || asset.ownerId !== officer.id) {
        findings.push(finding('DATA_REFERENCE_MISSING', 'officer', officer.id, `${base}/portraitId`, officer.portraitId, 'Portrait asset reference is missing or owned by another entity.'))
      }
    }
  }

  for (const [index, skill] of dataset.skills.entries()) {
    const base = `/skills/${index}`
    if (!dictionary('skillCategories').has(skill.categoryId)) {
      findings.push(finding('DATA_REFERENCE_MISSING', 'skill', skill.id, `${base}/categoryId`, skill.categoryId, 'Skill category dictionary reference is missing.'))
    }
    if (skill.iconId === null) {
      if (!skillResolutions.has(skill.sourceRefs.voyageTw)) {
        findings.push(finding('DATA_ASSET_RESOLUTION_MISSING', 'skill', skill.id, `${base}/iconId`, null, 'Nullable icon requires deterministic resolution evidence.'))
      }
    } else {
      const asset = assets.get(skill.iconId)
      if (asset === undefined || asset.ownerType !== 'skill' || asset.ownerId !== skill.id) {
        findings.push(finding('DATA_REFERENCE_MISSING', 'skill', skill.id, `${base}/iconId`, skill.iconId, 'Icon asset reference is missing or owned by another entity.'))
      }
    }
  }

  return findings.sort((left, right) =>
    compareText(
      [left.code, left.entityType, left.entityId, left.path].join('\0'),
      [right.code, right.entityType, right.entityId, right.path].join('\0'),
    ),
  )
}
