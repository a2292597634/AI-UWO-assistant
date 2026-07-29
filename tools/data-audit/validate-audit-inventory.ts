import type { AuditFinding, SourceEnumValue, SourceFieldRecord } from './types'

const dynamicSegments = /^(?:skill[A-Za-z0-9]+|lang\d+)$/
type EnumPath = 'rank' | 'type' | 'gender' | 'country' | 'job' | 'lang.*' | 'city' | 'req'

const finding = (
  code: string,
  path: string,
  observedValue: unknown,
  message: string,
  suggestedAction: string,
): AuditFinding => ({
  severity: 'error',
  code,
  entityType: 'officer',
  entityId: '*',
  path,
  observedValue,
  message,
  suggestedAction,
})

const isAbsent = (value: unknown) => value === null || value === ''

const enumKey = (sourcePath: string, sourceValue: string) => `${sourcePath}\0${sourceValue}`

const sortFindings = (findings: AuditFinding[]) =>
  findings.sort((a, b) =>
    [a.code, a.entityType, a.entityId, a.path]
      .join('\0')
      .localeCompare([b.code, b.entityType, b.entityId, b.path].join('\0')),
  )

export const listObservedOfficerPaths = (officers: Record<string, unknown>): string[] => {
  const paths = new Set<string>()

  const visit = (value: unknown, segments: string[]): void => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      paths.add(segments.join('.'))
      return
    }

    for (const [key, child] of Object.entries(value)) {
      const normalized =
        segments.length === 0 && /^skill[A-Za-z0-9]+$/.test(key)
          ? 'skill*'
          : dynamicSegments.test(key)
            ? '*'
            : key
      visit(child, [...segments, normalized])
    }
  }

  for (const officer of Object.values(officers)) visit(officer, [])
  return [...paths].sort()
}

const listObservedEnums = (officers: Record<string, unknown>): SourceEnumValue[] => {
  const values = new Map<string, Set<string>>()

  const add = (sourcePath: EnumPath, sourceValue: unknown) => {
    if (typeof sourceValue !== 'string' || isAbsent(sourceValue)) return
    const known = values.get(sourcePath) ?? new Set<string>()
    known.add(sourceValue)
    values.set(sourcePath, known)
  }

  for (const officer of Object.values(officers)) {
    if (officer === null || typeof officer !== 'object' || Array.isArray(officer)) continue
    const record = officer as Record<string, unknown>
    add('rank', record.rank)
    add('type', record.type)
    add('gender', record.gender)
    add('country', record.country)
    add('job', record.job)
    add('req', record.req)

    if (record.lang !== null && typeof record.lang === 'object' && !Array.isArray(record.lang)) {
      for (const languageId of Object.keys(record.lang)) add('lang.*', languageId)
    }
    if (Array.isArray(record.city)) {
      for (const cityId of record.city) add('city', cityId)
    }
  }

  return [...values.entries()]
    .flatMap(([sourcePath, sourceValues]) =>
      [...sourceValues].map((sourceValue) => ({
        sourcePath,
        sourceValue,
        canonicalId: '',
        evidenceOfficerIds: [],
      })),
    )
    .sort((a, b) =>
      enumKey(a.sourcePath, a.sourceValue).localeCompare(enumKey(b.sourcePath, b.sourceValue)),
    )
}

export interface AuditInventoryInput {
  officers: Record<string, unknown>
  fields: SourceFieldRecord[]
  enums: SourceEnumValue[]
}

export const validateAuditInventory = (input: AuditInventoryInput): AuditFinding[] => {
  const findings: AuditFinding[] = []
  const observedPaths = listObservedOfficerPaths(input.officers)
  const fieldsByPath = new Map<string, SourceFieldRecord[]>()

  for (const field of input.fields) {
    const existing = fieldsByPath.get(field.sourcePath) ?? []
    existing.push(field)
    fieldsByPath.set(field.sourcePath, existing)

    const needsTarget = field.disposition === 'canonical' || field.disposition === 'derived'
    const needsTransform = field.disposition === 'derived'
    const validTarget =
      (needsTarget && field.canonicalPath !== null && field.canonicalPath.trim() !== '') ||
      (!needsTarget && field.canonicalPath === null)
    const validTransform =
      (needsTransform && field.transform !== null && field.transform.trim() !== '') ||
      (!needsTransform && field.transform === null)

    if (!validTarget || !validTransform) {
      findings.push(
        finding(
          'AUDIT_FIELD_TARGET_INVALID',
          field.sourcePath,
          field.disposition,
          'Field disposition has an invalid canonical target or transform.',
          'Use a target for canonical or derived fields and no target for archive-only or rejected fields.',
        ),
      )
    }
    if (field.reason.trim() === '' || field.evidenceOfficerIds.length === 0) {
      findings.push(
        finding(
          'AUDIT_FIELD_EVIDENCE_MISSING',
          field.sourcePath,
          null,
          'Field inventory record lacks a reason or representative evidence.',
          'Record a concrete reason and at least one observed officer ID.',
        ),
      )
    }
    if (
      field.sourcePath.split('.').some((segment) => segment === 'alias' || segment === 'aliases')
    ) {
      findings.push(
        finding(
          'AUDIT_ALIAS_FIELD_FORBIDDEN',
          field.sourcePath,
          null,
          'Alias fields are outside the approved schema.',
          'Remove the field from audit and canonical data.',
        ),
      )
    }
  }

  for (const [path, records] of fieldsByPath) {
    if (records.length > 1) {
      findings.push(
        finding(
          'AUDIT_FIELD_DUPLICATE',
          path,
          records.length,
          'A source field has more than one disposition.',
          'Keep exactly one approved field inventory record.',
        ),
      )
    }
  }

  for (const path of observedPaths) {
    if (path.split('.').some((segment) => segment === 'alias' || segment === 'aliases')) {
      findings.push(
        finding(
          'AUDIT_ALIAS_FIELD_FORBIDDEN',
          path,
          null,
          'Alias fields are outside the approved schema.',
          'Remove the field from audit and canonical data.',
        ),
      )
    }
    if (!fieldsByPath.has(path)) {
      findings.push(
        finding(
          'AUDIT_FIELD_UNACCOUNTED',
          path,
          null,
          'Observed source field has no disposition.',
          'Add exactly one approved field inventory record.',
        ),
      )
    }
  }

  const enumsByKey = new Map<string, SourceEnumValue[]>()
  for (const value of input.enums) {
    const key = enumKey(value.sourcePath, value.sourceValue)
    const existing = enumsByKey.get(key) ?? []
    existing.push(value)
    enumsByKey.set(key, existing)

    if (value.canonicalId.trim() === '') {
      findings.push(
        finding(
          'AUDIT_ENUM_CANONICAL_ID_MISSING',
          value.sourcePath,
          value.sourceValue,
          'Enum value has no canonical ID.',
          'Assign an approved stable canonical ID.',
        ),
      )
    }
    if (value.evidenceOfficerIds.length === 0) {
      findings.push(
        finding(
          'AUDIT_ENUM_EVIDENCE_MISSING',
          value.sourcePath,
          value.sourceValue,
          'Enum value has no representative evidence.',
          'Record at least one observed officer ID.',
        ),
      )
    }
  }

  for (const [key, records] of enumsByKey) {
    if (records.length > 1) {
      const [sourcePath, sourceValue] = key.split('\0')
      findings.push(
        finding(
          'AUDIT_ENUM_DUPLICATE',
          sourcePath,
          sourceValue,
          'A source enum value has more than one canonical decision.',
          'Keep exactly one approved enum inventory record.',
        ),
      )
    }
  }

  for (const observed of listObservedEnums(input.officers)) {
    if (!enumsByKey.has(enumKey(observed.sourcePath, observed.sourceValue))) {
      findings.push(
        finding(
          'AUDIT_ENUM_UNACCOUNTED',
          observed.sourcePath,
          observed.sourceValue,
          'Observed source enum value has no canonical decision.',
          'Add exactly one approved enum inventory record.',
        ),
      )
    }
  }

  return sortFindings(findings)
}
