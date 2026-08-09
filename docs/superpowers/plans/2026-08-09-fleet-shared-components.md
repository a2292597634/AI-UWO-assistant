# 配隊共享元件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox ( - [ ] ) syntax for tracking.

**Goal:** 在不改變戰鬥配隊與冒險配隊業務行為的前提下，抽取並接入七個共享微信元件，集中管理重複的配置欄、模式切換、成員操作、技能選擇、結果預覽、狀態與空狀態界面。

**Architecture:** 使用微信原生 Component 建立展示元件；元件透過 properties 接收頁面 ViewModel，透過 triggerEvent 將操作交回既有 Page Controller。頁面仍負責 Solver、Presenter、FleetState、配置保存、衝突保護和所有資料讀寫；P4 只替換重複 WXML/WXSS，不新增交互語義。

**Tech Stack:** TypeScript、微信小程序 WXML/WXSS、微信原生 Component、Vitest、既有 Design Foundation Token。

## Global Constraints

- 涉及 UI、WXML 或 WXSS 的編碼前，完整閱讀 docs/superpowers/specs/2026-08-09-design-foundation-design.md。
- 所有 UI 文案、程式碼註釋、測試和文件使用繁體中文；WXML/WXSS 類名使用英文 BEM 風格。
- 不修改 archive/、data/master/、miniprogram/generated/、Cloud Function、Controller、Presenter、Domain 或 Solver 的業務規則。
- 不新增、刪除或升級依賴，不新增 wx.request、wx.cloud、遠程 URL 或 Node.js Runtime API。
- 不新增圖像素材或生圖；SVG、CSS 圖標和純代碼視覺效果不使用生圖流程。
- 組件只能展示與轉發事件，不直接 import Domain、Presenter、runtime service、資料生成模組或配置服務。
- 既有配置保存、未保存攔截、版本衝突和 Cloud Function 流程必須保持原有事件順序與結果。
- 新增或修改樣式只能使用 P3 Design Foundation 的 Token、字體、間距、圓角、陰影、狀態、觸控和安全區規範。
- 操作文字不小於 22rpx；重要操作熱區最小 88rpx；長文字允許換行；固定底部區使用 env(safe-area-inset-bottom)。
- 每個新行為先寫失敗測試並確認預期失敗，再寫最小實作；每項任務完成後執行 focused tests。
- 工作分支為 codex/phase-4-配隊共享元件，基線為 origin/main 的 511c337。

---

## 文件與測試地圖

- Create: miniprogram/components/config-bar/index.{ts,wxml,wxss,json} — 配置名稱、保存狀態和配置菜單入口展示。
- Create: miniprogram/components/mode-tabs/index.{ts,wxml,wxss,json} — 手動/自動模式切換。
- Create: miniprogram/components/officer-action-sheet/index.{ts,wxml,wxss,json} — 成員鎖定、解鎖、移除、排除操作展示；variant 支援 slot/card 既有版式。
- Create: miniprogram/components/skill-picker-sheet/index.{ts,wxml,wxss,json} — 技能類型、分類、搜尋、列表、詳情和選擇事件；presentation 支援 inline/sheet。
- Create: miniprogram/components/result-preview-sheet/index.{ts,wxml,wxss,json} — 自動配隊結果預覽、約束、取消、應用和撤銷。
- Create: miniprogram/components/status-badge/index.{ts,wxml,wxss,json} — 已達成、未達成、需復核、錯誤文字狀態。
- Create: miniprogram/components/empty-state/index.{ts,wxml,wxss,json} — 空列表標題、說明和可選操作。
- Create: tests/architecture/fleet-shared-components.test.ts — 組件文件、Token、事件和觸控架構契約。
- Modify: miniprogram/pages/fleet/index.json, index.wxml, index.wxss — 註冊並接入共享組件，保留現有 handler。
- Modify: miniprogram/pages/adventure-fleet/index.json, index.wxml, index.wxss — 註冊並接入共享組件，保留現有 handler。
- Modify: tests/pages/fleet-page.test.ts, tests/pages/adventure-fleet-page.test.ts — 頁面事件和組件綁定回歸。

---

### Task 1: 建立組件架構紅燈契約

Files:
- Create: tests/architecture/fleet-shared-components.test.ts
- Inspect: docs/superpowers/specs/2026-08-09-fleet-shared-components-design.md

Interfaces:
- 契約測試固定七個組件目錄、四件文件、指定事件名和指定 P3 Token。
- 契約測試固定兩個配隊頁的 usingComponents 註冊路徑和共享標籤名稱。

- [ ] Step 1: 寫組件缺失時必定失敗的架構測試

測試應遍歷 config-bar、mode-tabs、officer-action-sheet、skill-picker-sheet、result-preview-sheet、status-badge、empty-state，斷言每個目錄存在 index.ts、index.wxml、index.wxss、index.json；另斷言兩個配隊頁 JSON 註冊共享元件、WXML 使用共享標籤。

- [ ] Step 2: 執行架構測試確認它因文件不存在而失敗

Run: npm.cmd test -- tests/architecture/fleet-shared-components.test.ts

Expected: FAIL；失敗原因必須是組件文件或頁面註冊尚不存在，不得是測試語法錯誤。

- [ ] Step 3: 檢查失敗輸出並固定契約清單

確認失敗輸出列出七個組件或其缺失文件，記錄後進入 Task 2；不修改測試來掩蓋缺失文件。

---

### Task 2: 實作 ConfigBar、ModeTabs 和基礎狀態元件

Files:
- Create: miniprogram/components/config-bar/index.ts
- Create: miniprogram/components/config-bar/index.wxml
- Create: miniprogram/components/config-bar/index.wxss
- Create: miniprogram/components/config-bar/index.json
- Create: miniprogram/components/mode-tabs/index.ts
- Create: miniprogram/components/mode-tabs/index.wxml
- Create: miniprogram/components/mode-tabs/index.wxss
- Create: miniprogram/components/mode-tabs/index.json
- Create: miniprogram/components/status-badge/index.ts
- Create: miniprogram/components/status-badge/index.wxml
- Create: miniprogram/components/status-badge/index.wxss
- Create: miniprogram/components/status-badge/index.json
- Create: miniprogram/components/empty-state/index.ts
- Create: miniprogram/components/empty-state/index.wxml
- Create: miniprogram/components/empty-state/index.wxss
- Create: miniprogram/components/empty-state/index.json
- Test: tests/architecture/fleet-shared-components.test.ts

Interfaces:
- ConfigBar properties：configName、configStatus、authStatus、activeConfigId、showMenu；事件：info-tap、login-tap、menu-tap、save、save-as、rename、delete、new。
- ModeTabs properties：value、options；事件：change，detail 為 { value: string }。
- StatusBadge properties：status、label、description；不直接發出業務事件。
- EmptyState properties：title、description、actionLabel、showAction；事件：action。

- [ ] Step 1: 擴充紅燈測試，鎖定 WXML 事件和語義文字

斷言 ConfigBar 具備 config-bar__status 和保存事件；ModeTabs 具備 change；StatusBadge 具備四個狀態類別與 ui-status__label；EmptyState 具備說明文字和 action。所有新增操作類別必須含 min-height: 88rpx 或由內部 .ui-button 提供。

- [ ] Step 2: 執行 focused test 確認新增契約仍失敗

Run: npm.cmd test -- tests/architecture/fleet-shared-components.test.ts

Expected: FAIL；失敗原因是四個組件尚未存在或缺少指定事件/狀態類別。

- [ ] Step 3: 寫最小原生 Component 和 WXML

每個 index.ts 使用 Component({ properties, methods })。事件 method 只呼叫 this.triggerEvent，例如 ModeTabs 的 onChange 將 event.currentTarget.dataset.value 轉成 detail。WXML 使用 BEM 類名、可見繁體中文文字和 data-* ID；不 import 任何頁面或業務模組。ConfigBar 只包含頂部配置欄和菜單操作入口，配置列表、命名、未保存和衝突對話框維持頁面現有結構。

- [ ] Step 4: 使用 P3 Token 寫最小 WXSS

所有新增顏色、字體、間距、圓角和陰影使用 var(--uwo-...)；.mode-tabs__item、.config-bar__menu、空狀態操作和狀態標籤的觸控高度不得低於 88rpx，StatusBadge 始終渲染文字。固定底部操作不在本任務新增。

- [ ] Step 5: 執行架構測試確認通過

Run: npm.cmd test -- tests/architecture/fleet-shared-components.test.ts

Expected: 本任務新增的四個基礎組件契約通過；整份架構文件仍可能因 Task 3-6 尚未建立的元件與頁面接線保持預期 RED。

---

### Task 3: 實作 OfficerActionSheet

Files:
- Create: miniprogram/components/officer-action-sheet/index.ts
- Create: miniprogram/components/officer-action-sheet/index.wxml
- Create: miniprogram/components/officer-action-sheet/index.wxss
- Create: miniprogram/components/officer-action-sheet/index.json
- Modify: tests/architecture/fleet-shared-components.test.ts

Interfaces:
- Properties：officerId、status: normal | locked、variant: slot | card、allowBan、disabledActions。
- Events：lock、remove、ban，detail 統一為 { officerId: string }。

- [ ] Step 1: 寫操作集合和禁用規則紅燈測試

斷言 normal 狀態顯示「鎖定」，locked 狀態顯示「解鎖」；始終顯示「移除」；allowBan 為 true 才顯示「排除」；disabledActions 對應操作輸出 disabled 或 aria-disabled 語義；所有操作有 data-action 和 data-id。

- [ ] Step 2: 執行 focused test 確認失敗

Run: npm.cmd test -- tests/architecture/fleet-shared-components.test.ts

Expected: FAIL；失敗原因是 OfficerActionSheet 文件或操作語義尚不存在。

- [ ] Step 3: 實作純展示操作元件

按 variant 輸出既有 slot/card 的 BEM 包裝類，但不新增遮罩、打開、關閉或排序流程。每個操作 method 只從 event.currentTarget.dataset.id 取得航海士 ID，再觸發對應事件；不直接執行鎖定、移除或排除。

- [ ] Step 4: 使用 88rpx 熱區和禁用文字語義

操作容器使用 min-height: 88rpx，文字不低於 22rpx；禁用操作同時提供 disabled/aria-disabled 語義，不只依賴灰色。

- [ ] Step 5: 執行 focused test 確認通過

Run: npm.cmd test -- tests/architecture/fleet-shared-components.test.ts

Expected: 本任務新增的操作集合、狀態文字、ID 轉發和觸控契約通過；整份架構文件仍可能因 Task 4-6 尚未建立的元件與頁面接線保持預期 RED。

---

### Task 4: 實作 SkillPickerSheet

Files:
- Create: miniprogram/components/skill-picker-sheet/index.ts
- Create: miniprogram/components/skill-picker-sheet/index.wxml
- Create: miniprogram/components/skill-picker-sheet/index.wxss
- Create: miniprogram/components/skill-picker-sheet/index.json
- Modify: tests/architecture/fleet-shared-components.test.ts

Interfaces:
- Properties：presentation: inline | sheet、visible、skillKinds、skillCategories、skills、selectedSkillId、searchText、hasMore、selectionLabel。
- Events：dismiss、kind-change、category-change、search-input、skill-tap、select、reach-end。

- [ ] Step 1: 寫技能列表、搜尋、選擇和多行文字紅燈測試

斷言 WXML 具備類型 tabs、分類 tabs、搜尋 input、技能列表、詳情入口、選擇入口和 reach-end；presentation 同時存在 inline/sheet 分支；技能名稱、分類和描述均允許換行；空列表包含「沒有符合」或「請先選擇」語義。

- [ ] Step 2: 執行 focused test 確認失敗

Run: npm.cmd test -- tests/architecture/fleet-shared-components.test.ts

Expected: FAIL；失敗原因是 SkillPickerSheet 文件或指定事件/空狀態尚不存在。

- [ ] Step 3: 實作最小 Component 和兩種展示模式

將目前兩頁共用的技能類型、分類、搜尋與列表 WXML 移入元件；保留頁面專屬的候選航海士區、目標建立策略和詳情 Sheet 狀態。inline 只渲染內容容器，sheet 增加既有遮罩和安全區包裝；兩者共用同一組事件。

- [ ] Step 4: 實作 Token、長文字和安全區 WXSS

列表描述使用 overflow-wrap: anywhere 或等效換行規則；Sheet padding 使用 calc(... + env(safe-area-inset-bottom))；所有操作熱區至少 88rpx，不增加固定超視口寬度。

- [ ] Step 5: 執行 focused test 確認通過

Run: npm.cmd test -- tests/architecture/fleet-shared-components.test.ts

Expected: 本任務新增的技能列表、事件、兩種展示、空狀態、長文字和安全區契約通過；整份架構文件仍可能因 Task 5-6 尚未建立的元件與頁面接線保持預期 RED。

---

### Task 5: 實作 ResultPreviewSheet

Files:
- Create: miniprogram/components/result-preview-sheet/index.ts
- Create: miniprogram/components/result-preview-sheet/index.wxml
- Create: miniprogram/components/result-preview-sheet/index.wxss
- Create: miniprogram/components/result-preview-sheet/index.json
- Modify: tests/architecture/fleet-shared-components.test.ts

Interfaces:
- Properties：visible、preview: FleetProposalPreviewView | null、canUndo。
- Events：cancel、apply、undo。

- [ ] Step 1: 寫預覽差異、狀態文字和禁用應用紅燈測試

斷言 WXML 顯示目標達成數、技能「目前 Lv. → 預期 Lv.」、保留/新增/移除、鎖定保留、約束訊息、取消和應用；canApply 為 false 時應用按鈕使用 disabled 語義；狀態至少輸出「已達成」「差 Lv.」「有成員未保留」或約束原因；canUndo 顯示一次撤銷入口。

- [ ] Step 2: 執行 focused test 確認失敗

Run: npm.cmd test -- tests/architecture/fleet-shared-components.test.ts

Expected: FAIL；失敗原因是 ResultPreviewSheet 文件或差異展示契約尚不存在。

- [ ] Step 3: 移入兩頁完全共用的預覽 WXML

將兩頁目前 proposal-preview-mask、proposal-preview-sheet 和撤銷條的重複結構抽成元件；保留現有 FleetProposalPreviewView 欄位名稱與 onProposalCancel、onProposalApply、onUndoProposal 頁面 handler。元件不重新計算 buildFleetProposalPreview，不修改 Proposal。

- [ ] Step 4: 使用 P3 Button、Status 和 Sheet Token

應用按鈕使用 .ui-button 變體或等效 P3 Token 規則，取消使用次要樣式；固定底部 Sheet 使用 --uwo-radius-sheet、--uwo-shadow-sheet 和安全區 padding；禁用原因保持可見文字。

- [ ] Step 5: 執行 focused test 確認通過

Run: npm.cmd test -- tests/architecture/fleet-shared-components.test.ts

Expected: 本任務新增的預覽欄位、禁用、狀態文字、事件和安全區契約通過；整份架構文件仍可能因 Task 6 尚未完成頁面接線保持預期 RED。

---

### Task 6: 接入戰鬥與冒險配隊頁

Files:
- Modify: miniprogram/pages/fleet/index.json
- Modify: miniprogram/pages/fleet/index.wxml
- Modify: miniprogram/pages/fleet/index.wxss
- Modify: miniprogram/pages/adventure-fleet/index.json
- Modify: miniprogram/pages/adventure-fleet/index.wxml
- Modify: miniprogram/pages/adventure-fleet/index.wxss
- Modify: tests/pages/fleet-page.test.ts
- Modify: tests/pages/adventure-fleet-page.test.ts

Interfaces:
- 兩頁 JSON 註冊相同組件名稱和相對路徑；WXML 使用 config-bar、mode-tabs、officer-action-sheet、skill-picker-sheet、result-preview-sheet、status-badge、empty-state。
- 現有頁面 handler 名稱保持不變；組件事件的 detail 映射到原 handler 所需的 data-*。

- [ ] Step 1: 寫頁面接入紅燈測試

在兩個頁面測試中加入靜態契約：JSON 註冊七個組件；WXML 含共享標籤且不再包含相同的 proposal-preview-sheet、技能列表和成員操作重複塊；原有 handler 名稱仍存在；預覽事件仍綁定取消/應用/撤銷。

- [ ] Step 2: 執行兩個頁面 focused tests 確認失敗

Run: npm.cmd test -- tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts

Expected: FAIL；失敗原因是兩頁尚未註冊或使用共享元件，而不是 Controller 行為失敗。

- [ ] Step 3: 註冊組件並替換配置欄、模式和成員操作標記

在兩個 index.json 加入相同 usingComponents；將頁面現有 props 映射至 ConfigBar 和 ModeTabs；以 OfficerActionSheet 替換 slot/card 操作塊，保留 onOfficerLock、onOfficerRemove 和 onBanOfficer 的原綁定語義；配置列表、命名、未保存和衝突對話框不移動。

- [ ] Step 4: 替換技能選擇和結果預覽標記

戰鬥頁使用 presentation="inline" 的 SkillPickerSheet，冒險頁依目前入口使用 inline 或 sheet；兩頁共用 ResultPreviewSheet，將 proposalPreview、canUndoProposal 和原有 handler 透傳；把重複的 inline-empty 狀態映射至 EmptyState 或 StatusBadge，不改資料來源。

- [ ] Step 5: 清理頁面重複 WXSS 並保留必要頁面布局

刪除只服務已抽取 WXML 的重複樣式，保留頁面專屬 grid、候選區、目標區、配置 modal 和圖片錯誤回退樣式。新增樣式只使用 P3 Token；不批量格式化無關 CSS。

- [ ] Step 6: 執行頁面 focused tests 確認通過

Run: npm.cmd test -- tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts tests/architecture/fleet-shared-components.test.ts

Expected: PASS；兩頁組件註冊、WXML 事件、既有 Controller handler、方案預覽和回歸案例全部通過。

---

### Task 7: 完整驗證、DevTools 驗收與提交前停點

Files:
- Inspect: all files changed by Tasks 1–6
- Test: focused component and page suites

- [ ] Step 1: 執行完整 focused suite

Run: npm.cmd test -- tests/architecture/fleet-shared-components.test.ts tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts tests/domain/fleet-proposal.test.ts tests/presenters/fleet-proposal-presenter.test.ts

Expected: PASS，無未處理錯誤或警告。

- [ ] Step 2: 執行完整工程門禁

Run: npm.cmd run verify

Expected: exit code 0；記錄 format、lint、typecheck、test、runtime-network、package size、assets、data:check 和 generate:check 結果。

- [ ] Step 3: 執行範圍和網路邊界檢查

Run: git diff --check; git status --short; git diff --name-only -- archive data/master miniprogram/generated cloudfunctions; npm.cmd run check:runtime-network

Expected: 禁止目錄沒有變更；沒有新增遠程請求、wx.request、wx.cloud 或 Node.js Runtime API；變更僅限共享元件、兩個配隊頁、相關測試與 P4 文件。

- [ ] Step 4: 由使用者手動在微信 DevTools 驗收四種寬度

Agent 不使用 computer-use、不控制使用者電腦；最終報告提供 320px、375px、393px、430px 的配置欄、模式切換、成員操作、技能選擇、結果預覽、長文字、安全區與橫向溢出檢查清單，由使用者手動確認後記錄為 DevTools 驗收結果。

- [ ] Step 5: 顯示提交前報告並等待確認

展示變更文件、focused tests、npm run verify、DevTools 結果和擬用 Commit Message：

feat: 抽取配隊共享元件

在使用者明確確認前不執行 git commit.
