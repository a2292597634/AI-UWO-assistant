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

// ── Skill checklist types ──

export interface SkillCheckRowView {
  skillId: string
  name: string
  iconPath: string
  categoryName: string
  categoryId: string
  kind: 'active' | 'passive'
  officerCount: number
}

// ── Skill checklist functions ──

/**
 * Build a deduplicated skill list from all catalog entries.
 * Each skill appears once; officerCount is the number of officers who have it.
 * If a skill appears in both active and passive contexts, it is listed once
 * with the kind of its first occurrence.
 */
export function buildSkillCheckList(
  catalog: readonly RuntimeCatalogEntry[],
  skills: Readonly<Record<string, RuntimeSkill>>,
): SkillCheckRowView[] {
  const skillMap = new Map<string, SkillCheckRowView>()
  const officerCounts = new Map<string, number>()

  for (const officer of catalog) {
    const seen = new Set<string>()

    for (const sid of officer.activeSkills ?? []) {
      if (seen.has(sid)) continue
      seen.add(sid)

      officerCounts.set(sid, (officerCounts.get(sid) ?? 0) + 1)

      if (!skillMap.has(sid)) {
        const sk = skills[sid]
        if (sk) {
          skillMap.set(sid, {
            skillId: sid,
            name: sk.n,
            iconPath: sk.ip,
            categoryName: sk.cn,
            categoryId: sk.cat,
            kind: 'active',
            officerCount: 0,
          })
        }
      }
    }

    for (const sid of officer.passiveSkills ?? []) {
      if (seen.has(sid)) continue
      seen.add(sid)

      officerCounts.set(sid, (officerCounts.get(sid) ?? 0) + 1)

      if (!skillMap.has(sid)) {
        const sk = skills[sid]
        if (sk) {
          skillMap.set(sid, {
            skillId: sid,
            name: sk.n,
            iconPath: sk.ip,
            categoryName: sk.cn,
            categoryId: sk.cat,
            kind: 'passive',
            officerCount: 0,
          })
        }
      }
    }
  }

  // Merge officer counts
  for (const [skillId, row] of skillMap) {
    row.officerCount = officerCounts.get(skillId) ?? 0
  }

  // Sort by category then name
  return Array.from(skillMap.values()).sort((a, b) => {
    const catCmp = a.categoryName.localeCompare(b.categoryName, 'zh-Hans-CN')
    if (catCmp !== 0) return catCmp
    return a.name.localeCompare(b.name, 'zh-Hans-CN')
  })
}

/**
 * Filter a skill checklist by kind, categories, and search text.
 * All filters compose with AND semantics.
 */
export function filterSkillCheckList(
  list: readonly SkillCheckRowView[],
  kind: 'all' | 'active' | 'passive',
  categories: readonly string[],
  searchText: string,
): SkillCheckRowView[] {
  let result: readonly SkillCheckRowView[] = list

  if (kind !== 'all') {
    result = result.filter((s) => s.kind === kind)
  }

  if (categories.length > 0) {
    const catSet = new Set(categories)
    result = result.filter((s) => catSet.has(s.categoryId))
  }

  if (searchText.trim().length > 0) {
    const lower = searchText.trim().toLowerCase()
    result = result.filter(
      (s) => s.name.toLowerCase().includes(lower) || s.categoryName.toLowerCase().includes(lower),
    )
  }

  return result as SkillCheckRowView[]
}

// ── Expanded officers view ──

export interface SkillCheckExpandedOfficerView {
  officerId: string
  name: string
  portraitPath: string
  rarityName: string
  jobName: string
  visuals: OfficerVisualPaths
}

/**
 * Get all officers who possess a given skill, sorted by rarity (desc) then name.
 */
export function getOfficersForSkill(
  skillId: string,
  catalog: readonly RuntimeCatalogEntry[],
): SkillCheckExpandedOfficerView[] {
  const results: SkillCheckExpandedOfficerView[] = []

  for (const officer of catalog) {
    const has =
      (officer.activeSkills?.includes(skillId) ?? false) ||
      (officer.passiveSkills?.includes(skillId) ?? false)
    if (!has) continue

    results.push({
      officerId: officer.id,
      name: officer.name,
      portraitPath: officer.portraitPath,
      rarityName: officer.rarityName,
      jobName: officer.jobName,
      visuals: buildOfficerVisuals(officer),
    })
  }

  // Sort by rarity (S > A > B > C > D) then name
  const rarityOrder: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 }
  results.sort((a, b) => {
    const r = (rarityOrder[a.rarityName] ?? 5) - (rarityOrder[b.rarityName] ?? 5)
    if (r !== 0) return r
    return a.name.localeCompare(b.name, 'zh-Hans-CN')
  })

  return results
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
