# 配隊配置保存與雲端管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在微信小程序配隊頁加入每位使用者私有的多套配置保存、載入、覆蓋、另存、重命名與刪除能力，使用 CloudBase 雲函數隔離使用者資料並支援跨設備恢復。

**Architecture:** 配隊頁只依賴 `miniprogram/runtime/fleet-config-service.ts`，由該適配層透過受控的 `wx.cloud.callFunction` 呼叫名為 `fleet-config` 的 CloudBase 雲函數。雲函數從 `wx-server-sdk` 上下文取得 `OPENID`，在服務端執行所有權、Schema、名稱唯一、20 套上限和版本衝突檢查，再讀寫 `fleet_configs` 集合。配隊頁保存的只有 `FleetState` 業務資料，不保存搜尋和畫面暫態。

**Tech Stack:** 微信小程序 TypeScript、CloudBase 原生小程序 SDK、Node.js CloudBase 雲函數、Vitest、現有 ESLint/Prettier/TypeScript 品質門禁。

## Global Constraints

- 所有小程序介面文字和業務資料使用繁體中文。
- `archive/` 不可修改；`data/master/` 是唯一可手動維護的正式資料源；不要手動修改 `miniprogram/generated/`。
- 小程序運行時仍禁止任意 `wx.request`、遠端 URL、Node.js API；只在指定適配層允許 `wx.cloud.init`／`wx.cloud.callFunction`。
- 不呼叫 `getUserProfile`、`getUserInfo`、手機號授權或其他個人資料授權接口。
- 使用者可以未登入配隊；登入只在首次保存時由使用者主動觸發。
- 每位使用者最多 20 套配置；同一使用者的名稱去除前後空白後不得重複。
- 配置名稱去除前後空白後必須為 1–30 個 Unicode 字元。
- 配置只保存 7 艘船、航海士、模式、鎖定／移除／排除、目標技能與等級、`needsReview` 等 `FleetState` 業務狀態。
- 未保存修改在離開、切換、另存為、重命名和刪除前必須提示保存、放棄或取消。
- 保存採用版本號樂觀鎖；衝突時不得靜默覆蓋，必須讓使用者選擇重新載入或強制覆蓋。
- 不做配置分享、公開查看、多人共同編輯、即時同步、歷史版本列表或離線自動同步。
- 不新增、刪除或升級依賴，除非使用者在實作前明確確認 CloudBase 雲函數所需的 `wx-server-sdk` 依賴和 `cloudfunctionRoot` 配置。
- 必須遵循 TDD：資料契約、序列化、校驗、服務端資料操作和確定性保存邏輯先寫失敗測試。
- 禁止直接在 `master` 分支開發；使用 `codex/phase-N-描述` 分支。

## 文件與模組邊界

| 路徑 | 責任 |
| --- | --- |
| `miniprogram/contracts/fleet-config.ts` | 小程序側配置摘要、記錄、請求、回應和錯誤型別 |
| `miniprogram/runtime/cloudbase-config.ts` | 非秘密 CloudBase environment ID 和函數名稱設定 |
| `miniprogram/runtime/fleet-config-service.ts` | 唯一允許接觸 `wx.cloud` 的小程序適配層；把雲函數錯誤轉為型別化結果 |
| `cloudfunctions/fleet-config/index.js` | CloudBase 函數入口，取得 `OPENID`、分派 action、統一錯誤回應 |
| `cloudfunctions/fleet-config/fleet-config-service.js` | 純業務服務：名稱、上限、所有權、版本和資料轉換；以 repository 介面隔離資料庫 |
| `cloudfunctions/fleet-config/fleet-config-repository.js` | CloudBase 資料庫讀寫、條件更新、刪除和時間戳 |
| `cloudfunctions/fleet-config/package.json` | CloudBase 函數的最小執行依賴；建立前先取得依賴新增確認 |
| `tests/fleet-config/fleet-config-contract.test.ts` | FleetState 序列化、Schema 和不保存 UI 暫態的測試 |
| `tests/fleet-config/fleet-config-service.test.ts` | 雲函數服務的所有權、名稱、上限和版本衝突單元測試 |
| `tests/runtime/fleet-config-service.test.ts` | 小程序適配層 action 映射、錯誤映射和重試語意測試 |
| `tests/pages/fleet-page.test.ts` | 配隊頁登入、草稿保存、管理選單和未保存提示測試 |
| `tools/quality/find-runtime-network-references.ts` | 支援受控 CloudBase 呼叫白名單，其餘網路引用仍拒絕 |
| `tests/unit/local-only.test.ts` | 網路掃描器的允許／拒絕 fixture 測試 |
| `tests/architecture/runtime-dependencies.test.ts` | 全域運行時邊界、適配層位置和頁面不得直連檢查 |
| `miniprogram/app.ts` | 小程序啟動時初始化 CloudBase，不執行個人資料授權或保存操作 |
| `project.config.json` | 設定 `cloudfunctionRoot` 為 `cloudfunctions/` |
| `miniprogram/pages/fleet/index.ts` | 配隊頁狀態、髒狀態、配置流程和錯誤提示 |
| `miniprogram/pages/fleet/index.wxml` | 精簡配置管理區、配置列表、命名和衝突操作層 |
| `miniprogram/pages/fleet/index.wxss` | 配置管理區與彈層樣式，不改動無關配隊視覺 |

---

### Task 0: CloudBase 運行環境與依賴前置確認

**Files:**
- Modify: `project.config.json`
- Create: `cloudfunctions/fleet-config/package.json`
- Create: `miniprogram/runtime/cloudbase-config.ts`
- Test: `tests/architecture/runtime-dependencies.test.ts`

**Interfaces:**
- Produces `CLOUDBASE_ENV_ID`, `FLEET_CONFIG_FUNCTION_NAME = 'fleet-config'` and a project function root.
- The function package must expose an `index.main` entry and use the CloudBase-provided `wx-server-sdk` path documented for ordinary Node.js cloud functions.

- [ ] **Step 1: Confirm the environment and dependency gate before code changes.**

Read the existing CloudBase asset manifest and verify the deployed environment ID in the CloudBase console or DevTools. Do not derive an environment ID from a CDN URL at runtime. Record the confirmed non-secret ID in `miniprogram/runtime/cloudbase-config.ts`; keep secrets out of the repository. Ask for explicit authorization before creating `cloudfunctions/fleet-config/package.json` with `wx-server-sdk`.

- [ ] **Step 2: Write the project configuration test first.**

Add a test that reads `project.config.json` and asserts:

```ts
expect(project.cloudfunctionRoot).toBe('cloudfunctions/')
expect(project.miniprogramRoot).toBe('miniprogram/')
```

Run `npm.cmd test -- tests/architecture/runtime-dependencies.test.ts` and confirm it fails before `cloudfunctionRoot` is present.

- [ ] **Step 3: Add the minimum project and environment configuration.**

Add `cloudfunctionRoot: "cloudfunctions/"` and create a configuration module with the confirmed non-secret environment ID:

```ts
export const CLOUDBASE_ENV_ID = 'cloud1-d7gxfuxfe813b4eaa'
export const FLEET_CONFIG_FUNCTION_NAME = 'fleet-config'
```

The environment ID matches the existing CloudBase asset manifest and is not a secret; do not commit any AppSecret, token or database credential.

- [ ] **Step 4: Run the focused configuration test.**

Run `npm.cmd test -- tests/architecture/runtime-dependencies.test.ts` and expect PASS for the project root settings. Do not deploy the function from this task.

---

### Task 1: Fleet 配置契約、序列化與純校驗

**Files:**
- Create: `miniprogram/contracts/fleet-config.ts`
- Create: `tests/fleet-config/fleet-config-contract.test.ts`
- Modify: `tsconfig.json` only if a shared type import is required by the chosen function build; preserve the current `miniprogram/**/*.ts` and `tests/**/*.ts` boundaries.

**Interfaces:**
- Produces `FleetConfigSummary`, `FleetConfigRecord`, `FleetConfigAction`, `FleetConfigErrorCode`, `serializeFleetState`, `parseFleetState` and `isValidFleetState`.
- `FleetConfigRecord` contains `configId`, `name`, `fleetState`, `schemaVersion`, `version`, `createdAt`, `updatedAt` and `lastUsedAt`; `ownerUid` is server-owned and must not be accepted from page commands.
- `FleetConfigSummary` contains `configId`, `name`, `version`, `updatedAt` and `lastUsedAt`.
- `FleetConfigErrorCode` is the exact union `'unauthenticated' | 'not-found' | 'forbidden' | 'name-required' | 'duplicate-name' | 'limit-reached' | 'invalid-state' | 'conflict' | 'network' | 'unknown-action'`.

- [ ] **Step 1: Write failing contract tests.**

Cover these exact cases:

```ts
it('round-trips only the FleetState business fields', () => {
  const state = createFleetState()
  const encoded = serializeFleetState(state)
  expect(parseFleetState(encoded)).toEqual(state)
  expect(encoded).not.toHaveProperty('currentShipId')
  expect(encoded).not.toHaveProperty('manualFilters')
})

it('rejects invalid target levels and duplicate officers', () => {
  expect(isValidFleetState(invalidTargetLevelState)).toBe(false)
  expect(isValidFleetState(duplicateOfficerState)).toBe(false)
})

it('accepts empty seven-ship state and preserves null auto targets', () => {
  expect(isValidFleetState(createFleetState())).toBe(true)
})
```

Run `npm.cmd test -- tests/fleet-config/fleet-config-contract.test.ts`; it must fail because the contract module does not exist.

- [ ] **Step 2: Implement the smallest stable contract.**

Use the existing `FleetState` from `miniprogram/contracts/battle-fleet.ts`. Validate exactly seven ship IDs, no more than eleven officers per ship, unique officers across all ships, target levels 1–10, no duplicate non-null target skills per ship, and consistent locked/removed references. Permit an empty configuration and auto-mode targets whose `skillId` is `null`.

Use `schemaVersion: 1` for the first serialized format. Reject unknown top-level fields in the serialized payload so UI state cannot accidentally reach the backend.

- [ ] **Step 3: Add name and record helpers.**

Implement deterministic helpers:

```ts
export const normalizeConfigName = (value: string): string => value.trim()
export const isConfigNameAvailable = (
  existing: readonly FleetConfigSummary[],
  name: string,
  ignoredConfigId?: string,
): boolean => boolean
```

Reject an empty name, a duplicate normalized name for the same owner, and names longer than 30 Unicode characters. Keep the limit in one constant used by both tests and page copy.

- [ ] **Step 4: Run contract tests and typecheck.**

Run:

```powershell
npm.cmd test -- tests/fleet-config/fleet-config-contract.test.ts
npm.cmd run typecheck
```

Expected: PASS with no changes to `data/master/` or generated output.

---

### Task 2: CloudBase 雲函數服務與資料庫 repository

**Files:**
- Create: `cloudfunctions/fleet-config/index.js`
- Create: `cloudfunctions/fleet-config/fleet-config-service.js`
- Create: `cloudfunctions/fleet-config/fleet-config-repository.js`
- Create: `cloudfunctions/fleet-config/package.json`
- Create: `tests/fleet-config/fleet-config-service.test.ts`

**Interfaces:**
- Consumes: `event.action`, action-specific payloads, and server-side `OPENID`.
- Produces stable result envelopes:

```ts
type FleetConfigFunctionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: FleetConfigErrorCode; message: string }
```

- Supported actions: `authenticate`, `listMyConfigs`, `loadConfig`, `createConfig`, `updateConfig`, `saveAsConfig`, `renameConfig`, `deleteConfig`, `setLastUsedConfig`.

- [ ] **Step 1: Write failing service tests with an in-memory repository.**

Use a repository double with methods named exactly:

```js
listByOwner(ownerUid)
findByOwnerAndId(ownerUid, configId)
countByOwner(ownerUid)
insert(record)
updateIfVersion(ownerUid, configId, expectedVersion, patch)
deleteByOwnerAndId(ownerUid, configId)
touchLastUsed(ownerUid, configId, updatedAt)
```

Test owner isolation, duplicate names, the 20-record limit, empty-name rejection, update version conflicts, rename conflicts, delete ownership, and preservation of `fleetState` on a failed save. Run `npm.cmd test -- tests/fleet-config/fleet-config-service.test.ts`; it must fail before the service exists.

- [ ] **Step 2: Implement the pure service rules.**

The service must receive `ownerUid` as an argument created by the function entry, never from `event`. It must normalize names, validate `fleetState`, enforce the per-owner limit, write server timestamps, increment `version` only after a successful update, and return `conflict` without changing data when `expectedVersion` is stale.

`forceUpdate` is a separate explicit command: it still checks ownership and valid data, uses the latest server version as the compare/write base, writes the local page state without automatic field merging, and increments the version.

- [ ] **Step 3: Implement the CloudBase repository and thin function entry.**

Use the CloudBase Node.js function runtime and `wx-server-sdk`. The entry must call `cloud.init()`, read `cloud.getWXContext().OPENID`, reject missing identity for all private actions, and dispatch only the allowlisted actions. Database queries must include the server-derived owner condition. The collection name is `fleet_configs`.

The repository must use server timestamps and conditional version updates. It must never accept an `ownerUid` or `openid` from the client payload. `authenticate` returns only `{ authenticated: true }`; it does not return personal profile data.

- [ ] **Step 4: Run service tests and lint the function source.**

Run:

```powershell
npm.cmd test -- tests/fleet-config/fleet-config-service.test.ts
npx eslint cloudfunctions/fleet-config --max-warnings 0
```

Expected: PASS. If CloudBase function dependency installation is not yet authorized, stop before adding `wx-server-sdk` and report the exact dependency gate instead of substituting a client-side database implementation.

---

### Task 3: 小程序 CloudBase 適配層與登入服務

**Files:**
- Create: `miniprogram/runtime/fleet-config-service.ts`
- Create: `tests/runtime/fleet-config-service.test.ts`
- Modify: `miniprogram/app.ts`
- Modify: `tools/quality/find-runtime-network-references.ts`
- Modify: `tests/unit/local-only.test.ts`
- Modify: `tests/architecture/runtime-dependencies.test.ts`

**Interfaces:**
- Produces a page-facing service:

```ts
export interface UpdateConfigInput {
  configId: string
  expectedVersion: number
  fleetState: FleetState
  force: boolean
}

export interface FleetConfigService {
  authenticate(): Promise<void>
  listMyConfigs(): Promise<readonly FleetConfigSummary[]>
  loadConfig(configId: string): Promise<FleetConfigRecord>
  createConfig(name: string, fleetState: FleetState): Promise<FleetConfigRecord>
  updateConfig(input: UpdateConfigInput): Promise<FleetConfigRecord>
  saveAsConfig(name: string, fleetState: FleetState): Promise<FleetConfigRecord>
  renameConfig(configId: string, version: number, name: string): Promise<FleetConfigRecord>
  deleteConfig(configId: string): Promise<void>
  setLastUsedConfig(configId: string): Promise<void>
}
```

- [ ] **Step 1: Write adapter and network-boundary tests first.**

Mock `wx.cloud.callFunction` and assert each public method sends the expected function name and action, never sends owner identity, and maps `{ ok: false, code: 'conflict' }` to a typed error. Add fixtures proving `wx.cloud.callFunction` is allowed only in `miniprogram/runtime/fleet-config-service.ts` and `wx.cloud.init` only in `miniprogram/app.ts`; the same strings in a page or presenter must remain rejected.

- [ ] **Step 2: Implement CloudBase initialization and the adapter.**

Call `wx.cloud.init({ env: CLOUDBASE_ENV_ID })` once in `app.ts` startup. Do not call any profile authorization API. Keep all `wx.cloud.callFunction` references in the adapter; pages receive only the typed service.

- [ ] **Step 3: Update the network scanner with an explicit allowlist.**

Extend `findRuntimeNetworkReferences` with an option such as:

```ts
allowedCloudFunctionFiles?: readonly string[]
allowedCloudInitFiles?: readonly string[]
```

The default remains fully local and rejects `wx.cloud`. The production runtime check supplies only the two exact relative files. `wx.request`, `wx.downloadFile`, arbitrary URLs and Node built-ins remain forbidden everywhere in `miniprogram/`.

- [ ] **Step 4: Run focused adapter and architecture tests.**

Run:

```powershell
npm.cmd test -- tests/runtime/fleet-config-service.test.ts tests/unit/local-only.test.ts tests/architecture/runtime-dependencies.test.ts
npm.cmd run check:runtime-network
```

Expected: only the two approved CloudBase runtime files are accepted; direct page imports and calls fail the fixture tests.

---

### Task 4: 配隊頁狀態、登入、配置生命週期

**Files:**
- Modify: `miniprogram/pages/fleet/index.ts`
- Modify: `tests/pages/fleet-page.test.ts`

**Interfaces:**
- Page state adds `authStatus`, `configStatus`, `configName`, `configVersion`, `configList`, `activeConfigId`, `isDirty`, and a pending configuration action.
- The existing `FleetState` remains the only in-memory business state; configuration metadata stays separate from it.

- [ ] **Step 1: Extend page test doubles and write failing lifecycle tests.**

Inject a fake `FleetConfigService` into the page test setup. Add tests for:

```ts
it('starts as an editable guest page without loading cloud data', () => { /* assert no service call */ })
it('authenticates on save and preserves a guest draft for save-as', async () => { /* assert name flow */ })
it('loads the latest last-used config after successful login', async () => { /* assert fleet and metadata */ })
it('marks domain changes dirty and clears dirty only after successful save', () => { /* assert state */ })
```

Run `npm.cmd test -- tests/pages/fleet-page.test.ts`; the new tests must fail before page state and handlers exist.

- [ ] **Step 2: Add centralized dirty-state tracking.**

Store a cloned `savedFleetState` baseline and compare deterministic serialized `FleetState` values after every existing domain mutation. Refactor the current mutation path around `applyResult` so officer, target, mode, lock, ban and recalculation actions all mark the page dirty in one place. Do not mark UI filter or selected-ship changes dirty.

- [ ] **Step 3: Implement guest login and post-login behavior.**

On page load, initialize a blank state with `authStatus: 'guest'` and make no CloudBase call. On the explicit login/save action, call `authenticate()`; if the guest draft is dirty, preserve it and open the required-name save-as flow. If it is clean, call `listMyConfigs()`, choose the newest `lastUsedAt` record, load it, and set the baseline clean.

- [ ] **Step 4: Implement save, overwrite, save-as and list loading.**

Use the active record ID and version for overwrite. For a new draft, require a normalized name and call `createConfig` or `saveAsConfig`. Only update `savedFleetState`, `configVersion`, `configName`, and `isDirty` after the service resolves successfully. On failure, preserve the current fleet and keep `isDirty: true`.

- [ ] **Step 5: Implement navigation and action guards.**

Before load, new, save-as, rename, delete and page exit, route through a single pending-action helper. It must present save, discard and cancel choices; save resolves the pending action only after a successful network write. A failed save leaves the pending action and draft intact.

- [ ] **Step 6: Implement conflict handling.**

When update returns `conflict`, retain local state and show reload or force-overwrite choices. Reload replaces the fleet and baseline only after explicit confirmation. Force overwrite asks for a second confirmation and sends the latest server version token with the current local state. Do not merge individual ships automatically.

- [ ] **Step 7: Run page tests and existing fleet tests.**

Run:

```powershell
npm.cmd test -- tests/pages/fleet-page.test.ts tests/domain/battle-fleet.test.ts tests/domain/battle-fleet-solver.test.ts
npm.cmd run typecheck
```

Expected: existing battle-fleet behavior remains unchanged, and all new lifecycle tests pass.

---

### Task 5: 精簡配置管理區 UI

**Files:**
- Modify: `miniprogram/pages/fleet/index.wxml`
- Modify: `miniprogram/pages/fleet/index.wxss`
- Modify: `tests/pages/fleet-page.test.ts`

**Interfaces:**
- Consumes page data from Task 4: auth state, current name, dirty state, config summaries and pending modal state.
- Produces event handlers with names `onConfigLogin`, `onConfigMenuTap`, `onConfigSelect`, `onConfigNew`, `onConfigSave`, `onConfigSaveAs`, `onConfigRename`, `onConfigDelete`, `onConfigNameInput`, `onConfigModalConfirm`, `onConfigModalCancel`.

- [ ] **Step 1: Write structural UI tests before markup.**

Extend the existing WXML/WXSS assertions to require one compact configuration bar, a single management menu entry, visible `登入後保存` guest copy, `尚未保存` dirty copy, and no large separate row of eight action buttons. Assert that naming and delete confirmation controls are present only when their modal state is active.

- [ ] **Step 2: Add compact WXML markup.**

Place one configuration bar near the page header. It should show the active name or `未命名配置`, a small saved-status label, and one menu trigger. The menu contains the confirmed actions. Use a page-local modal with a single input for new name or rename; do not use `wx.showModal` for text input because it cannot collect the required configuration name.

- [ ] **Step 3: Add Traditional Chinese copy and focused WXSS.**

Use concise labels: `登入後保存`, `已保存`, `尚未保存`, `新建配置`, `覆蓋保存`, `另存為`, `重命名`, `刪除配置`, `保存並繼續`, `放棄修改`, `取消`. Scope styles under configuration classes and do not reformat unrelated fleet styles.

- [ ] **Step 4: Wire events and test the compact interactions.**

Connect menu actions to Task 4 guards, close the menu after a successful action, keep it open on failure, disable destructive actions while a request is pending, and show the 20-config limit error without changing the current draft. Run `npm.cmd test -- tests/pages/fleet-page.test.ts`.

---

### Task 6: CloudBase 資料庫部署設定與運行文件

**Files:**
- Create: `docs/architecture/fleet-configuration-cloudbase.md`
- Modify: `README.md` only for a short local setup link if needed
- Modify: `package.json` only for deterministic function validation/build commands approved with the dependency gate

**Interfaces:**
- Produces a deployable `fleet-config` function, a `fleet_configs` collection setup checklist, and a reproducible local verification command.

- [ ] **Step 1: Document the CloudBase console setup.**

Document the confirmed environment ID source, `cloudfunctionRoot`, function name, Node.js runtime, `wx-server-sdk` installation, `fleet_configs` collection, owner-scoped indexes, and the requirement to deploy the function before testing the page. State that no client collection access rules are used because the page calls the function service layer.

- [ ] **Step 2: Add a deterministic function source check.**

Add a script or Vitest test that verifies the function entry exports `main`, the action allowlist is exact, no profile API names are present, and the package lock is unchanged unless the dependency approval was granted.

- [ ] **Step 3: Validate in微信開發者工具 with two identities.**

Use two test WeChat accounts to verify: account A cannot see B's list; A can create 20 records but the 21st fails; duplicate names are rejected per owner; the same name is allowed for B; overwrite and rename preserve ownership; delete removes only the selected record; a stale version produces a conflict.

- [ ] **Step 4: Keep deployment details separate from static data generation.**

Do not modify `archive/`, `data/master/`, generated runtime files, asset manifests or CDN publishing code for this feature.

---

### Task 7: 完整驗證與交付

**Files:**
- Modify only files already listed above; no unrelated formatting or cleanup.

**Interfaces:**
- Produces a verified feature branch with the design document, implementation commits, and a clean working tree.

- [ ] **Step 1: Run focused verification after each implementation task.**

Use the task-specific Vitest commands first. Keep failures attributable to the current task; do not skip a red test or loosen the network scanner to make a test pass.

- [ ] **Step 2: Run project gates.**

Run:

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run check:runtime-network
npm.cmd run check:architecture
npm.cmd run check:runtime-contract
npm.cmd run data:check
npm.cmd run generate:check
npm.cmd run verify
```

If `verify` exposes an existing unrelated failure, report it separately and do not modify unrelated files.

- [ ] **Step 3: Perform manual DevTools acceptance.**

Verify the exact user journey: guest edits, login from save, save-as naming, automatic last-used load, overwrite, rename, delete confirmation, unsaved guard, network failure status, stale-version conflict, force overwrite, cross-device list recovery, and compact configuration management UI.

- [ ] **Step 4: Before each commit, show the user the changed files, verification output and proposed commit message.**

Wait for confirmation before staging or committing. Keep commits focused, for example:

```text
feat: add CloudBase fleet configuration persistence
```

Do not push or create a pull request unless separately requested.

## Spec Coverage Self-Review

- Per-user ownership and no profile authorization: Tasks 2–4.
- Multiple named configurations and 20-record limit: Tasks 1–2 and 4–5.
- Guest editing and explicit login on save: Task 4.
- Last-used automatic load: Tasks 2 and 4.
- Overwrite, save-as, rename and delete: Tasks 2, 4 and 5.
- Unsaved guard: Task 4.
- Cross-device conflict detection: Tasks 2, 4 and 6.
- CloudBase runtime boundary: Tasks 0, 3 and 7.
- Error handling and data compatibility: Tasks 1, 2 and 4.
- Compact Traditional Chinese UI: Task 5.
- No sharing or collaboration: Global Constraints and Task 6.
