import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SkillMappingRecord } from '../../tools/data-audit/types'
import {
  resolveSkillMapping,
  validateSkillMappings,
} from '../../tools/data-audit/validate-skill-mappings'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

describe('skill group mapping', () => {
  it('requires all six source groups to have approved evidence-backed mappings', () => {
    expect(
      validateSkillMappings({ officers: {}, skills: {}, mappings: [], selectedSkillIds: [] }).map(
        (item) => item.code,
      ),
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
      selectedSkillIds: [],
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

  it('rejects duplicate pairs and unapproved status', () => {
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
      selectedSkillIds: [],
      mappings: [incomplete, { ...incomplete }],
    })

    // 'pending' status triggers AUDIT_SKILL_MAPPING_STATUS_INVALID (not approved, not auto)
    // Duplicate triggers AUDIT_SKILL_MAPPING_DUPLICATE
    // Evidence check only applies when status is 'approved'
    expect(findings.map((item) => item.code).sort()).toEqual(
      expect.arrayContaining([
        'AUDIT_SKILL_MAPPING_DUPLICATE',
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
      selectedSkillIds: ['skill400591'],
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
      selectedSkillIds: [],
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
      selectedSkillIds: [],
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
      selectedSkillIds: ['skillMissing'],
      mappings: [],
    })

    expect(findings.map((item) => item.code)).toContain('AUDIT_SKILL_RELATIONSHIP_SAMPLE_MISSING')
  })

  it('rejects mapping evidence skills missing from the fixed skill fixture', () => {
    const findings = validateSkillMappings({
      officers: {},
      skills: {},
      selectedSkillIds: [],
      mappings: [
        {
          sourceGroup: 'sk2',
          sourceCategoryId: 'menuskt11',
          kind: 'active',
          categoryId: 'skill_category_naval_active_enhancement',
          evidenceSkillIds: ['skillMissing'],
          evidence: ['source category label'],
          status: 'approved',
        },
      ],
    })

    expect(findings.map((item) => item.code)).toContain('AUDIT_SKILL_MAPPING_SAMPLE_MISSING')
  })

  it('blocks duplicate, unknown, and relationship-free selected skill IDs', () => {
    const findings = validateSkillMappings({
      officers: {},
      skills: {
        skillOrphan: { sourceCategoryId: 'menuskt2' },
      },
      selectedSkillIds: ['skillGhost', 'skillGhost', 'skillOrphan'],
      mappings: [],
    })

    expect(findings.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'AUDIT_SKILL_SELECTION_DUPLICATE',
        'AUDIT_SKILL_SELECTION_UNKNOWN',
        'AUDIT_SKILL_SELECTION_RELATIONSHIP_MISSING',
      ]),
    )
  })

  it('accepts the full eight-officer fixture for the selected twenty skills', () => {
    const sample = readJson<{ officers: Record<string, unknown> }>(
      'tests/fixtures/source-audit/source-samples.json',
    )
    const skills = readJson<Record<string, unknown>>('tests/fixtures/source-audit/skills.json')
    const mappings = readJson<SkillMappingRecord[]>('data/audit/skill-group-mapping.json')
    const selection = readJson<{ skillIds: string[] }>('data/audit/sample-selection.json')

    expect(
      validateSkillMappings({
        officers: sample.officers,
        skills,
        mappings,
        selectedSkillIds: selection.skillIds,
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
