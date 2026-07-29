import { describe, expect, it } from 'vitest'
import { extractJsString, extractJsValue } from '../../tools/data-audit/extract-js-value'

describe('extractJsValue', () => {
  const source =
    'var json_char={"chasT089":{"cht":"閬旂磵路鍗℃礇鏂?","lang":{"lang70":"5"}},"next":{"x":1}}'

  it('extracts one complete object without evaluating JavaScript', () => {
    expect(extractJsValue(source, 'chasT089')).toEqual({
      cht: '閬旂磵路鍗℃礇鏂?',
      lang: { lang70: '5' },
    })
  })

  it('extracts a JSON string containing punctuation', () => {
    expect(extractJsString('lang_js[1]={"skill100043":"绁炰箣鎵嬭厱"}', 'skill100043')).toBe(
      '绁炰箣鎵嬭厱',
    )
  })

  it('rejects missing and truncated values', () => {
    expect(() => extractJsValue(source, 'missing')).toThrow('AUDIT_SOURCE_KEY_MISSING')
    expect(() => extractJsValue('{"chasT089":{"cht":"閬旂磵', 'chasT089')).toThrow(
      'AUDIT_SOURCE_VALUE_TRUNCATED',
    )
  })
})
