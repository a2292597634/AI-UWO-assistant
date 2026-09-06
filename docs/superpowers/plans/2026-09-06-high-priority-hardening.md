# 高優先級審查問題修復計劃

## Goal

在兩個阻斷項已修復後，處理審查報告中可由現有程式與回歸測試證明的高優先級問題：保存回應與本地狀態不同步、名鑑分頁資料過大、投稿查詢截斷、投稿頭像路徑碰撞、投稿重提並發重複，以及所有條件更新結果的明確檢查。

## Architecture

- 小程序保存成功後，以服務端回應的 `fleetState` 與 `version` 作為本地狀態基準，再重新渲染頁面；不改變 CloudBase 網路邊界。
- 名鑑頁只把目前分頁窗口傳給 `setData`，完整結果留在 page-local state，不改變篩選與分頁語義。
- 投稿 repository 使用固定大小的 `skip/limit` 分頁讀取，並新增只允許一次成功的 revision 插入交易；既有 revision 文件仍可被查詢。
- 重提頭像每次使用唯一上傳路徑；revision 插入以 deterministic document ID 的交易佔位檢查作為同一 `submissionId + revision` 的 CAS 門禁。

## Tech Stack

- TypeScript 小程序頁面與 Vitest
- Node.js CommonJS Cloud Function
- CloudBase database query/transaction API

## Global Constraints

- 不修改 `archive/`、不手動修改 `miniprogram/generated/`。
- 不新增、刪除或升級依賴。
- UI 只修正資料流與記憶體邊界，不新增 WXML/WXSS；因此不引入 Design Foundation 變更。
- 每項修復先寫失敗測試，再修改生產程式；不夾帶 Medium/Low 或依賴升級議題。
- 既有歷史投稿保持可讀；新 CAS 只對新 revision 寫入路徑提供原子門禁，查詢仍兼容舊 `_id`。

## Implementation Plan

- [ ] 為戰鬥與冒險頁增加保存回應狀態測試；成功保存後套用回應中的 `fleetState`、`version` 並重新渲染，避免本地狀態與服務端基準分離。
- [ ] 為名鑑 `loadMore` 增加超過 1,024KB 的回歸測試；以當前窗口大小限制 `visibleRows` 的 `setData` 負載，並保留完整結果在 page-local state。
- [ ] 為投稿 repository fake 加入 provider page limit，新增跨頁讀取測試；用固定 `skip/limit` 分頁取回全部資料。
- [ ] 為投稿頭像路徑增加重提唯一 token，補測同一投稿 revision 的兩次上傳不得使用相同 CloudBase 路徑。
- [ ] 新增 `insertRevisionIfAbsent` repository 交易 API，使用 deterministic revision 文件 ID 的 `doc().get/set` CAS；服務端重提遇到競爭時返回 `conflict`，不建立第二筆 revision。
- [ ] 檢查投稿和 fleet-config 所有條件更新的 `stats.updated`，保留衝突錯誤語義；以 repository/service 測試覆蓋 0 更新結果。
- [ ] 執行相關頁面與 Cloud Function 測試，再執行完整 `npm run verify`。

## Verification

- `npx vitest run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts tests/pages/catalog-page.test.ts`
- `npx vitest run tests/cloudfunctions/officer-custom-repository.test.ts tests/cloudfunctions/officer-custom-service.test.ts tests/fleet-config/fleet-config-repository.test.ts`
- `npm run verify`
