# 戰鬥與冒險分享長圖視覺底板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改變戰鬥／冒險分享長圖既有資料布局與業務流程的前提下，正式接入已確認的海圖底板與航海裝飾原圖，讓透明頁首與透明頁尾都保留原圖構圖，再加入標語、內容區邊緣裝飾與真實小程序碼，讓 Canvas 生成圖片完整呈現已批准的航海分享頁視覺。

**Architecture:** 將已確認的兩張 AI 原圖放入受控 UI 素材管線：海圖生成保留縱向構圖的 750×1125、≤80 KiB JPEG，航海符號板生成保留透明通道的 768×512 PNG。Renderer 以完整海圖作底板，分享圖超過海圖高度時只延展中段；同時使用九參數 `drawImage` 從航海符號 PNG 取用原始羅盤、六分儀、船旗、錨、海浪與星盤，再繪製透明頁首、既有內容與頁尾。戰鬥／冒險只透過 `mode` 選擇圖案取用位置、標題、標語與小面積強調色，Presenter、Solver、Controller、內容網格和 QR 資料來源保持不變。

**Tech Stack:** 微信小程序 Canvas、TypeScript、WXML/WXSS 現有 UI 素材管線、`sharp`、Vitest、`miniprogram-automator`、Design Foundation Token。

## Global Constraints

- 界面、代碼註釋、測試與文檔使用繁體中文；WXML/WXSS 類名使用英文 BEM。
- 僅在 `codex/phase-28-fleet-share-visual-reimplementation` 分支工作；不直接修改 `master/main`。
- 不新增、刪除或升級依賴；沿用現有 `sharp` 與測試工具。
- 只新增受控 UI 素材來源 `data/master/ui-assets/fleet-share-map-source.png`、`data/master/ui-assets/fleet-share-nautical-motifs-source.png` 及其管線輸出；不修改 `archive/`、航海士／技能 canonical 資料或 `miniprogram/generated/`。
- 輸出 `miniprogram/assets/ui/fleet-share-map.jpg` 必須為 750×1125、JPEG、≤80 KiB，保留原圖頂部羅盤與底部海浪，並通過既有 banner 與總 UI 資產預算。
- 輸出 `miniprogram/assets/ui/fleet-share-nautical-motifs.png` 必須為 768×512、保留透明通道、≤80 KiB，並通過既有 banner 與總 UI 資產預算；图案必须来自已确认的原始素材，不得改画。
- Renderer 只接受本地受控素材路徑；禁止遠程背景 URL、`wx.request`、`wx.cloud` 和 Node.js Runtime API。
- 小程序碼仍使用 `/assets/ui/mini-program-home-code.png`；缺失仍為 fatal，背景／裝飾缺失才可退回紙色並記錄降級。
- 不改變戰鬥 6＋5 航海士、冒險 S/A/B/C 分組、四欄技能、技能統計、卡片尺寸、順序、預覽／保存／分享流程；只將頁首預留高度由 100 收緊到 88，並驗證不重疊。
- 不使用 Emoji 作為正式模式圖標；正常模式徽記與航海裝飾必須使用受控 PNG 原圖，Canvas 基本路徑只可作為線條或素材缺失時的降級提示。
- 所有新增顏色、間距、圓角、陰影與狀態遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
- 每個任務提交前列出變更文件、驗證結果與擬用 commit message，等待用戶確認後才提交；不攜帶現有的無關未追蹤文件 `docs/superpowers/plans/2026-09-16-officer-avatar-visual-convention.md`。

---

## File Map

| 文件 | 職責 |
| --- | --- |
| `data/master/ui-assets/fleet-share-map-source.png` | 已確認 AI 海圖的受控原始來源，只作素材管線輸入 |
| `data/master/ui-assets/fleet-share-nautical-motifs-source.png` | 已確認 AI 航海符號探索板的受控原始來源，只作透明裝飾素材管線輸入 |
| `tools/ui-assets/config.ts` | 宣告 `fleet-share-map` recipe、尺寸、輸出組別與預算 |
| `tools/ui-assets/build-ui-assets.ts` | 讓 `banner-jpeg` 使用 recipe 的寬高，保持既有 home-harbor 行為並生成新底板 |
| `tests/ui-assets/build-ui-assets.test.ts` | 驗證新素材的輸出集合、尺寸、MIME、大小與確定性 |
| `miniprogram/assets/ui/fleet-share-map.jpg` | 由 `npm run assets:ui` 生成的運行時紋理，不手動編輯 |
| `miniprogram/assets/ui/fleet-share-nautical-motifs.png` | 由 `npm run assets:ui` 生成的透明航海裝飾板，不手動編輯 |
| `data/audit/ui-asset-build-report.json` | 由資產命令生成的像素雜湊、尺寸、大小與預算報告 |
| `tests/runtime/fleet-share-layout.test.ts` | 驗證 88 高度頁首與正文／頁尾不重疊，內容網格契約不變 |
| `miniprogram/runtime/fleet-share-layout.ts` | 僅調整頁首預留高度常數，保持內容高度公式 |
| `tests/runtime/fleet-share-renderer.test.ts` | 驗證背景／透明頁首／徽記／標語／頁尾繪製順序與 QR fatal 契約 |
| `miniprogram/runtime/fleet-share-renderer.ts` | 實作背景、頁首、模式徽記、區塊邊緣裝飾與頁尾繪製單元 |
| `tests/pages/fleet-page.test.ts` | 為戰鬥分享 Canvas 測試替身提供新增路徑與狀態能力 |
| `tests/pages/adventure-fleet-page.test.ts` | 為冒險分享 Canvas 測試替身提供新增路徑與狀態能力 |
| `tests/architecture/fleet-share.test.ts` | 驗證繁體中文正式文案、本地素材路徑、無 Emoji 與無運行時網路 API |
| `tools/miniprogram-review/adapter.ts` | 將驗收場景入口重置為 `miniprogram-automator.reLaunch`，避免同頁導航返回未展開物件錯誤 |
| `tools/miniprogram-review/runner.ts` | 每個場景開始時以可重入的入口重置頁面狀態 |
| `tests/miniprogram-review/adapter.test.ts`、`tests/miniprogram-review/runner.test.ts` | 鎖定入口重置與報告錯誤可診斷性 |
| `tests/miniprogram-review/fleet-share-scenarios.test.ts` | 驗證戰鬥／冒險分享場景包含生成、交互、滾動與截圖證據 |
| `tools/miniprogram-review/scenarios/battle-fleet-share.json` | 戰鬥分享圖 iterate/final 場景 |
| `tools/miniprogram-review/scenarios/adventure-fleet-share.json` | 冒險分享圖 iterate/final 場景 |
| `docs/miniprogram-review.md` | 記錄艦隊分享場景命令與變更觸發說明 |
| `docs/superpowers/specs/2026-09-16-fleet-share-visual-foundation-design.md` | 已批准的產品與技術規格，本計劃的唯一視覺基準 |
| `docs/superpowers/plans/2026-09-16-fleet-share-visual-foundation.md` | 本次實作的可追蹤任務清單 |

---

## Task 0: 先修正驗收場景入口重置，確保迭代可重入

**Files:**
- Modify: `tests/miniprogram-review/adapter.test.ts`
- Modify: `tests/miniprogram-review/runner.test.ts`
- Modify: `tools/miniprogram-review/adapter.ts`
- Modify: `tools/miniprogram-review/runner.ts`

### Step 1: 先寫會失敗的入口重置測試

- [x] 已用同頁重複 `navigateTo` 重現微信自動化接口返回未展開物件的失敗。

在 SDK adapter fixture 中加入 `reLaunch`，斷言其映射到 `miniprogram.reLaunch`；在 runner 測試中斷言場景入口使用 `reLaunch:/pages/catalog/index`，而不是對当前页重复 `navigateTo`。先執行：

```powershell
npm.cmd test -- --run tests/miniprogram-review/adapter.test.ts tests/miniprogram-review/runner.test.ts
```

預期新斷言因 `ReviewAdapter` 尚無 `reLaunch` 而失敗；該失敗必須是介面／呼叫不一致，而不是 fixture 語法錯誤。

### Step 2: 以 `reLaunch` 重置場景入口

- [x] `ReviewAdapter`、SDK adapter 與 runner 已改用 `reLaunch` 重置場景入口。

在 `ReviewAdapter` 增加 `reLaunch(path: string): Promise<void>`，在 `AutomatorMiniProgram` 介面與 `createAutomatorAdapter` 中映射 `miniProgram.reLaunch(path)`；`runScenario` 開始時呼叫 `adapter.reLaunch(scenario.entry)`。保留場景步驟內既有 `navigate` 動作供跨頁流程使用。

### Step 3: 驗證並提交

- [x] 定向 adapter／runner 測試通過；提交仍遵守用戶確認門禁。

```powershell
npm.cmd test -- --run tests/miniprogram-review/adapter.test.ts tests/miniprogram-review/runner.test.ts
git diff --check
```

展示變更與結果，擬用 message：`fix: 讓小程序驗收場景可重入重置`；取得確認後提交。

---

## Task 1: 將共享海圖納入確定性的 UI 素材管線

**Files:**
- Modify: `tests/ui-assets/build-ui-assets.test.ts`
- Modify: `tools/ui-assets/config.ts`
- Modify: `tools/ui-assets/build-ui-assets.ts`
- Add: `data/master/ui-assets/fleet-share-map-source.png`
- Generated: `miniprogram/assets/ui/fleet-share-map.jpg`, `data/audit/ui-asset-build-report.json`

- [x] **Step 1: 先寫會失敗的素材契約測試**

在 fixture source 建立流程加入 `fleet-share-map-source.png`，並新增契約：recipe 輸出名為 `fleet-share-map.jpg`、尺寸 750×1125、MIME 為 JPEG、大小不超過 80 KiB；輸出集合與報告的像素雜湊在兩次建置間相同。先執行：

```powershell
npm test -- --run tests/ui-assets/build-ui-assets.test.ts
```

預期新契約因 recipe 尚不存在而失敗，既有 home-harbor 與其他素材測試保持可定位。

- [x] **Step 2: 宣告 recipe 並擴充 JPEG helper**

在 `UI_ASSET_RECIPES` 加入：

```ts
{
  id: 'fleet-share-map',
  source: 'fleet-share-map-source.png',
  output: 'fleet-share-map.jpg',
  mode: 'banner-jpeg',
  width: 750,
  height: 1125,
  maxBytes: 80 * 1024,
  group: 'banner',
},
```

將 `jpeg` 介面改為 `jpeg(input: string, width: number, height: number, maxBytes: number)`，以 recipe 寬高執行 `sharp(...).resize(width, height, { fit: 'cover' })`；home-harbor 仍由其 750×320 recipe 得到原有輸出。

- [x] **Step 3: 放入已批准的來源並生成運行時輸出**

把已批准、無文字／無 QR 的 AI 海圖來源放到 `data/master/ui-assets/fleet-share-map-source.png`，不得把原始 1024×1536 圖直接引用到小程序。執行：

```powershell
npm run assets:ui
npm test -- --run tests/ui-assets/build-ui-assets.test.ts
```

確認 `miniprogram/assets/ui/fleet-share-map.jpg` 由命令生成、尺寸與預算符合規格，且報告記錄新檔案的輸出雜湊；禁止手動修改 generated output。

- [x] **Step 4: 定向檢查並提交（待最終整合前統一提交）**

```powershell
npm run assets:ui:check
git diff --check
```

提交前展示 Task 1 的變更文件與上述結果，擬用 message：`feat: 將分享海圖納入 UI 素材管線`；取得確認後提交。

---

## Task 2: 收緊透明頁首預留並守住布局邊界

**Files:**
- Modify: `tests/runtime/fleet-share-layout.test.ts`
- Modify: `miniprogram/runtime/fleet-share-layout.ts`

- [x] **Step 1: 先更新幾何契約**

將頁首高度期望改為 88，並補充不重疊斷言：第一個船區／品質分組的 `y` 不小於 `header.y + header.height`，最後一個技能區底部不大於 footer 頂部；戰鬥七船與冒險長技能清單仍使用原有內容驅動高度。先執行定向 layout 測試確認紅燈。

- [x] **Step 2: 只調整頁首常數**

將 `HEADER_HEIGHT` 由 100 改為 88，不觸碰 `OFFICER_COLUMNS`、`GROUP_OFFICER_COLUMNS`、`SKILL_COLUMNS`、卡片尺寸、分區高度公式或 footer／QR 尺寸。

- [x] **Step 3: 驗證並提交（待最終整合前統一提交）**

```powershell
npm test -- --run tests/runtime/fleet-share-layout.test.ts
git diff --check
```

確認所有正文區與 footer 幾何契約通過後，展示變更與結果，擬用 message：`refactor: 收緊分享圖頁首預留高度`；取得確認後提交。

---

## Task 3: 實作海圖底層、透明頁首與模式變體

**Files:**
- Modify: `tests/runtime/fleet-share-renderer.test.ts`
- Modify: `miniprogram/runtime/fleet-share-renderer.ts`

- [x] **Step 1: 擴充 Canvas 測試替身並先寫失敗測試**

在 `createCanvas` context 補齊實作所需的 `save`、`restore`、`globalAlpha`、`shadowColor`、`shadowBlur` 等欄位，新增測試驗證：

- 背景與航海裝飾本地路徑在 preload 清單中，且海圖與原始裝飾板繪製先於頁首與正文；
- `drawHeader` 不呼叫不透明頁首 `fillRect`，所有標題／眉題／配置名／標語坐標落在 88 高度內；
- `mode: battle` 使用 `戰鬥配隊記錄`、`定航向・統全艦・赴遠洋`、鋼印紅，`mode: adventure` 使用 `冒險配隊記錄`、`向未知海域・寫下下一段航跡`、海水青綠；
- 頁首、內容與 footer 的繪製順序穩定，QR 仍讀取 `QR_PATH`，QR 缺失仍拋出 fatal 錯誤；
- 背景缺失只記錄 degradation 並保留紙色底板，既有航海士／技能素材降級測試不回歸。

先執行：

```powershell
npm test -- --run tests/runtime/fleet-share-renderer.test.ts
```

預期新契約因 helper 與文案尚不存在而失敗。

- [x] **Step 2: 建立背景與模式視覺常數／本地資產契約**

加入：

```ts
const FLEET_SHARE_BACKGROUND_PATH = '/assets/ui/fleet-share-map.jpg'
const FLEET_SHARE_MOTIFS_PATH = '/assets/ui/fleet-share-nautical-motifs.png'
```

在 `preloadAssets` 以 `kind: 'ui'` 載入背景，沿用 `localAssetPath` 與既有報告結構，不新增遠程載入分支。將 Canvas Renderer 的紙色、表面、墨色、正文、黃銅、標語與模式色對齊 Design Foundation：`#E7DECA`、`#F5EFE0`、`#26332F`、`#292A26`、`#B99552`、`#76501A`、戰鬥 `#8B3A3A`、冒險 `#315451`。

- [x] **Step 3: 按固定順序加入繪製單元**

新增下列內部 helper，保持 Presenter／Solver／Controller 邊界：

```ts
drawShareBackground(context, layout, image?): void
drawModeEmblem(context, x, y, mode, motifs?): void
drawMotifDecorations(context, layout, mode, motifs?): void
drawSectionAccent(context, layout, mode): void
drawHeader(context, layout, mode, configName): void
drawFooter(context, layout, mode, qrImage): void
```

`drawShareBackground` 先填充紙色，再以低 `globalAlpha` 繪製完整 750×1125 海圖；若分享長圖超出海圖高度，只重複中段紋理，保留原圖頂部羅盤、邊框與底部海浪，不再把整張長圖壓成橫向帶。背景缺失時不阻塞導出。`drawModeEmblem` 和 `drawMotifDecorations` 必須用九參數 `drawImage` 從 `fleet-share-nautical-motifs.png` 取用原始圖案：戰鬥使用羅盤／船旗／六分儀，冒險使用羅盤／海浪／星盤，頁尾再使用錨或海浪。素材缺失時才使用既有線稿作為降級提示。`drawHeader` 完全透明，只繪製眉題、模式標題、配置名稱、原始素材徽記、短黃銅線與模式標語，必要時使用極輕紙色文字陰影；禁止整塊 `fillRect` 或黑色漸層。`drawSectionAccent` 只在既有容器外側畫低對比線／節點，不新增布局空間。`drawFooter` 同樣完全透明，不繪製整塊 `ink` 矩形，只以紙色陰影保證文字可讀；本地 QR 按底板九切片映射到原始海圖右下預留框並保留內邊距，QR 缺失照舊 fatal。

將 `drawFleetShareImage` 的順序固定為：`clearRect` → 紙色 → `drawShareBackground` → `drawMotifDecorations` → `drawHeader` → 既有 battle／adventure 內容 → `drawSectionAccent` → `drawFooter`；`drawHeader` 和 `drawFooter` 內的模式圖案仍從同一張原始素材板取用。保留既有航海士 frame／portrait／rarity／type 圖層與所有內容繪製函式。

- [x] **Step 4: 測試、DevTools 迭代驗收並提交（已重跑並通過）**

```powershell
npm test -- --run tests/runtime/fleet-share-renderer.test.ts tests/runtime/fleet-share-layout.test.ts
npm run devtools:changed -- --mode iterate
git diff --check
```

在可用的微信開發者工具中核驗戰鬥／冒險實際生成圖：背景可見、頁首透明且不擠壓首區、兩模式只改徽記／色／標語、頁尾 QR 與最後技能不重疊。若背景或線稿辨識度需微調，只調整 Renderer 透明度／坐標／Token，不改內容網格。展示截圖與結果，擬用 message：`feat: 完成艦隊分享圖航海視覺底板`；取得確認後提交。

---

## Task 4: 補齊架構契約與變更觸發場景

**Files:**
- Modify: `tests/architecture/fleet-share.test.ts`
- Locate and modify: 現有戰鬥／冒險分享場景定義（以 `rg -n "fleet-share|分享"` 找到實際 JSON/TS 檔）
- Modify only if needed: `docs/superpowers/specs/2026-09-16-fleet-share-visual-foundation-design.md`（僅修正與實作不一致的契約，不改產品方向）

- [x] **Step 1: 先寫／更新架構斷言**

斷言正式文案均為繁體中文、Renderer 同時引用 `/assets/ui/fleet-share-map.jpg` 與 `/assets/ui/fleet-share-nautical-motifs.png`、沒有 Emoji 正式圖標、沒有遠程背景 URL 或運行時網路 API；場景 `watchPaths` 必須涵蓋：

- `miniprogram/runtime/fleet-share-renderer.ts`
- `miniprogram/runtime/fleet-share-layout.ts`
- `miniprogram/assets/ui/fleet-share-map.jpg` 及其受控來源／recipe
- `miniprogram/assets/ui/fleet-share-nautical-motifs.png` 及其受控來源／recipe
- 戰鬥／冒險分享入口與預覽流程文件

- [x] **Step 2: 實作最小觸發映射**

沿用既有 `git diff --name-only` 變更觸發器與 `devtools:changed` 命令，只增加上述路徑前綴／場景映射；不引入常駐檔案監聽器、不改資料或文檔變更的既有跳過行為。迭代模式跑受影響場景，final 模式跑完整受影響場景。

- [x] **Step 3: 驗證並提交（待最終整合前統一提交）**

```powershell
npm test -- --run tests/architecture/fleet-share.test.ts
npm run devtools:changed -- --mode iterate
git diff --check
```

若 DevTools 未登入、端口未開或項目未打開，報告狀態必須是 `blocked`，不能標成通過。展示變更文件、場景選擇與結果，擬用 message：`test: 鎖定分享底板架構與變更觸發契約`；取得確認後提交。

---

## Task 5: 完整驗證、HTML 證據與交付整合

**Files:**
- Modify only when generated by commands: `data/audit/ui-asset-build-report.json`、HTML 驗收報告輸出路徑
- No manual edits to unrelated files

- [x] **Step 1: 執行定向回歸**

```powershell
npm test -- --run tests/ui-assets/build-ui-assets.test.ts tests/runtime/fleet-share-layout.test.ts tests/runtime/fleet-share-renderer.test.ts tests/architecture/fleet-share.test.ts
```

確認資料布局、技能統計、素材預載、QR fatal 與無網路架構契約均通過。

- [x] **Step 2: 執行 final 模式並保存 HTML 報告（報告已生成，DevTools 通過）**

```powershell
npm run devtools:changed -- --mode final
```

HTML 報告長期保存於既有驗收報告目錄，不寫入 `miniprogram/`，不進小程序包；報告需包含修改前／修改後截圖、場景、模式、背景降級數量、QR 缺失、Canvas 導出失敗、DevTools `blocked` 原因與最終狀態。若工具阻塞，保留阻塞證據並向用戶明確報告，不宣稱視覺已通過。

- [x] **Step 3: 完整工程門禁**

```powershell
npm run verify
git diff --check
```

如門禁發現範圍外缺陷，停止夾帶修復，記錄缺陷並另開任務。

- [ ] **Step 4: 交付前確認（等待用戶確認提交）**

整理最終變更文件、定向與完整驗證輸出、DevTools／HTML 證據路徑及仍存在的非阻塞限制，展示擬用整合 commit message：`feat: 完善艦隊分享圖視覺底板與驗收流程`；取得用戶確認後才提交。除非用戶另行要求，不自動合併或推送遠程分支。

---

## Task 6: 接入已確認的原始航海裝飾圖（本次重新落地）

**Files:**
- Add: `data/master/ui-assets/fleet-share-nautical-motifs-source.png`
- Modify: `tools/ui-assets/config.ts`
- Modify: `tests/ui-assets/build-ui-assets.test.ts`
- Generated: `miniprogram/assets/ui/fleet-share-nautical-motifs.png`, `data/audit/ui-asset-build-report.json`
- Modify: `miniprogram/runtime/fleet-share-renderer.ts`
- Modify: `tests/runtime/fleet-share-renderer.test.ts`
- Modify: `tests/architecture/fleet-share.test.ts`
- Modify: `docs/miniprogram-review.md` only if the asset watch-path list needs the new output

### Step 1: 先鎖定原圖來源並新增素材契約

- [ ] 將 `.superpowers/brainstorm/121-1789549124/content/generated-nautical-motifs.png` 原樣複製為 `data/master/ui-assets/fleet-share-nautical-motifs-source.png`；不得重新生成、重繪或更換圖案。
- [ ] 在 UI asset fixture 中加入透明 RGBA 的 motif source，新增斷言：輸出 id 為 `fleet-share-nautical-motifs`、輸出為 768×512 PNG、輸出保留 `outputTransparentBounds` 且不超過 80 KiB；兩次 build 的解碼像素雜湊一致。
- [ ] 先執行：

```powershell
npm.cmd test -- --run tests/ui-assets/build-ui-assets.test.ts
```

預期新增契約因 recipe 尚未加入而失敗，既有海圖／功能圖標契約仍可定位。

### Step 2: 讓素材管線只做等比例透明 PNG 輸出

- [ ] 在 `UI_ASSET_RECIPES` 加入 `fleet-share-nautical-motifs` recipe：來源為 `fleet-share-nautical-motifs-source.png`，輸出為 `fleet-share-nautical-motifs.png`，模式 `resize-png`，尺寸 768×512，`paletteColors: 128`，`maxBytes: 80 * 1024`，分組 `banner`。
- [ ] 將原始圖複製到 `data/master/ui-assets/` 後執行：

```powershell
npm.cmd run assets:ui
npm.cmd run assets:ui:check
npm.cmd test -- --run tests/ui-assets/build-ui-assets.test.ts
```

- [ ] 檢查輸出仍有 alpha 通道、沒有黑色實體底板，並確認 banner／總 UI 資產預算通過。

### Step 3: 以九參數 drawImage 使用原始 motif，不用 Canvas 替代圖標

- [ ] 在 Renderer 增加 `FLEET_SHARE_MOTIFS_PATH`，於 `preloadAssets` 以 `kind: 'ui'` 載入，同時保留 `FLEET_SHARE_BACKGROUND_PATH`。
- [ ] 增加固定來源座標表（以 768×512 輸出為基準）：羅盤 `{x: 0, y: 0, width: 256, height: 256}`、六分儀 `{x: 256, y: 0, width: 256, height: 256}`、船旗 `{x: 512, y: 0, width: 256, height: 256}`、錨 `{x: 0, y: 256, width: 256, height: 256}`、海浪 `{x: 256, y: 256, width: 256, height: 256}`、星盤 `{x: 512, y: 256, width: 256, height: 256}`；這些取用區只來自原始素材板，不得重新繪製。
- [ ] `drawModeEmblem` 以九參數 `drawImage` 將羅盤與模式圖案放進透明頁首；`drawMotifDecorations` 在內容外緣與頁尾以低透明度放置六分儀／錨／海浪／星盤；保持現有內容區矩形與文字坐標不變，QR 坐標改由原始海圖預留框映射。
- [ ] 素材載入失敗時才執行現有 Canvas 線稿降級，並在報告中增加 `ui` degradation；正常載入時測試必須能找到 motif image 的九參數 draw call。

### Step 4: 驗證畫面確實使用原圖

- [ ] 新增／更新定向 Renderer 與架構測試，斷言 preload 含兩個正式素材路徑、正常渲染有 motif 九參數 draw call，且 Renderer 不再以線稿作為正常模式徽記的唯一輸出。
- [ ] 執行：

```powershell
npm.cmd test -- --run tests/ui-assets/build-ui-assets.test.ts tests/runtime/fleet-share-renderer.test.ts tests/architecture/fleet-share.test.ts
npm.cmd run devtools:changed -- --mode iterate
git diff --check
```

- [ ] 使用 `miniprogram-automator` 查看戰鬥與冒險實際分享圖，確認頂部可見原始羅盤／船旗或海浪，內容邊緣或頁尾可見原始六分儀／錨／星盤，底部海浪不被黑色 footer 遮擋，且地圖、透明頁首、核心內容和 QR 未被遮擋。

### Step 5: 最終驗證與提交前門禁

- [ ] 執行 `npm.cmd run devtools:changed -- --mode final` 並保存 HTML、JSON、PNG 證據。
- [ ] 執行 `npm.cmd run verify` 與 `git diff --check`；若發現無關缺陷，只記錄不夾帶修復。
- [ ] 提交前列出所有變更文件、驗證結果、報告／截圖路徑與擬用 message，等待用戶確認後再 commit；不 stage `docs/superpowers/plans/2026-09-16-officer-avatar-visual-convention.md`。

---

## Self-review Checklist

- [x] 每個 Task 都先定義測試／契約，再描述實作與命令。
- [x] 所有檔案路徑、函式簽名、尺寸、顏色、文案與 QR 路徑和已批准規格一致。
- [x] 沒有以未定義的佔位內容掩蓋實作細節。
- [x] 明確保留既有內容布局、資料邊界、QR fatal 與無網路硬約束。
- [x] 明確說明兩張 AI 原圖只進受控來源，運行時使用壓縮海圖與透明航海裝飾輸出，不影響小程序包以外的 HTML 報告。
- [x] 明確包含 `miniprogram-automator` 的 iterate／final 觸發時機與 `blocked` 語義。
- [x] 明確保留用戶現有無關未追蹤文件，不在本 Change 中 stage 或修改。
