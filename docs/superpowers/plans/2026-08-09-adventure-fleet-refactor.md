# 冒險配隊重構 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox（- [ ]）syntax for tracking.

**Goal:** 在不修改冒險配隊 Controller、Domain、Solver、資料與保存流程的前提下，完成優化目標／技能追蹤分離、折疊摘要與冒險頁窄屏資訊架構重排。

**Architecture:** Adventure Presenter 只增加 optimizationTargets 和 trackingTargets 兩個展示投影，保留既有 targets 以維持 Controller 相容性。冒險頁重用 P4 共享元件與 P5 的 disclosure-section，頁面仍持有所有事件 handler；WXSS 只清理本 Change 觸及的 Header、面板與候選狀態樣式。

**Tech Stack:** TypeScript、微信原生 WXML/WXSS、微信原生 Component、Vitest、Prettier、ESLint、既有 Design Foundation Token；不新增依賴。

## Global Constraints

- 涉及 UI、WXML 或 WXSS 的編碼前，完整閱讀 docs/superpowers/specs/2026-08-09-design-foundation-design.md。
- 所有 UI 文案、程式碼註釋、測試和文件使用繁體中文；WXML/WXSS 類名使用英文 BEM 風格。
- 不修改 archive/、data/master/、miniprogram/generated/、Cloud Function、Controller、Domain、Solver、配置保存或 runtime service。
- 不修改 miniprogram/pages/fleet/，不重做 P5，不新增新的共享元件。
- 不新增、刪除或升級依賴；不新增 wx.request、wx.cloud、遠程 URL 或 Node.js Runtime API。
- 不新增圖片、圖標、字體或大型視覺素材。
- optimizationTargets 僅包含 targetLevel > 0 的已配置目標；trackingTargets 僅包含 targetLevel === 0 的已配置目標；skillId === null 的空目標不得渲染。
- 保留 onAddTarget、onTargetPickerClose、onSkillSelect、onTargetSkillTap、onTargetLevelBlur、onRemoveTarget、onRecalculate、onProposalCancel、onProposalApply、onUndoProposal、onUnbanOfficer 既有事件語義。
- 重要操作熱區至少 88rpx；操作文字不小於 22rpx；長文字允許換行；固定底部操作遵守 env(safe-area-inset-bottom)。
- Presenter、資料映射、篩選或確定性展示邏輯遵循 RED → GREEN → REFACTOR；UI 結構以靜態契約與 DevTools 驗證。
- 工作分支為 codex/phase-6-冒險配隊重構，基線為 origin/main@8530519。
- 主工作樹既有未跟蹤 docs/audits/ 必須保留，不能複製、刪除或加入本 Phase 提交。
- 完成前必須執行 npm.cmd run verify；提交前展示變更文件、驗證結果、手動驗收項目和擬用 message，等待使用者確認，不執行 git add、git commit、merge 或 push。

---

## 文件與測試地圖

- Create: docs/superpowers/specs/2026-08-09-adventure-fleet-refactor-design.md — 本 Phase 設計邊界與 ViewModel 契約。
- Create: docs/superpowers/plans/2026-08-09-adventure-fleet-refactor.md — 可逐項執行的實施步驟。
- Modify: miniprogram/presenters/adventure-fleet-presenter.ts — 增加優化目標／技能追蹤展示投影。
- Modify: tests/presenters/adventure-fleet-presenter.test.ts — Presenter 分離契約與空目標回歸。
- Modify: miniprogram/pages/adventure-fleet/index.json — 註冊既有 disclosure-section。
- Modify: miniprogram/pages/adventure-fleet/index.wxml — 重排頁面、分離目標、折疊低頻區塊。
- Modify: miniprogram/pages/adventure-fleet/index.wxss — 移除重複 Header、清理偽禁用、補充 Token 化熱區與換行。
- Modify: tests/pages/adventure-fleet-page.test.ts — 頁面結構與既有流程回歸。

---

### Task 1: 鎖定 Presenter 目標分離契約

Files:
- Modify: tests/presenters/adventure-fleet-presenter.test.ts
- Inspect: docs/superpowers/specs/2026-08-09-adventure-fleet-refactor-design.md

Interfaces:
- buildAdventureFleetPageData(...) 保持既有參數和回傳型別。
- 回傳值新增可選展示欄位 optimizationTargets?: AdventureFleetTargetView[] 和 trackingTargets?: AdventureFleetTargetView[]。
- 回傳值既有 targets 保持全部已配置非空目標，canRecalculate 保持既有語義。

- [ ] Step 1: 寫正向目標與 Lv.0 追蹤的失敗測試

測試固定同時建立一個 targetLevel 2、一個 targetLevel 0 和一個 skillId null 的空目標，驗證：

    expect(page.optimizationTargets).toEqual([
      expect.objectContaining({ id: 'goal', targetLevel: 2, isTracking: false }),
    ])
    expect(page.trackingTargets).toEqual([
      expect.objectContaining({ id: 'tracking', targetLevel: 0, isTracking: true }),
    ])
    expect(page.targets).toHaveLength(2)

- [ ] Step 2: 執行 Presenter focused test 確認 RED

Run:

    npm.cmd test -- tests/presenters/adventure-fleet-presenter.test.ts

Expected：FAIL，原因是回傳資料尚未提供 optimizationTargets 或 trackingTargets；既有 canRecalculate 測試的失敗不得來自測試語法。

- [ ] Step 3: 記錄不修改 Domain 的邊界

確認測試只呼叫既有 buildAdventureFleetPageData 和 updateShipTargets，不新增 Domain helper、不改 getAdventureOptimizationTargets，再進入 Task 2。

---

### Task 2: 實作 Presenter 純展示投影

Files:
- Modify: miniprogram/presenters/adventure-fleet-presenter.ts
- Modify: tests/presenters/adventure-fleet-presenter.test.ts

Interfaces:
- AdventureFleetPageData 新增可選 optimizationTargets、trackingTargets。
- buildAdventureFleetPageData 以同一個 targetViews 先過濾，再輸出兩個展示陣列。

- [ ] Step 1: 擴充頁面資料型別

在 AdventureFleetPageData 的自動模式目標區域加入：

    optimizationTargets?: AdventureFleetTargetView[]
    trackingTargets?: AdventureFleetTargetView[]

欄位保持可選，因為 Controller 的既有 emptyPageData 不在本 Change 修改；render 後 Presenter 保證實際輸出兩個陣列。

- [ ] Step 2: 以既有 targetViews 建立兩個投影

先將 Presenter 內原本承載 getAdventureOptimizationTargets(fleetTargets) 結果的局部變數改名為 optimizationTargetsForSolver，避免與新的 WXML 展示欄位同名；其輸出內容與既有 Solver 輸入保持不變。

在 targetViews 建立後加入：

    const optimizationTargets = targetViews.filter((target) => target.targetLevel > 0)
    const trackingTargets = targetViews.filter((target) => target.targetLevel === 0)

在回傳物件中加入兩個欄位，保留 targets: targetViews 和既有 optimizationTargetCount、canRecalculate。

- [ ] Step 3: 執行 Presenter focused test 確認 GREEN

Run:

    npm.cmd test -- tests/presenters/adventure-fleet-presenter.test.ts

Expected：PASS；正向目標、Lv.0 追蹤、空目標過濾和既有 canRecalculate 測試全部通過。

- [ ] Step 4: 執行型別與格式檢查

Run:

    npx.cmd prettier --check miniprogram/presenters/adventure-fleet-presenter.ts tests/presenters/adventure-fleet-presenter.test.ts
    npm.cmd run typecheck

Expected：兩個命令均 exit code 0；不得修改 Controller 或 Domain。

---

### Task 3: 建立冒險頁結構 RED 契約

Files:
- Modify: tests/pages/adventure-fleet-page.test.ts
- Inspect: miniprogram/pages/adventure-fleet/index.json
- Inspect: miniprogram/pages/adventure-fleet/index.wxml

Interfaces:
- 頁面 JSON 註冊 disclosure-section，路徑為 ../../components/disclosure-section/index。
- WXML 使用 optimizationTargets、trackingTargets、default-expanded="{{false}}" 和既有事件 handler。

- [ ] Step 1: 寫頁面結構失敗測試

新增靜態契約，至少斷言：

    expect(adventureJson.usingComponents?.['disclosure-section']).toBe(
      '../../components/disclosure-section/index',
    )
    expect(adventureWxml).not.toContain('class="fleet-header"')
    expect(adventureWxml).toContain('class="fleet-context"')
    expect(adventureWxml).toContain('optimizationTargets')
    expect(adventureWxml).toContain('trackingTargets')
    expect(adventureWxml).toContain('title="技能追蹤"')
    expect(adventureWxml).toContain('title="全艦隊排除名單"')
    expect(adventureWxml).toContain('title="全艦隊冒險技能累計"')

另斷言既有 onAddTarget、onRemoveTarget、onTargetLevelBlur、onRecalculate、onProposalCancel、onProposalApply、onUndoProposal 和 onUnbanOfficer 仍出現在 WXML。

- [ ] Step 2: 執行頁面 focused test 確認 RED

Run:

    npm.cmd test -- tests/pages/adventure-fleet-page.test.ts

Expected：FAIL，原因限定為缺少 disclosure-section 註冊、目標分區或 Header/候選狀態契約；既有安全護欄和方案預覽測試不得成為失敗原因。

- [ ] Step 3: 檢查 P5 共享結構作為接入樣板

確認 miniprogram/pages/fleet/index.wxml 已以 fleet-context、disclosure-section、根層 result-preview-sheet 形成可重用結構；Task 4 僅套用到冒險頁，不修改戰鬥頁。

---

### Task 4: 重排冒險頁 WXML 與目標區域

Files:
- Modify: miniprogram/pages/adventure-fleet/index.json
- Modify: miniprogram/pages/adventure-fleet/index.wxml
- Modify: tests/pages/adventure-fleet-page.test.ts

Interfaces:
- ConfigBar、ModeTabs、SkillPickerSheet、ResultPreviewSheet、StatusBadge、EmptyState 和 OfficerActionSheet 的既有 properties/事件保持不變。
- 新增 disclosure-section 只接收 title、hint、count-label、default-expanded，不發出業務事件。

- [ ] Step 1: 註冊既有 DisclosureSection

在冒險頁 usingComponents 加入：

    "disclosure-section": "../../components/disclosure-section/index"

- [ ] Step 2: 移除重複 Header 並加入上下文列

刪除 fleet-header WXML，保留 config-bar 作為頁面第一個業務區塊，接著加入 fleet-context，顯示「冒險配隊」「全艦隊冒險配置」和「已配置 N / 77 個位置」。

- [ ] Step 3: 將自動模式目標拆成兩個展示區

自動模式使用 optimizationTargets 渲染可編輯目標列，保留 onTargetSkillTap、onTargetLevelBlur、onRemoveTarget；重新計算按鈕仍使用 disabled="{{!canRecalculate}}"。

技能追蹤使用 trackingTargets 和既有 onTargetSkillTap、onTargetLevelBlur、onRemoveTarget，並由 disclosure-section 預設收起。追蹤列顯示「Lv.0 僅供查看，不參與計算」，不得加入新的 Controller handler。

- [ ] Step 4: 將排除和技能累計改為預設收起

把既有 ban-panel 與 summary-panel 內容放入兩個 disclosure-section slot。排除內容保留 onUnbanOfficer，技能累計保留 status-badge、contributors 橫向滾動和 empty-state。

- [ ] Step 5: 將方案預覽放到主滾動容器外

保留 proposalPreview、canUndoProposal 和既有 onProposalCancel、onProposalApply、onUndoProposal 綁定。新增目標 SkillPickerSheet 和技能詳情 Sheet 也維持原有位置與事件。

- [ ] Step 6: 執行頁面 focused test 確認 GREEN

Run:

    npm.cmd test -- tests/pages/adventure-fleet-page.test.ts

Expected：頁面 JSON、目標區域、折疊區域、既有 handler 和方案預覽結構通過；冒險頁 Controller 行為測試全部通過。

---

### Task 5: 清理冒險頁 WXSS 與候選狀態

Files:
- Modify: miniprogram/pages/adventure-fleet/index.wxss
- Modify: tests/pages/adventure-fleet-page.test.ts

Interfaces:
- 新增或修改的冒險頁樣式使用 --uwo-* Token；不批量轉換未觸及的歷史樣式。
- candidate-row 顯示至少 88rpx 熱區；候選狀態使用文字，不以 opacity 作為唯一語義。

- [ ] Step 1: 加入 WXSS 失敗契約

新增靜態契約，至少斷言：

    expect(adventureWxss).toMatch(/\.fleet-context\s*\{[\s\S]*var\(--uwo-/)
    expect(adventureWxss).toMatch(/\.target-row\s*\{[\s\S]*min-height:\s*88rpx/)
    expect(adventureWxss).toMatch(/\.candidate-row\s*\{[\s\S]*min-height:\s*88rpx/)
    expect(adventureWxss).toContain('overflow-wrap: anywhere')
    expect(adventureWxss).not.toMatch(/\.candidate-row--disabled\s*\{[\s\S]*opacity\s*:/)

- [ ] Step 2: 執行頁面測試確認 RED

Run:

    npm.cmd test -- tests/pages/adventure-fleet-page.test.ts

Expected：FAIL，原因是現有 Header、目標列和候選列樣式尚未符合 P6 契約。

- [ ] Step 3: 移除 Header 與重複面板樣式

刪除只服務 fleet-header 的規則，將 target-panel、ban-panel、summary-panel 的新增或調整限制在 slot 內容所需的布局；不修改配置 modal、圖片回退、既有元件樣式或無關頁面樣式。

- [ ] Step 4: 實作 Token 化上下文、目標列與追蹤列

使用 P3 Token 的 fleet-context、target-row、tracking-row 和操作樣式，至少包含 min-height: 88rpx 與 overflow-wrap: anywhere。具體 margin、padding、font-size、color、border 和 radius 只使用規格指定的 --uwo-* Token；刪除目標保留至少 88rpx 的可點擊熱區。

- [ ] Step 5: 移除候選列低透明度偽禁用

WXML 不再輸出 candidate-row--disabled；WXSS 移除該規則，保留 candidate-row__status 的可換行文字和 statusLabel/shipLabel 展示。

- [ ] Step 6: 執行 focused test 與格式檢查確認 GREEN

Run:

    npm.cmd test -- tests/pages/adventure-fleet-page.test.ts
    npx.cmd prettier --check miniprogram/pages/adventure-fleet/index.json miniprogram/pages/adventure-fleet/index.wxml miniprogram/pages/adventure-fleet/index.wxss tests/pages/adventure-fleet-page.test.ts

Expected：頁面結構、Token、熱區、換行和狀態文字契約全部通過。

---

### Task 6: P6 focused 回歸與禁止範圍檢查

Files:
- Inspect: Tasks 1–5 的所有變更文件

- [ ] Step 1: 執行 P6 focused suite

Run:

    npm.cmd test -- tests/presenters/adventure-fleet-presenter.test.ts tests/pages/adventure-fleet-page.test.ts tests/architecture/fleet-shared-components.test.ts tests/architecture/fleet-disclosure.test.ts tests/domain/fleet-proposal.test.ts tests/presenters/fleet-proposal-presenter.test.ts

Expected：PASS；冒險目標分離、技能選擇、移除目標、重新計算、方案預覽、取消、套用、撤銷、保存相關既有回歸均通過。

- [ ] Step 2: 執行禁止範圍檢查

Run:

    git diff --name-only -- archive data/master miniprogram/generated miniprogram/pages/adventure-fleet/index.ts miniprogram/domain miniprogram/contracts miniprogram/runtime cloudfunctions package.json package-lock.json

Expected：無輸出。若有輸出，停止並報告，不自行修正或擴張範圍。

- [ ] Step 3: 執行網路與差異檢查

Run:

    npm.cmd run check:runtime-network
    git diff --check

Expected：exit code 0，沒有新增網路 API、Node.js Runtime API 或 whitespace error。

---

### Task 7: 完整驗證與提交前停點

Files:
- Inspect: 所有本 Phase 變更文件

- [ ] Step 1: 執行完整工程門禁

Run:

    npm.cmd run verify

Expected：exit code 0；記錄 format、lint、typecheck、test、runtime-network、package size、assets、data:check 和 generate:check 結果。

- [ ] Step 2: 核對完整變更清單與主工作樹未跟蹤文件

Run:

    git status --short
    git diff --stat
    git diff --name-only
    git -C 'E:/AI UWO assistant' status --short --branch

Expected：Phase 6 工作區只包含本計畫指定文件；主工作樹的 docs/audits/ 仍為既有未跟蹤文件，不出現在 Phase 6 工作區提交範圍。

- [ ] Step 3: 提供微信 DevTools 手動驗收清單

由使用者在 320px、375px、393px、430px 檢查優化目標／技能追蹤分區、折疊區塊、候選狀態、方案預覽、安全區、長文字和頁面級橫向溢出。Agent 不使用 computer-use。

- [ ] Step 4: 提交前停點

展示完整變更文件、驗證結果、仍需手動驗收項目和擬用 message：

    feat: 重構冒險配隊頁

在使用者明確確認前，不執行 git add、git commit、merge 或 push。
