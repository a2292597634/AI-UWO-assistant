import { readFileSync } from 'node:fs'
import type { CanonicalSkill, DictionaryItem } from '../import/types'
import { loadCanonicalOfficers } from './load-officers'

export interface OfficerReferenceData {
  rarityIds: string[]
  typeIds: string[]
  genderIds: string[]
  jobIds: string[]
  nationalityIds: string[]
  languageIds: string[]
  cityIds: string[]
  requirementIds: string[]
  skillIds: string[]
  officerIds: string[]
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

const ids = (items: DictionaryItem[] | undefined): string[] => [
  ...new Set((items ?? []).map((item) => item.id)),
]

const shortLanguageId = (id: string): string => id.replace(/^language_/, '')

/** Build the allow-list consumed by the officer-custom CloudBase function. */
export const buildOfficerReferenceData = (masterDir = 'data/master'): OfficerReferenceData => {
  const dictionaries = readJson<Record<string, DictionaryItem[]>>(`${masterDir}/dictionaries.json`)
  const skills = readJson<CanonicalSkill[]>(`${masterDir}/skills.json`)
  const officers = loadCanonicalOfficers(masterDir)

  return {
    rarityIds: ids(dictionaries.rarities),
    typeIds: ids(dictionaries.types),
    genderIds: ids(dictionaries.genders),
    jobIds: ids(dictionaries.jobs),
    nationalityIds: ids(dictionaries.nationalities),
    languageIds: ids(dictionaries.languages).map(shortLanguageId),
    cityIds: ids(dictionaries.cities),
    requirementIds: ids(dictionaries.requirements),
    skillIds: [...new Set(skills.map((skill) => skill.id))],
    officerIds: officers.map((officer) => officer.id),
  }
}

/** 維護工單沿用 canonical 完整 ID，並攜帶審核衝突檢查所需版本。 */
export const buildMaintenanceReferenceData = (masterDir = 'data/master') => {
  const reference = buildOfficerReferenceData(masterDir)
  const dictionaries = readJson<Record<string, DictionaryItem[]>>(`${masterDir}/dictionaries.json`)
  const dataset = readJson<{ contentVersion: string }>(`${masterDir}/dataset.json`)
  return {
    ...reference,
    languageIds: ids(dictionaries.languages),
    skillCategoryIds: ids(dictionaries.skillCategories),
    dataVersion: dataset.contentVersion,
  }
}
