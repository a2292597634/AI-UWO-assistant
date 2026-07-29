import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SkillMappingRecord } from '../../tools/data-audit/types'
import {
  resolveSkillMapping,
  validateSkillMappings,
} from '../../tools/data-audit/validate-skill-mappings'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

const selectFixedRelationships = (
  officers: Record<string, unknown>,
  skills: Record<string, unknown>,
): Record<string, unknown> => {
  const selected = new Set(Object.keys(skills))
  return Object.fromEntries(
    Object.entries(officers).map(([officerId, value]) => {
      const officer = value as { skill?: Record<string, Record<string, unknown>> }
      const skill = Object.fromEntries(
        Object.entries(officer.skill ?? {}).map(([group, relationships]) => [
          group,
          Object.fromEntries(
            Object.entries(relationships).filter(([skillId]) => selected.has(skillId)),
          ),
        ]),
      )
      return [officerId, { skill }]
    }),
  )
}

describe('skill group mapping', () => {
  it('requires all six source groups to have approved evidence-backed mappings', () => {
    expect(
      validateSkillMappings({ officers: {}, skills: {}, mappings: [] }).map((item) => item.code),
    ).toEqual([
      'AUDIT_SKILL_GROUP_UNMAPPED',
      'AUDIT_SKILL_GROUP_UNMAPPED',
      'AUDIT_SKILL_GROUP_UNMAPPED',
      'AUDIT_SKILL_GROUP_UNMAPPED',
      'AUDIT_SKILL_GROUP_UNMAPPED',
      'AUDIT_SKILL_GROUP_UNMAPPED',
    ])
  })

  it('rejects conflicting kind decisions for one group/category pair', () => {
    const findings = validateSkillMappings({
      officers: {},
      skills: {},
      mappings: [
        {
          sourceGroup: 'sk2',
          sourceCategoryId: 'menuskt5',
          kind: 'active',
          categoryId: 'skill_category_melee_active',
          evidenceSkillIds: ['skill400591'],
          evidence: ['source metadata'],
          status: 'approved',
        },
        {
          sourceGroup: 'sk2',
          sourceCategoryId: 'menuskt5',
          kind: 'passive',
          categoryId: 'skill_category_melee_active',
          evidenceSkillIds: ['skill400591'],
          evidence: ['conflicting guess'],
          status: 'approved',
        },
      ],
    })

    expect(findings.map((item) => item.code)).toContain('AUDIT_SKILL_MAPPING_CONFLICT')
  })

  it('rejects duplicate pairs and incomplete or unapproved evidence', () => {
    const incomplete = {
      sourceGroup: 'sk0',
      sourceCategoryId: 'menuskt1',
      kind: 'passive',
      categoryId: '',
      evidenceSkillIds: [],
      evidence: [],
      status: 'pending',
    } as unknown as SkillMappingRecord

    const findings = validateSkillMappings({
      officers: {},
      skills: {},
      mappings: [incomplete, { ...incomplete }],
    })

    expect(findings.map((item) => item.code).sort()).toEqual(
      expect.arrayContaining([
        'AUDIT_SKILL_MAPPING_DUPLICATE',
        'AUDIT_SKILL_MAPPING_EVIDENCE_MISSING',
        'AUDIT_SKILL_MAPPING_STATUS_INVALID',
      ]),
    )
  })

  it('rejects sampled source relationships without an exact mapping', () => {
    const findings = validateSkillMappings({
      officers: {
        officer_1: { skill: { sk2: { skill400591: '1' } } },
      },
      skills: {
        skill400591: { sourceCategoryId: 'menuskt5' },
      },
      mappings: [],
    })

    expect(findings.map((item) => item.code)).toContain('AUDIT_SKILL_RELATIONSHIP_UNMAPPED')
  })

  it('rejects evidence skills from a different source category', () => {
    const findings = validateSkillMappings({
      officers: {},
      skills: {
        skill400591: { sourceCategoryId: 'menuskt11' },
      },
      mappings: [
        {
          sourceGroup: 'sk2',
          sourceCategoryId: 'menuskt5',
          kind: 'active',
          categoryId: 'skill_category_naval_active_enhancement',
          evidenceSkillIds: ['skill400591'],
          evidence: ['source category label'],
          status: 'approved',
        },
      ],
    })

    expect(findings.map((item) => item.code)).toContain('AUDIT_SKILL_MAPPING_SAMPLE_MISMATCH')
  })

  it('rejects evidence skills that are not observed in the mapped source group', () => {
    const findings = validateSkillMappings({
      officers: {
        officer_1: { skill: { sk0: { skill200681: '10' } } },
      },
      skills: {
        skill200681: { sourceCategoryId: 'menuskt2' },
      },
      mappings: [
        {
          sourceGroup: 'sk5',
          sourceCategoryId: 'menuskt2',
          kind: 'passive',
          categoryId: 'skill_category_trade_price_adjustment',
          evidenceSkillIds: ['skill200681'],
          evidence: ['source category label'],
          status: 'approved',
        },
      ],
    })

    expect(findings.map((item) => item.code)).toContain('AUDIT_SKILL_MAPPING_SAMPLE_GROUP_MISMATCH')
  })

  it('rejects sampled relationships whose skill fixture is missing', () => {
    const findings = validateSkillMappings({
      officers: {
        officer_1: { skill: { sk2: { skillMissing: '1' } } },
      },
      skills: {},
      mappings: [],
    })

    expect(findings.map((item) => item.code)).toContain('AUDIT_SKILL_RELATIONSHIP_SAMPLE_MISSING')
  })

  it('accepts the fixed twenty-skill fixture and every observed exact pair', () => {
    const sample = readJson<{ officers: Record<string, unknown> }>(
      'tests/fixtures/source-audit/source-samples.json',
    )
    const skills = readJson<Record<string, unknown>>('tests/fixtures/source-audit/skills.json')
    const mappings = readJson<SkillMappingRecord[]>('data/audit/skill-group-mapping.json')

    expect(
      validateSkillMappings({
        officers: selectFixedRelationships(sample.officers, skills),
        skills,
        mappings,
      }),
    ).toEqual([])

    for (const mapping of mappings) {
      expect(resolveSkillMapping(mapping.sourceGroup, mapping.sourceCategoryId)).toEqual(mapping)
    }
  })

  it('resolves only an approved exact group/category pair', () => {
    expect(() => resolveSkillMapping('sk2', 'unknown')).toThrow('AUDIT_SKILL_MAPPING_UNRESOLVED')
  })
})
