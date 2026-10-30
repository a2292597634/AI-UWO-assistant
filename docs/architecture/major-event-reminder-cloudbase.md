# 大流行微信提醒的 CloudBase 邊界與部署

本文件記錄大流行提醒的實作、相容部署與驗收。2026-10-30已部署單開關批次流程：頁面只有「提醒訂閱」開關，同一點擊先發起一次微信原生三模板授權，所有仍有效時點接受後，完整觀看一次廣告並開通對應提醒。自建提醒設定面板已移除；原流行詳情保留。當前是developer跳轉版本，沒有公開發版或提交Git。

兩個雲函數均為Nodejs20.19，業務15秒、worker60秒；六個集合維持ADMINONLY，九個索引含新status/templateId/nextRunAt索引均已核驗。worker客戶端調用禁止，其他原有函數規則不變；每分鐘Timer與私密CustomArgument正常。相容worker更新後已有真TRIGGER_TIMER成功，legacy與batch公開配置均enabled=true，原生prepareBatch成功且未改既有場次版本；原1條待發任務的ID、模板、時間、狀態部署前後完全相同。這些結果不等於新流程的真機批次授權、廣告及手機實收驗收。

三模板已由用戶詳情核驗並按提前量配置：3小時「活動參與通知」time3/thing1，1小時「新活動提醒」time2/thing10，10分鐘「會員活動提醒」time4/thing1。廣告位為adunit-accfb914625e0bc7。舊primary ID/FIELDS/STATE與v1接口保留，既有廣告權益及舊待發任務不自動改綁新模板。

## 服務接口與身分

下表為保留的v1接口；新版單開關使用文末三個batch接口，舊輸入輸出不擴鍵。

`major-event-reminder` 的入口為 `index.main`。事件格式為 `{ action, ...input }`，精確輸入輸出見 `miniprogram/contracts/major-event-reminder.ts`。成功為 `{ ok: true, data }`，失敗為 `{ ok: false, code, message }`。

| action     | 輸入                              | 輸出 data                             |
| ---------- | --------------------------------- | ------------------------------------- |
| getConfig  | 空物件                            | enabled、reason、templateId、adUnitId |
| list       | 空物件                            | subscriptions                         |
| prepare    | occurrence、requestId             | sessionId、subscription               |
| authorize  | sessionId、leadSeconds、requestId | subscription                          |
| completeAd | sessionId、requestId              | subscription                          |
| activate   | sessionId、requestId              | subscription                          |
| cancel     | key、expectedVersion、requestId   | subscription                          |

服務只在每次呼叫內讀取 `cloud.getWXContext().OPENID`。前端不能指定 owner、模板、收件者、正文、廣告位或任意發送時間。`getConfig` 可在沒有 OpenID 時查詢，其他 action 均需微信身分。訂閱主鍵為 owner 與 `zoneId:eventTypeId:triggerAtUnixSeconds` 的 SHA-256；每個主鍵及提前量僅一個 job。requestId 在 owner 範圍內唯一，同一編號換 action 或 payload 會回報 `request-conflict`。

`prepare` 只接受權威日程、嚴格未來的提醒時點與前端379小時查詢範圍。session 綁定 owner、訂閱主鍵、資料指紋與取消代數。取消須核對 version，原子取消 pending／authorized／unsubscribed；sending／unknown 不能撤回。取消會使舊 session 失效，重新 prepare 後可恢復本場尚未消耗的授權。一次 authorize 只登記指定的一個提前量，不把微信偏好 accept 當成剩餘次數。

完整廣告回調經 completeAd 記錄在本場並開通已登記時點。從未登記本場授權時不能記錄廣告完成；若觀看期間唯一已授權時點剛好過期，仍保存完整廣告權益並將過期時點標為 missed，不補建該時點 job。回應 adCompleted=true 不代表已有提醒開通；刷新或重開可恢復本場，補授權其他未過期時點後透過 activate 免重看開通，也可切換辦理其他場次。原 completeAd requestId 可重放查詢同一結果。activate 需要本場先有廣告完成紀錄及當下可開通的授權。普通廣告只有前端完成回調，此設計防重放、跨場與跨用戶混用，**不構成服務端驗簽的觀看證明**。微信授權回調也不是密碼學證明，以實際發送結果為準。

## 權威日程與可獨立部署的包

`data/master/major-events.json` 是唯一人工資料來源；本功能不修改該檔。`npm run data:generate` 會：

1. 對 master 原始位元組計算 SHA-256，投影海域相位／延遲、事件週期／順序與顯示名稱。
2. 在兩個部署包生成相同 `reference-data.json`。
3. 把業務包中的 `policy.js`、`config.js`、`repository.js` 複製到 worker 的 `shared/`；該目錄屬於工具產物，禁止手改。

規則驗證保留海域延遲、`401 * phaseHours` 及同時最多前兩類的原始順序，先截斷再按事件類型篩選。服務及 worker 都重新驗證日程與指紋；資料漂移會停止舊任務，不替換成其他場次。生成產物已納入 `DATA_GENERATION_OUTPUT_PATHS` 與 generate:check，正式生成先在候選目錄完成再原子替換。

兩個包只 require 包內檔案、Node 內建模組及 `wx-server-sdk`，部署時無需取得相鄰雲函數目錄。各自的 package.json 精確固定 `wx-server-sdk@4.0.2`；lock 沿用倉庫既有同版本完整解析，沒有重裝根依賴。部署時在各包使用 lock 安裝，不共用原工作區 node_modules。

## 必要環境變數與模板

兩個包都設定下列三項；範例檔 `cloudfunctions/major-event-reminder/config.example.json` 記錄用戶提供的模板 ID 及已核驗字段，版本刻意保持空值，預設不能直接啟用。

| 變數                             | 用途                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| MAJOR_REMINDER_TEMPLATE_ID       | 真實可用且類目匹配的普通一次性模板 ID；不得使用測試用假值   |
| MAJOR_REMINDER_TEMPLATE_FIELDS   | JSON 陣列，逐項為 source、key、type；必須按真實模板逐項映射 |
| MAJOR_REMINDER_MINIPROGRAM_STATE | developer、trial 或 formal，依實際版本選擇                  |

只接受兩種完整 profile，不接受任意子集或額外來源：

- 活動兩欄位：activity（thing）與 start（time），各一次。activity 合併海域、流行名、「預報」與提前量，例如「北極海·奢侈預報｜1小時後」。省去括號以讓全部權威海域／類型及三個提前量符合20字上限，保留完整名稱，超長資料明確拒絕、不截斷。
- 原五欄位：eventType、zone、start、lead、note，必須全部且各一次。

真實字段已按用戶於2026-10-29 23:25（東八區）提供的微信模板詳情截圖核驗：模板編號17120「活動參與通知」，類目「資訊查詢」；活動時間為 `{{time3.DATA}}`（source=start、key=time3、type=time），活動名稱為 `{{thing1.DATA}}`（source=activity、key=thing1、type=thing）。範例已使用此精確映射；測試內其他 key 仍僅為 fixture。更換模板時需重新核驗，不得按名稱猜測字段。

eventType／zone／lead／note 只能映射到真實 `thingN` 欄位，type 為 thing；start 映射到真實 `timeN`，type 為 time。欄位 key 不可重複，不能依範例臆造真實模板欄位。thing 按最多20個字符驗證；time 使用東八區 `YYYY-MM-DD HH:mm`。note 固定保存「依週期預測，實際狀態以遊戲為準」。模板、映射或版本缺失／無效時，getConfig.enabled 為 false，prepare／authorize／completeAd／activate 均停用；list／cancel 仍可用。

worker 的 `config.json` 僅授予 `subscribeMessage.send` 雲調用權限；業務函數不需要此發送權限。欄位不符合已核實模板型別時，不進入外部發送。

## 可信 Timer 與調用權限（部署前置）

worker 名稱必須為 `major-event-reminder-worker`，入口為 `index.main`，**平台最長執行時間設為60秒或以下**。程式核對平台 context 的 `time_limit_in_ms` 為正且不超過60000；缺失或配置過長均拒絕執行。這是120秒在途隔離的必要前提，不能透過放寬檢查來適配錯誤部署。

1. 在 CloudBase／SCF 調用權限中禁止小程序客戶端、HTTP／公開入口與一般雲函數調用 worker；只保留受限 Timer 執行角色必要的 Invoke 權限。移除公開觸發器，業務函數單獨保留小程序權限。
2. 設定 worker 的 `MAJOR_REMINDER_APPID=wx8f961bcd8b26996a` 與 `MAJOR_REMINDER_TRIGGER_NAME=major-reminder-minute`。包內 config.json 宣告每分鐘 `0 */1 * * * * *` 七欄 cron。
3. 在微信開發者工具確認正確小程序 AppID 與雲環境，先上傳部署 worker，再於雲開發目錄右鍵 `major-event-reminder-worker` 或其內的 `config.json` 選擇「上傳觸發器」。目錄尚未被工具識別為雲函數時，優先右鍵 `config.json`。必須使用微信 IDE 此步驟建立支援微信雲調用的定時觸發器；普通 SCF 控制台 Timer 或一般 CLI 建立 Timer 不等同此能力。依 [CloudBase 官方 FAQ](https://docs.cloudbase.net/faq/knowledge/missing-wxcloudapitoken-error)，只有微信 IDE 配置的定時調用支援微信雲調用。
4. 微信 Timer 入口只接受 SDK `getWXContext()` 的精確 `SOURCE=wx_trigger`、與配置完全相等的 APPID，且無 OPENID／FROM_OPENID。來源不接受逗號調用鏈、前後空白或其他 wx_ 來源；event 的身分欄位與巢狀 context 均不能提供身分。官方 Timer 的 Message 不必等於 SCF 私密參數。
5. 舊 SCF Timer 分支仍需私密 `MAJOR_REMINDER_TIMER_TOKEN`：在受控部署環境產生 32 個隨機位元組並編為 64 位小寫十六進位，透過 SCF CustomArgument 注入相同 Message，以恆時比較驗證，不得寫入 Git、前端或日誌；拒絕 wx_*／scf 調用鏈。但此驗證只證明排程來源，不會自動提供微信票據，也不代表能實際發送。
6. 兩個分支均要求平台 request_id／requestId、精確 function_name、0 < time_limit_in_ms ≤ 60000，及固定 TriggerName、可解析 Time。微信 `wx_trigger` 分支精確接受 `Type=timer` 或 `Type=Timer`；普通 SCF 分支仍只接受 `Type=Timer`，不使用不分大小寫或任意非空值判斷。2026-10-30 真雲驗證中，官方微信 Timer 使用小寫類型，票據及其餘身分檢查均通過。Time 是觸發器建立時間，不限制本輪新鮮度；到期窗口仍用伺服器當前時間。
7. 可信身分通過後，先只讀檢查平台環境 `WX_API_TOKEN` 或 `WX_TRIGGER_API_TOKEN_V0` 存在性；兩者皆缺失時返回 `wechat-context-unavailable` 與原五個 runtimeHealth 布林值，不執行 run／cleanup／claim，避免缺票據耗盡任務。SDK 4.0.2 的 getWXContext 會排除這兩種票據，不能從 event 或 wxContext 讀取替代。不得自行偽造或手動填入平台票據；存在性也不證明票據有效或微信已投遞。

歷史 unknown 任務維持原狀，不重排、不補發；本修復不改佇列語義。實際啟用須由受保護服務端結果確認可信微信 Timer 與健康狀態，再以仍有效的已授權場次驗證投遞。微信官方排程不一定列於 SCF `GetFunction.Triggers`；2026-10-30 真雲中該列表為空，仍有每分鐘的合法微信 Timer 調用，不應僅以列表數量判定停用。

已核對的官方來源：[Timer 的七欄 cron、Message 與入參格式](https://cloud.tencent.com/document/product/583/9708)、[SCF 平台 context 欄位](https://intl.cloud.tencent.com/document/product/583/9694?lang=en)、[CustomArgument 欄位](https://intl.cloud.tencent.com/zh/document/product/583/17244)、[CloudBase Timer 配置](https://docs.cloudbase.net/cli-v1/functions/trigger)、[微信 getWXContext](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/reference-sdk-api/utils/Cloud.getWXContext.html)。本地注入測試只驗證防護程式，不代表真 Timer 或真雲權限驗收。

## 集合、索引與資料庫權限

部署前建立 `cloudfunctions/major-event-reminder/database.example.json` 列出的六個集合，將小程序／客戶端 read 與 write 全部設為 false；僅受控雲函數服務端存取。不要在前端新增資料庫權限。

| 集合                         | 內容與唯一性                                                 | 索引                                                               |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| major_reminder_owners        | owner SHA-256 的唯一 _id；最多20個 active 與20個 recent 主鍵 | 內建唯一 _id                                                       |
| major_reminder_subscriptions | owner＋場次唯一；廣告權益、版本、槽位、資料指紋              | ownerUid＋key 唯一；cleanupEligible＋expiresAt 升序                |
| major_reminder_sessions      | UUID；owner、subId、取消代數、資料指紋                       | expiresAt 升序                                                     |
| major_reminder_operations    | owner＋requestId 的 SHA-256；原 payload 簽章與成功回覆       | expiresAt 升序                                                     |
| major_reminder_jobs          | subId＋lead 的 SHA-256；逐次發送狀態與結果                   | subId＋leadSeconds 唯一；status＋nextRunAt；status＋expiresAt 升序 |
| major_reminder_locks         | owner＋template 的 SHA-256；原子在途隔離                     | expiresAt 升序                                                     |

prepare、authorize 及 activate／completeAd 的恢復路徑共用同一段交易內 owner 索引讀取、修剪、20場上限檢查及主鍵登記，防止 count 後 insert 與「會話存在但場次已被修剪」的競態。滿額拒絕不移除已確認的本場廣告權益，名額釋出後可免重看恢復。list 直接讀完整 active 索引，再附最多20個 recent，最多40場；終態不會擠掉任何有效待辦。每次掃描最多50筆；沒有無界分頁或全表載入。唯一文件 _id 是第一道保護，部署唯一複合索引是第二道保護。

## 發送、取消、恢復與清理

job 狀態為 pending → sending → sent／failed／unknown，或因取消／過期變成 cancelled／missed。原子 claim 同時核對父訂閱、授權代數、廣告、模板、資料指紋、合法場次與窗口，再取得 owner／template 鎖；逐次 attemptId 與狀態在外部 API 前保存。

到期後最多恢復300秒，且絕不晚於事件開始。只對**已回覆且明確未受理**的 -1／45009 退避30秒，最多3次嘗試並再次檢查窗口。43101 等明確錯誤寫回 failed。拋出例外、超過20秒等待、無數值結果碼或 sending 租約失效均轉 unknown，原 job 永不自動重發；不解析錯誤文字猜測已受理與否。

用戶／模板鎖最多在開始後120秒保留在途隔離，平台最長執行時間必須不超過60秒。期滿後，只准**不同 job**繼續；交易先把舊 sending 保守改 unknown。舊 unknown 不回 pending。這避免一次不明結果永久封鎖該用戶全部後續提醒，同時不能承諾微信服務端的跨系統 exactly-once。外部消息若在送達端延遲，仍可能在後續消息附近出現。

sending 之後取消不能撤回微信請求；claim 保存本次訂閱取消代數，finish 在交易內重新核對。若發送期間取消且微信明確回覆未受理，job 與槽位轉 cancelled，不再自動退避重試；公開輸出保留 cancelled 終態。已提交的 sent 與不明結果的 unknown 不宣稱可撤回，前端應提示可能仍收到。微信 errcode／errCode 0 只代表已提交微信，不能當作手機實收證據。

終態、session 與 operation 在事件開始後保留30天；每日無獨立清理觸發器，可信每分鐘 worker 在有界掃描後清理。每個集合每輪最多50筆，jobs 依終態索引、subscriptions 依 cleanupEligible 查詢，交易內再次排除 pending／sending／unknown；這些受保護任務及其含未知結果的主記錄不自動刪除。unknown 需受控營運人員另行核實，不能以改回 pending 處理。過期鎖可在其隔離期限結束後清理。owner 索引在辦理時有界修剪，暫保留索引文件；不影響20場上限。

## 驗收層級與尚待外部確認

本地測試覆蓋真實 service、記憶體交易、假的 CloudBase API 適配、日程對照、併發、重放、模板欄位、未知結果、清理與包內相對引用。它們不證明真雲交易衝突語義、Timer envelope、調用權限、真實模板、激勵廣告、微信授權或手機實收。

正式啟用前，需在已授權的獨立雲測試環境驗證索引／權限、真 Timer 防偽與最長執行設定、真雲併發 claim、完整廣告及一次原生三模板批次授權，再驗證關閉小程序後的排程與手機實收。通知跳轉使用 `subpkg-trade/pages/popularity/index?zoneId=…&eventTypeId=…&triggerAtUnixSeconds=…`，應驗證精確回到同一場詳情。實際模板字段已核驗；版本缺失或其他啟用條件不滿足時仍保持停用，不要求用戶觀看廣告。

## 單開關批次契約（2026-10-30，本地實作待部署）

新增 `getBatchConfig:{}` 回傳 `{enabled,reason,adUnitId,templates}`，每個模板僅公開 `{leadSeconds,templateId,title}`，順序固定3小時／1小時／10分鐘。停用時 templates 為空陣列。`prepareBatch:{occurrence,requestId}` 回傳 `{sessionId,subscription}`；`authorizeBatch:{sessionId,templateIds,requestId}` 回傳 `{subscription}`。原 getConfig、prepare、authorize、completeAd、activate、cancel、list 的精確 DTO 與 envelope 不變。

新增環境變數 `MAJOR_REMINDER_BATCH_TEMPLATES`，精確三個不同 lead、ID、標題及完整字段 profile，範例記錄用戶截圖核驗的活動參與通知 time3/thing1、新活動提醒 time2/thing10、會員活動提醒 time4/thing1。批次配置沿用 `MAJOR_REMINDER_MINIPROGRAM_STATE`，保留原 primary ID／FIELDS／STATE；相同 ID 字段衝突時只停用新批次配置，舊任務仍用 primary 字段。

batch session 保存模板與提前量映射、owner、fingerprint、epoch；沒有 mode 的舊 session 視為 legacy。兩種授權 action 不可混用。authorizeBatch 原子檢查所有當下仍有效的時點都包含於接受模板，拒絕未知 ID、重複 ID 或不完整授權；已過的已知 ID 可忽略。沒有成功完整授權的 batch session 不可借用舊單時點權限呼叫 completeAd／activate。所有新交易沿用20場 owner 上限。微信回調仍不是密碼學授權證明。

可重辦槽綁定服務端 session 的 templateId 並增加 generation；已 pending／sending／unknown／sent 不被改綁或重發。創 job 使用槽的綁定，無 templateId 的舊槽回退 primary。worker 依 job.templateId 解析正文，primary 優先；缺少或無效 registry 時跳過尚不能解析的新 job，保留 pending，不標為 data-changed；legacy 作業照常。每用戶模板鎖、取消 epoch、租約及未知不重送規則不變。

部署順序為相容 worker → business → 新客戶端；兩包追加相同 registry 且保留 legacy 環境設定。此段只記錄本地程式行為，本輪子任務未部署、未操作真授權或廣告、未改真 pending 任務。

### registry 空窗的公平掃描與索引（已部署）

worker 保留原全域 pending 首50筆以核對未知模板狀態／generation／owner／資料與窗口。有效但缺少 registry 的任務仍是 pending，attempts 不增加，nextRunAt 延後最多30秒且不越過窗口終點；超過 dueAt+300 或到達活動開始即 missed，不補發。掃描後若 job／槽已被其他交易更新至 sending／unknown／sent 或新 generation，不覆寫該槽。

可解析模板各自查詢首50筆到期候選，合併去重、按 nextRunAt 排序後僅保留原50筆領取預算，最多發送50次。未知模板不佔此預算，因此即使有超過50筆未知模板積壓，也不遮蔽後方 legacy。每輪最多五個50筆 pending 查詢（全域加最多四個不同模板）；未知掃描與發送各自有界。部署 worker 前先為 major_reminder_jobs 追加非唯一複合索引 `[status,templateId,nextRunAt]`，保留既有索引；database.example.json 已同步。父整合已建立並回讀該索引、完成相容部署；子任務本地驗證與父真雲證據分別保存。

### 單開關的未確認操作恢復

沿用v1本機儲存，舊pending按原requestId重放；原生授權與新廣告不在前景恢復時自動彈出。完整廣告遇確定失效時，先保存同場收據再退役舊活動操作，避免封鎖其他場；收據不轉移給別場，同場仍有效可重新授權後免重看。最多20份收據，容量限制不阻擋取消、同場恢復或已由服務端確認的廣告權益。退役儲存錯誤使用專用分流，保留原活操作與持久pending/session/adFinished/requestId，不落一般失敗處理清除原編號。網路不明仍依原操作查詢，destroy遲到與儲存快照CAS不放寬。
