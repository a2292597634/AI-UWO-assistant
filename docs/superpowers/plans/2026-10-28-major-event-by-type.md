# 大流行按流行查詢實施計畫

> 使用 executing-plans 逐項執行；既有 dirty 檔案以工作前指紋保護，不提交。

**目標：** 實作已確認的緊湊流行切換與各海域下一場列表。

**架構：** Domain 批次取得各海域下一場；獨立 Presenter 計算倒數；既有頁面新增 type 檢視並重用詳情與圖示降級。

**技術：** TypeScript、WXML、WXSS、Vitest、現有 sharp 素材流程。

## 全域限制

Node >=22 <23；不新增依賴或網路例外；不手改 generated；完整遵循 Design Foundation 與 HTML 報告規格；修改主源後執行 data:check。commit、push、部署均不在授權內。

## 任務一：每海域下一場與倒數（紅→綠）

- [x] 在 `tests/domain/major-event-forecast.test.ts` 增加 `findNextMajorEventsByZone` 行為測試，使用固定時間及字面值結果驗證七天外與開始邊界，執行並確認缺少函數的失敗。
- [x] 在 `miniprogram/subpkg-trade/domain/major-event-forecast.ts` 增加批次介面 `(reference, query): MajorEventOccurrence[]`，重用既有搜尋及海域排序，每海域最多一項。
- [x] 建立 `miniprogram/subpkg-trade/presenters/major-event-next-presenter.ts` 與 `tests/presenters/major-event-next-presenter.test.ts`，先測試 `presentMajorEventWait(triggerAt, now)` 的分鐘進位、整點與跨日結果，再實作。

## 任務二：互動與緊湊圖示

- [x] 在 `tests/pages/major-event-page.test.ts` 增加 type 視圖切換、海域篩選、五項／全量、非目前範圍詳情和分鐘刷新測試，先執行觀察失敗。
- [x] 修改 `miniprogram/subpkg-trade/pages/popularity/index.ts`／`index.wxml`／`index.wxss`，新增 compact 單選按鈕、海域 picker、既有海域徽記及列表；保持既有矩陣、日程功能。
- [x] 擴充 `tools/ui-assets/build-major-events-assets.ts` 與對應測試，以 `data/master/ui-assets/major-events/` 的八枚 SVG 生成本地小圖示；執行 `npm run assets:major-events`。

## 任務三：回歸、頁面報告

- [x] 新增 `tools/miniprogram-review/scenarios/major-event-by-type.json`，實測 type 切換、展開／收起與詳情；海域 picker 操作列為待人工，控制器篩選已測試。
- [x] 只格式化本次文件，執行相關 Vitest、typecheck、runtime-network、素材／資料檢查及完整 `npm run verify`，如有既有基線阻塞如實記錄。
- [x] 執行 DevTools iterate／final，讀取 HTML 及截圖；比較既有文件指紋，交付報告與未完成的外部驗收項。
