# 配置管理與全局按鈕對齊重設計實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將戰鬥／冒險配置隔離為兩個各 10 套的命名空間，重構為單一低干擾折疊配置模組，並讓全小程序所有按鈕內容上下左右置中。

**Architecture:** 保留現有 `fleet-config` CloudBase 適配層與雲函數，在配置記錄上增加 `scope`（`battle`、`adventure`、`unclassified`），由服務端與客戶端雙重限制讀寫範圍。兩個配隊頁共用重構後的配置管理元件與 presenter，頁面固定傳入自己的 scope；配置列表、分類與操作集中在單一折疊模組。Design Foundation 提供全局 button flex 置中基礎規則，專用樣式只調整尺寸與排列，不移除置中契約。

**Tech Stack:** TypeScript、微信小程序 WXML/WXSS、CloudBase Cloud Function（Node.js CommonJS）、Vitest、ESLint、Prettier。

## Global Constraints

- 涉及 UI、WXML 或 WXSS 的實作前，完整閱讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
- 所有代碼註釋、文檔與用戶交互使用中文；保留必要英文專有名詞、檔名、變數名與 API 名稱。
- 禁止直接在 `main` 分支開發；目前使用 `codex/phase-9-config-management-redesign`。
- `archive/` 只讀；`data/master/` 是唯一手動資料來源；`miniprogram/generated/` 禁止手動修改。
- 不新增、刪除或升級依賴；不在 `miniprogram/` 增加 `wx.request`、任意 `wx.cloud`、遠程 URL 或 Node.js Runtime API。
- CloudBase 呼叫仍只存在於 `miniprogram/runtime/fleet-config-service.ts`；頁面不直接接觸 CloudBase。
- 資料解析、轉換、校驗、篩選、索引／分片或確定性邏輯遵循紅–綠–重構；UI 以靜態契約與微信 DevTools 驗收。
- 產品實作 commit 前，先展示變更文件、驗證結果、DevTools 結果與擬用 commit message，等待使用者確認。

---

## 文件與變更地圖

| 文件 | 責任 |
| --- | --- |
| `miniprogram/contracts/fleet-config.ts` | `ConfigScope`、10 套上限、配置摘要／記錄欄位與序列化邊界 |
| `cloudfunctions/fleet-config/fleet-config-repository.js` | scope 過濾、同 scope 名稱／數量交易、分類交易 |
| `cloudfunctions/fleet-config/fleet-config-service.js` | Cloud Function action、scope 驗證、舊記錄缺省、錯誤碼與 client mapping |
| `miniprogram/runtime/fleet-config-service.ts` | 帶 scope 的小程序服務介面與回應 contract 驗證 |
| `miniprogram/presenters/config-management-presenter.ts` | 配置列表狀態、折疊摘要、操作可見性與純函數決策 |
| `miniprogram/components/config-bar/index.{ts,wxml,wxss}` | 單一配置管理折疊模組，所有日常操作與待分類入口 |
| `miniprogram/pages/fleet/index.{ts,wxml,wxss}` | 固定 `battle` scope、載入後收起、頁面配置狀態接線 |
| `miniprogram/pages/adventure-fleet/index.{ts,wxml,wxss}` | 固定 `adventure` scope、載入後收起、頁面配置狀態接線 |
| `miniprogram/styles/design-foundation.wxss` | 全局原生 button 置中契約、緊湊次要按鈕 opt-in |
| `tests/fleet-config/*.test.ts` | 雲函數 contract、scope 隔離、10 套上限與分類交易 |
| `tests/runtime/fleet-config-service.test.ts` | 適配層 payload 與回應驗證 |
| `tests/presenters/config-management-presenter.test.ts` | 折疊／列表／載入後收起純邏輯 |
| `tests/pages/fleet-page.test.ts` | 戰鬥頁 lifecycle、scope、載入後收起 |
| `tests/pages/adventure-fleet-page.test.ts` | 冒險頁 lifecycle、scope、載入後收起 |
| `tests/architecture/fleet-shared-components.test.ts` | 共享元件結構、事件、單一模組契約 |
| `tests/architecture/design-foundation.test.ts` | 全局 button 置中與 compact 變體契約 |
| `docs/architecture/fleet-configuration-cloudbase.md` | collection、索引、scope 遷移與部署說明 |

---

### Task 1: 建立配置 scope contract 與客戶端常數

**Files:**
- Modify: `miniprogram/contracts/fleet-config.ts`
- Test: `tests/fleet-config/fleet-config-contract.test.ts`
- Test: `tests/presenters/config-management-presenter.test.ts`

**Interfaces:**
- Produces `ConfigScope = 'battle' | 'adventure' | 'unclassified'`。
- Produces `CLASSIFIED_CONFIG_SCOPES = ['battle', 'adventure'] as const`。
- Produces `MAX_CONFIGS_PER_SCOPE = 10`。
- Adds `scope: ConfigScope` to `FleetConfigSummary` and `FleetConfigRecord`。
- Produces `resolveConfigScope(value: unknown): ConfigScope`, unknown／缺省值回傳 `unclassified`。

- [ ] **Step 1: 寫 scope contract 的失敗測試**

在 `tests/fleet-config/fleet-config-contract.test.ts` 新增以下斷言，先不改實作：

```ts
it('缺少或未知 scope 的舊記錄解析為 unclassified', () => {
  expect(resolveConfigScope(undefined)).toBe('unclassified')
  expect(resolveConfigScope('legacy')).toBe('unclassified')
  expect(resolveConfigScope('battle')).toBe('battle')
  expect(resolveConfigScope('adventure')).toBe('adventure')
})

it('戰鬥與冒險各自使用 10 套上限', () => {
  expect(MAX_CONFIGS_PER_SCOPE).toBe(10)
  expect(CLASSIFIED_CONFIG_SCOPES).toEqual(['battle', 'adventure'])
})
```

- [ ] **Step 2: 執行測試確認先失敗**

Run: `npx vitest run tests/fleet-config/fleet-config-contract.test.ts`

Expected: FAIL，因為 scope 常數與 `resolveConfigScope` 尚未存在。

- [ ] **Step 3: 實作最小 contract 變更**

在 `miniprogram/contracts/fleet-config.ts` 新增型別、常數與解析函數，並將 `scope` 加入摘要／記錄介面；不要把 scope 放入 `serializeFleetState` 的 FleetState envelope：

```ts
export type ConfigScope = 'battle' | 'adventure' | 'unclassified'
export const CLASSIFIED_CONFIG_SCOPES = ['battle', 'adventure'] as const
export const MAX_CONFIGS_PER_SCOPE = 10

export const resolveConfigScope = (value: unknown): ConfigScope =>
  value === 'battle' || value === 'adventure' ? value : 'unclassified'
```

- [ ] **Step 4: 執行 contract 與既有序列化測試**

Run: `npx vitest run tests/fleet-config/fleet-config-contract.test.ts tests/fleet-config/fleet-config-error.test.ts`

Expected: PASS，既有 FleetState schema 仍為 1，scope 只存在配置記錄 metadata。

- [ ] **Step 5: 檢查變更範圍**

Run: `git diff --check; git status --short`

Expected: 只有本任務指定的 contract 與測試文件有變更，沒有 generated／master 資料變更。

---

### Task 2: 雲函數 repository 支援 scope、分類與每 scope 10 套約束

**Files:**
- Modify: `cloudfunctions/fleet-config/fleet-config-repository.js`
- Modify: `cloudfunctions/fleet-config/fleet-config-service.js`
- Modify: `tests/fleet-config/fleet-config-repository.test.ts`
- Modify: `tests/fleet-config/fleet-config-service.test.ts`

**Interfaces:**
- Repository `getStoredScope(record)`：缺少 scope 時回傳 `unclassified`。
- Repository `insertWithConstraints(record, maxConfigsPerScope)`：只計算 `record.scope` 相同的記錄，名稱只在相同 scope 比較。
- Repository `renameIfVersionAndNameAvailable(ownerUid, configId, expectedVersion, name, normalizedName, scope)`：只在同 scope 檢查重名。
- Repository `classifyIfVersionAndConstraints(ownerUid, configId, expectedVersion, targetScope, maxConfigsPerScope)`：交易內完成舊記錄分類、版本檢查、同 scope 10 套上限與名稱唯一性。
- Cloud actions 新增 `listUnclassifiedConfigs`、`classifyConfig`；所有已分類 CRUD action payload 必須含 scope。

- [ ] **Step 1: 擴充記憶體 repository double 的資料欄位與失敗測試**

在 `tests/fleet-config/fleet-config-service.test.ts` 的 `FleetConfigRecord` 加入 `scope?: ConfigScope`，並新增以下測試：

```ts
it('不同 scope 可以使用相同名稱，但同 scope 仍拒絕重名', async () => {
  const battle = await dispatch('createConfig', {
    scope: 'battle', name: '主力艦隊', fleetState: createFleetState(),
  })
  const adventure = await dispatch('createConfig', {
    scope: 'adventure', name: '主力艦隊', fleetState: createFleetState(),
  })
  const duplicate = await dispatch('createConfig', {
    scope: 'battle', name: '主力艦隊', fleetState: createFleetState(),
  })

  expect(battle.ok).toBe(true)
  expect(adventure.ok).toBe(true)
  expect(duplicate).toMatchObject({ ok: false, code: 'duplicate-name' })
})

it('戰鬥與冒險各自最多 10 套', async () => {
  for (let i = 0; i < 10; i++) {
    expect((await dispatch('createConfig', {
      scope: 'battle', name: `戰鬥${i}`, fleetState: createFleetState(),
    })).ok).toBe(true)
    expect((await dispatch('createConfig', {
      scope: 'adventure', name: `冒險${i}`, fleetState: createFleetState(),
    })).ok).toBe(true)
  }
  expect((await dispatch('createConfig', {
    scope: 'battle', name: '戰鬥11', fleetState: createFleetState(),
  })).ok).toBe(false)
  expect((await dispatch('createConfig', {
    scope: 'adventure', name: '冒險11', fleetState: createFleetState(),
  })).ok).toBe(false)
})
```

- [ ] **Step 2: 新增舊記錄分類與 cross-scope 讀寫失敗測試**

使用 memory repository 預置缺少 scope 的記錄，驗證：`listUnclassifiedConfigs` 能返回它；`listMyConfigs({scope:'battle'})` 不包含它；`classifyConfig` 成功後它只出現在目標 scope；以另一 scope load／update／delete 同一 ID 返回 `not-found`。

- [ ] **Step 3: 執行雲函數測試確認先失敗**

Run: `npx vitest run tests/fleet-config/fleet-config-service.test.ts tests/fleet-config/fleet-config-repository.test.ts`

Expected: 新增 scope／上限／分類案例 FAIL，舊有 20 套測試也因新 action contract FAIL；這是預期的紅燈階段。

- [ ] **Step 4: 實作 repository scope 過濾與交易**

在 repository 中以 `getStoredScope(record)` 對缺省 scope 做向後相容；`insertWithConstraints` 只對同 scope 做 count／normalizedName 檢查；rename 也只比較同 scope；新增 `classifyIfVersionAndConstraints`，在 owner lock transaction 內：

```js
if (existing.version !== expectedVersion) return { ok: false, code: 'conflict' }
if (getStoredScope(existing) !== 'unclassified') return { ok: false, code: 'invalid-state' }
if (sameScopeRecords.length >= maxConfigsPerScope) return { ok: false, code: 'limit-reached' }
if (sameScopeRecords.some((item) => getStoredNormalizedName(item) === normalizedName)) {
  return { ok: false, code: 'duplicate-name' }
}
// 更新 scope、version、updatedAt，保留 fleetState 與 lastUsedAt
```

- [ ] **Step 5: 實作 service action 與回應 mapping**

在 `fleet-config-service.js`：

- 將 `MAX_CONFIGS_PER_USER = 20` 改為 `MAX_CONFIGS_PER_SCOPE = 10`。
- `VALID_ACTIONS` 加入 `listUnclassifiedConfigs`、`classifyConfig`。
- 新建／另存要求 payload scope 為 `battle` 或 `adventure`。
- list 只返回傳入 scope；待分類另走 `listUnclassifiedConfigs`。
- load、update、rename、delete、setLastUsed 先驗證記錄 scope 與 payload scope 一致。
- `toSummary` 與 `toClientRecord` 返回 scope；缺少 scope 的舊記錄映射為 `unclassified`。
- 分類 action 驗證 targetScope、呼叫 repository 交易並返回更新後記錄。
- 服務錯誤訊息用中文描述「已達 10 套配置」「名稱已存在」等，但保留既有錯誤碼。

- [ ] **Step 6: 執行雲函數測試確認通過**

Run: `npx vitest run tests/fleet-config/`

Expected: PASS；測試覆蓋 owner isolation、scope isolation、兩個 10 套上限、跨 scope 同名、分類成功／失敗、版本衝突與舊記錄缺省。

---

### Task 3: 小程序配置服務適配層帶 scope 並驗證回應

**Files:**
- Modify: `miniprogram/runtime/fleet-config-service.ts`
- Modify: `tests/runtime/fleet-config-service.test.ts`

**Interfaces:**
- `type ClassifiedConfigScope = Exclude<ConfigScope, 'unclassified'>`。
- `listMyConfigs(scope: ClassifiedConfigScope)`。
- `listUnclassifiedConfigs()`。
- `loadConfig(scope: ClassifiedConfigScope, configId: string)`。
- `createConfig(scope: ClassifiedConfigScope, name: string, fleetState: FleetState)`。
- `updateConfig(input: UpdateConfigInput & { scope: ClassifiedConfigScope })`。
- `saveAsConfig(scope: ClassifiedConfigScope, name: string, fleetState: FleetState)`。
- `renameConfig(scope: ClassifiedConfigScope, configId: string, version: number, name: string)`。
- `deleteConfig(scope: ClassifiedConfigScope, configId: string, expectedVersion: number)`。
- `setLastUsedConfig(scope: ClassifiedConfigScope, configId: string)`。
- `classifyConfig(configId: string, expectedVersion: number, targetScope: ClassifiedConfigScope)`。

- [ ] **Step 1: 新增 payload 與回應 contract 失敗測試**

在 `tests/runtime/fleet-config-service.test.ts` 新增：

```ts
it('listMyConfigs 傳送固定 scope', async () => {
  mockSuccess([])
  await createFleetConfigService().listMyConfigs('battle')
  expect(mockCallFunction).toHaveBeenCalledWith({
    name: 'fleet-config', data: { action: 'listMyConfigs', scope: 'battle' },
  })
})

it('拒絕缺少 scope 的成功摘要回應', async () => {
  mockSuccess([{ configId: 'cfg-1', name: '舊資料', version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z', lastUsedAt: '2026-01-01T00:00:00.000Z' }])
  await expect(createFleetConfigService().listMyConfigs('battle')).rejects.toMatchObject({
    code: 'network',
  })
})
```

- [ ] **Step 2: 執行測試確認先失敗**

Run: `npx vitest run tests/runtime/fleet-config-service.test.ts`

Expected: FAIL，因為 service methods 尚未接受／傳送 scope，摘要 contract 尚未要求 scope。

- [ ] **Step 3: 實作 scope 介面與 payload**

更新 `FleetConfigService`、`UpdateConfigInput`、`isValidFleetConfigSummary` 與 `isValidFleetConfigRecord`；每個 scoped action 將 `scope` 放進 `callFunction` payload，分類 action 傳 `{ configId, expectedVersion, targetScope }`。不允許 adapter 自動猜測頁面 scope。

- [ ] **Step 4: 補齊所有 action 測試並執行**

測試 list、load、create、update、saveAs、rename、delete、setLastUsed、listUnclassified、classify 的 exact payload，並驗證 scope 不在 owner identity payload 中。

Run: `npx vitest run tests/runtime/fleet-config-service.test.ts`

Expected: PASS。

---

### Task 4: 配置管理 presenter 建立列表狀態與折疊 view model

**Files:**
- Modify: `miniprogram/presenters/config-management-presenter.ts`
- Modify: `tests/presenters/config-management-presenter.test.ts`

**Interfaces:**
- `ConfigListState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'`。
- `ConfigManagerViewInput`：包含 `configName`、`configStatus`、`configList`、`unclassifiedConfigs`、`listState`、`listError`、`expanded`、`authStatus`、`activeConfigId`。
- `ConfigManagerView`：包含收起摘要、展開可見性、配置行資料、操作可見性、分類入口與錯誤／空列表語義。
- `buildConfigManagerView(input: ConfigManagerViewInput): ConfigManagerView`。
- `collapseAfterSuccessfulLoad(): { expanded: false }`。

- [ ] **Step 1: 寫 view model 失敗測試**

在 `tests/presenters/config-management-presenter.test.ts` 新增：

```ts
it('收起狀態只保留核心配置摘要', () => {
  const view = buildConfigManagerView({
    configName: '遠洋火力', configStatus: 'saved', configList: [],
    unclassifiedConfigs: [], listState: 'ready', listError: null,
    expanded: false, authStatus: 'authenticated', activeConfigId: 'cfg-1',
  })
  expect(view.expanded).toBe(false)
  expect(view.showConfigList).toBe(false)
  expect(view.showActionRow).toBe(false)
  expect(view.summary.name).toBe('遠洋火力')
})

it('載入成功後狀態決策為收起', () => {
  expect(collapseAfterSuccessfulLoad()).toEqual({ expanded: false })
})

it('列表錯誤不誤顯示為空列表，待分類資料才顯示分類入口', () => {
  const errorView = buildConfigManagerView({
    configName: '未命名配置', configStatus: 'new', configList: [],
    unclassifiedConfigs: [], listState: 'error', listError: '列表載入失敗',
    expanded: true, authStatus: 'authenticated', activeConfigId: null,
  })
  expect(errorView.emptyState).toBe(false)
  expect(errorView.errorMessage).toBe('列表載入失敗')
})
```

- [ ] **Step 2: 執行測試確認先失敗**

Run: `npx vitest run tests/presenters/config-management-presenter.test.ts`

Expected: FAIL，因為 view model 尚未存在。

- [ ] **Step 3: 實作純函數 view model**

保留既有 `deriveConfigStatus`、命名驗證與未保存守衛函數；新增 view model 將 `loading`、`ready`、`empty`、`error` 分開映射，將已登入與 guest 操作入口映射為「保存」／「登入後保存」，並只在 `expanded=true` 時輸出列表與操作列。

- [ ] **Step 4: 執行 presenter 測試與型別檢查**

Run: `npx vitest run tests/presenters/config-management-presenter.test.ts; npm run typecheck`

Expected: PASS。

---

### Task 5: 重構單一配置管理元件與 WXML/WXSS

**Files:**
- Modify: `miniprogram/components/config-bar/index.ts`
- Modify: `miniprogram/components/config-bar/index.wxml`
- Modify: `miniprogram/components/config-bar/index.wxss`
- Modify: `miniprogram/components/config-list-modal/index.json`（只在頁面不再使用後確認是否仍需註冊，不刪檔）
- Modify: `tests/architecture/fleet-shared-components.test.ts`

**Interfaces:**
- Component properties: `configName`、`configStatus`、`authStatus`、`activeConfigId`、`configList`、`unclassifiedConfigs`、`listState`、`listError`、`expanded`。
- Events: `toggle`、`login`、`save`、`save-as`、`rename`、`delete`、`new`、`exit`、`load`、`classify`、`retry`。
- `config-list-modal` 不再由兩個配隊頁渲染；命名與衝突 modal 保持獨立。

- [ ] **Step 1: 更新共享元件架構測試為單一模組契約**

在 `tests/architecture/fleet-shared-components.test.ts` 先要求新的 property／event／WXML 語義：

```ts
expect(wxml).toContain('我的配置')
expect(wxml).toContain('config-bar--expanded')
expect(wxml).toContain('bindtap="onToggle"')
expect(wxml).toContain('bindtap="onLoad"')
expect(wxml).toContain('bindtap="onClassify"')
expect(wxml).toContain('待分類舊配置')
expect(wxml).not.toContain('配置類型')
expect(wxml).not.toContain('戰鬥配置</button>')
```

- [ ] **Step 2: 執行架構測試確認先失敗**

Run: `npx vitest run tests/architecture/fleet-shared-components.test.ts`

Expected: FAIL，舊元件仍使用多按鈕 menu 與列表 modal。

- [ ] **Step 3: 重寫 Component properties 與事件轉發**

在 `index.ts` 宣告新 properties，方法只做 `triggerEvent`；禁止在元件內呼叫 service。事件資料格式固定：`load/classify` 傳 `{ id }` 或 `{ id, scope }`，`toggle/login/retry` 無 payload。

- [ ] **Step 4: 重寫 WXML 為單一折疊模組**

收起時只渲染摘要行；展開時按「目前摘要 → 同 scope 列表 → 操作列 → 待分類」順序渲染。不要放類型切換；待分類行只提供一次性「歸入戰鬥／歸入冒險」。列表 loading、empty、error 由 `listState` 分支渲染。

- [ ] **Step 5: 重寫 WXSS 並保持 Design Foundation Token**

收起模組使用最低可用高度，箭頭／標題／狀態／數量／入口同一行；展開內容使用 Token 間距與邊界。配置模組次要操作採緊湊外觀，主要保存保留主按鈕；所有 button selector 都有 `display:flex`、`align-items:center`、`justify-content:center`、`text-align:center` 或繼承全局規則。不得加入硬編碼色值、漸層或新的字體。

- [ ] **Step 6: 執行共享元件與樣式架構測試**

Run: `npx vitest run tests/architecture/fleet-shared-components.test.ts tests/architecture/design-foundation.test.ts`

Expected: PASS。

---

### Task 6: 接線戰鬥／冒險頁、scope lifecycle 與載入後自動收起

**Files:**
- Modify: `miniprogram/pages/fleet/index.ts`
- Modify: `miniprogram/pages/fleet/index.wxml`
- Modify: `miniprogram/pages/fleet/index.wxss`
- Modify: `miniprogram/pages/adventure-fleet/index.ts`
- Modify: `miniprogram/pages/adventure-fleet/index.wxml`
- Modify: `miniprogram/pages/adventure-fleet/index.wxss`
- Modify: `tests/pages/fleet-page.test.ts`
- Modify: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- Battle page constant `const CONFIG_SCOPE = 'battle' as const`。
- Adventure page constant `const CONFIG_SCOPE = 'adventure' as const`。
- Page data includes `configListState`、`configListError`、`unclassifiedConfigs`、`expanded`；移除獨立 `showConfigList` 渲染路徑。
- `refreshConfigList`、`doLoadConfig`、`doDeleteConfig`、`handleConflictReload`、force update 與 save／saveAs／rename 均使用固定 scope。

- [ ] **Step 1: 更新頁面測試的 mock response 與失敗案例**

在兩份頁面測試的 `listMyConfigs`／`loadConfig` mock data 加入 `scope`，並新增：

```ts
it('戰鬥頁只傳 battle scope，載入成功後自動收起', async () => {
  // mock authenticate、listMyConfigs(scope=battle)、loadConfig(scope=battle)
  const page = createPageInstance()
  await page.onLoad()
  await page.onConfigLogin()
  expect(mockCallFunction).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ action: 'listMyConfigs', scope: 'battle' }),
  }))
  expect(page.data.expanded).toBe(false)
})
```

冒險頁使用同一測試結構但期望 `scope: 'adventure'`；另測試錯誤時 `expanded` 保持 true、待分類 action 傳 targetScope。

- [ ] **Step 2: 執行頁面測試確認先失敗**

Run: `npx vitest run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts`

Expected: 新增 scope／expanded 斷言 FAIL，舊有直接使用 `showConfigList` 的斷言需要隨新契約更新。

- [ ] **Step 3: 接入固定 scope 與列表狀態**

在兩頁 state 中加入 scope 對應的 `configListState` 與 `unclassifiedConfigs`；登入後並行或順序取得 scope 列表與待分類列表；列表成功但為空與列表錯誤分開寫入 page data。guest 狀態不呼叫 CloudBase。

- [ ] **Step 4: 接入單一模組事件與未保存守衛**

將 WXML 的 `config-bar` 改為單一 `expanded`／`bind:toggle`／`bind:load`／`bind:classify` 接線；載入、新建、另存、改名、刪除、離開仍經 `checkUnsavedAndProceed`。分類前若本地有未保存修改，先走既有守衛或明確禁止並說明原因。

- [ ] **Step 5: 實作成功載入後自動收起**

在 battle／adventure 各自的 `doLoadConfig` 與 conflict reload 成功分支中，同時更新頁面 FleetState、active config、version、saved baseline，並：

```ts
page.setData({
  activeConfigId: record.configId,
  configName: record.name,
  configStatus: 'saved',
  expanded: false,
})
```

失敗分支不修改 `expanded`，保留展開狀態與 `configListError`。

- [ ] **Step 6: 執行兩頁 lifecycle 測試與型別檢查**

Run: `npx vitest run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts; npm run typecheck`

Expected: PASS；戰鬥／冒險 payload 不互通，載入成功收起，錯誤保持展開，未保存守衛仍通過。

---

### Task 7: 建立全局 button 置中契約並修正自訂按鈕

**Files:**
- Modify: `miniprogram/styles/design-foundation.wxss`
- Modify: `miniprogram/components/config-bar/index.wxss`
- Modify: `miniprogram/components/config-conflict-modal/index.wxss`
- Modify: `miniprogram/components/config-name-modal/index.wxss`
- Modify: `miniprogram/components/mode-tabs/index.wxss`
- Modify: `miniprogram/components/skill-picker-sheet/index.wxss`
- Modify: `miniprogram/components/officer-action-sheet/index.wxss`
- Modify: `miniprogram/components/result-preview-sheet/index.wxss`
- Modify: `miniprogram/components/empty-state/index.wxss`
- Modify: `miniprogram/components/disclosure-section/index.wxss`
- Modify: `miniprogram/components/skill-sheet/index.wxss`
- Modify: `miniprogram/pages/fleet/index.wxss`
- Modify: `miniprogram/pages/adventure-fleet/index.wxss`
- Modify: `miniprogram/pages/officer-editor/index.wxss`
- Modify: `miniprogram/pages/catalog/index.wxss`
- Modify: `miniprogram/subpkg-detail/pages/detail/index.wxss`
- Modify: `tests/architecture/design-foundation.test.ts`
- Modify: `tests/architecture/fleet-shared-components.test.ts`

**Interfaces:**
- Global `button` base rule guarantees flex centering and removes native pseudo-border.
- `.ui-button--compact` is an opt-in visual variant for reversible secondary actions; primary／icon hit-area rules remain unchanged。
- Existing specialized selectors may set width／margin／font size, but no button rule may set top-only alignment。

- [ ] **Step 1: 新增全局樣式失敗契約**

在 `tests/architecture/design-foundation.test.ts` 新增：

```ts
it('全局原生 button 內容上下左右置中', () => {
  const foundation = readProjectFile('miniprogram/styles/design-foundation.wxss')
  expect(foundation).toMatch(/button\s*\{[^}]*display:\s*flex/s)
  expect(foundation).toMatch(/button\s*\{[^}]*align-items:\s*center/s)
  expect(foundation).toMatch(/button\s*\{[^}]*justify-content:\s*center/s)
  expect(foundation).toMatch(/button\s*\{[^}]*text-align:\s*center/s)
  expect(foundation).toContain('button::after')
})
```

- [ ] **Step 2: 執行樣式測試確認先失敗**

Run: `npx vitest run tests/architecture/design-foundation.test.ts`

Expected: FAIL，Design Foundation 目前只有 `.ui-button` 置中，沒有全局原生 button 規則。

- [ ] **Step 3: 實作 foundation 全局置中與 compact variant**

在 `design-foundation.wxss` 的基礎層加入：

```css
button {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.35;
}

button::after {
  border: 0;
}
```

保留 `.ui-button` 的主要／次要／危險／禁用／按下／焦點狀態；新增 `.ui-button--compact` 只降低次要可逆操作的 padding／視覺高度，不改變文字下限或純圖示 88rpx 熱區。

- [ ] **Step 4: 逐一修正自訂按鈕覆寫**

對 Task 7 檔案中的 `.form-link`、`.form-btn`、`.submit-btn`、`.mode-tabs__item`、`.skill-picker-sheet__tab`、`.skill-picker-sheet__select`、`.officer-action-sheet__icon-button`、`.result-preview-sheet__close`、`.disclosure-section__action` 等 selector，移除會造成上對齊的 `display:block`／不一致 line-height，補足 flex center 或明確繼承全局 button。每個 button 保持 Design Foundation Token，無局部硬編碼色值。

- [ ] **Step 5: 執行 architecture、lint 與窄屏靜態檢查**

Run: `npx vitest run tests/architecture/design-foundation.test.ts tests/architecture/fleet-shared-components.test.ts; npm run lint; git diff --check`

Expected: PASS；所有 button 文字／圖示具備置中契約，無新增硬編碼視覺值與格式錯誤。

---

### Task 8: 更新 CloudBase 架構文件與部署／遷移驗收說明

**Files:**
- Modify: `docs/architecture/fleet-configuration-cloudbase.md`
- Test: `tests/architecture/cloudbase-runtime-network.test.ts`（只在 scope action 需要補契約時修改）

- [ ] **Step 1: 更新 CloudBase 服務文件中的資料規則**

將文件內所有「每使用者 20 套」改為 battle／adventure 各 10 套；記錄欄位加入 `scope`；說明缺省 scope 等價於 `unclassified`、舊資料不自動猜測類型、分類 action 的版本／上限／名稱檢查。

- [ ] **Step 2: 更新索引與遷移步驟**

記錄新增或替換 `ownerUid + scope + normalizedName` 唯一索引，移除會阻止跨 scope 同名的舊唯一索引；說明部署前可回填 `unclassified`，但不可自動將舊資料歸入 battle 或 adventure。

- [ ] **Step 3: 執行文件／網路架構測試**

Run: `npx vitest run tests/architecture/cloudbase-runtime-network.test.ts tests/architecture/runtime-source-boundaries.test.ts`

Expected: PASS；CloudBase 呼叫仍只有受控配置服務，無新增 runtime network 入口。

---

### Task 9: 完整驗證、微信 DevTools 驗收與交付檢查

**Files:**
- Test: `tests/fleet-config/`
- Test: `tests/runtime/fleet-config-service.test.ts`
- Test: `tests/presenters/config-management-presenter.test.ts`
- Test: `tests/pages/fleet-page.test.ts`
- Test: `tests/pages/adventure-fleet-page.test.ts`
- Test: `tests/architecture/`

- [ ] **Step 1: 執行完整自動化門禁**

Run: `npm run verify`

Expected: format、lint、typecheck、全部 Vitest、runtime-network、miniprogram-size、assets、data:check、generate:check 全部 PASS。

- [ ] **Step 2: 確認差異只在本 Change 範圍**

Run: `git status --short; git diff --name-only main...HEAD`

Expected: 只包含配置 contract／服務／雲函數、配置管理元件／兩個配隊頁、按鈕樣式、相關測試、架構文件，以及已提交的設計／計畫文件；`archive/`、`data/master/`、`miniprogram/generated/`、Solver／Domain 無變更。

- [ ] **Step 3: 微信 DevTools 四種寬度驗收**

在 320px、375px、393px、430px 驗證：

1. 戰鬥頁只讀取 battle；冒險頁只讀取 adventure；兩邊不互相出現配置。
2. 各 scope 建立第 10 套成功，第 11 套顯示上限原因；跨 scope 同名可建立。
3. 舊配置在單一模組內逐筆分類，分類成功後從待分類消失。
4. 配置模組預設收起、收起高度最低；展開後所有切換／操作集中於此。
5. 成功載入後自動收起；失敗保持展開並顯示錯誤／重試。
6. 所有按鈕文字／圖示上下左右置中，多行文字不頂部、不裁切。
7. 不新增橫向滾動、安全區回退或重要長文字溢出。

- [ ] **Step 4: 交付前展示並等待 commit 確認**

在未獲使用者確認前不建立產品實作 commit；先展示：

- 變更文件清單
- `npm run verify`、`git diff --check` 與 DevTools 結果
- 擬用 commit message，例如 `feat: 重構配置隔離與折疊管理`

使用者確認後才執行 `git add`／`git commit`，並回報 commit hash 與目前分支。
