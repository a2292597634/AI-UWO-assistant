import type { AuditFinding, SkillMappingRecord } from '../data-audit/types'
import type { VisualGradeId } from './visual-grade'

// ── Source types (raw from json_char.js) ──

/** A source officer as extracted from `var json_char = {...}`. */
export interface SourceOfficer {
  cht?: string
  rank: string
  type: string
  job: string
  country: string
  gender: string
  lang: Record<string, string>
  skill: {
    sk0?: Record<string, number | string | null>
    sk1?: Record<string, number | null>
    sk2?: Record<string, number | string | null>
    sk3?: Record<string, number | string | null>
    sk4?: Record<string, number | string | null>
    sk5?: Record<string, number | null>
  }
  /** Unlock-level overrides keyed by skill ID. */
  slv?: Record<string, number | string>
  city: string[]
  req: string
  need?: null
  req_char?: string
  char_reqs?: string[]
  note?: string
  new?: number
  boss?: number
  /** Top-level duel skill level overrides keyed by skill ID. */
  [key: `skill${number}`]: string | number | undefined
}

/** Metadata for one skill from `skill_arr`. */
export interface SourceSkillMetadata {
  /** Source category ID (from `.t`, fallback `.g` for legacy snapshots). */
  sourceCategoryId: string
  /** Image override ID (from `.i`), or null. */
  imageOverrideId: string | null
  /** Per-level effect values (from `.d`). Each element is one level's values. */
  levelValues: string[][]
}

// ── Canonical output types (match data/schema/*.schema.json) ──

export interface CanonicalLanguage {
  languageId: string
  level: number
}

export interface CanonicalSkillRelation {
  skillId: string
  kind: 'active' | 'passive'
  sourceGroup: 'sk0' | 'sk1' | 'sk2' | 'sk3' | 'sk4' | 'sk5'
  slot: number
  unlockLevel: number
  level: number
}

export interface CanonicalRecruitment {
  cityIds: string[]
  requirementId: string | null
  requiredOfficerIds: string[]
  note: string | null
}

export interface CanonicalOfficer {
  id: string
  name: string
  rarityId: string
  visualGradeId: VisualGradeId
  typeId: string
  genderId: string
  jobId: string
  nationalityId: string
  languages: CanonicalLanguage[]
  skills: CanonicalSkillRelation[]
  recruitment: CanonicalRecruitment
  portraitId: string | null
  displayOrder: number
  sourceRefs: { voyageTw: string }
  maintenanceNote?: string
}

export interface CanonicalSkill {
  id: string
  name: string
  categoryId: string
  description: string
  /** Compact per-level effect summary (e.g. "Lv1: 2.3% | Lv2: 3.5% | ..."). */
  levelInfo: string
  iconId: string | null
  sourceRefs: { voyageTw: string }
}

export interface CanonicalTransparentBounds {
  left: number
  top: number
  width: number
  height: number
}

export interface CanonicalAssetSource {
  url: string
  originalFilename: string
  mimeType: string
  byteSize: number
  sha256: string
  width: number
  height: number
  downloadedAt?: string
  transparentBounds?: CanonicalTransparentBounds
}

interface CanonicalAssetBase {
  id: string
  kind: 'portrait' | 'icon' | 'ui-image'
  ownerId: string
}

export type CanonicalAsset = CanonicalAssetBase &
  (
    | {
        kind: 'ui-image'
        ownerType: 'ui'
        source: CanonicalAssetSource & {
          downloadedAt: string
          transparentBounds: CanonicalTransparentBounds
        }
      }
    | {
        ownerType: 'officer' | 'skill'
        source: CanonicalAssetSource
      }
  )

export interface DictionaryItem {
  id: string
  name: string
  displayOrder: number
  sourceRefs: { voyageTw: string }
}

export interface CanonicalDatasetHeader {
  schemaVersion: string
  contentVersion: string
  updatedAt: string
  sourceSnapshot: string
  counts: {
    officers: number
    skills: number
    assets: number
    dictionaryItems: number
  }
}

export interface CanonicalOutput {
  dataset: CanonicalDatasetHeader
  officers: CanonicalOfficer[]
  skills: CanonicalSkill[]
  dictionaries: Record<string, DictionaryItem[]>
  assets: CanonicalAsset[]
  skillIconResolutions: SkillIconResolution[]
  portraitResolutions: PortraitResolution[]
}

// ── Asset resolution types ──

export interface SkillIconResolution {
  ownerSourceId: string
  imageOverrideId: string | null
  resolvedImageId: string
  url: string
  metadataSourceRange: string
  rule: string
}

export interface PortraitResolution {
  ownerSourceId: string
  url: string
  rule: string
}

// ── Source manifest ──

export interface SourceManifestFile {
  path: string
  url: string
  byteSize: number
  sha256: string
  downloadedAt: string
  contentRange?: string
  lastModified?: string | null
}

export interface SourceManifest {
  snapshotDate: string
  sourceOrigin: string
  dataVersion: string
  languageVersion: string
  files: SourceManifestFile[]
}

// ── Import report ──

export interface UnknownEnum {
  path: string
  value: string
  officerId: string
}

export interface TransformAnomaly {
  officerId: string
  field: string
  value: string
  disposition: 'rejected' | 'warning'
  reason: string
}

export interface ImportReport {
  sourceCounts: { officers: number; skills: number }
  transformResults: {
    officersSuccess: number
    officersFailed: number
    skillsSuccess: number
    skillsFailed: number
  }
  unknownFields: string[]
  unknownEnums: UnknownEnum[]
  anomalies: TransformAnomaly[]
  findings: AuditFinding[]
}

// ── Re-exports for convenience ──

export type { AuditFinding, SkillMappingRecord }
