# 冒險配隊安全護欄 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution requested by the user). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留預先配置的 Lv.0 技能追蹤目標，修復冒險配隊空目標入口、Lv.0 誤入 Solver，以及無有效目標時可能清空現有艦隊的 P0 風險。

**Architecture:** 延續現有 `FleetTarget` 配置結構，用 `skillId != null && targetLevel === 0` 表示可保存的追蹤目標，用 `targetLevel > 0` 表示 Solver 最佳化目標。Domain 提供集中篩選函式，Solver 自身再次防守式忽略 Lv.0；Page Controller 只在有有效目標時進入既有直接重算流程，新增目標則先開啟頁面內技能選擇 Bottom Sheet。

**Tech Stack:** TypeScript、Vitest、微信小程序 WXML/WXSS、既有配置序列化契約；不新增依賴、不新增網路請求。

## Global Constraints

- 所有 UI 文案使用繁體中文；程式碼、測試與文件不修改 `archive/` 和 `miniprogram/generated/`。
- 不新增、刪除或升級依賴，不新增 `wx.request`、`wx.cloud`、遠端 URL 或 Node.js Runtime API。
- 每個 Change 使用獨立 `codex/phase-N-描述` 分支；本次分支為 `codex/phase-1-冒險配隊安全護欄`。
- 配置保存、未保存攔截、版本衝突處理與現有資料欄位必須保留。
- 資料解析、轉換、校驗、篩選和 Solver 邏輯遵循紅–綠–重構 TDD；每個新行為先看見預期失敗，再寫最小實作。
- 本 Change 不實作自動配隊方案預覽、應用、取消、撤銷、共用 Design System 或全頁視覺改版。
- Commit 前必須展示變更檔案、測試結果、微信 DevTools 截圖與擬用 Commit Message，等待使用者確認後才可提交。

---

### Task 1: 讓 Lv.0 追蹤目標可保存並拒絕 Lv.0 空占位

**Files:**
- Modify: `miniprogram/contracts/fleet-config.ts:264-276`
- Modify: `miniprogram/domain/battle-fleet.ts:380-399`
- Test: `tests/fleet-config/fleet-config-contract.test.ts`
- Test: `tests/domain/battle-fleet.test.ts`

**Interfaces:**
- `isValidTarget` 接受非空 `skillId` 的 `targetLevel` 0–10；`skillId === null` 的舊空占位只接受 1–10。
- `updateShipTargets(state, shipId, targets)` 對同一規則返回 `invalid-target-level`，不改變原狀態。

- [ ] **Step 1: 把契約測試改成先描述 Lv.0 追蹤與空占位邊界**

在 `FleetState validation` 中將現有「0 必須非法」案例改為以下兩個斷言：

```ts
it('accepts a configured Lv.0 tracking target but rejects a Lv.0 empty target', () => {
  const raw = JSON.parse(serializeFleetState(createFleetState())) as Record<string, unknown>
  const ships = raw.ships as Array<Record<string, unknown>>

  ships[0]!.targets = [{ id: 'tracking', skillId: 'skill_abc', targetLevel: 0 }]
  expect(isValidSerializedFleetState(raw)).toBe(true)

  ships[0]!.targets = [{ id: 'empty', skillId: null, targetLevel: 0 }]
  expect(isValidSerializedFleetState(raw)).toBe(false)
})
```

在 `tests/domain/battle-fleet.test.ts` 追加：

```ts
it('allows Lv.0 configured targets but rejects Lv.0 empty placeholders', () => {
  const state = createFleetState()
  expect(
    updateShipTargets(state, 'ship-1', [
      { id: 'tracking', skillId: 'skill-a', targetLevel: 0 },
    ]).error,
  ).toBeUndefined()
  expect(
    updateShipTargets(state, 'ship-1', [
      { id: 'empty', skillId: null, targetLevel: 0 },
    ]).error,
  ).toBe('invalid-target-level')
})
```

- [ ] **Step 2: 執行契約與 Domain 測試確認目前實作正確失敗**

Run: `npm.cmd test -- tests/fleet-config/fleet-config-contract.test.ts tests/domain/battle-fleet.test.ts`

Expected: FAIL because serialized non-null Lv.0 is rejected and `updateShipTargets` currently accepts a null-skill Lv.0 placeholder.

- [ ] **Step 3: 實作最小校驗變更**

在 `isValidTarget` 中依 `skillId` 決定下限：非空技能為 0，空占位為 1，兩者上限都為 10。把 `updateShipTargets` 的等級校驗從只檢查非空目標改成檢查所有目標，並保留既有重複技能校驗與不可變返回。

- [ ] **Step 4: 重跑測試確認綠燈且未改變既有目標行為**

Run: `npm.cmd test -- tests/fleet-config/fleet-config-contract.test.ts tests/domain/battle-fleet.test.ts`

Expected: PASS；既有自動模式 Lv.1 空占位、Lv.11 非法值與重複技能案例仍通過。

### Task 2: 集中篩選冒險最佳化目標並讓 Solver 忽略 Lv.0

**Files:**
- Modify: `miniprogram/domain/adventure-fleet.ts`
- Modify: `miniprogram/domain/adventure-fleet-solver.ts`
- Create: `tests/domain/adventure-fleet.test.ts`
- Create: `tests/domain/adventure-fleet-solver.test.ts`

**Interfaces:**
- 新增 `AdventureOptimizationTarget`：`{ skillId: string; targetLevel: number }`。
- 新增 `getAdventureOptimizationTargets(targets)`：只返回非空技能且 `targetLevel > 0` 的複製值，輸入順序保持不變。
- `solveAdventureTargets(input)` 對 Lv.0 追蹤輸入視為無效最佳化目標；負數或大於 10 仍拋出既有錯誤。

- [ ] **Step 1: 先建立 Domain 篩選失敗測試**

```ts
import { getAdventureOptimizationTargets } from '../../miniprogram/domain/adventure-fleet'

it('keeps only configured Lv.1+ adventure targets for optimization', () => {
  expect(
    getAdventureOptimizationTargets([
      { id: 'tracking', skillId: 'skill-track', targetLevel: 0 },
      { id: 'empty', skillId: null, targetLevel: 1 },
      { id: 'goal', skillId: 'skill-goal', targetLevel: 3 },
    ]),
  ).toEqual([{ skillId: 'skill-goal', targetLevel: 3 }])
})
```

- [ ] **Step 2: 先建立 Solver 的 Lv.0 紅燈測試**

在 `tests/domain/adventure-fleet-solver.test.ts` 使用最小航海士 fixture：

```ts
const officer = (id: string, skillId: string): AdventureFleetOfficer => ({
  id,
  name: id,
  jobName: '冒險家',
  rarityName: '普通',
  portraitPath: '',
  visualGradeId: 'grade-1',
  typeId: 'type_class_1',
  typeName: '冒險',
  genderId: 'gender_m',
  adventureSkills: [{ skillId, unlockLevel: 1 }],
  zone: 'adventure',
})

it('does not select officers for Lv.0 tracking targets', () => {
  const result = solveAdventureTargets({
    officers: [officer('officer-a', 'skill-track')],
    targets: [{ skillId: 'skill-track', targetLevel: 0 }],
    lockedOfficerIds: [],
    excludedOfficerIds: [],
    currentOfficerIds: [],
    capacity: 77,
  })
  expect(result.officerIds).toEqual([])
  expect(result.targetProgress).toEqual([])
})
```

再追加混合目標案例，要求 Lv.0 追蹤不影響 Lv.1 目標求解：

```ts
it('solves only positive-level targets when tracking and optimization are mixed', () => {
  const result = solveAdventureTargets({
    officers: [officer('officer-a', 'skill-track'), officer('officer-b', 'skill-goal')],
    targets: [
      { skillId: 'skill-track', targetLevel: 0 },
      { skillId: 'skill-goal', targetLevel: 1 },
    ],
    lockedOfficerIds: [],
    excludedOfficerIds: [],
    currentOfficerIds: [],
    capacity: 77,
  })
  expect(result.officerIds).toEqual(['officer-b'])
  expect(result.targetProgress.map((target) => target.skillId)).toEqual(['skill-goal'])
})
```

- [ ] **Step 3: 執行兩組新測試確認因 API/行為缺失而失敗**

Run: `npm.cmd test -- tests/domain/adventure-fleet.test.ts tests/domain/adventure-fleet-solver.test.ts`

Expected: FAIL because the helper and the Solver filtering behavior do not exist yet.

- [ ] **Step 4: 實作最小 Domain 與 Solver 變更**

在 `adventure-fleet.ts` 引入 `FleetTarget` 型別並新增純函式，對輸出物件使用新複製值。Solver 的 target validation 先保留非空技能並檢查 0–10 範圍，再過濾 `targetLevel > 0`；若過濾後為空，返回既有空結果形狀，不進入 DP 或貪心選擇。

- [ ] **Step 5: 執行新測試與既有 Solver/Domain 回歸**

Run: `npm.cmd test -- tests/domain/adventure-fleet.test.ts tests/domain/adventure-fleet-solver.test.ts tests/domain/battle-fleet.test.ts`

Expected: PASS with no mutation of input targets or existing battle solver behavior.

### Task 3: Presenter 輸出有效目標狀態並隱藏舊空占位

**Files:**
- Modify: `miniprogram/presenters/adventure-fleet-presenter.ts`
- Create: `tests/presenters/adventure-fleet-presenter.test.ts`

**Interfaces:**
- `AdventureFleetPageData.optimizationTargetCount: number`。
- `AdventureFleetPageData.canRecalculate: boolean`。
- `AdventureFleetTargetView` 增加 `isTracking: boolean`；Presenter 只輸出 `skillId !== null` 的目標列。

- [ ] **Step 1: 先建立 Presenter 紅燈測試**

使用兩個已配置航海士與一個空占位的最小 `FleetState`，斷言 Lv.0 目標仍出現在 `targets`、空占位不出現、`optimizationTargetCount` 為 0 且 `canRecalculate` 為 false；再將同一目標改為 Lv.2，斷言計算狀態變為 true。

- [ ] **Step 2: 執行 Presenter 測試確認欄位缺失而失敗**

Run: `npm.cmd test -- tests/presenters/adventure-fleet-presenter.test.ts`

Expected: FAIL because the page data type and target view do not expose the new fields or filter empty targets.

- [ ] **Step 3: 實作 Presenter 最小變更**

從第一艘船讀取目標後先過濾 `skillId !== null`，以原有技能字典建立 view；`isTracking` 由 `targetLevel === 0` 判定；以 `getAdventureOptimizationTargets` 計算有效目標數與 `canRecalculate`，不改變技能累計與配置資料。

- [ ] **Step 4: 執行 Presenter 與相關回歸測試**

Run: `npm.cmd test -- tests/presenters/adventure-fleet-presenter.test.ts tests/domain/adventure-fleet.test.ts`

Expected: PASS；既有冒險技能累計與目標顯示順序保持不變。

### Task 4: Controller 加入選技入口、空占位清理與無目標護欄

**Files:**
- Modify: `miniprogram/pages/adventure-fleet/index.ts`
- Create: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- Page data 新增 `showTargetPicker: boolean`。
- Page 暴露 `onTargetPickerClose(): void`。
- `onAddTarget()` 只開啟選擇器，不呼叫 `updateShipTargets`。
- 自動模式 `onSkillSelect` 先移除同船 `skillId === null` 的舊占位；已有 Lv.0 目標時提升為 Lv.1，已有 Lv.1 以上目標才提示重複，不存在時新增 `{ skillId, targetLevel: 1 }`，成功後關閉選擇器。

- [ ] **Step 1: 先建立 Page 測試 harness 與紅燈案例**

仿照 `tests/pages/fleet-page.test.ts` 註冊全域 `Page` 與最小 `wx` stub，動態載入 `miniprogram/pages/adventure-fleet/index`。加入以下案例：

```ts
it('keeps preconfigured Lv.0 targets without showing an empty target row', () => {
  const page = createPageInstance()
  page.onLoad()
  expect(page.data.targets.length).toBeGreaterThan(0)
  expect(page.data.targets.every((target) => target.skillId !== null)).toBe(true)
  expect(page.data.targets.every((target) => target.targetLevel === 0)).toBe(true)
  expect(page.data.canRecalculate).toBe(false)
})

it('opens target picker without adding a blank target', () => {
  const page = createPageInstance()
  page.onLoad()
  const before = structuredClone(page.data.targets)
  page.onAddTarget()
  expect(page.data.showTargetPicker).toBe(true)
  expect(page.data.targets).toEqual(before)
})

it('promotes a preconfigured Lv.0 skill to a Lv.1 target and closes the picker', () => {
  const page = createPageInstance()
  page.onLoad()
  const target = page.data.targets.find((item) => item.targetLevel === 0)
  expect(target).toBeDefined()
  page.onAddTarget()
  page.onSkillSelect({ currentTarget: { dataset: { id: target!.skillId } } } as never)
  expect(page.data.targets).toEqual(expect.arrayContaining([
    expect.objectContaining({ skillId: target!.skillId, targetLevel: 1 }),
  ]))
  expect(page.data.targets.every((target) => target.skillId !== null)).toBe(true)
  expect(page.data.showTargetPicker).toBe(false)
})
```

再建立目前船已有非鎖定成員的案例，斷言只有 Lv.0 目標時呼叫 `onRecalculate()` 前後 `page.data.typeZones` 與頁面狀態相同，並顯示「請先設定至少一個 Lv.1 以上的優化目標」。

- [ ] **Step 2: 執行 Page 測試確認目前行為失敗**

Run: `npm.cmd test -- tests/pages/adventure-fleet-page.test.ts`

Expected: FAIL because `canRecalculate`、`showTargetPicker` 尚不存在，`onAddTarget` 會建立空目標，且無有效目標時仍會重算。

- [ ] **Step 3: 實作 Controller 狀態與空占位清理**

在 `emptyPageData` 加入 `showTargetPicker: false`。新增 `clearEmptyTargets(state)`，使用既有不可變 `updateShipTargets` 將每艘船的 `skillId === null` 目標移除；在冒險頁初始化與模式切換後呼叫，避免本頁新建流程留下空占位。載入舊配置時由 Presenter 過濾，選擇新技能時再清理目前船占位。

- [ ] **Step 4: 實作新增目標與取消流程**

`onAddTarget` 只執行 `this.setData({ showTargetPicker: true })`；`onTargetPickerClose` 設為 false。自動模式 `onSkillSelect` 以清理後的已配置目標查找技能：Lv.0 目標改為 Lv.1，Lv.1 以上提示重複，未找到時建立唯一 ID 的 Lv.1 目標；成功後透過 `applyResult` 更新 dirty 狀態、關閉選擇器並 render，重複時保留選擇器。

- [ ] **Step 5: 實作無有效目標的雙重護欄**

使用 `getAdventureOptimizationTargets(ship.targets)` 取得 active targets；為空時顯示繁體中文提示並立即 return。只有非空時才呼叫 `solveAdventureTargets` 與既有清空/分配流程。`render` 將 Presenter 的 `optimizationTargetCount` 與 `canRecalculate` 放入 `setData`。

- [ ] **Step 6: 執行 Page 與相關測試確認綠燈**

Run: `npm.cmd test -- tests/pages/adventure-fleet-page.test.ts tests/presenters/adventure-fleet-presenter.test.ts tests/domain/adventure-fleet.test.ts tests/domain/adventure-fleet-solver.test.ts`

Expected: PASS；配置 dirty tracking、保存入口與衝突處理測試不被改變。

### Task 5: 加入最小 Bottom Sheet 與計算按鈕狀態

**Files:**
- Modify: `miniprogram/pages/adventure-fleet/index.wxml`
- Modify: `miniprogram/pages/adventure-fleet/index.wxss`
- Test: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- UI 只使用繁體中文：`選擇新增目標技能`、`取消`、`請先設定至少一個 Lv.1 以上的優化目標`。
- `showTargetPicker` 為 true 時，技能列表成為頁面內 Bottom Sheet；遮罩與取消按鈕都呼叫 `onTargetPickerClose`。
- `重新計算` 綁定 `disabled="{{!canRecalculate}}"`，無有效目標時保留原因提示。

- [ ] **Step 1: 先加入 WXML 結構斷言並確認紅燈**

在同一 Page 測試讀取 WXML/WXSS，先加入以下斷言：

```ts
expect(adventureWxml).toContain('showTargetPicker')
expect(adventureWxml).toContain('onTargetPickerClose')
expect(adventureWxml).toContain('disabled="{{!canRecalculate}}"')
expect(adventureWxss).toMatch(/env\(safe-area-inset-bottom\)/)
```

Run: `npm.cmd test -- tests/pages/adventure-fleet-page.test.ts`

Expected: FAIL until the picker markup, disabled binding and safe-area style are added.

- [ ] **Step 2: 實作最小 WXML 結構**

在自動模式的目標區加入 `新增目標` 既有按鈕與 disabled 計算按鈕提示。讓既有技能列表在 `mode === 'manual' || showTargetPicker` 時可渲染；`showTargetPicker` 時加入遮罩、標題、搜尋、現有分段技能列表和取消整行熱區，不新增第二份資料來源。技能選擇仍使用 `onSkillSelect`，技能詳情仍使用 `onSkillTap`。

- [ ] **Step 3: 實作最小 WXSS 與窄屏安全區**

只新增選擇器固定底部、遮罩、可滾動列表、至少 88rpx 的取消/選擇熱區和 `padding-bottom: calc(24rpx + env(safe-area-inset-bottom))`；不修改主題色、整頁背景、既有卡片布局或共享樣式。

- [ ] **Step 4: 執行 Page 測試與格式檢查**

Run: `npm.cmd test -- tests/pages/adventure-fleet-page.test.ts`; `npx.cmd prettier --check miniprogram/pages/adventure-fleet/index.ts miniprogram/pages/adventure-fleet/index.wxml miniprogram/pages/adventure-fleet/index.wxss tests/pages/adventure-fleet-page.test.ts`

Expected: PASS and no formatting changes required.

### Task 6: focused verification and repository gate

**Files:**
- Inspect only: all files modified by Tasks 1–5

- [ ] **Step 1: 執行 focused test suite**

Run: `npm.cmd test -- tests/fleet-config/fleet-config-contract.test.ts tests/domain/battle-fleet.test.ts tests/domain/adventure-fleet.test.ts tests/domain/adventure-fleet-solver.test.ts tests/presenters/adventure-fleet-presenter.test.ts tests/pages/adventure-fleet-page.test.ts`

Expected: PASS with no unhandled errors or warnings.

- [ ] **Step 2: 執行完整驗證**

Run: `npm.cmd run verify`

Expected: exit code 0; record the actual test count and each quality gate result. If the gate exposes a pre-existing unrelated failure, stop and report it before changing scope.

- [ ] **Step 3: 檢查範圍與 diff**

Run: `git status --short`; `git diff --check`; `git diff --name-only -- archive miniprogram/generated`; `git diff --stat`

Expected: no changed path under `archive/` or `miniprogram/generated/`; only the design/plan docs and Phase 1 implementation/test files appear.

### Task 7: 微信 DevTools 窄屏與安全區驗收

**Files:**
- Inspect only: `miniprogram/pages/adventure-fleet/` and screenshots captured from the changed worktree

- [ ] **Step 1: 在 DevTools 載入冒險頁並建立可重現資料狀態**

使用新建配置，確認預先配置的 Lv.0 技能仍顯示，沒有空白目標列；加入一名航海士後保持現有成員，點擊新增目標、取消，再選擇一個新技能。

- [ ] **Step 2: 驗證 320/375/393/430px 寬度**

逐一檢查無頁面級水平溢出；Bottom Sheet、搜尋與選擇按鈕可見，主要熱區至少 88rpx。

- [ ] **Step 3: 驗證安全區與護欄**

在有 Home Indicator 的模擬裝置檢查 Bottom Sheet 底部 padding；無 Lv.1 以上目標時計算按鈕不可用，並確認現有成員沒有被清除。保存配置後重載，確認 Lv.0 目標仍可解析。

- [ ] **Step 4: 保存 before/after 與四種窄屏截圖**

截圖包括改造前頁面、改造後新建狀態、Bottom Sheet、無有效目標護欄，以及 320/375/393/430px 窄屏與安全區結果，提交前向使用者展示。

## 提交前停點

完成 Tasks 1–7 後不執行 `git commit`。先展示：

1. 變更文件清單與 diff 摘要；
2. focused tests、`npm run verify` 和 DevTools 驗收結果；
3. before/after 及窄屏截圖；
4. 擬用 Commit Message：`fix: 加固冒險配隊目標安全護欄`。

等待使用者明確確認後才提交。
