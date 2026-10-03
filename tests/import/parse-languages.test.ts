import { describe, expect, it } from 'vitest'
import { parseLanguageMap, extractJsAssignment } from '../../tools/import/parse-languages'

describe('extractJsAssignment', () => {
  it('extracts an object assigned to a bracketed variable', () => {
    const source = 'lang_js[1]={"skill100043":"神之手腕","skill100043des":"以物易物時..."}'
    const result = extractJsAssignment(source, 'lang_js[1]')
    expect(result).toEqual({
      skill100043: '神之手腕',
      skill100043des: '以物易物時...',
    })
  })

  it('extracts an object assigned to a simple variable', () => {
    const source = 'var json_char={"chasT089":{"cht":"達納·卡洛斯"},"chasT096":{"cht":"維托里奧"}}'
    const result = extractJsAssignment(source, 'json_char')
    expect(result).toEqual({
      chasT089: { cht: '達納·卡洛斯' },
      chasT096: { cht: '維托里奧' },
    })
  })

  it('handles escaped characters in string values', () => {
    const source = String.raw`lang_js[1]={"key1":"line1\nline2","key2":"a\"b"}`
    const result = extractJsAssignment(source, 'lang_js[1]')
    expect(result).toEqual({ key1: 'line1\nline2', key2: 'a"b' })
  })

  it('throws for missing variable', () => {
    expect(() => extractJsAssignment('var x={}', 'missing')).toThrow('IMPORT_VARIABLE_MISSING')
  })
})

describe('parseLanguageMap', () => {
  it('merges lang_js[1] content from multiple range files', () => {
    // Simulate two range files
    const range0 = 'lang_js[1]={"skill100043":"神之手腕","skill200681":"砲擊術"'
    const range1 = ',"job_jobchasT089":"大商人","lang80":"英語"}'

    const result = parseLanguageMap([range0, range1])

    expect(result).toEqual({
      skill100043: '神之手腕',
      skill200681: '砲擊術',
      job_jobchasT089: '大商人',
      lang80: '英語',
    })
  })

  it('handles a gap between ranges by extracting what it can', () => {
    const ranges = [
      'lang_js[1]={"skill100043":"神之手腕","broken":"半個',
      '被截去結尾的殘片,"lang80":"英語"}',
    ]
    expect(() => JSON.parse(ranges.join('').replace(/^lang_js\[1\]=/, ''))).toThrow()
    const result = parseLanguageMap(ranges)
    expect(result.skill100043).toBe('神之手腕')
    expect(result.lang80).toBe('英語')
    expect(result.broken).toBeUndefined()
  })

  it('缺口兩側保留逸出引號與 Unicode，拒絕截斷值', () => {
    const ranges = [
      String.raw`lang_js[1]={"quote":"a\"b","broken":"半個`,
      String.raw`缺口,"unicode":"\u822a\u6d77"}`,
    ]
    expect(() => JSON.parse(ranges.join('').replace(/^lang_js\[1\]=/, ''))).toThrow()
    const result = parseLanguageMap(ranges)
    expect(result.quote).toBe('a"b')
    expect(result.unicode).toBe('航海')
    expect(result.broken).toBeUndefined()
  })

  it('extracts officer display names, job names, city names, and skill descriptions', () => {
    const source = `lang_js[1]={
      "chasT089":"達納·卡洛斯",
      "skill100043":"神之手腕",
      "skill100043des":"以物易物時，可進行更有利的協商。",
      "job_jobchasT089":"大商人",
      "lang80":"英語",
      "town4105":"倫敦",
      "menuskt3":"以物易物相關技能",
      "ctn_swe":"瑞典"
    }`

    const result = parseLanguageMap([source])

    expect(result['chasT089']).toBe('達納·卡洛斯')
    expect(result['skill100043']).toBe('神之手腕')
    expect(result['skill100043des']).toBe('以物易物時，可進行更有利的協商。')
    expect(result['job_jobchasT089']).toBe('大商人')
    expect(result['lang80']).toBe('英語')
    expect(result['town4105']).toBe('倫敦')
    expect(result['menuskt3']).toBe('以物易物相關技能')
    expect(result['ctn_swe']).toBe('瑞典')
  })
})
