# 新端關閉廣告並啟用既有功能設計

日期：2026-11-04；基線 d5161f9c7c01ca583460071a5b7406bc9375fcb0。

用戶已確認：「廣告完全關閉；提醒經微信授權直接開通；留言經內容安全及管理員審核後公開；新端管理員獨立白名單；新舊私人資料隔離」。沿用既有頁面與流程，不新增展示介面或改版。

## 已核實的現況

新 AppID wxd0bc7afdc9cd334a；資源方 wx8f961bcd8b26996a；共享環境 cloud1-d7gxfuxfe813b4eaa。2026-11-04實查新帳號消息推送 enable=false、cloudfunction模式、callbacks空。新端 handler 暫停共享提醒及留言寫入；前端仍有廣告開通路徑。舊端已上線的免廣告提醒及歷史任務必須保留。

## 提醒

採用舊端已驗證的一次微信三模板授權後直接開通流程；新端不建立、不預載、不展示激勵視頻廣告，也不將廣告完成偽裝成授權。新模板由新AppID獨立配置，不能借用舊AppID模板。

共享handler以可信 FROM_APPID／FROM_OPENID 選擇新端profile及命名空間owner，僅在新配置完整且顯式啟用後開放 prepareBatch／activateAuthorized。新端拒絕廣告動作。worker以任務服務端身份選擇模板、原生收件OpenID及 cloud.openapi({appid})。舊任務無新字段時嚴格維持舊AppID及原始owner處理；不得把帶命名空間的ownerUID當作微信收件OpenID。

新端環境鍵採 MAJOR_REMINDER_NEW_ENABLED、MAJOR_REMINDER_NEW_TEMPLATE_ID、MAJOR_REMINDER_NEW_TEMPLATE_FIELDS、MAJOR_REMINDER_NEW_BATCH_TEMPLATES、MAJOR_REMINDER_NEW_MINIPROGRAM_STATE。舊鍵與歷史任務不改。新公開配置 adUnitId 為空。

## 留言與管理

保留原公共留言、所有安全與人工審核條件。actor及owner持久記錄可信appId；缺失appId的歷史owner按固定舊AppID解釋。安全檢查按owner的appId與原生OpenID路由，禁止用舊身份檢查新OpenID。

新端使用獨立 callback URL／token／AES key／image key 及新管理員名單；既有HTTP簽名、AES解密、圖片URL及回調事件校驗不放寬。新回調按固定獨立路徑分派，驗證解密AppID與資產／任務來源一致，不接受任意請求指定AppID。新事件profile缺失配置時保持新端寫入停用，舊端不受影響。

新端環境鍵採 MESSAGE_BOARD_NEW_ENABLED、MESSAGE_BOARD_NEW_CALLBACK_URL、MESSAGE_BOARD_NEW_CALLBACK_TOKEN、MESSAGE_BOARD_NEW_CALLBACK_AES_KEY、MESSAGE_BOARD_NEW_IMAGE_KEY、MESSAGE_BOARD_NEW_ADMIN_OPENIDS。原有管理員及舊字段保持，不能僅憑caller自稱管理員或公開OpenID格式授權。新端管理員名單配置僅針對確認的操作者，不批量繼承舊身份。

## 發布邊界

用獨立新版worktree開發，不動舊維護分支。已有六個業務函數及精確runtime網路白名單不擴大，不新增依賴；雲端只從新版兼容實現準備最小增量。先保存當前線上完整包及配置，再比較候選，不使用11月2日舊備份覆蓋11月3日提醒更新。部署、配置及回調有開發者工具實際確認時保留taskId，等確認後查原任務。

後台正在填寫的隱私指引原頁保留，不自動提交協議。新模板／回調等平台設定、手機授權與通知實收均單列驗收。代碼提交仍按AGENTS最後確認；正式上線須在候選可審閱、平台前置條件及驗收完成後執行，不把本地測試當已發布。

## 驗收

TDD覆蓋：新配置完整／缺失，固定AppID路由，舊／新原生收件者，未授權／跨帳號拒絕，廣告API零呼叫，請求失敗及重入／取消，新owner的文字及圖片安全路由，新舊回調互相拒絕，管理員範圍，舊記錄相容。完整 verify、包體與精確網路掃描通過；正式保存場景截圖生成HTML報告。真雲驗證使用本輪臨時資料並清理，不改舊私人資料或歷史提醒任務。
