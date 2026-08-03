# 戰鬥模擬艦隊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在微信小程序中新增單頁「戰鬥模擬艦隊」工作台，管理 7 艘船、77 個全局去重船位，支援逐船手動/自動配隊、戰鬥技能累計與確定性目標求解。

**Architecture:** `data/master/` 是唯一資料來源，由 pipeline 生成主包使用的 `fleet-officers.js` 輕量索引；`main-data-store` 是生成資料唯一入口。純 TypeScript domain 負責艦隊狀態、戰鬥技能篩選、技能摘要、容量/衝突驗證及自動求解，presenter 將 domain 狀態投影成 WXML 視圖，頁面只處理本地互動和 `setData`。

**Tech Stack:** TypeScript 6、Vitest、微信小程序 TypeScript/WXML/WXSS、既有 `tsx` data pipeline；不新增依賴。

## Global Constraints

- `archive/` 只讀；所有資料加工只在 `data/master/` 與生成工具完成。
- `miniprogram/generated/` 只能由 `npm run data:generate` 生成，禁止手動修改。
- 不在 `miniprogram/` 運行時代碼使用 `wx.request`、`wx.cloud`、遠端 URL 或 Node.js API。
- 艦隊固定 7 艘船，每船最多 11 位航海士，全艦隊最多 77 個位置，同一航海士 ID 全局只能出現一次。
- 技能貢獻使用 `unlockLevel`，船上累計不封頂，技能行按真實累計值降序並以穩定技能 ID/名稱排序。
- 自動目標等級只接受 Lv.1 至 Lv.10；無有效目標時不自動填入無關航海士。
- 介面與資料只使用繁體中文；不順手修復範圍外問題，不新增/刪除/升級依賴。
- 在目標分支 `codex/phase-5-battle-fleet-simulator` 工作；commit 前展示變更文件、驗證結果和擬用 message，等待用戶確認。

---

### Task 1: 建立艦隊 runtime 索引契約與生成器

**Files:**
- Modify: `miniprogram/contracts/runtime-data.ts`
- Modify: `miniprogram/runtime/generated-modules.d.ts`
- Modify: `tools/data-pipeline/build-runtime-data.ts`
- Modify: `tools/data-pipeline/generate.ts`
- Modify: `miniprogram/runtime/main-data-store.ts`
- Test: `tests/data-pipeline/build-runtime-data.test.ts`
- Test: `tests/data-pipeline/full-data-integrity.test.ts`

**Interfaces:**
- `RuntimeFleetSkillRelation = { skillId: string; kind: 'active' | 'passive'; categoryId: string; unlockLevel: number }`。
- `RuntimeFleetOfficer = { id: string; name: string; jobName: string; rarityName: string; portraitPath: string; skills: RuntimeFleetSkillRelation[] }`。
- `buildFleetOfficers(officers, skills, dictionaries): RuntimeFleetOfficer[]` 只投影戰鬥主動與戰鬥被動關係，依 officer 原順序輸出，並以 `unlockLevel` 原值輸出。
- `getFleetOfficers(): readonly RuntimeFleetOfficer[]` 從生成的 `fleet-officers` 讀取。

- [ ] **Step 1: Write the failing generator and runtime contract tests**

```ts
it('builds a compact fleet index with battle relations and unlockLevel', () => {
  const index = buildFleetOfficers(officers, skills, dictionaries)
  const officer = index.find((item) => item.id === 'officer_chast089')!
  const relation = officer.skills.find((item) => item.skillId === 'skill_skill203426')!

  expect(officer.portraitPath).toMatch(/^\/subpkg-a\d\/imgs\/officer_/)
  expect(relation).toMatchObject({
    skillId: 'skill_skill203426',
    kind: 'passive',
    unlockLevel: 2,
  })
  expect(officer.skills.every((item) =>
    item.categoryId.startsWith('skill_category_naval_') || item.categoryId === 'skill_category_combat_other',
  )).toBe(true)
})

it('keeps fleet index deterministic and complete for master data', () => {
  const first = buildFleetOfficers(officers, skills, dictionaries)
  const second = buildFleetOfficers(officers, skills, dictionaries)
  expect(second).toEqual(first)
  expect(new Set(first.map((item) => item.id)).size).toBe(officers.length)
})
```

- [ ] **Step 2: Run the focused tests and verify they fail for the missing API**

Run: `npm test -- tests/data-pipeline/build-runtime-data.test.ts tests/data-pipeline/full-data-integrity.test.ts`

Expected: FAIL because `buildFleetOfficers` and the fleet runtime contract do not exist yet.

- [ ] **Step 3: Implement the smallest data projection and runtime store bridge**

Add the battle-category predicate in `build-runtime-data.ts`, project only battle relations with `skillId`, `kind`, `categoryId`, and `unlockLevel`, write `fleet-officers.js` from `writeRuntimeData`, and add its typed CommonJS declaration plus `getFleetOfficers()` in `main-data-store.ts`. The generator entry point continues reading only `data/master/`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- tests/data-pipeline/build-runtime-data.test.ts tests/data-pipeline/full-data-integrity.test.ts && npm run typecheck`

Expected: PASS with no new TypeScript errors.

- [ ] **Step 5: Refactor only generated-index helpers while tests remain green**

Keep the category predicate and projection deterministic, avoid changing existing catalog/detail output, then rerun the same focused tests.

### Task 2: Implement pure battle-skill query and ship summary domain

**Files:**
- Create: `miniprogram/domain/battle-fleet.ts`
- Create: `miniprogram/contracts/battle-fleet.ts`
- Test: `tests/domain/battle-fleet.test.ts`

**Interfaces:**
- `FLEET_SHIP_COUNT = 7`, `SHIP_OFFICER_CAPACITY = 11`, `FLEET_OFFICER_CAPACITY = 77`。
- `createFleetState(): FleetState` creates 7 empty ships, each `mode: 'manual'`, and an empty global `bannedOfficerIds` set represented as arrays.
- `isBattleFleetSkill(relation): boolean` recognizes all `naval_active_*`, `naval_passive_*`, and `combat_other` relations.
- `filterBattleSkills(skills, filters): BattleSkillOption[]` applies type → category → current-category text search, returning only battle skills in stable ID order.
- `summarizeShipSkills(shipOfficerIds, officersById, skillsById, targetBySkillId): ShipSkillSummary[]` sums `unlockLevel` without a cap, includes target-only zero rows, includes contributor officer IDs, sorts by total descending then skill ID.
- `getShipStatus(ship, summaries): 'empty' | 'editing' | 'complete' | 'incomplete-target' | 'needs-review'` derives status without mutating state.

- [ ] **Step 1: Write failing domain tests for capacity, deduplication, filtering, unlockLevel, sorting, and zero rows**

```ts
it('creates seven ships and rejects the twelfth officer on one ship', () => {
  const state = createFleetState()
  const filled = Array.from({ length: 11 }, (_, index) => `officer_${index}`)
    .reduce((current, officerId) => addOfficerToShip(current, 'ship-1', officerId).state, state)
  const result = addOfficerToShip(filled, 'ship-1', 'officer_11')

  expect(filled.ships).toHaveLength(7)
  expect(result.error).toBe('ship-full')
})

it('rejects an officer already used by another ship', () => {
  const state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-1').state
  expect(addOfficerToShip(state, 'ship-2', 'officer-1').error).toBe('officer-occupied')
})

it('filters only battle active/passive skills through three levels', () => {
  const result = filterBattleSkills(sampleSkills, {
    kind: 'passive', categoryId: 'skill_category_naval_passive_cannon', searchText: '炮',
  })
  expect(result.map((item) => item.id)).toEqual(['skill-cannon-passive'])
})

it('sums unlockLevel, keeps values above ten, sorts, and shows target-only Lv.0', () => {
  const result = summarizeShipSkills(
    ['officer-a', 'officer-b', 'officer-c'], sampleOfficers, sampleSkills,
    { 'skill-target-only': 3 },
  )
  expect(result[0]).toMatchObject({ skillId: 'skill-main', totalLevel: 12 })
  expect(result[0]!.contributorOfficerIds).toEqual(['officer-a', 'officer-c'])
  expect(result.find((item) => item.skillId === 'skill-target-only')).toMatchObject({ totalLevel: 0 })
})
```

- [ ] **Step 2: Run the domain tests and verify the expected missing-symbol failures**

Run: `npm test -- tests/domain/battle-fleet.test.ts`

Expected: FAIL because the fleet contracts and pure functions are not implemented.

- [ ] **Step 3: Implement minimal immutable fleet state and summary functions**

Use copied arrays for every state transition. Reject duplicate fleet membership, full ships, banned officers, and occupied officers. Keep target levels constrained to 1–10, but let summary totals exceed 10. Include all selected battle relations as contributors and add valid target-only rows with zero totals.

- [ ] **Step 4: Run focused tests and verify green**

Run: `npm test -- tests/domain/battle-fleet.test.ts`

Expected: PASS with all capacity, deduplication, filtering, unlockLevel, ordering, and zero-target assertions green.

- [ ] **Step 5: Refactor naming and stable ordering only**

Keep domain functions free of `wx`, `Page`, generated-file imports, and filesystem access; rerun the focused tests.

### Task 3: Implement deterministic auto-assignment solver

**Files:**
- Create: `miniprogram/domain/battle-fleet-solver.ts`
- Test: `tests/domain/battle-fleet-solver.test.ts`

**Interfaces:**
- `solveBattleTargets(input: AutoSolveInput): AutoSolveResult` where input contains `officers`, valid `targets`, `lockedOfficerIds`, `excludedOfficerIds`, `occupiedByOtherShips`, `currentOfficerIds`, and `capacity`.
- Result contains `officerIds`, `achievedTargetCount`, `allTargetsComplete`, `targetProgress`, and `overageTotal`.

- [ ] **Step 1: Write failing tests for target validation, locks, bans, capacity, and lexicographic tie-breaking**

```ts
it('keeps locked officers and excludes other ships, banned, and removed candidates', () => {
  const result = solveBattleTargets({
    officers: sampleOfficers,
    targets: [{ skillId: 'skill-cannon', targetLevel: 2 }],
    lockedOfficerIds: ['officer-locked'],
    excludedOfficerIds: ['officer-removed', 'officer-banned'],
    occupiedByOtherShips: ['officer-other-ship'],
    currentOfficerIds: ['officer-locked'],
    capacity: 11,
  })
  expect(result.officerIds).toContain('officer-locked')
  expect(result.officerIds).not.toEqual(expect.arrayContaining(['officer-removed', 'officer-banned', 'officer-other-ship']))
})

it('prefers more completed targets, then fewer officers, lower overage, then IDs', () => {
  const result = solveBattleTargets({
    officers: tieBreakOfficers,
    targets: [{ skillId: 'skill-cannon', targetLevel: 2 }, { skillId: 'skill-melee', targetLevel: 2 }],
    lockedOfficerIds: [], excludedOfficerIds: [], occupiedByOtherShips: [], currentOfficerIds: [], capacity: 11,
  })
  expect(result.officerIds).toEqual(['officer-combined'])
  expect(result.allTargetsComplete).toBe(true)
})

it('returns an empty recommendation for no valid targets and restricts levels to one through ten', () => {
  expect(solveBattleTargets({ ...emptyInput, targets: [] }).officerIds).toEqual([])
  expect(() => solveBattleTargets({ ...emptyInput, targets: [{ skillId: 'skill-cannon', targetLevel: 11 }] })).toThrow('target-level')
})
```

- [ ] **Step 2: Run solver tests and verify they fail before implementation**

Run: `npm test -- tests/domain/battle-fleet-solver.test.ts`

Expected: FAIL because `solveBattleTargets` is not defined.

- [ ] **Step 3: Implement candidate filtering, scoring, and deterministic search**

Start with locked officers, filter all candidates by current-ship availability and battle target contribution, and never exceed capacity. Score by completed target count descending; when all targets are complete, prefer fewer officers, then lower total excess, then lexicographically sorted officer IDs. Use a seeded deterministic greedy result for pruning, branch on target-relevant candidates with a capacity-aware upper bound, and use a deterministic greedy fallback for very large candidate unions so the real 627-officer dataset remains responsive. No random ordering, remote calls, or implicit filling when targets are empty.

- [ ] **Step 4: Run focused solver tests and the full domain suite**

Run: `npm test -- tests/domain/battle-fleet-solver.test.ts tests/domain/battle-fleet.test.ts`

Expected: PASS with deterministic repeated results.

- [ ] **Step 5: Refactor search helpers without changing score semantics**

Keep scoring and candidate exclusion testable as pure helpers; rerun both focused test files.

### Task 4: Implement fleet state transitions and conflict semantics

**Files:**
- Modify: `miniprogram/domain/battle-fleet.ts`
- Test: `tests/domain/battle-fleet.test.ts`

**Interfaces:**
- `addOfficerToShip(state, shipId, officerId): TransitionResult` returns `officer-occupied` with `fromShipId` when explicit confirmation is required.
- `moveOfficerToShip(state, fromShipId, toShipId, officerId): TransitionResult` removes only the original entry, adds it to the target, and marks the original ship `needsReview: true` without recalculating either ship.
- `banOfficer(state, officerId): TransitionResult` rejects occupied/locked officers; `unbanOfficer` removes only the global ban.
- `lockOfficer`/`unlockOfficer` update only the current ship; `recalculateShip` replaces only the selected ship's non-locked recommendations and reports incomplete targets.

- [ ] **Step 1: Write failing transition tests**

```ts
it('requires explicit confirmation before moving an occupied officer', () => {
  const state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-1').state
  expect(addOfficerToShip(state, 'ship-2', 'officer-1')).toMatchObject({
    error: 'officer-occupied', fromShipId: 'ship-1',
  })
})

it('marks the source ship for review without recalculating other ships', () => {
  const state = addOfficerToShip(
    addOfficerToShip(createFleetState(), 'ship-1', 'officer-1').state,
    'ship-2', 'officer-2',
  ).state
  const next = moveOfficerToShip(state, 'ship-1', 'ship-2', 'officer-1').state
  expect(next.ships.find((ship) => ship.id === 'ship-1')).toMatchObject({
    officerIds: [], needsReview: true,
  })
  expect(next.ships.find((ship) => ship.id === 'ship-2')!.officerIds).toContain('officer-1')
})

it('does not allow banning an occupied or locked officer', () => {
  const state = addOfficerToShip(createFleetState(), 'ship-1', 'officer-1').state
  expect(banOfficer(state, 'officer-1').error).toBe('officer-occupied')
})
```

- [ ] **Step 2: Run transition tests and verify the missing behavior**

Run: `npm test -- tests/domain/battle-fleet.test.ts`

Expected: FAIL on explicit move, review marking, and ban conflict assertions.

- [ ] **Step 3: Implement immutable transitions and current-ship-only recalculation**

Preserve the other six ships byte-for-byte in each operation. On a confirmed move, remove the source officer and set only source `needsReview`; do not call the solver. On recalc, preserve locked officers, remove only current recommendation IDs that the solver replaces, keep targets and bans, and leave all other ships untouched.

- [ ] **Step 4: Run focused domain tests and verify green**

Run: `npm test -- tests/domain/battle-fleet.test.ts tests/domain/battle-fleet-solver.test.ts`

Expected: PASS with occupied/locked/banned mutual exclusion and no silent cross-ship recalculation.

### Task 5: Build fleet presenter view models

**Files:**
- Create: `miniprogram/presenters/battle-fleet-presenter.ts`
- Test: `tests/presenters/battle-fleet-presenter.test.ts`

**Interfaces:**
- `buildBattleFleetPageData(state, officers, skills, dictionaries, currentShipId, manualFilters): BattleFleetPageData` returns WXML-ready data including fleet count, seven tabs, current 11 slots, current mode, filtered skill options, target rows, banned officers, recommendation actions, skill summary rows, and seven-ship overview.
- `BattleFleetSkillSummaryView` exposes `skillIconPath`, `skillName`, `totalLevel`, `targetLevel`, `isReached`, `difference`, and `contributors[{ officerId, name, portraitPath }]`.

- [ ] **Step 1: Write failing presenter tests**

```ts
it('projects contributors as portrait-ready rows and preserves zero target rows', () => {
  const view = buildBattleFleetPageData(
    stateWithCurrentShip, sampleOfficers, sampleSkills, sampleDictionaries, 'ship-1', emptyFilters,
  )
  const row = view.skillSummary.find((item) => item.skillId === 'skill-main')!
  expect(row.contributors.map((item) => item.officerId)).toEqual(['officer-a', 'officer-c'])
  expect(row.contributors[0]!.portraitPath).toMatch(/^\/subpkg-a\d\/imgs\/officer_/)
  expect(view.skillSummary.find((item) => item.skillId === 'skill-target-only')).toMatchObject({ totalLevel: 0 })
})

it('exposes only the current ship editor while keeping all seven overview tabs', () => {
  const view = buildBattleFleetPageData(emptyFleetState, sampleOfficers, sampleSkills, sampleDictionaries, 'ship-3', emptyFilters)
  expect(view.shipTabs).toHaveLength(7)
  expect(view.currentShip.id).toBe('ship-3')
  expect(view.fleetOverview).toHaveLength(7)
})
```

- [ ] **Step 2: Run presenter tests and verify they fail**

Run: `npm test -- tests/presenters/battle-fleet-presenter.test.ts`

Expected: FAIL because the presenter view types and builder do not exist.

- [ ] **Step 3: Implement the WXML projection**

Use the domain summary and status functions, map every contributor to the catalog/index officer display fields, preserve all 11 possible contributors in an array, and precompute booleans/labels so WXML does not perform searches or arithmetic. Keep the presenter free of `Page`, `Component`, `wx`, and generated-data imports.

- [ ] **Step 4: Run presenter and domain tests**

Run: `npm test -- tests/presenters/battle-fleet-presenter.test.ts tests/domain/battle-fleet.test.ts tests/domain/battle-fleet-solver.test.ts`

Expected: PASS with stable ordering and no presenter boundary violations.

### Task 6: Add the single-page fleet workbench and navigation entry

**Files:**
- Create: `miniprogram/pages/fleet/index.ts`
- Create: `miniprogram/pages/fleet/index.wxml`
- Create: `miniprogram/pages/fleet/index.wxss`
- Create: `miniprogram/pages/fleet/index.json`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/home/index.ts`
- Modify: `miniprogram/pages/home/index.wxml`
- Modify: `miniprogram/pages/home/index.wxss`
- Test: `tests/pages/fleet-page.test.ts`

**Interfaces:**
- Page lifecycle reads `getFleetOfficers()`, `getSkills()`, and `getDictionaries()` once; all later view refreshes call the pure presenter.
- Page handlers cover ship tab switching, mode switching, three-level skill selection/search, manual add/remove, target add/remove/level, lock/unlock, remove recommendation, ban/unban, recalculate, and explicit cross-ship move confirmation.
- All user-facing labels are Traditional Chinese; no network or Node API is referenced by page runtime code.

- [ ] **Step 1: Write failing page registration and interaction tests**

```ts
it('registers the fleet page with seven ship tabs and manual mode', async () => {
  await import('../../miniprogram/pages/fleet/index')
  const page = createPageInstance()
  page.onLoad()
  expect(page.data.shipTabs).toHaveLength(7)
  expect(page.data.mode).toBe('manual')
  expect(page.data.currentShip.slots).toHaveLength(11)
})

it('adds an auto target without changing another ship and calls recalculate explicitly', () => {
  const page = createLoadedFleetPage()
  page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)
  page.onAddTarget()
  expect(page.data.targets.length).toBe(2)
  page.onRecalculate()
  expect(page.data.fleetOverview).toHaveLength(7)
})
```

- [ ] **Step 2: Run page tests and verify they fail before the page exists**

Run: `npm test -- tests/pages/fleet-page.test.ts`

Expected: FAIL because the route and page registration do not exist.

- [ ] **Step 3: Implement the route, page controller, and compact single-page WXML**

Add `pages/fleet/index` to `app.json` and a home module tile. Render only the selected ship's editor; keep the seven ship tabs and bottom overview visible. Manual mode renders the shared type/category/skill selector and officer availability states. Auto mode renders an initial blank Lv.1 target, unlimited target rows, lock/remove/recalculate actions, and the global ban list. Use `wx.showModal` only for explicit occupied-officer movement confirmation; no automatic page navigation or silent recalculation.

- [ ] **Step 4: Implement the Traditional Chinese mobile layout and status styles**

Use local portrait/icon paths from the runtime index, horizontal scrolling for contributor avatars and long ban lists, disabled states for full ships/blocked officers, and visible labels for `未配置`、`編輯中`、`已完成`、`未完全達成目標`、`需要重新檢查`、`已排除`、`已占用`、`已鎖定`。

- [ ] **Step 5: Run page tests, architecture tests, and runtime-network scan**

Run: `npm test -- tests/pages/fleet-page.test.ts tests/architecture/runtime-dependencies.test.ts tests/architecture/runtime-source-boundaries.test.ts && npm run check:runtime-network`

Expected: PASS; page/presenter code has no generated direct import, remote URL, Node API, `wx.request`, or `wx.cloud`.

### Task 7: Generate runtime data and add generated-shape coverage

**Files:**
- Generated by command only: `miniprogram/generated/fleet-officers.js`
- Modify: `tests/runtime-contract/runtime-shapes.test.ts` if needed for the new generated module
- Modify: `tests/data-pipeline/full-data-integrity.test.ts`

**Interfaces:**
- Generated fleet index must contain one entry per `data/master/officers.json` officer, only battle relations, valid portrait paths, and exact `unlockLevel` values.

- [ ] **Step 1: Add failing generated-shape assertions**

```ts
it('contains a complete generated fleet officer index', () => {
  const fleet = readGenerated('fleet-officers') as Array<{ id: string; skills: Array<{ unlockLevel: number }> }>
  expect(fleet).toHaveLength(627)
  expect(new Set(fleet.map((item) => item.id)).size).toBe(627)
  expect(fleet.flatMap((item) => item.skills).every((skill) => typeof skill.unlockLevel === 'number')).toBe(true)
})
```

- [ ] **Step 2: Run the focused runtime tests and verify the generated file is missing/outdated**

Run: `npm test -- tests/runtime-contract/runtime-shapes.test.ts tests/data-pipeline/full-data-integrity.test.ts`

Expected: FAIL until the pipeline writes the new module and the shape assertions see it.

- [ ] **Step 3: Generate from `data/master/`**

Run: `npm run data:generate`

Expected: `miniprogram/generated/fleet-officers.js` is created by the generator; no file under `archive/` is touched.

- [ ] **Step 4: Run data checks and generated-shape tests**

Run: `npm run data:check && npm test -- tests/runtime-contract/runtime-shapes.test.ts tests/data-pipeline/full-data-integrity.test.ts`

Expected: PASS with no canonical-data drift and complete fleet index coverage.

### Task 8: Full verification and handoff

**Files:**
- Inspect only: all files changed by Tasks 1–7
- No unrelated formatting or scope fixes

- [ ] **Step 1: Re-read the design spec and create a requirement checklist**

Check 7 ships/11 slots/77 global deduplication; independent modes; hierarchical filtering; lock/ban/recalculate; explicit move conflicts; unlockLevel/no cap/stable order/contributor avatars; generated-data boundary; Traditional Chinese UI; and excluded features.

- [ ] **Step 2: Run the complete repository verification**

Run: `npm run verify`

Expected: format check, lint, typecheck, all tests, runtime-network, asset check, data check, and generate check all exit 0.

- [ ] **Step 3: Inspect the final diff and forbidden paths**

Run: `git status --short; git diff --stat; git diff --name-only -- archive miniprogram/generated`

Expected: `archive/` has no changes; generated changes are only the output of `npm run data:generate`; no unrelated files are changed.

- [ ] **Step 4: Report files and verification evidence before any commit**

Show the changed-file list, exact verification commands and exit results, and proposed commit message `feat: add battle fleet simulator`; wait for user confirmation before staging or committing.
