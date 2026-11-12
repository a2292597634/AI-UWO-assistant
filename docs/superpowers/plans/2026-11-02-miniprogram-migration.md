# 新小程序共享連線實施計畫

日期：2026-11-02。用戶已批准共享連線方案及其精確網路例外。本輪在既有遷移分支內執行，未獲授權提交、推送或公開發布。

## 目標與邊界

新 AppID `wxd0bc7afdc9cd334a` 經共享實例訪問舊 AppID `wx8f961bcd8b26996a` 的環境 `cloud1-d7gxfuxfe813b4eaa`。舊 AppID 維持原連線。只轉接現有六個業務函數及錯誤回報的既有上傳流程。共享初始化單次復用、失敗不自動重試寫入、不退回其他環境，未知 AppID 拒絕。既有業務服務的回應校驗不變；不改留言板來源與用戶歸屬，不改舊提醒任務。

## 執行步驟

- [ ] 先新增 `tests/runtime/shared-cloud-client.test.ts`：新 AppID 等待初始化後才呼叫、並發共用初始化、初始化失敗無業務呼叫、未知 AppID 拒絕、固定函數名和上傳路徑邊界。
- [ ] 觀察紅燈後實作 `miniprogram/runtime/shared-cloud-client.ts`，補充本地共享 SDK 型別，不新增依賴。以 `callSharedCloudFunction({name,data})`、`uploadSharedCloudFile({cloudPath,filePath})` 接入現有 runtime service；啟動時初始化，失敗由既有服務錯誤流程表達。
- [ ] 為掃描器新增精確共享入口契約測試，觀察紅燈，再更新 `tools/quality/find-runtime-network-references.ts`、網路檢查入口與架構測試；只允許已批准檔案與 API，保留既有白名單。
- [ ] 使用現有 Node 22.23.3 執行相關測試、型別與完整 verify。修改 project.config.json 的 AppID 形成新帳號候選，保留 Git 內舊配置可恢復。
- [ ] 執行 doctor、頁面 final 命令，讀取 HTML 及截圖；用新 AppID 的只讀實際呼叫驗證共享能力及身分，與 fixture 證據區分。需要微信掃碼或手動授權時請用戶接手。
- [ ] 整理候選變更、實測結果、HTML 報告與尚未完成的留言板／提醒／私有資料歸屬項目。不得把共享連線通過當作完整遷移完成。

## 驗證命令

`npm exec vitest run tests/runtime/shared-cloud-client.test.ts tests/runtime tests/architecture`

`npm run typecheck`、`npm run check:runtime-network`、`npm run verify`

`npm run devtools:doctor`、`npm run devtools:changed -- --mode final --summary 新小程序共享連線候選`

本機 Node 22：`C:/Users/XB/.codex/runtimes/uwo-review-node22/node-v22.23.3-win-x64`。所有 PATH 調整只作用於命令進程。
