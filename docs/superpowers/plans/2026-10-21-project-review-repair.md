# 全項目審查十五項缺陷修復計畫

> 後續授權（2026-10-22）：用戶已明確要求提交、合併與推送。本計畫保留修復階段的原始限制；集成改在 `codex/phase-60-review-integration`，以最新 `main` 為基底，保留後續工作流改進。原 E 工作區及 phase59 候選不覆寫，正式部署仍不在範圍。原候選本地、頁面與隔離真雲證據和集成版本驗證分開記錄。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. 不自動提交，逐任務保留紅／綠測試與複核記錄。

**Goal:** 修復2026-10-20審查R01–R15，保留所有既有工作並交付可追溯驗證及HTML報告。

**Architecture:** 以既有service、repository、controller和工具入口作最小修補；網路例外不擴大。生成檢查在臨時根構建並比較當前候選，素材先完整構建再替換，頁面表單和未確認操作使用不可變快照。現有正式schema、驗證器及生成產物清單繼續作唯一規則來源。

**Tech Stack:** TypeScript、CommonJS、Vitest、現有wx-server-sdk 4.0.2、sharp、miniprogram-automator；Node v22.23.3、npm 10.9.9。

## Global Constraints

- 只在隔離分支`codex/phase-59-review-repair`工作；工作樹已完整覆蓋原倉庫26項tracked修改與110個untracked文件，並保留ignored素材／private config，依賴使用既有junction。
- 禁止新增／刪除／升級依賴；禁止commit、merge、push、部署、真雲寫入或正式素材發布。
- 用戶補充授權（2026-10-21）：僅允許把已安裝的 esbuild 0.28.1 顯式登記為 devDependency，不下載或升級套件；此例外適用 Task 4，其他依賴仍禁止變更。
- archive只讀；手改資料只在data/master；生成產物只由工具生成。不得覆寫合法dirty產物以使檢查通過。
- 項目中文註釋／文檔；界面繁體中文。遵循AGENTS.md；UI前完整讀Design Foundation和HTML頁面驗收規範。
- 資料／邏輯先加入有意義失敗測試並觀察預期失敗，再最小實作、相關回歸、必要重構；日誌存本計畫workspace。
- 用當前工作樹和審查復現重新確認，不盲信歷史修復或記憶；不得夾帶其他缺陷。
- 證據：`C:/Users/XB/.codex/visualizations/2026/10/20/01a159ba-0a38-78d3-b2c1-3e0564f51ed4/project-review/review.json`及同目錄repro。
- 全門禁`npm run verify`；本地、DevTools、真機、真雲及遠端CI分開呈現。UI阻塞保留原始錯誤，最多兩輪恢復，不能以handler冒充真交互。

## Task 1: 雲端首次建立、到期清理與孤兒頭像（R01/R06/R07/R09）

**Files:** 修改`cloudfunctions/fleet-config/index.js`、`officer-custom/index.js`、`officer-maintenance/index.js`或各repository的缺文件讀取邊界；`cloudfunctions/message-board/core/cleanup-service.js`及必要repository查詢；`cloudfunctions/officer-custom/officer-custom-service.js`。測試位於`tests/fleet-config/`、`tests/cloudfunctions/`、`tests/message-board/`。

**Interfaces:** 保留既有公開action、DTO、錯誤碼與權限；缺文件允許初始化，但真資料庫故障必須傳出。清理分批必須前進且保持有界，失敗可重入。新頭像只清本次上傳，不清舊版本仍引用文件。

- [ ] 紅：真SDK預設或忠實替身覆蓋首次owner lock、首次投稿／重提及新工單；21+過期留言連跑；前20個活躍profile/asset後的無引用候選；滿額/CAS/寫入異常後新頭像清理，delete失敗不得掩蓋原操作或丟失回收責任。
- [ ] 綠：統一配置或只捕捉明確not-found；軟刪除排除到期隊列；回收使用可靠前進游標／候選隊列，不能每輪同20筆；失敗上傳採安全補償或持久化回收。

```js
// 若採用SDK配置，三入口須一致，其他資料庫錯誤仍應保留。
const db = cloud.database({ throwOnNotFound: false })
```

- [ ] 執行`node node_modules/vitest/vitest.mjs run tests/fleet-config tests/cloudfunctions tests/message-board`，記錄紅／綠實際輸出；重構後複跑受影響測試。
- [ ] 交任務diff與測試記錄作規格／品質複核，不提交。

## Task 2: 草稿恢復、原操作重試與表單快照（R04/R05/R08）

**Files:** `miniprogram/controllers/message-board-compose-controller.ts`、`domain/message-board/draft-store.ts`、必要compose頁面；`miniprogram/pages/officer-editor/index.ts`；對應`tests/message-board/compose-controller.test.ts`、`draft-store.test.ts`、`tests/pages/officer-editor-page.test.ts`。

**Interfaces:** 保留草稿既有格式相容性；恢復pending不可清除後寫正文。重試只能沿用原operation ID及正規化payload，在服務端24小時窗口內；過期只查詢／列表核對，不能換新ID自動重投。提交校驗和上傳／建立使用同一不可變快照。

- [ ] 紅：重建controller後確認舊成功保留新草稿；未送達回執false後可同ID重試並只接收一次；重試時表單後改不混入；過期不建立；上傳期間真事件修改正文／圖片後，送出仍是提交快照。
- [ ] 綠：持久化或比較原快照身份，清除時只清相同草稿；對未確認create增加有界安全重試和明確UI出口，profile/avatar路徑同步核對不擴功能；表單入口clone。

```ts
const draft = { ...this.data.draft, errorTypes: [...this.data.draft.errorTypes] }
const screenshotTempPaths = [...this.data.screenshotTempPaths]
// 校驗draft；上傳screenshotTempPaths；createReport使用同一draft。
```

- [ ] 執行`node node_modules/vitest/vitest.mjs run tests/message-board/compose-controller.test.ts tests/message-board/draft-store.test.ts tests/pages/officer-editor-page.test.ts`，保留紅／綠日誌。
- [ ] 更新必要真實場景，附HTML頁面報告或明確blocked；不以直接handler復現替代DevTools驗收。交diff複核。

## Task 3: 保護來源與生成／素材原子性（R02/R03/R10/R11）

**Files:** `tools/import/download-source.ts`、`tools/data-pipeline/generate.ts`、新`check-generated.ts`、`generated-output-paths.ts`、`tools/data-audit/check-master-dataset.ts`、`tools/asset-pipeline/setup-assets.ts`、`package.json`及相應測試。

**Interfaces:** `generate()`可加入顯式輸出根／依賴注入，預設正式生成保持相容。`generate:check`比較工具擁有的完整路徑集合，不讀Git index、不改候選、不下載。正式生成入口使用既有trade/major-event schema及關係校驗。下載完整成功才安裝全新快照，既有目的地拒絕。素材完整解碼、完整編碼後才替換，失敗回復集合。

- [ ] 紅：舊快照存在時不得寫入；dirty產物不被改寫但檢查失敗；缺檔／多檔及雲game-server輸出漂移；兩次生成不同／輸入中途變化失敗；未知港口阻止正式生成且候選不變；截斷PNG或後續編碼失敗時staging不變。
- [ ] 綠：共享registry列舉成員與bytes指紋，臨時根生成對比；只讀檢查分類用`GENERATED_OUTPUT_DRIFT`、`GENERATION_NONDETERMINISTIC`、`GENERATION_INPUT_CHANGED`、`GENERATION_BUILD_FAILED`，保持中文詳細說明；阻止junction/symlink逃逸。統一正式主資料前置校驗；素材整批暫存替換；下載寫全新候選，禁止覆寫archive。

```json
{ "generate:check": "tsx tools/data-pipeline/check-generated.ts" }
```

- [ ] 執行`node node_modules/vitest/vitest.mjs run tests/import tests/data-pipeline tests/data-contract tests/asset-pipeline/setup-assets.test.ts`；記錄紅／綠。整體master不做人工資料修改。
- [ ] 交diff複核，說明未改候選與輸入hash保護證據，不提交。

## Task 4: 精確網路邊界與包體預算（R12/R13）

**Files:** `tools/quality/find-runtime-network-references.ts`、`check-miniprogram-package-size.ts`、相關architecture/quality/unit測試。

**Interfaces:** 不擴既有網路白名單；使用現有TypeScript parser識別點號／括號API，CDN例外按每個允許圖片欄位值與origin/prefix，不整行免除。非JS格式保留有效掃描。包大小必須計入主包TS對應編譯JS並避免與已存在JS重複計數；明示本地估算與DevTools實包邊界，不藉升高既有門檻掩蓋問題。

- [ ] 紅：非白名單`wx["cloud"].database()`、`wx["request"]`、同一行合法圖片URL旁name URL失敗；精確允許API與圖片成功；大常量TS編譯超預算被攔，`.d.ts`不計、已有JS不重複。
- [ ] 綠：parser判斷call/property/element access；生成物件欄位URL逐值校驗；主包TS用既有compiler統計或可靠編譯輸出。不新增依賴。

```ts
// 分析既有TypeScript AST，不把wx["cloud"]當成未出現網路API。
const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
```

- [ ] 執行`node node_modules/vitest/vitest.mjs run tests/architecture/cloudbase-runtime-network.test.ts tests/unit/local-only.test.ts tests/architecture/miniprogram-package-size.test.ts tests/quality`與兩個真CLI，保留結果。
- [ ] 若可靠預算暴露當前包超限，只在既有分包邊界最小減重或報精確阻塞，不偷偷調高門檻；交diff複核。

## Task 5: 真元素驗收與final報告結果（R14/R15）

**Files:** `tools/miniprogram-review/cli.ts`、`wechatide.ts`、`adapter.ts`、`report.ts`、`report-html.ts`、必要types/runner與tests/miniprogram-review。

**Interfaces:** 分享元件場景整批選支持真實component scope的SDK；tap查真元素並原生操作，query/isVisible不得用頁面data代替；移除callMethod/onShareFleet捷徑。final品質門禁必須回寫同一run三種報告。page/repository/external分層或等價明確記錄，iterate repository=not-run，final必需門禁失敗／未跑不得總體passed。舊報告保持可讀。

- [ ] 紅：無元素但page data真不能assertExists/isVisible或tap成功；分享-only批次走SDK；final gate false/throw時HTML/JSON/MD都顯示倉庫失敗及總體非passed，CLI非0；iterate明示not-run。
- [ ] 綠：能力識別擴及config-bar/fleet-share-preview，真component scope查詢保留有界等待；final驗證後完成報告或更新同一run，原錯誤不能丟失。

```ts
// final全域結果必須包含倉庫門禁；不能只在終端return 1。
const repository = { status: passed ? 'passed' : 'failed', command: 'npm run verify' }
```

- [ ] 執行`node node_modules/vitest/vitest.mjs run tests/miniprogram-review`；按規範執行doctor、默認連線冒險頁整批；讀HTML和實際截圖，blocked如實保存。
- [ ] 交diff與規格／品質複核，不提交。

## Task 6: 全量整合與交付

**Files:** 本計畫、任務記錄、外部修復HTML報告；只對本輪差異做保護式整合。

- [ ] 校對R01–R15逐項ledger及所有task review結論，未解項不能標完成。
- [ ] 完整Node22`npm run verify`、`git diff --check`，必要候選生成後再跑只讀`generate:check`；不得把繼承dirty狀態當新增缺陷。
- [ ] 全分支獨立審查，逐一處理實際回歸。保存變更前後hash與原工作樹不變證據。
- [ ] HTML主報告分開列代碼／本地門禁、DevTools、真機／真雲／CI；只有真實截圖才作頁面證據，沒有可信baseline明示缺失。
- [ ] 交付分支／完整路徑、修改範圍、15項結果、測試及剩餘限制；沒有當輪授權不commit／merge／push／部署。
