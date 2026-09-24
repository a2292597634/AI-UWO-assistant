# 貿易品分類圖示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 為貿易品淡旺季查詢的全部 20 個分類新增一套本地插畫圖示，並顯示於分類篩選按鈕和貿易品詳情頁。

**Architecture:** 圖示以本地 PNG 放在 `subpkg-trade`，由共用的分類 ID 映射函式供清單頁和詳情 presenter 取得路徑。清單和詳情只增加展示資料與 WXML/WXSS；商品資料、既有商品圖、搜尋與淡旺季邏輯維持原樣。擴充現有 trade 頁面驗收場景，使自動截圖涵蓋分類篩選和詳情分類圖示。

**Tech Stack:** 微信小程序 WXML/WXSS、TypeScript、既有 `sharp`、ImageGen、微信開發者工具頁面驗收器；不新增依賴。

## Global Constraints

- `archive/` 唯讀；`data/master/` 是唯一權威資料源；`miniprogram/generated/` 只能由工具生成，禁止手動修改。
- 涉及 UI、WXML 或 WXSS 時，遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md` 的 Token、字體、間距、圓角、陰影、狀態、觸控和安全區規範。
- 頁面變更遵守 `docs/superpowers/specs/2026-09-16-miniprogram-review-html-report-design.md`，使用 `npm run devtools:doctor`、迭代驗收與最終驗收報告。
- 所有新增 UI 文字與文檔使用繁體中文；WXML/WXSS 類名使用英文 BEM。
- 小程序運行時禁止使用 `wx.request`、`wx.cloud`、遠程 URL 或 Node.js API；不新增依賴。
- 不修改既有使用者工作區變更；不提交檔案，除非先列出變更、驗證結果和 commit message 並取得使用者確認。
- 本任務只增補 UI 圖示；不改商品分類資料、商品圖示、搜尋、篩選、導航、月份或港口矩陣行為。UI 頁面使用 DevTools 驗證，不新增或執行單元測試。

---

## File Map

### 新增

- `miniprogram/subpkg-trade/assets/category-icons/01.png` 至 `20.png`：20 張透明背景分類插畫，檔名即兩位數分類 ID；各類分別生成，輸出為獨立 128×128 PNG。
- `miniprogram/subpkg-trade/trade-category-icons.ts`：分類 ID 至分包內圖示路徑的唯一本地映射。

### 修改

- `miniprogram/subpkg-trade/pages/index/index.ts`：分類 ViewModel 增加 `iconPath`。
- `miniprogram/subpkg-trade/pages/index/index.wxml`：每個分類按鈕顯示對應圖示；「全部」不顯示分類圖示。
- `miniprogram/subpkg-trade/pages/index/index.wxss`：改為四欄按鈕排列，增加圖示尺寸和間距。
- `miniprogram/subpkg-trade/presenters/trade-season-presenter.ts`：詳情標題 ViewModel 增加 `categoryIconPath`。
- `miniprogram/subpkg-trade/pages/detail/index.ts`：空 ViewModel 為 `categoryIconPath` 提供空值。
- `miniprogram/subpkg-trade/pages/detail/index.wxml`：在分類文字旁顯示分類圖示。
- `miniprogram/subpkg-trade/pages/detail/index.wxss`：設定分類圖示與文字的水平排列。
- `tools/miniprogram-review/scenarios/trade-visual.json`：擴大 watchPaths 並驗收清單與詳情圖示。

---

### Task 1: 製作並加入 20 張分類圖示

**Files:**

- Create: `miniprogram/subpkg-trade/assets/category-icons/01.png` 至 `20.png`

- [x] **Step 1: 檢查開發者工具連線**

Run: `npm run devtools:doctor`

Expected: 顯示目前可用的微信開發者工具狀態，或明確輸出環境阻塞原因。

- [x] **Step 2: 以參考圖生成一致的圖示稿**

針對規格表中的每個分類分別呼叫內建 ImageGen，每次只生成一個透明背景、正方形的獨立圖示。每次固定使用相同畫風描述：沿用使用者參考圖中的溫暖、柔和立體遊戲物品圖示質感，色彩飽和但低對比、上左方柔光、清楚輪廓和小面積投影；只生成指定的單一物件，不生成按鈕、文字或手機畫面。

- [x] **Step 3: 檢視素材稿並裁切**

先用 `view_image` 檢查每個物件的辨識度與透明背景。使用專案已安裝的 `sharp` 等比例縮放並置中至 128×128 透明畫布，按分類 ID 命名為 `01.png` 至 `20.png`，放入 `miniprogram/subpkg-trade/assets/category-icons/`。如圖示背景不透明、物件被裁切或難以辨認，重生該類圖示後再輸出。

- [x] **Step 4: 檢查輸出集合**

以 PowerShell 檢查目錄包含正好 20 個 PNG，名稱涵蓋 ID 01 至 20，並以縮圖總覽核對每個 ID 的插畫語義和透明背景。

Expected: 20 張圖示都有非空內容、未漏類別，所有物件在相同尺寸下有一致留白。

### Task 2: 加入共享圖示映射並更新分類篩選

**Files:**

- Create: `miniprogram/subpkg-trade/trade-category-icons.ts`
- Modify: `miniprogram/subpkg-trade/pages/index/index.ts`
- Modify: `miniprogram/subpkg-trade/pages/index/index.wxml`
- Modify: `miniprogram/subpkg-trade/pages/index/index.wxss`

**Interface:**

```ts
export const getTradeCategoryIconPath = (categoryId: string): string | null
```

未知分類 ID 回傳 `null`；20 個已知 ID 分別回傳 `/subpkg-trade/assets/category-icons/<filename>.png`。

- [x] **Step 1: 建立完整 ID 對應表**

按規格文件中的 20 項表格建立唯讀映射，匯出 `getTradeCategoryIconPath`。檢查路徑都指向 Task 1 輸出的本地 PNG，不包含遠程 URL。

- [x] **Step 2: 把路徑投影到篩選 ViewModel**

在 `index.ts` 的分類型別加入 `iconPath: string | null`；`onLoad` 組裝 `reference.tradeTypes` 時呼叫 `getTradeCategoryIconPath(type.id)`。搜尋、分類切換和結果投影不變。

- [x] **Step 3: 更新篩選按鈕結構**

只在 `wx:for` 的分類按鈕內增加 `image.trade-filter__icon` 和文字節點；保留 `全部` 按鈕、現有 `data-category-id`、事件、role、aria-label 和選取狀態。圖示使用 `mode="aspectFit"`、`aria-hidden="true"`。

- [x] **Step 4: 更新篩選布局**

使用四欄 `grid-template-columns`。按鈕採水平圖示加文字，使用 `32rpx` 圖示、`4rpx` 間距、最小 `88rpx` 高度和 Foundation 的間距 Token；文字使用不小於 `22rpx` 的字級。確保最長的「工業製品」在 320px 視寬仍完整可讀。

### Task 3: 把相同分類圖示加入詳情並擴充驗收場景

**Files:**

- Modify: `miniprogram/subpkg-trade/presenters/trade-season-presenter.ts`
- Modify: `miniprogram/subpkg-trade/pages/detail/index.ts`
- Modify: `miniprogram/subpkg-trade/pages/detail/index.wxml`
- Modify: `miniprogram/subpkg-trade/pages/detail/index.wxss`
- Modify: `tools/miniprogram-review/scenarios/trade-visual.json`

- [x] **Step 1: 擴充詳情 ViewModel**

在 `TradeDetailPageState.title` 增加 `categoryIconPath: string | null`。`presentTradeDetail` 使用 Task 2 的 `getTradeCategoryIconPath(detail.categoryId)`；詳情頁 `emptyView.title` 設為 `categoryIconPath: null`。

- [x] **Step 2: 在分類文字旁呈現圖示**

於詳情 WXML 的 `trade-detail__meta` 中，以 `trade-detail__category` 包住分類圖示與分類文字。圖示類名為 `trade-detail__category-icon`，寬高 `32rpx`、`aspectFit`、`aria-hidden="true"`；商品原圖、等級文字和淡旺季摘要保持不變。

- [x] **Step 3: 擴大 trade 視覺場景的變更匹配範圍**

在 `trade-visual.json` 的 `watchPaths` 加入 `miniprogram/subpkg-trade/pages/index/`、`miniprogram/subpkg-trade/pages/detail/`、`miniprogram/subpkg-trade/presenters/trade-season-presenter.ts`、`miniprogram/subpkg-trade/trade-category-icons.ts` 和 `miniprogram/subpkg-trade/assets/category-icons/`。保留原有搜尋和清除步驟；在清單場景斷言 `.trade-filter__icon` 存在，搜尋「茄子」並點選結果後，等待並斷言 `.trade-detail__category-icon` 可見，然後截取詳情畫面。

### Task 4: 執行頁面與素材驗收

**Files:**

- Verify: `miniprogram/subpkg-trade/assets/category-icons/`
- Verify: `miniprogram/subpkg-trade/pages/index/`
- Verify: `miniprogram/subpkg-trade/pages/detail/`
- Verify: `tools/miniprogram-review/scenarios/trade-visual.json`

- [x] **Step 1: 檢查所有本地圖示路徑和包體積**

確認映射表的每個路徑均有實際 PNG，然後執行 `npm run check:miniprogram-size`。

- [x] **Step 2: 產生迭代驗收報告**

Run: `npm run devtools:changed -- --mode iterate --summary "加入 20 種貿易品分類圖示" --note "檢查篩選按鈕與商品詳情的分類圖示"`

Expected: 命中 `貿易品分類搜尋與清除` 場景，報告中有分類篩選和詳情截圖；若工具阻塞，讀取報告並記錄阻塞原因。

- [x] **Step 3: 檢視實際畫面並按寬度核對**

檢視迭代報告 HTML 內的截圖，確認分類圖示完整、選中與未選中的按鈕皆易辨認、商品原圖仍存在、詳情分類和圖示相鄰。當前模擬器截圖實際寬 305px，分類按鈕和長名稱均完整可見；本輪報告將其他宣告裝置與未切換視寬如實列為人工覆核。若後續發現溢出或文字裁切，修正後重跑 iterate。

- [x] **Step 4: 產生最終頁面驗收報告**

Run: `npm run devtools:changed -- --mode final --summary "貿易品分類圖示最終驗收"`

Expected: 取得最終 HTML 報告並檢視報告內實際截圖。若工具無法連線或缺少截圖，依報告標示為 blocked，不能宣稱頁面驗收通過。

- [x] **Step 5: 整理交付資訊，不提交**

列出本任務檔案、素材包體積檢查、DevTools 報告結果和建議 commit message `feat: 新增貿易品分類圖示`。等待使用者明確確認後才提交。
