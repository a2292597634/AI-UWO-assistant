import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSchemaValidator } from '../../tools/data-audit/create-schema-validator'
import type { CanonicalMajorEventsDataset } from '../../tools/import/types'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

const clone = <T>(value: T): T => structuredClone(value)

describe('major-events schema', () => {
  const dataset = readJson<CanonicalMajorEventsDataset>('data/master/major-events.json')
  const validator = createSchemaValidator()

  it('accepts the canonical eight-event and eighteen-zone dataset', () => {
    expect(validator.validate('major-events', dataset)).toEqual([])
    expect(dataset.sourceVerifiedOn).toBe('2026-09-24')
  })

  it('rejects missing delay and source references', () => {
    const missingDelay = clone(dataset)
    delete (missingDelay.zones[0] as unknown as Record<string, unknown>).delaySeconds
    expect(validator.validate('major-events', missingDelay)).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_REQUIRED', path: '/zones/0' }),
    )

    const missingSourceRefs = clone(dataset)
    delete (missingSourceRefs.eventTypes[0] as unknown as Record<string, unknown>).sourceRefs
    expect(validator.validate('major-events', missingSourceRefs)).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_REQUIRED', path: '/eventTypes/0' }),
    )
  })

  it('rejects a malformed source manifest hash and unknown fields', () => {
    const invalidHash = clone(dataset)
    invalidHash.sourceManifestSha256 = 'not-a-sha256'
    expect(validator.validate('major-events', invalidHash)).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_PATTERN', path: '/sourceManifestSha256' }),
    )

    const unknownField = clone(dataset) as CanonicalMajorEventsDataset & {
      unexpected: boolean
    }
    unknownField.unexpected = true
    expect(validator.validate('major-events', unknownField)).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_ADDITIONAL_PROPERTY', path: '/' }),
    )
  })

  it('requires a source verification date in the canonical major-event dataset', () => {
    const missingDate = clone(dataset) as unknown as Record<string, unknown>
    delete missingDate.sourceVerifiedOn
    expect(validator.validate('major-events', missingDate)).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_REQUIRED', path: '/' }),
    )

    const malformedDate = clone(dataset)
    malformedDate.sourceVerifiedOn = '2026/09/24'
    expect(validator.validate('major-events', malformedDate)).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_PATTERN', path: '/sourceVerifiedOn' }),
    )

    const impossibleDate = clone(dataset)
    impossibleDate.sourceVerifiedOn = '2026-02-30'
    expect(validator.validate('major-events', impossibleDate)).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_FORMAT', path: '/sourceVerifiedOn' }),
    )
  })

  it.each([
    { delaySeconds: -1, code: 'SCHEMA_MINIMUM' },
    { delaySeconds: 601, code: 'SCHEMA_MAXIMUM' },
  ])(
    'rejects delaySeconds outside the supported range: $delaySeconds',
    ({ delaySeconds, code }) => {
      const invalid = clone(dataset)
      invalid.zones[0]!.delaySeconds = delaySeconds
      expect(validator.validate('major-events', invalid)).toContainEqual(
        expect.objectContaining({ code, path: '/zones/0/delaySeconds' }),
      )
    },
  )
})
