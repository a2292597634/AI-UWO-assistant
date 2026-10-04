# A 批：可靠驗證入口實施計畫

> **給執行代理：** 使用 `executing-plans`，逐項勾選並留下證據。本批未實施；提交前展示檔案、驗證及 message，等待使用者授權。

**目標：** 先辨識環境問題，讓生成檢查只讀且判定當前候選內容。

**架構：** 新增輕量預檢；重用現有暫存生成函式與輸出 registry，兩次構建檢查確定性，再與候選檔案比較。

**技術棧：** TypeScript、Node `>=22 <23`、npm `>=10`、Vitest；不新增依賴。

## 全域約束

遵守 [總計畫全域約束](2026-10-04-development-workflow-improvement.md#全域約束) 與 AGENTS。archive 只讀；不覆寫個人配置；不自動下載素材或變更環境。工具只使用明確的 root，禁止 `process.chdir()`。只有正常 `data:generate` 可以替換正式產物。

## A1：只讀預檢

**檔案：**

- 新增 `tools/workflow/preflight.ts`：純環境判定及只讀輸入檢查。
- 新增 `tools/workflow/cli.ts`：預檢命令、中文輸出、退出碼。
- 新增 `tests/workflow/preflight.test.ts`：版本、缺失輸入、只讀性。
- 修改 `package.json`：新增 `workflow:preflight`，在 `verify` 最前呼叫預檢，不改其他門禁順序。
- 讀取純資料 `tools/ui-assets/config.ts` 的 `UI_ASSET_RECIPES`，來源根為 `data/master/ui-assets`。
- 新增 `tools/asset-pipeline/ci-asset-inputs.ts`：移入 `CI_ASSET_FILENAMES`；原 `prepare-ci-assets.ts` 匯入並重新匯出，保持既有接口。
- 新增 `tools/ui-assets/major-events-config.ts`：移入現有重大事件素材 definition 型別、`REGION_IDS` 及 `definitions`，匯出 `MAJOR_EVENTS_ASSET_DEFINITIONS`；原 `build-major-events-assets.ts` 改為匯入，來源根仍為 `data/master/ui-assets/major-events`。只移動純資料，不改配方。
- 預檢不能匯入 sharp 或完整構建器，避免診斷尚未開始就觸發原生依賴錯誤。

**計畫接口：**

```ts
export type PreflightScope = 'repository' | 'page'
export interface PreflightItem {
  code: string
  level: 'error' | 'warning' | 'info'
  message: string
  paths: string[]
}
export interface PreflightReport {
  schemaVersion: 1
  projectRoot: string
  nodeVersion: string
  npmVersion: string
  platform: string
  ready: boolean
  items: PreflightItem[]
}
export function checkNodeVersion(version: string): PreflightItem
export function checkNpmVersion(version: string): PreflightItem
export function collectPreflight(input: {
  projectRoot: string
  scope: PreflightScope
  nodeVersion: string
  npmVersion: string
  platform: string
  env: Record<string, string | undefined>
}): PreflightReport
```

`ready` 只表示本 scope 的靜態前置條件成立，不表示 SDK 可用。CLI 支持 `preflight --scope repository|page`，預設 repository；error 返回 1，否則 0。用命名參數呼叫，不接受任意腳本。

- [ ] **1. 寫紅測試並跑指定檔案。**

```ts
it.each(['v20.19.0', 'v23.0.0', 'v24.14.1', 'invalid'])('%s 不能成為正式門禁環境', (version) => {
  expect(checkNodeVersion(version)).toMatchObject({
    code: 'NODE_UNSUPPORTED',
    level: 'error',
  })
})
it.each(['v22.14.0', 'v22.23.3'])('%s 是支援版本', (version) => {
  expect(checkNodeVersion(version).level).toBe('info')
})
```

命令：`npm test -- tests/workflow/preflight.test.ts`。預期因新接口缺失而失敗；實施紅綠測試本身使用 Node 22，Node 24 僅作注入字串。另加 npm 9／10／非法版本的判定；CLI 從 npm 命令提供的 `npm_config_user_agent` 解析版本，缺少有效版本則 `NPM_UNVERIFIED` 並指引從 npm script 執行，不啟動安裝。

- [ ] **2. 實作最小版本判定，再加入臨時目錄輸入測試。**

```ts
export function checkNodeVersion(version: string): PreflightItem {
  const match = /^v?(\d+)\.\d+\.\d+$/.exec(version)
  const supported = match?.[1] === '22'
  return {
    code: supported ? 'NODE_SUPPORTED' : 'NODE_UNSUPPORTED',
    level: supported ? 'info' : 'error',
    message: supported ? 'Node 版本符合專案要求。' : '請使用 Node >=22 <23。',
    paths: [],
  }
}
```

臨時 fixture 用 `mkdtempSync` 建立，在測試自己的目錄寫最小 package／lock／master／schema／配方素材。缺檔得到 `INPUT_MISSING`，JSON 損壞得到 `INPUT_INVALID`，兩者不能拋成未分類例外。比較呼叫前後 fixture 檔案名及 bytes；預檢不得建立檔案。Linux 僅提示 Windows CI 差異，資料邏輯預檢不因平台直接失敗。

- [ ] **3. 接入輸入與頁面配置診斷。**

repository 檢查 package／lock、既有本機工具入口、`data/master` 與 `data/schema` 必需檔案、`data/audit/skill-group-mapping.json`、來源 `archive/voyage-tw-2026052501/raw-data/json_char.js`、manifest、UI 配方來源及重大事件素材來源。來源清單從現有構建定義匯出純資料；不載入完整構建器執行生成。列出三張 CI PNG 缺失時的準備方法；本機已有素材不符合發布 bytes 時不自動替換。

page 額外讀公共與私有 `project*.config.json` 的有效基礎庫設定，使用既有 `resolveReviewConfig`／`diagnoseReviewConfig` 回報 CLI 路徑；只輸出版本及 root，不輸出 appid、權杖或私有配置全文。頁面實際探測狀態固定顯示「未執行」，由 B1 接手。env 僅讀既有 manifest／reuse 路徑；外部路徑顯式列為輸入，缺失則失敗。

- [ ] **4. 接入命令，跑綠測試及門禁。**

```json
"workflow:preflight": "tsx tools/workflow/cli.ts preflight",
"verify": "npm run workflow:preflight && npm run format:check && npm run lint && npm run typecheck && npm test && npm run check:runtime-network && npm run check:miniprogram-size && npm run assets:ui:check && npm run assets:major-events:check && npm run assets:manifest:check && npm run data:check && npm run generate:check"
```

命令：`npm test -- tests/workflow/preflight.test.ts tests/asset-pipeline/prepare-ci-assets.test.ts tests/ui-assets/build-ui-assets.test.ts tests/ui-assets/major-events-assets.test.ts`、`npm run workflow:preflight`、`npm run workflow:preflight -- --scope page`、`npm run typecheck`。確認抽出的純資料未改素材輸出，記錄預檢明確不等同於真實 DevTools readiness。

**驗收：** 缺檔、版本錯誤、私有基礎庫覆蓋均可定位；預檢不寫檔、不联网、不安裝、不呼叫 `assets:ci`。

## A2：只讀生成檢查

**檔案：**

- 修改 `tools/data-pipeline/generate.ts`：只匯出現有 `buildGeneratedOutputs(stageRoot: string): void`；正常 `generate()` 的替換及回復語義不變。
- 新增 `tools/data-pipeline/check-generated.ts`：暫存构建、輸入指紋、檔案 bytes 比較、中文分類結果及 CLI。
- 新增 `tools/data-pipeline/generation-input-paths.ts`：宣告生成實際讀取的輸入，不含產物。
- 讀取 `tools/data-pipeline/generated-output-paths.ts` 的 `DATA_GENERATION_OUTPUT_PATHS`，不維護另一份輸出列表。
- 新增 `tests/data-pipeline/check-generated.test.ts`、`tests/data-pipeline/generation-input-paths.test.ts`。
- 修改 `package.json`：`generate:check` 改為 `tsx tools/data-pipeline/check-generated.ts`。

**計畫接口：**

```ts
export type GenerationCheckCode =
  | 'GENERATED_OUTPUT_DRIFT'
  | 'GENERATION_NONDETERMINISTIC'
  | 'GENERATION_INPUT_CHANGED'
  | 'GENERATION_BUILD_FAILED'
export interface GenerationCheckResult {
  status: 'passed' | 'failed'
  findings: Array<{ code: GenerationCheckCode; paths: string[]; message: string }>
}
export function fingerprintGenerationInputs(input: {
  projectRoot: string
  env: Record<string, string | undefined>
}): string
export function checkGeneratedOutputs(input: {
  projectRoot: string
  outputPaths: readonly string[]
  buildStage: (stageRoot: string) => void
  fingerprintInputs: () => string
}): GenerationCheckResult
```

比較器不讀 Git index。CLI 綁定 `projectRoot=process.cwd()` 與現有生成函式；確認此根具有專案 package 及 master 後才構建。不承諾首版支援在其他 cwd 跨 root 執行生成，也不加入全專案根路徑重構。

- [ ] **1. 寫可執行的紅測試，證明候選不必與 Git index 相同。**

```ts
it('候選產物正確時通過，檢查不改寫候選', () => {
  const root = mkdtempSync(join(tmpdir(), 'uwo-generated-check-test-'))
  try {
    mkdirSync(join(root, 'miniprogram/generated'), { recursive: true })
    const output = join(root, 'miniprogram/generated/sample.js')
    writeFileSync(output, 'module.exports = 2\n')
    const result = checkGeneratedOutputs({
      projectRoot: root,
      outputPaths: ['miniprogram/generated'],
      fingerprintInputs: () => 'fixed-input',
      buildStage: (stage) => {
        mkdirSync(join(stage, 'miniprogram/generated'), { recursive: true })
        writeFileSync(join(stage, 'miniprogram/generated/sample.js'), 'module.exports = 2\n')
      },
    })
    expect(result).toEqual({ status: 'passed', findings: [] })
    expect(readFileSync(output, 'utf8')).toBe('module.exports = 2\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

從 `node:fs`／`node:os`／`node:path` 匯入上述函式。命令：`npm test -- tests/data-pipeline/check-generated.test.ts`；預期新接口缺失。

再增加五組 fixture：候選有額外舊檔或缺檔→漂移；兩次 build 的 bytes 不同→非確定；前後輸入指紋不同→輸入變動；第二次 build 拋錯→構建失敗；另一棵樹或符號連結越界→拒絕且不碰外部檔案。每個案例核對正式候選 bytes 未變。

- [ ] **2. 實作暫存比較，保留錯誤證據。**

```ts
// CLI 的綁定方式；比較器本身不依賴 cwd 或生成器的全域變數。
const projectRoot = resolve('.')
const result = checkGeneratedOutputs({
  projectRoot,
  outputPaths: DATA_GENERATION_OUTPUT_PATHS,
  buildStage: buildGeneratedOutputs,
  fingerprintInputs: () => fingerprintGenerationInputs({ projectRoot, env: process.env }),
})
process.exitCode = result.status === 'passed' ? 0 : 1
```

比較器依序：讀初始指紋→自行 `mkdtempSync` 兩個輸出目錄→各 build 一次→讀終止指紋→比較兩次 stage→比較 stage 與候選。任一步失敗都不寫候選。若輸入變動，不以其他成功比較消除該 finding；缺少 stage registry 項歸構建失敗。按相對檔名穩定排序，檔案比較 bytes，目錄比較完整成員集合；不比较時間戳。讀輸出時拒絕 symlink／junction 越界。finally 只刪除工具自行建立且已核對的暫存根。

- [ ] **3. 完成可核對的輸入指紋。**

指紋至少包含 `data/master/`、`data/schema/`、上述 skill mapping、manifest／可選 reuse 檔、來源 json_char、重大事件 runtime 素材目錄、`tools/data-pipeline/`、`tools/data-audit/`、生成器實際依賴的 import 型別及 asset helper、package／lock。清單按目前依賴閱讀補齊並在測試中逐項 mutation 證明 hash 改變；可選檔的「缺失→存在」也改變。env 只序列化兩個素材路徑的解析結果，不序列化其他環境變數。

禁止把 generated output、temp、報告或所有 ignored 檔一股腦當输入。輸入檔案不存在或無法讀取，保留路徑及原始原因並歸 `GENERATION_BUILD_FAILED`；不替使用者補檔。新生成依賴增加時同步更新此清單和對應測試。

前後指紋是變動防護，不能證明所有中途變更都不存在，例如檔案改動後又恢復原 bytes。正式實施與完整門禁使用固定隔離候選，避免並行寫入；本檢查不宣稱是 hermetic build。

- [ ] **4. 接入命令，驗證真实候選與失敗回復。**

命令：`npm test -- tests/data-pipeline/check-generated.test.ts tests/data-pipeline/generation-input-paths.test.ts tests/data-pipeline/generated-output-paths.test.ts tests/tools/sync-maintenance-work-orders.test.ts`。

在完整隔離副本執行 `npm run data:check`、`npm run data:generate`，保留其合法 dirty 產物，再跑新的 `npm run generate:check`，預期通过且 before／after bytes 不變。另在測試專用副本將一個產物改為錯誤 bytes，預期分類失敗且不自動修正。這是測試故障注入，不是人工維護產物。

最後 Node 22 下跑 `npm run verify`、`git diff --check`。如果涉及 CI 配置或素材準備，另在乾淨 checkout 依現有 manifest 準備輸入並驗證，不把本地完整副本當乾淨 checkout。

**驗收：** 候選一致性、確定性、輸入穩定性各有獨立失敗證據；正常 `data:generate` 的交易式回復回歸仍通過；生成檢查不依賴 staged／unstaged 狀態、不改動正式產物。

## A 批交付清單

- [ ] 紅測試、綠測試及完整門禁實際輸出。
- [ ] 預檢與生成檢查前後的受保護檔案 hash、候選 bytes／status 證據。
- [ ] 支援 Node、缺失輸入準備方式、命令副作用記錄。
- [ ] 變更範圍與擬用 message：`改進只讀預檢與生成一致性驗證`；未經授權不提交。
