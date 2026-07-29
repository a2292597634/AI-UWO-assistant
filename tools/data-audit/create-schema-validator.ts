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

  return {
    validate(name, value) {
      const valid = ajv.validate(name, value)
      if (valid) return []
      return (ajv.errors ?? [])
        .map((error): AuditFinding => ({
          severity: 'error',
          code: findingCodeForKeyword(error.keyword),
          entityType: name,
          entityId: '*',
          path: error.instancePath || '/',
          observedValue: (error as { data?: unknown }).data ?? null,
          message: error.message ?? 'Schema validation failed.',
          suggestedAction: 'Correct the record to match the canonical schema.',
        }))
        .sort((a, b) => [a.code, a.path].join('\0').localeCompare([b.code, b.path].join('\0')))
    },
  }
}
