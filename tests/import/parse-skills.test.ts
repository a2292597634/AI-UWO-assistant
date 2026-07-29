import { describe, expect, it } from 'vitest'
import { parseSkills } from '../../tools/import/parse-skills'

describe('parseSkills', () => {
  it('extracts all skill metadata from skill_arr', () => {
    const source = `var json_char={"chasT089":{"cht":"test","rank":"5","type":"class_2","job":"jobx","country":"ctn_swe","gender":"f","lang":{},"skill":{},"city":[],"req":""}}
var skill_arr={
      "skill100043":{"g":"menuskt3"},
      "skill200681":{"g":"menuskt2","i":"skillT0053"},
      "skill509998139":{"g":"menuskt19","i":"skill500436"}
    }`

    const skills = parseSkills(source)

    expect(Object.keys(skills)).toHaveLength(3)

    // Skill without icon override
    expect(skills.skill100043).toEqual({
      sourceCategoryId: 'menuskt3',
      imageOverrideId: null,
    })

    // Skill with icon override
    expect(skills.skill200681).toEqual({
      sourceCategoryId: 'menuskt2',
      imageOverrideId: 'skillT0053',
    })

    // Another with icon override
    expect(skills.skill509998139).toEqual({
      sourceCategoryId: 'menuskt19',
      imageOverrideId: 'skill500436',
    })
  })

  it('handles skills without the optional i field', () => {
    const source = `var json_char={}
var skill_arr={
      "skill300001":{"g":"menuskt22"},
      "skill400591":{"g":"menuskt11"}
    }`

    const skills = parseSkills(source)

    expect(skills.skill300001!.imageOverrideId).toBeNull()
    expect(skills.skill400591!.imageOverrideId).toBeNull()
  })

  it('throws for missing skill_arr variable', () => {
    expect(() => parseSkills('var json_char={}')).toThrow('IMPORT_VARIABLE_MISSING')
  })
})
