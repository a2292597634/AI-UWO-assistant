# 自動配隊預覽設計

## 目標

以 Phase 1 的冒險配隊安全護欄為基線，建立戰鬥配隊與冒險配隊共用的「計算方案 → 差異預覽 → 使用者應用」事務流程。自動計算只產生不可變 `FleetProposal`，不直接修改目前 `FleetState`；只有使用者確認「應用方案」後才寫入艦隊，並提供一次撤銷。

本 Change 只處理方案、預覽、應用、取消與一次撤銷，不進行全域 Design System、配色、共用元件抽取或其他 Change 的頁面重構。

## 設計決策

### 1. Proposal 是 Solver 的唯一輸出

新增 `FleetProposal` 契約，使用 `readonly` 欄位保存：

- 方案來源：`battle` 或 `adventure`；
- 方案基於哪個目標船與目前 FleetState 序列化指紋；
- 建議保留的航海士 ID；冒險配隊使用全艦隊選擇結果，戰鬥配隊使用目前船選擇結果；
- 每個目標的預期等級、差異、是否達成與目前基線等級；
- 已達成數、目標總數、容量與鎖定約束；
- 可應用狀態、約束代碼與繁體中文說明。

Solver 只讀取輸入陣列與航海士資料，使用複製值生成 Proposal，不呼叫 `recalculateShip`、`addOfficerToShip` 或其他 FleetState 寫入函式。Proposal 以深層 `Object.freeze` 保持執行期不可變；輸入資料不被修改。

部分達成仍可預覽，讓使用者看見未達成目標。沒有候選、鎖定航海士超過容量、鎖定成員衝突或沒有可安全應用的成員選擇時，Proposal 顯示約束並禁止應用；不得以鎖定成員以外的清空結果靜默覆寫目前艦隊。

### 2. Presenter 統一差異預覽

新增共用 `buildFleetProposalPreview` Presenter。它接收目前 `FleetState`、Proposal、航海士名稱資料與技能名稱資料，純函式輸出預覽 ViewModel：

- 目標達成 `achieved / total` 與未達成目標；
- 技能 `目前等級 → 預期等級`、目標等級與差異；
- 保留、新增、移除航海士名稱；
- 鎖定成員清單及 `lockedAllRetained`；
- 約束、無解原因、容量限制與 `canApply`。

戰鬥與冒險頁只負責提供各自資料與套用策略，使用相同預覽欄位和相同繁體中文操作文案。這次不抽取 Change 4 的共享 WXML 元件，但兩頁使用相同的預覽結構與 class 命名。

### 3. Controller 事務流程

`onRecalculate`：

1. 讀取目前 FleetState 與目標；
2. 呼叫對應 Solver 生成 Proposal；
3. 只設定 `proposalPreview` 頁面狀態，保留艦隊、鎖定、排除、saved baseline 和 dirty 狀態。

`onProposalCancel`：清除預覽頁面狀態，不呼叫任何 Domain 寫入函式。

`onProposalApply`：

1. 比對 Proposal 基線指紋，若目前艦隊已改變則提示重新計算；
2. 保存應用前的完整 FleetState 快照；
3. 使用既有不可變 Domain transition 套用戰鬥目前船或冒險全艦隊結果；
4. 更新 dirty 狀態、關閉預覽並 render；
5. 暴露一次「撤銷本次配隊」。

`onUndoProposal` 只可成功一次，恢復快照中的所有船、成員、鎖定、排除、目標、封禁與 `needsReview`，重新計算 dirty 狀態後清除撤銷快照。保存、未保存攔截、版本衝突、Cloud Function 與配置版本欄位維持原流程。

### 4. 無解與安全邊界

- 空目標沿用 Phase 1 護欄，Controller 不呼叫 Solver；
- Solver 返回部分結果時，預覽必須列出未達成目標與原因；
- 容量不足與鎖定衝突以可讀約束顯示；
- 任何不可安全應用的 Proposal 都不能清空現有非鎖定成員；
- 所有鎖定成員須在 Proposal 和預覽中明確標記，且可應用方案不得遺失鎖定成員；
- 預覽開啟、取消和失敗路徑不改變 FleetState 對象內容或 dirty 狀態。

## 影響範圍

預計修改或新增：

- `miniprogram/contracts/fleet-proposal.ts`：Proposal、目標進度、約束與預覽資料契約；
- `miniprogram/domain/fleet-proposal.ts`：Proposal 建立、深層不可變處理、完整快照與套用策略；
- `miniprogram/domain/battle-fleet-solver.ts`、`miniprogram/domain/adventure-fleet-solver.ts`：輸出 Proposal 與約束資訊；
- `miniprogram/presenters/fleet-proposal-presenter.ts`：戰鬥/冒險共用差異預覽 Presenter；
- `miniprogram/pages/fleet/index.ts`、`miniprogram/pages/adventure-fleet/index.ts`：預覽、取消、應用、撤銷狀態與 Controller 事件；
- 兩頁 WXML/WXSS：相同預覽面板與安全區樣式；
- `tests/domain/fleet-proposal.test.ts`、`tests/domain/*fleet-solver.test.ts`、`tests/presenters/fleet-proposal-presenter.test.ts`、兩個 Page 測試：TDD 與回歸覆蓋。

不修改 `archive/`、`data/master/`、`miniprogram/generated/`、Cloud Function、配置保存服務契約或無關頁面。

## 測試策略

- Proposal：輸入與目前 FleetState 不被修改；Proposal 欄位不可變；應用前快照可完整恢復；
- 戰鬥 Solver：鎖定保留、容量/無解原因、部分目標進度與不修改輸入；
- 冒險 Solver：Lv.0 不參與、鎖定保留、容量/無解原因與不修改輸入；
- Presenter：目標差異、達成數、保留/新增/移除、鎖定保留與約束顯示；
- Controller：計算不改艦隊、取消完全不變、應用成員正確、撤銷恢復完整快照、無解不清空、原有保存與衝突流程回歸；
- 完整驗證：`npm run verify`。

## 不在本 Change

- 全域 Design System、配色、字體或大規模視覺重構；
- `ResultPreviewSheet` 等共享元件抽取；
- 戰鬥/冒險操作語義與成員網格重構；
- 新增依賴、遠程請求、`wx.request`、`wx.cloud` 或 Node.js Runtime API；
- 任何 Change 3 以後工作。
