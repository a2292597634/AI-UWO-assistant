export type FieldDisposition = 'canonical' | 'derived' | 'archive-only' | 'rejected'
export type FindingSeverity = 'error' | 'warning'

export interface SourceFieldRecord {
  entity: 'officer' | 'skill' | 'asset' | 'dataset'
  sourcePath: string
  observedTypes: ReadonlyArray<'array' | 'boolean' | 'null' | 'number' | 'object' | 'string'>
  optional: boolean
  nullable: boolean
  disposition: FieldDisposition
  canonicalPath: string | null
  transform: string | null
  reason: string
  evidenceOfficerIds: string[]
}

export interface SourceEnumValue {
  sourcePath: string
  sourceValue: string
  canonicalId: string
  evidenceOfficerIds: string[]
  status?: 'approved' | 'anomaly'
  reason?: string | null
}

export interface SkillMappingRecord {
  sourceGroup: 'sk0' | 'sk1' | 'sk2' | 'sk3' | 'sk4' | 'sk5'
  sourceCategoryId: string
  kind: 'active' | 'passive'
  categoryId: string
  evidenceSkillIds: string[]
  evidence: string[]
  status: 'approved'
}

export interface AuditFinding {
  severity: FindingSeverity
  code: string
  entityType: string
  entityId: string
  path: string
  observedValue: unknown
  message: string
  suggestedAction: string
}
