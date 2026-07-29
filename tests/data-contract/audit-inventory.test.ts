import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SourceEnumValue, SourceFieldRecord } from '../../tools/data-audit/types'
import {
  listObservedOfficerPaths,
  validateAuditInventory,
} from '../../tools/data-audit/validate-audit-inventory'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

describe('source field inventory', () => {
  it('accounts for every observed source field and enum exactly once', () => {
    const sample = readJson<{ officers: Record<string, unknown> }>(
      'tests/fixtures/source-audit/source-samples.json',
    )
    const fields = readJson<SourceFieldRecord[]>('data/audit/source-field-inventory.json')
    const enums = readJson<SourceEnumValue[]>('data/audit/source-enum-inventory.json')

    expect(validateAuditInventory({ officers: sample.officers, fields, enums })).toEqual([])
  })

  it('detects known source paths without treating dynamic IDs as new schemas', () => {
    const paths = listObservedOfficerPaths({
      chasT089: {
        cht: 'captured',
        lang: { lang70: '5' },
        skill: { sk0: { skill200681: '10' } },
      },
    })

    expect(paths).toEqual(['cht', 'lang.*', 'skill.sk0.*'])
  })

  it('rejects alias fields and missing dispositions', () => {
    const findings = validateAuditInventory({
      officers: { officer_1: { aliases: [] } },
      fields: [],
      enums: [],
    })

    expect(findings.map((finding) => finding.code)).toContain('AUDIT_ALIAS_FIELD_FORBIDDEN')
    expect(findings.map((finding) => finding.code)).toContain('AUDIT_FIELD_UNACCOUNTED')
  })

  it('blocks duplicate field decisions, invalid targets, and unknown enums', () => {
    const fields: SourceFieldRecord[] = [
      {
        entity: 'officer',
        sourcePath: 'rank',
        observedTypes: ['string'],
        optional: false,
        nullable: false,
        disposition: 'canonical',
        canonicalPath: null,
        transform: null,
        reason: 'test',
        evidenceOfficerIds: ['officer_1'],
      },
      {
        entity: 'officer',
        sourcePath: 'rank',
        observedTypes: ['string'],
        optional: false,
        nullable: false,
        disposition: 'canonical',
        canonicalPath: 'rank',
        transform: null,
        reason: 'test',
        evidenceOfficerIds: [],
      },
    ]

    const findings = validateAuditInventory({
      officers: { officer_1: { rank: '5' } },
      fields,
      enums: [],
    })

    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        'AUDIT_FIELD_DUPLICATE',
        'AUDIT_FIELD_TARGET_INVALID',
        'AUDIT_FIELD_EVIDENCE_MISSING',
        'AUDIT_ENUM_UNACCOUNTED',
      ]),
    )
  })
})
