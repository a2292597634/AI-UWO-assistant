# 大流行遊戲時刻表顯示修正實施計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將大流行預測頁的日期時間固定為 UTC+8，並把時刻矩陣改為遊戲式整點時刻表，同時保留現有長期範圍和行程功能。

**Architecture:** 新增純函式 `game-time.ts`，集中處理 UTC+8 日期、整點和時區無關格式化；Domain 繼續以 Unix 秒數和來源週期產生未來事件。Presenter／Page 用固定 UTC+8 建立七槽矩陣頁段，樣式在矩陣內使用遊戲式綠色事件條與黃色目前時段，行程和詳情保留精確時刻與原事件色。

**Tech Stack:** TypeScript、微信小程序 WXML/WXSS、Vitest、既有 `tools/miniprogram-review` 驗收器；不新增依賴。

**Spec:** `docs/superpowers/specs/2026-09-25-major-event-game-schedule-display-design.md`

## Global Constraints

- 只在 `codex/phase-45-major-event-game-schedule` 開發，不在 `main` 開發。
- 所有頁面日期和時間明確使用 UTC+8；來源計算仍使用 Unix 秒數與 `anchorEpochSeconds`。
- 矩陣與行程只顯示 `[now, now + horizon)` 內尚未發生的事件，不回看過去兩小時、不標記即時進行狀態。
- `archive/` 唯讀；本次不改 `data/master/major-events.json`、來源週期、海域相位、延遲或交易品映射。
- 沿用 `getTradeCategoryIconPath` 和 20 張共用交易品圖示；不得複製、搬移或重新生成。
- 不新增依賴，不在 Runtime 使用 `wx.request`、`wx.cloud`、遠程 URL 或 Node.js API。
- UI/WXML/WXSS 遵循 Design Foundation 和 HTML 驗收報告規格；代碼說明與頁面文字使用繁體中文。
- 修改樣式前重讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`；頁面驗收遵循 `docs/superpowers/specs/2026-09-16-miniprogram-review-html-report-design.md`。
- 修改 `data/master/` 才需執行 `npm run data:check`；最終交付仍執行完整 `npm run verify`。
- 不提交任何內容，除非使用者看到檔案清單、檢查結果和擬用 commit message 後明確確認。

## Review Focus

- 執行環境時區不是 UTC+8 時，日期、欄頭、事件時間和目前小時仍須保持 UTC+8；以固定時間及另一個 `TZ` 環境驗證。
- 範圍由非整點 `now` 起算；目前整點槽只呈現 `now` 之後的事件，已發生延遲事件不可回到矩陣。
- 24／72／168 小時的首尾可能只覆蓋部分整點槽；矩陣七槽分頁不得漏掉、重複或顯示範圍外事件。
- 同海域同時段的重疊事件仍依來源週期由長至短取最多兩種。
- 矩陣總寬超過窄屏時只在矩陣容器內捲動；頁面本身不得水平溢出。

---

### Task 1: 固定 UTC+8 時間工具與 Presenter

**Files:**

- Create: `miniprogram/subpkg-trade/game-time.ts`
- Test: `tests/domain/game-time.test.ts`
- Modify: `miniprogram/subpkg-trade/presenters/major-event-presenter.ts`
- Test: `tests/presenters/major-event-presenter.test.ts`
- Modify: `miniprogram/subpkg-trade/pages/popularity/index.ts`
- Modify: `miniprogram/subpkg-trade/pages/popularity/index.wxml`
- Test: `tests/pages/major-event-page.test.ts`

**Interfaces:**

- `GAME_TIME_OFFSET_SECONDS: number` 等於 `8 * 60 * 60`。
- `toGameTimeDate(unixSeconds: number): Date` 回傳時間已平移八小時的 Date；呼叫端只讀 UTC getter，避免宿主時區參與格式化。
- `gameHourStartUnixSeconds(unixSeconds: number): number` 回傳該 Unix 秒數在 UTC+8 的整點邊界。
- `gameDateKey(unixSeconds: number): string`、`gameDateBounds(dateKey: string): { start: number; end: number } | null` 使用 UTC+8 日期。
- Presenter 日期和 `HH:mm` 標籤改用共用時間工具；固定偏移後移除 DST 重複時刻偏移欄位與偵測邏輯。
- Page 詳情不再根據宿主時區顯示 UTC 偏移徽記；UTC+8 固定時區沒有 DST 重複時刻。

- [x] **Step 1: 撰寫時間工具的失敗測試**

```ts
it('在非 UTC+8 執行環境仍以 UTC+8 取得日期和整點', () => {
  const instant = Date.parse('2026-09-25T10:47:00+08:00') / 1000

  expect(gameDateKey(instant)).toBe('2026-09-25')
  expect(toGameTimeDate(instant).getUTCHours()).toBe(10)
  expect(toGameTimeDate(instant).getUTCMinutes()).toBe(47)
  expect(gameHourStartUnixSeconds(instant)).toBe(
    Date.parse('2026-09-25T10:00:00+08:00') / 1000,
  )
})
```

- [x] **Step 2: 執行時間工具測試，確認失敗**

Run: `npm test -- tests/domain/game-time.test.ts`

Expected: FAIL，因 `game-time.ts` 尚未建立。

- [x] **Step 3: 建立固定 UTC+8 工具**

以偏移秒數平移 Unix 時間後用 UTC getter 讀取年月日和時間；日期範圍用 `Date.UTC(year, month - 1, day) - GAME_TIME_OFFSET_SECONDS` 計算，下一日本地日期固定加 86400 秒，不依賴作業系統 DST。

- [x] **Step 4: 重跑時間工具測試**

Run: `npm test -- tests/domain/game-time.test.ts`

Expected: PASS，並在測試中暫時將 `TZ` 設為 `America/Los_Angeles` 重複驗證相同輸出。

- [x] **Step 5: 以固定 UTC+8 Presenter 測試取代 DST 測試**

在 `tests/presenters/major-event-presenter.test.ts` 增加固定時間樣本，驗證事件 UTC+8 時刻分別為 `11:04`、`11:05`、`13:04` 和 `15:01`；移除 `utcOffsetLabel`／`isRepeatedLocalWallTime` 的舊預期，詳情時間仍保留來源延遲分鐘。

- [x] **Step 6: 更新 Presenter 並執行專項測試**

讓 `presentMajorEvent`、矩陣欄頭、段標籤和行程日期使用 `game-time.ts`。Run: `npm test -- tests/domain/game-time.test.ts tests/presenters/major-event-presenter.test.ts`

Expected: PASS；同一 Unix 秒數在不同宿主 `TZ` 下得到相同 UTC+8 字串。

---

### Task 2: 七槽遊戲式矩陣分頁與 UTC+8 日期導覽

**Files:**

- Modify: `miniprogram/subpkg-trade/presenters/major-event-presenter.ts`
- Test: `tests/presenters/major-event-presenter.test.ts`
- Modify: `miniprogram/subpkg-trade/pages/popularity/index.ts`
- Modify: `miniprogram/subpkg-trade/pages/popularity/index.wxml`
- Test: `tests/pages/major-event-page.test.ts`
- Test: `tests/domain/major-event-forecast.test.ts`

**Interfaces:**

- `presentMajorEventMatrix(occurrences, reference, tradeReference, segmentStartUnixSeconds, slotCount, currentHourStartUnixSeconds)` 產生 `1..7` 個整點槽；每槽含 `isCurrentHour: boolean`。
- Page 使用 `SLOTS_PER_MATRIX_SEGMENT = 7`。`rangeStart` 是 `gameHourStartUnixSeconds(now)`；`rangeEnd = now + horizonHours * 3600`；`totalSlotCount = ceil((rangeEnd - rangeStart) / 3600)`；頁段數為 `ceil(totalSlotCount / 7)`。
- 第 `n` 段起點是 `rangeStart + n * 7 * 3600`，最後一段以剩餘槽數截短；Date chip 依 UTC+8 日期範圍定位第一個相交頁段。
- 預測仍由 Domain 使用真實 `now` 和既有 `[now, end)` 視窗計算，所以目前槽只會出現尚未觸發事件。

- [x] **Step 1: 撰寫七槽矩陣和目前時段失敗測試**

驗證固定時間 `2026-09-25T10:47:00+08:00` 的矩陣欄頭從 `10:00` 開始共七欄，`10:00` 槽設為 `isCurrentHour`；跨 UTC+8 日期的 24／72／168 小時範圍不漏槽；Domain／Page 預測結果不得包含已在 `09:06` 發生的事件。

- [x] **Step 2: 執行頁面與 Presenter 專項測試，確認失敗**

Run: `npm test -- tests/pages/major-event-page.test.ts tests/presenters/major-event-presenter.test.ts`

Expected: 新增的七槽、UTC+8 日期及目前時段斷言 FAIL。

- [x] **Step 3: 實作可變槽數矩陣與 UTC+8 日期分頁**

更新 Presenter 只建立傳入槽數，計算 `segmentEndUnixSeconds` 為最後一槽結束時間，並為與 `currentHourStartUnixSeconds` 相同的槽設 `isCurrentHour`。更新 Page 的日期列、日期範圍、段索引、頁段數和快速跳日全部使用 `game-time.ts`；保留 24／72／168 小時 Domain 查詢和現有篩選。

- [x] **Step 4: 以七槽遊戲欄頭取代六槽與非整點標籤**

WXML 顯示 `slot.timeLabel`（整點 `HH:00`），目前欄頭和槽位套用 `matrix__slot-head--current`／`matrix__slot--current`；矩陣事件籤只顯示 `eventTypeName`，移除格內 `timeLabel`、分鐘及「整點」重複標籤。詳情與行程仍顯示精確 UTC+8 時刻。

- [x] **Step 5: 更新測試的範圍與分頁數**

對齊整點的固定測試時間下，斷言 24／72／168 小時分別有 4／11／24 個不重疊頁段；另以非整點 `now` 測試目前槽只納入 `triggerAtUnixSeconds >= now` 的事件。日期按鈕選取後要跳至與該 UTC+8 日期相交的第一頁。

- [x] **Step 6: 執行 Domain／Presenter／Page 測試**

Run: `npm test -- tests/domain/game-time.test.ts tests/domain/major-event-forecast.test.ts tests/presenters/major-event-presenter.test.ts tests/pages/major-event-page.test.ts`

Expected: PASS，原有來源週期、延遲邊界、每小時最多兩種事件和查下一次上限測試不變綠。

---

### Task 3: 遊戲式 Token、矩陣視覺和規則提示

**Files:**

- Modify: `docs/superpowers/specs/2026-08-09-design-foundation-design.md`
- Modify: `miniprogram/styles/design-foundation.wxss`
- Test: `tests/architecture/design-foundation.test.ts`
- Modify: `miniprogram/subpkg-trade/pages/popularity/index.wxml`
- Modify: `miniprogram/subpkg-trade/pages/popularity/index.wxss`
- Modify: `tests/pages/major-event-page.test.ts`

**Interfaces:**

- 新增兩個集中式 Token：遊戲式事件綠色底（深色文字）和目前時段黃色底（深色文字）；兩組文字對比均不低於 4.5:1。
- `.matrix__event-tag` 使用單一綠色事件條；行程／詳情保留原事件類型色 Token。
- `.matrix__slot--current` 和 `.matrix__slot-head--current` 標記 UTC+8 目前小時。
- 矩陣底部輔助文字：「時刻表顯示預計發生時間；城鎮活動可能優先，預算耗盡可提早結束，最長兩小時。」不顯示已發生事件或即時持續狀態。

- [x] **Step 1: 撰寫 Token 和矩陣樣式失敗測試**

在 Design Foundation 契約測試要求兩個新 Token 存在且文字對比達 4.5:1；在 Page markup 測試要求 UTC+8 標示、目前槽選中 class、事件條只顯示類型，以及規則輔助文字存在。

- [x] **Step 2: 執行 Token／Page 測試，確認新增斷言失敗**

Run: `npm test -- tests/architecture/design-foundation.test.ts tests/pages/major-event-page.test.ts`

Expected: 新增 Token 與 markup 斷言 FAIL。

- [x] **Step 3: 新增 Token 並實作遊戲式事件格**

更新權威 Design Foundation 文件與 `design-foundation.wxss`，以 Token 樣式呈現綠色事件條和黃色目前欄；時間欄寬維持 88rpx，總矩陣寬度按 216rpx 海域欄加七個時間槽計算，窄屏溢出僅留在 `.matrix-scroll`。

- [x] **Step 4: 加入 UTC+8 標示與規則輔助文字**

將靜態「依裝置時間」替換成「東八區時間」；在矩陣底部加入一段簡潔規則說明，避免把周期預測描述成保證發生或正在發生。

- [x] **Step 5: 執行 Token 和 Page 測試**

Run: `npm test -- tests/architecture/design-foundation.test.ts tests/pages/major-event-page.test.ts`

Expected: PASS，且現有導航、篩選、詳情、素材 fallback 和互動觸控測試維持通過。

---

### Task 4: DevTools 回歸場景與全量驗收

**Files:**

- Modify: `tools/miniprogram-review/scenarios/major-event-forecast.json`
- Modify: `tests/miniprogram-review/scenario.test.ts`
- Modify: `docs/superpowers/specs/2026-09-25-major-event-game-schedule-display-design.md`（僅在驗收結果要求規格文字同步時）

- [x] **Step 1: 擴充場景契約測試**

驗證矩陣場景覆蓋整點欄頭、目前小時、七槽分頁、事件詳情；空狀態場景維持可用。不要建立 past-event / two-hour lookback 動作。

- [x] **Step 2: 更新 DevTools 場景與 selector**

以穩定 class 選取目前小時欄、七槽矩陣和事件籤；保留 3 天／7 天瀏覽、日期選擇、矩陣事件詳情、行程列表、篩選及查下一次既有步驟。

- [x] **Step 3: 執行驗收場景並審查截圖**

Run: `npm run devtools:doctor`

Run: `npm run devtools:changed -- --mode iterate --summary "大流行時刻表對齊遊戲格式並固定 UTC+8"`

修正截圖中欄頭、黃色目前欄、綠色事件條、區域名稱或捲動範圍不符合規格的問題後，才進入 final。

- [x] **Step 4: 最終驗證**

Run: `npm run devtools:changed -- --mode final --summary "大流行 UTC+8 遊戲式時刻表驗收" --note "預測只包含現在與未來；已發生事件不回溯。"`

Run: `npm run verify`

Run: `git diff --check`

報告必須註明 320／375／393／430px 視口若無法由自動化設定則仍須手動檢查，不可宣稱已驗證。

- [x] **Step 5: 提交前停在使用者確認門**

展示 `git status --short`、變更檔案、驗證結果、HTML 報告和擬用提交訊息 `fix: 對齊大流行 UTC+8 遊戲時刻表`；未獲使用者明確確認前不執行產品程式碼提交。
