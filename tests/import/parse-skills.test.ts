import { describe, expect, it } from 'vitest'
import { parseSkills } from '../../tools/import/parse-skills'

describe('parseSkills', () => {
  it('extracts all skill metadata from skill_arr using real `t` field', () => {
    // Real source uses `t` for category, `d` for descriptions
    const source = `var json_char={"chasT089":{"cht":"test","rank":"5","type":"class_2","job":"jobx","country":"ctn_swe","gender":"f","lang":{},"skill":{},"city":[],"req":""}}
var skill_arr={
      "skill100043":{"d":[["2.3%"],["3.5%"]],"t":"menuskt3"},
      "skill200681":{"d":[["1.5%"]],"t":"menuskt2","i":"skillT0053"},
      "skill509998139":{"d":[["3.0%"],["4.1%"]],"t":"menuskt19","i":"skill500436"}
    }`

    const skills = parseSkills(source)

    expect(Object.keys(skills)).toHaveLength(3)

    // Skill without icon override
    expect(skills.skill100043).toEqual({
      sourceCategoryId: 'menuskt3',
      imageOverrideId: null,
      levelValues: [['2.3%'], ['3.5%']],
    })

    // Skill with icon override
    expect(skills.skill200681).toEqual({
      sourceCategoryId: 'menuskt2',
      imageOverrideId: 'skillT0053',
      levelValues: [['1.5%']],
    })

    // Another with icon override
    expect(skills.skill509998139).toEqual({
      sourceCategoryId: 'menuskt19',
      imageOverrideId: 'skill500436',
      levelValues: [['3.0%'], ['4.1%']],
    })
  })

  it('falls back to legacy `g` field when `t` is absent', () => {
    const source = `var json_char={}
var skill_arr={
      "skill300001":{"g":"menuskt22"},
      "skill400591":{"g":"menuskt11"}
    }`

    const skills = parseSkills(source)

    expect(skills.skill300001!.sourceCategoryId).toBe('menuskt22')
    expect(skills.skill300001!.imageOverrideId).toBeNull()
    expect(skills.skill400591!.sourceCategoryId).toBe('menuskt11')
    expect(skills.skill400591!.imageOverrideId).toBeNull()
  })

  it('prefers `t` over `g` when both are present', () => {
    const source = `var json_char={}
var skill_arr={
      "skill500001":{"t":"menuskt_real","g":"menuskt_legacy"}
    }`

    const skills = parseSkills(source)
    expect(skills.skill500001!.sourceCategoryId).toBe('menuskt_real')
  })

  it('throws when a skill is missing both `t` and `g` fields', () => {
    const source = `var json_char={}
var skill_arr={
      "skill100001":{"i":"skillT0001"},
      "skill200001":{"d":[["1%"]],"t":"menuskt5"}
    }`

    expect(() => parseSkills(source)).toThrow('SKILL_CATEGORY_MISSING')
    expect(() => parseSkills(source)).toThrow('skill100001')
  })

  it('verifies all parsed skills have non-empty category', () => {
    const source = `var json_char={}
var skill_arr={
      "skill100043":{"d":[["2.3%"]],"t":"menuskt3"},
      "skill200681":{"d":[["1.5%"]],"t":"menuskt2","i":"skillT0053"},
      "skill509998139":{"t":"menuskt19","i":"skill500436"}
    }`

    const skills = parseSkills(source)
    for (const [, skill] of Object.entries(skills)) {
      expect(skill.sourceCategoryId).toBeTruthy()
      expect(skill.sourceCategoryId).not.toBe('')
    }
  })

  it('throws for missing skill_arr variable', () => {
    expect(() => parseSkills('var json_char={}')).toThrow('IMPORT_VARIABLE_MISSING')
  })
})
