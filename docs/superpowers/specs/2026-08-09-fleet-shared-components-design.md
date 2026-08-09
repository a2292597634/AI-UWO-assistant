# 配隊共享元件設計規格

## 目標

在不改變戰鬥配隊與冒險配隊的 Controller、Solver、資料、配置保存、衝突保護或既有互動語義的前提下，抽取兩個頁面共同使用的界面模式。P4 只負責元件邊界、展示狀態、事件轉發與樣式共用；頁面仍然持有業務狀態和行為。

P4 以微信原生 Component 為共享單位，讓後續 P5/P6 可以逐頁替換配隊頁布局，而不必再次複製相同的 WXML 與 WXSS。元件不呼叫 Domain、Presenter、配置服務、Cloud Function 或任何網路 API。

## 範圍與邊界

本 Change 包含：

- 抽取 `ConfigBar`、`ModeTabs`、`OfficerActionSheet`、`SkillPickerSheet`、`ResultPreviewSheet`、`StatusBadge` 與 `EmptyState`；
- 讓戰鬥配隊和冒險配隊使用同一套元件契約；
- 將現有頁面 ViewModel 映射成元件 `properties`，並將頁面事件透過元件事件繼續交給原有 Controller；
- 使用 P3 Design Foundation 的 Token、字體、間距、圓角、陰影、狀態與觸控規範；
- 為元件結構、事件轉發、長文字和禁用狀態補充架構與頁面回歸測試。

本 Change 不包含：

- 不修改 Solver、Domain、Presenter 的業務計算規則；
- 不修改 FleetState、配置保存、Cloud Function、版本衝突或未保存攔截流程；
- 不重新設計戰鬥/冒險配隊的五列網格、全艦隊分配、目標生命週期或操作語義；
- 不把現有內嵌操作強制改成新的彈出流程；`OfficerActionSheet` 和 `SkillPickerSheet` 的 `presentation` 由頁面決定，以兼容現有內嵌與 Sheet 展示；
- 不新增圖像素材、生圖、遠程 URL、依賴或 Node.js Runtime API；
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/` 或無關頁面。

## 設計原則

### 1. 元件只展示，頁面保留行為

元件使用微信原生 `Component` 定義 `properties`、`data` 和 `methods`。元件只能：

- 根據 `properties` 渲染 WXML；
- 維護不影響業務的展示狀態，例如 Sheet 是否可見、局部輸入值；
- 以 `this.triggerEvent` 發出語義事件與 `detail` 資料。

元件不得直接 import Domain、Presenter、runtime service 或資料生成模組，也不得在元件中執行 `wx.cloud`、`wx.request` 或遠程請求。頁面 Controller 繼續處理所有事件、校驗、狀態轉換與資料讀寫。

### 2. ViewModel 是元件邊界

頁面將現有 Presenter 結果和本地狀態整理成元件所需的明確 ViewModel。元件不依賴完整 Page data，也不讀取父頁面的隱式欄位。事件 `detail` 只包含識別操作所需的資料，例如 `id`、`mode`、`action` 或輸入值。

### 3. 元件不製造新交互

P4 的重點是去除重複，不是提前執行 P5/P6 的頁面重構。兩個頁面目前的內嵌技能選擇、技能 Sheet、成員操作、結果預覽與撤銷行為保持原有入口；元件只把相同結構和事件連接集中管理。

## 元件契約

### `ConfigBar`

用途：顯示配置名稱、保存狀態、登入後保存入口與配置菜單入口。配置列表、命名、未保存保護和版本衝突對話框仍由頁面或既有流程管理，不在元件內執行保存。

主要 `properties`：

- `configName: string`；
- `configStatus: 'saved' | 'unsaved' | 'new'`；
- `authStatus: 'guest' | 'authenticated'`；
- `activeConfigId: string | null`；
- `showMenu: boolean`。

事件：`info-tap`、`login-tap`、`menu-tap`、`save`、`save-as`、`rename`、`delete`、`new`。事件只轉發原有頁面 handler，不改變保存流程。

### `ModeTabs`

用途：統一手動/自動模式切換的展示和選中狀態。

主要 `properties`：

- `value: 'manual' | 'auto'`；
- `options: Array<{ value: string; label: string; disabled?: boolean }>`。

事件：`change`，`detail` 為 `{ value: string }`。頁面負責決定切換後是否清理或保留任何業務狀態。

### `OfficerActionSheet`

用途：統一成員操作按鈕的文字、熱區、禁用狀態和事件語義。名稱沿用審計清單，但 P4 不強制把目前內嵌操作改成新的遮罩彈層。

主要 `properties`：

- `officerId: string`；
- `status: 'normal' | 'locked'`；
- `variant: 'slot' | 'card'`；
- `allowBan: boolean`；
- `disabledActions: string[]`。

事件：`lock`、`remove`、`ban`，`detail` 為 `{ officerId: string }`。元件只渲染可用操作；Controller 仍負責鎖定、移除和排除的安全校驗。

### `SkillPickerSheet`

用途：統一技能類型、分類、搜尋、技能列表、詳情入口和選擇入口。通過 `presentation` 兼容現有兩頁的內嵌選擇區與 Sheet 選擇區，不改變既有事件順序。

主要 `properties`：

- `presentation: 'inline' | 'sheet'`；
- `visible: boolean`；
- `skillKinds`、`skillCategories`、`skills`；
- `selectedSkillId: string | null`；
- `searchText: string`；
- `hasMore: boolean`；
- `selectionLabel: string`。

事件：`dismiss`、`kind-change`、`category-change`、`search-input`、`skill-tap`、`select`、`reach-end`。搜尋和分頁資料仍由頁面 Controller 取得與更新。

### `ResultPreviewSheet`

用途：統一戰鬥與冒險自動配隊的方案預覽、目標進度、成員差異、鎖定保留、約束提示、取消、應用與一次撤銷入口。

主要 `properties`：

- `visible: boolean`；
- `preview: FleetProposalPreviewView | null`；
- `canUndo: boolean`。

事件：`cancel`、`apply`、`undo`。元件只依 `preview.canApply` 表達禁用和原因，不在元件內重新計算方案或修改 FleetState。

### `StatusBadge` 與 `EmptyState`

`StatusBadge` 接收 `status: 'achieved' | 'unmet' | 'review' | 'error'`、`label` 和可選 `description`，始終渲染可見文字，不只輸出顏色。`EmptyState` 接收標題、說明和可選操作文案，操作以事件交給頁面。

## 文件與目錄結構

每個元件使用同一目錄內的四個文件：

```text
miniprogram/components/
  config-bar/{index.ts,index.wxml,index.wxss,index.json}
  mode-tabs/{index.ts,index.wxml,index.wxss,index.json}
  officer-action-sheet/{index.ts,index.wxml,index.wxss,index.json}
  skill-picker-sheet/{index.ts,index.wxml,index.wxss,index.json}
  result-preview-sheet/{index.ts,index.wxml,index.wxss,index.json}
  status-badge/{index.ts,index.wxml,index.wxss,index.json}
  empty-state/{index.ts,index.wxml,index.wxss,index.json}
```

戰鬥與冒險頁的 `index.json` 註冊相同元件路徑；頁面 WXML 只保留資料綁定和事件 handler。元件 WXSS 使用 Design Foundation Token，不覆寫頁面全局布局，不引入新顏色或固定超出視口的寬度。

## 資料流與事件流

```text
Page state / Presenter View
        ↓ properties
Shared Component
        ↓ triggerEvent(detail)
Existing Page Controller handler
        ↓ existing Domain / Presenter / config flow
Page state update and render
```

元件事件名稱使用 kebab-case，`detail` 只傳遞必要資料。頁面事件 handler 名稱可以保持現有名稱，通過 WXML 綁定完成適配。任何事件錯誤或缺少必要 ID 時，頁面維持原狀並使用現有錯誤提示，不由元件吞掉錯誤。

## 視覺與可用性規則

- 編碼前完整閱讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`；
- 所有新增樣式使用 P3 Token、BEM 類名和現有系統無襯線字體；
- 重要操作最小熱區為 `88rpx`，操作文字不小於 `22rpx`；
- 長名稱、技能描述和約束訊息允許換行，不以裁切維持單行；
- 狀態必須有可見文字，顏色只能作為輔助；
- Sheet 或固定底部操作區使用 `env(safe-area-inset-bottom)`；
- 只在 Sheet 或確實離開普通文流的內容使用指定陰影，普通卡片不新增陰影；
- 不以 Emoji 代替正式圖標，不新增生圖或大型視覺素材。

## 測試與驗收

### 自動化測試

- 每個元件新增架構測試，驗證 `index.json`、WXML 事件名、最小熱區、Token 使用和繁體中文語義文字；
- 元件事件測試只驗證 `detail` 和展示分支，不測試 Domain 或保存行為；
- 保留並更新戰鬥頁、冒險頁回歸測試，確認既有 handler 仍被正確觸發；
- 執行 focused component/page tests，再執行 `npm run verify`；
- 使用 `git diff --check` 和禁止目錄範圍檢查。

### 微信 DevTools

在 `320px`、`375px`、`393px`、`430px` 下檢查戰鬥配隊與冒險配隊：

- 配置欄、模式切換、技能選擇、成員操作和方案預覽均可載入；
- 事件操作與 P2 現有流程一致：選擇、計算、預覽、取消、應用、撤銷、保存和衝突保護不回退；
- 長航海士名稱、技能名稱、約束訊息和多行按鈕不裁切；
- 固定底部 Sheet 和撤銷入口避開安全區；
- 元件禁用、已達成、未達成、需復核和錯誤狀態同時具備文字與視覺區分；
- 不出現頁面級橫向溢出。

## 完成條件

- 兩個配隊頁共用本規格列出的元件契約，沒有重複的同一套 WXML 結構；
- 頁面 Controller、Solver、Presenter、配置保存和 Cloud Function 行為保持原有測試結果；
- 所有新增元件通過 focused tests 和完整 `npm run verify`；
- DevTools 四種寬度驗收完成並記錄結果；
- Commit 前展示變更文件、驗證結果、DevTools 結果和擬用 Commit Message，等待使用者確認。
