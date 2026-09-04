/** 航海士投稿列表与状态的纯 Presenter。 */

import type {
  OfficerSubmissionSummary,
  SubmissionStatusView,
  SubmissionStatusViewInput,
} from '../contracts/officer-submission'
import type {
  RuntimeCatalogEntry,
  RuntimeDictionaries,
  RuntimeSkill,
} from '../contracts/runtime-data'

export interface SubmissionOption {
  id: string
  name: string
}

export interface SubmissionOptions {
  rarities: SubmissionOption[]
  types: SubmissionOption[]
  genders: SubmissionOption[]
  jobs: SubmissionOption[]
  nationalities: SubmissionOption[]
  languages: SubmissionOption[]
  cities: SubmissionOption[]
  requirements: SubmissionOption[]
  officers: SubmissionOption[]
  skills: SubmissionOption[]
}

const byName = (left: SubmissionOption, right: SubmissionOption): number =>
  left.name.localeCompare(right.name, 'zh-Hant')

const mapOptions = (items: readonly { id: string; name: string }[]): SubmissionOption[] =>
  items.map(({ id, name }) => ({ id, name }))

const sortedOptions = (items: readonly { id: string; name: string }[]): SubmissionOption[] =>
  mapOptions(items).sort(byName)

export const buildSubmissionOptions = (
  dictionaries: RuntimeDictionaries,
  skills: Readonly<Record<string, RuntimeSkill>>,
  catalog: readonly RuntimeCatalogEntry[],
): SubmissionOptions => ({
  rarities: mapOptions(dictionaries.rarities),
  types: mapOptions(dictionaries.types),
  genders: mapOptions(dictionaries.genders),
  jobs: sortedOptions(dictionaries.jobs),
  nationalities: sortedOptions(dictionaries.nationalities),
  languages: sortedOptions(dictionaries.languages),
  cities: sortedOptions(dictionaries.cities),
  requirements: sortedOptions(dictionaries.requirements),
  officers: sortedOptions(catalog),
  skills: Object.values(skills)
    .map((skill) => ({ id: skill.id, name: skill.n }))
    .sort(byName),
})

export const filterSubmissionOptions = (
  options: readonly SubmissionOption[],
  query: string,
  limit = 80,
): SubmissionOption[] => {
  const normalized = query.trim().toLocaleLowerCase('zh-Hant')
  const filtered = normalized
    ? options.filter((option) => option.name.toLocaleLowerCase('zh-Hant').includes(normalized))
    : options
  return filtered.slice(0, limit)
}

export const findSubmissionOptionIndex = (
  options: readonly SubmissionOption[],
  id: string,
): number => {
  const index = options.findIndex((option) => option.id === id)
  return index >= 0 ? index : 0
}

export interface SubmissionSummaryView extends OfficerSubmissionSummary {
  statusLabel: string
  statusReason: string
  statusTone: 'review' | 'error' | 'success'
  statusClass: 'achieved' | 'review' | 'error'
  updatedAtLabel: string
}

const formatSubmissionDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

export const buildSubmissionSummaryView = (
  summary: OfficerSubmissionSummary,
): SubmissionSummaryView => {
  const status = buildSubmissionStatusView(summary)
  return {
    ...summary,
    statusLabel: status.label,
    statusReason: status.reason,
    statusTone: status.tone,
    statusClass: status.tone === 'success' ? 'achieved' : status.tone,
    updatedAtLabel: formatSubmissionDate(summary.updatedAt),
  }
}

export const buildSubmissionStatusView = (
  input: SubmissionStatusViewInput,
): SubmissionStatusView => {
  switch (input.status) {
    case 'pending':
      return { label: '待審核', reason: '', tone: 'review' }
    case 'approved':
      return { label: '已審核，待發布', reason: '', tone: 'review' }
    case 'published':
      return { label: '已發布', reason: '', tone: 'success' }
    case 'rejected':
      return { label: '已駁回', reason: input.rejectReason?.trim() ?? '', tone: 'error' }
  }
}
