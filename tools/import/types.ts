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
  /** 按技能 ID 记录的技能等级覆盖值（来源 `slv.*` 字段）。 */
  slv?: Record<string, number | string>
  city: string[]
  req: string
  need?: null
  req_char?: string
  char_reqs?: string[]
  note?: string
  new?: number
  boss?: number
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

export type CanonicalReferenceSourceRefs =
  { voyageTw: string; workOrderId?: never } | { voyageTw?: never; workOrderId: string }

export type CanonicalOfficerSourceRefs =
  | { voyageTw: string; submissionId?: never; workOrderId?: never }
  | { voyageTw?: never; submissionId: string; workOrderId?: never }
  | { voyageTw?: never; submissionId?: never; workOrderId: string }

export const isVoyageTwOfficerSourceRefs = (
  sourceRefs: CanonicalOfficerSourceRefs,
): sourceRefs is { voyageTw: string } => 'voyageTw' in sourceRefs

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
  sourceRefs: CanonicalOfficerSourceRefs
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
  sourceRefs: CanonicalReferenceSourceRefs
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
  sourceRefs: CanonicalReferenceSourceRefs
}

export type CanonicalTradeSalesMode = 'fixed-port' | 'barter' | 'special'

export interface CanonicalTradeGood {
  id: string
  name: string
  categoryId: string
  categoryName: string
  rank: number | null
  salesMode: CanonicalTradeSalesMode
  salesPortIds: string[]
  peakSeasonIds: string[]
  lowSeasonIds: string[]
  iconId: string | null
  searchAliases?: string[]
  sourceRefs: { voyageTw: string }
}

export interface CanonicalTradePort {
  id: string
  name: string
  regionName: string | null
  seasonProfileId: string
  sourceRefs: { voyageTw: string }
}

export interface CanonicalTradeSeasonProfile {
  id: string
  monthSeasonIds: string[]
}

export interface CanonicalTradeType {
  id: string
  name: string
  peakSeasonIds: string[]
  lowSeasonIds: string[]
}

export interface CanonicalTradeGlyphs {
  season: Record<string, string>
  status: { peak: string; low: string; normal: string }
}

export interface CanonicalTradeDataset {
  sourceSnapshot: string
  tradeGoods: CanonicalTradeGood[]
  tradeTypes: CanonicalTradeType[]
  ports: CanonicalTradePort[]
  seasonProfiles: CanonicalTradeSeasonProfile[]
  seasonNames: Record<string, string>
  glyphs: CanonicalTradeGlyphs
}

export interface CanonicalMajorEventType {
  id: 'pop1' | 'pop2' | 'pop3' | 'pop4' | 'pop5' | 'pop6' | 'pop7' | 'pop8'
  name: string
  periodHours: number
  tradeTypeIds: string[]
  sourceRefs: CanonicalReferenceSourceRefs
}

export interface CanonicalMajorEventZone {
  id: string
  name: string
  phaseHours: number
  delaySeconds: number
  regionIconId: string
  sourceRefs: CanonicalReferenceSourceRefs
}

export interface CanonicalMajorEventsDataset {
  sourceSnapshot: string
  sourceVersion: string
  sourceManifestSha256: string
  sourceVerifiedOn: string
  anchorEpochSeconds: number
  eventTypes: CanonicalMajorEventType[]
  zones: CanonicalMajorEventZone[]
}

export interface TradeTransformAnomaly {
  entityId: string
  field: string
  value: string
  disposition: 'warning'
  reason: string
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
    tradeGoods?: number
    tradePorts?: number
    tradeSeasonProfiles?: number
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
