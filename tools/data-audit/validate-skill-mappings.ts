import mappingsJson from '../../data/audit/skill-group-mapping.json'
import type { AuditFinding, SkillMappingRecord } from './types'

export type SourceGroup = SkillMappingRecord['sourceGroup']

const requiredGroups: SourceGroup[] = ['sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5']

export interface SkillMappingInput {
  officers: Record<string, unknown>
  skills: Record<string, unknown>
  mappings: SkillMappingRecord[]
  selectedSkillIds: readonly string[]
}

const pairKey = (sourceGroup: SourceGroup, sourceCategoryId: string) =>
  `${sourceGroup}\0${sourceCategoryId}`

const finding = (
  code: string,
  entityId: string,
  path: string,
  observedValue: unknown,
  message: string,
  suggestedAction: string,
): AuditFinding => ({
  severity: 'error',
  code,
  entityType: 'skill-mapping',
  entityId,
  path,
  observedValue,
  message,
  suggestedAction,
})

const sortFindings = (findings: AuditFinding[]) =>
  findings.sort((left, right) =>
    [left.code, left.entityId, left.path, JSON.stringify(left.observedValue)]
      .join('\0')
      .localeCompare(
        [right.code, right.entityId, right.path, JSON.stringify(right.observedValue)].join('\0'),
      ),
  )

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const sourceCategoryOf = (skill: unknown): string | undefined => {
  const record = asRecord(skill)
  return typeof record?.sourceCategoryId === 'string' && record.sourceCategoryId.trim() !== ''
    ? record.sourceCategoryId
    : undefined
}

const hasRelationshipInGroup = (
  officers: Record<string, unknown>,
  sourceGroup: SourceGroup,
  skillId: string,
) =>
  Object.values(officers).some((officerValue) => {
    const officer = asRecord(officerValue)
    const groups = asRecord(officer?.skill)
    const relationships = asRecord(groups?.[sourceGroup])
    return relationships !== undefined && skillId in relationships
  })

const hasRelationship = (officers: Record<string, unknown>, skillId: string) =>
  requiredGroups.some((sourceGroup) => hasRelationshipInGroup(officers, sourceGroup, skillId))

export const validateSkillMappings = (input: SkillMappingInput): AuditFinding[] => {
  const findings: AuditFinding[] = []
  const byPair = new Map<string, SkillMappingRecord[]>()
  const selectedSkillIds = new Set(input.selectedSkillIds)

  for (const skillId of selectedSkillIds) {
    if (
      input.selectedSkillIds.filter((selectedSkillId) => selectedSkillId === skillId).length > 1
    ) {
      findings.push(
        finding(
          'AUDIT_SKILL_SELECTION_DUPLICATE',
          skillId,
          'selectedSkillIds',
          skillId,
          'Selected skill ID appears more than once.',
          'Keep each explicitly selected skill ID exactly once.',
        ),
      )
    }
    if (!(skillId in input.skills)) {
      findings.push(
        finding(
          'AUDIT_SKILL_SELECTION_UNKNOWN',
          skillId,
          'selectedSkillIds',
          skillId,
          'Selected skill ID is absent from the fixed skill fixture.',
          'Capture the selected skill fixture or remove the ID from the explicit selection.',
        ),
      )
    }
    if (!hasRelationship(input.officers, skillId)) {
      findings.push(
        finding(
          'AUDIT_SKILL_SELECTION_RELATIONSHIP_MISSING',
          skillId,
          'selectedSkillIds',
          skillId,
          'Selected skill ID is absent from the fixed officer relationships.',
          'Select only skills observed in the fixed officer relationship fixture.',
        ),
      )
    }
  }

  for (const mapping of input.mappings) {
    const key = pairKey(mapping.sourceGroup, mapping.sourceCategoryId)
    const records = byPair.get(key) ?? []
    records.push(mapping)
    byPair.set(key, records)

    if (mapping.status !== 'approved' && mapping.status !== 'auto') {
      findings.push(
        finding(
          'AUDIT_SKILL_MAPPING_STATUS_INVALID',
          key,
          'status',
          mapping.status,
          'Skill mapping is not approved.',
          'Approve the mapping only after recording complete source evidence.',
        ),
      )
    }
    // Only check evidence for approved mappings (auto-generated ones have explanation text)
    if (
      mapping.status === 'approved' &&
      (mapping.sourceCategoryId.trim() === '' ||
        mapping.categoryId.trim() === '' ||
        mapping.evidenceSkillIds.length === 0 ||
        mapping.evidence.length === 0 ||
        mapping.evidence.some((item) => item.trim() === ''))
    ) {
      findings.push(
        finding(
          'AUDIT_SKILL_MAPPING_EVIDENCE_MISSING',
          key,
          'evidence',
          mapping,
          'Skill mapping lacks a category decision or concrete evidence.',
          'Record a non-empty canonical category, evidence skill IDs, and evidence text.',
        ),
      )
    }
    for (const skillId of mapping.evidenceSkillIds) {
      if (!(skillId in input.skills)) {
        findings.push(
          finding(
            'AUDIT_SKILL_MAPPING_SAMPLE_MISSING',
            key,
            'evidenceSkillIds',
            skillId,
            'Mapping evidence skill is absent from the fixed skill fixture.',
            'Use an observed fixed skill sample as mapping evidence.',
          ),
        )
      } else if (sourceCategoryOf(input.skills[skillId]) !== mapping.sourceCategoryId) {
        findings.push(
          finding(
            'AUDIT_SKILL_MAPPING_SAMPLE_MISMATCH',
            key,
            'evidenceSkillIds',
            skillId,
            'Mapping evidence skill does not have the mapped source category.',
            'Use a fixed skill sample whose exact source category matches the mapping pair.',
          ),
        )
      } else if (!hasRelationshipInGroup(input.officers, mapping.sourceGroup, skillId)) {
        findings.push(
          finding(
            'AUDIT_SKILL_MAPPING_SAMPLE_GROUP_MISMATCH',
            key,
            'evidenceSkillIds',
            skillId,
            'Mapping evidence skill is not observed in the mapped source group.',
            'Use a fixed skill relationship from the exact mapped source group and category.',
          ),
        )
      }
    }
  }

  for (const group of requiredGroups) {
    if (
      !input.mappings.some(
        (mapping) =>
          mapping.sourceGroup === group &&
          (mapping.status === 'approved' || mapping.status === 'auto') &&
          mapping.sourceCategoryId.trim() !== '' &&
          mapping.categoryId.trim() !== '' &&
          (mapping.status === 'approved'
            ? mapping.evidenceSkillIds.length > 0 &&
              mapping.evidence.length > 0
            : true),
      )
    ) {
      findings.push(
        finding(
          'AUDIT_SKILL_GROUP_UNMAPPED',
          group,
          'sourceGroup',
          group,
          'Source skill group has no approved mapping.',
          'Add evidence-backed mappings for every observed category in this group.',
        ),
      )
    }
  }

  for (const [key, records] of byPair) {
    if (records.length > 1) {
      findings.push(
        finding(
          'AUDIT_SKILL_MAPPING_DUPLICATE',
          key,
          'sourceCategoryId',
          records.length,
          'A source group/category pair has more than one mapping.',
          'Keep exactly one approved mapping for the exact pair.',
        ),
      )
    }
    if (
      new Set(records.map((record) => record.kind)).size > 1 ||
      new Set(records.map((record) => record.categoryId)).size > 1
    ) {
      findings.push(
        finding(
          'AUDIT_SKILL_MAPPING_CONFLICT',
          key,
          'kind',
          records.map(({ kind, categoryId }) => ({ kind, categoryId })),
          'A source group/category pair has conflicting mapping decisions.',
          'Resolve the conflict from source and game evidence before approval.',
        ),
      )
    }
  }

  for (const [officerId, officerValue] of Object.entries(input.officers)) {
    const officer = asRecord(officerValue)
    const relationshipGroups = asRecord(officer?.skill)
    if (relationshipGroups === undefined) continue
    for (const group of requiredGroups) {
      const relationships = asRecord(relationshipGroups[group])
      if (relationships === undefined) continue
      for (const skillId of Object.keys(relationships)) {
        if (!selectedSkillIds.has(skillId)) continue
        if (!(skillId in input.skills)) {
          findings.push(
            finding(
              'AUDIT_SKILL_RELATIONSHIP_SAMPLE_MISSING',
              `${officerId}:${skillId}`,
              `skill.${group}.${skillId}`,
              skillId,
              'Sampled source relationship has no fixed skill fixture.',
              'Capture the skill fixture or project validation to the explicitly selected relationships.',
            ),
          )
          continue
        }
        const sourceCategoryId = sourceCategoryOf(input.skills[skillId])
        if (sourceCategoryId === undefined) {
          findings.push(
            finding(
              'AUDIT_SKILL_SOURCE_CATEGORY_MISSING',
              skillId,
              'sourceCategoryId',
              null,
              'Sampled relationship skill has no source category metadata.',
              'Capture exact bounded skill_arr metadata or replace the sample under the audit rule.',
            ),
          )
          continue
        }
        const exact = byPair
          .get(pairKey(group, sourceCategoryId))
          ?.filter((mapping) => mapping.status === 'approved' || mapping.status === 'auto')
        if (exact?.length !== 1) {
          findings.push(
            finding(
              'AUDIT_SKILL_RELATIONSHIP_UNMAPPED',
              `${officerId}:${skillId}`,
              `skill.${group}.${skillId}`,
              sourceCategoryId,
              'Sampled source relationship has no unique approved exact mapping.',
              'Approve one exact source group/category mapping before conversion.',
            ),
          )
        }
      }
    }
  }

  return sortFindings(findings)
}

const approvedMappings = mappingsJson as SkillMappingRecord[]

export const resolveSkillMapping = (
  sourceGroup: SourceGroup,
  sourceCategoryId: string,
): SkillMappingRecord => {
  const matches = approvedMappings.filter(
    (mapping) =>
      (mapping.status === 'approved' || mapping.status === 'auto') &&
      mapping.sourceGroup === sourceGroup &&
      mapping.sourceCategoryId === sourceCategoryId,
  )
  if (matches.length !== 1) {
    throw new Error(`AUDIT_SKILL_MAPPING_UNRESOLVED:${sourceGroup}:${sourceCategoryId}`)
  }
  return matches[0]
}
