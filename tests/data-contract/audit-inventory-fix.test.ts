import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SourceEnumValue, SourceFieldRecord } from '../../tools/data-audit/types'
import { validateAuditInventory } from '../../tools/data-audit/validate-audit-inventory'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

describe('source inventory review regressions', () => {
  it('covers the eight captured officers and twenty captured skills', () => {
    const sample = readJson<{ officers: Record<string, unknown>; skills: Record<string, unknown> }>(
      'tests/fixtures/source-audit/source-samples.json',
    )
    const fields = readJson<SourceFieldRecord[]>('data/audit/source-field-inventory.json')
    const enums = readJson<SourceEnumValue[]>('data/audit/source-enum-inventory.json')

    expect(Object.keys(sample.officers)).toHaveLength(8)
    expect(Object.keys(sample.skills)).toHaveLength(20)
    expect(
      validateAuditInventory({ officers: sample.officers, skills: sample.skills, fields, enums }),
    ).toEqual([])
  })

  it('rejects incorrect observed metadata and invalid runtime dispositions', () => {
    const findings = validateAuditInventory({
      officers: { officer_1: { rank: '5' } },
      skills: {},
      fields: [
        {
          entity: 'officer',
          sourcePath: 'rank',
          observedTypes: ['number'],
          optional: true,
          nullable: true,
          disposition: 'not-approved' as never,
          canonicalPath: 'rankId',
          transform: null,
          reason: 'test',
          evidenceOfficerIds: ['officer_1'],
        },
      ],
      enums: [],
    })

    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(['AUDIT_FIELD_DISPOSITION_INVALID', 'AUDIT_FIELD_METADATA_MISMATCH']),
    )
  })

  it('rejects inventory records that are not observed in either fixture', () => {
    const findings = validateAuditInventory({
      officers: { officer_1: { rank: '5' } },
      skills: { skill_1: { name: 'name' } },
      fields: [
        {
          entity: 'officer',
          sourcePath: 'missing',
          observedTypes: ['string'],
          optional: false,
          nullable: false,
          disposition: 'archive-only',
          canonicalPath: null,
          transform: null,
          reason: 'test',
          evidenceOfficerIds: ['officer_1'],
        },
      ],
      enums: [
        {
          sourcePath: 'rank',
          sourceValue: '999',
          canonicalId: 'rank_999',
          evidenceOfficerIds: ['officer_1'],
        },
      ],
    })

    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(['AUDIT_FIELD_UNOBSERVED', 'AUDIT_ENUM_UNOBSERVED']),
    )
  })

  it('requires city-to-officer mappings to be marked as reviewed anomalies', () => {
    const findings = validateAuditInventory({
      officers: { chasT101: { city: ['chasT051'] } },
      skills: {},
      fields: [
        {
          entity: 'officer',
          sourcePath: 'city',
          observedTypes: ['array'],
          optional: false,
          nullable: false,
          disposition: 'derived',
          canonicalPath: 'recruitment.cityIds',
          transform: 'test',
          reason: 'test',
          evidenceOfficerIds: ['chasT101'],
        },
      ],
      enums: [
        {
          sourcePath: 'city',
          sourceValue: 'chasT051',
          canonicalId: 'officer_chast051',
          evidenceOfficerIds: ['chasT101'],
        },
      ],
    })

    expect(findings.map((finding) => finding.code)).toContain('AUDIT_CITY_ANOMALY_UNMARKED')
  })

  it('sorts equal finding keys by normalized observed values', () => {
    const first = {
      officers: { officer_1: { rank: '5' } },
      skills: {},
      fields: [
        {
          entity: 'officer' as const,
          sourcePath: 'rank',
          observedTypes: ['string'] as const,
          optional: false,
          nullable: false,
          disposition: 'canonical' as const,
          canonicalPath: null,
          transform: null,
          reason: 'test',
          evidenceOfficerIds: ['officer_1'],
        },
        {
          entity: 'officer' as const,
          sourcePath: 'rank',
          observedTypes: ['string'] as const,
          optional: false,
          nullable: false,
          disposition: 'derived' as const,
          canonicalPath: null,
          transform: null,
          reason: 'test',
          evidenceOfficerIds: ['officer_1'],
        },
      ],
      enums: [],
    }

    expect(validateAuditInventory(first)).toEqual(
      validateAuditInventory({ ...first, fields: [...first.fields].reverse() }),
    )
  })

  it('rejects an unaccounted skill field when no enums are supplied', () => {
    const findings = validateAuditInventory({
      officers: {},
      skills: { skill_1: { name: 'x' } },
      fields: [],
      enums: [],
    })

    expect(findings.map((finding) => finding.code)).toContain('AUDIT_FIELD_UNACCOUNTED')
  })
})
