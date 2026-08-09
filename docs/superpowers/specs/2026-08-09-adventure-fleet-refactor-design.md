# 冒險配隊重構設計規格

日期：2026-08-09

## 目標

在不修改冒險配隊 Controller、Domain、Solver、資料、配置保存或既有事件語義的前提下，完成 P6 冒險配隊頁的資訊架構重構。重點是把「優化目標」與「技能追蹤」清楚分開，讓全艦隊排除和技能累計預設收起，並沿用 P4 共享元件與 P5 的窄屏規範。

本 Change 不重做 P5 戰鬥配隊頁，不新增新的業務流程，也不新增共享元件。

## 現況與問題

冒險頁已具備 P4 共享元件、技能選擇器、方案預覽和一次撤銷，但仍存在以下展示問題：

- targets 同時承載 Lv.1–Lv.10 優化目標與 Lv.0 技能追蹤，頁面只在單一列表內以小字標示差異；
- 頁面仍在配置欄前顯示重複的大型 Header；
- 全艦隊排除名單和技能累計長期展開，壓縮主要工作區的首屏空間；
- 候選航海士仍以低透明度表示不可直接加入，與已有的狀態文字重複且容易誤解；
- 目標、排除名單和摘要區塊仍保留冒險頁自己的面板樣式，與 P5 已使用的 disclosure-section 結構不一致。

## 範圍與邊界

### 本 Change 包含

- 在 Adventure Presenter 增加純展示用的 optimizationTargets 和 trackingTargets 映射；
- 保留既有 targets 完整投影，避免修改 Controller 的初始 data 和既有業務事件；
- 冒險頁註冊並使用既有 disclosure-section；
- 重排冒險頁 WXML：配置欄、全艦隊上下文、模式、工作區、艦隊成員、折疊摘要、方案預覽；
- 將優化目標和技能追蹤渲染為兩個明確區域；
- 將全艦隊排除與技能累計改為預設收起，保留解除、狀態和空狀態操作；
- 移除冒險頁候選列的低透明度偽禁用樣式，以 statusLabel 和 shipLabel 表達原因；
- 新增 Presenter 與頁面結構 focused tests，並回歸既有方案預覽、取消、套用和撤銷測試。

### 本 Change 不包含

- 不修改 miniprogram/pages/adventure-fleet/index.ts；
- 不修改 miniprogram/domain/、miniprogram/contracts/、Solver、配置保存、runtime service 或 Cloud Function；
- 不修改 archive/、data/master/、miniprogram/generated/；
- 不修改 miniprogram/pages/fleet/ 或重做 P5；
- 不新增、刪除或升級依賴、遠程 URL、wx.request、wx.cloud 或 Node.js Runtime API；
- 不新增圖片、圖標、字體或新的共享 WXML 元件；
- 不改變目標新增、等級修改、刪除目標、重新計算、方案預覽、應用和撤銷的事件順序。

## 展示 ViewModel 契約

AdventureFleetTargetView 保持既有欄位：id、skillId、skillName、skillIconPath、skillDescription、targetLevel、configured、isTracking。

AdventureFleetPageData 增加兩個可選的展示投影：

    optimizationTargets?: AdventureFleetTargetView[]
    trackingTargets?: AdventureFleetTargetView[]

Presenter 在每次建立頁面資料時都輸出兩個陣列：

- optimizationTargets：skillId 不為 null 且 targetLevel > 0；
- trackingTargets：skillId 不為 null 且 targetLevel === 0；
- targets 仍保留全部已配置且 skillId 不為 null 的目標，供既有頁面資料與 Controller 相容使用；
- skillId 為 null 的空白目標永遠不進入任何展示陣列；
- canRecalculate 仍由既有 getAdventureOptimizationTargets 結果決定，不在 Presenter 重新實作 Solver 規則。

技能追蹤列仍可使用既有 onTargetLevelBlur 修改等級，也可使用既有 onRemoveTarget 刪除。當追蹤列被修改為 Lv.1 以上時，下一次 render 會自然移入優化目標區，不新增轉換 handler。

## WXML 版面順序

    [ConfigBar]
    [全艦隊上下文：已配置數量 / 77]

    [scroll-view]
      [ModeTabs]

      手動模式：
        [SkillPickerSheet inline]
        [候選航海士與狀態文字]

      自動模式：
        [全艦隊優化目標：可編輯 Lv.1–Lv.10]
        [新增目標] [重新計算]
        [技能追蹤：預設收起]

      [全艦隊已配置航海士分區]
      [全艦隊排除：預設收起]
      [技能累計：預設收起]

    [scroll-view 結束]
    [ResultPreviewSheet]
    [新增目標 SkillPickerSheet sheet]
    [技能詳情 Sheet]

刪除重複的 fleet-header；配置管理 modal 仍保留在頁面層，既有 ConfigBar 事件綁定不變。方案預覽移到頁面根層，避免被主滾動容器的布局限制，但仍使用既有 properties 和 handler。

## 互動與狀態規則

- 「新增目標」只開啟既有技能選擇 Sheet，不先建立空白目標；
- 只有 optimizationTargets.length > 0 時可重新計算，禁用原因保持可見；
- 技能追蹤只表示目前配置的 Lv.0 追蹤項，不進入 Solver；
- 全艦隊排除仍由 onUnbanOfficer 解除，不能在元件內執行 Domain 操作；
- 方案預覽仍由 ResultPreviewSheet 顯示，取消不改變艦隊，套用後仍可撤銷一次；
- 候選列不再使用 opacity 作為唯一不可選語義，直接顯示「已配置」「已鎖定」或來源船等既有狀態文字；
- 所有新增或修改的 UI 文案使用繁體中文，WXML/WXSS 類名使用英文 BEM。

## WXSS 邊界

- 移除只服務 fleet-header 的頁面樣式；
- 新增 fleet-context、目標分區、追蹤分區與折疊內容的樣式時，只使用 --uwo-* Token；
- 目標列、刪除目標、折疊標題和必要操作熱區至少 88rpx，操作文字不小於 22rpx；
- 長技能名稱、技能描述、排除名單和候選狀態允許換行，不能用省略號隱藏重要語義；
- 普通內容卡不新增陰影；底部 Sheet 的陰影和安全區由既有共享元件處理；
- 不批量重寫冒險頁未被本 Change 觸及的歷史樣式。

## 測試與驗收

### 自動化測試

- Presenter 測試驗證正向目標、Lv.0 追蹤與空目標的分離；
- 頁面測試驗證 disclosure-section 註冊、頁面順序、兩個目標區域、既有 handler 和候選狀態文字；
- 保留並通過既有冒險配隊安全護欄、方案預覽、取消、套用和撤銷測試；
- 執行 focused tests、npm.cmd run verify、npm.cmd run check:runtime-network 和 git diff --check；
- 確認禁止目錄、Controller、Domain、Solver、保存流程和依賴文件沒有變更。

### 微信 DevTools

由使用者在 320px、375px、393px、430px 檢查：

- 優化目標與技能追蹤分區可理解，沒有空白目標行；
- 追蹤、排除和技能累計預設收起且可展開；
- 重新計算、方案預覽、取消、套用和撤銷流程正常；
- 長文字可換行，沒有頁面級橫向溢出；
- 固定 Sheet 避開安全區，重要操作熱區可點擊；
- 候選航海士狀態同時具備文字與視覺區分。

## 完成條件

- Presenter 可區分優化目標與技能追蹤，且不修改 Solver 輸入規則；
- 冒險頁依「配置 → 全艦隊範圍 → 模式 → 工作區 → 摘要」順序呈現；
- 排除名單、技能累計和技能追蹤預設折疊，既有解除與狀態內容仍可操作；
- 既有冒險配隊 Controller、Domain、Solver、配置保存、方案預覽和撤銷測試不回退；
- 完整 npm.cmd run verify 通過，且禁止目錄與範圍外文件無變更；
- DevTools 四種寬度手動驗收結果由使用者確認；
- 提交前展示完整變更文件、驗證結果、手動驗收項目和擬用 Commit Message，未經確認不執行 git add、git commit、merge 或 push。
