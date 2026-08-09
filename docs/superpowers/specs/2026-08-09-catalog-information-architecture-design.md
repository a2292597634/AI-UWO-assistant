# 資料頁資訊架構重構設計規格

日期：2026-08-09  
變更：P7「資料頁資訊架構重構」  
分支：`codex/phase-8-資料頁資訊架構`

## 1. 目標

將資料頁的頂層內容收斂為「航海士」與「技能」兩種模式，分離內容類型與航海士篩選維度，降低首屏密度與重複搜尋入口。

本 Change 只重構資料頁的頁面狀態、WXML 佈局與 WXSS 表現，保留既有本地資料來源、`queryCatalog` 查詢語義、分頁、技能資訊 Bottom Sheet、技能反查、詳情導航與素材失敗降級。

## 2. 已批准的方案

採用「頁面專用篩選 Bottom Sheet」方案：

- 資料頁只保留兩個內容模式，不新增共用篩選元件；該篩選只由資料頁使用，頁面內實作可避免擴大共享元件邊界。
- 航海士模式顯示一個「搜尋航海士名稱」輸入框，以及一個「篩選」入口。
- 點擊「篩選」時複製目前已套用的 `CatalogFilterState` 為草稿；草稿在 Bottom Sheet 內修改，只有點擊「套用篩選」才更新名冊。
- 「取消」關閉 Bottom Sheet 並丟棄草稿；「清除全部」只清除草稿並保留 Bottom Sheet，等待使用者套用。
- 語言、職業、稀有度、類型、性別與技能篩選全部收納在同一個 Bottom Sheet。技能篩選沿用既有 `activeFilter` 與 `selectedSkillCategories`，不建立新的技能查詢語義。
- 技能模式只顯示一個「搜尋技能名稱」輸入框與同一個篩選入口；主動／被動與技能分類控制移入該模式的 Bottom Sheet，移除技能清單內重複的航海士搜尋、第二個技能搜尋框與內嵌篩選入口。

## 3. 互動與資料流

### 3.1 內容模式

頁面狀態使用 `activeMode: 'officer' | 'skill'`：

- `officer`：顯示航海士搜尋、篩選入口、航海士數量、航海士列表與分頁。
- `skill`：顯示技能搜尋、篩選入口、技能數量、技能列表與持有者展開區域。
- 模式切換只改變內容呈現，不重置已套用的航海士篩選，也不修改資料來源或查詢引擎狀態。
- 搜尋輸入依模式分流：航海士模式更新既有 `searchText`；技能模式更新既有 `skillCheckSearchText`。兩者不得互相覆寫。

### 3.2 篩選 Bottom Sheet

頁面非響應式狀態保存 `_draftFilterState: CatalogFilterState | null` 與技能模式的草稿類型／分類，響應式資料保存：

- `filterSheetOpen`：是否顯示篩選 Bottom Sheet；
- `filterDraftCount`：草稿條件下的航海士數量；
- `filterDraftHasActiveFilters`：草稿是否有條件；
- `filterSheetMode`：目前 Sheet 編輯航海士或技能條件；
- 草稿對應的既有選項陣列與 boolean map；技能模式沿用 `_skillCheckKind`、`_skillCheckCategories` 與 `filterSkillCheckList`。

流程如下：

```text
目前已套用條件
      ↓ 開啟
複製成草稿 → 修改草稿 → 以 queryCatalog 計算預覽數量
      ↓ 套用                         ↓ 取消
更新目前條件、名冊與數量             關閉並丟棄草稿
```

航海士草稿修改只呼叫既有 `queryCatalog` 取得預覽數量，不改變 `state._filterState`、`state._filteredAll` 或目前列表；技能草稿修改只呼叫既有 `filterSkillCheckList` 取得預覽數量，不改變 `_skillCheckKind`、`_skillCheckCategories` 或目前技能列表。套用時才進入各自既有的查詢、資產狀態、分頁與 `setData` 流程。

篩選語義保持不變：

- 稀有度、類型、性別、職業多選內部為 OR；
- 語言與技能分類遵守既有 AND；
- 不同篩選類別之間為 AND；
- `activeFilter` 保持 `all`／`active`／`passive`；
- `selectedSkillId` 僅供技能反查使用，不在篩選 Sheet 內新增直接選技能 ID 的入口。

### 3.3 既有流程保留

- 點擊航海士列仍導向 `/subpkg-detail/pages/detail/index?id=...`。
- 點擊航海士技能圖示仍開啟既有 `skill-sheet` 元件。
- 技能 Sheet 的關閉與「查看擁有此技能的航海士」反查流程不變；反查後仍只保留 `selectedSkillId`，並切換回航海士模式。
- 航海士分頁、圖片失敗回退、技能圖示失敗回退與資產重試流程不變。

## 4. 文件與程式邊界

### 4.1 預計修改

- `miniprogram/pages/catalog/index.ts`：增加內容模式與模式化篩選草稿的頁面 Controller 狀態及事件；只編排既有 presenter／Domain API，不改查詢引擎。
- `miniprogram/pages/catalog/index.wxml`：重組兩模式、單一搜尋入口、篩選 Bottom Sheet 與技能列表。
- `miniprogram/pages/catalog/index.wxss`：依 Design Foundation Token 建立資料頁篩選、模式、列表與 Bottom Sheet 樣式；新類名使用英文 BEM。
- `tests/pages/catalog-page.test.ts`：覆蓋模式切換、搜尋分流、草稿取消／套用、反查模式回復及 WXML／WXSS 互動契約。
- `docs/superpowers/plans/2026-08-09-catalog-information-architecture.md`：實作計畫。

### 4.2 明確不修改

- `archive/`、`data/master/`、`miniprogram/generated/`；
- `miniprogram/domain/catalog-query.ts`、`miniprogram/domain/filter-state.ts`、其他 Domain、Solver、資料轉換與索引生成；
- 資料來源、保存流程、Cloud Function、P5 戰鬥配隊、P6 冒險配隊及預設技能追蹤修復；
- npm 依賴、遠端 URL、`wx.request`、`wx.cloud` 與 Node.js Runtime API；
- 既有技能 Sheet 元件及詳情頁。

## 5. 視覺與可用性規則

- 完整遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
- 新增樣式使用 `--uwo-*` Token；不新增品牌色、字體或大型素材。
- Bottom Sheet 頂部使用 `--uwo-radius-sheet` 與 `--uwo-shadow-sheet`，底部加入 `env(safe-area-inset-bottom)`。
- 重要操作使用至少 `88rpx` 高度與不小於 `22rpx` 的操作文字；禁用「套用篩選」時同步顯示可理解原因。
- 狀態不只依靠顏色，空結果、篩選草稿數量與套用結果都提供繁體中文文字。
- 320px 寬度不得引入頁面級橫向滾動；技能圖示既有橫向滾動區只在列表列內保留。

## 6. 測試與驗收

### 6.1 TDD

涉及搜尋與篩選狀態的行為先修改 `tests/pages/catalog-page.test.ts`：

1. RED：新增測試並確認目前五 Tab、即時篩選狀態無法滿足新模式與草稿行為；
2. GREEN：以最小 Controller 狀態與事件實作使測試通過；
3. REFACTOR：整理模式分流、草稿投影與頁面更新，保持測試綠燈。

既有 `queryCatalog` 測試繼續作為查詢語義回歸，不修改其實作或測試契約。

### 6.2 自動化驗證

- `npm.cmd test -- tests/pages/catalog-page.test.ts tests/domain/catalog-query.test.ts tests/presenters/catalog-presenter.test.ts tests/presenters/catalog-page-state.test.ts`
- `npm.cmd run format:check`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run check:runtime-network`
- `npm.cmd run verify`
- `git diff --check`

另外確認 diff 不包含禁止修改的資料、生成檔、配隊頁或保存流程。

### 6.3 微信 DevTools 手動驗收

在 320px、375px、393px、430px 寬度檢查：

- 頂層只顯示「航海士／技能」；
- 航海士與技能模式各只有一個對應搜尋框，技能模式沒有內嵌篩選列；
- 篩選 Sheet 可依目前模式開啟、修改、預覽數量、取消、清除與套用；
- 套用後查詢結果仍符合原有 AND／OR／ALL 語義；
- 無結果時條件保留且可清除；
- 技能 Sheet、反查、航海士詳情與返回流程正常；
- Bottom Sheet 不被 Home Indicator 遮擋，頁面無水平溢出。

## 7. 完成條件

- 索引架構只剩「航海士／技能」兩種模式；
- 航海士篩選維度集中在單一 Bottom Sheet；
- 技能模式不再重複顯示航海士搜尋與技能搜尋；
- 既有資料來源、查詢語義、詳情導航與保存相關流程保持不變；
- 自動化門禁與 `npm.cmd run verify` 通過；
- 提交前展示完整變更文件、驗證結果、手動驗收待辦與擬用 commit message，等待使用者確認後才可提交。
