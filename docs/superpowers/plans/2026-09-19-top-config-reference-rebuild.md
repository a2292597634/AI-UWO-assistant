# 頂部配置卡參考圖重建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** 在不改動頁面下半部和既有互動的前提下，把冒險配隊與戰鬥配隊的頂部配置／分享卡重建到接近參考圖的暖白紙張與深色分享票據效果。

**Architecture:** 保留 `config-bar` 作為唯一共享視覺元件，讓 `prominentShare` 變體承擔紙張卡、配置欄和分享票據的布局。紙張材質由 UI asset pipeline 生成的本地低對比紋理提供，WXSS 使用現有 Design Foundation Token、半透明疊層、內描邊和既有陰影 Token；冒險與戰鬥頁只提供相同的變體接線。

**Tech Stack:** 微信小程序 WXML/WXSS、TypeScript、Vitest、Sharp UI asset pipeline、微信開發者工具自動化驗收。

## Global Constraints

- 所有 UI、WXML、WXSS、文檔和測試說明使用繁體中文；WXML/WXSS 類名使用英文 BEM 風格。
- 只修改頂部上下文與配置／分享區；船隻頁籤、船位、目標、技能、總覽、底部導航與分享預覽內容保持不變。
- 素材遵循 `data/master/ui-assets/` → `miniprogram/assets/ui/` 的生成管線；不得手動修改生成輸出。
- 新樣式只能使用 Design Foundation 的顏色、字體、間距、圓角和陰影 Token；不得新增遠程 URL、遠程字體、依賴、硬編碼色值或 CSS 漸層。
- 紙張紋理必須是低對比、無文字、無插畫的本地 PNG，不能承擔正文或狀態語義。
- 獨立操作文字不得小於 `22rpx`；配置和分享入口保留真實 WXML 控件、可點擊熱區和無障礙名稱。
- 開發不得直接在 `main`；本計畫在 `codex/phase-36-top-config-reference-rebuild` 分支執行。
- 完成前必須通過相關定向測試、`npm run verify`、`git diff --check`，並用開發者工具產生冒險與戰鬥頂部截圖證據。

---

### Task 1: 建立低對比紙張紋理與 UI asset recipe

**Files:**
- Create: `data/master/ui-assets/config-paper-texture-source.png`
- Modify: `tools/ui-assets/config.ts`
- Modify: `tests/ui-assets/build-ui-assets.test.ts`
- Generated: `miniprogram/assets/ui/config-paper-texture.png`
- Generated: `data/audit/ui-asset-build-report.json`

**Interfaces:**
- Consumes: imagegen 生成的 750×320 PNG 紋理源。
- Produces: recipe id `config-paper-texture`，輸出 `config-paper-texture.png`，供 `config-bar/index.wxss` 使用。

- [ ] **Step 1: Add the failing asset contract test**

在 `tests/ui-assets/build-ui-assets.test.ts` 的 production report 測試中加入：

```ts
const configPaperTexture = files.find((file) => file.id === 'config-paper-texture')

expect(configPaperTexture).toMatchObject({
  output: 'config-paper-texture.png',
  mimeType: 'image/png',
  width: 750,
  height: 320,
})
expect(configPaperTexture?.byteSize).toBeLessThanOrEqual(48 * 1024)
```

同時在 `createFixtureSources` 中建立同尺寸的 `config-paper-texture-source.png` 測試源，確保 fixture 能覆蓋新增 recipe。

- [ ] **Step 2: Run the focused test and verify it fails for the missing recipe**

Run:

```powershell
npx vitest run tests/ui-assets/build-ui-assets.test.ts
```

Expected: FAIL，原因是 report 中找不到 `config-paper-texture`。

- [ ] **Step 3: Generate the approved source texture**

使用 imagegen 生成一張可平鋪感低、米白暖紙色、細微纖維噪點的 750×320 PNG，提示詞必須包含「無文字、無地圖、無插畫、無邊框、低對比、適合 UI 卡片背景、四邊可銜接」。輸出保存為：

```text
data/master/ui-assets/config-paper-texture-source.png
```

生成後檢查：素材不包含船、指南針、文字或高對比污漬；透明邊界不為全透明；尺寸為 750×320。

- [ ] **Step 4: Register the minimal recipe**

在 `UI_ASSET_RECIPES` 加入：

```ts
{
  id: 'config-paper-texture',
  source: 'config-paper-texture-source.png',
  output: 'config-paper-texture.png',
  mode: 'resize-png',
  width: 750,
  height: 320,
  paletteColors: 128,
  maxBytes: 48 * 1024,
  group: 'banner',
}
```

- [ ] **Step 5: Build and verify the asset output**

Run:

```powershell
npm run assets:ui
npm run assets:ui:check
npx vitest run tests/ui-assets/build-ui-assets.test.ts
```

Expected: recipe、PNG、build report 都包含 `config-paper-texture`；素材檢查和定向測試 PASS；banner group 和總 package budget 不超限。

- [ ] **Step 6: Commit the asset unit**

```powershell
git add data/master/ui-assets/config-paper-texture-source.png tools/ui-assets/config.ts tests/ui-assets/build-ui-assets.test.ts miniprogram/assets/ui/config-paper-texture.png data/audit/ui-asset-build-report.json
git commit -m "feat: 新增配置卡紙張紋理素材"
```

### Task 2: 重建共享配置卡的紙張與雙欄幾何

**Files:**
- Modify: `miniprogram/components/config-bar/index.wxss`
- Modify: `miniprogram/pages/adventure-fleet/index.wxml`
- Modify: `miniprogram/subpkg-fleet/pages/index/index.wxml`
- Modify: `tests/architecture/fleet-shared-components.test.ts`
- Modify: `tests/pages/adventure-fleet-page.test.ts`
- Modify: `tests/pages/fleet-page.test.ts`

**Interfaces:**
- Consumes: `config-paper-texture.png` 和 Task 1 的 `config-paper-texture` asset output。
- Produces: `config-bar--prominent-share` 的統一雙欄布局；兩個頁面使用相同的 `min-height: 248rpx` host 接線。

- [ ] **Step 1: Write the failing visual contract assertions**

在 `tests/architecture/fleet-shared-components.test.ts` 將突出卡契約改為要求：

```ts
expect(wxss).toMatch(/background-image:\s*url\(['"]?\/assets\/ui\/config-paper-texture\.png/)
expect(wxss).toMatch(/box-shadow:\s*var\(--uwo-shadow-elevated\)/)
expect(wxss).toMatch(/min-height:\s*248rpx/)
expect(wxss).toMatch(/min-height:\s*216rpx/)
expect(wxss).toMatch(/width:\s*176rpx\s*!important/)
expect(wxss).toMatch(/font-size:\s*var\(--uwo-font-size-page-title\)/)
```

在兩個頁面測試中把 inline host assertion 更新為：

```ts
expect(pageWxml).toContain('style="display: block; min-height: 248rpx; flex: 0 0 auto;"')
```

- [ ] **Step 2: Run the focused contracts and verify they fail**

```powershell
npx vitest run tests/architecture/fleet-shared-components.test.ts tests/pages/adventure-fleet-page.test.ts tests/pages/fleet-page.test.ts
```

Expected: FAIL，原因是現有卡片仍使用 224/192rpx、160rpx 分享欄和沒有紙張紋理／陰影。

- [ ] **Step 3: Implement the reference geometry and material layers**

在 `config-bar/index.wxss` 的突出變體中實現以下結構約束：

```css
.config-bar--prominent-share {
  min-height: 248rpx;
  padding: var(--uwo-space-3);
  border-color: var(--uwo-color-border-strong);
  background-color: var(--uwo-color-surface-muted);
  background-image: url('/assets/ui/config-paper-texture.png');
  box-shadow: var(--uwo-shadow-elevated);
}

.config-bar--prominent-share .config-bar__summary--prominent {
  min-height: 216rpx;
  gap: var(--uwo-space-3);
}

.config-bar--prominent-share .config-bar__share--prominent {
  width: 176rpx !important;
  min-width: 176rpx !important;
  max-width: 176rpx !important;
  min-height: 216rpx;
}
```

保留根容器的半透明覆蓋層和 direct-child z-index，讓紙張素材只作材質、正文仍在前景；左欄使用 `surface` 與 `border-subtle`，分享票據使用 `ink`／`surface`／`accent-brass` Token。不得添加漸層、硬編碼 RGB 或第二套頁面卡片。

- [ ] **Step 4: Recalibrate typography and share glyph**

將突出變體文字層級調整為：

```css
.config-bar--prominent-share .config-bar__name {
  font-size: var(--uwo-font-size-page-title);
  font-weight: 700;
}

.config-bar--prominent-share .config-bar__config-label,
.config-bar--prominent-share .config-bar__count {
  font-size: var(--uwo-font-size-body);
}

.config-bar--prominent-share .config-bar__share-label {
  font-size: var(--uwo-font-size-section-title);
}

.config-bar--prominent-share .config-bar__share-glyph {
  width: 56rpx;
  height: 52rpx;
}
```

狀態 Chip、輔助文案、省略、禁用和 focus/active 規則保持現有語義；不要修改 `config-bar__content` 以下的列表和 action row。

- [ ] **Step 5: Update page host geometry without touching lower layout**

只把兩個頁面 `config-bar` 的 host inline style 更新為：

```xml
style="display: block; min-height: 248rpx; flex: 0 0 auto;"
```

其餘 WXML bindings、事件、船位和技能節點保持原樣。

- [ ] **Step 6: Run the focused contracts**

```powershell
npx vitest run tests/architecture/fleet-shared-components.test.ts tests/pages/adventure-fleet-page.test.ts tests/pages/fleet-page.test.ts
```

Expected: all focused architecture and page tests PASS。

### Task 3: 擴充頁面驗收場景與材質變更觸發

**Files:**
- Modify: `tools/miniprogram-review/scenarios/adventure-fleet-share.json`
- Modify: `tools/miniprogram-review/scenarios/battle-fleet-share.json`
- Modify: `tests/miniprogram-review/fleet-share-scenarios.test.ts`
- Modify: `tests/miniprogram-review/trigger.test.ts`

**Interfaces:**
- Consumes: Task 1 的 source/output asset 路徑與 Task 2 的共享元件。
- Produces: 兩個場景在紙張素材或配置卡樣式變更時都會重新截圖，且保留目前的分享生成、可見性和滾動驗收。

- [ ] **Step 1: Add failing watch-path assertions**

在場景契約的 `expect.arrayContaining` 中加入：

```ts
'miniprogram/assets/ui/config-paper-texture.png',
'data/master/ui-assets/config-paper-texture-source.png',
```

在 trigger fixture 的共享 `watchPaths` 同樣加入兩條路徑，並新增 `isPageRelatedPath` 對 source/output 的 true assertion。

- [ ] **Step 2: Run the review tests and verify the new paths fail**

```powershell
npx vitest run tests/miniprogram-review/fleet-share-scenarios.test.ts tests/miniprogram-review/trigger.test.ts
```

Expected: FAIL，原因是兩份場景和 trigger watch list 尚未聲明新的紙張素材。

- [ ] **Step 3: Update both scenario JSON files**

在兩份 `watchPaths` 增加：

```json
"miniprogram/assets/ui/config-paper-texture.png",
"data/master/ui-assets/config-paper-texture-source.png"
```

保持現有三張截圖、分享按鈕 selector、preview assertion 和 `devices` 不變；必要時只調整截圖前的等待時間，不能刪除下方分享預覽證據。

- [ ] **Step 4: Run the review tests**

```powershell
npx vitest run tests/miniprogram-review/fleet-share-scenarios.test.ts tests/miniprogram-review/trigger.test.ts
```

Expected: PASS，兩個場景都命中 config-bar 和紙張素材變更。

### Task 4: 開發者工具像素迭代與完整驗收

**Files:**
- Generated: `artifacts/miniprogram-review/<run-id>/`
- Review only: `miniprogram/components/config-bar/index.wxss`

**Interfaces:**
- Consumes: Task 1–3 的完整卡片、asset 和驗收場景。
- Produces: 冒險與戰鬥兩頁的頂部 after screenshots、HTML/Markdown review reports，以及完整通過的品質門禁。

- [ ] **Step 1: Run standalone DevTools scenarios**

```powershell
$env:WECHAT_DEVTOOLS_CLI='D:/微信web开发者工具/cli.bat'
$env:WECHAT_AUTOMATION_WS_ENDPOINT='ws://127.0.0.1:9421'
npm run devtools:run -- --scenario adventure-fleet-share
npm run devtools:run -- --scenario battle-fleet-share
```

Expected: 兩個場景均通過，且各自產生 `*-top-before-share.png`、分享預覽上下截圖和 `report.html`。

- [ ] **Step 2: Review the screenshots against the supplied reference**

用 `view_image` 逐張檢查：

- 外層暖白紙張卡是否形成單一完整容器；
- 左欄配置和右側分享票據的寬高比例是否一致；
- 配置名稱是否是主視覺、Chip 和套數是否低一級；
- 紋理是否只提供材質而不干擾正文；
- 卡片下緣是否沒有推移船位、技能和總覽區。

若僅有視覺偏差，迭代只允許修改共享 `index.wxss` 的 Token 引用、`rpx` 幾何、opacity、border 和 local background asset 使用方式；每次迭代後重跑兩個 standalone 場景。

- [ ] **Step 3: Run the full verification gate**

```powershell
git diff --check
npm run verify
```

Expected: format、lint、typecheck、全量測試、runtime-network、package-size、UI asset、manifest、data 和 generate checks 全部 PASS。

- [ ] **Step 4: Record the final change summary and preserve unrelated files**

確認 `git status --short` 中 `artifacts/` 和既有未跟蹤文檔仍未被 `git add`；只展示本次修改文件、驗收報告路徑、兩張頂部 after screenshots 和 verify 結果，不創建或推送 PR。

- [ ] **Step 5: Commit the implementation**

```powershell
git add data/master/ui-assets/config-paper-texture-source.png miniprogram/assets/ui/config-paper-texture.png data/audit/ui-asset-build-report.json tools/ui-assets/config.ts tests/ui-assets/build-ui-assets.test.ts miniprogram/components/config-bar/index.wxss miniprogram/pages/adventure-fleet/index.wxml miniprogram/subpkg-fleet/pages/index/index.wxml tests/architecture/fleet-shared-components.test.ts tests/pages/adventure-fleet-page.test.ts tests/pages/fleet-page.test.ts tests/miniprogram-review/fleet-share-scenarios.test.ts tests/miniprogram-review/trigger.test.ts tools/miniprogram-review/scenarios/adventure-fleet-share.json tools/miniprogram-review/scenarios/battle-fleet-share.json
git commit -m "feat: 重建配隊頂部配置卡參考圖視覺"
```

## 自我審查

- 規格覆蓋：紙張素材與管線由 Task 1 覆蓋；共享雙欄卡與字體由 Task 2 覆蓋；兩頁場景觸發和截圖證據由 Task 3 覆蓋；像素復核、完整門禁和未跟蹤文件保護由 Task 4 覆蓋。
- 範圍檢查：沒有修改下方船隻、技能、目標、總覽、底部導航、資料流或分享預覽內容。
- 介面一致：asset recipe id/output、WXML asset path、scenario watch path 和測試斷言統一使用 `config-paper-texture` / `config-paper-texture.png`。
- 完整性檢查：計畫未留下待補內容或未定義函式；每個實作步驟都指定了文件、命令、輸出或預期結果。
