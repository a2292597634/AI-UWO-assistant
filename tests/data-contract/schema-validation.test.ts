import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSchemaValidator } from '../../tools/data-audit/create-schema-validator'

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown

describe('canonical JSON Schemas', () => {
  const validator = createSchemaValidator()

  it.each(['dataset', 'officers', 'skills', 'dictionaries', 'assets'] as const)(
    'accepts the canonical %s fixture',
    (name) => {
      expect(validator.validate(name, readJson(`tests/fixtures/canonical/${name}.json`))).toEqual(
        [],
      )
    },
  )

  it('rejects undeclared and alias fields', () => {
    expect(
      validator
        .validate('officers', readJson('tests/fixtures/invalid/schema-extra-property.json'))
        .map((finding) => finding.code),
    ).toContain('SCHEMA_ADDITIONAL_PROPERTY')
    expect(
      validator
        .validate('officers', readJson('tests/fixtures/invalid/schema-alias-field.json'))
        .map((finding) => finding.code),
    ).toContain('SCHEMA_ADDITIONAL_PROPERTY')
  })

  it('rejects records missing required fields', () => {
    expect(
      validator
        .validate('officers', readJson('tests/fixtures/invalid/schema-required-field.json'))
        .map((finding) => finding.code),
    ).toContain('SCHEMA_REQUIRED')
  })

  it('rejects officer-only maintenance notes on assets', () => {
    const assets = readJson('tests/fixtures/canonical/assets.json') as Array<
      Record<string, unknown>
    >
    const asset = assets[0]
    if (asset === undefined) throw new Error('fixture requires an asset')

    expect(
      validator
        .validate('assets', { ...asset, maintenanceNote: 'Officer record correction.' })
        .map((finding) => finding.code),
    ).toContain('SCHEMA_ADDITIONAL_PROPERTY')
  })

  it('requires valid transparent bounds for UI sources without breaking legacy assets', () => {
    const assets = readJson('tests/fixtures/canonical/assets.json') as Array<
      Record<string, unknown>
    >
    const legacyAsset = assets[0]
    if (legacyAsset === undefined) throw new Error('fixture requires an asset')
    const source = legacyAsset.source as Record<string, unknown>
    const uiAsset = {
      ...legacyAsset,
      id: 'ui_fixture',
      kind: 'ui-image',
      ownerType: 'ui',
      ownerId: 'ui_fixture',
      source: { ...source, downloadedAt: '2026-08-01' },
    }

    expect(validator.validate('assets', uiAsset).map((finding) => finding.code)).toContain(
      'SCHEMA_REQUIRED',
    )
    expect(
      validator.validate('assets', {
        ...uiAsset,
        source: {
          ...uiAsset.source,
          transparentBounds: { left: 0, top: 0, width: source.width, height: source.height },
        },
      }),
    ).toEqual([])
    expect(
      validator
        .validate('assets', {
          ...uiAsset,
          source: {
            ...uiAsset.source,
            transparentBounds: { left: -1, top: 0, width: 1, height: 1 },
          },
        })
        .map((finding) => finding.code),
    ).toContain('SCHEMA_MINIMUM')
  })
})
