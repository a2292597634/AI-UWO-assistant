# 航海士操作按鈕緊湊化設計規格

日期：2026-08-09

## 目標

改善戰鬥配隊頁 1 號船航海士卡片下方「鎖定／移除／排除」三個操作，以及戰鬥技能選擇區的篩選與「加入目標」控制密度，不改變既有事件、Controller、Domain、Solver、資料或操作流程。

## 根因

`miniprogram/components/officer-action-sheet/index.wxss` 目前將 `88rpx` 的操作熱區直接作為按鈕背景高度；`index.wxml` 只有操作文字，沒有圖形語義。因此三欄操作列在窄屏槽位中顯得過高，且操作辨識依賴文字。

## 設計

- 保留每個原生 `button` 的 `min-height: 88rpx`，確保重要操作熱區符合 Design Foundation。
- 將視覺背景移到按鈕內的 `.officer-action-sheet__visual`，視覺層使用較矮的 `56rpx` 最小高度，按鈕上下保留透明觸控空間。
- `card` 變體改為圖標與文字並列；窄屏 `slot` 變體以圖標為主，操作文字仍保留在 WXML 和 `aria-label` 中，避免五列槽位再次被文字撐高。
- 圖標使用 WXSS 形狀繪製，不新增圖片、位圖、遠程 URL 或依賴；圖標只增強辨識，文字和 `aria-label` 仍是完整語義。
- 不改變 `lock`、`remove`、`ban` 事件、不改變 `disabled` 與 `aria-disabled`，不修改 `variant`、`allowBan` 或頁面 handler。
- `card` 變體與 `slot` 變體共用操作語義；僅以同一組緊湊視覺層降低嵌入卡片時的視覺重量。

### 戰鬥技能選擇區密度

- 只對 `skill-picker-sheet--inline`（戰鬥頁內嵌模式）套用緊湊規則；冒險頁或彈窗模式保持原有 88rpx 操作熱區。
- 類型／分類篩選 Tab 使用 `56rpx` 最小高度和較小水平內距，減少橫向內容寬度，保留既有 `scroll-x` 與事件。
- 內嵌技能列表圖標由 `48rpx` 調整為 `40rpx`，保留本地資產和失敗占位。
- 內嵌技能列表的「加入目標」按鈕使用 `64rpx` 高度，技能詳情列同步使用較小最小高度和間距，避免單一按鈕撐高整行；彈窗模式維持原有尺寸。
- 所有文字、選中狀態、`catchtap="onSelect"` 和頁面事件保持不變。

## 變更邊界

只修改：

- `miniprogram/components/officer-action-sheet/index.wxml`
- `miniprogram/components/officer-action-sheet/index.wxss`
- `miniprogram/components/skill-picker-sheet/index.wxss`
- `tests/architecture/fleet-shared-components.test.ts`
- `tests/pages/fleet-page.test.ts`
- 本 Phase 的設計與實作計畫文件

不修改：

- `miniprogram/pages/fleet/index.ts`、其他 Controller、Domain、Solver、contracts 和資料
- `archive/`、`data/master/`、`miniprogram/generated/`
- 既有事件名稱、事件資料、業務狀態和保存流程

## 驗收條件

- 三個操作均有對應圖標 class；`card` 變體顯示圖標與文字，`slot` 變體顯示圖標並保留可讀的 `aria-label`。
- 原生操作按鈕仍有至少 `88rpx` 熱區；視覺層使用緊湊高度，不再由整個背景填滿熱區。
- 鎖定、移除、排除的既有事件與禁用語義保持不變。
- 戰鬥頁內嵌篩選可在首屏顯示更多選項，技能圖標和「加入目標」不再不必要地撐高列表；冒險頁和彈窗模式不回退。
- 共享元件架構測試與全量 `npm.cmd run verify` 通過。
