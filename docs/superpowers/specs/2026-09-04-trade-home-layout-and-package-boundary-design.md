# 交易品首頁入口布局與主包邊界修正設計

## 背景

貿易品淡旺季查詢已合併到小程序，但首頁入口目前仍使用四欄布局，且交易查詢頁依賴的部分 TypeScript 檔案位於 `miniprogram/` 根目錄。微信開發者工具依目錄邊界打包，導致交易功能程式被編譯進主包，觸發主包大小與「主包內未使用 JS」檢查。

## 已確認需求

- 首頁主要功能圖標固定每行 3 個。
- 主要功能入口順序為：航海士名鑑、戰鬥模擬艦隊、冒險模擬艦隊、交易品淡旺季查询。
- 因交易入口是第 4 個主要功能，必須顯示在第二行第一列。
- 交易入口名稱顯示為「交易品淡旺季查询」。
- 「資料維護」維持目前的低頻次級入口，不改變其功能與路由。
- 不修改貿易品原始快照、`data/master/` 或生成資料內容，不新增依賴。

## 設計方案

### 首頁布局

首頁 `modules` 將交易入口由第 2 項調整為第 4 項；WXML 仍將前 4 項渲染為主要功能網格。主要網格項目寬度由 `25%` 改為三等分，保留現有圖標、點擊事件、錯誤回退和觸控狀態。這樣前 3 項位於第一行，交易入口位於第二行第一列。

次級資料維護入口仍使用現有獨立區塊，避免把低頻維護功能與核心查詢功能混在同一優先級網格內。

### 交易功能分包邊界

將只由 `subpkg-trade` 使用的運行時程式移入交易分包：

- `miniprogram/domain/game-month.ts` → `miniprogram/subpkg-trade/domain/game-month.ts`
- `miniprogram/domain/trade-query.ts` → `miniprogram/subpkg-trade/domain/trade-query.ts`
- `miniprogram/domain/trade-season.ts` → `miniprogram/subpkg-trade/domain/trade-season.ts`
- `miniprogram/presenters/trade-season-presenter.ts` → `miniprogram/subpkg-trade/presenters/trade-season-presenter.ts`

交易分包頁面及 Presenter 的相對引用同步調整；共用的 `contracts/runtime-data.ts` 保留在主包源碼根目錄，因為它只提供型別契約，編譯後不產生運行時 JS。禁止使用 `packOptions.ignore` 掩蓋依賴，也不複製兩份運行時邏輯。

### 上傳錯誤處理

修正後，交易頁面與其運行時依賴位於同一 `subpkg-trade` 目錄，微信開發者工具會將它們歸入交易分包；主包不再包含交易查詢的未使用 JS。主包大小由實際可上傳的主包內容重新驗證，並保留本地已有的 `project.private.config.json`，不刪除或改動開發者私有配置。

## 測試與驗收

實施前先新增會失敗的契約測試，覆蓋：

- 首頁主要入口順序、交易入口名稱與三欄寬度。
- 交易運行時模組存在於 `subpkg-trade`，根目錄不再存在同名運行時源檔。
- 交易頁面仍能透過相對引用載入查詢、月份計算、季節判定與 Presenter。

實施後執行：

- 相關 Vitest 測試及完整 `npm run verify`。
- `npm run check:miniprogram-size`，確認交易分包不被計入主包。
- `npm run check:runtime-network`，確保沒有新增網路請求。
- `git diff --check`，確認提交內容沒有新增格式問題。
- 微信開發者工具重新編譯主工作區，確認代碼品質檢查不再列出 3 個交易 JS；本地主包私有配置造成的大小差異另行記錄，不修改該配置。

## 不在本次範圍

- 不調整貿易品查詢頁或詳情頁的資料內容與矩陣展示。
- 不重構其他主包、分包或 Cloud Function。
- 不修改主包既有大型生成資料的資料結構。
- 不新增依賴、遠程請求或上傳忽略規則。
