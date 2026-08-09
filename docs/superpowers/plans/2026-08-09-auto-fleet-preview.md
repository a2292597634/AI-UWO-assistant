# 自動配隊預覽 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution requested by the user). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在戰鬥與冒險配隊頁建立不可變 Proposal、差異預覽、明確應用、取消與一次完整撤銷流程。

**Architecture:** Solver 純函式輸出 `FleetProposal`；共用 Proposal Presenter 將結果投影成目標、技能、成員和約束差異；兩個 Page Controller 只在應用事件中使用既有不可變 Fleet transition 寫入狀態，並保存一次完整快照作撤銷。

**Tech Stack:** TypeScript、Vitest、微信小程序 WXML/WXSS、既有 FleetState 與配置服務；不新增依賴、不新增網路請求。

## Global Constraints

- 所有 UI 文案、程式碼註釋、測試和文件使用中文；必要專有名詞與 API 名稱保留英文。
- 不修改 `archive/`、`data/master/` 或 `miniprogram/generated/`。
- 不新增、刪除或升級依賴，不新增 `wx.request`、`wx.cloud`、遠端 URL 或 Node.js Runtime API。
- 工作分支固定為 `codex/phase-2-自動配隊預覽`，基線為 `origin/codex/phase-1-冒險配隊安全護欄` 的 `167ae7b`。
- 保留既有配置保存、未保存攔截、版本衝突、Cloud Function 呼叫與版本欄位。
- Solver、Proposal、差異計算與套用策略遵循紅–綠–重構；每個新行為先建立失敗測試並確認預期失敗。
- 自動方案不得在計算或打開預覽時修改目前 FleetState；只有「應用方案」才可寫入。
- 無解、容量不足或鎖定衝突不得靜默清空現有非鎖定成員。
- 本 Change 不實作全域 Design System、配色、大規模視覺重構或 Change 3 以後內容。

---

### Task 1: 建立 FleetProposal 契約、快照與安全套用核心

**Files:**
- Create: `miniprogram/contracts/fleet-proposal.ts`
- Create: `miniprogram/domain/fleet-proposal.ts`
- Test: `tests/domain/fleet-proposal.test.ts`

**Interfaces:**
- `FleetProposal`：包含 `source`、`shipId`、`baseStateFingerprint`、`officerIds`、`beforeTargetLevels`、`targetProgress`、`constraints`、`canApply`、`achievedTargetCount`、`allTargetsComplete`。
- `createFleetProposal(input)`：複製並深層凍結 Proposal，不修改輸入。
- `cloneFleetState(state)`：返回完整 FleetState 複製值。
- `fleetStateFingerprint(state)`：用既有序列化契約產生穩定基線指紋。
- `applyBattleProposal(state, proposal)`：只套用指定船，返回 `FleetTransitionResult`。
- `applyAdventureProposal(state, proposal)`：只在安全條件通過時依序保留鎖定成員、清理非鎖定成員和分配方案，返回 `FleetTransitionResult`。

- [ ] **Step 1: 寫 Proposal 不可變與輸入不變的失敗測試**

```ts
it('creates a frozen proposal without changing input arrays', () => {
  const officerIds = ['officer-a']
  const progress = [{ skillId: 'skill-a', targetLevel: 2, currentLevel: 1, difference: 1, reached: false }]
  const proposal = createFleetProposal({
    source: 'battle', shipId: 'ship-1', baseStateFingerprint: 'base', officerIds,
    targetProgress: progress, achievedTargetCount: 0, allTargetsComplete: false,
    constraints: [], canApply: true,
  })

  expect(Object.isFrozen(proposal)).toBe(true)
  expect(proposal.officerIds).toEqual(['officer-a'])
  officerIds.push('officer-b')
  progress[0]!.difference = 0
  expect(proposal.officerIds).toEqual(['officer-a'])
  expect(proposal.targetProgress[0]!.difference).toBe(1)
})
```

- [ ] **Step 2: 執行測試確認 API 尚不存在而正確失敗**

Run: `npm.cmd test -- tests/domain/fleet-proposal.test.ts`

Expected: FAIL，原因是 `FleetProposal` 契約與 `createFleetProposal` 尚不存在。

- [ ] **Step 3: 寫應用前不改狀態與套用後恢復完整快照的失敗測試**

```ts
it('applies a battle proposal only when requested and restores the complete snapshot', () => {
  let state = addOfficerToShip(createFleetState(), 'ship-1', 'locked').state
  state = lockOfficer(state, 'ship-1', 'locked').state
  state = addOfficerToShip(state, 'ship-1', 'old').state
  state = banOfficer(state, 'banned').state
  const before = cloneFleetState(state)
  const proposal = createFleetProposal({
    source: 'battle', shipId: 'ship-1', baseStateFingerprint: fleetStateFingerprint(state),
    officerIds: ['locked', 'new'], targetProgress: [], achievedTargetCount: 0,
    allTargetsComplete: true, constraints: [], canApply: true,
  })

  expect(state).toEqual(before)
  const applied = applyBattleProposal(state, proposal)
  expect(applied.error).toBeUndefined()
  expect(applied.state.ships[0]!.officerIds).toEqual(['locked', 'new'])
  expect(before.ships[0]!.officerIds).toEqual(['locked', 'old'])
})
```

- [ ] **Step 4: 實作最小契約、複製、指紋與套用函式**

使用既有 `serializeFleetState`/`parseFleetState` 契約，將所有陣列與巢狀物件複製後再 `Object.freeze`。套用函式先驗證 `canApply`、Proposal source、基線指紋、鎖定成員與容量，再呼叫既有 `recalculateShip`/`addOfficerToShip`；任何錯誤返回原 state。

- [ ] **Step 5: 執行 Proposal focused tests 確認通過**

Run: `npm.cmd test -- tests/domain/fleet-proposal.test.ts`

Expected: PASS；應用前 state 保持一致，套用後僅在明確呼叫時變更，快照資料完整保留。

### Task 2: 讓戰鬥與冒險 Solver 輸出 Proposal 和約束

**Files:**
- Modify: `miniprogram/domain/battle-fleet-solver.ts`
- Modify: `miniprogram/domain/adventure-fleet-solver.ts`
- Modify: `tests/domain/battle-fleet-solver.test.ts`
- Modify: `tests/domain/adventure-fleet-solver.test.ts`

**Interfaces:**
- `solveBattleTargets(input): BattleFleetProposal`，保留現有 `officerIds`、`targetProgress` 等欄位，新增 Proposal source、基線指紋、`beforeTargetLevels`、約束與 `canApply`；輸入可帶 `baseStateFingerprint`。
- `solveAdventureTargets(input): AdventureFleetProposal`，保留 Phase 1 的 Lv.0 過濾，新增相同 Proposal 欄位；輸入可帶 `baseStateFingerprint`。
- 兩個 Solver 都必須對輸入 officers、targets、鎖定和排除陣列只讀，不呼叫 FleetState transition。

- [ ] **Step 1: 寫 Solver 不修改輸入、鎖定保留和無解原因的失敗測試**

新增案例：深複製 input 後呼叫兩個 Solver，斷言 input 相等；容量小於鎖定數時斷言 Proposal 保留全部鎖定 ID、`canApply` 為 false 並包含容量約束；沒有候選完成目標時斷言 `targetProgress` 列出差異且 `constraints` 有未達成原因。

- [ ] **Step 2: 執行兩個 Solver 測試確認新欄位缺失而失敗**

Run: `npm.cmd test -- tests/domain/battle-fleet-solver.test.ts tests/domain/adventure-fleet-solver.test.ts`

Expected: FAIL，原因是結果尚未包含 Proposal source、不可應用狀態、基線資訊或約束。

- [ ] **Step 3: 實作最小 Proposal 結果與約束推導**

保留既有 DP/貪心選擇與既有欄位。增加鎖定、容量、部分達成和無候選約束；不再截斷鎖定成員作為可應用結果。用 `createFleetProposal` 返回複製/凍結結果，對部分可改善結果允許預覽，對不能安全套用結果設 `canApply: false`。

- [ ] **Step 4: 執行戰鬥/冒險 Solver 與既有回歸測試**

Run: `npm.cmd test -- tests/domain/battle-fleet-solver.test.ts tests/domain/adventure-fleet-solver.test.ts tests/domain/battle-fleet.test.ts tests/presenters/adventure-fleet-presenter.test.ts`

Expected: PASS；既有求解排序、Lv.0 語義、鎖定與部分進度測試保持通過。

### Task 3: 建立共用 Proposal Presenter

**Files:**
- Create: `miniprogram/presenters/fleet-proposal-presenter.ts`
- Test: `tests/presenters/fleet-proposal-presenter.test.ts`

**Interfaces:**
- `FleetProposalPreviewView`：包含目標統計、`targetDiffs`、`keptOfficers`、`addedOfficers`、`removedOfficers`、`lockedOfficers`、`lockedAllRetained`、`constraints`、`canApply`。
- `buildFleetProposalPreview(state, proposal, officers, skills)`：純函式，不寫入 state。

- [ ] **Step 1: 寫差異 Presenter 的失敗測試**

建立兩名保留/新增/移除航海士、兩個技能目標和一名鎖定成員的 fixture，斷言保留/新增/移除名單、目標 `currentLevel`/`proposedLevel`/`difference`、達成數與鎖定保留狀態正確。

- [ ] **Step 2: 執行 Presenter 測試確認 API 尚不存在而失敗**

Run: `npm.cmd test -- tests/presenters/fleet-proposal-presenter.test.ts`

Expected: FAIL，原因是共用 Presenter 尚不存在。

- [ ] **Step 3: 實作純差異投影**

使用 Proposal officerIds 與目前 FleetState 的作用範圍計算集合差異；使用 Proposal 的基線/預期進度產生技能差異；以現有 runtime 名稱和技能字典填充 View；約束全部保留繁體中文訊息。

- [ ] **Step 4: 執行 Presenter 測試確認通過**

Run: `npm.cmd test -- tests/presenters/fleet-proposal-presenter.test.ts`

Expected: PASS，Presenter 不改變輸入並完整輸出預覽所需欄位。

### Task 4: 戰鬥 Controller 接入預覽、取消、應用與一次撤銷

**Files:**
- Modify: `miniprogram/pages/fleet/index.ts`
- Modify: `miniprogram/pages/fleet/index.wxml`
- Modify: `miniprogram/pages/fleet/index.wxss`
- Modify: `tests/pages/fleet-page.test.ts`

**Interfaces:**
- Page data 新增 `proposalPreview: FleetProposalPreviewView | null`、`canUndoProposal: boolean`。
- Page handlers 新增 `onProposalCancel()`、`onProposalApply()`、`onUndoProposal()`。
- `onRecalculate()` 只生成 Proposal 和 Presenter View，不再呼叫 `applyResult`。

- [ ] **Step 1: 先加入 Controller 紅燈測試**

加入以下案例：計算前後 `currentShip` 與 `configStatus` 序列化一致；取消前後完整 `page.data` 業務欄位一致；應用後成員替換正確且 dirty；撤銷後包含目標、鎖定、排除、封禁和其他船的完整狀態都等於應用前快照；不可應用 Proposal 顯示約束且不變更成員。

- [ ] **Step 2: 執行戰鬥 Page 測試確認目前直接應用行為失敗**

Run: `npm.cmd test -- tests/pages/fleet-page.test.ts`

Expected: FAIL，原因是計算目前直接更新成員，沒有 `proposalPreview`、取消、應用和撤銷 handlers。

- [ ] **Step 3: 實作 Controller 狀態與事件**

在 Page state 保存 Proposal、預覽 View 和一次 `undoFleetState`。計算僅 `setData` 預覽；取消清除預覽；應用驗證基線並透過 `applyBattleProposal` 寫入，保存快照、更新 dirty 和 render；撤銷恢復快照並清除撤銷入口。保留所有配置方法和版本流程。

- [ ] **Step 4: 實作戰鬥預覽 WXML/WXSS**

新增同一套預覽結構：標題、達成數、技能差異、保留/新增/移除、鎖定標記、約束提示、`取消`、`應用方案` 和一次 `撤銷本次配隊`；固定底部區加入 `env(safe-area-inset-bottom)`，不修改既有主題與其他布局。

- [ ] **Step 5: 執行戰鬥 Page focused tests**

Run: `npm.cmd test -- tests/pages/fleet-page.test.ts tests/presenters/fleet-proposal-presenter.test.ts tests/domain/fleet-proposal.test.ts`

Expected: PASS；計算/取消不變更業務狀態，應用與撤銷行為符合快照。

### Task 5: 冒險 Controller 接入同一預覽事務

**Files:**
- Modify: `miniprogram/pages/adventure-fleet/index.ts`
- Modify: `miniprogram/pages/adventure-fleet/index.wxml`
- Modify: `miniprogram/pages/adventure-fleet/index.wxss`
- Modify: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- 冒險 Page data 同樣新增 `proposalPreview`、`canUndoProposal`；handlers 與戰鬥一致。
- `onRecalculate()` 只生成全艦隊 Proposal；冒險應用保留所有鎖定成員並依現有容量策略分配。

- [ ] **Step 1: 先加入冒險 Controller 紅燈測試**

加入案例：生成方案不變更所有船成員；取消不變更目標、鎖定、排除和 dirty；應用後全艦隊成員正確；撤銷恢復完整 FleetState；無候選方案不清空非鎖定成員；鎖定成員在預覽和應用後都保留；目標差異與新增/移除名單正確顯示。

- [ ] **Step 2: 執行冒險 Page 測試確認目前直接應用行為失敗**

Run: `npm.cmd test -- tests/pages/adventure-fleet-page.test.ts`

Expected: FAIL，原因是 `onRecalculate` 目前會直接清空非鎖定成員，且沒有統一 Proposal 预览状态。

- [ ] **Step 3: 實作冒險 Controller 事務與撤銷**

沿用 Phase 1 的 Lv.0/無有效目標護欄；有效目標只生成預覽。應用時才呼叫冒險套用策略；若基線已變更或 Proposal 不可應用，顯示原因並保持原狀態。撤銷只允許一次並恢復所有船的完整快照。

- [ ] **Step 4: 複用預覽結構並保留既有配置流程**

在冒險頁加入與戰鬥頁欄位一致的預覽 WXML/WXSS，顯示全艦隊範圍與鎖定狀態；不新增依賴，不修改配置服務和 Cloud Function。

- [ ] **Step 5: 執行冒險 Page focused tests**

Run: `npm.cmd test -- tests/pages/adventure-fleet-page.test.ts tests/presenters/fleet-proposal-presenter.test.ts tests/domain/fleet-proposal.test.ts`

Expected: PASS；計算/取消不改艦隊，應用/撤銷和無解安全護欄通過。

### Task 6: focused regression、完整門禁與範圍檢查

**Files:**
- Inspect: all changed files from Tasks 1–5

- [ ] **Step 1: 執行 Proposal/solver/presenter/page focused suite**

Run: `npm.cmd test -- tests/domain/fleet-proposal.test.ts tests/domain/battle-fleet-solver.test.ts tests/domain/adventure-fleet-solver.test.ts tests/presenters/fleet-proposal-presenter.test.ts tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts`

Expected: PASS，無未處理錯誤或警告。

- [ ] **Step 2: 執行完整驗證**

Run: `npm.cmd run verify`

Expected: exit code 0；記錄 format、lint、typecheck、test、runtime-network、data:check 和 generate:check 結果。

- [ ] **Step 3: 檢查 diff 範圍與網路邊界**

Run: `git status --short`; `git diff --check`; `git diff --name-only -- archive data/master miniprogram/generated`; `npm.cmd run check:runtime-network`

Expected: 禁止目錄沒有變更，無新增網路或 Node.js Runtime API，變更僅限 Proposal、Solver、Presenter、兩個配隊頁、相關測試與本 Change 文件。

- [ ] **Step 4: 執行微信 DevTools 驗收並保存結果**

在微信 DevTools 驗證戰鬥與冒險頁的計算、預覽、取消、應用、一次撤銷；檢查 320/375/393/430px、Home Indicator 安全區、長名單和無解提示。記錄實際結果與截圖位置，不以自動化測試代替真機/DevTools 驗收。

## 提交前停點

完成所有實作與驗證後不執行 `git commit`。先展示：

1. 變更文件清單與 diff 摘要；
2. focused tests 與 `npm run verify` 實際結果；
3. 微信 DevTools 預覽、取消、應用、撤銷驗收結果及四種寬度/安全區記錄；
4. 擬用 Commit Message：`feat: 建立自動配隊方案預覽與撤銷流程`。

等待使用者明確確認後才 commit。
