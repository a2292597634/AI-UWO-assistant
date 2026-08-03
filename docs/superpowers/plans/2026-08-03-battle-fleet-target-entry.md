# 戰鬥模擬艦隊目標快速配對 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 取消點擊上方目標行進入編輯，改為在自動配隊模式下雙擊下方篩選技能直接加入目標；把目標等級改為可輸入的 Lv.1–Lv.10 欄位，並保留可見的刪除目標操作。

**Architecture:** 純 domain 新增「填入第一個空目標，沒有空目標就建立新目標」的不可變轉換，頁面只負責以兩次 `tap` 的時間窗辨識雙擊並呼叫該轉換。Presenter/WXML 移除目標編輯狀態與 picker，輸入框在失焦時交由既有目標校驗處理。

**Tech Stack:** TypeScript、Vitest、微信小程序 WXML/WXSS；不新增依賴，不修改資料源或生成檔。

## Global Constraints

- `archive/` 只讀；`data/master/` 與 `miniprogram/generated/` 本次不涉及。
- 介面與資料只使用繁體中文；不使用遠端請求、Node.js API 或新的依賴。
- 目標等級只接受整數 Lv.1 至 Lv.10；重複技能沿用 `duplicate-target` 錯誤。
- 雙擊只在自動配隊模式加入目標；手動配隊保留單擊技能後顯示可用航海士。
- 不修改範圍外問題；commit 前展示變更文件、驗證結果與擬用 message，等待使用者確認。

---

### Task 1: 新增純 domain 的技能快速加入目標轉換

**Files:**
- Modify: `miniprogram/domain/battle-fleet.ts`
- Test: `tests/domain/battle-fleet.test.ts`

**Interfaces:**
- 新增 `assignSkillToFirstOpenTarget(state, shipId, skillId): FleetTransitionResult`。
- 若技能已存在於目前船目標，回傳 `duplicate-target` 且不改狀態。
- 優先填入第一個 `skillId === null` 的目標；沒有空目標時新增 `{ id, skillId, targetLevel: 1 }`。

- [x] **Step 1: Write the failing test**

```ts
it('assigns a double-clicked skill to the first empty target or appends a target', () => {
  const auto = setShipMode(createFleetState(), 'ship-1', 'auto').state

  const filled = assignSkillToFirstOpenTarget(auto, 'ship-1', 'skill-cannon').state
  expect(filled.ships[0]!.targets).toEqual([
    { id: 'ship-1-target-1', skillId: 'skill-cannon', targetLevel: 1 },
  ])

  const appended = assignSkillToFirstOpenTarget(filled, 'ship-1', 'skill-melee').state
  expect(appended.ships[0]!.targets).toEqual([
    { id: 'ship-1-target-1', skillId: 'skill-cannon', targetLevel: 1 },
    { id: 'ship-1-target-2', skillId: 'skill-melee', targetLevel: 1 },
  ])
})

it('rejects assigning a skill already used by the current ship target list', () => {
  const auto = setShipMode(createFleetState(), 'ship-1', 'auto').state
  const filled = assignSkillToFirstOpenTarget(auto, 'ship-1', 'skill-cannon').state

  expect(assignSkillToFirstOpenTarget(filled, 'ship-1', 'skill-cannon').error).toBe(
    'duplicate-target',
  )
})
```

- [x] **Step 2: Run the focused domain test and verify it fails**

Run: `npm test -- tests/domain/battle-fleet.test.ts`

Expected: FAIL because `assignSkillToFirstOpenTarget` is not exported yet.

- [x] **Step 3: Implement the minimal immutable transition**

Find the current ship, reject a configured duplicate, locate the first empty target, or generate the first unused `${shipId}-target-N` ID when appending. Pass the resulting list through `updateShipTargets` so level and duplicate validation remain centralized.

- [x] **Step 4: Run the focused domain tests**

Run: `npm test -- tests/domain/battle-fleet.test.ts`

Expected: PASS with the existing capacity, filtering, target, and summary tests unchanged.

### Task 2: Replace target picker/edit state with input and double-tap page behavior

**Files:**
- Modify: `miniprogram/pages/fleet/index.ts`
- Modify: `miniprogram/pages/fleet/index.wxml`
- Modify: `miniprogram/pages/fleet/index.wxss`
- Test: `tests/pages/fleet-page.test.ts`

**Interfaces:**
- Page state no longer exposes `editingTargetId` or `targetLevelOptions`.
- `onSkillTap(event)` uses the event timestamp and a 350ms same-skill window; the second tap in auto mode calls `assignSkillToFirstOpenTarget`.
- `onTargetLevelBlur(event)` accepts only an integer 1–10, otherwise keeps the prior value and shows the existing validation toast.
- `onRemoveTarget` remains the target-row delete action and is covered by a page test.

- [x] **Step 1: Write failing page tests**

```ts
it('adds a filtered skill to the first target only after a double tap in auto mode', () => {
  const page = createPageInstance()
  page.onLoad()
  page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)

  page.onSkillTap({ currentTarget: { dataset: { id: 'skill-cannon' } }, timeStamp: 100 } as never)
  expect(page.data.targets[0]).toMatchObject({ skillId: null })

  page.onSkillTap({ currentTarget: { dataset: { id: 'skill-cannon' } }, timeStamp: 250 } as never)
  expect(page.data.targets[0]).toMatchObject({ skillId: 'skill-cannon', targetLevel: 1 })
})

it('deletes a target and validates direct level input on blur', () => {
  const page = createPageInstance()
  page.onLoad()
  page.onModeTap({ currentTarget: { dataset: { mode: 'auto' } } } as never)
  const targetId = page.data.targets[0].id

  page.onTargetLevelBlur({ currentTarget: { dataset: { id: targetId } }, detail: { value: '10' } } as never)
  expect(page.data.targets[0].targetLevel).toBe(10)

  page.onRemoveTarget({ currentTarget: { dataset: { id: targetId } } } as never)
  expect(page.data.targets).toEqual([])
})
```

- [x] **Step 2: Run the page test and verify it fails for the new handlers**

Run: `npm test -- tests/pages/fleet-page.test.ts`

Expected: FAIL because the page still exposes `onSkillSelect`/picker handling and does not expose the new handlers.

- [x] **Step 3: Implement the minimal page interaction**

Keep single-tap selection for manual mode. In auto mode, record the first skill tap without changing targets; on a same-skill second tap within 350ms, call the domain transition, clear the tap record, show any transition error, and render. Replace picker change handling with blur parsing and existing `invalid-target-level` feedback. Remove the target-row skill click binding and editing state.

- [x] **Step 4: Update the WXML/WXSS affordances**

Use `bindtap="onSkillTap"` on skill options, render the auto-mode hint `雙擊技能直接加入上方目標`, replace the picker with a numeric `input` limited to two characters, and label the row action `刪除目標`. Add only the compact input styling needed by the existing layout.

- [x] **Step 5: Run page, presenter, and domain tests**

Run: `npm test -- tests/pages/fleet-page.test.ts tests/presenters/battle-fleet-presenter.test.ts tests/domain/battle-fleet.test.ts`

Expected: PASS with manual single-tap selection, auto double-tap assignment, direct level input, target deletion, and all existing fleet behavior.

### Task 3: Verify the focused change and repository boundaries

**Files:**
- Inspect only: files changed by Tasks 1–2

- [x] **Step 1: Run formatting, type, lint, and diff checks**

Run: `npx prettier --check miniprogram/domain/battle-fleet.ts miniprogram/pages/fleet/index.ts miniprogram/pages/fleet/index.wxml miniprogram/pages/fleet/index.wxss tests/domain/battle-fleet.test.ts tests/pages/fleet-page.test.ts; npm run typecheck; npm run lint; git diff --check`

Expected: each command exits 0; no generated or archive path appears in the diff.

- [x] **Step 2: Run the full repository gate**

Run: `npm run verify`

Expected: record the actual exit code. If the existing four unrelated Prettier warnings remain, report them without formatting those files.

- [x] **Step 3: Inspect the final diff and prepare handoff**

Run: `git status --short; git diff --stat; git diff --name-only -- archive miniprogram/generated`

Expected: only the focused page/domain/test/plan files changed; show the file list, verification results, and proposed commit message before any commit.
