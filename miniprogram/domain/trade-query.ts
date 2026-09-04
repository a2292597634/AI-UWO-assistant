import type { RuntimeTradeGoodIndexEntry } from '../contracts/runtime-data'

export interface TradeQueryCriteria {
  searchText: string
  categoryId: string | null
}

const normalizedText = (value: string): string => value.trim().toLocaleLowerCase()

export const queryTradeGoods = (
  entries: readonly RuntimeTradeGoodIndexEntry[],
  criteria: TradeQueryCriteria,
): RuntimeTradeGoodIndexEntry[] => {
  const searchText = normalizedText(criteria.searchText)

  return entries.filter((entry) => {
    if (criteria.categoryId !== null && entry.categoryId !== criteria.categoryId) {
      return false
    }

    if (searchText === '') {
      return true
    }

    return [entry.name, ...entry.searchAliases].some((value) =>
      normalizedText(value).includes(searchText),
    )
  })
}
