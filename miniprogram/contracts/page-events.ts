/**
 * Page Event Contracts
 *
 * Type-safe helpers for WeChat Mini Program event dataset parsing.
 * Pages should use these instead of arbitrary `this.data[field]` indexing.
 */

/** Known event dataset fields emitted by the catalog filter UI. */
export interface CatalogFilterEvent {
  field?: string
  id?: string
  kind?: string
  index?: string
}

/** Safely read a string dataset value. */
export function getDatasetString(
  dataset: Record<string, unknown>,
  key: string,
): string | undefined {
  const val = dataset[key]
  return typeof val === 'string' ? val : undefined
}

/** Safely read a numeric dataset value. */
export function getDatasetNumber(
  dataset: Record<string, unknown>,
  key: string,
): number | undefined {
  const val = dataset[key]
  if (typeof val === 'number') return val
  if (typeof val === 'string') {
    const n = Number(val)
    return isNaN(n) ? undefined : n
  }
  return undefined
}

/** All known filterable fields for catalog toggle events. */
export type CatalogFilterField =
  | 'selectedRarities'
  | 'selectedTypes'
  | 'selectedGenders'
  | 'selectedLanguages'
  | 'selectedJobs'
  | 'selectedSkillCategories'

/** Validate that a field name is a known catalog filter field. */
export function isCatalogFilterField(value: string): value is CatalogFilterField {
  const known: readonly string[] = [
    'selectedRarities',
    'selectedTypes',
    'selectedGenders',
    'selectedLanguages',
    'selectedJobs',
    'selectedSkillCategories',
  ]
  return known.indexOf(value) >= 0
}
