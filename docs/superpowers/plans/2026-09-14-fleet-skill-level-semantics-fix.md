# 配隊技能等級語義修復 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓戰鬥與冒險配隊的目標、摘要及 Solver 只累加 canonical 技能等級，不再把航海士解鎖等級當作技能貢獻。

**Architecture:** 在配隊專用運行資料關係中同時投影 `level` 與 `unlockLevel`，保持兩者語義分離。所有配隊計算改讀 `level`；`unlockLevel` 僅保留為解鎖條件資料。生成檔只由資料管線更新。

**Tech Stack:** TypeScript、Vitest、微信小程序離線生成資料。

## Global Constraints

- `archive/` 不可修改；`data/master/` 是唯一可手動維護資料源；`miniprogram/generated/` 與配隊生成檔禁止手動修改。
- 不新增、刪除或升級依賴。
- 不修改 UI、WXML 或 WXSS。
- 配隊技能貢獻只使用 `skills[].level`，不得回退至 `unlockLevel`。
- 修改後執行相關 Vitest、`npm run data:check`、`npm run generate:check` 與 `npm run verify`。

---

### Task 1: 以測試鎖定正確語義

**Files:**
- Modify: `tests/data-pipeline/build-runtime-data.test.ts`
- Modify: `tests/domain/battle-fleet.test.ts`
- Modify: `tests/domain/battle-fleet-solver.test.ts`
- Modify: `tests/domain/adventure-fleet.test.ts`
- Modify: `tests/domain/adventure-fleet-solver.test.ts`

**Interfaces:**
- Consumes: `buildFleetOfficers`、`summarizeShipSkills`、`solveBattleTargets`、`deriveAdventureOfficers`、`summarizeFleetAdventureSkills`、`solveAdventureTargets`。
- Produces: 回歸測試，證明 `level: 2, unlockLevel: 50` 的關係只貢獻 2。

- [ ] **Step 1: 寫入失敗測試**

  為生成資料與四條配隊計算路徑加入具備不同 `level`／`unlockLevel` 的實際輸入，使用手算常數斷言結果為技能等級總和。

- [ ] **Step 2: 執行測試並確認 RED**

  Run: `npm test -- --run tests/data-pipeline/build-runtime-data.test.ts tests/domain/battle-fleet.test.ts tests/domain/battle-fleet-solver.test.ts tests/domain/adventure-fleet.test.ts tests/domain/adventure-fleet-solver.test.ts`

  Expected: FAIL，實際值仍為 50 或生成關係缺少 `level`。

### Task 2: 修正配隊運行資料與計算

**Files:**
- Modify: `miniprogram/contracts/runtime-data.ts`
- Modify: `tools/data-pipeline/build-runtime-data.ts`
- Modify: `miniprogram/domain/battle-fleet.ts`
- Modify: `miniprogram/domain/battle-fleet-solver.ts`
- Modify: `miniprogram/domain/adventure-fleet.ts`
- Modify: `miniprogram/domain/adventure-fleet-solver.ts`

**Interfaces:**
- Consumes: canonical `skills[].level` 與 `skills[].unlockLevel`。
- Produces: `RuntimeFleetSkillRelation.level: number`，以及所有配隊路徑一致的技能等級累加行為。

- [ ] **Step 1: 最小實作**

  在 `RuntimeFleetSkillRelation` 及 `buildFleetOfficers` 加入 `level`；冒險派生關係改讀 `entry.skillLevels`；摘要、目前值及候選貢獻改累加 `relation.level`。

- [ ] **Step 2: 執行相關測試並確認 GREEN**

  Run: `npm test -- --run tests/data-pipeline/build-runtime-data.test.ts tests/domain/battle-fleet.test.ts tests/domain/battle-fleet-solver.test.ts tests/domain/adventure-fleet.test.ts tests/domain/adventure-fleet-solver.test.ts`

  Expected: PASS。

### Task 3: 重新生成並完整驗證

**Files:**
- Regenerate: `miniprogram/subpkg-fleet/generated/fleet-officers.js`

**Interfaces:**
- Consumes: 修正後資料生成器與 `data/master/`。
- Produces: 同時含 `level`、`unlockLevel` 的配隊離線資料。

- [ ] **Step 1: 重新生成資料**

  Run: `npm run data:generate`

- [ ] **Step 2: 執行資料與生成門禁**

  Run: `npm run data:check`

  Run: `npm run generate:check`

- [ ] **Step 3: 執行完整驗證**

  Run: `npm run verify`

  Expected: 所有門禁 PASS，且配隊生成資料中的技能 `level` 與 canonical 一致。
