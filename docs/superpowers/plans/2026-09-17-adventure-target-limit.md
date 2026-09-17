# 冒險配隊目標上限 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將冒險配隊的每船目標上限提高到 30，補回 5 個被初始化截掉的冒險技能，同時保持戰鬥配隊上限為 20。

**Architecture:** 保留共用戰鬥目標操作的 20 個預設上限，新增冒險專用 30 個上限。`updateShipTargets` 接受可選上限並預設 20；冒險 Domain 包裝為 30，頁面與配置校驗按 scope 使用對應值。Cloud Function 服務端同步按 `battle`／`adventure` 校驗，避免只修前端後保存失敗。

**Tech Stack:** TypeScript、Vitest、Cloud Function JavaScript、微信小程序頁面控制器。

## Global Constraints

- 所有代碼、測試、文檔與用戶交互使用中文；保留必要的英文 API、變數名與文件名。
- 不修改 `archive/`；不手動修改 `miniprogram/generated/`；本次不修改 `data/master/`。
- 不在 `miniprogram/` Runtime 新增 `wx.request`、`wx.cloud`、遠程 URL 或 Node.js API。
- 不新增、刪除或升級依賴；不修改與本任務無關的既有未提交文件。
- 分支使用 `codex/phase-29-adventure-target-limit`；提交前展示變更文件、驗證結果與擬用 message，等待用戶確認。

---

### Task 1: 先建立冒險 30 個目標邊界的失敗測試

**Files:**

- Modify: `tests/domain/adventure-fleet.test.ts`
- Modify: `tests/pages/adventure-fleet-page.test.ts`
- Modify: `tests/fleet-config/fleet-config-contract.test.ts`
- Modify: `tests/fleet-config/fleet-config-service.test.ts`
- Modify: `tests/runtime/fleet-config-service.test.ts`

**Interfaces:**

- Consumes: 現有 `createFleetState`、冒險頁測試頁面實例、Fleet Config service dispatch 與 CloudBase mock。
- Produces: 針對冒險 30 個目標上限、25 個預設技能與 scope 校驗的可執行紅測試。

- [x] **Step 1: 加入 Domain 紅測試。**

在 `tests/domain/adventure-fleet.test.ts` 建立 30 個唯一技能目標，斷言冒險專用更新函式接受 30 個但拒絕 31 個；不要改動既有戰鬥 Domain 的 21 個拒絕測試。

- [x] **Step 2: 加入冒險頁紅測試。**

將預設目標數斷言改為 25，並斷言 `skill_skillT0172`、`skill_skillT0173`、`skill_skillT0174`、`skill_skillT0175`、`skill_skillT0176` 都存在。將上限測試改為從 25 補到 30，再斷言第 31 個目標不開啟選擇器並顯示「每艘船最多設定 30 個目標」。

- [x] **Step 3: 加入客戶端 contract 紅測試。**

在 `tests/fleet-config/fleet-config-contract.test.ts` 建立 30 個目標的冒險狀態，斷言使用冒險上限校驗時有效；同一狀態使用預設 20 個上限時無效，保留戰鬥邊界。

- [x] **Step 4: 加入 Cloud Function 紅測試。**

在 `tests/fleet-config/fleet-config-service.test.ts` 透過 `createConfig` 斷言 adventure scope 接受 30 個目標、拒絕 31 個目標，battle scope 仍拒絕 21 個目標。

- [x] **Step 5: 加入客戶端 service 回應紅測試。**

在 `tests/runtime/fleet-config-service.test.ts` mock 一筆含 30 個目標的 `adventure` 配置記錄，斷言 `loadConfig('adventure', ...)` 成功返回；此測試必須在現有 20 個默認校驗下失敗。

- [x] **Step 6: 執行 focused tests 確認失敗原因正確。**

Run:

```powershell
npm.cmd test -- tests/domain/adventure-fleet.test.ts tests/pages/adventure-fleet-page.test.ts tests/fleet-config/fleet-config-contract.test.ts tests/fleet-config/fleet-config-service.test.ts tests/runtime/fleet-config-service.test.ts
```

Expected: FAIL，原因限定為冒險目前只接受 20 個目標、頁面只初始化 20 個目標，以及 scope 校驗尚未區分；不得因測試語法、fixture 或 import 錯誤失敗。

### Task 2: 實作冒險 Domain 與頁面 30 個目標上限

**Files:**

- Modify: `miniprogram/contracts/fleet-config.ts`
- Modify: `miniprogram/domain/battle-fleet.ts`
- Modify: `miniprogram/domain/adventure-fleet.ts`
- Modify: `miniprogram/pages/adventure-fleet/index.ts`

**Interfaces:**

- Consumes: Task 1 的冒險 30 個目標紅測試。
- Produces: `MAX_ADVENTURE_TARGETS_PER_SHIP = 30`、接受可選上限的 `updateShipTargets`，以及固定傳入 30 的冒險更新函式。

- [x] **Step 1: 新增冒險上限常量。**

在 `miniprogram/contracts/fleet-config.ts` 新增並導出 `MAX_ADVENTURE_TARGETS_PER_SHIP = 30`；保留從 `battle-fleet.ts` 導出的 `MAX_TARGETS_PER_SHIP = 20`。

- [x] **Step 2: 讓共用目標更新函式接受可選上限。**

將 `updateShipTargets(state, shipId, targets)` 改為增加 `maxTargets = MAX_TARGETS_PER_SHIP` 參數；未傳參數的戰鬥頁與既有呼叫保持 20 個限制。

- [x] **Step 3: 新增冒險 Domain 包裝函式。**

在 `miniprogram/domain/adventure-fleet.ts` 新增 `updateAdventureShipTargets(state, shipId, targets)`，內部呼叫共用 `updateShipTargets` 並傳入 `MAX_ADVENTURE_TARGETS_PER_SHIP`；保留既有共用函式導出以維持其他 import 相容。

- [x] **Step 4: 更新冒險頁所有目標寫入入口。**

將初始化、清理空目標、選擇技能、修改等級與刪除目標全部改用 `updateAdventureShipTargets`；頁面的截取上限、手動新增上限和錯誤文字改用 `MAX_ADVENTURE_TARGETS_PER_SHIP`。

- [x] **Step 5: 執行 Domain 與頁面 focused tests。**

Run:

```powershell
npm.cmd test -- tests/domain/adventure-fleet.test.ts tests/pages/adventure-fleet-page.test.ts
```

Expected: PASS；冒險頁初始化 25 個、最多 30 個，戰鬥既有測試仍保持通過。

### Task 3: 讓客戶端與 Cloud Function 配置校驗按 scope 分流

**Files:**

- Modify: `miniprogram/contracts/fleet-config.ts`
- Modify: `miniprogram/runtime/fleet-config-service.ts`
- Modify: `cloudfunctions/fleet-config/fleet-config-service.js`

**Interfaces:**

- Consumes: `MAX_ADVENTURE_TARGETS_PER_SHIP` 與 Task 2 的 30 個目標狀態。
- Produces: adventure 配置在 create/load/update/save 與客戶端回應驗證中接受 30 個，battle 與未分類維持 20 個。

- [x] **Step 1: 讓客戶端 FleetState 校驗接受指定上限。**

為 `isValidFleetState` 與 `isValidSerializedFleetState` 增加預設為 20 的 `maxTargetsPerShip` 參數，並讓內層 ship 校驗使用該值；新增按 `ConfigScope` 返回上限的純函式，`adventure` 返回 30，其餘返回 20。

- [x] **Step 2: 更新客戶端配置記錄校驗。**

`miniprogram/runtime/fleet-config-service.ts` 的 `isValidFleetConfigRecord` 使用記錄 scope 對應的上限呼叫 `isValidFleetState`，使 30 個目標的冒險回應不被客戶端誤判為網路錯誤。

- [x] **Step 3: 更新 Cloud Function scope 校驗。**

在 `cloudfunctions/fleet-config/fleet-config-service.js` 新增 adventure 上限常量與 scope 上限函式；讓 create、load、update、saveAs 的 `isValidFleetState` 使用已驗證 scope 的上限。保留 battle 的 20 個上限與原有錯誤碼。

- [x] **Step 4: 執行配置 focused tests。**

Run:

```powershell
npm.cmd test -- tests/fleet-config/fleet-config-contract.test.ts tests/fleet-config/fleet-config-service.test.ts tests/runtime/fleet-config-service.test.ts
```

Expected: PASS；scope 邊界與客戶端回應校驗均符合 20/30 分流。

### Task 4: 全量驗證與變更檢查

**Files:**

- Test only: repository verification commands; do not modify generated data.

- [x] **Step 1: 檢查只修改任務範圍文件。**

Run `git status --short` and confirm the pre-existing `project.config.json`、`artifacts/`、`docs/superpowers/plans/2026-09-16-officer-avatar-visual-convention.md` remain untouched by this task。

- [x] **Step 2: 執行完整驗證。**

Run:

```powershell
npm.cmd run verify
```

Expected: format、lint、typecheck、test、runtime-network、size、assets、data、generate 全部通過；若既有未提交內容造成 diff 或格式檢查影響，記錄並停止，不重寫無關文件。

- [x] **Step 3: Review diff and prepare handoff.**

Run `git diff --check`、`git diff --stat` and `git status --short`。展示變更文件、驗證結果與擬用 commit message `feat: 提高冒險配隊目標上限`，等待用戶確認後才執行 `git add` 或 `git commit`。
