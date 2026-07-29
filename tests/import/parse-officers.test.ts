import { describe, expect, it } from 'vitest'
import { parseOfficers } from '../../tools/import/parse-officers'

describe('parseOfficers', () => {
  it('extracts all officers from a json_char.js source', () => {
    const source = `var json_char={
      "chasT089":{"cht":"達納·卡洛斯","rank":"5","type":"class_2","job":"jobchasT089","country":"ctn_swe","gender":"f","lang":{"lang70":"5","lang80":"3"},"skill":{"sk0":{"skill100043":"50"},"sk2":{"skill400591":"1"}},"city":["town4105"],"req":"reqchasT089","note":"5000紅鑽購買提督"},
      "chasT096":{"cht":"維托里奧·薩托里","rank":"5","type":"class_3","job":"jobchasT096","country":"ctn_ita","gender":"m","lang":{"lang60":"4"},"skill":{"sk2":{"skill400591":"1"}},"city":["town5303"],"req":"","note":"5000紅鑽購買提督"},
      "chasT098":{"cht":"穆拉特·雷斯","rank":"3","type":"class_3","job":"job21400006","country":"ctn_tur","gender":"m","lang":{"lang60":"2"},"skill":{},"city":["town14105"],"req":"","slv":{}}
    }`

    const officers = parseOfficers(source)

    expect(Object.keys(officers)).toHaveLength(3)
    expect(officers.chasT089).toBeDefined()
    expect(officers.chasT089!.cht).toBe('達納·卡洛斯')
    expect(officers.chasT089!.rank).toBe('5')
    expect(officers.chasT089!.type).toBe('class_2')
    expect(officers.chasT089!.job).toBe('jobchasT089')
    expect(officers.chasT089!.country).toBe('ctn_swe')
    expect(officers.chasT089!.gender).toBe('f')
    expect(officers.chasT089!.lang).toEqual({ lang70: '5', lang80: '3' })
    expect(officers.chasT089!.city).toEqual(['town4105'])
    expect(officers.chasT089!.req).toBe('reqchasT089')

    // Officer with empty req
    expect(officers.chasT096!.req).toBe('')

    // Officer with minimal data
    expect(officers.chasT098!.rank).toBe('3')
    expect(officers.chasT098!.skill).toEqual({})
  })

  it('extracts officers with optional fields', () => {
    const source = `var json_char={
      "chasab001":{"cht":"格蕾絲·奧馬利","rank":"5","type":"class_3","job":"jobchasab001","country":"ctn_irl","gender":"f","lang":{"lang40":"3","lang80":"3"},"skill":{"sk0":{"skill500436":"30"},"sk1":{"skill509998139":null},"sk3":{"skill300004":null},"sk4":{"skill400973":"1","skill400974":"20"}},"city":["town3301","town15301"],"req":"","char_reqs":["chacbb008","chasbb019"],"boss":1},
      "chasab012":{"rank":"5","type":"class_3","job":"jobchasab012","country":"ctn_pdg","gender":"f","lang":{"lang20":"3"},"skill":{"sk3":{"skill300001":null},"sk4":{"skill100063":"1","skill100064":"60"}},"city":[],"req":"","slv":{"skill100064":"60"}}
    }`

    const officers = parseOfficers(source)
    expect(Object.keys(officers)).toHaveLength(2)

    // chasab001 has char_reqs (array of prerequisites)
    expect(officers.chasab001!.char_reqs).toEqual(['chacbb008', 'chasbb019'])
    // chasab001 has boss (archive-only)
    expect(officers.chasab001!.boss).toBe(1)
    // chasab001 has null skill levels
    expect(officers.chasab001!.skill.sk1).toEqual({ skill509998139: null })

    // chasab012 is missing cht (name comes from lang_js[1] later)
    expect(officers.chasab012!.cht).toBeUndefined()
    // chasab012 has empty city array
    expect(officers.chasab012!.city).toEqual([])
    // chasab012 has slv overrides
    expect(officers.chasab012!.slv).toEqual({ skill100064: '60' })
  })

  it('handles skills with string and number levels', () => {
    const source = `var json_char={
      "chasT089":{"rank":"5","type":"class_2","job":"jobchasT089","country":"ctn_swe","gender":"f","lang":{},"skill":{"sk0":{"skill100043":"50","skill100051":"70"},"sk2":{"skill400591":"1"},"sk3":{"skill300001":"1"},"sk5":{"skillT0053":1,"skillT0073":1}},"city":[],"req":""}
    }`

    const officers = parseOfficers(source)
    const sk = officers.chasT089!.skill!

    // Mixed types: some values are strings, others numbers
    expect(sk.sk0).toEqual({ skill100043: '50', skill100051: '70' })
    expect(sk.sk2).toEqual({ skill400591: '1' })
    expect(sk.sk3).toEqual({ skill300001: '1' })
    expect(sk.sk5).toEqual({ skillT0053: 1, skillT0073: 1 })
  })

  it('throws for missing json_char variable', () => {
    expect(() => parseOfficers('var other={}')).toThrow('IMPORT_VARIABLE_MISSING')
  })

  it('throws for truncated JSON', () => {
    expect(() => parseOfficers('var json_char={"chasT089":{"cht":"達納')).toThrow(
      'IMPORT_VARIABLE_TRUNCATED',
    )
  })
})
