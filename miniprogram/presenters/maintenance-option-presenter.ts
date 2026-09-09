/** 航海士資料維護共用選擇器的純展示模型與搜尋函式。 */

/** 可供維護表單搜尋、呈現與回傳的單一實體選項。 */
export interface MaintenanceEntityOption {
  readonly id: string
  readonly name: string
  readonly aliases: readonly string[]
  readonly meta: string
  /** 已包含名稱、別名、ID 與分類資訊的搜尋文字（建議建立時先正規化）。 */
  readonly searchableText: string
}

const EMPTY_QUERY_LIMIT = 80

/**
 * 依名稱、別名或 ID 搜尋維護選項。
 *
 * 搜尋結果會優先排列名稱以前綴命中的選項，再以繁體中文名稱排序；
 * 空白查詢只回傳首批結果，避免大型技能字典一次塞入 picker。
 */
export const searchMaintenanceOptions = (
  options: readonly MaintenanceEntityOption[],
  query: string,
): MaintenanceEntityOption[] => {
  const normalized = query.trim().toLocaleLowerCase()
  const filtered = options
    .filter(
      (option) => !normalized || option.searchableText.toLocaleLowerCase().includes(normalized),
    )
    .sort((left, right) => {
      const leftRank = left.name.toLocaleLowerCase().startsWith(normalized) ? 0 : 1
      const rightRank = right.name.toLocaleLowerCase().startsWith(normalized) ? 0 : 1
      return leftRank - rightRank || left.name.localeCompare(right.name, 'zh-Hant')
    })

  return normalized ? filtered : filtered.slice(0, EMPTY_QUERY_LIMIT)
}
