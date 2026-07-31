import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SkillMappingRecord } from '../../tools/data-audit/types'
import type { SourceSkillMetadata } from '../../tools/import/types'
import { transformSkills } from '../../tools/import/transform-skills'

const mappingTable = readFileSync('data/audit/skill-group-mapping.json', 'utf8')
const mappings = JSON.parse(mappingTable) as SkillMappingRecord[]

const languageMap: Record<string, string> = {
  skill100043: '神之手腕',
  skill100043des: '以物易物時，可進行更有利的協商。',
  skill200681: '工藝品購買折扣',
  skill200681des: '工藝品的購買價格降低。',
  skill400591: '行動封鎖',
  skill400591des: '封鎖敵方的行動。',
  skillT0053: '工藝品購買達人',
  skillT0053des: '提升工藝品購買效率。',
}

const skillMetadata: Record<string, SourceSkillMetadata> = {
  skill100043: { sourceCategoryId: 'menuskt3', imageOverrideId: null, levelValues: [] },
  skill200681: { sourceCategoryId: 'menuskt2', imageOverrideId: null, levelValues: [] },
  skill400591: { sourceCategoryId: 'menuskt11', imageOverrideId: null, levelValues: [] },
  skillT0053: { sourceCategoryId: 'menuskt2', imageOverrideId: 'skill200681', levelValues: [] },
}

// Skills used by our 8 sample officers
const skillIds = ['skill100043', 'skill200681', 'skill400591', 'skillT0053']

describe('transformSkills', () => {
  it('transforms skills with display names and descriptions', () => {
    const { skills } = transformSkills(skillIds, skillMetadata, languageMap, mappings)

    expect(skills).toHaveLength(4)

    const skill43 = skills.find((s) => s.id === 'skill_skill100043')!
    expect(skill43).toBeDefined()
    expect(skill43.name).toBe('神之手腕')
    expect(skill43.description).toBe('以物易物時，可進行更有利的協商。')
    expect(skill43.categoryId).toBe('skill_category_barter')
    expect(skill43.iconId).toBeNull() // deferred to Phase 4
    expect(skill43.sourceRefs.voyageTw).toBe('skill100043')
  })

  it('handles skills with image overrides', () => {
    const { skills } = transformSkills(skillIds, skillMetadata, languageMap, mappings)

    const skillT = skills.find((s) => s.id === 'skill_skillT0053')!
    expect(skillT).toBeDefined()
    // iconId is null in Phase 3 (deferred to Phase 4)
    expect(skillT.iconId).toBeNull()
  })

  it('deduplicates shared skills across officers', () => {
    // skill400591 is used by both chasT089 and chasT096
    const dupedIds = [...skillIds, 'skill400591']
    const { skills } = transformSkills(dupedIds, skillMetadata, languageMap, mappings)

    const entries = skills.filter((s) => s.id === 'skill_skill400591')
    expect(entries).toHaveLength(1)
  })

  it('falls back to skill ID when name is missing from lang_js', () => {
    const { skills, anomalies: _anomalies } = transformSkills(
      ['skill999999'],
      { skill999999: { sourceCategoryId: 'menuskt3', imageOverrideId: null, levelValues: [] } },
      {}, // empty languageMap
      mappings,
    )

    // Should still produce a skill record with the ID as display name
    expect(skills).toHaveLength(1)
    expect(skills[0]!.name).toBe('skill999999')
    // The unmapped category menuskt3 actually IS mapped, so no anomaly
  })
})
