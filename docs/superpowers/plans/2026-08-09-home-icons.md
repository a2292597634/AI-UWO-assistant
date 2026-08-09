# P8 首頁與圖標資產 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收斂首頁 Hero、補齊三個正式模組圖標，並將新增航海士降級為資料維護次級入口。

**Architecture:** 保留首頁現有 Page 事件、路由、資料計數和圖片失敗狀態，只調整模組 ViewModel 與 WXML/WXSS 層級。三個新圖標以內置瀏覽器生成的本地主源加入既有 UI Asset Pipeline，輸出固定尺寸 PNG 和體積報告，不修改生成數據或運行時網絡邊界。

**Tech Stack:** 微信小程序原生 TypeScript/WXML/WXSS、Sharp、Vitest、ESLint、Prettier；位圖主源使用已登入 ChatGPT 內置瀏覽器生成並下載。

## Global Constraints

- 所有界面、文檔、注釋和交互使用繁體中文；WXML/WXSS 類名使用英文 BEM。
- 涉及 UI、WXML 或 WXSS 的編碼前完整閱讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
- 允許新增三個 UI 圖標主源到 `data/master/ui-assets/`；不得修改 `archive/`、`miniprogram/generated/` 或其他資料主源。
- 不修改既有業務邏輯、Controller、Solver、資料來源、導航、編輯頁校驗和保存流程。
- 不新增 `wx.request`、`wx.cloud`、遠程 URL、Node.js Runtime API 或依賴。
- 位圖生成必須使用已登入 ChatGPT 內置瀏覽器網頁端；瀏覽器或下載失敗時停止並報告。
- Hero 保留港口素材，運行高度為 `240rpx`；功能圖標運行輸出為 `96×96` PNG，單個不超過 `12KB`。
- 每個階段執行 `npm.cmd run verify`、`git diff --check`，並檢查禁止目錄。
- Commit 前展示變更文件、驗證結果、手動驗收清單和擬用 Commit Message，等待用戶確認。

---

### Task 1: 建立 P8 規格與測試契約

**Files:**
- Create: `docs/superpowers/specs/2026-08-09-home-icons-design.md`
- Create: `docs/superpowers/plans/2026-08-09-home-icons.md`
- Create: `tests/pages/home-page.test.ts`

**Interfaces:**
- Consumes: 首頁 Page 設定、`tools/ui-assets/config.ts` 的 feature recipe。
- Produces: 首頁入口名稱／路由／本地圖標路徑和禁止 Emoji/Unicode 回退的可執行契約。

- [ ] **Step 1: 寫首頁失敗契約**

  在 `tests/pages/home-page.test.ts` 讀取首頁 `index.ts`、`index.wxml`、`index.wxss`，建立 `Page` stub 並驗證：

  ```ts
  expect(page.data.modules.map((module) => module.id)).toEqual([
    'officer-catalog',
    'battle-fleet',
    'adventure-fleet',
    'data-maintenance',
  ])
  expect(page.data.modules.at(-1)).toMatchObject({
    name: '資料維護',
    route: '/pages/officer-editor/index',
    iconPath: '/assets/ui/feature-data-maintenance.png',
  })
  expect(homeWxml).not.toContain('iconFallback')
  expect(homeWxss).toContain('height: 240rpx')
  ```

- [ ] **Step 2: 執行 RED 驗證**

  執行 `npm.cmd test -- tests/pages/home-page.test.ts`。預期失敗原因是首頁仍有 `iconFallback`、Hero 仍為 `320rpx`，且新增入口尚未使用本地圖標。

### Task 2: 生成三個模組圖標主源

**Files:**
- Create: `data/master/ui-assets/feature-battle-fleet-source.png`
- Create: `data/master/ui-assets/feature-adventure-fleet-source.png`
- Create: `data/master/ui-assets/feature-data-maintenance-source.png`

**Interfaces:**
- Consumes: 現有 `feature-officer-catalog-source.png` 的寫實黃銅羅盤／舵輪視覺方向，作為風格參考。
- Produces: 三個透明背景、無文字的本地主源 PNG，供 UI Asset Pipeline 使用。

- [ ] **Step 1: 在已登入內置瀏覽器中分別生成三個資產**

  每個資產單獨生成，使用一致的提示約束：寫實黃銅航海徽章、深墨綠細節、居中正方形構圖、透明背景處理用純色 chroma-key、無文字、無水印、無現代物件、保留四周安全邊距。主題分別為戰鬥配隊、冒險配隊、資料維護。

- [ ] **Step 2: 下載並放入主源目錄**

  下載成功後將最終 PNG 放入 `data/master/ui-assets/`，保持上述固定文件名；不得直接寫入 `miniprogram/assets/ui/`。

- [ ] **Step 3: 驗證主源圖像**

  檢查每個文件有透明或可移除背景、主體沒有裁切、無文字和水印，再進入 Pipeline。若下載失敗，停止並報告具體失敗原因。

### Task 3: 擴展 UI Asset Pipeline

**Files:**
- Modify: `tools/ui-assets/config.ts`
- Modify: `tests/ui-assets/build-ui-assets.test.ts`
- Generate: `miniprogram/assets/ui/feature-battle-fleet.png`
- Generate: `miniprogram/assets/ui/feature-adventure-fleet.png`
- Generate: `miniprogram/assets/ui/feature-data-maintenance.png`
- Generate: `data/audit/ui-asset-build-report.json`

**Interfaces:**
- Consumes: 三個 `*-source.png` 主源與既有 `resize-png` 配方。
- Produces: 三個 feature recipe 和固定的運行 PNG 輸出。

- [ ] **Step 1: 增加素材構建失敗契約**

  在 `createFixtureSources()` 加入三個 320×320 PNG fixture，並在測試中斷言 `buildUiAssets()` 報告含三個 ID、輸出尺寸為 96×96、每個 byteSize 不超過 12KB，且兩次構建報告相等。

- [ ] **Step 2: 執行素材測試 RED**

  執行 `npm.cmd test -- tests/ui-assets/build-ui-assets.test.ts`。預期新增的 recipe 尚未存在，fixture 文件和報告斷言失敗。

- [ ] **Step 3: 增加三個最小 recipe**

  在 `UI_ASSET_RECIPES` 中增加 `feature-battle-fleet`、`feature-adventure-fleet` 和 `feature-data-maintenance`，沿用 `resize-png`、`96×96`、`12KB` 和 `feature` budget；不修改 banner、original-ui 或既有名鑑 recipe。

- [ ] **Step 4: 執行素材構建 GREEN**

  執行 `npm.cmd run assets:ui`、`npm.cmd run assets:ui:check` 及 `npm.cmd test -- tests/ui-assets/build-ui-assets.test.ts`，確認生成文件與報告均通過。

### Task 4: 收口首頁模組層級與布局

**Files:**
- Modify: `miniprogram/pages/home/index.ts`
- Modify: `miniprogram/pages/home/index.wxml`
- Modify: `miniprogram/pages/home/index.wxss`
- Modify: `tests/pages/home-page.test.ts`

**Interfaces:**
- Consumes: 三個新的 `/assets/ui/feature-*.png` 路徑、既有 Hero 和 `getDatasetMeta()`。
- Produces: 三個主要模組、一個資料維護次級入口、240rpx Hero 和不依賴 Emoji 的失敗降級。

- [ ] **Step 1: 更新模組資料**

  保留現有前三個路由與事件，將 `add-officer` 改為 `data-maintenance`、名稱改為「資料維護」、圖標改為本地路徑；移除文字 `iconFallback`，保留 `iconFailed` 圖片錯誤狀態。

- [ ] **Step 2: 更新 WXML 層級**

  主要模組使用既有網格；資料維護使用獨立的次級入口區，仍保留完整文字名稱和 `bindtap="onModuleTap"`。圖片失敗使用 CSS 占位層，不輸出 Emoji、Unicode 或首字。

- [ ] **Step 3: 更新 WXSS**

  將 `.harbor-hero` 高度改為 `240rpx`；使用 `var(--uwo-*)` Token 收口新樣式，讓次級入口視覺尺寸與留白低於主要模組，但熱區不低於 `88rpx`。保留 Hero fallback 漸變、港口內容和 320px 下的寬度安全。

- [ ] **Step 4: 執行首頁 GREEN 驗證**

  執行 `npm.cmd test -- tests/pages/home-page.test.ts`，確認入口順序、中文文案、本地素材路徑、Hero 高度與無 Emoji/Unicode 契約通過。

### Task 5: 完整驗證與交付檢查

**Files:**
- Modify: 僅修正前述任務中測試與生產文件的必要問題。

**Interfaces:**
- Consumes: Tasks 1–4 的規格、素材、Pipeline、首頁布局與測試。
- Produces: P8 驗收報告、變更文件清單、完整驗證證據和待確認 Commit Message。

- [ ] **Step 1: 執行聚焦回歸**

  執行 `npm.cmd test -- tests/pages/home-page.test.ts tests/ui-assets/build-ui-assets.test.ts`。

- [ ] **Step 2: 執行完整門禁**

  執行 `npm.cmd run verify` 和 `git diff --check`；記錄每個命令的退出碼和測試統計。

- [ ] **Step 3: 檢查禁止目錄與運行邊界**

  執行：

  ```powershell
  git diff --name-only -- archive data/master/officers.json data/master/skills.json miniprogram/generated
  git diff --name-only -- cloudfunctions miniprogram/pages/fleet miniprogram/pages/adventure-fleet
  rg -n "wx\.request|wx\.cloud|https?://|iconFallback|[😀-🙏]" miniprogram/pages/home tools/ui-assets tests/pages/home-page.test.ts
  ```

  預期禁止目錄無輸出；首頁運行代碼無遠程 URL、網絡 API、Node.js Runtime API 或 Emoji/Unicode 功能圖標。

- [ ] **Step 4: 整理手動驗收清單**

  在 320/375/393/430px 檢查 Hero 240rpx、三個主要模組、資料維護次級入口、圖標失敗回退、導航路由、無頁面級橫向溢出和底部安全區。

- [ ] **Step 5: 提交前停點**

  展示完整變更文件、驗證結果、手動驗收清單和擬用 message：

  ```text
  feat(home): 收口首頁與正式模組圖標
  ```

  未獲用戶確認前，不執行 `git add`、`git commit`、merge 或 push。
