# 戰鬥配隊 P5 重構 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 在不修改戰鬥配隊 Controller、Domain、Solver、資料和既有事件語義的前提下，完成五列成員網格、候選技能貢獻、跨船移動語義、排除名單展示和低頻摘要折疊。

**Architecture:** Presenter 只增加 WXML 所需的候選貢獻、選擇提示和本船排除展示映射；頁面繼續使用既有 handler。新增 `disclosure-section` 是純展示 Component，內部只維護展開狀態，透過 slot 承載既有內容，不讀取業務資料也不發出業務事件。

**Tech Stack:** TypeScript、微信原生 Component、WXML、WXSS、Vitest、Prettier、ESLint、既有 Design Foundation Token；不新增依賴。

## Global Constraints

- UI/WXML/WXSS 編碼前完整閱讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
- UI 文案、程式碼註釋、測試和文件使用繁體中文；WXML/WXSS 類名使用英文 BEM。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`、Cloud Function、Controller、Domain 或 Solver 的業務規則。
- 不新增、刪除或升級依賴，不新增 `wx.request`、`wx.cloud`、遠程 URL 或 Node.js Runtime API。
- 不新增圖像素材或位圖；沿用現有本地圖片和錯誤回退。
- `disclosure-section` 只能維護展示狀態，不 import Domain、Presenter、runtime service 或資料模組。
- 保留 `onOfficerSelect`、`onOfficerLock`、`onOfficerRemove`、`onBanOfficer`、`onUnbanOfficer`、`onProposalCancel`、`onProposalApply` 和 `onUndoProposal`。
- 不新增真正的成員整卡 Action Sheet；`OfficerActionSheet` 保持既有 inline 事件轉發。
- 重要操作熱區至少 `88rpx`；操作文字不小於 `22rpx`；長文字允許換行；普通卡片不新增陰影。
- 每個新行為先寫失敗測試並確認預期失敗，再寫最小實作；每項任務完成後執行 focused tests。
- 分支：`codex/phase-5-戰鬥配隊重構`；工作樹：`E:\AI UWO assistant\.worktrees\phase-5-battle-fleet-refactor`。
- Commit 前展示變更文件、驗證結果、DevTools 待驗收項目和擬用 message，等待使用者確認；本計畫不自動 commit。

---

## 文件與測試地圖

- Create: `miniprogram/components/disclosure-section/index.{ts,wxml,wxss,json}`。
- Create: `tests/architecture/fleet-disclosure.test.ts`。
- Modify: `miniprogram/presenters/battle-fleet-presenter.ts`。
- Modify: `tests/presenters/battle-fleet-presenter.test.ts`。
- Modify: `miniprogram/pages/fleet/index.json`、`index.wxml`、`index.wxss`。
- Modify: `tests/pages/fleet-page.test.ts`。
- Existing approved docs: `docs/superpowers/specs/2026-08-09-battle-fleet-refactor-design.md`。

---

### Task 1: 擴充 Presenter 的 P5 展示映射

**Files:**
- Modify: `miniprogram/presenters/battle-fleet-presenter.ts`
- Test: `tests/presenters/battle-fleet-presenter.test.ts`

**Interfaces:**
- `BattleFleetOfficerView` 新增 `skillContributionLabel: string` 和 `selectionHint: string`。
- 新增 `BattleFleetExcludedOfficerView = { id: string; name: string; portraitPath: string; visuals: OfficerVisualPaths }`。
- `BattleFleetPageData.currentShipExcludedOfficers?: BattleFleetExcludedOfficerView[]`，保持可選以免修改 Page 初始 data。

- [ ] **Step 1: 寫候選技能貢獻的失敗測試**

```ts
it('projects the selected skill contribution as visible candidate text', () => {
  const view = buildBattleFleetPageData(
    stateWithCurrentShip(), officers, skills, dictionaries,
    'ship-1', emptyFilters, 'skill-main',
  )
  expect(view.manualCandidates.find((item) => item.id === 'officer-a'))
    .toMatchObject({ skillContributionLabel: '主砲強化 +Lv.5' })
})
```

- [ ] **Step 2: 寫跨船來源與本船排除的失敗測試**

先建立 `officer-p` 在 `ship-2`、`officer-a` 從 `ship-1` 移除的狀態，再斷言：

```ts
expect(view.manualCandidates.find((item) => item.id === 'officer-p'))
  .toMatchObject({ selectionHint: '第 2 船 · 點擊後移動' })
expect(view.currentShipExcludedOfficers)
  .toEqual([expect.objectContaining({ id: 'officer-a', name: '甲' })])
```

- [ ] **Step 3: 執行 focused test 確認預期失敗**

Run: `npm.cmd test -- tests/presenters/battle-fleet-presenter.test.ts`

Expected: FAIL，原因是新展示欄位尚未輸出，不得是測試語法錯誤。

- [ ] **Step 4: 實作最小映射**

在 Presenter 內依 status 產生 `selectionHint`：`available` 為「可加入目前船」、`current` 為「目前船 · 已加入」、`locked` 為「目前船 · 已鎖定」、其他船為「第 N 船 · 點擊後移動」、`banned` 為「全艦隊已排除」。在 `manualCandidates` 映射階段以關係資料的 `unlockLevel` 和技能名稱產生 `skillContributionLabel`。以 `currentShip.removedOfficerIds` 查找已知航海士輸出 `currentShipExcludedOfficers`，未知 ID 略過。

- [ ] **Step 5: 執行 focused test 確認通過**

Run: `npm.cmd test -- tests/presenters/battle-fleet-presenter.test.ts`

Expected: PASS，既有 Presenter 測試和新增案例全部通過。

- [ ] **Step 6: 只整理純函式和型別**

抽取重複狀態文案時保持輸出不變，再重跑同一 focused test。

---

### Task 2: 建立 DisclosureSection 純展示元件

**Files:**
- Create: `miniprogram/components/disclosure-section/index.ts`
- Create: `miniprogram/components/disclosure-section/index.wxml`
- Create: `miniprogram/components/disclosure-section/index.wxss`
- Create: `miniprogram/components/disclosure-section/index.json`
- Create: `tests/architecture/fleet-disclosure.test.ts`

**Interfaces:**
- Properties：`title: string`、`hint: string`、`countLabel: string`、`defaultExpanded: boolean`。
- data：`expanded: boolean`；`onToggle()` 只反轉該欄位。
- WXML 必須有 `bindtap="onToggle"`、`aria-expanded="{{expanded}}"`、`wx:if="{{expanded}}"` 和 `<slot />`。

- [ ] **Step 1: 寫元件架構紅燈測試**

測試應檢查四件文件存在、JSON 含 `component: true`、TS 含四個 properties 和 `onToggle`、TS 不含 `wx.`/Domain/Presenter/solver/runtime、WXML 含 slot/展開語義、WXSS 含 P3 Token 和 `min-height: 88rpx`。

- [ ] **Step 2: 執行測試確認因文件不存在而失敗**

Run: `npm.cmd test -- tests/architecture/fleet-disclosure.test.ts`

Expected: FAIL，原因是 `miniprogram/components/disclosure-section/` 尚不存在。

- [ ] **Step 3: 實作最小 Component、WXML 和 JSON**

`index.ts` 使用 `Component({ properties, data, methods })`；`onToggle` 以 `this.data.expanded` 反轉狀態。`index.json` 使用 `{ "component": true }`。WXML 標題列顯示 title、hint、countLabel 和「展開/收起」文字，展開時透過 slot 渲染內容。

- [ ] **Step 4: 寫 Token 化 WXSS**

標題列至少 `88rpx`，使用 body/minimum-action 字級、control/card radius、space Token 和 `overflow-wrap: anywhere`；不使用硬編碼顏色或陰影。

- [ ] **Step 5: 執行 focused test 確認通過**

Run: `npm.cmd test -- tests/architecture/fleet-disclosure.test.ts`

Expected: PASS，且不影響既有架構測試。

---

### Task 3: 寫頁面接線和 WXML 重排的失敗契約

**Files:**
- Modify: `tests/pages/fleet-page.test.ts`
- Modify: `miniprogram/pages/fleet/index.json`
- Modify: `miniprogram/pages/fleet/index.wxml`

**Interfaces:**
- JSON 新增 `disclosure-section: ../../components/disclosure-section/index`。
- WXML 使用四個 DisclosureSection，保留七個 P4 共享元件和既有 handler。

- [ ] **Step 1: 加入頁面結構紅燈測試**

測試斷言 JSON 註冊路徑、WXML 含四個 `<disclosure-section>`、不含 `class="fleet-header"`、`<mode-tabs` 出現在 `slot-grid` 前、WXML 使用 `skillContributionLabel`、`selectionHint`、`currentShipExcludedOfficers` 和 `onUnbanOfficer`。

- [ ] **Step 2: 執行頁面測試確認預期失敗**

Run: `npm.cmd test -- tests/pages/fleet-page.test.ts`

Expected: FAIL，原因是 P5 JSON/WXML 契約尚不存在；既有 Controller 行為測試不得成為失敗原因。

- [ ] **Step 3: 註冊元件並重排 WXML**

保留配置 modal、技能詳情 Sheet、方案預覽、OfficerActionSheet、SkillPickerSheet 的所有 properties 和事件。順序改為 ConfigBar → 緊湊上下文列 → 船 Tab → 當前船 → ModeTabs → 成員 grid → 模式工作區 → 折疊區塊 → ResultPreviewSheet/技能詳情 Sheet。

- [ ] **Step 4: 接入四個預設收起區塊**

本船排除使用 `currentShipExcludedOfficers` 和既有 `onUnbanOfficer`；全艦隊排除沿用 `bannedOfficers`；技能統計和全艦隊摘要只移入 slot。四個元件都傳入 `default-expanded="{{false}}"`，不新增頁面 handler。

- [ ] **Step 5: 執行頁面 focused test 確認通過**

Run: `npm.cmd test -- tests/pages/fleet-page.test.ts`

Expected: PASS，新增靜態契約和既有頁面回歸全部通過。

---

### Task 4: 完成五列網格、候選熱區和 Token 化頁面樣式

**Files:**
- Modify: `miniprogram/pages/fleet/index.wxss`
- Modify: `tests/pages/fleet-page.test.ts`

**Interfaces:**
- `.slot-grid` 使用 `repeat(5, minmax(0, 1fr))`。
- 新增 `.fleet-context`、`.candidate-row__contribution` 等樣式只使用 P3 Token。
- 候選列至少 `88rpx`，不以低透明度作為唯一不可用語義。

- [ ] **Step 1: 加入 WXSS 紅燈測試**

```ts
it('uses five columns and tokenized P5 page rules', () => {
  expect(fleetWxss).toMatch(
    /\.slot-grid\s*\{[\s\S]*repeat\(5,\s*minmax\(0,\s*1fr\)\)/,
  )
  expect(fleetWxss).toMatch(/\.fleet-context\s*\{[\s\S]*var\(--uwo-/)
  expect(fleetWxss).toMatch(/\.candidate-row\s*\{[\s\S]*min-height:\s*88rpx/)
  expect(fleetWxss).toContain('overflow-wrap: anywhere')
  expect(fleetWxss).not.toMatch(/\.candidate-row--disabled\s*\{[\s\S]*opacity\s*:/)
})
```

- [ ] **Step 2: 執行頁面測試確認六列契約失敗**

Run: `npm.cmd test -- tests/pages/fleet-page.test.ts`

Expected: FAIL，原因是目前仍為六列且缺少 P5 樣式契約。

- [ ] **Step 3: 實作最小 WXSS 變更**

將 grid 改為五列；移除只服務已刪除 Header 的 CSS；新增緊湊 `.fleet-context` 和候選貢獻/狀態文字；保留頁面專屬圖片、modal、技能 Sheet 和結果預覽樣式。新增的顏色、間距、圓角和字級全部使用 `var(--uwo-...)`，候選名稱和狀態允許換行。

- [ ] **Step 4: 執行 focused test 和格式檢查**

Run:

```powershell
npm.cmd test -- tests/pages/fleet-page.test.ts
npx.cmd prettier --check miniprogram/pages/fleet/index.wxml miniprogram/pages/fleet/index.wxss miniprogram/pages/fleet/index.json tests/pages/fleet-page.test.ts
```

Expected: PASS。

---

### Task 5: 執行 P5 focused 回歸和工程邊界檢查

**Files:**
- Inspect only: all files changed by Tasks 1–4

- [ ] **Step 1: 執行 focused suite**

Run: `npm.cmd test -- tests/presenters/battle-fleet-presenter.test.ts tests/architecture/fleet-disclosure.test.ts tests/pages/fleet-page.test.ts tests/domain/fleet-proposal.test.ts tests/presenters/fleet-proposal-presenter.test.ts`

Expected: PASS；配置、移動確認、鎖定、移除、排除、方案預覽和撤銷全部回歸。

- [ ] **Step 2: 檢查禁止目錄和 Controller/Domain/Contract**

Run: `git diff --name-only -- miniprogram/pages/fleet/index.ts miniprogram/domain miniprogram/contracts miniprogram/generated archive data/master cloudfunctions`

Expected: 無輸出；若出現任何路徑，停止並報告，不自行擴張範圍。

- [ ] **Step 3: 執行網路和差異檢查**

Run:

```powershell
npm.cmd run check:runtime-network
git diff --check
```

Expected: exit code 0，沒有新增遠程請求、`wx.request`、`wx.cloud` 或 Node.js Runtime API。

---

### Task 6: 完整驗證並停在提交前確認點

**Files:**
- Inspect only: all files changed by Tasks 1–5

- [ ] **Step 1: 執行完整工程門禁**

Run: `npm.cmd run verify`

Expected: exit code 0；記錄 format、lint、typecheck、tests、runtime-network、package size、assets、data:check 和 generate:check。

- [ ] **Step 2: 檢查最終變更範圍**

Run: `git status --short; git diff --stat; git diff --name-only -- archive data/master miniprogram/generated cloudfunctions miniprogram/pages/fleet/index.ts miniprogram/domain miniprogram/contracts`

Expected: 禁止目錄和 Controller/Domain/Contract 無變更；變更只包含 P5 文件、Disclosure 元件、Presenter、戰鬥頁 WXML/WXSS/JSON 和相關測試。

- [ ] **Step 3: 提供 DevTools 手動驗收清單**

由使用者在微信 DevTools 驗證 `320px`、`375px`、`393px`、`430px`：五列網格、11 個位置、候選技能貢獻、跨船移動文字、本船/全艦隊排除、四個折疊區塊、長文字、安全區和頁面級橫向溢出。

- [ ] **Step 4: 提交前停點**

展示變更文件、focused tests、`npm run verify` 結果、DevTools 待確認項目和擬用 message：`feat: 重構戰鬥配隊頁`。使用者明確確認前不執行 `git add`、`git commit` 或推送。
