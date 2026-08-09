# 戰鬥配隊重構設計規格

日期：2026-08-09

## 目標

在不修改戰鬥配隊頁面 Controller、Domain、Solver、資料、配置保存或既有事件語義的前提下，完成 P5 戰鬥配隊頁的資訊架構與窄屏可用性重構。重點是讓目前船、模式、候選技能貢獻、跨船移動和排除狀態更容易理解，並降低成員網格與長頁面的操作密度。

## 範圍

本 Change 包含：

- 將戰鬥配隊成員網格由六列調整為五列，保留 7 艘船、11 個船位和既有資料順序；
- 移除重複的大型頁面 Header，改用配置欄下方的緊湊頁面上下文列；
- 將模式切換移到當前船工作區前部，形成「配置 → 船位 → 當前船 → 模式 → 工作區」順序；
- 在候選航海士視圖中補充目前技能的實際 `unlockLevel` 貢獻文字，例如「操帆 +Lv.3」；
- 將已在其他船的候選人明確標示為「第 3 船 · 點擊後移動」，保留既有 `onOfficerSelect` 和移動確認流程；
- 顯示目前船的排除名單，並沿用既有 `onUnbanOfficer` 作為解除入口；
- 將本船排除、全艦隊排除、技能統計和全艦隊摘要放入預設收起的純展示折疊元件；
- 使用 Design Foundation Token、至少 `88rpx` 的獨立操作熱區和可換行長文字規則；
- 為新增展示映射、折疊元件和頁面結構補充 focused tests。

本 Change 不包含：

- 不修改 `miniprogram/pages/fleet/index.ts` 的 Controller 行為或事件 handler；
- 不新增真正的成員整卡點擊 Action Sheet 流程；P4 的 `OfficerActionSheet` 仍以既有 inline 展示方式轉發 `lock`、`remove` 和 `ban`；
- 不修改 `miniprogram/domain/`、`miniprogram/contracts/` 中的業務狀態和 Solver 規則；
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`、Cloud Function 或任何資料來源；
- 不新增圖片、遠程 URL、依賴或 Node.js Runtime API；
- 不順手重構冒險配隊、配置保存、結果預覽或其他頁面。

## 設計原則

### 1. 頁面保留行為，Presenter 補充展示語義

頁面仍透過既有 handler 處理所有點擊、移動確認、鎖定、移除、排除、保存和方案預覽。`battle-fleet-presenter.ts` 只增加 WXML 所需的展示欄位：

- `skillContributionLabel`：依目前選中的手動技能和關係資料 `unlockLevel` 產生「技能名 +Lv.N」；
- `selectionHint`：依航海士狀態產生「可加入目前船」「目前船」「第 N 船 · 點擊後移動」或「全艦隊已排除」等可見文字；
- `currentShipExcludedOfficers`：將當前船的 `removedOfficerIds` 映射為姓名、肖像和解除所需 ID。

這些欄位不改變候選集合、求解結果或任何狀態轉換。

### 2. 折疊元件只維護展示狀態

新增 `disclosure-section` 微信元件，使用原生 `Component` 和 slot：

- `title: string`、`hint: string`、`countLabel: string`、`defaultExpanded: boolean` 為輸入 properties；
- 元件內部只維護 `expanded` 展示狀態；
- 標題列以至少 `88rpx` 熱區切換展開/收起，並輸出 `aria-expanded`；
- 不發出業務事件、不讀取父頁面資料、不 import Domain/Presenter；
- 所有色彩、字級、間距、圓角和陰影使用 `--uwo-*` Token。

四個折疊區塊預設收起：

1. 本船排除；
2. 全艦隊排除；
3. 當前船技能統計；
4. 全艦隊摘要。

折疊區塊內的既有解除、技能貢獻者橫向滾動和狀態文字保持可見且可操作。

### 3. 五列成員網格與既有操作元件

`.slot-grid` 改為 `repeat(5, minmax(0, 1fr))`，保留 11 個 slot 和現有圖片回退。已填充卡片繼續渲染 `officer-action-sheet variant="slot"`，避免改變事件資料流。卡片內不新增新的業務按鈕，也不改變鎖定、移除和排除的可用條件。

候選清單不再用低透明度偽裝成不可點擊。`canSelect` 仍由 Presenter 提供，頁面 handler 仍會對已占用航海士觸發既有移動確認；視覺上改用狀態文字和來源船文字表達原因。

## WXML 版面順序

```text
[ConfigBar]
[已配置數量 · 當前船狀態]
[7 艘船 Tab]
[當前船名稱 / 人數 / 狀態]
[手動配隊 | 自動配隊]
[11 格五列成員網格]

手動：
  [技能類型 / 分類 / 搜尋 / 技能列表]
  [候選航海士 · 實際技能貢獻 · 來源船語義]

自動：
  [目標編輯與重新計算]
  [技能選擇器]

[本船排除：預設收起]
[全艦隊排除：預設收起]
[技能統計：預設收起]
[全艦隊摘要：預設收起]
[ResultPreviewSheet]
```

配置列表、命名、未保存攔截、衝突對話框、技能詳情 Sheet 和方案預覽均保留既有頁面結構及 handler。

## 檔案邊界

### 新增

- `miniprogram/components/disclosure-section/index.ts`
- `miniprogram/components/disclosure-section/index.wxml`
- `miniprogram/components/disclosure-section/index.wxss`
- `miniprogram/components/disclosure-section/index.json`
- `tests/architecture/fleet-disclosure.test.ts`
- `tests/presenters/battle-fleet-presenter.test.ts` 中的 P5 展示契約（若現有測試檔已存在則只修改該檔）

### 修改

- `miniprogram/pages/fleet/index.json`：註冊 `disclosure-section`；
- `miniprogram/pages/fleet/index.wxml`：重排頁面結構、使用折疊元件、補充狀態文字；
- `miniprogram/pages/fleet/index.wxss`：五列網格、緊湊上下文、候選清單熱區、長文字和 Token 化新增樣式；
- `miniprogram/presenters/battle-fleet-presenter.ts`：補充貢獻、來源船和本船排除展示映射；
- `tests/pages/fleet-page.test.ts`：更新六列契約為五列，補充頁面順序、折疊區塊、候選語義和既有 handler 回歸。

不修改頁面 Controller 檔案，除非 TypeScript 類型檢查證明不增加可選展示欄位就無法編譯；若發現此情況，先停下報告，不擴張範圍。

## 測試策略

遵循 RED → GREEN → REFACTOR：

1. 先在 Presenter 測試加入候選技能貢獻、跨船來源文字和本船排除映射的失敗案例；
2. 再在折疊元件架構測試加入四件文件、slot、`aria-expanded`、`88rpx` 和 Token 契約；
3. 在頁面測試加入五列網格、版面順序、折疊標籤、狀態語義和既有 handler 綁定契約；
4. 執行 focused presenter/component/page tests，確認失敗原因是缺少實作而不是測試錯誤；
5. 實作最小 Presenter、元件、WXML 和 WXSS；
6. 執行 `npm run verify`、`npm run check:runtime-network`、`git diff --check` 及禁止目錄變更檢查。

## 驗收條件

- 320px 寬度不出現頁面級橫向溢出，成員網格使用五列；
- 11 個船位、7 艘船 Tab 和既有事件 handler 全部保留；
- 候選航海士可見實際技能貢獻，其他船航海士可見來源船和移動語義；
- 本船排除和全艦隊排除均可查看，既有解除入口仍有效；
- 四個低頻摘要區塊預設收起，展開控制具備可見文字、`aria-expanded` 和至少 `88rpx` 熱區；
- 配置保存、未保存攔截、版本衝突、移動確認、鎖定、移除、排除和方案預覽測試不回退；
- `npm run verify` 通過，且 `archive/`、`data/master/`、`miniprogram/generated/`、Controller、Domain、Solver 和資料沒有變更；
- 不新增依賴、網路請求、Node.js Runtime API 或位圖素材。

## 已知限制

因本 Change 明確不修改 Controller，航海士卡片仍保留既有 inline 操作元件，不在本階段改成「點擊整卡後開啟 Action Sheet」。若後續要完成該互動，應另開 Change，先設計純展示選中狀態與事件邊界，再由使用者確認是否允許新增頁面局部狀態。
