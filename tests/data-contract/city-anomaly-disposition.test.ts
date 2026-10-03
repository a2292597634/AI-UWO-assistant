import { readFileSync } from 'node:fs'
import { parseOfficers } from '../../tools/import/parse-officers'
import { parseSkills } from '../../tools/import/parse-skills'
import { transformOfficers } from '../../tools/import/transform-officers'
import { buildDictionaries } from '../../tools/import/build-dictionaries'
import { validateCandidates } from '../../tools/import/validate-candidates'
import type { SourceCorrection } from '../../tools/import/types'
import type { SourceEnumValue, SkillMappingRecord } from '../../tools/data-audit/types'
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

describe('已批准的來源城市移除', () => {
  const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
  const raw = readFileSync('archive/voyage-tw-2026052501/raw-data/json_char.js', 'utf8')
  const sources = parseOfficers(raw)
  const enums = read<SourceEnumValue[]>('data/audit/source-enum-inventory.json')
  const mappings = read<SkillMappingRecord[]>('data/audit/skill-group-mapping.json')
  const corrections = read<SourceCorrection[]>('data/corrections/source-corrections.json')
  const transform = (decisions: SourceCorrection[]) =>
    transformOfficers(
      { chasT101: sources.chasT101 },
      {},
      parseSkills(raw),
      [],
      enums,
      mappings,
      decisions,
    )
  it('同一轉換與字典構建不再收錄精確原值 city_chasT051', () => {
    const { officers } = transform(corrections)
    const { dictionaries } = buildDictionaries(officers, [], {})
    expect(officers[0].recruitment.cityIds).not.toContain('city_chasT051')
    expect(dictionaries.cities.some((item) => item.id === 'city_chasT051')).toBe(false)
    expect(officers[0].recruitment.requiredOfficerIds).not.toContain('officer_chast051')
  })
  it('缺少 approved remove 證據仍是 rejected 阻斷明細', () => {
    const { anomalies } = transform([])
    expect(anomalies).toContainEqual(
      expect.objectContaining({
        officerId: 'chasT101',
        field: 'city',
        value: 'chasT051',
        disposition: 'rejected',
      }),
    )
  })
  it('人造字典也不能把已拒絕城市變合法', () => {
    const { officers } = transform(corrections)
    const { dictionaries } = buildDictionaries(officers, [], {})
    officers[0].skills = []
    officers[0].recruitment.cityIds = ['city_chasT051']
    dictionaries.cities.push({
      id: 'city_chasT051',
      name: '假城市',
      displayOrder: 0,
      sourceRefs: { voyageTw: 'chasT051' },
    })
    expect(validateCandidates(officers, [], dictionaries)).toContainEqual(
      expect.objectContaining({ code: 'DATA_CITY_VALUE_REJECTED', severity: 'error' }),
    )
  })
})
