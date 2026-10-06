# 留言板現有付費環境測試記錄

## 結果與範圍

使用者明確選擇沿用現有付費環境 `cloud1-d7gxfuxfe813b4eaa`，不購買第二環境，也不繼續免費環境兌換流程。已新增一個專用 `message-board-g0-rpc`；完成實際開發者工具 SDK 的單帳號身分與合成文字安全 API 調用，文字結果為 pass。測試後恢復 `MESSAGE_BOARD_PROBE_ENABLED=false`。

沒有建立其他環境、購買套餐、改續費／超限設定、發布留言板，沒有新增根依賴。調用計入現有套餐用量，不把「沒有新增環境月費」說成「完全沒有資源消耗」。

## 候選與保護

- 執行根：`C:\Users\XB\.codex\worktrees\phase-58-message-board\AI UWO assistant`。
- 分支：`codex/phase-58-message-board`；基線 `9fb8dec43d6f8bbc3c7ab54ba36c3fb33241f8aa`，未提交。
- 最終探測 buildSha：`5df5e4d06d434412a62a5337d995ddba94ba02b8aeacf224beb2b89da0651e44`，runId：`g0-shared-20261006-66b772f0`；授權只接受本環境／批次與 identity-text 範圍，2026-10-06 16:02:51.579（UTC+8）到期。
- 產物及各次來源修正的 manifest 保存在 `artifacts/message-board-probes/`，不覆寫舊批次。SDK 維持既有 4.0.2，rpc runtime 為平台支援的 Nodejs20.19、128 MB、5 秒。
- 原根 963 個受保護 tracked／untracked 檔案重新核對，變更數 0。
- 四個既有函數 `coupon-redemption`、`officer-maintenance`、`officer-custom`、`fleet-config` 的配置 hash／修改時間／代碼大小／版本快照保存在 `shared-environment-before.json`／`shared-environment-after.json`；只更新新探測函數。
- 儲存規則保持 ADMINWRITE，未建立集合、未上傳玩家或測試頭像、未改既有消息回調。

## 本機與雲端證據

- 新增共享環境授權、到期／run 邊界、直接開發者工具來源、來源拒絕與脫敏錯誤觀察測例，保留紅→綠紀錄；目前留言板探測 3 檔／55 項通過。
- 最終完整 `npm run verify` 退出碼 0：189 檔／2,603 項測試，資料契約另 12 檔／100 項通過，master 0 errors／5,254 待複核項保持；格式、lint、typecheck、網路邊界、素材／體積／manifest 與只讀生成均通過。記錄在 `.superpowers/message-board-g0/shared-environment-final-55-verify.log`，最後的文檔修訂另跑局部格式與 diff 檢查。
- 真雲部署紀錄：`shared-environment-deploy.log`、後續新批次部署 log、`shared-wechat-permission-deploy.log`。只部署 rpc；callback／worker 雖組包但未部署。
- `shared-client-diagnostic.json`：隔離根啟動綁定，DevTools 2.02.2609292、SDK 3.17.3、390×753、首頁，實際 SDK 調到預設停用的雲函數。這不代表公開基礎庫 3.7.0 或真機驗收。
- `shared-source-observation.json`：確認來源是 wx_devtools，AppID 相符、OpenID 存在、無 FROM_APPID，不記完整 OpenID。修正只在固化共享授權中接受直接 wx_devtools；其他來源保留拒絕。
- `shared-actor-config-confirmation.json`：文字檢查前核對遠端操作者配置；保留最初配置剛更新後遇到的 actor-forbidden 原始失敗，不以重試成功覆寫歷史。
- `shared-provider-observation.json`：實際 security.msgSecCheck 返回 -604101。包內權限声明本身不足以證明微信側登記完成；使用微信官方 CLI 只上傳 rpc 包並登記單一文字 API 权限後成功。
- `shared-client-getIdentity.json`／`shared-text-after-wechat-grant.json`：實際 SDK 的本次環境／AppID／build／run 一致；單帳號身分成功、文字 API trace 與 pass 結果。只使用固定合成文字。

## 尚未驗收

G0 整體仍未通過：跨帳號／同實例身分對照、HTTP／timer 真來源、私有頭像客戶端 ACL、64 KiB 傳輸／原生展示、圖片異步安全回調及匹配／清理尚未完成。已有局部結果不能把三項 gate 改為 passed，也不放行正式業務發布。

現有儲存是所有人可讀，目錄名稱不能當私有權限。下一批須先確認可保留舊素材權限、只限制新私有前綴的隔離方法，以及不覆寫舊微信消息路由的回調方案；不擅自改全局規則來試錯。

依據：[平台 runtime](https://docs.cloudbase.net/cloud-function/runtime-support)、[微信側 -604101 與權限登記](https://docs.cloudbase.net/en/faq/knowledge/cloud-call-604101-permission-error)、本機微信官方 CLI 的單一路徑部署 help。以上官方文檔與實際結果互相核對，不以文檔代替實測。
