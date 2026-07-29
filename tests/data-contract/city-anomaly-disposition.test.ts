import { describe, expect, it } from 'vitest'
import { validateAuditInventory } from '../../tools/data-audit/validate-audit-inventory'

describe('rejected city anomaly decisions', () => {
  it('blocks a reviewed officer-shaped city value until its decision is explicitly rejected', () => {
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
          transform: 'Reject officer-shaped values before creating city relationships.',
          reason: 'Only town-shaped IDs are approved as cities.',
          evidenceOfficerIds: ['chasT101'],
        },
      ],
      enums: [
        {
          sourcePath: 'city',
          sourceValue: 'chasT051',
          canonicalId: 'officer_chast051',
          evidenceOfficerIds: ['chasT101'],
          status: 'anomaly',
          reason: 'Reviewed but not explicitly rejected.',
        },
      ],
    })

    expect(findings.map((finding) => finding.code)).toContain('AUDIT_CITY_ANOMALY_UNMARKED')
  })
})
