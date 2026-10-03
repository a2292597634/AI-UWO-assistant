# 配隊配置安全修復實施計畫

> **給執行代理：** 使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans`，按 A1→A4 執行。所有任務遵循總計畫的全局約束、紅→綠→重構及提交確認。

**目標：** 修復 R01–R06；保護目前配置、等待期间草稿、放棄語義及重算入口。

**架構：** 保留兩頁既有 Controller 狀態／operation version，新增小型純衝突契約及正數目標投影。只有更新衝突能提供 force；其他動作按原操作對象刷新或重試。持久化形狀及 schemaVersion 1 不改。

**技術：** TypeScript、Vitest、現有 FleetConfigService；沒有新增依賴或真雲寫入。

## A1：綁定衝突操作與對象（R01，先交付）

**文件責任：**

- 新增 `miniprogram/domain/fleet-config-conflict.ts`：純衝突上下文與 force 授權判斷。
- 修改 `miniprogram/pages/adventure-fleet/index.ts`、`miniprogram/subpkg-fleet/pages/index/index.ts`：所有配置操作傳入自己的 action／configId／version／快照；不只設布爾旗標。
- 修改 `miniprogram/components/config-conflict-modal/index.ts`、`index.wxml`：顯示配置名稱、按 context 限制操作；WXSS 僅為新增說明維持既有 Token。
- 新增 `tests/domain/fleet-config-conflict.test.ts`；修改兩頁測試及 `tests/fleet-config/fleet-config-service.test.ts`。

**介面／最小純邏輯：**

```ts
export type FleetConflictAction = 'update' | 'classify' | 'rename' | 'delete'
export interface FleetConfigConflict {
  action: FleetConflictAction
  configId: string
  configName: string
  expectedVersion: number
  fleetSnapshot: string
}
export function canForceOverwrite(
  conflict: FleetConfigConflict,
  current: { configId: string | null; fleetSnapshot: string },
): boolean {
  return (
    conflict.action === 'update' &&
    conflict.configId === current.configId &&
    conflict.fleetSnapshot === current.fleetSnapshot
  )
}
```

- [ ] **紅燈：** 新純函式測試用相同 active ID 但 classify action，必須 false；update 同 ID／同快照 true，換 ID／改快照 false。兩頁以已存在 Page fixture 重現「active A 已載入 → L 分類 CAS conflict → 點 force」，斷言 `updateConfig` 呼叫數為 0、A 内容不變。記憶體 repository 必須模擬前置讀取後版本變動，不把「已分類而返回 invalid-state」當成同一錯誤。

```ts
const conflict = {
  action: 'classify' as const,
  configId: 'A',
  configName: '目前配置',
  expectedVersion: 1,
  fleetSnapshot: '原快照',
}
expect(
  canForceOverwrite(conflict, {
    configId: 'A',
    fleetSnapshot: '原快照',
  }),
).toBe(false)
```

- [ ] 跑 `npm.cmd test -- tests/domain/fleet-config-conflict.test.ts tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts`，確認紅燈來自錯配或允許 force，不是 import／fixture 失敗。
- [ ] 實施上列純邏輯及 Controller context。classify／rename／delete 的衝突只提供刷新原對象／取消；只有 update 提供覆蓋，payload 使用 context.configId 與捕獲快照。force handler 再驗證 context，即使直接觸發事件也不能繞過 WXML。取消、成功、頁面 unload 都清 context。
- [ ] 綠燈：另測正常 update conflict force 仍能保存原配置；彈窗期間切換／修改本地狀態使舊 context 失效；owner／scope／CAS 原防護仍保持。DevTools 確認對象名稱及非 update 沒有「覆蓋雲端」。
- [ ] 按總計畫跑 final／verify，複核後提交確認。擬用 message：`fix: 綁定配置衝突操作與目標，防止誤覆蓋`。

## A2：登入延續與重試載入的未保存守衛（R02、R03）

**文件：** 修改兩個艦隊 `index.ts` 及 `tests/pages/fleet-page.test.ts`、`tests/pages/adventure-fleet-page.test.ts`。沿用 `serializeFleetState(state.fleet)`、`configOperationVersion`、`checkUnsavedAndProceed`，不修改 server。

**介面：** onAfterLogin 在 await 列表前捕獲艦隊快照／操作版本，回覆後重新檢查；onConfigRetry 使用 `{ type: 'load', targetConfigId }` 的原 pending action。每個測試文件使用既有 `createPageInstance()`；mock 名稱為戰鬥 `mockCallFunction`、冒險 `adventureMockCallFunction`。

- [ ] **紅燈：** 每頁各建 deferred 列表，不用任意 sleep；等待 `listMyConfigs` 已呼叫後，透過實際 `onModeTap({detail:{mode:'manual'}})` 或實際候選選人事件產生新草稿；回覆空／非空列表，都斷言草稿與 `unsaved` 保留、無新 load。

```ts
let resolveList!: (value: unknown) => void
const waitingList = new Promise((resolve) => {
  resolveList = resolve
})
// 在該頁既有 cloud mock 的 listMyConfigs 分支回傳 waitingList。
resolveList({ result: { ok: true, data: [] } })
// 登入延續完成後：
expect(page.data.mode).toBe('manual')
expect(page.data.configStatus).toBe('unsaved')
```

測試中的 `page` 是該文件 `createPageInstance()` 結果，紅燈前需完成 onLoad、authenticate 回應和合法 mode-tabs 事件；不可直接在 auto 模式呼叫不具實際入口的選人事件。

- [ ] 再建「首次 load 失敗 → 編輯 → retry」案例，斷言 `showUnsavedGuard=true` 且第二次 load 尚未發出；取消後草稿不變，保存／放棄後才重試原 retryLoadConfigId。
- [ ] 跑兩頁测试確認失敗，然後把登入延續改為：快照已變時停止自動 load/new，保留草稿並引导命名保存；所有重試 load 經原守衛。快照判斷在每個 await 延續點執行。
- [ ] 綠燈：空／非空列表、亂序列表、取消、保存後列表刷新、失敗後再次重試均驗證；原兩個 load 亂序回歸不得回退。
- [ ] final／verify 後提交確認；message：`fix: 保護登入與重試載入期間的配隊草稿`。

## A3：依 scope 還原保存基線並使放棄確實生效（R04、R05）

**文件：** 修改 `miniprogram/contracts/fleet-config.ts` 的 parseFleetState、兩頁 restoreSavedFleetState／onUnsavedGuardDiscard；修改 `tests/fleet-config/fleet-config-contract.test.ts` 及兩頁測試。

**新簽名：** `parseFleetState(encoded: string, scope: ClassifiedConfigScope = 'battle'): FleetState | null`，內部校驗傳 `getMaxTargetsPerShip(scope)`。兩頁顯式傳自己的 CONFIG_SCOPE，原其他呼叫仍預設 battle。

- [ ] **紅燈：** 以真 createFleetState／serializeFleetState 建 28、30 個不同 skillId 目標，冒險應可 parse；31 不可，battle 21 不可。最小 fixture：

```ts
const fleet = createFleetState()
fleet.ships[0]!.targets = Array.from({ length: 28 }, (_, i) => ({
  id: `target-${i}`,
  skillId: `skill_${i}`,
  targetLevel: 0,
}))
expect(parseFleetState(serializeFleetState(fleet), 'adventure')).toEqual(fleet)
```

- [ ] 兩頁行为紅燈：編輯 → load／delete pending → 放棄 → 服務失敗，頁面必須已還原基線，status／dirty 一致；再新建不用再次提示已確實放棄的內容。冒險預設 28 目標的另存／重命名「放棄」需還原 Lv.0。
- [ ] 實施 scope parse；對 load/new/delete/rename/saveAs 的「放棄」先成功還原本地基線，再 resolve pending。還原失敗則保留守衛、顯示可理解錯誤，不继续命名／載入。share 的既有「直接分享目前內容」語義保留，不混作丟棄操作。
- [ ] 跑 contract／兩頁模組綠燈，另測失敗後 retry、取消與 undo／proposal 清理；final／verify 後提交確認。message：`fix: 按配隊範圍還原基線並同步放棄狀態`。

## A4：戰鬥重算只使用正數目標（R06）

**文件：** 修改 `miniprogram/domain/battle-fleet.ts` 新增投影、`presenters/battle-fleet-presenter.ts`、`subpkg-fleet/pages/index/index.ts`；測試 domain、presenter、fleet-page。所用 `FleetTarget` 已定義於 contracts/battle-fleet.ts。

**選定語義：** 保留舊記錄 Lv.0 的形狀及顯示；Lv.0 代表本次不參與優化，不提升成 Lv.1、不刪目標、不拒絕原合法記錄。全零目標時禁用重算並説明需設定至少一個 Lv.1+ 目標；混合目標只送正數。此選擇避免為修崩潰而使舊配置不能載入。

```ts
export function getBattleOptimizationTargets(targets: readonly FleetTarget[]) {
  return targets.flatMap((target) =>
    target.skillId !== null && target.targetLevel > 0
      ? [{ skillId: target.skillId, targetLevel: target.targetLevel }]
      : [],
  )
}
```

- [ ] 紅燈測試上列投影（0／正數／null 混合），Presenter 全零 canRecalculate=false；直接呼叫 Controller 也不拋例外；混合正數仍產生提案。輸入非法負數／小數仍由原 contract／solver 防護，不擴大合法值。
- [ ] 跑 `npm.cmd test -- tests/domain/battle-fleet.test.ts tests/presenters/battle-fleet-presenter.test.ts tests/pages/fleet-page.test.ts`，實施投影並在 Presenter／Controller 共用。
- [ ] 綠燈後以離線合法舊配置驗證載入、分類、顯示、設正數及重算完整呼叫鏈；final／verify 後提交確認。message：`fix: 排除戰鬥零等級目標以避免重算崩潰`。
