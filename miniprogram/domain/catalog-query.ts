/**
 * Catalog Query Engine
 *
 * Pure TypeScript: takes catalog data + filter state, returns filtered
 * results. Does NOT modify input arrays. No dependency on wx, Page,
 * setData, filesystem, or generated data.
 */

import type { RuntimeCatalogEntry, RuntimeSkill } from '../contracts/runtime-data'
import type { CatalogFilterState } from '../contracts/filter-state'

/**
 * Filter catalog entries by all active filter state.
 * Returns a new array — never mutates the input.
 * Results preserve input order.
 */
export function queryCatalog(
  catalog: readonly RuntimeCatalogEntry[],
  skills: Readonly<Record<string, RuntimeSkill>>,
  state: Readonly<CatalogFilterState>,
): RuntimeCatalogEntry[] {
  let result = catalog

  // Rarity (OR)
  if (state.selectedRarities.length > 0) {
    const sel = new Set(state.selectedRarities)
    result = result.filter((o) => sel.has(o.rarityId))
  }

  // Type (OR)
  if (state.selectedTypes.length > 0) {
    const sel = new Set(state.selectedTypes)
    result = result.filter((o) => sel.has(o.typeId))
  }

  // Gender (OR)
  if (state.selectedGenders.length > 0) {
    const sel = new Set(state.selectedGenders)
    result = result.filter((o) => sel.has(o.genderId))
  }

  // Language (AND — must have ALL selected languages)
  if (state.selectedLanguages.length > 0) {
    const selLangs = state.selectedLanguages
    result = result.filter((o) =>
      selLangs.every((languageId) => (o.languages ?? []).indexOf(languageId) >= 0),
    )
  }

  // Job (OR)
  if (state.selectedJobs.length > 0) {
    const sel = new Set(state.selectedJobs)
    result = result.filter((o) => sel.has(o.jobId))
  }

  // Skill category (AND) + active/passive combo
  if (state.selectedSkillCategories.length > 0) {
    const selCat = state.selectedSkillCategories
    const af = state.activeFilter
    result = result.filter((o) => {
      const candidates = resolveSkillCandidates(o, af)
      return selCat.every((cat) =>
        candidates.some((skillId) => {
          const s = skills[skillId]
          return s ? s.cat === cat : false
        }),
      )
    })
  } else if (state.activeFilter === 'active') {
    // Active-only without category filter
    result = result.filter((o) => (o.activeSkills ?? []).length > 0)
  } else if (state.activeFilter === 'passive') {
    // Passive-only without category filter
    result = result.filter((o) => (o.passiveSkills ?? []).length > 0)
  }

  // Name search (AND with other filters)
  const search = (state.searchText ?? '').trim()
  if (search) {
    const q = search.toLowerCase()
    result = result.filter((o) => {
      // Match name
      if ((o.name ?? '').toLowerCase().indexOf(q) >= 0) return true
      // Match search aliases
      const aliases = o.searchAliases ?? []
      for (let i = 0; i < aliases.length; i++) {
        if (aliases[i]!.toLowerCase().indexOf(q) >= 0) return true
      }
      return false
    })
  }

  return result as RuntimeCatalogEntry[]
}

/** Resolve which skill IDs to check based on active/passive filter. */
function resolveSkillCandidates(
  o: RuntimeCatalogEntry,
  activeFilter: string,
): readonly string[] {
  if (activeFilter === 'active') {
    return o.activeSkills ?? []
  }
  if (activeFilter === 'passive') {
    return o.passiveSkills ?? []
  }
  return [...(o.activeSkills ?? []), ...(o.passiveSkills ?? [])]
}
