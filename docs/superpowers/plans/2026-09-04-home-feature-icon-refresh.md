# 首頁功能圖標改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以同一套黃銅航海徽章和高辨識語義色更新首頁五個功能圖標，讓所有圖標在 `96×96` 運行畫布中具有一致的可視大小，且交易品使用明確的翡翠綠。

**Architecture:** 五張透明背景高解析圖像只作為 `data/master/ui-assets/` 的主源；既有 UI Asset Pipeline 負責縮放、16 色量化、近透明邊緣清理、透明邊界報告與運行輸出。首頁現有 `96rpx` 圖標渲染和三列布局保留，透過素材的透明邊界規格解決視覺尺寸不一致，不改變導航或業務邏輯。

**Tech Stack:** TypeScript、Vitest、Sharp、微信小程序 WXML/WXSS、內置 imagegen、Prettier、ESLint。

## Global Constraints

- 所有界面、素材語義、文檔與交互使用繁體中文；WXML/WXSS 類名使用英文 BEM。
- 主源只放在 `data/master/ui-assets/`；`miniprogram/assets/ui/` 和 `data/audit/ui-asset-build-report.json` 必須由 `npm run assets:ui` 生成。
- 不修改 `archive/`、`miniprogram/generated/`、交易業務邏輯、首頁路由、首頁三列布局或依賴。
- 不在 `miniprogram/` 新增 `wx.request`、`wx.cloud`、遠程 URL 或 Node.js Runtime API。
- 五個運行圖標固定輸出 `96×96` PNG，recipe 硬上限為單檔 `12KB`，本次以單檔 `4KB` 作為體積回歸目標；可視透明邊界寬高必須落在 `84–88px`。
- 新增或修改 UI/WXSS 前遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md` 的 Token、間距、觸控與窄屏規範。

---

### Task 1: 先建立統一可視邊界的失敗測試

**Files:**
- Modify: `tests/ui-assets/build-ui-assets.test.ts`

**Interfaces:**
- Consumes: 現有 `buildUiAssets()` 的 `files[].outputTransparentBounds` 報告。
- Produces: 對五個 `feature-*` 輸出尺寸、預算與可視邊界的自動化契約。

- [x] **Step 1: 將航海士名鑑加入 feature 測試集合，並加入邊界斷言**

把現有 `featureIds` 補成五個入口，並在取得 `featureFiles` 後加入：

```ts
const featureFiles = files.filter((file) => featureIds.includes(file.id))
expect(featureFiles).toHaveLength(5)
expect(
  featureFiles.every((file) => {
    const bounds = file.outputTransparentBounds
    return (
      bounds !== undefined &&
      bounds.width >= 84 &&
      bounds.width <= 88 &&
      bounds.height >= 84 &&
      bounds.height <= 88
    )
  }),
).toBe(true)
```

保留既有 `96×96` 與 `12KB` 斷言，避免只驗證邊界而漏掉輸出規格。

- [x] **Step 2: 執行資產測試，確認目前主源先失敗**

Run: `npm.cmd test -- tests/ui-assets/build-ui-assets.test.ts`

Expected: FAIL，原因是現有 `feature-officer-catalog` 輸出透明邊界約 `72×72`，證明測試能捕捉本次問題。

- [x] **Step 3: 保留失敗契約測試，等待素材修正後一起提交**

不在此步驟建立提交；依專案規範，等所有素材、輸出與驗證結果完成後，向用戶展示完整變更範圍和擬用 message，再一次性提交。

### Task 2: 生成並替換五張透明主源素材

**Files:**
- Modify: `data/master/ui-assets/feature-officer-catalog-source.png`
- Modify: `data/master/ui-assets/feature-battle-fleet-source.png`
- Modify: `data/master/ui-assets/feature-adventure-fleet-source.png`
- Modify: `data/master/ui-assets/feature-trade-goods-source.png`
- Modify: `data/master/ui-assets/feature-data-maintenance-source.png`

**Interfaces:**
- Consumes: 已確認的五枚圖標預覽與首頁入口語義。
- Produces: 五張透明背景、高解析、相同徽章尺寸與相同可視占用的素材主源。

- [x] **Step 1: 以同一份素材規格生成五枚正式圖標**

使用內置 imagegen 分別生成五張單枚透明背景圖，並以固定順序和語義製作：

```text
共通：古典航海資料館、黃銅徽章外框、暗色底材、細刻線、適度浮雕高光；透明背景；正面置中；圖形占方形畫布約 86%；無文字、字母、數字、Logo、水印、人物、Emoji。
航海士名鑑：深靛藍羅盤玫瑰＋黃銅開本。
戰鬥模擬艦隊：朱紅航海炮＋小型戰船。
冒險模擬艦隊：海藍青六分儀＋航線弧與星標。
交易品淡旺季查詢：翡翠綠天平＋貨箱與錢幣；綠色必須成為主要底色。
資料維護：暖陶棕航海日誌＋羽毛筆；不得使用綠色。
```

- [x] **Step 2: 視覺檢查每張主源**

用 `view_image` 檢查透明背景、單枚構圖、語義色、外框完整性與五枚圖標一致的占用範圍。若個別圖標偏小、偏色或出現多餘文字，只針對該圖標重新生成。

- [x] **Step 3: 將選定結果覆蓋到 `data/master/ui-assets/`**

只把最終選定的五張圖像複製到上述主源文件名；不直接手改 `miniprogram/assets/ui/`。覆蓋既有主源是本次已獲用戶明確授權的替換操作。

### Task 3: 透過既有素材管線生成運行輸出

**Files:**
- Generate: `miniprogram/assets/ui/feature-officer-catalog.png`
- Generate: `miniprogram/assets/ui/feature-battle-fleet.png`
- Generate: `miniprogram/assets/ui/feature-adventure-fleet.png`
- Generate: `miniprogram/assets/ui/feature-trade-goods.png`
- Generate: `miniprogram/assets/ui/feature-data-maintenance.png`
- Generate: `data/audit/ui-asset-build-report.json`
- Modify: `tools/ui-assets/config.ts`, `tools/ui-assets/build-ui-assets.ts`

**Interfaces:**
- Consumes: Task 2 的五張主源和更新後的 `UI_ASSET_RECIPES`。
- Produces: 可供首頁本地路徑使用的確定性 96px PNG 與透明邊界報告。

- [x] **Step 1: 生成 UI 運行資產**

Run: `npm.cmd run assets:ui`

Expected: 五個 feature PNG 和報告重新生成；命令成功完成。

- [x] **Step 2: 讀取報告確認每枚輸出**

Run: `Select-String -Path data/audit/ui-asset-build-report.json -Pattern 'feature-(officer|battle|adventure|trade|data)-' -Context 0,18`

Expected: 每個圖標 `width=96`、`height=96`、`byteSize<=4096`，`outputTransparentBounds.width/height` 均在 `84–88`。

- [x] **Step 3: 執行素材測試和素材漂移檢查**

Run: `npm.cmd test -- tests/ui-assets/build-ui-assets.test.ts`

Expected: PASS。

Run: `npm.cmd run assets:ui:check`

Expected: PASS，輸出文件與報告和主源確定性重建一致。

- [x] **Step 4: 保留生成文件並等待最終確認後提交**

生成文件已由素材管線寫入工作樹；不在此步驟建立提交，最終提交由 Task 5 的用戶確認觸發。

### Task 4: 回歸首頁與項目門禁

**Files:**
- Inspect: `miniprogram/pages/home/index.ts`
- Inspect: `miniprogram/pages/home/index.wxml`
- Inspect: `miniprogram/pages/home/index.wxss`
- Test: `tests/pages/home-page.test.ts`

**Interfaces:**
- Consumes: Task 3 的五個本地運行圖標。
- Produces: 首頁入口順序、名稱、路由、三列布局與降級回退不變的回歸證據。

- [x] **Step 1: 執行首頁與資產相關測試**

Run: `npm.cmd test -- tests/pages/home-page.test.ts tests/ui-assets/build-ui-assets.test.ts`

Expected: PASS。

- [x] **Step 2: 執行完整測試與靜態門禁**

Run: `npm.cmd test`

Expected: 所有測試通過。

Run: `npm.cmd run format:check`

Expected: 所有匹配文件通過 Prettier。

Run: `npm.cmd run lint`

Expected: ESLint 零警告、零錯誤。

Run: `npm.cmd run typecheck`

Expected: TypeScript 無錯誤。

Run: `npm.cmd run check:runtime-network`

Expected: `Runtime network boundary: PASS`。

- [ ] **Step 3: 用 DevTools 驗收首頁尺寸與色彩**

在 320px、375px、393px、430px 寬度查看首頁：第一行三枚圖標和第二行交易品圖標視覺大小一致；交易品為明確綠色；五枚圖標沒有橫向溢出；點擊和載入失敗回退維持既有行為。

本次已用本地輸出圖像完成視覺檢查；尚未在微信開發者工具中啟動頁面，保留給用戶上傳前的手動驗收。

### Task 5: 提交前展示並等待用戶確認

**Files:**
- Inspect: `git diff --stat`, `git status --short --branch`, `git diff --check`

- [x] **Step 1: 確認變更範圍和工作區**

Run: `git diff --check`、`git status --short --branch`。

Expected: 無空白錯誤；只有五張主源、五張生成圖標、資產報告、資產測試與設計/計畫文檔等本次文件變更；`archive/`、交易資料、generated 與依賴不變。

- [ ] **Step 2: 向用戶展示變更文件、驗證結果與擬用 commit message**

擬用 message：`feat(ui): 更新首頁功能圖標視覺與尺寸`。未收到確認前不建立最終提交或合併。
