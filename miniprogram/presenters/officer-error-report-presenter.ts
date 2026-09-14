import type {
  MaintenanceDictionaries,
  MaintenanceOfficerData,
} from '../contracts/officer-maintenance'
import type {
  OfficerErrorReportDraft,
  OfficerErrorReportValidationError,
} from '../contracts/officer-error-report'
import type { RuntimeCatalogEntry, RuntimeDictionaryItem } from '../contracts/runtime-data'

export interface OfficerReportOfficerOption {
  readonly id: string
  readonly name: string
  readonly aliases: readonly string[]
  readonly meta: string
  readonly searchableText: string
}

export interface OfficerReportIdentityView {
  readonly id: string
  readonly name: string
  readonly portraitPath: string
  readonly rarityName: string
  readonly typeName: string
  readonly jobName: string
  readonly genderLabel: string
  readonly nationalityName: string
  readonly languageSummary: string
}

export type OfficerReportFieldErrors = Partial<
  Readonly<Record<keyof OfficerErrorReportDraft, string>>
>

const findDictionaryName = (
  items: readonly Readonly<RuntimeDictionaryItem>[],
  id: string,
): string => items.find((item) => item.id === id)?.name ?? '資料未收錄'

export const buildOfficerReportOptions = (
  catalog: readonly RuntimeCatalogEntry[],
): OfficerReportOfficerOption[] =>
  catalog.map((entry) => ({
    id: entry.id,
    name: entry.name,
    aliases: [...entry.searchAliases],
    meta: [entry.rarityName, entry.typeName, entry.jobName].join(' · '),
    searchableText: [entry.name, entry.id, ...entry.searchAliases].join(' '),
  }))

export const presentOfficerReportIdentity = (
  catalogEntry: RuntimeCatalogEntry,
  maintenanceData: MaintenanceOfficerData,
  dictionaries: MaintenanceDictionaries,
): OfficerReportIdentityView => {
  const languages = maintenanceData.languages.map(
    ({ languageId, level }) =>
      `${findDictionaryName(dictionaries.languages, languageId)} Lv.${String(level)}`,
  )
  const languageSummary =
    languages.length === 0
      ? '資料未收錄'
      : languages.length > 2
        ? `${languages.slice(0, 2).join('、')} 等 ${String(languages.length)} 種語言`
        : languages.join('、')

  return {
    id: catalogEntry.id,
    name: catalogEntry.name,
    portraitPath: catalogEntry.portraitPath,
    rarityName: catalogEntry.rarityName,
    typeName: catalogEntry.typeName,
    jobName: catalogEntry.jobName,
    genderLabel: catalogEntry.genderLabel,
    nationalityName: findDictionaryName(dictionaries.nationalities, maintenanceData.nationalityId),
    languageSummary,
  }
}

export const mapOfficerReportFieldErrors = (
  errors: readonly OfficerErrorReportValidationError[],
): OfficerReportFieldErrors => {
  const mapped: Partial<Record<keyof OfficerErrorReportDraft, string>> = {}
  errors.forEach(({ field, message }) => {
    if (!mapped[field]) mapped[field] = message
  })
  return mapped
}
