# 大流行時刻表頁面精簡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將大流行功能的使用者文案改為時刻表語義，移除日期／海域／事件類型／查下一次控制，縮短首屏，並使首頁新圖示匹配現有徽章風格。

**Architecture:** 保留目前週期、範圍、分段、Presenter、事件詳情和 Runtime 資料流程，只精簡頁面展示與頁面控制器狀態。首頁新圖示更新權威素材主源，再由既有 UI Asset Pipeline 產生本地運行圖示。

**Tech Stack:** 微信小程序 WXML／WXSS、TypeScript、Vitest、既有 `sharp` UI Asset Pipeline、ImageGen、`miniprogram-automator` 頁面驗收器；不新增依賴。

## Global Constraints

- `archive/` 唯讀；`data/master/` 是唯一權威資料源；`miniprogram/generated/` 只能由生成工具更新。
- UI、WXML 和 WXSS 遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md` 的 Token、字體、間距、圓角、觸控和安全區規範。
- 頁面變更遵守 `docs/superpowers/specs/2026-09-16-miniprogram-review-html-report-design.md`，先執行 `npm run devtools:doctor`，修改後跑 iterate，交付前跑 final 並檢視 HTML 截圖。
- 所有 UI 文字和文檔使用繁體中文；WXML／WXSS 類名使用英文 BEM。
- 不新增依賴、遠程資源、`wx.request`、`wx.cloud` 或 Node.js Runtime API；不得直接修改素材生成輸出。
- 保留遊戲週期與 UTC+8 計算；移除日期 chips、海域／事件類型選單和下一次查詢頁面流程；保留範圍、矩陣／日程切換、分段翻頁、詳情與刷新。

## Setup

- [x] 在隔離工作樹執行 `npm ci`；未更動 package manifest 或 lockfile。
- [x] 將主工作區 Git 忽略目錄中的三張冒險技能測試素材複製到隔離工作樹的相同路徑；原工作區素材未更動，也不納入 Git。
- [x] 基線 `npm test` 通過：175 個測試檔、2,219 項測試。

---

## File Map

### 新增

- `docs/superpowers/specs/2026-09-26-major-event-schedule-page-polish-design.md`：本次已確認的文案、控制項、圖示和驗收規格。
- `docs/superpowers/plans/2026-09-26-major-event-schedule-page-polish.md`：本實施計畫。

### 修改

- `miniprogram/pages/home/index.ts`：首頁入口名稱。
- `miniprogram/subpkg-trade/pages/popularity/index.wxml`：頁面文案與控制結構。
- `miniprogram/subpkg-trade/pages/popularity/index.wxss`：頁首縮高及移除日期、篩選、下一次結果樣式。
- `miniprogram/subpkg-trade/pages/popularity/index.ts`：移除日期／篩選／下一次頁面狀態和處理器，保留分段索引、範圍和詳情流程。
- `data/master/ui-assets/feature-major-events-source.png`、`data/master/ui-assets/major-events/asset-prompts.md`：首頁圖示主源和生成記錄。
- `miniprogram/assets/ui/feature-major-events.png`、`data/audit/ui-asset-build-report.json`：透過既有素材建置工具生成。
- `tests/pages/home-page.test.ts`、`tests/pages/major-event-page.test.ts`、`tests/integration/major-event-feature-contract.test.ts`：首頁名稱、控制器及 WXML 契約。
- `tools/miniprogram-review/scenarios/major-event-forecast.json`、`tools/miniprogram-review/scenarios/major-event-filter-empty.json`、`tools/miniprogram-review/scenarios/home-visual.json`、`tests/miniprogram-review/scenario.test.ts`：移除失效操作並更新場景名稱和步驟。
- `docs/superpowers/specs/2026-09-24-major-event-forecast-design.md`、`docs/superpowers/specs/2026-09-25-major-event-game-schedule-display-design.md`：加註本次文檔取代的使用者文案／控制／入口圖示決策，保留來源與時間計算規則。

---

### Task 1: 先更新使用者可見契約與頁面測試

**Files:**

- Modify: `tests/pages/major-event-page.test.ts`
- Modify: `tests/pages/home-page.test.ts`
- Modify: `tests/integration/major-event-feature-contract.test.ts`

- [x] **Step 1: 更新首頁入口名稱斷言**

將首頁測試中兩處 `name: '大流行預測'` 改為 `name: '大流行時刻表'`，並確認入口 ID、圖示路徑與導覽路由仍保持原值。

- [x] **Step 2: 更新大流行頁面初始狀態斷言**

在頁面控制器測試中要求 `wx.setNavigationBarTitle` 使用 `大流行時刻表`；初始摘要包含日程數／時刻語義、不含 `預測`；矩陣仍有所有含事件的海域列。

- [x] **Step 3: 以新契約替換已移除控制項的測試**

移除對 `dateOptions`、`selectedDateKey`、`onDateTap`、區域／類型篩選處理器及 `onNextOccurrenceTap` 的頁面契約。新增斷言：WXML 不含 `major-events-dates`、`major-events-filters`、`major-events-filter-menu`、`major-events-next-button` 或 `major-events-next-result`；仍包含三種範圍、矩陣／日程切換和分段前後箭頭。

- [x] **Step 4: 覆蓋分段索引刷新行為**

使用現有頁面測試計時器與 `onSegmentTap`，確認切換到後續段後觸發 `onShow` 分鐘刷新仍保留該段；把範圍改為 24 小時後索引回到 `0`，超界索引會限制在最後一段。

- [x] **Step 5: 以 TDD 執行目標測試並確認 RED**

Run: `npx vitest run tests/pages/home-page.test.ts tests/pages/major-event-page.test.ts tests/integration/major-event-feature-contract.test.ts`

Expected: 因首頁名稱、頁面標題及 WXML 控制項契約尚未更新而失敗，不得因測試語法或型別錯誤失敗。

### Task 2: 改寫時刻表文案並精簡頁面控制器與版面

**Files:**

- Modify: `miniprogram/pages/home/index.ts`
- Modify: `miniprogram/subpkg-trade/pages/popularity/index.wxml`
- Modify: `miniprogram/subpkg-trade/pages/popularity/index.wxss`
- Modify: `miniprogram/subpkg-trade/pages/popularity/index.ts`
- Modify: `tests/pages/home-page.test.ts`
- Modify: `tests/pages/major-event-page.test.ts`
- Modify: `tests/integration/major-event-feature-contract.test.ts`

**Page state changes:**

- 從頁面資料與 `MajorEventPageContext` 移除 `selectedDateKey`、`dateOptions`、海域／事件類型選取、選單狀態、選項清單、篩選標籤和 `nextOccurrence*` 欄位。
- 移除只服務日期 chips 的 `buildGameDateOptions` 和 `firstSegmentForGameDate`，以及只供它們使用的 `gameDateKey`／`gameDateBounds` 匯入。
- 保留 `matrixSegmentCount`、範圍、段索引、所有事件投影、日程投影、圖示 fallback、詳情快照及刷新 timer。
- `refreshPage` 按目前範圍計算段數，將既有 `segmentIndex` 限制於有效範圍；範圍切換主動設為 `0`。事件查詢以 `zoneId: null`、`eventTypeId: null` 載入全部事件。
- 頁面事件點擊只從目前矩陣／日程 `eventItems` 找到詳情；不再讀取下一次查詢結果。

- [x] **Step 1: 更新首頁、頁首、範圍和視圖文案**

首頁入口與頁面／導航標題使用「大流行時刻表」；範圍標籤和檢視方式使用日程語義。摘要改為 `未來 N 小時 · X 項日程 · Y/18 個海域`。

- [x] **Step 2: 移除日期、篩選與下一次查詢 WXML 區塊**

刪除 `.major-events-dates`、`.major-events-filters` 及兩個 filter menu、`.major-events-next-button` 和 `.major-events-next-result`；保留 `.matrix-segment-control` 和 `.matrix-segment-control__time-range`。

- [x] **Step 3: 移除已刪除區塊 WXSS 並收斂頁首**

刪除日期 chips、filter、filter menu、next button/result 專用規則；`.major-events-header` 設為 `min-height: 184rpx`，使用既有間距 Token；範圍、視圖與分段控制維持至少 `88rpx` 熱區。

- [x] **Step 4: 移除 page data、handlers 和死分支**

刪除日期構造及跳日 helper、篩選處理器、`onNextOccurrenceTap`、對應 page fields 和 next result 的 icon fallback 分支。範圍切換將 `segmentIndex` 設為 `0`，view 切換只更新 `activeView`，分鐘刷新保留有效段索引。

- [x] **Step 5: 統一矩陣、行程、空狀態、詳情和無障礙文案**

將「預測範圍／檢視方式／每格預測／沒有預測／預測事件詳情／預測時間」改為時刻表、日程或時段語義。保留「可能仍在進行」及城鎮活動／事件預算對實際狀態的說明。

- [x] **Step 6: 跑目標測試並完成 RED-GREEN**

Run: `npx vitest run tests/pages/home-page.test.ts tests/pages/major-event-page.test.ts tests/integration/major-event-feature-contract.test.ts`

Expected: 首頁名稱、保留控制、移除控制、段索引刷新、詳情開關和所有海域呈現契約通過。

### Task 3: 讓頁面驗收場景反映移除後的操作

**Files:**

- Modify: `tools/miniprogram-review/scenarios/major-event-forecast.json`
- Modify: `tools/miniprogram-review/scenarios/major-event-filter-empty.json`
- Modify: `tools/miniprogram-review/scenarios/home-visual.json`
- Modify: `tests/miniprogram-review/scenario.test.ts`

- [x] **Step 1: 將矩陣場景改為時刻表流程**

將場景名稱與摘要斷言更新為「大流行時刻表」；移除日期 chip、海域／類型選單及 next 操作；保留七時段矩陣、段翻頁、7 天範圍、日程列表、詳情和截圖步驟。

- [x] **Step 2: 移除依賴篩選才可觸發的空狀態場景**

移除 `major-event-filter-empty.json` 和只用來斷言此場景／截圖的測試；目前離線來源總有週期日程，沒有日期／類型篩選後無法穩定產生空集合，避免以假空狀態冒充實際驗收。

- [x] **Step 3: 更新首頁場景名稱斷言並檢查場景 JSON**

首頁場景改斷言「大流行時刻表」。執行 `npx vitest run tests/miniprogram-review/scenario.test.ts`，確認保留場景仍有有效入口、selectors 和步驟。

### Task 4: 重繪首頁入口圖示並經由素材 Pipeline 產生運行檔

**Files:**

- Modify: `data/master/ui-assets/feature-major-events-source.png`
- Modify: `data/master/ui-assets/major-events/asset-prompts.md`
- Generate: `miniprogram/assets/ui/feature-major-events.png`
- Generate: `data/audit/ui-asset-build-report.json`

- [x] **Step 1: 以既有首頁圖示作畫風參考重繪羅盤時鐘徽章**

使用內建 ImageGen 編輯首頁圖示主源：保留羅盤與時鐘主題，增加和名鑑／戰鬥／冒險／交易／資料維護相同的深色方形徽章、黃銅描邊、立體高光；外角透明，不生成字、數字、Logo 或水印。將選定輸出存回 `data/master/ui-assets/feature-major-events-source.png`。

- [x] **Step 2: 檢視主源並更新生成記錄**

使用 `view_image` 核對圖形語義、徽章結構、透明角落與視覺占用，再將 prompt 記錄改為新的徽章風格和約束。

- [x] **Step 3: 執行既有素材構建與包體檢查**

Run: `npm run assets:ui`

Expected: 生成 `96×96`、16 色本地 PNG，單檔小於 `4 KiB`，只替換大流行首頁圖示及相應素材報告。

- [x] **Step 4: 驗證素材確定性和主包限制**

Run: `npm run assets:ui:check`

Run: `npm run check:miniprogram-size`

Expected: 素材生成檢查和小程序主包大小門禁通過。

### Task 5: 更新設計資料並完成頁面驗收

**Files:**

- Modify: `docs/superpowers/specs/2026-09-25-major-event-game-schedule-display-design.md`
- Modify: `docs/superpowers/specs/2026-09-24-major-event-forecast-design.md`
- Modify: `docs/superpowers/specs/2026-09-26-major-event-schedule-page-polish-design.md`
- Verify: `miniprogram/pages/home/` 和 `miniprogram/subpkg-trade/pages/popularity/`

- [x] **Step 1: 註明新規格取代舊控制決策**

在 2026-09-24 和 2026-09-25 設計規格開頭增加指向本次設計的更新註記，明確顯示名稱、日期 chips、篩選、查下一次和首頁入口圖示已改由本次規格取代；原有 Runtime 資料、UTC+8 與矩陣計算規則仍有效。

- [x] **Step 2: 跑設計資料檢查**

Run: `npm run data:check`

Expected: 素材主源和其他 canonical data 通過資料檢查。

- [x] **Step 3: 確認 DevTools 並執行迭代頁面驗收**

Run: `npm run devtools:doctor`

Run: `npm run devtools:changed -- --mode iterate --summary "精簡大流行時刻表頁面並統一首頁圖示" --note "核對文案、保留控制、移除無用篩選和首頁徽章一致性"`

Expected: 首頁與大流行頁場景通過；檢視 HTML 報告首頁和矩陣截圖，並在 320、375、393、430px 檢查首屏、長文案和矩陣寬度。

- [x] **Step 4: 執行完整倉庫驗證和最終頁面驗收**

Run: `npm run verify`

Run: `git diff --check`

Run: `npm run devtools:changed -- --mode final --summary "大流行時刻表頁面與首頁圖示最終驗收"`

Expected: 完整驗證通過；最終 HTML 報告狀態 `passed` 並含首頁與大流行時刻表修改後截圖。讀取並檢視報告與截圖後交付；不提交或推送，除非使用者另外要求。
