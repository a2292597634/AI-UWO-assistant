# Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復 Review 1、4、5、6、8，並完成 Review 9、10 的可驗證盤點與安全交付，不觸碰明確排除的自訂航海士功能。

**Architecture:** 雲端配置維持嚴格公開契約；兩個艦隊頁以相同的成功／失敗控制流與原生離頁 guard 管理草稿狀態。CloudBase 只新增可重複的唯讀 preflight 證據；任何集合、索引、ACL 或依賴改動均為後續需用戶確認的獨立步驟。

**Tech Stack:** TypeScript、Vitest、微信小程序 API、CloudBase CLI、Node.js。

## Global Constraints

- 僅處理 Review 1、4、5、6、8、9、10；不得處理自訂航海士上傳、後端校驗或名冊整合。
- 保留 Phase 7 的既有未提交改動，尤其是 `cloudfunctions/fleet-config/fleet-config-service.js` 的 50 目標上限。
- 不修改 `archive/` 或 `miniprogram/generated/`；不新增、刪除、升降級依賴。
- 每項邏輯改動先寫會失敗的 Vitest，再做最小修復。
- `wx.enableAlertBeforeUnload` 不攔截手勢滑動返回；必須記錄為平台剩餘風險。
- CloudBase 只讀查詢可執行；建立集合、索引、ACL、資料回填、刪除或部署前必須再取得用戶確認。

---

### Task 1: 統一雲端配置公開回傳契約（Review 1）

**Files:**
- Modify: `cloudfunctions/fleet-config/fleet-config-service.js:296-299`
- Modify: `tests/fleet-config/fleet-config-service.test.ts:244-248,408-626`
- Modify: `tests/fleet-config/fleet-config-repository.test.ts`
- Modify: `tests/runtime/fleet-config-service.test.ts:137-157`

**Interfaces:**
- Consumes: `toClientRecord(record): object` 與 `FleetConfigService.dispatch()`。
- Produces: `loadConfig`、`createConfig`、`updateConfig`、`saveAsConfig`、`renameConfig` 回傳的資料只含 `FleetConfigRecord` 白名單欄位。

- [ ] **Step 1: 寫失敗測試**

```ts
expect(Object.keys(result.data)).not.toContain('normalizedName')
expect(Object.keys(result.data)).not.toContain('ownerUid')
expect(Object.keys(result.data)).not.toContain('_id')
```

並在 repository test 以 `repo.findByOwnerAndId()` 斷言儲存資料仍含 `normalizedName`。

- [ ] **Step 2: 驗證紅燈**

Run: `npx vitest run tests/fleet-config/fleet-config-service.test.ts tests/fleet-config/fleet-config-repository.test.ts tests/runtime/fleet-config-service.test.ts`

Expected: 服務層公開回傳測試因 `normalizedName` 出現而失敗。

- [ ] **Step 3: 最小實作**

```js
const { ownerUid: _ownerUid, _id: _recordId, normalizedName: _normalizedName, ...rest } = record
return rest
```

- [ ] **Step 4: 驗證綠燈**

Run: 同 Step 2。

### Task 2: 區分配置列表失敗與成功空列表（Review 4）

**Files:**
- Modify: `miniprogram/pages/fleet/index.ts:419-482,611-620`
- Modify: `miniprogram/pages/adventure-fleet/index.ts:429-488,969-978`
- Modify: `tests/pages/fleet-page.test.ts`
- Modify: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- Produces: `refreshConfigList(...): Promise<boolean>`，只有 `true` 代表已取得列表（包括空列表）。

- [ ] **Step 1: 寫失敗測試**

```ts
mockCallFunction.mockRejectedValueOnce(new Error('offline'))
await page.onConfigLogin()
expect(page.data.activeConfigId).toBe(previousConfigId)
expect(page.data.showConfigList).toBe(false)
```

另加成功回傳 `[]` 時確實進入新建狀態的對照案例。

- [ ] **Step 2: 驗證紅燈**

Run: `npx vitest run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts`

Expected: 列表失敗後仍進入空列表／新建流程。

- [ ] **Step 3: 最小實作**

```ts
const refreshConfigList = async (page, state): Promise<boolean> => {
  try {
    const configs = await configService.listMyConfigs()
    state.configList = [...configs]
    page.setData({ configList: state.configList })
    return true
  } catch (error) {
    console.error('載入配置列表失敗', error)
    showError('載入配置列表失敗')
    return false
  }
}
```

呼叫端在回傳 `false` 時立即 `return`。

- [ ] **Step 4: 驗證綠燈**

Run: 同 Step 2。

### Task 3: 保留冒險預設草稿（Review 5）

**Files:**
- Modify: `miniprogram/pages/adventure-fleet/index.ts:392-413,547-600`
- Modify: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- Produces: `createAdventureDraft(state)`，建立七艘自動船、預設目標，並用 `updateDirty()` 將相對空白 baseline 的草稿標為未保存。

- [ ] **Step 1: 寫失敗測試**

```ts
page.onLoad()
expect(page.data.targets.length).toBeGreaterThan(0)
expect(page.data.configStatus).toBe('unsaved')
```

再測 guest 登入保存開啟 `saveAs`、成功空列表不清空 dirty 草稿、放棄後新建仍有預設目標。

- [ ] **Step 2: 驗證紅燈**

Run: `npx vitest run tests/pages/adventure-fleet-page.test.ts`

Expected: 初始預設草稿目前被標示為 `new`。

- [ ] **Step 3: 最小實作**

```ts
const createAdventureDraft = (page, state) => {
  state.fleet = createFleetState()
  syncAllShipsMode(state, 'auto')
  clearEmptyTargets(state)
  initDefaultTargets(state)
  state.savedFleetState = null
  updateDirty(page, state)
}
```

首次載入和 `doNewConfig()` 共用此 helper。

- [ ] **Step 4: 驗證綠燈**

Run: 同 Step 2。

### Task 4: 原生返回未保存保護（Review 6）

**Files:**
- Modify: `miniprogram/pages/fleet/index.ts`
- Modify: `miniprogram/pages/adventure-fleet/index.ts`
- Modify: `tests/pages/fleet-page.test.ts`
- Modify: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- Produces: `syncNativeUnloadGuard(state)`；dirty 時僅一次 `wx.enableAlertBeforeUnload({ message })`，clean 或 `onUnload` 時僅一次 `wx.disableAlertBeforeUnload()`。

- [ ] **Step 1: 寫失敗測試**

```ts
page.onOfficerSelect(...)
expect(wxStub.enableAlertBeforeUnload).toHaveBeenCalledTimes(1)
page.onUnsavedGuardDiscard()
expect(wxStub.disableAlertBeforeUnload).toHaveBeenCalledTimes(1)
```

另測 UI-only 操作不啟用、保存／載入會停用、卸載會清理。

- [ ] **Step 2: 驗證紅燈**

Run: `npx vitest run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts`

Expected: mock `enableAlertBeforeUnload` 未被呼叫。

- [ ] **Step 3: 最小實作**

```ts
if (state.isDirty && !state.nativeUnloadGuardEnabled) wx.enableAlertBeforeUnload({ message })
if (!state.isDirty && state.nativeUnloadGuardEnabled) wx.disableAlertBeforeUnload()
```

在 dirty 轉換、`markClean()`、放棄與 `onUnload()` 呼叫同步 helper。

- [ ] **Step 4: 驗證綠燈**

Run: 同 Step 2。

### Task 5: 對齊篩選後 picker 索引（Review 8）

**Files:**
- Modify: `miniprogram/pages/officer-editor/index.ts:228-253`
- Modify: `miniprogram/presenters/officer-editor-presenter.ts:215-267`
- Modify: `miniprogram/pages/officer-editor/index.wxml:61-75`
- Modify: `tests/pages/officer-editor-page.test.ts`
- Create: `tests/presenters/officer-editor-presenter.test.ts`

**Interfaces:**
- Produces: picker index 永遠對應 `filteredJobOptions`／`filteredNationalityOptions`；當已選項不在結果中，以獨立名稱欄位顯示。

- [ ] **Step 1: 寫失敗測試**

```ts
expect(view.filteredJobOptions[view.jobIndex]?.id).toBe(form.jobId)
expect(view.filteredNationalityOptions[view.nationalityIndex]?.id).toBe(form.nationalityId)
```

頁面 harness 測試搜尋後選 index `0` 寫入篩選結果的 ID。

- [ ] **Step 2: 驗證紅燈**

Run: `npx vitest run tests/pages/officer-editor-page.test.ts tests/presenters/officer-editor-presenter.test.ts`

Expected: 篩選結果第 0 項被當成完整列表第 0 項，或顯示索引錯位。

- [ ] **Step 3: 最小實作**

```ts
const filtered = filterJobOptions(options.jobOptions, this.data.jobSearchText)
state.form.jobId = filtered[index]?.id ?? state.form.jobId
```

Presenter 以相同 filtered 集合求 index；WXML 顯示獨立的 `jobName`／`nationalityName`。

- [ ] **Step 4: 驗證綠燈**

Run: 同 Step 2。

### Task 6: CloudBase preflight 與依賴風險交付（Review 9、10）

**Files:**
- Modify: `docs/architecture/fleet-configuration-cloudbase.md`
- Create: `tools/cloudbase/preflight-fleet-config.ts`
- Create: `tests/tools/preflight-fleet-config.test.ts`

**Interfaces:**
- Produces: 只讀 JSON 摘要：集合存在、索引、ACL、空白舊資料數、函數 runtime／部署時間；不得輸出 owner UID、配置名稱或文件內容。

- [ ] **Step 1: 寫失敗測試**

```ts
expect(summarizePreflight(raw)).toEqual({
  fleetConfigIndexes: ['_id_'],
  invalidDocumentCount: 6,
})
```

- [ ] **Step 2: 驗證紅燈**

Run: `npx vitest run tests/tools/preflight-fleet-config.test.ts`

Expected: `summarizePreflight` 尚未存在。

- [ ] **Step 3: 最小實作與文件**

```ts
export const summarizePreflight = (raw: PreflightRaw): PreflightSummary => ({
  fleetConfigIndexes: raw.fleetConfigIndexes.map((index) => index.name).sort(),
  lockCollectionExists: raw.collectionNames.includes('fleet_config_owner_locks'),
  invalidDocumentCount: raw.fleetConfigDocuments.filter((document) => !document.ownerUid || !document.name).length,
  fleetConfigAcl: raw.fleetConfigAcl,
  deployedFunctions: raw.deployedFunctions.map(({ name, runtime, modifyTime }) => ({ name, runtime, modifyTime })),
})
```

文件列出目前已觀測的缺口、備份、衝突處理、建立索引與 ACL 的人工確認門檻；不執行上述外部寫入。

- [ ] **Step 4: 驗證綠燈與依賴紀錄**

Run: `npx vitest run tests/tools/preflight-fleet-config.test.ts && npm audit --omit=dev`

Expected: preflight test 通過；兩個函數 audit 的既有 6 項漏洞記為未解風險，未改動 lockfile 或 package.json。
