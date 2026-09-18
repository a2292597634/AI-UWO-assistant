# Task 7：貿易品圖示下載與本機校驗報告

## 狀態

已完成。以下保留全量 CLI 的首次嘗試、634/404 與 setup/audit 失敗證據，但這些均為「歷史首次嘗試／override 修復前的記錄」，不代表目前結果。由於既有 3 個 skill 資料缺少 `sourceRefs.voyageTw`，全量 `npm run assets:download -- 0` 仍受既有資料前置項阻塞；本次採用 trade-only 下載與本機驗證，未修正 unrelated skill 資料。

指定的 `task-7-brief.md` 不存在於 worktree；本次依 `docs/superpowers/plans/2026-09-18-trade-goods-icons.md` 的 Task 7 原文執行。

## 實際命令與輸出摘要

1. **歷史首次嘗試（override 修復前）** — `npm run assets:download -- 0`：失敗（exit 1）。輸出在 `Building asset list...` 後中止：

   ```text
   TypeError: Cannot read properties of undefined (reading 'length')
   at skillIconUrl (tools/asset-pipeline/download-assets.ts:60:35)
   ```

   失敗發生於既有 `skillIconUrl()`，尚未進入貿易圖示 HTTP 下載；沒有 HTTP 200／非 200 或 PNG 解碼結果可報。

2. **歷史首次嘗試（override 修復前）** — `npm run assets:setup`：失敗（exit 1）。輸出先列出未收錄的 `skillT` 圖示 fallback，後由 `validateReferencedAssetSources()` 報出缺少既有 officer／skill 素材及所有 `trade_trade*.png`。因此 Sharp 無法開始驗證。

3. **歷史首次嘗試（override 修復前）** — 只讀完整性稽核（計劃原命令）：失敗（exit 1），訊息為 `貿易品圖示來源不完整`。

4. `npx vitest run tests/asset-pipeline tests/data-pipeline/asset-dependencies.test.ts tests/data-pipeline/asset-dependency-output.test.ts`：成功（exit 0）。`9 passed` 測試檔、`57 passed` 測試；耗時 3.45 秒。

## 數量與檔案清單

| 項目 | 實際數量 |
| --- | ---: |
| `data/master/trade-goods.json` 貿易品 | 656 |
| 預期去重來源 ID（歷史首次嘗試） | 634 |
| `data/assets/staging/trade_*.png`（歷史首次嘗試） | 0 |
| staged 貿易 PNG 總位元組（歷史首次嘗試） | 0 |
| `data/assets/source-asset-manifest.json`（歷史首次嘗試） | 不存在 |
| `data/assets/asset-dependencies.json` 的 `tradeIcons` | 656 |

實際新增／保留的貿易 PNG：無。沒有任何檔案被複製到 `miniprogram/`，沒有聯絡 CloudBase。

`assets:setup` 在素材缺失檢查前已重寫 tracked 的 `data/assets/asset-dependencies.json`（Git diff 為 1 行替換，內容加入貿易依賴映射）。這不是可驗證的成功產物，因 staged PNG 為 0；依倉庫提交門禁，未經使用者確認不提交。工作區原本已有未追蹤的 `docs/superpowers/plans/2026-09-18-trade-goods-icons.md`，未變更它。

## 疑慮與建議

- 阻塞根因是下載器對既有技能來源 ID 的未定義值沒有防護，與 voyage.tw 網路連線無關。本任務未偽造任何下載或校驗成功。
- **歷史首次嘗試的後續建議（已由後續 override 修復取代）**：原本建議由負責下載管線／既有素材資料的任務先修復或排除該前置項，再重新執行完整 Task 7 四個命令；當時預期 `goods=656, unique=634, staged=634`。目前已採用批准的 override，實際結果以後文 `goods=656, unique=633, staged=633` 為準。

## 重試（補充上下文後；前述為歷史首次嘗試）

本節前半的 634/404 下載結果、setup 失敗及 audit 失敗，均屬歷史首次 trade-only 嘗試，發生於 `trade02T092` override 修復前；目前有效結果請以「來源覆蓋修復與完成證據」一節為準。

### 本次前置處理與來源

- 保留第一次 `npm run assets:download -- 0` 的失敗紀錄；其仍因 3 個沒有 `sourceRefs.voyageTw` 的離線 skill 於 `skillIconUrl(undefined)` 中止。
- 只讀確認原 checkout `E:\AI UWO assistant\data\assets\staging` 有 1,687 個既有 PNG。
- worktree 的 staging 原有 1 個測試殘留 PNG：`officer_wo_2.png`。以「僅目的端不存在才複製」的方式自原 checkout 複製 1,686 個 PNG，完成後目的端共 1,687 個 PNG；未刪除或覆寫任何原 checkout 或目的端的既有檔案。
- 未聯絡 CloudBase，未修改 `archive/`、`data/master/` 或產品原始碼。

### 僅貿易圖示下載

建立 gitignore 的暫存腳本 `task-7-download-trade-icons.ts`，只呼叫已導出的 `buildTradeAssetEntries()` 和 `downloadAssets()`，並寫入 `data/assets/source-asset-manifest.json`。腳本首次因專案 CommonJS 輸出不支援 top-level await 失敗；依既有 CLI 的 Promise 模式改為 `main()` 包裝後重新執行。

```text
Trade entries: goods=656, unique=634
Done: 633 downloaded, 0 cached, 1 failed
Trade manifest: ok=633, failed=1
Manifest saved to data/assets/source-asset-manifest.json
```

真實 HTTP 結果：633 個來源回應 200；唯一失敗項為 `https://voyage.tw/img/trade/uwo_trade02T092.png`，狀態 404。manifest 共 634 條，其中 `trade02T092:404`；沒有將此項視為成功或建立假 PNG。

### setup、Sharp 與完整性校驗

1. `npm run assets:setup`：失敗（exit 1），唯一缺少的引用素材為 `trade_trade02T092.png`。既有 officer／skill staged 素材已足夠；輸出的 `skillT` fallback 僅為既有非收錄圖示提示，並非失敗原因。setup 在引用存在性檢查即停止，沒有進入其內建 Sharp 迴圈。
2. 為量化已下載素材，額外以 gitignore 的只讀 `task-7-validate-trade-pngs.ts` 實際呼叫 Sharp：

   ```text
   Sharp trade PNG validation: decoded=633, invalid=0
   ```

3. 計劃原樣的只讀 audit：失敗（exit 1，`貿易品圖示來源不完整`）。最終集合計數為 `goods=656`、`unique=634`、`staged=633`；缺少 `trade02T092`，沒有額外 staged ID。
4. `npx vitest run tests/asset-pipeline tests/data-pipeline/asset-dependencies.test.ts tests/data-pipeline/asset-dependency-output.test.ts`：成功（exit 0），9 個測試檔、57 項測試通過，耗時 3.53 秒。

目前 `data/assets/asset-dependencies.json` 讀出 `tradeIcons=656` 且根目錄列出 634 個預期 trade 檔名，但由於其中一個實際 staged 檔不存在，不能視為可發布或可完成的依賴校驗。最終 Git 狀態沒有 tracked 的 `data/assets/asset-dependencies.json` 變更，故沒有需要提交的生成檔；ignored PNG、manifest 與暫存腳本均不提交。

### 重試結論與素材疑慮

本次核心下載已真實連線 voyage.tw 並完成 633／634 個來源的本地下載與 Sharp 解碼。唯一阻塞是 voyage.tw 對 `trade02T092` 回應 404，導致 setup 及完整性 audit 無法完成。後續需由資料來源決策確認此 image ID 是否應有可用替代／覆蓋來源，再重新下載該項並重跑 setup 與 audit；本任務未自行推測或修改權威資料。

## 來源覆蓋修復與完成證據（目前有效結果）

### 根因與已批准的資料決策

voyage.tw 對黃銅礦 `trade02T092` 的專屬 URL 持續回傳 HTTP 404，而已確認可用的銅礦 `trade0801` 圖示回應 HTTP 200。使用者已明確批准將黃銅礦映射至後者；因此只在 canonical 資料把 `trade02T092.iconId` 由 `null` 改為 `trade0801`，保留 `sourceRefs.voyageTw: "trade02T092"` 作為原始來源溯源資訊。這符合既有 `iconId ?? sourceRefs.voyageTw` 解析規則，並使黃銅礦與銅礦共用同一張已驗證圖示，而不偽造不存在的黃銅礦 PNG。

首次套用時因 JSON 中有多筆相同的 `lowSeasonIds`／`iconId` 上下文，誤命中 `trade0201`（醬油）。已透過資料導向回歸測試偵測：先確認「633 個條目且黃銅礦 `iconId` 為 `trade0801`」在錯誤資料下失敗，再精確還原醬油並更新黃銅礦，測試轉綠。

### 本次命令與實際結果

1. `npm run data:check`：成功。`Phase 2 data audit: PASS`；資料契約 9 檔、58 項通過。
2. `npx vitest run tests/asset-pipeline/download-assets.test.ts`：RED 時明確得到 `expected null to be "trade0801"`；修正後 GREEN，1 檔、5 項通過。
3. `npx tsx .superpowers/sdd/2026-09-18-trade-goods-icons/task-7-download-trade-icons.ts`：實際請求更新後 633 項來源，輸出 `Trade entries: goods=656, unique=633`、`Done: 633 downloaded, 0 cached, 0 failed`。ignored `data/assets/source-asset-manifest.json` 已覆寫為 633 筆 HTTP 200 記錄，沒有 `trade02T092` 404 項。
4. `npm run assets:setup`：成功。`Referenced PNG files: 2319`、`Retained source PNG files: 2319`、`Staged 2319 PNG files (633 compressed)`；因此所有被引用 PNG 均通過 setup 的 Sharp 處理。
5. 更新後的只讀 audit：成功，`Trade icon sources: goods=656, unique=633, staged=633`，集合無差異。
6. `npx vitest run tests/asset-pipeline tests/data-pipeline/asset-dependencies.test.ts tests/data-pipeline/asset-dependency-output.test.ts`：9 檔、57 項通過。
7. 最終再次執行 `npm run data:check`：成功，資料審計通過，資料契約 9 檔、58 項通過。

### 結論

Task 7 完成：656 個商品引用解析至 633 個唯一貿易圖示，633 個來源均為 HTTP 200，staging 有對應的 633 個 `trade_*.png`，並已通過 setup／Sharp、完整性 audit 與聚焦測試。全量下載 CLI 仍受既有 3 個缺少 `sourceRefs.voyageTw` 的 skill 資料阻塞；本次以 trade-only 驗證完成貿易品範圍，未修 unrelated 資料。未執行 CloudBase 發布。
