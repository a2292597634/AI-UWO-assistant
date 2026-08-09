# 冒險預設技能追蹤可見 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox（- [ ]）syntax for tracking.

**Goal:** 讓冒險配隊預設的 `Lv.0` 技能追蹤在自動模式工作區直接展開可見。

**Architecture:** 保持既有 Presenter 對 `trackingTargets` 的展示投影與 `Lv.0` 資料語義不變，只調整冒險頁 `disclosure-section` 的初始展示屬性。以頁面靜態契約測試保護「技能追蹤展開、其他低頻摘要收起」的差異。

**Tech Stack:** TypeScript、微信原生 WXML、Vitest、Prettier、ESLint、既有 Design Foundation Token；不新增依賴。

## Global Constraints

- 所有 UI 文案、註釋與文件使用繁體中文；WXML/WXSS 類名維持英文 BEM。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`、Controller、Domain、Solver、資料或保存流程。
- 不新增、刪除或升級依賴，不新增 `wx.request`、`wx.cloud`、遠端 URL 或 Node.js Runtime API。
- 既有 `docs/audits/` 只在主工作樹保留，不加入提交。

---

### Task 1: 建立技能追蹤預設展開的回歸契約

**Files:**
- Modify: `tests/pages/adventure-fleet-page.test.ts`
- Inspect: `miniprogram/pages/adventure-fleet/index.wxml`

**Interfaces:**
- 測試讀取冒險頁 WXML，確認「技能追蹤」使用 `default-expanded="{{true}}"`。
- 同一契約保留其他兩個低頻區塊的預設收起語義。

- [ ] **Step 1: 寫失敗測試**

在頁面結構測試中加入：

```ts
expect(adventureWxml).toMatch(
  /title="技能追蹤"[\\s\\S]*?default-expanded="\\{\\{true\\}\\}"/,
)
expect(adventureWxml).toContain('title="全艦隊排除名單"')
expect(adventureWxml).toContain('title="全艦隊冒險技能累計"')
```

- [ ] **Step 2: 執行測試確認 RED**

Run: `npm.cmd test -- tests/pages/adventure-fleet-page.test.ts`

Expected: FAIL，因為目前「技能追蹤」仍使用 `default-expanded="{{false}}"`。

### Task 2: 最小修改 WXML

**Files:**
- Modify: `miniprogram/pages/adventure-fleet/index.wxml`

**Interfaces:**
- 只把「技能追蹤」的 `default-expanded` 改為 `{{true}}`。
- 不改變 `trackingTargets` 綁定、既有 handler 或其他 disclosure-section。

- [ ] **Step 1: 修改屬性**

將技能追蹤區塊的：

```xml
default-expanded="{{false}}"
```

改為：

```xml
default-expanded="{{true}}"
```

- [ ] **Step 2: 執行 focused tests 確認 GREEN**

Run: `npm.cmd test -- tests/pages/adventure-fleet-page.test.ts tests/presenters/adventure-fleet-presenter.test.ts`

Expected: PASS，且既有目標語義、方案預覽與頁面互動測試不回退。

### Task 3: 格式、全量驗證與範圍檢查

**Files:**
- Inspect: 本 Phase 所有變更文件

- [ ] **Step 1: 執行格式與差異檢查**

Run: `npx.cmd prettier --check tests/pages/adventure-fleet-page.test.ts`

Run: `git diff --check`

- [ ] **Step 2: 執行完整驗證**

Run: `npm.cmd run verify`

Expected: format、lint、typecheck、全部測試、runtime network、包體積、素材、資料審計、Schema 與生成一致性全部通過。

- [ ] **Step 3: 檢查受保護範圍**

Run: `git diff --name-only -- archive data/master miniprogram/generated miniprogram/pages/adventure-fleet/index.ts miniprogram/domain miniprogram/contracts miniprogram/runtime cloudfunctions package.json package-lock.json`

Expected: 無輸出。

### Task 4: 提交前停點

- [ ] **Step 1: 提供完整變更文件清單、驗證結果與手動驗收項目**
- [ ] **Step 2: 提供擬用 Commit Message：`fix: 顯示冒險預設技能追蹤`**
- [ ] **Step 3: 等待使用者確認後才執行 `git add`、`git commit`、`merge` 或 `push`**

## 手動驗收

由使用者在微信 DevTools 的冒險配隊頁檢查：

- 新建頁自動模式中，「技能追蹤」預設展開並顯示預設技能。
- 追蹤列仍顯示 `Lv.0` 與「不參與計算」語義。
- 「全艦隊排除名單」與「全艦隊冒險技能累計」仍預設收起且可展開。
- 320px、375px、393px、430px 寬度沒有頁面級橫向溢出。
