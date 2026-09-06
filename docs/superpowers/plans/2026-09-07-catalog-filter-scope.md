# 目錄移除職業篩選實施計畫

> 本計畫在 `codex/phase-6-review-followups` 分支執行，遵循先測試、後實作的 TDD 流程。

## 1. 補充失敗測試

- 調整 filter state、catalog query、presenter 測試，明確表達目錄不再有職業篩選。
- 更新目錄 WXML 契約：職業篩選不存在，語言、技能分類及圖示篩選具備無障礙屬性。
- 執行聚焦測試，確認新契約在目前程式上先失敗。

## 2. 移除目錄職業篩選鏈路

- 從 `CatalogFilterState`、空狀態、活動篩選計算及 `queryCatalog` 移除職業欄位與過濾分支。
- 從目錄 page data、草稿資料、map、初始化與清除流程移除職業狀態。
- 從 `CatalogFilterField` 移除職業事件欄位。
- 從 presenter 的 view map 與 page data 型別移除職業 map。
- 保留 catalog row 的職業名稱與其他流程所需的職業字典資料。

## 3. 補齊保留篩選的無障礙語義

- 圖示篩選加入 `aria-checked`。
- 語言與兩個技能分類區塊的 chip 加入 `role`、`aria-label`、`aria-checked`。
- 不改動既有 token、尺寸或視覺樣式。

## 4. 驗證與交付

- 通過聚焦測試、`npm run verify` 與 `git diff --check`。
- 更新剩餘審查任務文件，標記 P1-07 與 P2-05，保留 P2-04 為後續獨立批次。
- 提交前展示變更檔案、驗證結果與擬用 commit message，等待用戶確認後才 commit/push。
