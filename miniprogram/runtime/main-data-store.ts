/**
 * Main Data Store
 *
 * The ONLY module in the main package allowed to require() generated runtime
 * data files. All pages and presenters must go through this store — never
 * directly read miniprogram/generated/.
 */

import type {
  RuntimeCatalogEntry,
  RuntimeSkill,
  RuntimeFleetOfficer,
  RuntimeDictionaries,
  RuntimeDatasetMeta,
} from '../contracts/runtime-data'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _catalog = require('../generated/catalog') as RuntimeCatalogEntry[]
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _skills = require('../generated/skills') as Record<string, RuntimeSkill>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _fleetOfficers = require('../generated/fleet-officers') as RuntimeFleetOfficer[]
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _dicts = require('../generated/dictionaries') as RuntimeDictionaries
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _meta = require('../generated/dataset-meta') as RuntimeDatasetMeta

export function getDatasetMeta(): RuntimeDatasetMeta {
  return _meta
}

export function getCatalog(): readonly RuntimeCatalogEntry[] {
  return _catalog
}

export function getSkills(): Readonly<Record<string, RuntimeSkill>> {
  return _skills
}

export function getFleetOfficers(): readonly RuntimeFleetOfficer[] {
  return _fleetOfficers
}

export function getDictionaries(): RuntimeDictionaries {
  return _dicts
}
