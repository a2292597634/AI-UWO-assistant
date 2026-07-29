import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSchemaValidator } from '../../tools/data-audit/create-schema-validator'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

describe('canonical collection schema validation', () => {
  const validator = createSchemaValidator()

  it.each(['officers', 'skills', 'assets'] as const)(
    'validates every strict record in the %s collection',
    (name) => {
      const record = readJson<unknown>(`tests/fixtures/canonical/${name}.json`)

      expect(validator.validate(name, record)).toEqual([])
    },
  )

  it('validates grouped dictionary arrays with grouped paths', () => {
    const record = readJson<Record<string, Array<Record<string, unknown>>>>(
      'tests/fixtures/canonical/dictionaries.json',
    )
    const dictionary = record.languages[0]
    if (dictionary === undefined) throw new Error('fixture requires a language dictionary item')
    const invalid = { languages: [dictionary, { ...dictionary, name: '' }] }

    expect(validator.validate('dictionaries', record)).toEqual([])
    expect(validator.validate('dictionaries', invalid)).toEqual([
      expect.objectContaining({ code: 'SCHEMA_MINLENGTH', path: '/languages/1/name' }),
    ])
  })

  it('reports indexed collection paths while preserving single-record strictness', () => {
    const records = readJson<Array<Record<string, unknown>>>(
      'tests/fixtures/canonical/officers.json',
    )
    const record = records[0]
    if (record === undefined) throw new Error('fixture requires an officer')
    const invalid = { ...record }
    delete invalid.name

    expect(validator.validate('officers', [invalid])).toEqual([
      expect.objectContaining({ code: 'SCHEMA_REQUIRED', path: '/0' }),
    ])
    expect(
      validator
        .validate('officers', readJson('tests/fixtures/invalid/schema-extra-property.json'))
        .map((finding) => finding.code),
    ).toContain('SCHEMA_ADDITIONAL_PROPERTY')
  })

  it('accepts required nullable skill and portrait asset IDs', () => {
    const officers = readJson<Array<Record<string, unknown>>>(
      'tests/fixtures/canonical/officers.json',
    )
    const skills = readJson<Array<Record<string, unknown>>>('tests/fixtures/canonical/skills.json')
    const officer = officers[0]
    const skill = skills[0]
    if (officer === undefined || skill === undefined) throw new Error('fixture requires records')

    expect(validator.validate('officers', { ...officer, portraitId: null })).toEqual([])
    expect(validator.validate('skills', { ...skill, iconId: null })).toEqual([])
  })
})
