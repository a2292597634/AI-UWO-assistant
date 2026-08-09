# 冒險配隊安全護欄設計

> 依據 `docs/audits/2026-08-09-ui-ux-final-audit.md` 的 Change 1；本文件尚未提交。

## 目標

保留預先配置的 Lv.0 技能追蹤目標，同時阻止真正的空目標、Lv.0 誤入 Solver，以及無有效目標時的自動重算清空現有艦隊。

本 Change 只處理冒險配隊的資料語義、目標入口與安全護欄；不實作 Change 2 的方案預覽、應用、取消或撤銷，也不進行 Design System、配色或頁面視覺改版。

## 背景與現況

目前冒險頁使用既有 `FleetTarget` 結構保存目標。新艦隊會把所有可用冒險技能預先寫成 `skillId != null` 且 `targetLevel === 0` 的目標，以便使用者不必逐一新增；切換自動模式時，底層共用轉換還可能建立 `skillId === null` 的暫存空目標。

目前存在三個風險：

1. `onAddTarget` 直接建立 `skillId: null` 的目標列，但自動模式沒有後續選技入口；
2. `onRecalculate` 只要找不到 Lv.1 以上目標，就把推薦名單退化為鎖定成員並清除其他成員；
3. Solver 與保存契約沒有明確區分可保存的 Lv.0 追蹤目標和參與最佳化的 Lv.1–Lv.10 目標。

## 設計決策

### 1. 保留現有目標資料結構

不新增第二套配置 schema，也不移除預先配置的技能。`FleetTarget` 的語義明確化如下：

| 狀態 | 語義 | 是否保存 | 是否進入 Solver |
| --- | --- | --- | --- |
| `skillId != null`, `targetLevel === 0` | 預先配置的技能追蹤 | 是 | 否 |
| `skillId != null`, `targetLevel` 為 1–10 | 使用者設定的最佳化目標 | 是 | 是 |
| `skillId === null` | 舊版或底層模式切換留下的暫存空目標 | 可讀取相容 | 否 |

保存契約只允許非空技能使用 Lv.0–Lv.10；空目標若仍存在，只允許既有的正數等級格式，以避免新增不可用的空白目標。冒險頁 Presenter 不顯示空目標，並在使用者選擇新技能時丟棄同船的舊空占位。

### 2. 由 Domain 集中篩選最佳化目標

新增純函式 `getAdventureOptimizationTargets`，輸入 `FleetTarget[]`，只輸出 `skillId` 非空且 `targetLevel > 0` 的 `{ skillId, targetLevel }`。頁面用它決定按鈕是否可用與傳給 Solver 的輸入；Solver 自身也重複過濾 Lv.0，避免其他呼叫者繞過頁面造成錯誤。

Solver 仍維持不可變輸入與既有 DP/貪心策略。只有沒有任何有效最佳化目標時，Solver 才返回空結果；頁面在此情況下不進入重算流程。

### 3. 新增目標先選技能，不建立空列

冒險頁的「新增目標」只開啟現有冒險技能列表的頁面內 Bottom Sheet，不修改 FleetState、不標記配置為未保存。選擇技能後：

1. 查找目前已配置目標；
2. 若技能已有 Lv.0 追蹤目標，將該目標提升為 Lv.1；若技能不存在，才建立新的 Lv.1 目標；
3. 關閉選擇器並重新渲染；
4. 使用者可沿用既有等級輸入與刪除操作。

已有 Lv.1 以上的重複技能只顯示既有錯誤提示並保留選擇器，便於繼續選擇；取消選擇器不產生任何資料變更。

選擇器沿用目前的技能搜尋與分段載入資料，不新增套件、遠端請求或公共元件。後續 Change 4 再視需要抽取為共享 `SkillPickerSheet`。

### 4. 無有效目標時雙重保護

Presenter 提供 `optimizationTargetCount` 與 `canRecalculate`。WXML 對「計算方案」按鈕設定 disabled 狀態，並顯示繁體中文原因提示；Controller 的 `onRecalculate` 仍必須檢查同一條件。

若沒有 Lv.1 以上目標，Controller 只顯示「請先設定至少一個 Lv.1 以上的優化目標」，不呼叫 Solver、不呼叫 `recalculateShip`、不清除或改寫任何成員、鎖定或排除資料。

有有效目標時，本 Change 保留現有直接套用流程，因為結果預覽屬於後續 Change 2；本 Change 只確保無效輸入不會觸發危險路徑。

## 影響範圍

預計只修改以下檔案：

- `miniprogram/contracts/fleet-config.ts`：允許非空技能的 Lv.0 目標保存，保留空目標相容限制；
- `miniprogram/domain/battle-fleet.ts`：補足目標更新對空目標等級的校驗；
- `miniprogram/domain/adventure-fleet.ts`：新增最佳化目標篩選純函式；
- `miniprogram/domain/adventure-fleet-solver.ts`：忽略 Lv.0 追蹤目標並覆蓋邊界測試；
- `miniprogram/presenters/adventure-fleet-presenter.ts`：隱藏空占位並輸出計算可用狀態；
- `miniprogram/pages/adventure-fleet/index.ts`：新增目標選擇器狀態、無目標護欄與空占位清理；
- `miniprogram/pages/adventure-fleet/index.wxml` / `index.wxss`：加入最小必要的技能選擇 Bottom Sheet、禁用狀態與繁體中文提示；
- `tests/fleet-config/fleet-config-contract.test.ts`、`tests/domain/*adventure-fleet*`、`tests/pages/adventure-fleet-page.test.ts`：補足契約、Domain、Solver 與 Page 測試。

不修改 `archive/`、`miniprogram/generated/`、Cloud Function、配置保存服務、衝突保護流程或任何無關頁面。

## 測試策略

遵循 TDD，先寫失敗測試，再用最小實作使其通過：

- 契約：非空 Lv.0 目標可序列化/反序列化；空目標 Lv.0 不可保存；
- Domain：最佳化目標篩選排除 Lv.0 與空目標；
- Solver：輸入只有 Lv.0 時不選擇任何航海士；混合 Lv.0/Lv.1 以上時只依 Lv.1 以上目標求解；
- Page：新建頁保留預設 Lv.0 目標；新增目標不增加空列而開啟選擇器；選技能建立 Lv.1 目標；無有效目標時計算不改變艦隊；取消選擇器不標記未保存；
- 全量：執行 `npm run verify`，並確認 diff 不含 `archive/` 或 `miniprogram/generated/`。

## 微信 DevTools 驗收

在不改變本 Change 業務範圍的前提下，使用微信 DevTools 檢查冒險頁 320px、375px、393px、430px 寬度：

- 新建頁能看見預先配置的 Lv.0 目標，無 `skillId: null` 空白目標列；
- 點擊「新增目標」可開啟並關閉技能選擇 Bottom Sheet；
- 選擇技能後新增 Lv.1 目標；重複技能與取消操作不改變目標或成員；
- 沒有 Lv.1 以上目標時「計算方案」不可用，且現有成員不變；
- 底部選擇器不被 Home Indicator 遮擋，頁面無水平溢出。

截取改造前後畫面與四種窄屏驗收畫面，於提交前與測試結果、變更檔案及擬用 Commit Message 一併展示；等待使用者確認後才提交。

## 不在本 Change 的內容

- 自動配隊方案差異預覽、取消、應用與一次撤銷（Change 2）；
- 操作語義統一、共用 Design System、全頁視覺重構與圖示資產；
- 戰鬥配隊行為改造；
- 新增依賴、網路請求、資料生成或 CloudBase/Cloud Function 修改。
