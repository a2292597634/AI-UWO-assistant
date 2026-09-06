# 目錄篩選範圍調整設計

## 背景

目錄頁目前把航海士的職業字典直接展開成多選篩選。職業選項數量過多，會讓底部篩選面板難以使用；本次產品決定不再提供職業篩選。

## 目標

1. 從目錄頁移除職業篩選的 UI、頁面狀態、事件契約與查詢邏輯。
2. 保留航海士資料上的 `jobId`、`jobName`，繼續用於卡片顯示、技能反向查詢及其他非目錄流程。
3. 保留稀有度、類型、性別、語言與技能分類篩選。
4. 為保留的多選篩選補齊 `role`、`aria-label` 與 `aria-checked` 語義，不新增視覺樣式。

## 非目標

- 不新增職業搜尋、分組、分頁或替代職業篩選方案。
- 不修改 `data/master/`、`archive/`、`miniprogram/generated/`、航海士編輯器中的職業欄位。
- 不修改與本次範圍無關的 UI、素材、依賴或資料管道。

## 設計

- `CatalogFilterState` 不再包含 `selectedJobs`；目錄查詢不再按職業過濾。
- `CatalogFilterField` 不再接受 `selectedJobs`，避免頁面事件重新引入已移除的篩選。
- 目錄頁不再載入或暴露 `dicts.jobs`，也不保留職業草稿 map。
- `CatalogViewMaps` 只保留仍有 UI 消費的選中狀態 map。
- 稀有度、類型、性別圖示選項補 `aria-checked`；語言與技能分類 chip 補 `role="button"`、可讀標籤及 `aria-checked`。

## 驗收標準

- 目錄 WXML 不包含職業篩選標題、`jobs` 迴圈或 `selectedJobs` 事件欄位。
- 目錄 filter state、query、presenter 與 page event contract 不再有 `selectedJobs` / `selectedJobMap`。
- 其他篩選的既有查詢測試維持通過。
- WXML 靜態契約能驗證保留篩選的無障礙屬性。
- `npm run verify`、`git diff --check` 通過。
