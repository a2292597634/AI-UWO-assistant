# 配隊目標與戰鬥技能篩選緊湊化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 縮小戰鬥與冒險配隊目標控件的實際視覺與觸控熱區，降低目標行高度，並讓戰鬥技能篩選列在窄屏顯示更多按鈕。

**Architecture:** 保留既有 WXML 結構、事件和資料綁定，只在共用 `skill-picker-sheet` 的 `inline` 模式以及兩個頁面的目標行 WXSS 中加入緊湊尺寸規則。冒險頁只移除追蹤目標列的重複狀態文字，區塊提示與配隊邏輯不變。頁面結構測試直接讀取 WXML/WXSS，作為 UI 契約回歸保護。

**Tech Stack:** 微信小程序 WXML/WXSS、TypeScript、Vitest、Prettier、ESLint。

## Global Constraints

- 代碼註釋、文檔、與用戶交互使用中文；WXML/WXSS 類名維持英文 BEM 風格。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`。
- 不新增依賴，不修改 Controller、Presenter、Domain、Solver、配置保存流程、事件名稱或資料結構。
- 新增或修改 WXSS 必須使用 Design Foundation 的 Token、字體、間距、圓角和狀態規範。
- 本次確認的控件熱區可以縮小；目標控件約 `56rpx` 高，戰鬥內嵌篩選 Tab 約 `48rpx` 高。
- 先寫測試並確認因現有實作而失敗，再寫最小實作；完成前執行相關測試、`npm run verify` 和 `git diff --check`。

---

### Task 1: 建立緊湊控件的失敗契約

**Files:**
- Modify: `tests/pages/fleet-page.test.ts`
- Modify: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- Consumes: 現有頁面 WXML/WXSS 文字快照與既有目標控件測試。
- Produces: 對戰鬥/冒險目標行、內嵌技能選擇器尺寸和追蹤狀態文字的可執行回歸契約。

- [ ] **Step 1: 寫失敗測試**

在 `tests/pages/fleet-page.test.ts` 讀取 `miniprogram/components/skill-picker-sheet/index.wxss`，並把既有「full-size target controls」測試改為緊湊尺寸契約：

```ts
const skillPickerWxss = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/components/skill-picker-sheet/index.wxss'),
  'utf8',
)

it('uses compact target controls and inline skill picker controls', () => {
  expect(fleetWxss).toMatch(/\.target-row\s*\{[\s\S]*min-height:\s*64rpx/)
  expect(fleetWxss).toMatch(/\.level-input\s*\{[\s\S]*min-height:\s*56rpx/)
  expect(fleetWxss).toMatch(/\.target-row__remove\s*\{[\s\S]*min-height:\s*56rpx/)
  expect(skillPickerWxss).toMatch(
    /\.skill-picker-sheet--inline \.skill-picker-sheet__tab\s*\{[\s\S]*min-height:\s*48rpx[\s\S]*padding:\s*0 var\(--uwo-space-2\);/,
  )
  expect(skillPickerWxss).toMatch(
    /\.skill-picker-sheet--inline \.skill-picker-sheet__select\s*\{[\s\S]*min-height:\s*56rpx/,
  )
})
```

在 `tests/pages/adventure-fleet-page.test.ts` 把現有 88rpx 目標控件斷言改為 `target-row`、`level-input` 和 `target-row__remove` 的 `64rpx/56rpx` 緊湊契約，並新增：

```ts
it('removes the duplicate tracking status from target rows', () => {
  expect(adventureWxml).not.toContain('class="tracking-row__state"')
  expect(adventureWxml).not.toContain('技能追蹤 · 不參與計算')
  expect(adventureWxml).toContain('hint="Lv.0 僅供查看，不參與計算"')
})
```

- [ ] **Step 2: 執行測試確認 RED**

Run:

```powershell
npm test -- tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
```

Expected: FAIL；失敗原因必須是現有 WXSS 仍使用 `88rpx`，或冒險 WXML 仍包含 `tracking-row__state`，不是測試語法或路徑錯誤。

---

### Task 2: 縮小共用內嵌技能選擇器

**Files:**
- Modify: `miniprogram/components/skill-picker-sheet/index.wxss:25-48,122-138,234-242`

**Interfaces:**
- Consumes: Task 1 的 `skillPickerWxss` 尺寸契約。
- Produces: 僅在 `presentation="inline"` 時使用 `48rpx` 篩選 Tab、較小水平內距和 `56rpx` 技能選擇按鈕；sheet 模式保持現有尺寸。

- [ ] **Step 1: 寫最小實作**

調整 inline 覆蓋規則，使內嵌篩選與技能選擇控件不再由 `88rpx` 視覺高度撐高：

```wxss
.skill-picker-sheet--inline .skill-picker-sheet__tab {
  min-height: 48rpx;
  padding: 0 var(--uwo-space-2);
  white-space: nowrap;
}

.skill-picker-sheet--inline .skill-picker-sheet__select {
  min-height: 56rpx;
  padding: 0 var(--uwo-space-2);
}
```

同步把內嵌 Tab 之間的 gap 從 `--uwo-space-2` 改為 `--uwo-space-1`，保留 `scroll-x`、選中樣式與事件不變。不要修改 `.skill-picker-sheet--sheet` 或非 inline 的基礎尺寸規則。

- [ ] **Step 2: 執行相關測試確認 GREEN**

Run:

```powershell
npm test -- tests/pages/fleet-page.test.ts
```

Expected: Task 1 中關於 `skillPickerWxss` 的斷言通過；頁面其他測試保持通過。

---

### Task 3: 縮小戰鬥與冒險目標行控件

**Files:**
- Modify: `miniprogram/pages/fleet/index.wxss:307-361`
- Modify: `miniprogram/pages/adventure-fleet/index.wxss:164-272,274-323`

**Interfaces:**
- Consumes: Task 1 的兩個頁面緊湊尺寸契約。
- Produces: 兩頁目標行使用較小的行內控件，不改變 `bindtap`、`bindblur`、`data-id` 或配隊狀態。

- [ ] **Step 1: 寫最小實作**

兩個頁面的目標行採用同一組尺寸語義：

```wxss
.target-row {
  min-height: 64rpx;
  padding: var(--uwo-space-2) 0;
}

.level-input {
  min-height: 56rpx;
  padding: var(--uwo-space-1);
}

.target-row__remove {
  min-height: 56rpx;
  padding: 0 var(--uwo-space-1);
}
```

冒險頁的 `.tracking-row` 同步使用 `min-height: 64rpx` 和 `padding: var(--uwo-space-2) 0`，並移除不再需要的追蹤狀態文字專用樣式；保留技能名稱、技能描述、等級輸入和刪除事件。

- [ ] **Step 2: 執行頁面測試確認 GREEN**

Run:

```powershell
npm test -- tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
```

Expected: 兩個頁面的緊湊控件尺寸契約通過，既有 Controller 行為測試與結構測試不回退。

---

### Task 4: 移除冒險追蹤目標的重複提示

**Files:**
- Modify: `miniprogram/pages/adventure-fleet/index.wxml:128-139`

**Interfaces:**
- Consumes: Task 1 的追蹤文字移除契約。
- Produces: 追蹤目標列不再渲染 `tracking-row__state`，區塊 `disclosure-section` 的 `hint` 保留。

- [ ] **Step 1: 刪除重複 WXML 節點**

刪除以下節點，其他目標列結構保持原樣：

```xml
<text class="tracking-row__state">技能追蹤 · 不參與計算</text>
```

- [ ] **Step 2: 執行測試確認通過**

Run:

```powershell
npm test -- tests/pages/adventure-fleet-page.test.ts
```

Expected: 追蹤目標不再包含重複狀態文字，區塊級提示仍存在。

---

### Task 5: 全量驗證與變更範圍檢查

**Files:**
- Verify: `miniprogram/components/skill-picker-sheet/index.wxss`
- Verify: `miniprogram/pages/fleet/index.wxss`
- Verify: `miniprogram/pages/adventure-fleet/index.wxss`
- Verify: `miniprogram/pages/adventure-fleet/index.wxml`
- Verify: `tests/pages/fleet-page.test.ts`
- Verify: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4 的已通過測試與修改。
- Produces: 可交付的最小差異、格式化和全量門禁證據。

- [ ] **Step 1: 檢查差異只包含本任務文件**

Run:

```powershell
git status --short
git diff --stat
git diff --check
```

確認不包含 `archive/`、`data/master/`、`miniprogram/generated/`、Controller、Presenter、Domain、Solver 或依賴文件；已有未追蹤審計文件不加入本次變更。

- [ ] **Step 2: 執行全量驗證**

Run:

```powershell
npm run verify
```

Expected: `format:check`、`lint`、`typecheck`、全部 Vitest、runtime network、package size、資產、資料和生成檢查均退出碼 0。

- [ ] **Step 3: 重新檢查需求清單**

確認：

1. 戰鬥與冒險目標行的技能選擇、刪除和等級輸入控件已縮小實際熱區。
2. 戰鬥內嵌技能篩選按鈕使用更小高度和間距，能顯示更多選項。
3. 冒險追蹤目標列不再顯示「技能追蹤 · 不參與計算」，區塊級提示仍保留。
4. 既有事件、資料綁定和配隊行為未修改。

- [ ] **Step 4: 提交前停下展示變更與驗證結果**

列出變更文件、驗證結果和擬用 commit message，等待用戶確認後才執行 commit；本計劃不授權自動提交。
