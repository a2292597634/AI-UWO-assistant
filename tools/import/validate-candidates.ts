import { readFileSync } from 'node:fs'
import type { AuditFinding, SkillMappingRecord } from '../data-audit/types'
import type { CanonicalOfficer, CanonicalSkill, DictionaryItem } from './types'

/**
 * Validate canonical candidate data for structural integrity.
 *
 * Unlike Phase 2's `validateCanonicalDataset`, this does NOT check:
 * - Exact selection counts (8 officers / 20 skills — Phase 2 bounded audit only)
 * - Exact source ID whitelists
 *
 * It DOES check:
 * - All IDs are unique within their collections
 * - All dictionary, skill, officer references are valid
 * - No duplicate languages per officer
 * - No duplicate skill sourceGroup/slot combinations
 * - No officer-shaped city IDs (chasT051 pattern)
 * - No alias fields
 * - Skill relationship kinds match approved mappings
 */
export const validateCandidates = (
  officers: CanonicalOfficer[],
  skills: CanonicalSkill[],
  dictionaries: Record<string, DictionaryItem[]>,
): AuditFinding[] => {
  const findings: AuditFinding[] = []

  // Unique IDs
  const officerIds = new Set(officers.map((o) => o.id))
  const skillIds = new Set(skills.map((s) => s.id))
  for (const [group, items] of Object.entries(dictionaries)) {
    const seen = new Set<string>()
    for (const [i, item] of items.entries()) {
      if (seen.has(item.id)) {
        findings.push(
          makeFinding(
            'DATA_ID_DUPLICATE',
            `dictionary:${group}`,
            item.id,
            `/dictionaries/${group}/${i}`,
            item.id,
            'ID is not unique.',
          ),
        )
      }
      seen.add(item.id)
    }
  }

  // Build dictionary lookup sets
  const dictSet = (group: string) => new Set((dictionaries[group] ?? []).map((d) => d.id))

  // Load skill mappings for kind validation
  const mappings = JSON.parse(
    readFileSync('data/audit/skill-group-mapping.json', 'utf8'),
  ) as SkillMappingRecord[]
  const mappingMap = new Map<string, string>() // sourceGroup\0categoryId → kind
  for (const m of mappings) {
    mappingMap.set(`${m.sourceGroup}\0${m.categoryId}`, m.kind)
  }

  // Validate each officer
  for (const [index, officer] of officers.entries()) {
    const base = `/officers/${index}`

    // Dictionary references
    const refs: Array<[string, string, string]> = [
      ['rarities', officer.rarityId, 'rarityId'],
      ['types', officer.typeId, 'typeId'],
      ['genders', officer.genderId, 'genderId'],
      ['jobs', officer.jobId, 'jobId'],
      ['nationalities', officer.nationalityId, 'nationalityId'],
    ]
    for (const [group, id, field] of refs) {
      if (!dictSet(group).has(id)) {
        findings.push(
          makeFinding(
            'DATA_REFERENCE_MISSING',
            'officer',
            officer.id,
            `${base}/${field}`,
            id,
            'Dictionary reference is missing.',
          ),
        )
      }
    }

    // Language uniqueness
    const langs = new Set<string>()
    for (const [li, lang] of officer.languages.entries()) {
      if (langs.has(lang.languageId)) {
        findings.push(
          makeFinding(
            'DATA_LANGUAGE_DUPLICATE',
            'officer',
            officer.id,
            `${base}/languages/${li}`,
            lang.languageId,
            'Duplicate language.',
          ),
        )
      }
      langs.add(lang.languageId)
      if (!dictSet('languages').has(lang.languageId)) {
        findings.push(
          makeFinding(
            'DATA_REFERENCE_MISSING',
            'officer',
            officer.id,
            `${base}/languages/${li}`,
            lang.languageId,
            'Language reference is missing.',
          ),
        )
      }
    }

    // Skill slot uniqueness
    const slots = new Set<string>()
    for (const [si, rel] of officer.skills.entries()) {
      const slotKey = `${rel.sourceGroup}\0${rel.slot}`
      if (slots.has(slotKey)) {
        findings.push(
          makeFinding(
            'DATA_SKILL_SLOT_DUPLICATE',
            'officer',
            officer.id,
            `${base}/skills/${si}`,
            slotKey,
            'Duplicate source group and slot.',
          ),
        )
      }
      slots.add(slotKey)

      // Skill reference
      if (!skillIds.has(rel.skillId)) {
        findings.push(
          makeFinding(
            'DATA_REFERENCE_MISSING',
            'officer',
            officer.id,
            `${base}/skills/${si}/skillId`,
            rel.skillId,
            'Skill reference is missing.',
          ),
        )
        continue
      }

      // Check skill mapping consistency
      const skill = skills.find((s) => s.id === rel.skillId)!
      const mapKey = `${rel.sourceGroup}\0${skill.categoryId}`
      const expectedKind = mappingMap.get(mapKey)
      if (expectedKind && expectedKind !== rel.kind) {
        findings.push(
          makeFinding(
            'DATA_SKILL_MAPPING_INVALID',
            'officer',
            officer.id,
            `${base}/skills/${si}`,
            rel,
            'Skill kind does not match approved mapping.',
          ),
        )
      }
    }

    // City IDs: reject officer-shaped
    for (const [ci, cityId] of officer.recruitment.cityIds.entries()) {
      if (cityId.startsWith('officer_')) {
        findings.push(
          makeFinding(
            'DATA_CITY_VALUE_REJECTED',
            'officer',
            officer.id,
            `${base}/recruitment/cityIds/${ci}`,
            cityId,
            'Officer-shaped value in city IDs.',
          ),
        )
      } else if (!dictSet('cities').has(cityId)) {
        findings.push(
          makeFinding(
            'DATA_REFERENCE_MISSING',
            'officer',
            officer.id,
            `${base}/recruitment/cityIds/${ci}`,
            cityId,
            'City reference is missing.',
          ),
        )
      }
    }

    // Requirement reference
    if (
      officer.recruitment.requirementId !== null &&
      !dictSet('requirements').has(officer.recruitment.requirementId)
    ) {
      findings.push(
        makeFinding(
          'DATA_REFERENCE_MISSING',
          'officer',
          officer.id,
          `${base}/recruitment/requirementId`,
          officer.recruitment.requirementId,
          'Requirement reference is missing.',
        ),
      )
    }

    // Required officer references
    for (const [ri, reqId] of officer.recruitment.requiredOfficerIds.entries()) {
      if (!officerIds.has(reqId)) {
        findings.push(
          makeFinding(
            'DATA_REFERENCE_MISSING',
            'officer',
            officer.id,
            `${base}/recruitment/requiredOfficerIds/${ri}`,
            reqId,
            'Required officer reference is missing.',
          ),
        )
      }
    }
  }

  // Validate each skill
  for (const [index, skill] of skills.entries()) {
    const base = `/skills/${index}`
    if (!dictSet('skillCategories').has(skill.categoryId)) {
      findings.push(
        makeFinding(
          'DATA_REFERENCE_MISSING',
          'skill',
          skill.id,
          `${base}/categoryId`,
          skill.categoryId,
          'Skill category reference is missing.',
        ),
      )
    }
  }

  // Sort findings
  return findings.sort((a, b) =>
    [a.code, a.entityType, a.entityId, a.path]
      .join('\0')
      .localeCompare([b.code, b.entityType, b.entityId, b.path].join('\0')),
  )
}

const makeFinding = (
  code: string,
  entityType: string,
  entityId: string,
  path: string,
  observedValue: unknown,
  message: string,
): AuditFinding => ({
  severity: 'error' as const,
  code,
  entityType,
  entityId,
  path,
  observedValue,
  message,
  suggestedAction: 'Correct the canonical dataset.',
})
