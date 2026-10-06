# 私有頭像暫存與圖片安全回調調整

> 執行者使用 executing-plans 與 TDD，沿用現有隔離 worktree，由目前代理順序執行。使用者本輪已指示解決這兩項門檻；不重複要求批准既有範圍，不提交或發布正式業務。

**目標：** 在既有付費環境驗證小圖私有暫存及 HTTP 圖片安全事件接收，保護既有公開素材。

**方案：** 放棄修改共用儲存桶規則。限 64 KiB／256px 的合成圖片以 base64 存在 ADMINONLY 專用探測集合；本人透過 RPC 預覽。HTTP 入口以服務端 HMAC、素材內容 SHA、批次與到期時間驗證檢查連結，至少 60 分鐘有效，不下發給小程序。回調安全模式 JSON 驗簽／解密後交易落庫，早到事件在 trace 保存時匹配，晚到事件在接收時匹配；重複事件不重覆作用。這是 G0 技術探測，不替代正式持久任務、管理員審核或真機驗收。

**技術：** Node 22 本機、Nodejs20.19 雲函數、既有 wx-server-sdk 4.0.2、Vitest；不新增根依賴、不新增客戶端網路例外。

## 邊界與選擇

- 公共桶局部規則已遭平台拒絕／造成舊素材 403，停止沿用。另建環境被使用者拒絕費用。故採私有集合加受控檢查入口。
- 新增共享授權 scope `private-avatar-callback`，只能執行身分、暫存／預覽／檢查／狀態／清理與專用 HTTP；禁止文字檢查、公開圖片及舊儲存型動作。
- 集合僅使用 `message_board_probe_assets/traces/events/results`；讀寫 ADMINONLY，首次建立前確認不存在或符合本探測已登記權限。只清理本批資料。
- 新增專用 callback 探測函数和 `/message-board-g0/<runId>` 路由；不變更其他路由、全域認證或既有微信消息推送配置。
- 圖片與 metadata 同一文件寫入，預覽重驗歸屬、run/candidate/build、SHA、大小與格式；不產生未審核公開物件。
- 簽名秘密、Token、AESKey 僅保存在 ignored 受控配置，不輸出聊天或日誌。HTTP 錯誤不回傳上下文、base64 或詳細 provider 原文。
- provider 調用在交易外，trace 映射與已驗證結果交易匹配；匹配同 run/candidate/build/asset/hash。未知 trace 只短期暫存；已刪除／過期素材拒絕匹配。自動 pass 不公開。
- 本批最多一次合成圖片檢查，失敗不盲目重發；45 分鐘無結果保持未完成。沒有第二帳號不假冒實測。
- 微信後台已被瀏覽器站點政策阻擋，不以其他渠道繞過；先準備與驗證接收端，再提供使用者可操作的具體配置。

## 任務與驗證

- [x] P1：新增 `tests/message-board/private-avatar-callback.test.ts`，驗證暫存不碰 storage、本人預覽／他人拒絕、大小／SHA／過期、有效／缺失／篡改／過期 HMAC、安全回調假簽名／錯 AppID、早到／重複／未知 trace、DB 故障不 ack、刪除後結果不恢復。觀察紅測試。
- [x] P2：新增 `tools/message-board/probe-sources/private-avatar.js`，修改 `shared.js/rpc.js/callback.js/build-probe-package.ts`，實作有界私有集合、檢查連結及雙向事件匹配；擴充組包契約測試，觀察綠測試及重現性。
- [x] P3：讀取現有環境／函數／路由／集合／儲存權限，保留快照；部署本批停用包、專用 ADMINONLY 集合和單一路由。若額外套餐／全域改動才能運作則停止依賴步驟，仍完成可獨立驗證。
- [x] P4：DevTools 真 SDK 暫存／預覽／直接 DB 拒絕、HTTP 無簽名拒絕與有簽名實際 PNG SHA、真 HTTP 合成加密事件落庫／去重。合成事件只算協議真雲驗證，不能當微信實際推送。檢查舊素材保持 HTTP 200 與 SHA。
- [ ] P5：接收端具備可測條件後提供微信後台配置與既有路由保護指引；尚未收到真實 provider 事件則保留 not-run，不宣稱 G0 通過。
- [x] P6：完整 verify、原根保護與原業務函數核對；記錄實際新增资源、停用／保留接收端狀態、清理結果與剩餘門檻。

實際部署前若 HTTP 網關需要修改環境級認證，不執行該修改。callback URL／JSON 安全模式需求按現有 spec；若既有接收端不能確認，不要求使用者覆蓋它。

## 本批執行結果

P1–P4／P6 已完成，P5 接收端與本機配置已準備，使用者尚未確認既有微信推送或完成設定；真正 provider 檢查／推送仍 not-run。相關 104 測試、完整 2,652 測試及 100 資料契約通過。合成物已清理，rpc 停用，callback 限時開放至 2026-10-07 07:12（UTC+8）。未購買環境、未改公共桶／原四函數／原根檔案，未提交或發布。詳見 [本批證據](../../audits/2026-10-06-message-board-private-avatar-callback.md)。
