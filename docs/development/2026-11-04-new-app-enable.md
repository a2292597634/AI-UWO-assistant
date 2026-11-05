# 新端無廣告功能啟用候選與驗收記錄

日期：2026-11-04。基線 d5161f9c7c01ca583460071a5b7406bc9375fcb0；工作區 `C:\Users\XB\.codex\worktrees\uwo-new-app-enable\AI UWO assistant`；分支 `codex/phase-20261104-new-app-enable`。

## 授權與範圍

用戶要求新端因尚未開通流量主而先關閉廣告，其他功能正常上線，並確認具體方案：廣告完全關閉；提醒經微信授權直接開通；留言經內容安全及管理員審核後公開；新端管理員獨立白名單；新舊私人資料隔離。

本輪不修改舊維護工作區或新版維護分支；候選未提交、未合併、未推送，沒有更新雲端代碼／環境、微信上傳、審核或正式發布。具體設計、計畫及恢復台帳見 `docs/superpowers/specs/2026-11-04-new-app-enable-design.md`、`docs/superpowers/plans/2026-11-04-new-app-enable.md`、`.superpowers/sdd/2026-11-04-new-app-enable/progress.md`。

## 代碼候選

- 前端移植舊端已驗證的授權直通流程，但保留新版 shared-cloud-client。一次點擊先在原點擊堆疊發起三模板微信授權，再開通有效時點；沒有廣告預載／觀看調用、不偽造廣告完成。保留取消、併發、重入、卸載及操作回執。
- runtime接受空廣告位，但不放寬其他模板、DTO或字串型別校驗。
- 提醒handler只有完整且顯式啟用的新profile才開放批次直接授權，拒絕新端廣告及舊單槽動作。worker依服務端owner命名空間選新模板、原生OpenID及固定新AppID；舊歷史任務使用原有配置／收件者，Timer與執行設定不變。
- 留言的owner保存可信AppID，安全檢查、圖片URL及回調按目標owner選profile；新舊HTTP／AES／HMAC及trace隔離，歷史缺AppID按舊資料相容規則處理。新管理員獨立白名單，普通使用者不能跨端讀取私人資料；管理員維持既有公共板審核範圍。
- 新profile缺配置時保留新端只讀；舊端不受新profile停用影響。混合安全隊列避免停用的新任務遮蔽舊任務。

## 紅綠與審查

前端先移植測試觀察28失敗，再實作後66項通過。新提醒12項測試先4失敗轉全通；審查發現primary缺失仍可開batch，補測後重現1失敗，再共用完整配置門禁，最終14項通過。runtime空廣告位2項先失敗再轉通過，單檔10項通過。

留言新增測試逐步重現並修正profile、來源、混合隊列及回調邊界。首輪審查發現新管理員填寫審核／舉報理由仍用舊AppID；新增七類實際管理動作與未知／缺失AppID測試後修正，最終18個新測試通過，留言相關23檔255項及tsc通過。兩個task審查及最終整合審查均通過，無未解決P0／P1／P2；最終審查另以Node22執行4檔49項定向驗證及實際handler的SDK分派斷言。

`wx-server-sdk` 4.0.2的本機部署備份實碼確認支持 `cloud.openapi({appid})`；這只證明SDK介面形狀，不能當作新AppID的線上票據、權限或發送已驗收。

## 完整門禁

Node22.23.3獨立npm ci及已發布三張測試素材校驗後，完整 `npm run verify` 退出0：244檔3479項測試，另13檔101項資料契約；格式、lint、typecheck、精確網路白名單、包體、素材、manifest、資料及只讀生成均通過。

主包編譯壓縮估算含32KiB工程預留為1,991,954 bytes；這是本地估算，不是開發者工具真上傳包。依賴、網路例外、master及正式生成資料沒有變更。早期完整驗證在會話中斷後無終態，保存 `verify-final-interrupted-01.log`；最終通過日誌及exit-code另存，沒有把中斷視作通過。

## 目前線上備份與增量候選

四個當前線上函數完整ZIP已由既有官方CloudBase CLI只讀取得，保存於 `C:\Users\XB\.codex\backups\new-app-enable-20261104`；完整環境metadata含私有值，僅本機，不作公開附件。四函數均Active、Nodejs20.19、SDK4.0.2；timeout依次15／60／30／30秒。既有雲函數工具只返回狀態／runtime／timeout，不能據此冒稱取得完整代碼；完整備份另外經CloudBase API完成。

候選是incremental-files-only：major-event-reminder 2檔、worker 3檔、message-board 9檔、events 9檔，共23個文件；兩個留言包的共同core分別對映shared/core。每個被修改的實際線上文件與Git基線逐一比較，只有正常換行／尾端空白規範化，零基線差異。保留線上index／package／permissions作本地上下文，不重新安裝依賴，不覆蓋非清單文件。候選未部署。

## 平台與驗收阻塞

1. 實際後台AppID核對為wxd0bc7afdc9cd334a；最近讀取我的模板生效數0。舊專屬ID不能直接當作新帳號已添加；可選同款模板，最終以新帳號模板列表的ID與字段為準。已請用戶選三款並提供ID及字段鍵。
2. 新帳號消息推送實查enable=false、cloudfunction模式、callbacks空。獨立callback URL/token/AES/image key草稿僅保存在本機private文件，使用真實readConfig校驗通過，沒有套用。舊回調及憑證保持。
3. 既有回調路由為環境內已存在的wildcard-domain規則，path transmission開啟，目標message-board-events；新path擬在舊callback下加/new-app，沒有建立新路由或放寬鑑權。需要實際新HTTP挑戰／加密回調與安全API驗證。
4. 新管理員需要由可信新端SDK取得操作者身份後配置新白名單；不得把IDE登入用的另一種OpenID或舊AppID的OpenID直接複製成新管理員。
5. 瀏覽器可及性讀取及文字欄位可用，但點擊報coordinate input geometry is unavailable，原生截圖FrameArrived／capture timeout；沒有假造截圖。用戶已恢復窗口，仍不能完成三次模板點選，已請用戶操作。原隱私指引未代為提交或接受協議。
6. 開發者工具精確候選開窗成功，doctor靜態條件就緒；實際SDK啟動及限定項目關閉／重啟均在既有HTTP40880超時。保留原始啟動及恢復失敗日誌，未關閉其他用戶窗口，已請用戶保存後重啟開發者工具。不能把doctor或開窗當作頁面／SDK驗收。

後續先恢復SDK及取得模板ID，然後核對可信新管理員身份、配置新安全回調。共享雲代碼須按既有工具確認流程最小增量更新，再做新舊配置隔離、臨時資料建立／讀取／清理、新留言安全與審核、手機原生授權及通知實收。HTTP事件端與RPC寫入可分階段配置，完成平台回調驗證前RPC仍保持新寫入關閉；提醒則在新三模板與完整primary配置核實後才啟用。Git提交、維護分支整合、上傳與正式審核／發布仍需完成相應最後門禁，不以目前候選冒認已上線。

## 報告

主報告：`artifacts/miniprogram-review/new-app-enable-20261104/report.html`。repository passed，page及必要external blocked，總體blocked。沒有可信before或after截圖，頁面不判通過；本輪未上傳新測試包，不把既有0.1.0當成此候選。

同目錄保存完整門禁、task及整合審查、備份／增量manifest、配置就緒清單、SDK原始錯誤；不含秘密值。後續修改或平台確認應沿此記錄續做，不重派已完成的三項代碼任務。

## 11月4日晚至11月5日：開發者工具修復與連線恢復

使用者提供Electron預設歡迎頁後，實查原app.asar為0 bytes，快捷方式正確，但進程載入default_app.asar；不推斷何種操作清空了資源。使用者明確要求下載重新安裝。從官方下載頁目前的devtools-download元件讀取官方config，下載Windows x64 Nightly 2.02.2611052；191,757,192 bytes，SHA256 5247917BBF1B62D2FFC96775FD6741274AFE8B8B06197F5AEFE02B622FAEFA33，騰訊數位簽章Valid。

安裝已完成退出，原D目錄版本2.02.2611052，app.asar恢復237,285,224 bytes；實際進程載入app.asar，不再是default_app。相容檢查true，CLI登入有效、skill版本equal。安裝前29個保護文件的hash在安裝後全部一致；未由agent點擊同意任何協議。安裝包在Downloads；現場備份、簽章、hash及驗證在 `C:\Users\XB\.codex\backups\devtools-startup-20261104`。

精確候選已重新開窗。首次MCP currentPage仍超時，官方agent start之後回傳實際autoPort=9432；使用現有miniprogram-automator連線成功，實讀pages/home/index、SDK3.17.0、正確新AppID。真共享雲officer-custom/getMyOpenId及fleet-config/authenticate成功；可信新端身份僅存private文件，加入的是本機白名單草稿，沒有套用權限或配置。原生可及性樹亦讀到候選首頁的639航海士及各功能入口。

之後的保存場景major-event-by-type仍在導航階段automator response timeout；自動恢復第一輪GUI視窗匹配失敗，第二輪連線恢復，但該輪結果仍blocked，保留 `artifacts/miniprogram-review/2026-11-04T155858917Z-inph3x/report.html`。官方simulator_screenshot已能取得351×761捕獲，但當次內容為未完成頁面，不作通過證據；console只讀grep error無匹配，不等同沒有任何日誌或所有功能正常。沒有因修復安裝而銷除完整頁面、模板／回調、手機授權及實收缺口。

目前安裝故障及新端SDK／共享雲讀取已恢復；剩餘仍是新三模板ID／字段、回調與管理員最終配置、完整頁面／真雲驗收及Git／上傳／發布流程。用戶不需要為原0-byte資源故障再次重啟；後續查明導航時序或連線問題後再繼續該保存場景，不盲目反覆擴大恢復次數。

## 11月5日：新模板就緒、手動入口頁面證據及代碼部署確認

用戶提供四個模板ID及字段。後台核對發現原前兩個均為「會員活動提醒」，其中一項是推送時間；同次微信授權不能使用同標題的兩款。第三個重複複製thing1經後台及用戶確認為thing1/time3。用戶另添加「新活動提醒」後，採用以下三個真正不同標題的模板；未使用的同名模板保留，不刪除。

| 提前量 | 微信後台標題 | 模板ID                                      | 活動文字／開始時間字段 |
| ------ | ------------ | ------------------------------------------- | ---------------------- |
| 3小時  | 活动参与通知 | GtbccgeKrgWNvWshXxhalax33vJjgCEWfvMfrBrgIvc | thing1／time3          |
| 1小時  | 新活动提醒   | RjLgqfxHYs3IcpahvRYmCxrsUKUpP8bnTquVIOjuTpQ | thing10／time2         |
| 10分鐘 | 会员活动提醒 | eOdkB2K2A79Jau7ssSQGSh_IexCAgvwNo4mQGuHB5m4 | thing1／time4          |

本輪再次從同一後台開發管理頁實讀AppID=wxd0bc7afdc9cd334a，並在新增模板詳情讀到新活動提醒的ID與thing10/time2。以真實configFromEnvironment及resolveSharedConfig驗證完整primary與三模板通過，adUnitId空；記錄new-template-ready-20261105.json。本機草稿保持NEW_ENABLED=false，尚未套用雲端配置。

真實首頁卡片tap可進入大流行頁；tap返回後立即currentPage仍是首頁，後續已切換，不能把即時舊path誤記為導航失敗。已在真實入口目標頁保留原major-event-by-type全部22步（不改step、不調handler、不setData），4張實際截圖全部逐一查看，按流行／展開／詳情／返回日程皆正常。此補充證據採已存在頁面的入口核對，不做reLaunch，不宣稱正式launch-recorded；原預設導航阻塞仍保留。補充報告 `artifacts/miniprogram-review/new-app-existing-page-20261105/report.html` 總體blocked（必要正式入口／來源綁定未驗），步驟本身passed。只有本輪實際尺寸，其他尺寸、原生授權及實收未測。

四個線上包在部署前再次由CodeSha256／ZIP摘要核對，全與before備份相同。另建立incremental-code-only候選，僅23個純JS文件、無package.json/config.json/私有資料，與已審候選逐檔hash一致。四個原生增量部署請求已發起，file='.'代表該函數純代碼增量目錄；最後取得的狀態均pending。精確taskId在 `.superpowers/sdd/2026-11-04-new-app-enable/pending-code-deploy-20261105.json`。等待用戶在IDE確認後只查原taskId，不重發，不把success=true/pending當作執行成功；暫無終態部署成功證據。

四函數是共享資源方舊AppID下的major-event-reminder、worker、message-board、events，服務於新端兼容；沒有提交Git、更新環境／新角色／消息推送配置、上傳、審核或正式發布。代碼部署後先比較runtime／timeout／觸發器／環境／權限保持，再續模板、回調及角色配置與真雲測試。

## 11月5日：代碼部署完成，帳號配置待確認

用戶確認四項原生更新後，查詢原taskId，四項均為success／execution_success。重新下載四個完整線上ZIP，逐檔SHA256核對：變更數2／3／9／9，共23檔，與審核候選全部相同，沒有額外文件改動。四函數均Active，Runtime、Timeout、Memory、Handler、Environment、Role、Triggers、VPC、Layers、AccessInfo及依賴安裝設定均與部署前相同。證據見deployed-code-verification-20261105.json；完整ZIP及metadata只存private備份。

三個新提醒模板及獨立回調配置已備好合併請求，保留全部舊環境鍵。下一步擬先配置提醒雙函數與留言事件端，RPC新寫入待回調驗證後啟用。已將模板／回調及當前微信「黑落」的新端管理員授權範圍交用戶確認，尚未套用環境、授予角色或啟用平台推送。前端仍未提交／上傳／審核／發布。

## 11月5日：環境配置及真雲讀取通過，平台表單待提交

用戶已明確確認三新模板、獨立留言回調及微信「黑落」新端管理員配置。四函數環境增量已套用並重新讀取：全部舊變量及非環境執行設定保留，與批准請求精確一致，均Active。提醒雙函數新profile啟用；事件端新profile啟用；留言RPC新profile保持關閉，待平台回調保存成功再啟用。新管理員名單已配置，RPC新profile關閉期間尚未生效。

真實新端SDK回應getConfig及getBatchConfig皆enabled=true，模板數3、adUnitId空；留言getViewer成功。新舊HTTP回調簽名挑戰各200且echo完全一致，錯誤簽名各403。這些證據不等同手機授權及通知實收。環境及公開讀取記錄為environment-verification-20261105.json與live-config-public-20261105.json。

微信消息推送配置要求本人掃碼，用戶已完成。新URL、Token、AES已填好並逐值核對；工具的單選控件點擊報geometry unavailable、截圖timeout，已請用戶選安全模式及JSON並提交。尚無平台保存成功證據，沒有提前啟用新留言寫入。

## 11月5日：微信回調提交「系統繁忙」診斷

用戶提交後，頁面實讀「系統繁忙，請稍後嘗試！」。再次檢查三個字段與私有配置一致，AES顯示43/43；新舊HTTP正簽挑戰均200，錯簽403，新端提醒仍三模板啟用且無廣告位。新留言RPC保持停用。

透過現有CloudBase CLI新CLS日誌入口查詢（舊fn log入口已廢棄），函數近100條未發現執行錯誤；新回調精確路徑最近30分鐘網關僅4條node自測，尚未觀察到微信驗證請求。此為目前觀察，不能斷言微信平台故障或憑此修改憑證。已在原夸克窗口打開DevTools Network，請用戶再提交一次以取得實際回應碼，尚未重發部署、放寬安全模式或開放RPC寫入。

## 11月5日：新端回調保存成功及留言權限啟用

原AES密鑰含有斜線，不符表單列出的字母數字範圍。僅更新兩個留言函數的新端AES鍵，使用符合表單規格的43位值。用戶重新提交後確認保存成功，網關在14:22:24記錄非自測GET 200。依已批准範圍啟用新留言RPC，逐鍵回讀確認環境變量與請求一致。

新端真實SDK身份讀取確認read、write、review及isAdmin均為true，restricted為false。新舊簽名挑戰通過，錯簽均403。提醒真雲回應三模板啟用及廣告位空。手機通知實收與真實圖片安全事件仍待驗證。
