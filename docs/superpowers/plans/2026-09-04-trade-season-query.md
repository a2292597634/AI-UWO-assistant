# 貿易品淡旺季查詢實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**目標：** 將 voyage.tw 的貿易品、港口季節與淡旺季資料固化為小程序本地資料，新增首頁「貿易品」入口，並提供不同港口完整 1–12 月同列矩陣查詢。

**架構：** 先以版本化來源快照解析 trades、city_trades、json_city、tradetype_pm、seasons 與繁體中文語言資料，轉換為 data/master/trade-goods.json，再由既有生成管線產生貿易品分包的搜尋索引、港口季節參照與詳情分片。小程序頁面只透過 Data Store 與純函式查詢資料；首頁新增主要功能卡，點擊後進入貿易品分包搜尋頁，詳情頁以 12 個等寬欄位同列顯示每個港口的全年季節及淡旺季狀態。將完整貿易品資料放在分包，保留既有微信主包尺寸門禁。

**技術組合：** 微信小程序原生 TypeScript／WXML／WXSS、Node.js 匯入與生成工具、JSON Schema、Vitest、ESLint、Prettier、既有 sharp UI 素材管線。

## 全域約束

- 所有介面、文件、註釋和使用者交互使用繁體中文；WXML/WXSS 類名使用英文 BEM。
- 工作分支為 codex/phase-1-trade-season-query，基準為目前 main 的 4565a16。
- 不修改既有 archive 快照；來源匯入只新增版本化快照，data/master 是唯一手動維護資料源，miniprogram/generated 與貿易品生成分片禁止手動修改。
- 任何 miniprogram runtime 不使用 wx.request、wx.cloud、遠程 URL 或 Node.js API。
- 不新增、升級或替換 npm 依賴；沿用現有 Vitest、tsx、sharp 與 TypeScript。
- 涉及 UI、WXML 或 WXSS 必須完整遵守 docs/superpowers/specs/2026-08-09-design-foundation-design.md 的 Token、字體、間距、圓角、陰影、狀態、觸控與安全區規範。
- TDD 邏輯順序固定為 RED 測試、GREEN 最小實作、REFACTOR 整理；資料解析、轉換、校驗、篩選、月份計算、矩陣投影與生成確定性均須有測試。
- 港口矩陣必須在 320px、375px、393px 與 430px 寬度一行顯示 12 個月份，不使用左右滑動、scroll-view 或頁面級橫向滾動。
- 季節／天候使用 voyage.tw 的靜態字元語義；每格仍提供文字或無障礙標籤，不能只依賴顏色或圖示理解狀態。
- 每個階段完成後檢查禁止路徑、執行相關測試、git diff --check，提交前必須展示變更文件、驗證結果與擬用 commit message，等待使用者確認。

---

### Task 1：建立貿易品來源快照與解析器

**Files:**

- Modify: tools/data-audit/source-config.ts
- Modify: tools/import/download-source.ts
- Create: tools/import/trade-types.ts
- Create: tools/import/parse-trades.ts
- Create: tests/import/download-trade-source.test.ts
- Create: tests/import/parse-trades.test.ts
- Create: archive/voyage-tw-2026052501-trade-20260904/raw-data/json.js
- Create: archive/voyage-tw-2026052501-trade-20260904/raw-data/lang_1.js
- Create: archive/voyage-tw-2026052501-trade-20260904/raw-data/map.js
- Create: archive/voyage-tw-2026052501-trade-20260904/raw-data/source-manifest.json

**Interfaces:**

- Consumes: 既有 sourceConfig、downloadFullFile、SourceManifest 與 extractJsAssignment。
- Produces: downloadTradeSnapshot(outputDir, fetcher)、parseTradeSource(jsonSource, languageSource) 與 SourceTradeBundle，供 Task 2 的轉換器使用。

- [ ] **Step 1：先寫來源下載與解析 RED 測試**

在 tests/import/download-trade-source.test.ts 建立固定 fetch stub，確認下載器只接受 HTTP 200、寫出 json.js／lang_1.js／map.js 和完整 manifest，不對實際網站發請求：

    const manifest = await downloadTradeSnapshot(outputDir, fetcher)
    expect(manifest.files.map((file) => file.path)).toEqual([
      'json.js',
      'lang_1.js',
      'map.js',
    ])
    expect(manifest.files.every((file) => file.sha256.length === 64)).toBe(true)

在 tests/import/parse-trades.test.ts 建立最小原始 fixture，至少包含 trade0615、town 範例、20 類型中的一個旺／淡規則、兩組 seasons 與 emoji 映射，確認：

    const bundle = parseTradeSource(jsonSource, languageSource)
    expect(bundle.trades.trade0615.name).toBe('葡萄酒')
    expect(bundle.tradeTypes['06'].peakSeasonIds).toEqual(['s4', 's5'])
    expect(bundle.tradeTypes['06'].lowSeasonIds).toEqual(['s2', 's6'])
    expect(bundle.seasonProfiles['0']).toHaveLength(12)
    expect(bundle.glyphs.season.s6).toBe('💧')
    expect(bundle.glyphs.status.peak).toBe('▲')

執行：

    npm.cmd test -- tests/import/download-trade-source.test.ts tests/import/parse-trades.test.ts

預期：RED，因為 downloadTradeSnapshot、parseTradeSource 與 SourceTradeBundle 尚未存在。

- [ ] **Step 2：加入來源配置與下載器**

在 tools/data-audit/source-config.ts 加入：

    tradeDataScript: '/js/json.js?v=2026052501'
    tradeLanguageScript: '/js/lang_1.js?v=1779690379'
    tradeMapScript: '/js/map.js?v=2026052501'

在 tools/import/download-source.ts 新增：

    export const downloadTradeSnapshot = async (
      outputDir: string,
      fetcher: typeof fetch = globalThis.fetch,
    ): Promise<SourceManifest>

實作固定下載順序 json.js、lang_1.js、map.js，沿用 downloadFullFile 的 HTTP 200、byteSize、SHA-256、last-modified 與 downloadedAt 記錄。不得把 lang_1.js 拆成受限 ranges，貿易品需要完整繁體中文名稱。新增 CLI script import:download:trade，輸出固定到：

    archive/voyage-tw-2026052501-trade-20260904/raw-data

既有 import:download 的航海士輸出路徑與行為保持不變。

- [ ] **Step 3：以結構化抽取解析來源 JavaScript**

在 tools/import/trade-types.ts 定義來源型別：

    export interface SourceTrade {
      id: string
      name: string
      typeId: string
      cityIds: string[]
      rank: number | null
      barter: boolean
      special: boolean
      noSeasonalVariation: boolean
      iconId: string | null
    }

    export interface SourceCity {
      id: string
      nameKey: string
      seasonProfileId: string
    }

    export interface SourceTradeBundle {
      trades: Record<string, SourceTrade>
      cityTrades: Record<string, string[]>
      cities: Record<string, SourceCity>
      tradeTypes: Record<string, {
        peakSeasonIds: string[]
        lowSeasonIds: string[]
      }>
      seasonProfiles: Record<string, string[]>
      glyphs: {
        season: Record<string, string>
        status: { peak: string; low: string; normal: string }
      }
      languageMap: Record<string, string>
    }

在 tools/import/parse-trades.ts 只用 extractJsAssignment 解析 JSON-like 靜態賦值，不執行來源程式。解析並正規化 trades、city_trades、json_city、tradetype_pm、seasons、emoji_ss、emoji_pm 及 lang_js[1]；港口季節索引使用 json_city 的 ss，交換資料以 v 或 vc 的存在判定，nlp 標記轉成 noSeasonalVariation；trade0615 的名稱必須由語言鍵取得，不在程式碼寫死貿易品名稱。從 city_trades 反向建立 trade 的 cityIds，但保留來源 trade 自帶的城市欄位供轉換器比對。

- [ ] **Step 4：執行 GREEN 與來源快照下載**

    npm.cmd test -- tests/import/download-trade-source.test.ts tests/import/parse-trades.test.ts
    npm.cmd run import:download:trade

預期：兩個匯入測試通過；來源 manifest 包含三個完整檔案、URL、大小、SHA-256 和下載時間。若網站回傳非 200 或缺少結構化變數，命令必須失敗並保留可讀錯誤碼。

- [ ] **Step 5：檢查解析輸出並提交本任務**

    npm.cmd test -- tests/import/download-trade-source.test.ts tests/import/parse-trades.test.ts
    git diff --check

確認既有 import:download 測試仍通過，且 archive 內沒有覆寫 voyage-tw-2026052501 既有檔案。提交前展示新增快照檔案清單與來源 manifest，再使用：

    git add tools/data-audit/source-config.ts tools/import/download-source.ts tools/import/trade-types.ts tools/import/parse-trades.ts tests/import/download-trade-source.test.ts tests/import/parse-trades.test.ts archive/voyage-tw-2026052501-trade-20260904
    git commit -m "feat(import): 擷取貿易品來源資料"

---

### Task 2：建立 canonical 貿易品資料、Schema 與資料檢查

**Files:**

- Modify: tools/import/types.ts
- Create: tools/import/transform-trades.ts
- Create: tools/import/validate-trades.ts
- Create: tools/import/run-trade-import.ts
- Modify: tools/data-audit/create-schema-validator.ts
- Modify: tools/data-audit/run-data-audit.ts
- Create: data/schema/trade-goods.schema.json
- Modify: data/schema/dataset.schema.json
- Modify: data/master/dataset.json
- Create: data/master/trade-goods.json
- Create: tests/import/transform-trades.test.ts
- Create: tests/data-contract/trade-goods-schema.test.ts
- Create: tests/data-contract/trade-goods-relations.test.ts
- Modify: package.json

**Interfaces:**

- Consumes: Task 1 的 SourceTradeBundle 與 archive/voyage-tw-2026052501-trade-20260904/raw-data。
- Produces: CanonicalTradeDataset、transformTrades(bundle)、validateTradeDataset(dataset) 與 import:run:trade，供 Task 4 的生成器使用。

- [ ] **Step 1：先寫 canonical 轉換與 Schema RED 測試**

在 tests/import/transform-trades.test.ts 覆蓋：

    const result = transformTrades(fixture)
    expect(result.dataset.tradeGoods).toContainEqual(expect.objectContaining({
      id: 'trade0615',
      name: '葡萄酒',
      categoryId: '06',
      salesMode: 'fixed-port',
    }))
    expect(result.dataset.tradeGoods.find((item) => item.id === 'trade0615')?.salesPortIds)
      .toEqual(['town101', 'town102'])

測試必須確認 city_trades 反向關係與 trade 內城市清單一致；若兩者不一致，結果加入 warning anomaly，不靜默取其一。對沒有固定銷售港口的資料確認 salesMode 為 barter 或 special，salesPortIds 為空陣列。

在 tests/data-contract/trade-goods-schema.test.ts 與 tests/data-contract/trade-goods-relations.test.ts 覆蓋：

    expect(validateTradeDataset(validDataset)).toEqual([])
    expect(validateTradeDataset(datasetWithDuplicateTradeId)).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_TRADE_ID', severity: 'error' }),
    )
    expect(validateTradeDataset(datasetWithElevenMonths)).toContainEqual(
      expect.objectContaining({ code: 'SEASON_MONTH_COUNT', severity: 'error' }),
    )
    expect(validateTradeDataset(datasetWithOverlappingPeakAndLow)).toContainEqual(
      expect.objectContaining({ code: 'SEASON_RULE_OVERLAP', severity: 'error' }),
    )

執行：

    npm.cmd test -- tests/import/transform-trades.test.ts tests/data-contract/trade-goods-schema.test.ts tests/data-contract/trade-goods-relations.test.ts

預期：RED，因為 canonical 型別、轉換器、Schema 與 validator 尚未存在。

- [ ] **Step 2：定義 canonical trade 型別**

在 tools/import/types.ts 新增：

    export type CanonicalTradeSalesMode = 'fixed-port' | 'barter' | 'special'

    export interface CanonicalTradeGood {
      id: string
      name: string
      categoryId: string
      categoryName: string
      rank: number | null
      salesMode: CanonicalTradeSalesMode
      salesPortIds: string[]
      peakSeasonIds: string[]
      lowSeasonIds: string[]
      iconId: string | null
      sourceRefs: { voyageTw: string }
    }

    export interface CanonicalTradePort {
      id: string
      name: string
      regionName: string | null
      seasonProfileId: string
      sourceRefs: { voyageTw: string }
    }

    export interface CanonicalTradeSeasonProfile {
      id: string
      monthSeasonIds: string[]
    }

    export interface CanonicalTradeType {
      id: string
      name: string
      peakSeasonIds: string[]
      lowSeasonIds: string[]
    }

    export interface CanonicalTradeGlyphs {
      season: Record<string, string>
      status: { peak: string; low: string; normal: string }
    }

    export interface CanonicalTradeDataset {
      sourceSnapshot: string
      tradeGoods: CanonicalTradeGood[]
      tradeTypes: CanonicalTradeType[]
      ports: CanonicalTradePort[]
      seasonProfiles: CanonicalTradeSeasonProfile[]
      glyphs: CanonicalTradeGlyphs
    }

同步在 data/schema/dataset.schema.json 為 counts 增加可選的 tradeGoods、tradePorts、tradeSeasonProfiles 整數欄位，並在 data/master/dataset.json 寫入實際數量；不把新欄位列為既有測試 fixture 的必填欄位。

- [ ] **Step 3：實作轉換與 cross-file validator**

在 tools/import/transform-trades.ts 實作：

    export const transformTrades = (
      bundle: SourceTradeBundle,
    ): { dataset: CanonicalTradeDataset; anomalies: TransformAnomaly[] }

轉換規則：

- trade ID、town ID 與 type ID 使用來源 ID，不以中文名稱建立關聯；
- 優先使用 city_trades 建立銷售港口集合，再與 trades 的 cityIds 做排序後比較；
- 固定銷售港口資料使用 salesMode fixed-port；
- 有 barter／v 或 vc 等交換資料而沒有固定港口時使用 barter；
- guild、zone、boss 或其他特殊標記而沒有固定港口時使用 special；
- category 旺／淡規則從 tradetype_pm 正規化為 peakSeasonIds 與 lowSeasonIds；
- seasonProfiles 每組只保留 12 個 season ID，月份順序為 1 月到 12 月；
- emoji_ss、emoji_pm 與繁體中文名稱全部寫入 canonical，避免 runtime 依賴網站。

在 tools/import/validate-trades.ts 實作 validateTradeDataset(dataset)：

    export const validateTradeDataset = (
      dataset: CanonicalTradeDataset,
    ): AuditFinding[]

阻擋錯誤包括重複 ID、未知引用、月份不是 12 個、未知 season ID、旺淡規則重疊、glyph 缺失與固定港口沒有 seasonProfile。沒有固定港口的特殊品只產生可查詢空狀態，不產生虛構港口。

- [ ] **Step 4：建立 Schema 與匯入命令**

在 data/schema/trade-goods.schema.json 使用 draft 2020-12，根節點 additionalProperties false，固定以下欄位：

    sourceSnapshot
    tradeGoods
    tradeTypes
    ports
    seasonProfiles
    glyphs

為 tradeGoods、tradeTypes、ports、seasonProfiles 設置唯一 ID、字串最小長度、陣列型別與必要欄位；seasonProfiles.monthSeasonIds 使用 minItems 12 與 maxItems 12；salesMode 使用 fixed-port、barter、special enum。glyphs.status 必須包含 peak、low、normal。

在 create-schema-validator.ts 把 trade-goods 加入 schema registry；在 run-data-audit.ts 將 data/master/trade-goods.json 納入 schema 與 cross-file validator。維持現有航海士／技能 audit fixture 行為不變。

新增 tools/import/run-trade-import.ts，讀取 Task 1 三個 raw file，呼叫 parseTradeSource、transformTrades、createSchemaValidator 與 validateTradeDataset，將候選輸出寫到：

    archive/voyage-tw-2026052501-trade-20260904/canonical-candidates/trade-goods.json

候選資料通過檢查後才人工審核並寫入 data/master/trade-goods.json；不得把候選資料直接當作 generated output。package.json 新增：

    "import:download:trade": "tsx tools/import/download-source.ts --trade"
    "import:run:trade": "tsx tools/import/run-trade-import.ts"

CLI 的 --trade 分支只新增貿易品快照，不改既有 import:download 無參數流程。

- [ ] **Step 5：執行 GREEN、資料審核與提交**

    npm.cmd test -- tests/import/transform-trades.test.ts tests/data-contract/trade-goods-schema.test.ts tests/data-contract/trade-goods-relations.test.ts
    npm.cmd run import:run:trade
    npm.cmd run data:check

確認 canonical 輸出與來源統計一致：656 筆貿易品、224 個港口、20 個類型、10 組季節配置；特殊／交換品保留但不產生固定港口矩陣。將候選內容審核後寫入 data/master/trade-goods.json，再重新執行 data:check。

    git diff --check
    git add tools/import/types.ts tools/import/transform-trades.ts tools/import/validate-trades.ts tools/import/run-trade-import.ts tools/data-audit/create-schema-validator.ts tools/data-audit/run-data-audit.ts data/schema/trade-goods.schema.json data/schema/dataset.schema.json data/master/dataset.json data/master/trade-goods.json tests/import/transform-trades.test.ts tests/data-contract/trade-goods-schema.test.ts tests/data-contract/trade-goods-relations.test.ts package.json
    git commit -m "feat(data): 建立貿易品 canonical 資料"

---

### Task 3：新增首頁貿易品入口圖示

**Files:**

- Create: data/master/ui-assets/feature-trade-goods-source.png
- Modify: tools/ui-assets/config.ts
- Modify: tests/ui-assets/build-ui-assets.test.ts
- Modify: miniprogram/pages/home/index.ts
- Modify: miniprogram/pages/home/index.wxml
- Modify: miniprogram/pages/home/index.wxss
- Modify: tests/pages/home-page.test.ts
- Create: miniprogram/assets/ui/feature-trade-goods.png

**Interfaces:**

- Consumes: 既有 home modules、module-grid、UI asset recipe 與 icon failure fallback。
- Produces: 首頁主要功能區的 trade-goods module，路由 /subpkg-trade/pages/index/index，使用本地 feature-trade-goods.png。

- [ ] **Step 1：先寫首頁入口與素材 RED 測試**

在 tests/pages/home-page.test.ts 將首頁契約改成預期五個 module，並先加入失敗斷言：

    expect(homePage.data.modules.map((module) => module.id)).toEqual([
      'officer-catalog',
      'trade-goods',
      'battle-fleet',
      'adventure-fleet',
      'data-maintenance',
    ])
    expect(homePage.data.modules[1]).toMatchObject({
      name: '貿易品',
      iconPath: '/assets/ui/feature-trade-goods.png',
      route: '/subpkg-trade/pages/index/index',
    })
    expect(homeWxml).toContain('index < 4')
    expect(homeWxml).toContain('index === 4')
    expect(homeWxss).toMatch(/width:\s*25%/)

在 tests/ui-assets/build-ui-assets.test.ts 將 featureIds 加入 feature-trade-goods，確認來源圖示輸出為 96×96、檔案不超過 feature 資產單檔 12KB，並維持 deterministic output。

    npm.cmd test -- tests/pages/home-page.test.ts tests/ui-assets/build-ui-assets.test.ts

預期：RED，因為首頁仍只有三個主要 module、WXML 條件仍為 index < 3、缺少入口素材 recipe。

- [ ] **Step 2：建立首頁本地入口素材**

建立 320×320、透明背景的 feature-trade-goods-source.png：

- 主圖形使用秤／交易象徵，呼應 voyage.tw 貿易品入口的語義；
- 圖形使用既有首頁功能圖示的紙張、墨綠與黃銅視覺，不放遠程 URL、不含長文字；
- 保留足夠透明邊界，讓既有 96×96 resize recipe 的透明範圍檢查通過。

在 tools/ui-assets/config.ts 加入：

    {
      id: 'feature-trade-goods',
      source: 'feature-trade-goods-source.png',
      output: 'feature-trade-goods.png',
      mode: 'resize-png',
      width: 96,
      height: 96,
      maxBytes: 12 * 1024,
      group: 'feature',
    }

執行 assets:ui 生成 miniprogram/assets/ui/feature-trade-goods.png，不手動編輯生成檔。

- [ ] **Step 3：新增首頁 module 並維持資料維護次要入口**

在 miniprogram/pages/home/index.ts 的 modules 中，將貿易品插入航海士名鑑之後：

    {
      id: 'trade-goods',
      name: '貿易品',
      iconPath: '/assets/ui/feature-trade-goods.png',
      route: '/subpkg-trade/pages/index/index',
      iconFailed: false,
    }

在 index.wxml 將主要功能條件改為 index < 4，資料維護條件改為 index === 4；不新增首頁搜尋框或矩陣。

在 index.wxss 將主要 module-grid__item 寬度改為 25%，讓四個主要入口同列；保留 module-grid__item--secondary 的 width: 100%，資料維護仍是次要橫向卡片。四個入口在 320px 寬度仍保留現有 96rpx 圖示與最小操作熱區。

- [ ] **Step 4：執行 GREEN 與素材檢查**

    npm.cmd run assets:ui
    npm.cmd test -- tests/pages/home-page.test.ts tests/ui-assets/build-ui-assets.test.ts
    npm.cmd run assets:ui:check

預期：首頁五個 module 契約、四個主要入口布局、本地圖示輸出、透明邊界、檔案預算與 deterministic report 全部通過。

- [ ] **Step 5：提交首頁入口**

    git diff --check
    git add data/master/ui-assets/feature-trade-goods-source.png tools/ui-assets/config.ts tests/ui-assets/build-ui-assets.test.ts miniprogram/assets/ui/feature-trade-goods.png miniprogram/pages/home/index.ts miniprogram/pages/home/index.wxml miniprogram/pages/home/index.wxss tests/pages/home-page.test.ts
    git commit -m "feat(home): 新增貿易品入口"

---

### Task 4：擴充 runtime contract、生成器與 Data Store

**Files:**

- Modify: miniprogram/contracts/runtime-data.ts
- Modify: miniprogram/runtime/generated-modules.d.ts
- Modify: tools/data-pipeline/generate.ts
- Modify: tools/data-pipeline/build-runtime-data.ts
- Create: tools/data-pipeline/build-trade-runtime-data.ts
- Create: miniprogram/subpkg-trade/runtime/trade-data-store.ts
- Create: miniprogram/subpkg-trade/runtime/trade-detail-store.ts
- Create: miniprogram/subpkg-trade/trade-goods.js
- Create: miniprogram/subpkg-trade/trade-reference.js
- Create: miniprogram/subpkg-trade/trade-details-0.js
- Create: miniprogram/subpkg-trade/trade-details-1.js
- Create: miniprogram/subpkg-trade/trade-details-2.js
- Create: miniprogram/subpkg-trade/trade-details-3.js
- Create: miniprogram/subpkg-trade/trade-details-4.js
- Create: miniprogram/subpkg-trade/trade-details-5.js
- Create: miniprogram/subpkg-trade/trade-details-6.js
- Create: miniprogram/subpkg-trade/trade-details-7.js
- Create: miniprogram/subpkg-trade/trade-details-8.js
- Create: miniprogram/subpkg-trade/trade-details-9.js
- Create: miniprogram/subpkg-trade/trade-detail-index.js
- Create: miniprogram/subpkg-trade/trade-detail-loaders.js
- Modify: package.json
- Create: tests/data-pipeline/trade-runtime-output.test.ts
- Create: tests/runtime-contract/trade-runtime.test.ts

**Interfaces:**

- Consumes: Task 2 的 CanonicalTradeDataset 與 data/master/trade-goods.json。
- Produces: 貿易品分包索引、參照資料、詳情分片、trade data store 與穩定生成輸出，供 Task 5–7 使用。

- [ ] **Step 1：先寫 runtime contract 與生成確定性 RED 測試**

在 tests/data-pipeline/trade-runtime-output.test.ts 建立最小 canonical fixture，確認輸出具備固定檔名、固定排序、10 個詳情分片與可重複內容：

    const first = buildTradeRuntimeFixture(canonical)
    const second = buildTradeRuntimeFixture(canonical)
    expect(first).toEqual(second)
    expect(first.index[0]).toMatchObject({
      id: 'trade0615',
      name: '葡萄酒',
      salesPortCount: expect.any(Number),
    })
    expect(first.reference.seasonProfiles['0'].monthSeasonIds).toHaveLength(12)

在 tests/runtime-contract/trade-runtime.test.ts 確認生成記錄：

    expect(runtimeTradeGoods.every((entry) => entry.id && entry.name)).toBe(true)
    expect(Object.values(runtimeReference.seasonProfiles).every(
      (profile) => profile.monthSeasonIds.length === 12,
    )).toBe(true)
    expect(getTradeDetail('trade0615')).toMatchObject({
      id: 'trade0615',
      name: '葡萄酒',
      salesMode: 'fixed-port',
    })

    npm.cmd test -- tests/data-pipeline/trade-runtime-output.test.ts tests/runtime-contract/trade-runtime.test.ts

預期：RED，因為貿易品 runtime contract、buildTradeRuntimeData 與 Data Store 尚未存在。

- [ ] **Step 2：定義 runtime contract**

在 miniprogram/contracts/runtime-data.ts 新增：

    export interface RuntimeTradeGoodIndexEntry {
      id: string
      name: string
      categoryId: string
      categoryName: string
      rank: number | null
       salesMode: 'fixed-port' | 'barter' | 'special'
       salesPortCount: number
      searchAliases: string[]
    }

    export interface RuntimeTradeGoodDetail {
      id: string
      name: string
      categoryId: string
      categoryName: string
      rank: number | null
       iconId: string | null
      salesMode: 'fixed-port' | 'barter' | 'special'
      salesPortIds: string[]
      peakSeasonIds: string[]
      lowSeasonIds: string[]
    }

    export interface RuntimeTradeType {
      id: string
      name: string
      peakSeasonIds: string[]
      lowSeasonIds: string[]
    }

    export interface RuntimeTradePortReference {
      id: string
      name: string
      regionName: string | null
      seasonProfileId: string
    }

    export interface RuntimeTradeSeasonProfile {
      id: string
      monthSeasonIds: string[]
    }

    export interface RuntimeTradeReference {
       tradeTypes: RuntimeTradeType[]
       ports: RuntimeTradePortReference[]
       seasonProfiles: RuntimeTradeSeasonProfile[]
      seasonNames: Record<string, string>
      glyphs: {
        season: Record<string, string>
        status: { peak: string; low: string; normal: string }
      }
    }

在 runtime/generated-modules.d.ts 補上 trade-goods、trade-reference、trade-detail-index 與 trade-detail-loaders 的 CommonJS 宣告，讓頁面不需要直接讀取生成檔型別。

- [ ] **Step 3：實作 runtime generator**

在 tools/data-pipeline/build-trade-runtime-data.ts 實作：

    export const buildTradeGoodsIndex = (
      dataset: CanonicalTradeDataset,
    ): RuntimeTradeGoodIndexEntry[]

    export const buildTradeReference = (
      dataset: CanonicalTradeDataset,
    ): RuntimeTradeReference

    export const buildTradeGoodDetails = (
      dataset: CanonicalTradeDataset,
    ): Record<string, RuntimeTradeGoodDetail>

    export const tradeDetailShard = (tradeId: string): number

    export const writeTradeRuntimeData = (
      dataset: CanonicalTradeDataset,
      mainOutputDir: string,
      subpackageOutputDir: string,
    ): void

生成規則：

- index 依 trade ID 穩定排序，searchAliases 至少包含完整名稱；
- reference 將港口與季節配置按 ID 穩定排序，seasonProfiles 每組保留 12 個月；
- detail 只保存貿易品 ID、分類、銷售港口 ID、旺淡 season ID 與本地 iconId，不重複存入每個港口的 12 個狀態；
- shard 使用與既有 detail loader 相同的固定 hash 方式，固定輸出 details-0.js 至 details-9.js、trade-detail-index.js 與 trade-detail-loaders.js；
- 生成內容只由 data/master/trade-goods.json 決定，同一輸入不得因物件列舉順序產生不同輸出。

在 tools/data-pipeline/generate.ts 讀取 data/master/trade-goods.json，建立 miniprogram/subpkg-trade，呼叫 writeTradeRuntimeData；在 build-runtime-data.ts 保留航海士、技能、字典生成行為，不把貿易品欄位混入既有 officer detail。

更新 package.json 的 generate:check，使其在既有生成檔之外比較：

    miniprogram/subpkg-trade/trade-goods.js
    miniprogram/subpkg-trade/trade-reference.js
    miniprogram/subpkg-trade/trade-details-*.js
    miniprogram/subpkg-trade/trade-detail-index.js
    miniprogram/subpkg-trade/trade-detail-loaders.js

- [ ] **Step 4：實作 Data Store 邊界**

在 miniprogram/subpkg-trade/runtime/trade-data-store.ts 中，這個檔案是貿易品分包生成資料唯一入口：

    export function getTradeGoods(): readonly RuntimeTradeGoodIndexEntry[]
    export function getTradeReference(): RuntimeTradeReference

在 miniprogram/subpkg-trade/runtime/trade-detail-store.ts 中，這個檔案是貿易品詳情分片唯一入口：

    export function getTradeDetail(tradeId: string): RuntimeTradeGoodDetail | null

兩個 store 只做靜態 require、型別轉換與找不到資料時回傳 null；頁面不可直接 require miniprogram/generated 或 trade-details 分片，也不可自行計算 shard。

- [ ] **Step 5：執行 GREEN、生成檢查與提交**

    npm.cmd test -- tests/data-pipeline/trade-runtime-output.test.ts tests/runtime-contract/trade-runtime.test.ts
    npm.cmd run data:generate
    npm.cmd run generate:check
    npm.cmd run check:miniprogram-size

確認生成資料包含 656 筆索引、港口參照可覆蓋所有固定港口、每組 profile 有 12 個月份，主包與貿易品分包沒有超出既有大小門檻。

    git diff --check
    git add miniprogram/contracts/runtime-data.ts miniprogram/runtime/generated-modules.d.ts tools/data-pipeline/generate.ts tools/data-pipeline/build-runtime-data.ts tools/data-pipeline/build-trade-runtime-data.ts miniprogram/subpkg-trade/runtime/trade-data-store.ts miniprogram/subpkg-trade/runtime/trade-detail-store.ts miniprogram/subpkg-trade/trade-goods.js miniprogram/subpkg-trade/trade-reference.js miniprogram/subpkg-trade package.json tests/data-pipeline/trade-runtime-output.test.ts tests/runtime-contract/trade-runtime.test.ts
    git commit -m "feat(runtime): 生成貿易品查詢資料"

---

### Task 5：實作遊戲月份、貿易品查詢與矩陣投影純函式

**Files:**

- Create: miniprogram/domain/game-month.ts
- Create: miniprogram/domain/trade-query.ts
- Create: miniprogram/domain/trade-season.ts
- Create: tests/domain/game-month.test.ts
- Create: tests/domain/trade-query.test.ts
- Create: tests/domain/trade-season.test.ts

**Interfaces:**

- Consumes: Task 4 的 runtime contract，不接觸 wx 或頁面資料。
- Produces: gameMonthAt(timestampMs)、queryTradeGoods(entries, criteria)、getTradeSeasonStatus(trade, seasonId) 與 buildTradePortMatrix(trade, reference, gameMonth)。

- [ ] **Step 1：先寫月份與矩陣 RED 測試**

在 tests/domain/game-month.test.ts 固定使用 UTC timestamp 驗證日本時區錨點：

    expect(gameMonthAt(Date.UTC(2026, 8, 3, 15, 0, 0))).toBe(12)
    expect(gameMonthAt(Date.UTC(2026, 8, 2, 15, 0, 0))).toBe(11)
    expect(gameMonthAt(Date.UTC(2026, 8, 4, 15, 0, 0))).toBe(1)
    expect(gameMonthAt(Date.UTC(2026, 8, 15, 15, 0, 0))).toBe(12)

再補充午夜邊界：

    expect(gameMonthAt(Date.UTC(2026, 8, 3, 14, 59, 59))).toBe(11)
    expect(gameMonthAt(Date.UTC(2026, 8, 3, 15, 0, 0))).toBe(12)

在 tests/domain/trade-season.test.ts 驗證：

    const rows = buildTradePortMatrix(wine, reference, 12)
    expect(rows[0].months).toHaveLength(12)
    expect(rows[0].months[11]).toMatchObject({
      month: 12,
      isCurrent: true,
      status: expect.stringMatching(/peak|low|normal/),
    })
    expect(rows[0].months.every((month) => month.seasonGlyph !== null)).toBe(true)

    npm.cmd test -- tests/domain/game-month.test.ts tests/domain/trade-season.test.ts

預期：RED，因為月份、狀態與矩陣函式尚未存在。

- [ ] **Step 2：實作 gameMonthAt**

在 miniprogram/domain/game-month.ts 使用不依賴裝置時區的 timestamp 計算：

    export const GAME_MONTH_ANCHOR_MS = Date.UTC(2026, 8, 3, 15, 0, 0)
    const DAY_MS = 24 * 60 * 60 * 1000

    export const gameMonthAt = (timestampMs: number): number => {
      if (!Number.isFinite(timestampMs)) throw new Error('INVALID_TIMESTAMP')
      const deltaDays = Math.floor((timestampMs - GAME_MONTH_ANCHOR_MS) / DAY_MS)
      return ((deltaDays + 11) % 12 + 12) % 12 + 1
    }

錨點是 2026-09-04 00:00:00+09:00 的 UTC 表示，負數餘數必須經正規化，確保錨點前的日期也回傳 1–12。

- [ ] **Step 3：實作搜尋與類型篩選**

在 miniprogram/domain/trade-query.ts 定義：

    export interface TradeQueryCriteria {
      searchText: string
      categoryId: string | null
    }

    export const queryTradeGoods = (
      entries: readonly RuntimeTradeGoodIndexEntry[],
      criteria: TradeQueryCriteria,
    ): RuntimeTradeGoodIndexEntry[]

搜尋規則：

- trim 後的空字串回傳完整索引；
- 使用 name 與 searchAliases 不分大小寫比對；
- categoryId 為 null 時不篩分類，否則只保留相同分類；
- 保持生成索引排序，不在查詢中重新按名稱排序；
- 不隱藏 barter／special，讓使用者可以看到沒有固定港口矩陣的資料。

- [ ] **Step 4：實作淡旺季狀態與 12 月矩陣**

在 miniprogram/domain/trade-season.ts 定義：

    export type TradeSeasonStatus = 'peak' | 'low' | 'normal' | 'unknown'

    export interface TradeMonthView {
      month: number
      seasonId: string | null
      seasonName: string | null
      seasonGlyph: string | null
      status: TradeSeasonStatus
      statusGlyph: string | null
      statusName: string
      isCurrent: boolean
      accessibleLabel: string
    }

    export interface TradePortMatrixView {
      portId: string
      portName: string
      regionName: string | null
      months: TradeMonthView[]
    }

    export const getTradeSeasonStatus = (
      trade: RuntimeTradeGoodDetail,
      seasonId: string,
    ): TradeSeasonStatus

    export const buildTradePortMatrix = (
      trade: RuntimeTradeGoodDetail,
      reference: RuntimeTradeReference,
      gameMonth: number,
    ): TradePortMatrixView[]

status 判定順序為 peakSeasonIds → lowSeasonIds → normal；season profile 缺失時回傳 unknown、glyph 為 null、statusName 為「資料待補」，不把未知資料誤判為一般。固定港口依 salesPortIds 原順序對應 reference.ports，輸出每個港口 12 個月份；barter／special 或 salesPortIds 為空時輸出空陣列，由頁面顯示空狀態。

- [ ] **Step 5：執行 GREEN、REFACTOR 與提交**

    npm.cmd test -- tests/domain/game-month.test.ts tests/domain/trade-query.test.ts tests/domain/trade-season.test.ts
    npm.cmd run typecheck
    git diff --check

重構時保持 gameMonthAt、queryTradeGoods、getTradeSeasonStatus 與 buildTradePortMatrix 的輸入輸出不變，不把 wx、Date.now 或 setData 放入 domain。

    git add miniprogram/domain/game-month.ts miniprogram/domain/trade-query.ts miniprogram/domain/trade-season.ts tests/domain/game-month.test.ts tests/domain/trade-query.test.ts tests/domain/trade-season.test.ts
    git commit -m "feat(domain): 新增貿易品季節查詢邏輯"

---

### Task 6：建立貿易品搜尋頁與路由

**Files:**

- Create: miniprogram/subpkg-trade/pages/index/index.ts
- Create: miniprogram/subpkg-trade/pages/index/index.wxml
- Create: miniprogram/subpkg-trade/pages/index/index.wxss
- Modify: miniprogram/app.json
- Create: tests/pages/trade-page.test.ts

**Interfaces:**

- Consumes: Task 4 的 getTradeGoods、getTradeReference 與 Task 5 的 queryTradeGoods。
- Produces: /subpkg-trade/pages/index/index 搜尋頁，以及導向 /subpkg-trade/pages/detail/index?id=貿易品ID 的首頁後續流程。

- [ ] **Step 1：先寫 Page 與 WXML RED 契約**

在 tests/pages/trade-page.test.ts 註冊 Page stub，建立：

    expect(tradePage.data.searchText).toBe('')
    expect(tradePage.data.visibleGoods.length).toBeGreaterThan(0)
    expect(tradePage.data.categories).toContainEqual(
      expect.objectContaining({ id: '06', name: '酒類' }),
    )

測試事件：

    page.onSearchInput({ detail: { value: '葡萄酒' } } as never)
    expect(page.data.visibleGoods).toEqual([
      expect.objectContaining({ name: '葡萄酒' }),
    ])

    page.onTradeTap({
      currentTarget: { dataset: { tradeId: 'trade0615' } },
    } as never)
    expect(wxStub.navigateTo).toHaveBeenCalledWith({
      url: '/subpkg-trade/pages/detail/index?id=trade0615',
    })

靜態讀取 WXML/WXSS，先加入：

    expect(tradeWxml).toContain('搜尋貿易品')
    expect(tradeWxml).toContain('貿易品清單')
    expect(tradeWxml).toContain('無結果')
    expect(tradeWxss).toContain('var(--uwo-color-canvas)')

    npm.cmd test -- tests/pages/trade-page.test.ts

預期：RED，因為頁面與 route 尚未存在。

- [ ] **Step 2：建立 Page Controller 狀態與查詢事件**

在 miniprogram/subpkg-trade/pages/index/index.ts 定義：

    interface TradePageData {
      searchText: string
      activeCategoryId: string | null
      categories: { id: string; name: string }[]
      visibleGoods: RuntimeTradeGoodIndexEntry[]
      resultCount: number
      pageError: string | null
    }

onLoad 從 getTradeGoods 與 getTradeReference 建立分類清單，初始搜尋為空、分類為 null。事件方法：

    onSearchInput(event: WechatMiniprogram.Input) {
      const searchText = event.detail.value
      this.setData({ searchText })
      this.refreshResults(searchText, this.data.activeCategoryId)
    }

    onCategoryTap(event: WechatMiniprogram.BaseEvent) {
      const categoryId = event.currentTarget.dataset.categoryId
      const next = categoryId === this.data.activeCategoryId ? null : categoryId
      this.setData({ activeCategoryId: next })
      this.refreshResults(this.data.searchText, next)
    }

    onTradeTap(event: WechatMiniprogram.BaseEvent) {
      const tradeId = event.currentTarget.dataset.tradeId
      if (typeof tradeId !== 'string' || !tradeId) return
      wx.navigateTo({ url: '/subpkg-trade/pages/detail/index?id=' + tradeId })
    }

不在頁面自行遍歷 generated 資料；refreshResults 只呼叫 queryTradeGoods。資料讀取錯誤顯示 pageError，空結果顯示可理解文字並保留搜尋條件。

- [ ] **Step 3：建立搜尋頁 WXML 與 WXSS**

WXML 固定包含：

    <view class="trade-page">
      <view class="trade-page__header">
        <text class="trade-page__eyebrow">貿易品</text>
        <text class="trade-page__title">淡旺季查詢</text>
      </view>
      <input class="trade-search" placeholder="搜尋貿易品" bindinput="onSearchInput" />
      <view class="trade-filters">分類按鈕迴圈</view>
      <view class="trade-results" aria-live="polite">貿易品清單迴圈</view>
      <view wx:if="{{visibleGoods.length === 0}}" class="trade-empty">無結果</view>
    </view>

清單列顯示名稱、分類、名產／普通標記、旺季／淡季文字摘要、固定港口數或「無固定銷售港口」；每列以 data-trade-id 和 bindtap 導航。輸入框使用至少 16px 等效文字大小，按鈕保持 88rpx 觸控高度。

WXSS 使用 --uwo-color-*、--uwo-font-*、--uwo-space-*、--uwo-radius-* Token；不使用遠程背景、Emoji 作為正式入口圖示或頁面級 overflow-x。

- [ ] **Step 4：註冊主頁並執行 GREEN**

在 miniprogram/app.json 的 subpackages 中加入貿易品搜尋頁；搜尋與詳情共用 subpkg-trade，避免完整索引進入主包。

    npm.cmd test -- tests/pages/trade-page.test.ts tests/pages/home-page.test.ts
    npm.cmd run typecheck

預期：搜尋輸入、分類切換、空結果、清單點擊路由與首頁「貿易品」入口契約全部通過。

- [ ] **Step 5：提交搜尋頁**

    git diff --check
    git add miniprogram/subpkg-trade/pages/index miniprogram/app.json tests/pages/trade-page.test.ts
    git commit -m "feat(trade): 新增貿易品搜尋頁"

---

### Task 7：建立貿易品詳情頁與 12 欄同列矩陣

**Files:**

- Create: miniprogram/presenters/trade-season-presenter.ts
- Create: miniprogram/subpkg-trade/pages/detail/index.ts
- Create: miniprogram/subpkg-trade/pages/detail/index.wxml
- Create: miniprogram/subpkg-trade/pages/detail/index.wxss
- Create: tests/presenters/trade-season-presenter.test.ts
- Create: tests/pages/trade-detail-page.test.ts
- Modify: miniprogram/app.json

**Interfaces:**

- Consumes: Task 4 的 getTradeReference、getTradeDetail，Task 5 的 gameMonthAt 與 buildTradePortMatrix。
- Produces: 詳情頁狀態、固定港口 1–12 月資料、目前月份標記、圖例、無港口空狀態與重試／錯誤狀態。

- [ ] **Step 1：先寫 Presenter 與頁面 RED 契約**

在 tests/presenters/trade-season-presenter.test.ts 驗證：

    const view = presentTradeDetail(detail, reference, 12)
    expect(view.title.name).toBe('葡萄酒')
    expect(view.currentGameMonth).toBe(12)
    expect(view.ports).toHaveLength(detail.salesPortIds.length)
    expect(view.ports.every((port) => port.months.length === 12)).toBe(true)
    expect(view.ports[0].months[11].isCurrent).toBe(true)

在 tests/pages/trade-detail-page.test.ts 先加入靜態契約：

    expect(detailWxml).toContain('各港口 1–12 月完整資料')
    expect(detailWxml).toContain('季節')
    expect(detailWxml).toContain('旺')
    expect(detailWxml).toContain('淡')
    expect(detailWxml).toContain('一般')
    expect(detailWxml).not.toContain('scroll-x')
    expect(detailWxml).not.toContain('<scroll-view')
    expect(detailWxss).toMatch(/repeat\(12/)
    expect(detailWxss).not.toMatch(/overflow-x\s*:\s*auto/)

    npm.cmd test -- tests/presenters/trade-season-presenter.test.ts tests/pages/trade-detail-page.test.ts

預期：RED，因為 presenter、詳情頁與 12 欄 WXSS 尚未存在。

- [ ] **Step 2：實作 presenter**

在 miniprogram/presenters/trade-season-presenter.ts 定義：

    export interface TradeDetailPageState {
      title: {
        name: string
        categoryName: string
        rankLabel: string
        peakLabel: string
        lowLabel: string
      }
      currentGameMonth: number
      currentMonthLabel: string
      ports: TradePortMatrixView[]
      legend: {
        season: { id: string; name: string; glyph: string }[]
        status: { key: string; name: string; glyph: string }[]
      }
      hasPorts: boolean
      emptyMessage: string | null
    }

    export const presentTradeDetail = (
      detail: RuntimeTradeGoodDetail,
      reference: RuntimeTradeReference,
      gameMonth: number,
    ): TradeDetailPageState

presentTradeDetail 只編排 domain 輸出，不呼叫 wx；旺季／淡季摘要由 detail 的 season ID 對應 reference.seasonNames，currentMonthLabel 由 gameMonth 產生。barter／special 或無銷售港口時 hasPorts 為 false、emptyMessage 為「目前沒有固定銷售港口矩陣」。

- [ ] **Step 3：實作詳情 Page Controller**

在 miniprogram/subpkg-trade/pages/detail/index.ts 中：

- onLoad 讀 options.id，沒有 ID 顯示找不到資料；
- 以 getTradeDetail 取得詳情，找不到時設定 pageError；
- 以 getTradeReference 取得港口與圖例；
- 以 gameMonthAt(Date.now()) 計算目前遊戲月份；
- 以 presentTradeDetail 生成 WXML 所需狀態；
- 成功後以 wx.setNavigationBarTitle 設為「貿易品詳情」或貿易品名稱；
- 載入失敗顯示繁體中文錯誤與最多一次 retry 按鈕；
- 不使用 wx.request、wx.cloud、遠程圖片 URL 或 Node API。

頁面狀態使用：

    interface TradeDetailPageData extends TradeDetailPageState {
      loading: boolean
      pageError: string | null
      retryAvailable: boolean
    }

- [ ] **Step 4：實作 12 欄同列 WXML**

WXML 以港口卡片為單位，港口名稱獨立放在月份列上方，使 12 個月份可以占滿整行：

    <view class="trade-detail">
      <view class="trade-detail__header">貿易品名稱、分類、淡旺季摘要</view>
      <view class="trade-detail__current">目前遊戲月份：{{currentMonthLabel}}</view>
      <view class="trade-legend">季節／天候／▲旺／▼淡／🅞一般</view>
      <view class="trade-matrix">
        <view class="trade-matrix__heading">各港口 1–12 月完整資料</view>
        <view class="trade-month-grid trade-month-grid--header">
          <view wx:for="{{monthLabels}}" wx:key="month" class="trade-month-heading">
            {{item}}
          </view>
        </view>
        <view wx:for="{{ports}}" wx:key="portId" class="trade-port-card">
          <view class="trade-port-card__header">{{item.portName}} {{item.regionName}}</view>
          <view class="trade-month-grid">
            <view wx:for="{{item.months}}" wx:key="month" class="trade-month-cell {{item.currentClass}}" aria-label="{{item.accessibleLabel}}">
              <text class="trade-month-cell__season">{{item.seasonGlyph}}</text>
              <text class="trade-month-cell__status">{{item.statusGlyph}}</text>
            </view>
          </view>
        </view>
      </view>
      <view wx:if="{{!hasPorts}}" class="trade-detail__empty">{{emptyMessage}}</view>
    </view>

月份表頭顯示 1月 至 12月；儲存格顯示季節／天候 glyph 與狀態 glyph，文字摘要、圖例與 aria-label 提供完整語義。12 月目前為遊戲月份時，表頭與每個港口的第 12 格使用 currentClass。

- [ ] **Step 5：實作 12 欄 WXSS 並做窄屏保護**

在 miniprogram/subpkg-trade/pages/detail/index.wxss 使用：

    .trade-month-grid {
      display: flex;
      width: 100%;
    }

    .trade-month-cell,
    .trade-month-heading {
      flex: 1 1 0;
      min-width: 0;
      text-align: center;
    }

    .trade-month-cell {
      padding: var(--uwo-space-1) 0;
    }

不得加入 scroll-view、overflow-x: auto、min-width: 900px 或固定寬度矩陣。320px 時縮小月份儲存格內距、圖示與輔助文字，仍維持 12 格可見；港口名稱放在獨立標題列，不佔用月份欄位。所有頁面和卡片使用 Design Foundation 的既有 Token，並預留底部安全區。

- [ ] **Step 6：執行 GREEN、註冊分包與提交**

在 miniprogram/app.json 新增：

    {
      "root": "subpkg-trade",
      "name": "trade",
      "pages": ["pages/detail/index"]
    }

執行：

    npm.cmd test -- tests/presenters/trade-season-presenter.test.ts tests/pages/trade-detail-page.test.ts tests/domain/trade-season.test.ts
    npm.cmd run typecheck
    npm.cmd run check:runtime-network
    git diff --check

確認 WXML 不含 scroll-view／scroll-x、WXSS 不含頁面級橫向滾動，12 欄狀態與 12 月目前標記都有契約測試。

    git add miniprogram/presenters/trade-season-presenter.ts miniprogram/subpkg-trade/pages/detail miniprogram/app.json tests/presenters/trade-season-presenter.test.ts tests/pages/trade-detail-page.test.ts
    git commit -m "feat(trade): 新增貿易品全年淡旺季矩陣"

---

### Task 8：資料整合、全量驗證與微信 DevTools 驗收

**Files:**

- Modify: package.json only for the exact trade import and generate:check scripts defined in earlier tasks
- Inspect: archive/voyage-tw-2026052501-trade-20260904/source-manifest.json
- Inspect: data/master/trade-goods.json
- Inspect: miniprogram/app.json
- Inspect: miniprogram/pages/home/index.ts
- Inspect: miniprogram/subpkg-trade/pages/index/index.ts
- Inspect: miniprogram/subpkg-trade/pages/detail/index.ts
- Create: tests/integration/trade-feature-contract.test.ts

**Interfaces:**

- Consumes: Task 1–7 的來源、canonical、generated、domain、首頁、搜尋頁與詳情頁。
- Produces: 可從首頁入口完成搜尋到詳情矩陣的整合驗證，以及提交前的完整品質證據。

- [ ] **Step 1：寫整合 RED 契約**

在 tests/integration/trade-feature-contract.test.ts 以檔案與 runtime contract 驗證：

    expect(appConfig.subpackages).toContainEqual(
      expect.objectContaining({
        root: 'subpkg-trade',
        pages: ['pages/index/index', 'pages/detail/index'],
      }),
    )
    expect(homeSource).toContain("id: 'trade-goods'")
    expect(homeSource).toContain("route: '/subpkg-trade/pages/index/index'")
    expect(detailWxml).not.toContain('<scroll-view')
    expect(detailWxss).not.toMatch(/overflow-x\s*:\s*auto/)

加入端到端資料契約：

    const wine = getTradeDetail('trade0615')
    expect(wine?.salesMode).toBe('fixed-port')
    const rows = buildTradePortMatrix(wine!, getTradeReference(), 12)
    expect(rows.every((row) => row.months.length === 12)).toBe(true)

    npm.cmd test -- tests/integration/trade-feature-contract.test.ts

預期：若任何首頁入口、route、生成資料或 12 欄矩陣邊界未接通，測試失敗。

- [ ] **Step 2：執行資料匯入與所有生成**

在有來源快照的前提下執行：

    npm.cmd run import:run:trade
    npm.cmd run data:check
    npm.cmd run data:generate
    npm.cmd run generate:check

確認 data/master/trade-goods.json 是唯一輸入，生成檔不含手工差異；確認 generated 與 subpkg-trade 內容可由同一 master 重建。

- [ ] **Step 3：執行聚焦回歸**

    npm.cmd test -- tests/import tests/data-contract tests/data-pipeline tests/runtime-contract tests/domain tests/pages/home-page.test.ts tests/pages/trade-page.test.ts tests/pages/trade-detail-page.test.ts tests/presenters/trade-season-presenter.test.ts tests/integration/trade-feature-contract.test.ts
    npm.cmd run typecheck
    npm.cmd run lint
    npm.cmd run check:runtime-network
    npm.cmd run check:miniprogram-size
    npm.cmd run assets:ui:check
    git diff --check

預期：貿易品新增測試、既有測試與目前所有 runtime 邊界檢查均通過。

- [ ] **Step 4：執行完整門禁**

    npm.cmd run verify

verify 必須通過 format、lint、typecheck、test、runtime-network、miniprogram-size、UI asset、CloudBase manifest、data:check 與 generate:check。若失敗，先修復本功能直接造成的錯誤；既有且與本功能無關的問題只報告，不夾帶修復。

- [ ] **Step 5：執行微信 DevTools 手動驗收**

依序檢查 320px、375px、393px、430px：

- 首頁「啟航港口」主要區域顯示航海士名鑑、貿易品、戰鬥模擬艦隊、冒險模擬艦隊四個入口同列；
- 貿易品入口圖示載入失敗時使用既有本地 fallback，不出現遠程請求；
- 點擊首頁貿易品入口進入搜尋頁；
- 搜尋葡萄酒、切換酒類、清空搜尋與無結果狀態正常；
- 點擊葡萄酒進入詳情頁，顯示分類、旺季／淡季摘要、圖例與港口數；
- 每個港口的 1–12 月全部同列顯示，表頭與各港口列對齊，不可左右滑動；
- 2026-09-04 日本時區的測試 timestamp 顯示遊戲 12 月，12 月框線在每個港口列同一欄；
- 春季、夏季、秋季、冬季、旱季、雨季等網站圖示與 ▲旺／▼淡／🅞一般語義可由圖例理解；
- 沒有固定銷售港口的特殊／交換品顯示明確空狀態；
- 缺失詳情、圖片或季節配置時顯示錯誤／待補文字，不崩潰、不虛構港口；
- 頁面沒有水平溢出，返回、重試、導航列標題與安全區正常。

- [ ] **Step 6：完成差異審核與提交**

    git status --short
    git diff --name-only main...HEAD
    git diff --check
    git diff --name-only -- archive data/master miniprogram/generated miniprogram/subpkg-detail
    rg -n 'wx\.request|wx\.cloud|https?://|scroll-x|<scroll-view|overflow-x\s*:\s*auto' miniprogram/pages/home miniprogram/subpkg-trade

確認：

- archive 只有新增本功能版本化快照，沒有改寫既有快照；
- data/master 只有已審核的 trade-goods 與首頁入口素材來源；
- miniprogram/generated 與 trade 詳情分片全部是生成結果；
- 不包含與本功能無關的航海士、技能、戰鬥或冒險頁面修改；
- 沒有新增依賴、遠程 runtime 請求或頁面級水平滾動。

提交前展示完整變更文件、所有驗證輸出、DevTools 手動驗收結果與擬用 Commit Message：

    feat(trade): 新增貿易品淡旺季查詢

等待使用者確認後才執行最後整合提交或 push。
