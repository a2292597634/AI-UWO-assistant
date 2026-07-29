import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import type { AuditFinding } from './types'

const schemaNames = ['dataset', 'officers', 'skills', 'dictionaries', 'assets'] as const
type SchemaName = (typeof schemaNames)[number]

const findingCodeForKeyword = (keyword: string): string =>
  keyword === 'additionalProperties'
    ? 'SCHEMA_ADDITIONAL_PROPERTY'
    : `SCHEMA_${keyword.replace(/-/g, '_').toUpperCase()}`

const compareText = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))

const collectionSchemaNames = new Set<SchemaName>(['officers', 'skills', 'assets'])

export interface AuditSchemaValidator {
  validate(name: SchemaName, value: unknown): AuditFinding[]
}

export const createSchemaValidator = (): AuditSchemaValidator => {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)

  for (const name of schemaNames) {
    const schema = JSON.parse(readFileSync(`data/schema/${name}.schema.json`, 'utf8')) as Record<
      string,
      unknown
    >
    ajv.addSchema(schema, name)
  }

  const validateRecord = (name: SchemaName, value: unknown, pathPrefix = ''): AuditFinding[] => {
    const valid = ajv.validate(name, value)
    if (valid) return []
    const entityId =
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as { id?: unknown }).id === 'string'
        ? ((value as { id: string }).id ?? '*')
        : '*'
    return (ajv.errors ?? []).map((error): AuditFinding => ({
      severity: 'error',
      code: findingCodeForKeyword(error.keyword),
      entityType: name,
      entityId,
      path: `${pathPrefix}${error.instancePath}` || '/',
      observedValue: (error as { data?: unknown }).data ?? null,
      message: error.message ?? 'Schema validation failed.',
      suggestedAction: 'Correct the record to match the canonical schema.',
    }))
  }

  const sortFindings = (findings: AuditFinding[]): AuditFinding[] =>
    findings.sort((left, right) =>
      compareText(
        [left.code, left.entityType, left.entityId, left.path].join('\0'),
        [right.code, right.entityType, right.entityId, right.path].join('\0'),
      ),
    )

  return {
    validate(name, value) {
      if (collectionSchemaNames.has(name) && Array.isArray(value)) {
        return sortFindings(
          value.flatMap((record, index) => validateRecord(name, record, `/${index}`)),
        )
      }
      if (
        name === 'dictionaries' &&
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !('id' in value) &&
        Object.values(value).every(Array.isArray)
      ) {
        const findings: AuditFinding[] = []
        for (const [group, records] of Object.entries(value).sort(([left], [right]) =>
          compareText(left, right),
        )) {
          for (const [index, record] of (records as unknown[]).entries()) {
            findings.push(...validateRecord(name, record, `/${group}/${index}`))
          }
        }
        return sortFindings(findings)
      }
      return sortFindings(validateRecord(name, value))
    },
  }
}
