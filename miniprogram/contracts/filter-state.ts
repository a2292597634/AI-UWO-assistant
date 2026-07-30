/**
 * Catalog Filter State Contract
 *
 * Shared types consumed by the query engine, presenters, and page controllers.
 */

export type SkillKindFilter = 'all' | 'active' | 'passive'

export interface CatalogFilterState {
  searchText: string
  selectedRarities: string[]
  selectedTypes: string[]
  selectedGenders: string[]
  selectedLanguages: string[]
  selectedJobs: string[]
  selectedSkillCategories: string[]
  activeFilter: SkillKindFilter
}
