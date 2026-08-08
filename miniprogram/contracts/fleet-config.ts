/**
 * Fleet Configuration Contracts
 *
 * Types, constants, serialization, and validation for fleet configuration
 * persistence. Pages only import from here; the runtime service adapter
 * handles CloudBase communication.
 */

import type { FleetState, FleetShipState } from './battle-fleet'
import { FLEET_SHIP_COUNT, SHIP_OFFICER_CAPACITY } from './battle-fleet'

// ── Constants ──

export const SCHEMA_VERSION = 1
export const MAX_CONFIG_NAME_LENGTH = 30
export const MAX_CONFIGS_PER_USER = 20

// ── Summary & Record types ──

/** Lightweight list item; ownerUid is server-owned and never exposed here. */
export interface FleetConfigSummary {
  configId: string
  name: string
  version: number
  updatedAt: string
  lastUsedAt: string
}

/** Full configuration record loaded from the server. */
export interface FleetConfigRecord {
  configId: string
  name: string
  fleetState: FleetState
  schemaVersion: number
  version: number
  createdAt: string
  updatedAt: string
  lastUsedAt: string
}

// ── Error codes ──

export type FleetConfigErrorCode =
  | 'unauthenticated'
  | 'not-found'
  | 'forbidden'
  | 'name-required'
  | 'duplicate-name'
  | 'limit-reached'
  | 'invalid-state'
  | 'conflict'
  | 'network'
  | 'unknown-action'

// ── Action type (used by both client and server) ──

export type FleetConfigAction =
  | 'authenticate'
  | 'listMyConfigs'
  | 'loadConfig'
  | 'createConfig'
  | 'updateConfig'
  | 'saveAsConfig'
  | 'renameConfig'
  | 'deleteConfig'
  | 'setLastUsedConfig'

// ── Serialization ──

/**
 * Serialize a FleetState to a JSON string.
 * Only business fields are included; UI transient state is excluded.
 */
export const serializeFleetState = (state: FleetState): string => {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    ships: state.ships.map(serializeShip),
    bannedOfficerIds: [...state.bannedOfficerIds],
  }
  return JSON.stringify(payload)
}

const serializeShip = (ship: FleetShipState): Record<string, unknown> => ({
  id: ship.id,
  label: ship.label,
  mode: ship.mode,
  officerIds: [...ship.officerIds],
  targets: ship.targets.map((t) => ({ id: t.id, skillId: t.skillId, targetLevel: t.targetLevel })),
  lockedOfficerIds: [...ship.lockedOfficerIds],
  removedOfficerIds: [...ship.removedOfficerIds],
  needsReview: ship.needsReview,
})

// ── Deserialization ──

/**
 * Parse a serialized FleetState JSON string back into a FleetState object.
 * Returns null if the payload is structurally invalid.
 */
export const parseFleetState = (encoded: string): FleetState | null => {
  let raw: unknown
  try {
    raw = JSON.parse(encoded)
  } catch {
    return null
  }
  if (!isValidSerializedFleetState(raw)) return null
  const data = raw as SerializedFleetState
  return {
    ships: data.ships.map(parseShip),
    bannedOfficerIds: data.bannedOfficerIds,
  }
}

interface SerializedShip {
  id: string
  label: string
  mode: string
  officerIds: string[]
  targets: { id: string; skillId: string | null; targetLevel: number }[]
  lockedOfficerIds: string[]
  removedOfficerIds: string[]
  needsReview: boolean
}

interface SerializedFleetState {
  schemaVersion: number
  ships: SerializedShip[]
  bannedOfficerIds: string[]
}

const parseShip = (raw: SerializedShip): FleetShipState => ({
  id: raw.id,
  label: raw.label,
  mode: raw.mode as FleetShipState['mode'],
  officerIds: raw.officerIds,
  targets: raw.targets.map((t) => ({ ...t })),
  lockedOfficerIds: raw.lockedOfficerIds,
  removedOfficerIds: raw.removedOfficerIds,
  needsReview: raw.needsReview,
})

// ── Validation ──

const ALLOWED_RUNTIME_TOP_LEVEL_KEYS = new Set(['ships', 'bannedOfficerIds'])
const ALLOWED_SERIALIZED_TOP_LEVEL_KEYS = new Set(['schemaVersion', 'ships', 'bannedOfficerIds'])
const ALLOWED_SHIP_KEYS = new Set([
  'id',
  'label',
  'mode',
  'officerIds',
  'targets',
  'lockedOfficerIds',
  'removedOfficerIds',
  'needsReview',
])
const ALLOWED_TARGET_KEYS = new Set(['id', 'skillId', 'targetLevel'])
const VALID_MODES = new Set(['manual', 'auto'])
const MAX_IDENTIFIER_LENGTH = 100
const MAX_LABEL_LENGTH = 30
const MAX_TARGETS_PER_SHIP = 20
const MAX_OFFICER_ID_LIST_LENGTH = 1000

/**
 * Validate that an unknown value is a well-formed FleetState suitable for storage.
 * Rejects unknown top-level fields so UI transient state cannot leak in.
 */
export const isValidFleetState = (value: unknown): value is FleetState => {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>

  if (!hasOnlyAllowedKeys(obj, ALLOWED_RUNTIME_TOP_LEVEL_KEYS)) return false
  return isValidFleetStateFields(obj)
}

/**
 * 驗證包含 schemaVersion 的持久化 FleetState。
 * schemaVersion 屬於序列化 envelope，不是 FleetState runtime business state。
 */
export const isValidSerializedFleetState = (value: unknown): value is SerializedFleetState => {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>

  if (!hasOnlyAllowedKeys(obj, ALLOWED_SERIALIZED_TOP_LEVEL_KEYS)) return false
  if (obj.schemaVersion !== SCHEMA_VERSION) return false
  return isValidFleetStateFields(obj)
}

const hasOnlyAllowedKeys = (value: Record<string, unknown>, allowed: Set<string>): boolean => {
  return Object.keys(value).every((key) => allowed.has(key))
}

const isValidFleetStateFields = (obj: Record<string, unknown>): boolean => {
  // ships must be an array of exactly 7
  if (!Array.isArray(obj.ships) || obj.ships.length !== FLEET_SHIP_COUNT) return false

  // Validate each ship
  const allOfficerIds = new Set<string>()
  const shipIds = new Set<string>()
  for (const ship of obj.ships) {
    if (!isValidShip(ship)) return false
    const s = ship as Record<string, unknown>
    if (shipIds.has(s.id as string)) return false
    shipIds.add(s.id as string)

    // Check for duplicate officers across ships
    const officerIds = s.officerIds as string[]
    for (const id of officerIds) {
      if (allOfficerIds.has(id)) return false
      allOfficerIds.add(id)
    }
  }

  // bannedOfficerIds must be a bounded array of unique strings
  if (!isValidIdArray(obj.bannedOfficerIds, MAX_OFFICER_ID_LIST_LENGTH)) return false

  return true
}

const isValidShip = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const ship = value as Record<string, unknown>

  if (!hasOnlyAllowedKeys(ship, ALLOWED_SHIP_KEYS)) return false

  if (!isValidIdentifier(ship.id)) return false
  if (
    typeof ship.label !== 'string' ||
    ship.label.length === 0 ||
    [...ship.label].length > MAX_LABEL_LENGTH
  ) {
    return false
  }
  if (!VALID_MODES.has(ship.mode as string)) return false

  // officerIds
  if (!isValidIdArray(ship.officerIds, SHIP_OFFICER_CAPACITY)) return false

  // lockedOfficerIds
  if (!isValidIdArray(ship.lockedOfficerIds, SHIP_OFFICER_CAPACITY)) return false

  // removedOfficerIds
  if (!isValidIdArray(ship.removedOfficerIds, MAX_OFFICER_ID_LIST_LENGTH)) return false

  // needsReview
  if (typeof ship.needsReview !== 'boolean') return false

  // targets
  if (!Array.isArray(ship.targets)) return false
  if (ship.targets.length > MAX_TARGETS_PER_SHIP) return false
  for (const target of ship.targets) {
    if (!isValidTarget(target)) return false
  }

  // Check duplicate non-null target skills
  const skillIds = (ship.targets as Array<{ skillId: string | null }>)
    .map((t) => t.skillId)
    .filter((id): id is string => id !== null)
  if (new Set(skillIds).size !== skillIds.length) return false

  return true
}

const isValidTarget = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const target = value as Record<string, unknown>

  if (!hasOnlyAllowedKeys(target, ALLOWED_TARGET_KEYS)) return false

  if (!isValidIdentifier(target.id)) return false
  if (target.skillId !== null && !isValidIdentifier(target.skillId)) return false
  if (typeof target.targetLevel !== 'number' || !Number.isInteger(target.targetLevel)) return false
  if (target.targetLevel < 1 || target.targetLevel > 10) return false

  return true
}

const isValidIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && [...value].length <= MAX_IDENTIFIER_LENGTH

const isValidIdArray = (value: unknown, maxLength: number): value is string[] => {
  if (!Array.isArray(value) || value.length > maxLength) return false
  if (!value.every(isValidIdentifier)) return false
  return new Set(value).size === value.length
}

// ── Name helpers ──

/**
 * Normalize a configuration name by trimming leading and trailing whitespace.
 */
export const normalizeConfigName = (value: string): string => value.trim()

/**
 * Check whether a normalized name is available for use.
 * Returns false if the name is empty, too long, or duplicates an existing
 * config name for the same user. Pass ignoredConfigId to allow a config
 * to keep its own name (for rename self-check).
 */
export const isConfigNameAvailable = (
  existing: readonly FleetConfigSummary[],
  name: string,
  ignoredConfigId?: string,
): boolean => {
  const normalized = normalizeConfigName(name)
  if (normalized.length === 0) return false
  if ([...normalized].length > MAX_CONFIG_NAME_LENGTH) return false

  return !existing.some(
    (cfg) =>
      normalizeConfigName(cfg.name) === normalized && cfg.configId !== (ignoredConfigId ?? ''),
  )
}
