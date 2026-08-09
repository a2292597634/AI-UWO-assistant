# 航海士操作按鈕緊湊化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改變既有事件流程的前提下，讓航海士操作列具備緊湊視覺層和鎖定／移除／排除圖標。

**Architecture:** `officer-action-sheet` 保持純展示與既有事件轉發。原生 button 繼續承擔 88rpx 觸控熱區，內部視覺層承擔較矮的背景、圖標和文字；頁面與業務層完全不變。

**Tech Stack:** 微信原生 Component、WXML、WXSS、Vitest；不新增依賴或素材。

## Global Constraints

- 所有 UI 文案、註釋和文件使用繁體中文；WXML/WXSS 類名使用英文 BEM。
- UI/WXML/WXSS 必須遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`、Controller、Domain、Solver、contracts 或資料。
- 不修改既有事件名稱、事件 detail、disabled/aria-disabled 語義或頁面業務流程。
- 不新增依賴、位圖、遠程 URL、`wx.request`、`wx.cloud` 或 Node.js Runtime API。
- 先寫失敗測試並確認 RED，再寫最小實作；完成後執行完整驗證。
- 未經使用者再次確認，不執行 commit、merge 或 push。

---

### Task 1: 鎖定 OfficerActionSheet 的緊湊視覺契約

**Files:**

- Modify: `tests/architecture/fleet-shared-components.test.ts`
- Inspect: `miniprogram/components/officer-action-sheet/index.wxml`
- Inspect: `miniprogram/components/officer-action-sheet/index.wxss`

- [ ] **Step 1: 加入失敗測試**

在「航海士操作共享元件契約」中加入契約，要求 WXML 有三個圖標 modifier、`.officer-action-sheet__visual`、可見操作文字和原有事件；要求 WXSS 同時保留 `min-height: 88rpx`、緊湊視覺層高度和三種圖標 modifier。

- [ ] **Step 2: 執行 focused test 確認因缺少視覺契約而失敗**

Run: `npm.cmd test -- tests/architecture/fleet-shared-components.test.ts`

Expected: FAIL，失敗原因是目前 WXML 沒有視覺層和圖標 modifier，而不是測試語法錯誤。

### Task 2: 實作緊湊視覺層與圖標

**Files:**

- Modify: `miniprogram/components/officer-action-sheet/index.wxml`
- Modify: `miniprogram/components/officer-action-sheet/index.wxss`

- [ ] **Step 1: 將三個操作包入視覺層**

每個 button 保留原有 `disabled`、`aria-disabled`、`aria-label`、`bindtap` 和 `data-*`，只在內容內加入對應的 `.officer-action-sheet__visual` 與 `.officer-action-sheet__icon--lock|remove|ban`。

- [ ] **Step 2: 實作最小 Token 化 WXSS**

button 保留 `min-height: 88rpx` 並使用透明背景承擔熱區；visual 使用 `min-height: 56rpx`、既有 Token 邊界與背景；圖標用 `currentColor`、border 和 pseudo-element 繪製，不使用 Emoji、圖片或遠程資源。`slot` 變體將 label 套用視覺隱藏規則，`card` 變體保留可見 label；兩者都保留 `aria-label`。

- [ ] **Step 3: 執行 focused test 確認通過**

Run: `npm.cmd test -- tests/architecture/fleet-shared-components.test.ts tests/pages/fleet-page.test.ts`

Expected: PASS，既有操作事件與新增視覺契約均通過。

### Task 3: 完成邊界驗證與提交前檢查

**Files:**

- Inspect only: all files changed by Tasks 1–2

- [ ] **Step 1: 執行格式、類型、網路和差異檢查**

Run:

```powershell
npx.cmd prettier --check miniprogram/components/officer-action-sheet/index.wxss tests/architecture/fleet-shared-components.test.ts
npm.cmd run typecheck -- --pretty false
npm.cmd run check:runtime-network
git diff --check
```

WXML 不由目前的 Prettier parser 處理，使用 `git diff --check` 驗證其差異格式。

- [ ] **Step 2: 確認禁止範圍沒有變更**

Run: `git diff --name-only -- archive data/master miniprogram/generated miniprogram/pages/fleet/index.ts miniprogram/domain miniprogram/contracts`

Expected: 無輸出。

- [ ] **Step 3: 執行完整門禁**

Run: `npm.cmd run verify`

Expected: format、lint、typecheck、全量測試、runtime-network、包體積、素材、資料和生成檢查全部通過。

- [ ] **Step 4: 提供提交前報告**

列出變更文件、驗證結果、DevTools 待驗收項目和擬用 commit message，等待使用者確認後才提交。

### Task 4: 收斂戰鬥技能選擇區的內嵌密度

**Files:**

- Modify: `tests/architecture/fleet-shared-components.test.ts`
- Modify: `miniprogram/components/skill-picker-sheet/index.wxss`
- Modify: `tests/pages/fleet-page.test.ts`

- [ ] **Step 1: 加入失敗契約**

在共享元件測試中要求 `skill-picker-sheet--inline` 的 Tab 為 `56rpx`、技能圖標為 `40rpx`、詳情列和「加入目標」按鈕為 `64rpx`；在頁面測試中保留戰鬥頁 `presentation="inline"` 和 `selection-label` 事件接線。

- [ ] **Step 2: 執行 RED 測試**

Run: `npm.cmd test -- tests/architecture/fleet-shared-components.test.ts tests/pages/fleet-page.test.ts`

Expected: FAIL，原因是目前 inline 模式仍沿用 `88rpx` Tab、`48rpx` 圖標和 `88rpx` 選擇操作。

- [ ] **Step 3: 實作最小 inline WXSS 覆蓋**

只在 `.skill-picker-sheet--inline` 下覆蓋 Tab 的高度與內距、技能圖標尺寸、詳情列最小高度和選擇按鈕高度；不修改 WXML、Component TS 或任何事件。保留 sheet 模式原規則。

- [ ] **Step 4: 執行 focused GREEN 測試**

Run: `npm.cmd test -- tests/architecture/fleet-shared-components.test.ts tests/pages/fleet-page.test.ts`

Expected: PASS，既有事件、資產回退和頁面接線契約不變。
