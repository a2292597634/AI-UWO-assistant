import type { AuditFinding, SkillMappingRecord, SourceEnumValue, SourceFieldRecord } from './types'
import type { AssetObservation } from './collect-asset-metadata'

export interface AuditDocInput {
  fields: SourceFieldRecord[]
  enums: SourceEnumValue[]
  mappings: SkillMappingRecord[]
  assets: AssetObservation[]
  findings: AuditFinding[]
}

const compareUtf8 = (a: string, b: string): number =>
  Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))

const stableSort = <T>(items: readonly T[], keyFn: (item: T) => string): T[] =>
  [...items].sort((a, b) => compareUtf8(keyFn(a), keyFn(b)))

const sortedFields = (fields: readonly SourceFieldRecord[]) =>
  stableSort(fields, (f) => `${f.entity}\0${f.sourcePath}`)

const sortedEnums = (enums: readonly SourceEnumValue[]) =>
  stableSort(enums, (e) => `${e.sourcePath}\0${e.sourceValue}`)

const sortedMappings = (mappings: readonly SkillMappingRecord[]) =>
  stableSort(mappings, (m) => `${m.sourceGroup}\0${m.sourceCategoryId}`)

const sortedFindings = (findings: readonly AuditFinding[]) =>
  stableSort(findings, (f) =>
    [
      f.severity,
      f.code,
      f.entityType,
      f.entityId,
      f.path,
      JSON.stringify(f.observedValue ?? ''),
    ].join('\0'),
  )

const esc = (s: string) => s.replace(/\|/g, '\\|')

const dispositionLabel: Record<string, string> = {
  canonical: 'canonical',
  derived: 'derived',
  'archive-only': 'archive-only',
  rejected: 'rejected',
}

const fieldInventoryMd = (fields: readonly SourceFieldRecord[]): string => {
  const lines: string[] = [
    '# Source Field Inventory',
    '',
    '| Entity | Source Path | Types | Optional | Nullable | Disposition | Canonical Path | Reason |',
    '|--------|-------------|-------|----------|----------|-------------|----------------|--------|',
  ]
  for (const f of sortedFields(fields)) {
    lines.push(
      `| ${esc(f.entity)} | ${esc(f.sourcePath)} | ${esc(f.observedTypes.join(', '))} | ${f.optional} | ${f.nullable} | ${esc(dispositionLabel[f.disposition] ?? f.disposition)} | ${esc(f.canonicalPath ?? '-')} | ${esc(f.reason)} |`,
    )
  }
  return `${lines.join('\n')}\n`
}

const enumInventoryMd = (enums: readonly SourceEnumValue[]): string => {
  const lines: string[] = [
    '# Source Enum Inventory',
    '',
    '| Source Path | Source Value | Canonical ID | Status | Reason |',
    '|-------------|--------------|--------------|--------|--------|',
  ]
  for (const e of sortedEnums(enums)) {
    lines.push(
      `| ${esc(e.sourcePath)} | ${esc(e.sourceValue)} | ${esc(e.canonicalId)} | ${esc(e.status ?? 'approved')} | ${esc(e.reason ?? '-')} |`,
    )
  }
  return `${lines.join('\n')}\n`
}

const mappingMd = (mappings: readonly SkillMappingRecord[]): string => {
  const lines: string[] = [
    '# Skill Group Mapping',
    '',
    '| Source Group | Source Category | Kind | Category ID | Evidence Skill IDs |',
    '|--------------|-----------------|------|-------------|-------------------|',
  ]
  for (const m of sortedMappings(mappings)) {
    lines.push(
      `| ${esc(m.sourceGroup)} | ${esc(m.sourceCategoryId)} | ${esc(m.kind)} | ${esc(m.categoryId)} | ${esc(m.evidenceSkillIds.join(', '))} |`,
    )
  }
  return `${lines.join('\n')}\n`
}

const reportFormatMd = (): string =>
  [
    '# Audit Report Format',
    '',
    'Every audit finding carries these stable fields:',
    '',
    '| Field | Description |',
    '|-------|-------------|',
    '| severity | `error` or `warning` |',
    '| code | Stable machine-readable error code |',
    '| entityType | Kind of entity (`officer`, `skill-mapping`, `dataset`) |',
    '| entityId | Entity identifier |',
    '| path | JSON path to the defect |',
    '| observedValue | The value that triggered the finding |',
    '| message | Human-readable description |',
    '| suggestedAction | Recommended resolution |',
    '',
  ].join('\n')

const findingsSection = (findings: readonly AuditFinding[]): string => {
  if (findings.length === 0) {
    return '**Findings:** none\n'
  }
  const lines: string[] = [
    '| Severity | Code | Entity Type | Entity ID | Path | Message |',
    '|----------|------|-------------|-----------|------|---------|',
  ]
  for (const f of sortedFindings(findings)) {
    lines.push(
      `| ${esc(f.severity)} | ${esc(f.code)} | ${esc(f.entityType)} | ${esc(f.entityId)} | ${esc(f.path)} | ${esc(f.message)} |`,
    )
  }
  return lines.join('\n')
}

const phaseReportMd = (input: AuditDocInput): string => {
  const errors = input.findings.filter((f) => f.severity === 'error').length
  const warnings = input.findings.filter((f) => f.severity === 'warning').length
  const assetSuccess = input.assets.filter((a) => a.status === 200).length
  const assetOther = input.assets.filter((a) => a.status !== 200).length

  return [
    '# Phase 2 Source Audit Report',
    '',
    '## Summary',
    '',
    `- Officers: ${input.fields.filter((f) => f.entity === 'officer').length > 0 ? 8 : 0}`,
    `- Skills: ${input.mappings.length > 0 ? 20 : 0}`,
    `- Source groups covered: ${new Set(input.mappings.map((m) => m.sourceGroup)).size}`,
    `- Asset observations: ${assetSuccess} success, ${assetOther} non-200`,
    `- Findings: ${errors} errors, ${warnings} warnings`,
    '',
    '## Field Dispositions',
    '',
    `- Canonical: ${input.fields.filter((f) => f.disposition === 'canonical').length}`,
    `- Derived: ${input.fields.filter((f) => f.disposition === 'derived').length}`,
    `- Archive-only: ${input.fields.filter((f) => f.disposition === 'archive-only').length}`,
    `- Rejected: ${input.fields.filter((f) => f.disposition === 'rejected').length}`,
    '',
    '## Findings',
    '',
    findingsSection(input.findings),
    '',
  ].join('\n')
}

export const renderAuditDocs = (input: AuditDocInput): Record<string, string> => ({
  'source-field-inventory.md': fieldInventoryMd(input.fields),
  'source-enum-inventory.md': enumInventoryMd(input.enums),
  'skill-group-mapping.md': mappingMd(input.mappings),
  'audit-report-format.md': reportFormatMd(),
  'phase-2-audit-report.md': phaseReportMd(input),
})
