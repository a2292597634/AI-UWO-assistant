# 遊戲月份中國大陸時區校準 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將遊戲月份的每日換月邊界從日本時區 00:00 改為中國大陸時區 09:00，並以目前遊戲內已進入 4 月重新校準。

**Architecture:** 保留 `gameMonthAt(timestampMs)` 的純函式與固定 UTC timestamp 計算，不讀取使用者裝置時區。新的固定錨點為 `2026-09-03 09:00（中國大陸時間）= 遊戲 12 月`，因此 `2026-09-07 09:00` 起為遊戲 4 月；頁面說明、預設狀態與回歸測試同步更新。

**Tech Stack:** TypeScript、Vitest、微信小程序 WXML、Markdown 規格文件。

## Global Constraints

- `archive/`：voyage.tw 一次性快照，只讀。
- `data/master/`：唯一權威數據源，所有人手修改在此進行。
- `miniprogram/generated/`：由 `npm run data:generate` 生成，禁止手動修改。
- 不新增、刪除或升級 npm 依賴。
- 不直接在 `main` 分支開發；本分支使用 `codex/phase-8-game-month-china-time`。
- 代碼註釋、文檔與測試說明使用中文；WXML/WXSS 類名保持既有英文命名。
- 涉及 WXML 的修改已完整閱讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。

---

### Task 1: 鎖定中國大陸 09:00 換月規則

**Files:**
- Modify: `tests/domain/game-month.test.ts`
- Test: `miniprogram/subpkg-trade/domain/game-month.ts`

**Interfaces:**
- Consumes: `gameMonthAt(timestampMs: number)`。
- Produces: 中國大陸時區 09:00 邊界、目前 4 月校準、跨 12 月循環與設備時區無關的測試約束。

- [ ] **Step 1: Write the failing test**

將測試 helper 改為固定產生中國大陸時間（UTC+08:00）的 timestamp，並加入以下行為：

```ts
const cst = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number => Date.UTC(year, month - 1, day, hour - 8, minute, second)

it('maps the calibrated China Standard Time anchor to game month 12', () => {
  expect(gameMonthAt(cst(2026, 9, 3, 9))).toBe(12)
})

it('changes the game month at 09:00 China Standard Time', () => {
  expect(gameMonthAt(cst(2026, 9, 7, 8, 59, 59))).toBe(3)
  expect(gameMonthAt(cst(2026, 9, 7, 9))).toBe(4)
})

it('shows game month 4 at the current calibrated date', () => {
  expect(gameMonthAt(cst(2026, 9, 7, 12))).toBe(4)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/game-month.test.ts`

Expected: FAIL because the existing UTC `15:00` anchor still represents Japan Standard Time midnight and returns the old month values.

### Task 2: 實作最小時間校準修改

**Files:**
- Modify: `miniprogram/subpkg-trade/domain/game-month.ts`
- Test: `tests/domain/game-month.test.ts`

**Interfaces:**
- Consumes: Task 1 的 timestamp 邊界測試。
- Produces: `GAME_MONTH_ANCHOR_MS = Date.UTC(2026, 8, 3, 1, 0, 0)`，即中國大陸時間 2026-09-03 09:00。

- [ ] **Step 1: Write minimal implementation**

將註釋改為中國大陸時間，並把固定錨點改為：

```ts
/**
 * 將現實時間換算成遊戲內月份。
 *
 * 基準固定採中國大陸時間的 2026-09-03 09:00，該時刻對應遊戲 12 月；
 * 每經過一個中國大陸時間的日曆日（每日 09:00），遊戲月份前進一個月。
 */
export const GAME_MONTH_ANCHOR_MS = Date.UTC(2026, 8, 3, 1, 0, 0)
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/domain/game-month.test.ts`

Expected: PASS，且 09:00 前後分別回傳 3 月與 4 月。

### Task 3: 同步頁面預設值與校準說明

**Files:**
- Modify: `miniprogram/subpkg-trade/pages/detail/index.ts`
- Modify: `miniprogram/subpkg-trade/pages/detail/index.wxml`
- Modify: `tests/pages/trade-detail-page.test.ts`
- Modify: `docs/superpowers/specs/2026-09-04-trade-season-query-design.md`

**Interfaces:**
- Consumes: Task 2 的 `gameMonthAt` 邊界。
- Produces: 詳情頁目前月份預設與使用者可見校準說明不再顯示日本時間或 12 月舊值。

- [ ] **Step 1: Update the page regression fixture**

將頁面測試的系統時間固定在 `Date.UTC(2026, 8, 7, 1, 0, 0)`，並把初始月份改為 4；跨一天後驗證為 5，且目前月份框線從第 4 格移到第 5 格。

- [ ] **Step 2: Update runtime default and WXML copy**

將 `emptyView` 的 `currentGameMonth` 與 `currentMonthLabel` 更新為 4 月，並把詳情頁說明更新為「以 2026 年 9 月 3 日（中國大陸時間）09:00 為 12 月基準」。不修改布局、樣式或互動流程。

- [ ] **Step 3: Update the trade-season specification**

把規格中的日本時區、00:00、舊錨點與舊驗收日期改成中國大陸時間、09:00、2026-09-03 09:00 = 12 月及 2026-09-07 09:00 = 4 月；同步修正測試矩陣文字，避免文檔重新引導回舊規則。

- [ ] **Step 4: Run focused page and presenter tests**

Run: `npx vitest run tests/domain/game-month.test.ts tests/pages/trade-detail-page.test.ts tests/presenters/trade-season-presenter.test.ts`

Expected: PASS，頁面與月份純函式均使用新校準。

### Task 4: 完成驗證與提交

**Files:**
- Verify: 所有 Task 1–3 變更。

**Interfaces:**
- Consumes: 新時間校準、頁面文案與回歸測試。
- Produces: 可重現、無設備時區依賴且通過專案門禁的修復分支。

- [ ] **Step 1: Run full verification**

Run: `npm run verify`

Expected: 所有格式、Lint、型別、測試、資料、運行時網絡與生成檢查通過。

- [ ] **Step 2: Inspect final scope**

Run: `git status --short; git diff --check; git diff --stat`

確認沒有修改 `archive/`、`data/master/`、依賴文件或無關頁面。

- [ ] **Step 3: Show the user the changes and proposed commit message**

提交前展示變更文件、驗證結果與擬用 message，等待使用者確認後再 commit。
