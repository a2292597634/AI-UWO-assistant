/**
 * Catalog Page State Controller
 *
 * Manages pagination state and the filtered result set. The full filtered
 * result is kept in the page instance (not reactive data) to minimize
 * setData payload. Only the current visible page is sent to the view layer.
 */

import { PAGE_SIZE } from './catalog-presenter'
import type { CatalogRowView } from './catalog-presenter'

export interface CatalogPageStateInstance {
  /** Full enriched catalog (with skill icons) — set once on load. */
  _enrichedCatalog: CatalogRowView[]
  /** Full filtered results (not in reactive data). */
  _filteredAll: CatalogRowView[]
}

/** Initialize page state after data is loaded. */
export function initPageState(
  state: CatalogPageStateInstance,
  enrichedCatalog: CatalogRowView[],
): void {
  state._enrichedCatalog = enrichedCatalog
  state._filteredAll = enrichedCatalog
}

/** Get the first PAGE_SIZE rows of current filtered results. */
export function getFirstPage(state: CatalogPageStateInstance): CatalogRowView[] {
  return state._filteredAll.slice(0, PAGE_SIZE)
}

/** Check if more rows are available beyond what's displayed. */
export function hasMore(
  state: CatalogPageStateInstance,
  visibleCount: number,
): boolean {
  return visibleCount < state._filteredAll.length
}

/** Get the next PAGE_SIZE rows to append. */
export function getNextPage(
  state: CatalogPageStateInstance,
  currentCount: number,
): CatalogRowView[] {
  return state._filteredAll.slice(currentCount, currentCount + PAGE_SIZE)
}

/** Get total filtered count. */
export function getFilterCount(state: CatalogPageStateInstance): number {
  return state._filteredAll.length
}

/** Replace filtered results (called after filter change). */
export function setFilteredResults(
  state: CatalogPageStateInstance,
  filtered: CatalogRowView[],
): void {
  state._filteredAll = filtered
}

/** Reset to full catalog (called on clear filters). */
export function resetToFull(state: CatalogPageStateInstance): void {
  state._filteredAll = state._enrichedCatalog
}
