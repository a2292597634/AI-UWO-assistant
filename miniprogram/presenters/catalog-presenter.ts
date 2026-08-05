/**
 * Catalog Presenter
 *
 * Pure TypeScript: enriches catalog entries with precomputed WXML data
 * (skill icons, selected maps). No dependency on wx, Page, or filesystem.
 */

import type {
  RuntimeCatalogEntry,
  RuntimeDictionaryItem,
  RuntimeSkill,
} from '../contracts/runtime-data'
import type { CatalogFilterState } from '../contracts/filter-state'
import { buildOfficerVisuals } from './officer-visuals'
import type { OfficerVisualPaths } from './officer-visuals'

// ── Enriched types ──

export interface CatalogRowView extends RuntimeCatalogEntry {
  visuals: OfficerVisualPaths
  activeSkillIcons: Record<string, string>
  passiveSkillIcons: Record<string, string>
  assetReady?: boolean
  portraitFail?: boolean
  frameFail?: boolean
  rarityIconFail?: boolean
  typeIconFail?: boolean
}

export interface FilterOption extends RuntimeDictionaryItem {
  iconPath: string
  accessibilityLabel: string
}

export interface CatalogViewMaps {
  selectedRarityMap: Record<string, boolean>
  selectedTypeMap: Record<string, boolean>
  selectedGenderMap: Record<string, boolean>
  selectedLanguageMap: Record<string, boolean>
  selectedJobMap: Record<string, boolean>
  selectedSkillCategoryMap: Record<string, boolean>
}

export interface CatalogPageData {
  visibleRows: CatalogRowView[]
  filterCount: number
  hasActiveFilters: boolean
  hasMore: boolean
  activeFilter: string
  selectedRarities: string[]
  selectedTypes: string[]
  selectedGenders: string[]
  selectedLanguages: string[]
  selectedJobs: string[]
  selectedSkillCategories: string[]
  searchText: string
  selectedRarityMap: Record<string, boolean>
  selectedTypeMap: Record<string, boolean>
  selectedGenderMap: Record<string, boolean>
  selectedLanguageMap: Record<string, boolean>
  selectedJobMap: Record<string, boolean>
  selectedSkillCategoryMap: Record<string, boolean>
}

// ── Presenter functions ──

/** PAGE_SIZE — number of rows visible per page. Must match current spec. */
export const PAGE_SIZE = 30

const FILTER_ICON_PATHS: Readonly<Record<string, string>> = {
  rarity_2: '/assets/ui/uwo-icon-grade-2-filter.png',
  rarity_3: '/assets/ui/uwo-icon-grade-3-filter.png',
  rarity_4: '/assets/ui/uwo-icon-grade-4-filter.png',
  rarity_5: '/assets/ui/uwo-icon-grade-5-filter.png',
  type_class_1: '/assets/ui/uwo-icon-class-1.png',
  type_class_2: '/assets/ui/uwo-icon-class-2.png',
  type_class_3: '/assets/ui/uwo-icon-class-3.png',
  gender_f: '/assets/ui/gender-f.png',
  gender_m: '/assets/ui/gender-m.png',
}

const FILTER_GROUP_LABELS = {
  rarity: '稀有度',
  type: '類型',
  gender: '性別',
} as const

export function buildCatalogFilterOptions(
  items: readonly RuntimeDictionaryItem[],
  group: keyof typeof FILTER_GROUP_LABELS,
): FilterOption[] {
  return items.map((item) => ({
    ...item,
    iconPath: FILTER_ICON_PATHS[item.id] ?? '',
    accessibilityLabel: `${FILTER_GROUP_LABELS[group]} ${item.name}`,
  }))
}

/**
 * Enrich catalog entries with precomputed skill icon paths.
 * Returns a new array — does not modify the input.
 */
export function enrichCatalogWithIcons(
  catalog: readonly RuntimeCatalogEntry[],
  skills: Readonly<Record<string, RuntimeSkill>>,
): CatalogRowView[] {
  return catalog.map((o) => {
    const activeIcons: Record<string, string> = {}
    const passiveIcons: Record<string, string> = {}

    for (const sid of o.activeSkills ?? []) {
      activeIcons[sid] = skills[sid]?.ip ?? ''
    }
    for (const sid of o.passiveSkills ?? []) {
      passiveIcons[sid] = skills[sid]?.ip ?? ''
    }

    return {
      ...o,
      visuals: buildOfficerVisuals(o),
      activeSkillIcons: activeIcons,
      passiveSkillIcons: passiveIcons,
      assetReady: true,
    }
  })
}

/**
 * Build precomputed boolean maps for WXML filter templates.
 * Avoids indexOf / join calls in WXML expressions.
 */
export function buildViewMaps(state: Readonly<CatalogFilterState>): CatalogViewMaps {
  const toMap = (ids: readonly string[]): Record<string, boolean> => {
    const m: Record<string, boolean> = {}
    for (const id of ids) m[id] = true
    return m
  }

  return {
    selectedRarityMap: toMap(state.selectedRarities),
    selectedTypeMap: toMap(state.selectedTypes),
    selectedGenderMap: toMap(state.selectedGenders),
    selectedLanguageMap: toMap(state.selectedLanguages),
    selectedJobMap: toMap(state.selectedJobs),
    selectedSkillCategoryMap: toMap(state.selectedSkillCategories),
  }
}

/**
 * Preserve portraitFail flags from old visible rows to new.
 */
export function preservePortraitFails(
  newRows: CatalogRowView[],
  oldRows: readonly CatalogRowView[],
): CatalogRowView[] {
  const failMap: Record<
    string,
    Pick<CatalogRowView, 'portraitFail' | 'frameFail' | 'rarityIconFail' | 'typeIconFail'>
  > = {}
  for (const o of oldRows) {
    if (o.portraitFail || o.frameFail || o.rarityIconFail || o.typeIconFail) {
      failMap[o.id] = {
        portraitFail: o.portraitFail,
        frameFail: o.frameFail,
        rarityIconFail: o.rarityIconFail,
        typeIconFail: o.typeIconFail,
      }
    }
  }
  return newRows.map((o) => (failMap[o.id] ? { ...o, ...failMap[o.id] } : o))
}

/** Create empty CatalogPageData for initial data state. */
export function createCatalogPageData(
  visibleRows: CatalogRowView[],
  filterCount: number,
  state: Readonly<CatalogFilterState>,
  hasMore: boolean,
): CatalogPageData {
  const maps = buildViewMaps(state)
  return {
    visibleRows,
    filterCount,
    hasActiveFilters: false,
    hasMore,
    activeFilter: state.activeFilter,
    selectedRarities: [...state.selectedRarities],
    selectedTypes: [...state.selectedTypes],
    selectedGenders: [...state.selectedGenders],
    selectedLanguages: [...state.selectedLanguages],
    selectedJobs: [...state.selectedJobs],
    selectedSkillCategories: [...state.selectedSkillCategories],
    searchText: state.searchText,
    ...maps,
  }
}
