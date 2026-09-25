# 大流行預測模組 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Each task ends with focused verification. Do not commit until the user has reviewed the complete diff, validation results and proposed commit message.

**Goal:** 在微信小程序中新增離線大流行預測頁，以海域時刻矩陣和全域行程列表呈現未來事件，沿用已完成的交易類別圖示。

**Architecture:** `data/master/major-events.json` 保存來源週期、18 個海域和交易類別 ID；生成器輸出到 `subpkg-trade`，純 Domain 函式計算事件時刻，Presenter 格式化矩陣、行程與詳情。頁面資產使用本地生成素材；交易類別圖示呼叫現有 `getTradeCategoryIconPath`，不複製類別圖示或對應表。

**Tech Stack:** TypeScript、Vitest、Ajv 2020、Sharp、微信小程序 WXML/WXSS、既有 `tools/ui-assets` 和 `tools/miniprogram-review`；不新增依賴。

**Spec:** `docs/superpowers/specs/2026-09-24-major-event-forecast-design.md`

## Global Constraints

- 只在 `codex/phase-44-major-event-forecast` 工作分支開發，不在 `main` 開發。
- `archive/` 唯讀；`data/master/` 是唯一手動維護的權威資料源；生成資料由工具建立，禁止手動修改。
- 修改 `data/master/` 後執行 `npm run data:check`；生成輸出須由 `npm run generate:check` 驗證。
- 小程序 Runtime 不新增 `wx.request`、`wx.cloud`、遠程 URL 或 Node.js API，不新增依賴。
- 頁面與文件使用繁體中文；WXML/WXSS 類名採英文 BEM。
- 所有週期、相位、分鐘取整、事件順序、來源名稱、預測範圍、色籤顏色、圖示語義和包體規則以設計規格為準。
- 交易類別圖示已在 `miniprogram/subpkg-trade/assets/category-icons/01.png` 至 `20.png`；用 `miniprogram/subpkg-trade/trade-category-icons.ts` 匯出的 `getTradeCategoryIconPath(categoryId)`。不得重新生成、複製或改色。
- 執行實作時先重新核對 voyage.tw 來源版本、公式和清單雜湊；來源改變時先更新設計與權威資料。
- 資料演算法、資產生成和確定性輸出遵循紅—綠—重構。UI/WXML/WXSS 依微信 DevTools 的 HTML 截圖報告驗收。
- 第一次修改 UI/WXML/WXSS 前，完整重讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md` 和 `docs/superpowers/specs/2026-09-16-miniprogram-review-html-report-design.md`；樣式與證據流程以兩份規格為準。
- 主包 UI 素材維持 250 KiB 總預算；大流行專屬分包圖片上限 96 KB。交易類別圖示由既有任務提供，須計入最終 `subpkg-trade` 大小。
- 不提交任何內容，除非使用者先看到變更檔案、驗證結果和擬用 commit message 並明確確認。

## Review Focus

- 目前小時的延遲臨界：例如 `delaySeconds=390` 時，`now` 在觸發秒數之前須保留預測，之後須排除；來源分鐘標籤以 JavaScript `Math.round(390 / 60) === 7` 顯示。
- 一個海域同一小時若命中三種週期，結果必須遵守來源類型順序，只保留前兩種。
- 7 天矩陣固定有 28 個六小時視窗；本地日期 chip 按 168 小時區間動態列出 7–8 日。跳日和跳段不應丟失篩選條件，也不得造成 320px 頁面級橫向溢出。
- 原始 `tradetypeNN` 必須正規化為共用解析器使用的 `NN`；每個事件類別都應取得同一張篩選／詳情頁圖示。
- 日期跨日與使用者裝置時區改變時，矩陣／行程／詳情的本地日期和小時取自同一個絕對觸發時間；顯示分鐘依來源 `delaySeconds` 取整，三個視圖一致。

---

## File Map

### Create

- `data/master/major-events.json`：來源核對日期、快照版本與雜湊、週期、相位、延遲、來源 ID 和影響的交易類別 ID。
- `data/schema/major-events.schema.json`：大流行權威資料結構及欄位限制。
- `tools/data-audit/validate-major-events.ts`：跨欄位檢查事件、海域及交易類別 ID 對應。
- `tools/data-pipeline/build-major-event-runtime-data.ts`：由權威資料產生分包 Runtime 參考資料。
- `miniprogram/subpkg-trade/runtime/major-event-data-store.ts`：Runtime 生成資料入口。
- `miniprogram/subpkg-trade/domain/major-event-forecast.ts`：純函式預測和下一次事件搜尋。
- `miniprogram/subpkg-trade/presenters/major-event-presenter.ts`：矩陣、行程和詳情的顯示模型。
- `miniprogram/subpkg-trade/pages/popularity/index.ts`、`index.wxml`、`index.wxss`：大流行預測頁。
- `miniprogram/subpkg-trade/pages/popularity/index.json`：啟用原生下拉更新。
- `tools/ui-assets/build-major-events-assets.ts`：紙紋、海域徽記和頁面裝飾的分包素材生成與檢查。
- `data/master/ui-assets/major-events/`：紙紋、裝飾與海域徽記的原始素材及生成提示文件。
- `tests/data-contract/major-events-schema.test.ts`、`major-events-relations.test.ts`。
- `tests/data-pipeline/major-event-runtime-output.test.ts`。
- `tests/runtime-contract/major-event-runtime.test.ts`。
- `tests/domain/major-event-forecast.test.ts`。
- `tests/presenters/major-event-presenter.test.ts`。
- `tests/pages/major-event-page.test.ts`、`tests/integration/major-event-feature-contract.test.ts`。
- `tests/ui-assets/major-events-assets.test.ts`。
- `tools/miniprogram-review/scenarios/major-event-forecast.json`、`tools/miniprogram-review/scenarios/major-event-filter-empty.json`。

### Generated outputs

- `miniprogram/assets/ui/feature-major-events.png`：主包入口圖示。
- `miniprogram/subpkg-trade/assets/major-events/`：紙紋、裝飾和海域徽記。
- `miniprogram/subpkg-trade/major-event-reference.js`：大流行 Runtime 參考資料。
- `data/audit/ui-asset-build-report.json`：由 `npm run assets:ui` 更新，登記新的主包入口圖示。
- `data/audit/major-events-asset-build-report.json`：大流行分包素材確定性生成報告。

### Modify

- `tools/import/types.ts`：加入 `CanonicalMajorEventsDataset`。
- `tools/data-audit/create-schema-validator.ts`、`tools/data-audit/run-data-audit.ts`：註冊並檢查 `major-events`。
- `tools/data-pipeline/generate.ts`、`miniprogram/contracts/runtime-data.ts`：註冊 Runtime 產生資料和型別。
- `package.json`：將新分包輸出納入 `generate:check`；加入 `assets:major-events` 和 `assets:major-events:check`，並納入 `verify`。
- `tools/ui-assets/config.ts`：加入 96×96、4 KB 內的首頁 `feature-major-events` 圖示。
- `tests/ui-assets/build-ui-assets.test.ts`：將首頁功能圖示契約由 6 枚更新為 7 枚。
- `tests/integration/trade-feature-contract.test.ts`：更新 `subpkg-trade.pages` 精確契約，新增大流行頁路由。
- `docs/superpowers/specs/2026-08-09-design-foundation-design.md`、`miniprogram/styles/design-foundation.wxss`、`tests/architecture/design-foundation.test.ts`：加入四個只供事件色籤使用的事件分類色 Token。
- `miniprogram/app.json`：在 `subpkg-trade` 加入 `pages/popularity/index`。
- `miniprogram/pages/home/index.ts`、`index.wxml`：加入首頁入口並顯示六個主要模組。
- `tests/pages/home-page.test.ts`：更新模組順序和 6 個主要入口的契約。
- `tools/miniprogram-review/scenarios/home-visual.json`、`tests/miniprogram-review/scenario.test.ts`：更新首頁六入口畫面契約和場景名稱／斷言。

---

### Task 1: 加入事件色 Token 和確定性頁面素材輸出

**Files:**

- Modify: `docs/superpowers/specs/2026-08-09-design-foundation-design.md`
- Modify: `miniprogram/styles/design-foundation.wxss`
- Modify: `tests/architecture/design-foundation.test.ts`
- Modify: `tools/ui-assets/config.ts`
- Modify: `tests/ui-assets/build-ui-assets.test.ts`
- Create: `tools/ui-assets/build-major-events-assets.ts`
- Create: `tests/ui-assets/major-events-assets.test.ts`
- Create: `data/master/ui-assets/feature-major-events-source.png`
- Create: `data/master/ui-assets/major-events/`
- Modify: `package.json`
- Generated: `miniprogram/assets/ui/feature-major-events.png`
- Generated: `miniprogram/subpkg-trade/assets/major-events/`
- Generated: `data/audit/ui-asset-build-report.json`
- Generated: `data/audit/major-events-asset-build-report.json`

**Interfaces:**

- `buildMajorEventsAssets(options: { sourceRoot: string; outputRoot: string }): Promise<MajorEventsAssetBuildReport>`。
- `MajorEventsAssetBuildReport.files` 是 `{ kind: 'region' | 'texture' | 'ornament'; output: string; width: number; height: number; byteSize: number; sha256: string }[]`；報告含 `totalBytes`。
- `checkMajorEventsAssets(options: { sourceRoot: string; outputRoot: string; reportPath: string })` 以暫存輸出重建並比對解碼像素 hash、檔案清單及穩定 JSON 報告，不寫入正式輸出。
- CLI 支援互斥的 `--write`／`--check`；write 輸出素材和 `data/audit/major-events-asset-build-report.json`，check 驗證正式素材與報告。

- [ ] **Step 1: 先寫失敗的素材管線測試**

  在 `tests/ui-assets/major-events-assets.test.ts` 建立臨時來源，使用現有 `sharp` fixture helper 寫入設計規格列出的 18 個 zone icon、紙紋和裝飾 PNG。斷言輸出清單包含且只包含 `region-zone-37.png, region-zone-41.png, region-zone-57.png, region-zone-21.png, region-zone-22.png, region-zone-23.png, region-zone-58.png, region-zone-59.png, region-zone-50.png, region-zone-53.png, region-zone-54.png, region-zone-33.png, region-zone-63.png, region-zone-34.png, region-zone-18.png, region-zone-60.png, region-zone-20.png, region-zone-55.png` 各一枚、紙紋一張和裝飾三種；所有 region PNG 為 64×64 透明圖、單檔不超過 2 KB，專屬總量不超過 96 KB。重建第二次後，像素 SHA-256 必須一致，`--check` 需能偵測輸出檔或報告內容被改動。

  ```ts
  const report = await buildMajorEventsAssets({ sourceRoot, outputRoot })
  expect(report.files.filter((file) => file.kind === 'region')).toHaveLength(18)
  expect(report.totalBytes).toBeLessThanOrEqual(96 * 1024)
  ```

- [ ] **Step 2: 執行素材測試確認失敗**

  Run: `npx vitest run tests/ui-assets/major-events-assets.test.ts`

  Expected: FAIL，指出 `buildMajorEventsAssets` 尚不存在。

- [ ] **Step 3: 加入分包素材 builder 和 budget 檢查**

  在 `tools/ui-assets/build-major-events-assets.ts` 使用既有 Sharp 依賴，以穩定排序的 manifest 逐項處理來源：`region-zone-<數字 ID>-source.png` 輸出為 `region-zone-<數字 ID>.png`；例如 `zone_37` 使用 `region-zone-37-source.png` 並輸出 `region-zone-37.png`。manifest 必須將完整來源 ID 對到該檔名，輸出目錄固定為 `miniprogram/subpkg-trade/assets/major-events/`。區域徽記和三種透明裝飾使用 16 色；`paper-chart-tile.png` 以兩色、無抖動量化，保持 512×512 平鋪底圖的稀疏刻線與低噪留白。紙紋和裝飾輸出固定命名為 `paper-chart-tile.png`、`matrix-ship-engraving.png`、`compass-rose.png`、`journey-harbor-footer.png`。若來源缺檔、透明內容為空、尺寸錯誤、單檔或總量超限，builder 必須報出明確錯誤並停止寫出。

- [ ] **Step 4: 對 Asset Builder 綠測**

  Run: `npx vitest run tests/ui-assets/major-events-assets.test.ts`

  Expected: 所有尺寸、透明邊界、輸出集合、單檔 budget、總量 budget 和穩定 hash 測試通過。

- [ ] **Step 5: 加入首頁入口 icon recipe 和事件色 Token**

  在 `tools/ui-assets/config.ts` 加入 `feature-major-events` recipe：96×96、16 色、4 KB 以內、輸出 `feature-major-events.png`。更新 `tests/ui-assets/build-ui-assets.test.ts` 的 feature ID 清單和筆數為 7，避免既有素材契約因新增圖示失敗。在 `design-foundation-design.md`、`design-foundation.wxss` 和其架構測試加入 `--uwo-color-event-brass: #85661F`、`--uwo-color-event-rust: #923F38`、`--uwo-color-event-forest: #526F54`、`--uwo-color-event-sea: #32677E`；測試四個 token 唯一定義、色值正確，並驗證以 `#F5EFE0` 文字呈現時對比度均不低於 4.5:1。

- [ ] **Step 6: 生成來源插畫及正式素材**

  使用 ImageGen 依核准的視覺規格生成：一張 96×96 羅盤＋時間刻度首頁 icon、18 個來源海域徽記、無縫紙紋、矩陣帆船線描、羅盤玫瑰和行程港口剪影。以同一風格提示約束 18 枚徽記，每張依 `zoneId` 命名並核對設計規格的語義；所有來源置於 `data/master/ui-assets/`，提示文件記錄每個檔名與圖形主體。不要生成或複製 20 枚交易類別 icon，它們已由 `category-icons/01.png` 至 `20.png` 提供。

- [ ] **Step 7: 執行正式素材生成和檢查**

  Run:

  ```powershell
  npm run assets:ui
  npm run assets:major-events
  npm run assets:ui:check
  npm run assets:major-events:check
  ```

  Expected: `assets:ui` 更新 `data/audit/ui-asset-build-report.json`；主包 UI 素材總量仍不超過 250 KiB，首頁 icon 不超過 4 KB；`assets:major-events` 更新專屬報告；大流行分包素材不超過 96 KB；兩個 builder 產物、報告都能由 check 命令確定性重建。

---

### Task 2: 建立大流行權威資料與 schema 校驗

**Files:**

- Create: `data/master/major-events.json`
- Create: `data/schema/major-events.schema.json`
- Create: `tools/data-audit/validate-major-events.ts`
- Modify: `tools/import/types.ts`
- Modify: `tools/data-audit/create-schema-validator.ts`
- Modify: `tools/data-audit/run-data-audit.ts`
- Create: `tests/data-contract/major-events-schema.test.ts`
- Create: `tests/data-contract/major-events-relations.test.ts`

**Interfaces:**

```ts
export interface CanonicalMajorEventType {
  id: 'pop1' | 'pop2' | 'pop3' | 'pop4' | 'pop5' | 'pop6' | 'pop7' | 'pop8'
  name: string
  periodHours: number
  tradeTypeIds: string[] // 原始來源 ID，例如 tradetype17
  sourceRefs: CanonicalReferenceSourceRefs // map.js 週期、json.js mapping、lang_1.js 名稱
}

export interface CanonicalMajorEventZone {
  id: string // 例如 zone_37
  name: string // voyage.tw 繁體中文原名
  phaseHours: number // 原始 pop_zone.z
  delaySeconds: number // 原始 pop_zone.d
  regionIconId: string // 來源 zone_37 對應 region-zone-37.png
  sourceRefs: CanonicalReferenceSourceRefs // json.js 相位／延遲、lang_1.js 名稱
}

export interface CanonicalMajorEventsDataset {
  sourceSnapshot: string
  sourceVersion: string
  sourceManifestSha256: string
  anchorEpochSeconds: number
  // 陣列次序是來源次序；不可按 ID 排序，來源 res.slice(0, 2) 依此保留優先級。
  eventTypes: CanonicalMajorEventType[]
  zones: CanonicalMajorEventZone[]
}
```

- [ ] **Step 1: 寫 schema 和關聯測試**

  `major-events-schema.test.ts` 驗證一份有效 8 事件／18 區域 fixture 通過、缺少 `delaySeconds`／`sourceRefs`、無效 `sourceManifestSha256` 和未知欄位被拒絕、延遲小於 0 或大於 600 被拒絕。`major-events-relations.test.ts` 驗證事件 ID、週期與來源次序固定；逐項核對規格列出的八組事件→`tradeTypeIds` 精確陣列；全部事件的交易品類聯集恰為 `tradetype01` 至 `tradetype20`，且每類 ID 都能對到 `data/master/trade-goods.json` 的 `tradeTypes` reference；zone ID、`regionIconId`、`z`、`d`、名稱和順序與規格 18 列一致，且每張資產存在。source refs 必須非空並指向已核對的 voyage.tw 來源欄位。

- [ ] **Step 2: 先跑測試確認失敗**

  Run: `npx vitest run tests/data-contract/major-events-schema.test.ts tests/data-contract/major-events-relations.test.ts`

  Expected: FAIL，指出 validator/schema 與 canonical fixture 尚不存在。

- [ ] **Step 3: 寫入權威資料和 schema**

  建立 `major-events.json`，來源版本、manifest SHA-256 和錨點使用重新核對的值；事件週期、名稱、精確類別 ID 陣列及 18 個 zone 的 ID／名稱／`z`／`d`／`regionIconId` 依規格來源次序輸入。每個事件與 zone 加 `sourceRefs`；不把交易類別 icon path、`popular_trade` 的未確認數值區間或外部 URL 存入本檔。JSON Schema 使用 `additionalProperties: false`，固定 8 個 event 和 18 個 zone 的數量，限制 ID、來源雜湊、名稱、相位、延遲及每個 trade type 陣列。

- [ ] **Step 4: 接入 data audit**

  將 `major-events` 加入 `create-schema-validator.ts`；在 `run-data-audit.ts` 讀取該 JSON 和既有 trade master，呼叫 schema validator 及 `validateMajorEvents(dataset, tradeDataset)`。`validateMajorEvents` 對照固定來源 order/mapping、唯一 ID、延遲與相位界限、交易類別 reference 及徽記 manifest。錯誤 finding 必須帶 event/zone ID、JSON Pointer 和中文修正建議。不得更改 archive 或既有 trade master 資料。

- [ ] **Step 5: 對資料測試及門禁**

  Run:

  ```powershell
  npx vitest run tests/data-contract/major-events-schema.test.ts tests/data-contract/major-events-relations.test.ts
  npm run data:check
  ```

  Expected: 新增測試通過；資料檢查讀取 8 種類型、18 個海域，且 finding 數量為 0。

---

### Task 3: 生成 Runtime 參考資料並建立 Store

**Files:**

- Create: `tools/data-pipeline/build-major-event-runtime-data.ts`
- Modify: `tools/data-pipeline/generate.ts`
- Modify: `miniprogram/contracts/runtime-data.ts`
- Create: `miniprogram/subpkg-trade/major-event-reference.js` (generated)
- Create: `miniprogram/subpkg-trade/runtime/major-event-data-store.ts`
- Modify: `package.json`
- Create: `tests/data-pipeline/major-event-runtime-output.test.ts`
- Create: `tests/runtime-contract/major-event-runtime.test.ts`

**Interfaces:**

```ts
export interface RuntimeMajorEventType {
  id: string
  name: string
  periodHours: number
  tradeTypeIds: string[] // 兩位數 ID，例如 17
}

export interface RuntimeMajorEventZone {
  id: string
  name: string
  phaseHours: number
  delaySeconds: number
  iconPath: string
}

export interface RuntimeMajorEventReference {
  sourceSnapshot: string
  sourceVersion: string
  sourceManifestSha256: string
  anchorEpochSeconds: number
  eventTypes: RuntimeMajorEventType[]
  zones: RuntimeMajorEventZone[]
}

export function buildMajorEventReference(
  dataset: CanonicalMajorEventsDataset,
  pageAssetRoot: string,
): RuntimeMajorEventReference
```

- [ ] **Step 1: 寫輸出 builder 測試**

  驗證給定 `tradetype17` 會生成類別 ID `17`；給定 `zone_37` 會輸出 `/subpkg-trade/assets/major-events/region-zone-37.png`；canonical event/zone 次序保持原樣；同一輸入兩次序列化 bytes 完全一致；缺少任一 `regionIconId` 圖檔時 builder 明確失敗。

- [ ] **Step 2: 執行測試確認失敗**

  Run: `npx vitest run tests/data-pipeline/major-event-runtime-output.test.ts`

  Expected: FAIL，因 `buildMajorEventReference` 尚未定義。

- [ ] **Step 3: 實作資料投影**

  實作純函式 `normalizeSourceTradeTypeId`：只接受 `tradetype01` 到 `tradetype20`，回傳末兩位字串；其他字串拋出含原值的錯誤。`buildMajorEventReference` 保留 canonical 陣列原次序、輸出海域 `iconPath`、刪除任何 source refs/url、保留 `sourceSnapshot`、`sourceVersion`、`sourceManifestSha256` 和 anchor。`generate.ts` 讀 `data/master/major-events.json` 並寫 `miniprogram/subpkg-trade/major-event-reference.js`。

- [ ] **Step 4: 加入 Runtime Store**

  `major-event-data-store.ts` 只從 `../major-event-reference` require 一次，匯出 `getMajorEventReference(): RuntimeMajorEventReference`。頁面、Domain 和 Presenter 不得直接 require 生成檔。

- [ ] **Step 5: 對輸出與 Runtime 契約測試**

  先 Run `npm run data:generate` 產生新 Runtime 模組，再 Run: `npx vitest run tests/data-pipeline/major-event-runtime-output.test.ts tests/runtime-contract/major-event-runtime.test.ts`

  Expected: 對 `data/master/major-events.json` 產生的模組 bytes 與 `buildMajorEventReference` 的預期序列化結果一致，即使新檔尚未被 Git 追蹤也能檢查；source snapshot/version/hash 均保留；缺失或無效 zone icon path 不通過。

- [ ] **Step 6: 更新生成檢查路徑**

  將 `miniprogram/subpkg-trade/major-event-reference.js` 加入 `package.json` 的 `generate:check` diff 清單，再執行 `npm run generate:check`。新檔尚未被 Git 追蹤時，以 Step 5 的模組 bytes 比對測試作本次交付證據；追蹤後由 `generate:check` 保護後續漂移。不可把 `git diff` 對未追蹤新檔的沉默當成無漂移證據。

---

### Task 4: 實作純 Domain 預測函式

**Files:**

- Create: `miniprogram/subpkg-trade/domain/major-event-forecast.ts`
- Create: `tests/domain/major-event-forecast.test.ts`

**Interfaces:**

```ts
export interface MajorEventForecastQuery {
  nowUnixSeconds: number
  horizonHours: 24 | 72 | 168
  zoneId?: string | null
  eventTypeId?: string | null
}

export interface MajorEventOccurrence {
  key: string // 穩定鍵：zoneId + eventTypeId + triggerAtUnixSeconds
  eventTypeId: string
  eventTypeName: string
  zoneId: string
  zoneName: string
  tradeTypeIds: string[] // 兩位數類別 ID
  triggerAtUnixSeconds: number
  delaySeconds: number
}

export function forecastMajorEvents(
  reference: RuntimeMajorEventReference,
  query: MajorEventForecastQuery,
): MajorEventOccurrence[]

export function findNextMajorEvent(
  reference: RuntimeMajorEventReference,
  query: Omit<MajorEventForecastQuery, 'horizonHours'>,
): MajorEventOccurrence | null
```

- [ ] **Step 1: 寫 Domain 紅測試**

  使用固定 `anchorEpochSeconds = 1670889600` fixture，對 `pop1` 至 `pop8` 逐一驗證來源週期整點命中及相鄰小時未命中；另覆蓋同一小時只保留來源次序前兩種、目前小時延遲前／後、半開時間窗端點，以及依 `zoneId`／`eventTypeId` 篩選。延遲前／後 fixture 只含 `pop8`，避免 `Si = 0` 同時命中多週期而受最多兩種上限影響。再用非整點 `now` 驗證 `iHour === horizonHours` 候選若觸發時刻落在區間內會保留、落在右邊界時會排除；測 `findNextMajorEvent` 最遠 379 小時及無命中回傳 `null`。

  ```ts
  it('排除已經過的 300 秒區域延遲，只保留尚未觸發事件', () => {
    const before = forecastMajorEvents(referenceWithFestivalDelay(300), {
      nowUnixSeconds: 1670889600 + 299,
      horizonHours: 24,
    })
    const after = forecastMajorEvents(referenceWithFestivalDelay(300), {
      nowUnixSeconds: 1670889600 + 301,
      horizonHours: 24,
    })
    expect(before[0]?.triggerAtUnixSeconds).toBe(1670889900)
    expect(after).toEqual([])
  })
  ```

- [ ] **Step 2: 執行 Domain 測試確認失敗**

  Run: `npx vitest run tests/domain/major-event-forecast.test.ts`

  Expected: FAIL，因 pure forecast functions 尚未存在。

- [ ] **Step 3: 實作來源公式和觸發時刻**

  對 `iHour = 0..horizonHours`（包含兩端候選整點）計算 `pHour = floor((now - anchorEpochSeconds) / 3600)` 和 `Si = pHour + 401 * phaseHours + iHour`。週期命中時，絕對觸發秒數為 `anchorEpochSeconds + (pHour + iHour) * 3600 + delaySeconds`。只有 `triggerAt >= now` 且 `triggerAt < now + horizonHours * 3600` 才回傳；候選整點多算一格後由半開區間裁切，涵蓋未對齊整點的 24／72／168 小時邊界。每個海域和小時依 `eventTypes` 來源順序最多輸出兩項；Occurrence key 由 zone ID、事件 ID 和絕對觸發秒組成，不使用陣列位置或隨機值。

- [ ] **Step 4: 實作篩選和下一次事件**

  `zoneId` 和 `eventTypeId` 同時存在時以 AND 條件篩選。`findNextMajorEvent` 搜尋到 379 個未來小時，回傳最早一筆；無事件時回傳 `null`。輸出以時間秒、來源海域順序、事件來源順序穩定排序。

- [ ] **Step 5: 對 Domain 測試**

  Run: `npx vitest run tests/domain/major-event-forecast.test.ts`

  Expected: 整點、延遲、來源重疊順序、範圍端點和 379 小時查詢測試全部通過。

---

### Task 5: 建立 Presenter 並重用交易類別圖示

**Files:**

- Create: `miniprogram/subpkg-trade/presenters/major-event-presenter.ts`
- Create: `tests/presenters/major-event-presenter.test.ts`
- Read-only dependency: `miniprogram/subpkg-trade/trade-category-icons.ts`
- Read-only dependency: `miniprogram/subpkg-trade/runtime/trade-data-store.ts`

**Interfaces:**

```ts
export interface MajorEventCategoryView {
  id: string
  name: string
  iconPath: string
}

export interface MajorEventListViewItem extends MajorEventOccurrence {
  dateLabel: string
  timeLabel: string
  eventColorToken: string
  categories: MajorEventCategoryView[]
}

export function presentMajorEvent(
  occurrence: MajorEventOccurrence,
  tradeReference: RuntimeTradeReference,
): MajorEventListViewItem
```

- [ ] **Step 1: 寫 presenter 紅測試**

  使用 `tradetype17` 的來源 fixture 驗證 Runtime 正規化後的 `17` 能找到 `RuntimeTradeType.id === '17'`、名稱「香料」，並呼叫 `getTradeCategoryIconPath('17')` 取得 `/subpkg-trade/assets/category-icons/17.png`。遍歷八種事件映射的類別聯集（20 類），圖示 resolver 不可返回 `null`。對 `pop1` 至 `pop8` 驗證每一類對應的色 Token；再覆蓋 `390` 秒時間標籤顯示來源規則取整後的 `HH:07`／`07 分`、整點顯示「整點」、本地跨日日期；畫面小時與日期取自絕對觸發時刻，分鐘必須由 delay 取整生成。

- [ ] **Step 2: 執行 presenter 測試確認失敗**

  Run: `npx vitest run tests/presenters/major-event-presenter.test.ts`

  Expected: FAIL，因 `presentMajorEvent` 尚未存在。

- [ ] **Step 3: 實作共享分類與圖示投影**

  由 `tradeReference.tradeTypes` 讀類別名稱，由 `getTradeCategoryIconPath(categoryId)` 讀共用圖示路徑；缺少來源分類名稱或圖示路徑時拋出包含 `eventTypeId` 和 `categoryId` 的錯誤，不能靜默產生空圖示。畫面日期和小時由 `triggerAtUnixSeconds` 的裝置本地 `Date` 得到，分鐘欄依 `Math.round(delaySeconds / 60)` 覆蓋生成，確保 `390` 秒呈現 `HH:07`。事件色依規格映射 brass/rust/forest/sea 四組 Token。

- [ ] **Step 4: 實作日期分組、矩陣與下一次結果 Presenter**

  加入 `presentMajorEventMatrix` 和 `presentMajorEventJourney`：六小時矩陣每格依 zone／距離捕捉時刻的 forecast-hour slot 分組；行程按裝置本地日期分組；相同觸發分鐘共用時間標題。兩者均呼叫 `presentMajorEvent`，維持同一類別 iconPath。

- [ ] **Step 5: 對 Presenter 測試**

  Run: `npx vitest run tests/presenters/major-event-presenter.test.ts`

  Expected: 20 類名稱與圖示路徑完整，色籤類別、分鐘取整、日期格式與矩陣／行程一致。

---

### Task 6: 實作大流行矩陣、行程和詳情頁

**Files:**

- Create: `miniprogram/subpkg-trade/pages/popularity/index.ts`
- Create: `miniprogram/subpkg-trade/pages/popularity/index.wxml`
- Create: `miniprogram/subpkg-trade/pages/popularity/index.wxss`
- Create: `miniprogram/subpkg-trade/pages/popularity/index.json`
- Create: `tests/pages/major-event-page.test.ts`
- Modify: `miniprogram/app.json` (先註冊新頁路由，供 DevTools 開頁驗收)
- Create: `tools/miniprogram-review/scenarios/major-event-forecast.json` (先提供根節點等待與首張矩陣截圖)

**Interfaces:**

- Page state: `activeView: 'matrix' | 'journey'`；`horizonHours: 24 | 72 | 168`；`nowUnixSeconds`；`selectedDateKey`（裝置本地 `YYYY-MM-DD`）；`segmentIndex`；`selectedZoneId`；`selectedEventTypeId`；`detailEventSnapshot: MajorEventListViewItem | null`；`nextOccurrenceResult`／`nextOccurrenceSearched`；`failedRegionIconIds`／`failedCategoryIconIds`；`pageError`。
- Page handlers: `onLoad`、`onShow`、`onHide`、`onPullDownRefresh`、`onHorizonTap`、`onViewTap`、`onDateTap`、`onSegmentTap`、`onAreaFilterTap`、`onEventFilterTap`、`onEventTap`、`onCloseDetail`、`onNextOccurrenceTap`、`onRegionIconError`、`onCategoryIconError`。

  寫第一段頁面 UI 前先執行 `npm run devtools:doctor`。Task 6 Step 3 註冊頁面路由並建立最小 review 場景：入口為新頁、`watchPaths` 覆蓋頁面和素材目錄、等待 `.major-events-page` 後截圖；之後才能啟動矩陣畫面驗收。

- [ ] **Step 1: 寫頁面 state 與 markup 紅測試**

  用現有 `tests/pages/trade-page.test.ts` 的 `Page` stub pattern 建立 `major-event-page.test.ts`。測試 `onLoad` 載入參考資料、缺失／無效 Runtime 資料顯示錯誤、`onShow` 每分鐘更新且 `onHide` 清除 timer、下拉刷新、24/72/168 小時切換、矩陣／行程切換保留 filter、依固定裝置日期時間產生相交的本地日期 key、4/12/28 個六小時段、跨日選日後跳到首個相交段、查下一次有命中／無命中、開啟中的詳情在分鐘刷新後維持快照、關閉詳情、區域／類別圖示失敗時保留名稱並顯示 fallback、篩選空狀態。WXML contract 測試要求六個一小時預測槽、18 個海域列、category icons 和來源繁體中文名稱；事件操作的無障礙名稱包含海域／類型／日期／時刻，圖像裝飾不造成名稱重複朗讀。

- [ ] **Step 2: 執行頁面測試確認失敗**

  Run: `npx vitest run tests/pages/major-event-page.test.ts`

  Expected: FAIL，因頁面路徑、狀態及模板尚不存在。

- [ ] **Step 3: 建立頁面初始化和控制器**

  先執行 `npm run devtools:doctor`。將 `pages/popularity/index` 附加在 `app.json` 的 `subpkg-trade.pages` 陣列末端，保留原有 index/detail 順序，路由為 `/subpkg-trade/pages/popularity/index`；同時建立最小 review 場景骨架，待矩陣 WXML class 寫好後填入真實等待選擇器。`onLoad` 以 try/catch 載入 `getMajorEventReference()` 和交易 `getTradeReference()`，Runtime Store 驗證必要陣列和欄位；缺失或無效時設定 `pageError` 並停止產生矩陣，不能渲染假空資料。初次載入、分鐘計時和下拉都走同一個安全刷新函式，Domain／Presenter 出錯時顯示資料錯誤狀態；下拉的 `finally` 必須呼叫 `wx.stopPullDownRefresh()`。設 `wx.setNavigationBarTitle({ title: '大流行預測' })`；成功時產生初始 72 小時矩陣。`index.json` 開啟下拉更新；`onShow` 捕捉目前秒數並排程下一個本地分鐘邊界更新；`onHide` 清除 timer。`onHorizonTap` 僅接受 24、72、168，依預測區間重建本地日期 key，並更新 segment 上限；日期列列出實際與範圍相交的 2／3–4／7–8 個本地日期。`onViewTap` 保留 horizon、zone 和 type filters。

- [ ] **Step 4: 實作 A 矩陣**

  WXML 繪製海域列、6 個一小時預測槽、region icon、事件籤和空格短橫線。六小時段由 `segmentIndex` 選擇，按距離捕捉的 `now` 時刻分槽；列頭顯示槽起點本地 `HH:mm`，事件籤使用來源分鐘取整後的精確顯示時刻。所有範圍都以當下為起點，所以日期 chip 由區間動態產生並置於內層水平 `scroll-view`；窄屏時只有矩陣容器可水平捲動，頁面本身不得溢出。區域圖示失敗時顯示本地羅盤 fallback 並保留海域名；事件籤每項維持至少 `88rpx` 高的點擊熱區，同格兩種事件分行顯示。矩陣事件籤只顯示事件名和時間，不放交易類別圖示。

  完成矩陣首版後，使用最小 review 場景執行 `npm run devtools:changed -- --mode iterate --summary "大流行矩陣首版"`，檢查 HTML 截圖並修正該批問題。

- [ ] **Step 5: 實作 C 行程列表與 filters**

  行程頁用 `dateLabel` 分組，以黃銅時間軸線和圓點排列事件；filter buttons 使用 `全部海域` 和 `全部類型`，事件類別籤顯示 32rpx 共享 category icon 和來源名稱。類別圖示載入失敗時保留類別名並顯示本地 fallback。「查下一次」只有在同時選擇海域和事件類型後執行 `findNextMajorEvent`；命中時顯示單筆下一次事件摘要並可打開共用詳情 sheet，無命中時明確顯示搜尋範圍內沒有符合事件，不生成 16 天列表。

- [ ] **Step 6: 實作詳情 Bottom Sheet 與錯誤狀態**

  點事件後把 Presenter view item 快照存入 `detailEventSnapshot`，再打開同一 page 的 sheet，顯示來源海域、事件名、依規格取整後的裝置本地時間、本地日期、共享交易類別 icon 和固定說明「本頁預測觸發時刻，不預測持續時間。」分鐘更新後即使事件離開未來區間，已開 sheet 仍顯示原預測快照；關閉後保留原 view/filter。使用 `env(safe-area-inset-bottom)` 和既有 button/token class。Runtime 缺資料顯示「大流行資料暫時無法載入，請更新小程序後再試」，不可誤顯示成空矩陣。

  完成行程、篩選和詳情互動後，再執行 `npm run devtools:changed -- --mode iterate --summary "大流行行程與詳情"`，檢查新增場景步驟和截圖。

- [ ] **Step 7: 對頁面測試與相關契約測試**

  Run: `npx vitest run tests/pages/major-event-page.test.ts tests/presenters/major-event-presenter.test.ts tests/domain/major-event-forecast.test.ts`

  Expected: 事件範圍、filters、category icons、詳情 sheet 和錯誤狀態全部符合契約。

---

### Task 7: 加入首頁入口和路由整合

**Files:**

- Modify: `miniprogram/pages/home/index.ts`
- Modify: `miniprogram/pages/home/index.wxml`
- Modify: `tests/pages/home-page.test.ts`
- Modify: `tests/integration/trade-feature-contract.test.ts`
- Create: `tests/integration/major-event-feature-contract.test.ts`

- [ ] **Step 1: 擴充首頁契約測試**

  更新 `tests/pages/home-page.test.ts`：模組陣列在貿易品入口後、兌換碼前加入 `{ id: 'major-events', name: '大流行預測', iconPath: '/assets/ui/feature-major-events.png', route: '/subpkg-trade/pages/popularity/index' }`；總模組數為 7、前 6 個是主入口、`coupon-redemption` 斷言移至索引 5、`error-report` 仍由 ID 選擇器單獨放在次級區。明確斷言新模組位於索引 4，icon path 和 route 正確。

- [ ] **Step 2: 跑首頁測試確認失敗**

  Run: `npx vitest run tests/pages/home-page.test.ts`

  Expected: FAIL，因目前 modules 和 WXML `index < 5` 尚未加入第六項。

- [ ] **Step 3: 加入模組和分包路由**

  在 `home/index.ts` 插入大流行 tile 到 `trade-goods` 後、`coupon-redemption` 前；WXML 主列表限值改為 `index < 6`，保留以 `item.id === 'error-report'` 顯示次級入口的選擇器。更新 `tests/integration/trade-feature-contract.test.ts`，確認 `subpkg-trade.pages` 精確為 `pages/index/index`、`pages/detail/index`、`pages/popularity/index`，維持原有頁序並把新頁附加在尾端。同步更新 `tests/pages/home-page.test.ts` 確認主入口顯示六個、回報仍在次級區，並驗證新入口圖示載入失敗時由既有 icon fallback 保留可見入口名稱。

- [ ] **Step 4: 綠測首頁與整合路由**

  Run: `npx vitest run tests/pages/home-page.test.ts tests/integration/trade-feature-contract.test.ts tests/integration/major-event-feature-contract.test.ts`

  Expected: 第六個主入口導到大流行頁，subPackage root/route 完整，資料回報仍只有次級入口。

---

### Task 8: 增加 DevTools 場景並完成視覺驗收

**Files:**

- Modify: `tools/miniprogram-review/scenarios/major-event-forecast.json` (擴充 Task 6 建立的場景骨架)
- Modify: `tools/miniprogram-review/scenarios/home-visual.json`
- Modify: `tests/miniprogram-review/scenario.test.ts`
- Read-only: `docs/superpowers/specs/2026-09-16-miniprogram-review-html-report-design.md`

- [ ] **Step 1: 先寫場景契約測試**

  驗證既有場景骨架的入口為 `/subpkg-trade/pages/popularity/index`，`watchPaths` 覆蓋 `miniprogram/subpkg-trade/pages/popularity/`、`assets/major-events/` 和 `assets/category-icons/`；步驟依序包含矩陣截圖、選 7 天、選實際相交日期、跳段、切行程、切換海域／事件 filter、開詳情 sheet 並截圖，以及查下一次的有命中／無命中狀態。更新首頁場景名稱為「首頁六個主要入口」，加入「大流行預測」可見文字斷言，並把新主包入口 icon 加入其 `watchPaths`。所有動作均使用 `scenario.ts` 已支援的 action。

- [ ] **Step 2: 加入 review 場景**

  使用既有 `miniprogram-review` JSON schema 可接受的 action；場景內每個等待條件先用實際 WXML class。使用既有 `iphone-small`、`iphone-standard`、`android-large` 三種裝置 profile 為矩陣、行程和詳情拍攝場景截圖；另在微信 DevTools 視口設定中精確核對矩陣 320、375、393、430px，以及 393px 的行程和詳情。完成首頁場景的「大流行預測」斷言後，執行 `npm run devtools:changed -- --mode iterate --summary "首頁六個主要入口"`，檢查報告中的首頁截圖。

- [ ] **Step 3: 核對尺寸和像素級設計要求**

  對照設計規格檢查 320、375、393、430px：主包圖示及 250 KiB UI 資產預算；`subpkg-trade` 完整大小含現成 20 類圖示；18 個 zone ID 徽記、紙紋與角飾；4 種事件色和所有 8 種事件 ID 對色；動態本地日期列；六欄海域矩陣及其內層捲動；20 類 trade icon 路徑；sheet 安全區、88rpx 事件熱區和文字對比。將精確視口測試結果與任何修正寫入 HTML 報告迭代 notes，並確認 `subpkg-trade` 實際大小包含既有類別圖示且低於微信分包上限。

- [ ] **Step 4: 執行最終自動化與完整門禁**

  Run:

  ```powershell
  npm run devtools:changed -- --mode final --summary "大流行預測頁與首頁入口" --note "矩陣視口已核對 320/375/393/430px；行程與詳情已核對 393px，頁面無水平溢出。"
  npm run verify
  git diff --check
  ```

  Expected: 可連線時產生通過的 HTML 報告，報告直接展示修改後矩陣、行程、詳情和首頁截圖。由於 `app.json` 變更觸發全頁面場景，最終報告須保留所有被選中場景狀態；若微信 DevTools 環境阻塞，保留 `blocked` 結果，不得宣稱頁面驗收通過。

- [ ] **Step 5: 提交前停在使用者確認門**

  顯示 `git status --short`、`git diff --stat`、所有驗證結果、HTML 報告路徑和擬用 commit message `feat: 新增大流行預測`。依 AGENTS 規則等待使用者明確確認；未確認前不執行 `git commit`。

---

## Spec Coverage Review

| 規格要求 | 對應任務 |
| --- | --- |
| 四個事件分類 Token、表面與對比 | Task 1 |
| 主包首頁圖示、18 個區域徽記、紙紋／帆船／羅盤／港口底圖 | Task 1 |
| 8 組來源事件→交易類別順序映射、18 個 zone ID／相位／延遲、來源 refs/hash | Task 2 |
| 確定性 Runtime reference、來源順序、Data Store 和生成檢查 | Task 3 |
| 24／72／168 小時、延遲、來源重疊和 379 小時下一次查詢 | Task 4 |
| 本地時間、來源分鐘取整、8 個事件色映射、20 類共用圖示 | Task 5 |
| 精確滾動範圍、動態本地日期、六小時分段、篩選／查下一次、錯誤與 fallback 狀態、詳情快照 | Task 6 |
| 首頁六個主入口、既有次級回報、第七個總模組和分包路由回歸 | Task 7 |
| DevTools HTML 報告、四種寬度、完整 verify 和使用者 commit gate | Task 8 |

## Execution Handoff

計畫完成後先由使用者審閱；本次尚未取得實作方式。由於任務依賴順序固定為資料契約 → 生成資料 → Domain → Presenter → UI，且已完成的交易類別圖示只需按穩定 ID 共用，我建議選擇 **Native**：由同一位實作者逐步完成並在最後由 reviewer 檢查整個分支，避免不同實作者同時修改 `subpkg-trade` 的 presenter、路由和 assets。使用者審閱並選擇方式前，不開始實作。
