# 私有頭像與圖片安全接收端驗證

## 結論

私有暫存與 HTTP 接收協議已在現有付費環境驗證可用。真實微信圖片安全 API／推送、跨帳號與真機仍未驗收；G0 整體未通過，留言板業務與頁面未實作／未發布。

頭像 base64 存在服務端專用 ADMINONLY 集合，不修改公共桶規則。本人透過真 DevTools SDK 可預覽精確 65,536 bytes 的合法 PNG，SHA 與輸入相同、原生解碼 64×64；客戶端對四集合直接查詢及一次寫入均收到明確權限拒絕。服務端 HMAC 連結的真 HTTP 讀取 SHA 相同，無簽名及篡改簽名均 HTTP 403。沒有未審核公開副本。

URL 校驗協議及安全模式 JSON 合成加密事件均經真 HTTP 入口驗證。兩次相同事件只保留一份已驗證事件，未知 trace 不變更素材狀態；錯誤簽名拒絕。這是自行生成事件的協議／真雲落庫證據，不是微信 provider 推送證據。早到／晚到、內容 hash／嘗試 ID、45 分鐘逾時、資料庫失敗不 ack、刪除後不恢復的狀態規則另由本地測試驗證。

## 身分與來源

- 根：`C:\Users\XB\.codex\worktrees\phase-58-message-board\AI UWO assistant`；分支 `codex/phase-58-message-board`；候選基線 `9fb8dec43d6f8bbc3c7ab54ba36c3fb33241f8aa`。
- 環境 `cloud1-d7gxfuxfe813b4eaa`，既有個人付費版；沒有購買或建立其他環境。
- run `g0-shared-private-20f790019b37`；最終 build `5357e51e46cdd680593e111094521767fb5ecb2f8488c5369349d93987b2e3ce`。普通 payload／環境變量不能改變固化 scope／批次／到期日。
- 本機 Node 22.23.3、雲端 Nodejs20.19、既有 wx-server-sdk 4.0.2。DevTools 2.02.2609292／私有 SDK 3.17.3；不當作公開基礎庫或物理設備驗收。
- SDK `ws://127.0.0.1:9458` 綁定隔離根，單一實際微信操作者；沒有用假 OpenID 代替另一帳號。
- 官方開發者工具只上傳本批 rpc 的 `security.mediaCheckAsync` 權限声明，CLI 成功不代表 API 真正受理或近期訪問条件已通過。

## HTTP 平台差異

實測 getWXContext 在 HTTP 網關沒有 ENV／SOURCE／OPENID。僅簽名 HTTP 入口可使用服務端 TCB_ENV 和 SCF_NAMESPACE，兩者同時匹配本次環境；RPC 不允許此分支，不能以 event 自稱 ENV／SOURCE／OpenID 通過。

專用路由需 `enablePathTransmission=true` 才有預期 HTTP envelope；配置回讀成功與流量實際生效存在延遲。保留前次 invalid-http 及之後生效的真實記錄，不以離線格式測試代替平台結果。沒有改變全域認證、其他路由或既有微信消息推送設定。

## 本機門禁與保護

本輪探測相關 6 檔／104 測試通過；完整 npm run verify 成功，192 檔／2,652 測試，資料契約另 12 檔／100 測試。所有紅測試與修正分開保存，不覆寫成綠色。完整記錄 `.superpowers/message-board-g0/private-callback-release-verify.log`。

原工作區受保護 963 檔及原四業務雲函數核對沒有變更。舊公開素材 SDK 取址／HTTP 200／SHA 一致，公共桶仍 ADMINWRITE。未改根依賴、客戶端網路白名單，未提交或推送。

新增四個 ADMINONLY 集合 `message_board_probe_assets/traces/events/results`；本批合成圖片與事件已清理。rpc 最終停用，callback 保留限時接收準備；固化授權截至 2026-10-07 07:12（UTC+8），到期拒絕處理。這不是正式發布接收地址。

## 下一個必需步驟

使用者須先確認既有微信消息推送狀態。若未啟用，可使用本機受控配置完成 JSON／安全模式設定及真正微信 URL 校驗；若已啟用，保留原地址／Token／AESKey，先在既有接收器分流，不覆寫它。工具的站點安全政策禁止訪問微信後台，沒有換渠道繞過。

配置與秘密僅在本機受控 Temp 目錄，不寫 Git、普通日誌或聊天。完成設定後，才用本人近期訪問身分發起一次合成圖片的真實安全檢查，驗收 trace／回調／匹配／清理；目前這些 provider 步驟是 not-run。正式持久任務租約、重試與保留策略仍屬後續 B2／B4，不因本批協議成功而銷項。

## 證據位置

`artifacts/message-board/g0-shared-private-20f790019b37/`：

- `report.json`：receiver-ready-provider-not-run、7 項真實檢查及清理結果。
- `live-http-envelope.json`：真 HTTP 最小上下文與字段名；沒有完整 headers／請求內容／密鑰。
- `synthetic-events-read.log`：同一合成 trace 一筆記錄，matched=false；QUERY 回傳直接資料列，不能誤讀成 cursor。
- `owned-route-after.log`／`verify-message_board_probe_*.log`：專用路由 HTTP 透傳及四集合 ADMINONLY。
- `final-function-state.json`：rpc 停用／callback 限時啟用，兩者 Nodejs20.19。
- `final-original-protection.json`／`final-business-function-protection.json`：原工作區及既有業務函數保護。
- `report-cli-prefix-failure.json`、`report-http-context-failure.json`、`report-http-envelope-failure.json`、`report-path-transmission-failure.json`、`report-query-wrapper-failure.json`：歷史工具／相容性失敗，保留失敗狀態。

參考：[資料庫權限類別](https://docs.cloudbase.net/api-reference/manager/node/rule)、[HTTP 云函數存取與 envelope](https://docs.cloudbase.net/service/access-cloud-function)、[HTTP 路由生效說明](https://docs.cloudbase.net/service/quick-start)。實際結果優先於文檔假設。

## 本機提交前審查修正

使用者另行授權先提交合併。本輪只讀審查發現 submit 在交易回調外保留 claimed，提交衝突重播時讀到另一請求的 trace，仍可能沿用初次 claim 再呼叫 provider。先以回滾／其他請求已完成／回調重播場景重現失敗，再改成採用最後成功交易回傳的 asset／claimed。相關測試由 104 增為 105；紅證據在 `.superpowers/message-board-g0/transaction-replay-red.log`。

此修正只進本機候選，沒有重新部署；上文 build 5357 的真雲圖片與協議證據保持原始版本範圍。真正 provider 檢查開始前須按新提交重新組包並部署配對 rpc／callback，不能以舊真雲證據替代修正後的交易／provider 驗收。組包與回調配置文檔同時補上 IMAGE_KEY／HTTP_URL 的名稱、格式和用途，不記秘密值。

提交範圍為留言板規格／分批計畫／G0 準備、相關探測工具與测试、精確生成目錄 ignore，以及已授權的 AGENTS／CLAUDE 網路條款文字對齊。保留 main 已有 Node 22／只讀預檢／生成檢查規則；不匯入原工作區過期的其他規範段落或個人配置。本次是部分成果 checkpoint，沒有發布留言板或宣稱 G0 整體通過。
