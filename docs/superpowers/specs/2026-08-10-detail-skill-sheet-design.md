# P9 詳情與技能面板收口設計規格

日期：2026-08-10
變更：P9「詳情與技能面板收口」
分支：`codex/phase-9-詳情與技能面板收口`

## 1. 目標

在不改變詳情資料、Controller、導航、圖片載入失敗回退與技能反查流程的前提下，收緊詳情頁的「人物檔案 + 技能優先」視覺層級，並統一技能詳情 Sheet 的標題、關閉操作熱區與底部安全區。

## 2. 已批准方案

採用「WXML/WXSS 收口、Controller 零改動」方案：

- 保留人物檔案首卡、主動技能、被動技能、語言與招募資訊的現有順序。
- 技能區不再使用「外層實體 Section + 內層實體技能卡」的重複容器；技能區只保留標題與技能列邊界。
- 語言與招募資訊維持次級區塊，避免把所有內容壓成同一種列表。
- 技能 Sheet 增加可識別的「技能詳情」層級提示，技能名稱作為主要標題，類型與分類作為輔助資訊。
- 關閉操作提供至少 `88rpx × 88rpx` 的可點擊熱區，操作文字不小於 `22rpx`。
- Sheet 使用 Design Foundation Token、`28rpx` 頂部圓角、Sheet 陰影與 `env(safe-area-inset-bottom)`。
- 長技能名稱、技能說明與等級效果允許換行，不以裁切維持單行。

## 3. 業務與資料邊界

必須保留：

- `presentDetail()` 產出的詳情資料與技能分組；
- `onSkillTap`、`onSheetDismiss`、`onReverseLookup` 事件；
- `/pages/catalog/index?skillId=...` 反向查詢導航；
- 航海士肖像、框架、稀有度、類型與技能圖示的失敗回退；
- 技能 Sheet 既有十級效果、缺失等級提示與反查入口。

本 Change 不修改：

- `miniprogram/subpkg-detail/pages/detail/index.ts` 的 Controller、資料來源或導航；
- `miniprogram/subpkg-detail/runtime/`、Presenter、Domain、Solver、資料與生成檔；
- 技能 Sheet 的 Component 方法與事件名稱；
- 任何新增位圖、依賴、遠程請求或 Node.js Runtime API。

為了讓 `generate:check` 能在詳情頁 WXML/WXSS 變更時正常工作，若既有檢查命令把整個 `miniprogram/subpkg-detail/` 誤當成生成目錄，只允許在 `package.json` 收窄差異檢查到實際生成的 `details-*.js`、`detail-index.js` 與 `detail-loaders.js`。

## 4. 視覺規則

### 4.1 詳情頁

- `dossier-card` 保留為人物檔案首卡，使用 `surface`、`border-subtle`、`radius-card` 與必要的單層層級。
- 技能 Section 以透明文流承載標題，技能列使用單層 `surface`、細邊框與 `radius-control`。
- 既有技能列的完整說明入口保留，`查看詳情` 文字使用至少 `22rpx`。
- 新增或重寫的樣式使用 `--uwo-*` Token，不新增品牌色、字體或大型背景。

### 4.2 技能 Sheet

- Header 依序顯示「技能詳情」眉標、技能名稱、技能類型與分類。
- 關閉操作保留「關閉」可見文字，並將可點擊區擴大到至少 `88rpx × 88rpx`。
- Sheet 內容保留技能說明、等級列表與反向查詢入口；底部 padding 使用 `calc(... + env(safe-area-inset-bottom))`。
- Sheet 只使用一層浮層容器，不增加外層卡片或新的 Sheet 元件。
- 等級描述使用 `overflow-wrap: anywhere`，長文本不得造成頁面級橫向溢出。

## 5. 測試與驗收

新增或修改頁面契約測試，保護：

- 詳情頁保留人物檔案與主動／被動技能順序；
- 技能區使用扁平容器鉤子，不再由外層 Section 提供重複實體卡片樣式；
- 技能列與 Sheet 關閉／反查事件仍存在；
- Sheet 標題層級、`88rpx` 關閉熱區、`22rpx` 操作文字與安全區樣式存在；
- 現有詳情資料與圖片失敗回退測試繼續通過。

手動驗收寬度：`320px`、`375px`、`393px`、`430px`。需檢查長技能名稱、長效果說明、關閉熱區、Home Indicator 安全區與頁面級橫向溢出。
