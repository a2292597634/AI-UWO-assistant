# 新小程序遷移核對表

日期：2026-11-02 至 2026-11-03。最新狀態：新小程序開發測試版 `0.1.0` 已上傳並於後台核對；新帳號獨立使用，舊私人資料保留原小程序。雲端適配及首次保存修復已部署，真雲保存／讀取／刪除與舊配置讀取對照均通過。未提交審核或正式發布；新提醒與留言發布保持停用，真機及完整頁面驗收仍有缺口。

本文件保留先前失敗、阻塞與修復過程；目前結果以末節及主 HTML 報告為準。

## 已確認

- 用戶要求保留現有雲端資料。
- 舊 AppID：`wx8f961bcd8b26996a`；新 AppID：`wxd0bc7afdc9cd334a`。
- 用戶表示兩個帳號使用本人相同身分證註冊、郵箱不同；共享已建立且新帳號真雲呼叫已成功。
- 現有程式雲環境：`cloud1-d7gxfuxfe813b4eaa`。
- 基線：`e5765d09cf7bfde2aad1064dacc4770b26e48471`；tracked 與 untracked 均乾淨，存在既有 ignored 私人配置、素材及歷史證據，未覆寫。
- 遷移分支：`codex/phase-20261102-miniprogram-migration`。遠端預設分支經 ls-remote 確認為 main，本機 origin/HEAD 的舊指向不能作為依據。

## 建議路線及替代方案

優先驗證同主體環境共享，保留舊環境和既有資料，在新 AppID 的候選程式完成驗證後再安排切換。環境共享只提供資源訪問能力，不能視為使用者資料歸屬與微信能力自動遷移成功。

若共享不可用，評估新環境的資料匯出／匯入、雲函數部署、權限與素材引用遷移；新建付費資源前需核對具體方案。不採用直接替換 AppID 後宣稱遷移完成的做法。

## 實際程式的阻塞點

| 項目         | 已核對的來源                                                         | 待完成工作                                                                                                                         |
| ------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 前端初始化   | miniprogram/app.ts、runtime/cloudbase-config.ts                      | 現在只初始化固定 env；共享客戶端需另行設計與驗證，不能假設換 AppID 即可使用                                                        |
| 網路邊界     | tools/quality/check-runtime-network.ts                               | 現有精確白名單只涵蓋既有 API；如需新的 Cloud API，先列明檔案、API、用途並取得授權                                                  |
| 艦隊私人配置 | cloudfunctions/fleet-config/index.js                                 | 依平台 OPENID 取 ownerUid；須驗證新舊身分對應及資料存取，不能憑客戶端宣告舊身份                                                    |
| 投稿與管理員 | cloudfunctions/officer-custom/index.js、officer-maintenance/index.js | OPENID 與管理員名單須按新呼叫來源實測                                                                                              |
| 留言板       | cloudfunctions/message-board/entry.js、core/assembly.js              | 精確檢查 APPID、ENV 並拒絕 FROM_APPID，ownerKey 綁 APPID 與 OPENID；直接共享會遇到既有來源限制，須有明確相容方案，不能移除安全檢查 |
| 安全回調     | message-board-events 與留言板服務配置                                | 新 AppID 的回調、內容安全與身份規則需核對，維持舊資料及回調可用                                                                    |
| 提醒服務     | docs/architecture/major-event-reminder-cloudbase.md                  | 模板、廣告位、微信 Timer 身分及收件身份均需重新核對；不改綁或重送舊待發任務                                                        |
| 素材         | data/assets/cloudbase-manifest.json                                  | 保留現有來源，實測新 AppID 下的 CDN 與雲存儲訪問；不手改 generated                                                                 |

## 下一個操作

在舊小程序的微信開發者工具中打開「雲開發」，找到「環境共享」（依版本可能位於設定或更多選單），核對所選環境為 `cloud1-d7gxfuxfe813b4eaa`，查看能否將資源共享給 `wxd0bc7afdc9cd334a`。若出現收費、銷毀、解綁或更換環境的選項，不執行，先記錄實際提示。

本輪電腦操作的畫面擷取出現 FrameArrived timed out；文字樹只有窗格，沒有可操作的雲開發按鈕，因此尚未執行共享授權。

## 驗收與保護

- 程式、雲配置、資料庫、部署及公開發布：均未變更。
- 資料已保留：目前僅指沒有改動或刪除；尚未證明新帳號可使用舊私人資料。
- 後續涉及身份邏輯先紅綠測試；涉及共享運行時先讀頁面驗收規範並交付 HTML 報告。
- 提交前依 AGENTS 展示範圍、驗證與 message，取得確認；本機、模擬器、真機、真雲及 exact-SHA CI 分開記錄。

官方參考：https://docs.cloudbase.net/faq/account （同主體環境共享）。

## 2026-11-02 控制台截圖補充

- 用戶提供的共享列表已顯示新 AppID 及正確環境，證明共享關聯已出現在控制台；未代表新程式已調用成功。
- 「配置環境」內的 49 項下拉清單包含「運營分析／用戶訪問／資源使用／監控圖表」及「資料庫／添加集合／查看集合」，屬可操作權限清單，並非 49 個業務資源。先前稱為資源列表的說法已向用戶更正。
- 尚無官方證據證明本項遷移需要全選管理權限，不指引用戶增加或清空這些權限。可取消本次配置編輯，保留已顯示的共享關聯，再以新 AppID 的最小呼叫驗證實際能力。

### 待確認的最小程式設計

保留現有環境與舊程式服務，先做新 AppID 的共享連線候選。以 `miniprogram/runtime/shared-cloud-client.ts` 封裝 `new wx.cloud.Cloud`、實例 `init`、`callFunction` 與 `uploadFile`；資源方只固定為舊 AppID 與既有環境。業務呼叫限既有已登記函數，檔案上傳限既有錯誤回報流程，不增加任意雲函數、資料庫直連或 HTTP 能力。既有 service 保持型別介面與輸入校驗。

這會新增 AGENTS 尚未授權的 Cloud 建構 API 與檔案位置，必須先向用戶說明並取得授權；屆時同步精確掃描器及契約測試。仍須解決留言板對共享來源的既有拒絕規則；本階段不能放寬來源校驗，也不能宣稱所有功能已遷移。

目前僅提案，尚未獲批、編碼或部署。確認後先完成連線／身份只讀驗證，再依實際平台上下文設計私人資料歸屬；不猜測 OPENID 對應、不重綁舊提醒任務。

## 候選實作與實測（2026-11-02）

用戶已明確批准共享連線網路例外並要求代為操作。已新增共享客戶端、接入七個現有 runtime service、切換 project.config.json 到新 AppID，更新 AGENTS、精確掃描器與測試。原生初始化順序經獨立審查發現後已按紅綠循環修復。尚未提交、推送、上傳發布或部署雲函數。

新 AppID 的開發者工具實測：平台帳號資訊為 `wxd0bc7afdc9cd334a`，Cloud 建構器存在，shared.init 成功；舊環境 `major-event-reminder/getBatchConfig` 回傳 ok=true、enabled=true、三個模板。這只證明舊配置可以讀取，不代表新 AppID 的模板、廣告位或通知發送可用。

同一次只讀驗證 `fleet-config/authenticate` 回傳 ok=true 但 authenticated=false。現有服務端只認 OPENID，尚未支援共享來源身份；不能宣稱私人資料遷移成功，也不能以任意 FROM_OPENID fallback 放寬來源校驗。coupon-redemption 的既有 fallback 會把無 OPENID 來源放進同一 anonymous 限流桶，同列後續身份整合項。

用戶補充：舊小程序已有其他使用者。因此舊資料不能全部改綁到新管理員，也不能將新舊 AppID 下的 OpenID 直接當作同一帳號。

### 建議的下一階段身份方案（待確認，未實作）

1. 舊 AppID 仍服務舊用戶，保持舊 ownerUid、留言 ownerKey 及管理員權限規則。
2. 新 AppID 的服務端身份只接受平台提供、來源精確匹配新 AppID／既有資源方／既有環境的上下文；新用戶採 AppID 隔離的 owner，不使用未驗證的舊 owner。
3. 舊用戶在舊小程序登入後取得一次性遷移碼，再在新小程序登入後確認綁定。遷移碼採高熵隨機值，只保存雜湊，短時效且只能消耗一次；以原子交易建立新舊身份的一對一關聯。不得由客戶端提交任意舊 OpenID 代替驗證。
4. 已驗證綁定後才可取得原私人配置、投稿／留言管理能力。具體 owner 映射、跨帳號內容安全、管理員角色、重複綁定與撤回流程需先完成設計及可點擊 demo，再實作部署。綁定能力不等於訂閱權限轉移。
5. 新帳號的訂閱消息模板、流量主廣告位、內容安全 API／回調、微信 Timer 的發送身分仍須各自核對。舊待發任務維持原 AppID 與模板，不改綁、不補發；新提醒需由新 AppID 下的用戶重新授權。

### 當前驗證證據

- `artifacts/miniprogram-review/migration-20261102/shared-readonly-probe.log`：上述真雲只讀結果，未輸出 OpenID 或憑證。
- `artifacts/miniprogram-review/2026-11-02T080137676Z-u3hihf/report.html`：新 AppID 的目錄搜尋／詳情保存場景通過，三張實際截圖；不是身份或真機驗收。
- `artifacts/miniprogram-review/2026-11-02T075715702Z-j9wwll/report.html`：changed final 因共享程式沒有完整匹配場景而阻塞，保留原始結果。
- 原工作區 verify 在 lint 因既有 ignored `artifacts/miniprogram-review/major-event-by-type-protection/final-review.ts` 的未用 import 失敗；不修改該歷史文件。獨立候選驗證位置為 `E:/AI-UWO-verification/migration-20261102-connection`，結果另記錄。
- 既有離線 fixture 只攔原生 wx.cloud；新增共享 AppID 安全阻斷，未適配的 fixture 場景不得導航或呼叫真兌換／投稿。

## 最新執行決策（優先於前述歷史方案）

用戶已拒絕遷移碼，也未採用跳轉驗證方案；最終明確選擇：**新帳號獨立使用，舊私人資料留在舊小程序**。本輪不再實作任何新舊身份綁定、資料改 owner 或遷移碼 UI。

已在用戶登入的微信公眾平台「設定／關聯設定」實際讀取：新 AppID 的微信開放平台帳號為「未綁定」。同次基本設定顯示小程序備案與微信認證均在審核中、UGC 場景未聲明，另顯示被搜尋功能受限；不推測原因，不修改這些帳號設定，不把開發版運行當作公開發版。

服務端候選新增精確共享身份解析：只接受既有資源方 AppID、環境、新 FROM_APPID 以及直接微信來源；新 owner 採新 AppID 前綴，舊 owner 維持原值。六個獨立部署包各自包含本地身份模組，不引用包外路徑。新留言板僅開放公開列表、公開內容再驗證及本人讀取，未設定安全回調前不開放新發佈或管理權限；新提醒返回停用配置，不沿用舊模板／廣告，不建立新待發任務。舊提醒 worker、待發佇列、舊留言內容安全回調均不修改。

新連線加入後主包工程預算超限；將僅由兌換分包使用的兌換服務放回該分包，並精簡連線封裝，恢復包大小檢查通過：含32KiB預留估算 1,992,288 bytes（不是 DevTools 真包）。主包工程預算餘量很少，後續功能仍需另作包體檢查。所有 UI 樣式、master、generated 與依賴均未改動。

## 線上保護與部署候選

- 六個線上函數均已經官方 CLI 成功下載備份：`E:/AI-UWO-verification/migration-backups-20261102/`。
- 增量候選：`E:/AI-UWO-verification/migration-incremental-20261102/`。每個函數僅計畫增加身份模組、更新入口（留言板使用包內 shared/core 路徑）；不部署 message-board-events 或提醒 worker。
- fleet／officer-custom／officer-maintenance 線上入口與目前 Git 基線有資料庫初始化方式差異。增量候選基於實際線上入口套入本輪身份變更，保留線上初始化方式，不夾帶基線中尚未部署的其他改動。因此部署證據以候選 manifest 的檔案 SHA-256 為準，不能宣稱整個倉庫 SHA 已部署。
- manifest：`artifacts/miniprogram-review/migration-20261102/incremental-manifest.json`；部署前狀態：`cloud-functions-before.json`。六包相對 require 邊界均已檢查通過。
- 首次請求增量上傳 fleet-config 的 wechat-identity.js 時，工具返回 `status=pending`、`Waiting for user confirmation.`。這只表示產生了部署確認請求；尚無完成證據。其餘函數部署尚未發起。
- 待確認請求 ID：`confirmation_cloud_fn_inc_deploy_a0123b33-ce36-4a3c-ad76-32d7607a870c`。

## 驗證補充與歷史失敗

- 共享身份48項測試、新帳號平台能力停用入口2項測試已觀察紅燈後轉綠；審查補齊公開內容的 revalidatePublic 只讀刷新。
- 舊 AppID 初始化順序、SDK 缺失時同步錯誤處理及共享 API 鏈式／解構繞過均有實際失敗與修復證據。
- 原工作區完整 verify 的歷史腳本 lint 失敗保留，不修復無關檔案。
- 隔離全量回歸曾通過 3,391 項、僅全量 AST 網路邊界掃描超過 Vitest 預設5秒。已限制共享實例額外遍歷只在精確入口執行，並把這一個全量掃描測試的執行預算明確設為15秒，所有斷言與掃描規則保留，未改 RPC 等待。最新完整門禁結果以 `isolated-verified-candidate.log` 為準，不能把歷史 timeout 改記成功。

## 本輪交付狀態

- 最終獨立候選 `npm run verify` 退出 **0**：240 個測試文件／3,392 項測試，資料契約另 13 文件／101 項；format、lint、typecheck、runtime-network、主包估算、素材、manifest、data:check、generate:check 均通過。日誌：`artifacts/miniprogram-review/migration-20261102/isolated-verified-candidate.log`。
- 最新真 DevTools 的目錄搜尋／詳情場景通過，三張 after 截圖均已讀取；原始報告：`artifacts/miniprogram-review/2026-11-02T085257524Z-yqmust/report.html`。不代表其他頁面、真機或真雲身份隔離已通過。
- 最新 changed final 報告仍因共享入口與部分 runtime 缺完整保存場景覆蓋而 blocked：`artifacts/miniprogram-review/2026-11-02T085254713Z-jf3gmv/report.html`。沒有刪除覆蓋要求來使其通過。
- 主報告：`artifacts/miniprogram-review/migration-20261102/report.html`，內嵌三張最新截圖，repository=passed、page=blocked、external 部署／平台能力為 blocked 或 not-run。沒有可信 before，不冒充比較圖。
- 部署確認卡片讀取回報 `agent compile mode is disabled`。已成功啟動官方 agent automation server（實際端口9420，DevTools 2.02.2610302），但卡片仍回同一錯誤。未代替用戶點擊批准，也未改用另一部署通道跳過此確認。
- 待用戶處理工具中的確認界面後，先確認首個身份模組是否上傳完成，再分別上傳其他模組與入口；部署後必須用新、舊 AppID 分別驗證身分與本人列表，核對其他使用者資料不被新帳號取得。新提醒及留言發布仍需獨立平台配置，不在本輪宣稱已可用。
- 本輪沒有 commit、merge、push、公開發布或雲端資料改綁。舊函數與部署回滾來源均保留；本地遷移分支仍為未提交候選。

## 2026-11-02 使用者要求自行查看窗口後的更正

已自行恢復並讀取開發者工具窗口，確認目前為「小程序模式／普通編譯」，介面沒有顯示部署確認卡片。完整窗口截圖三次（包括重新定位及置前後）均回報 `window capture timed out: timed out waiting on channel`；模式入口的點擊回報 `coordinate input geometry is unavailable`，不能假稱已取得窗口截圖或點擊成功。鍵盤嘗試也未打開模式選單。

另經官方 `polling_task_result` 查詢，先前首個請求 `confirmation_cloud_fn_inc_deploy_a0123b33-ce36-4a3c-ad76-32d7607a870c` **已於前階段完成**，結果 `status=success`、`detail=execution_success`、fleet-config／filesCount=1。先前未查詢最終任務狀態而一直稱其待確認，已向用戶明確更正。這一步只增加身份模組，沒有改入口。

本次另外發起五個身份模組及已具備模組的 fleet-config 入口更新，最新查詢六個請求均為 pending：`artifacts/miniprogram-review/migration-20261102/pending-deploy-results-latest.json`。其餘函數入口未發起，避免模組未上傳就先換入口造成服務失敗。

已建立獨立、唯讀的舊 AppID 探測專案 `E:/AI-UWO-verification/migration-old-app-probe`，真雲原生身分 authenticated=true，當前使用者戰鬥配置2筆、冒險配置3筆仍可讀；僅記錄數量，不輸出配置內容。這是入口切換前對照，不是部署後回歸，證據 `old-native-before-entries.log`。

## 模式選單核對後的進展與更正

用戶提供的模式選單只有「小程序模式／插件模式／多端應用模式」，沒有 AI 模式。先前把 Agent 卡片錯誤解讀成要從這個模式選單切換，是操作判斷錯誤，已向用戶更正；保持小程序模式即可。

已讀取開發者工具隨附官方 `wechatide-skill` v0.3.15、cloudbase-operator 及異步確認規範。門禁結果：已登入、版本 equal、CLI 不要求 token；未查看或記錄登入使用者資料及令牌。規範要求雲寫 pending 在開發者工具內確認、保留 pendingTask，不主動輪詢或重發；恢復時先查舊 taskId。

本輪恢復時查舊任務：五個其餘身份模組及 fleet-config 的 index.js 均已 success。至此六個身份模組與艦隊入口已完成增量部署。

**艦隊真雲對照通過（當前同一測試使用者，非所有使用者全量驗證）：**

- 新 AppID：authenticated=true；戰鬥配置0筆、冒險配置0筆。
- 舊 AppID：authenticated=true；戰鬥配置2筆、冒險配置3筆，與入口切換前讀取數量相同。
- 只讀驗證，沒有建立、改綁、刪除或匯出私人配置內容。
- 證據：`new-fleet-after-entry.log`、`old-fleet-after-entry.log`。

已核對 coupon／留言板／提醒增量入口與通過測試的本地來源一致，隨後提交剩餘五個函數入口更新，均 pending。紀錄：`artifacts/miniprogram-review/migration-20261102/remaining-entry-deploy-requests.json`。其他入口不再重發，待使用者在工具內確認，返回後先查各 taskId，再進行服務端回歸。

這次五個請求後，Windows 確實出現五個開發者工具無標題新窗口；兩個窗口的可讀介面不可用、窗口截圖仍超時。沒有把模式選單當作確認入口，也沒有代替用戶批准或更改安全設定。

### 移交

- nextScene：cloudbase-operator → debugger／automator。
- project：`E:/AI UWO assistant`；舊帳號唯讀探測根：`E:/AI-UWO-verification/migration-old-app-probe`。
- confirmed：登入有效、skill equal、原六個身份模組與艦隊入口已部署、當前用戶新舊艦隊讀取隔離通過。
- pendingTask：剩餘五個入口，見 `remaining-entry-deploy-requests.json`；最後狀態 pending。不得重發、不得將 pending 當成功。
- blocker：需在開發者工具完成這五項更新確認；提醒、廣告和留言發布仍需新帳號平台能力配置。

## 使用者確認後：六個入口均部署完成

已先查詢原 taskId，剩餘五個入口全部 `success / execution_success`，沒有重發部署。結果：`remaining-entry-deploy-results.json`。六個函數在部署後均 Active，runtime 與 timeout 對照部署前完全相同（drift=0）；未更新其他雲函數或依賴。

### 真雲驗證範圍

- 艦隊：新0／0、舊2／3持續可讀。另將當前舊帳號一個實際配置 ID 只透過臨時參數檔送給新帳號的 loadConfig，回傳 not-found、returnedPrivateData=false。未在日誌或報告輸出配置 ID／內容。
- 新投稿 listMine、錯誤回報 listMyReports 都成功且為0筆。
- 新留言板 getViewer／本人列表／公開列表／revalidatePublic 均成功，本人0筆、公開1筆。新角色 isAdmin/write/review 全 false，createMessage 在進入寫入前回 feature-disabled。
- 舊留言板仍 isAdmin/read/write/review 全 true。該 getViewer 會維護正常訪問中介資料；本輪未修改留言內容、私人配置或資料歸屬。
- 新提醒配置 enabled=false、templates=0、無廣告位，prepareBatch 回 disabled，不新增待發任務。舊提醒仍 enabled=true／三模板。
- 兌換只對缺參數請求驗證 server-invalid，沒有執行真兌換。
- 證據：new-services-after-deploy.log、old-services-after-deploy.log、new-cannot-load-old-config.log、cloud-functions-after.log。

### 頁面與版本

新留言板公開列表及返回首頁場景通過（2026-11-02T153332704Z-j7m7l4，2張實際截圖），新兌換碼表單場景通過（2026-11-02T153413846Z-7utm4n，1張實際截圖），已閱讀全部截圖。加上先前目錄／詳情共3個保存場景、6張實際 after；完整共享覆蓋與真機仍未驗收。

主報告已更新，部署項與已覆蓋隔離項 passed；整體仍 blocked，因完整頁面覆蓋、新提醒與新留言發布的平台能力、測試版本上傳／真機尚有缺口。

已準備供測試版本 `0.1.0`，說明「新帳號獨立使用；舊私人資料保留原小程序；提醒與留言發布暫停用」。依官方 previewer 規範，upload 只在用戶明確要求時呼叫；已向用戶發出是否上傳測試版本的單一確認，尚未呼叫 upload，亦未提交審核或公開發布。不得把雲函數部署成功當作新小程序版本已上傳。

最新程式候選與完整通過門禁的獨立副本逐檔 hash 一致（codeMismatches=0），主報告圖片無缺失，git diff --check 通過。只更新本輪文檔，不新增 commit／push。

## 2026-11-03：測試版本上傳、首次保存修復與重測

用戶明確選擇「上傳測試版本」後，已以新 AppID 工程上傳 `0.1.0`。工具 success=true，真包主包1,959,455 bytes，總包5,795,186 bytes；版本管理可讀介面已核對到新帳號的「開發版本 0.1.0」，上傳時間2026-11-02 23:41:57，說明與本輪一致，沒有審核版本或線上版本。這是開發測試版本，未提交審核／正式發布。證據：`upload-0.1.0-request.json`、`upload-version-ui-confirmation.json`。

### 新帳號首次保存的實際失敗與必要修復

上傳後再做新帳號臨時配置的真雲建立／讀取／清理回歸，createConfig 返回 network，列表仍0筆，沒有留下臨時配置。不能只因讀列表成功就稱寫入也成功，該失敗保留於 `new-config-roundtrip.log`。

定位到既有線上三入口使用 wx-server-sdk 4.0.2 預設 `cloud.database()`：普通與交易 doc.get 缺文件均拋錯，首次建立新 owner 鎖時失敗。原倉庫基線已有 `throwOnNotFound:false`，但本輪最初為保護線上差異而保留了舊初始化，實際首次保存驗證證明此差異正是遷移必須處理的阻塞，不能繼續保留。

已直接在實際部署候選上重現4條首次文件建立路徑全失敗，再只將 fleet-config、officer-custom、officer-maintenance 的資料庫初始化改為 `cloud.database({ throwOnNotFound:false })`。不吞掉其他資料庫錯誤，不改權限、身份規則、記錄結構或依賴；每份第一版入口另備份於 `E:/AI-UWO-verification/migration-r1-entry-backups-20261102/`。

候選復現由4失敗轉為4通過；既有首次文件／身份／艦隊相關6個測試文件143項均通過。證據：`firstdoc-artifact-red.log`、`firstdoc-artifact-green.log`；候選manifest為 `firstdoc-incremental-manifest.json`。根倉庫程式原本已有這個初始化配置，沒有為此另改本地業務程式。

用戶已在開發者工具確認三項必要修復。先查原taskId，三個入口均success／execution_success，未重發；證據 `firstdoc-deploy-results.json`。

### 真雲寫入已重測成功

新帳號臨時配置 create=true、load=true（完整7艘船）、delete=true；baselineCount=0、finalCount=0、cleanupConfirmed=true。僅操作本輪自己建立的臨時配置，沒有改動舊帳號私人配置；正常的新帳號初始化鎖中介資料保留，供後續正常保存使用。證據 `new-config-roundtrip-after-fix.log`。

### 最終舊帳號探測的工具層歷史阻塞

舊帳號重新開啟只讀探測窗口時，首次報 Cloud API 尚未初始化；顯式初始化後的第二次報 automator response timeout。兩次均保留原始日誌，不視作舊業務已驗收。正在用官方 agent start 為探測專案建立獨立端口並先讀運行時，最後結果另記錄；之前讀取2筆戰鬥／3筆冒險及新帳號無法取得舊ID的成功證據仍保留其原時間與範圍。

沒有重新上傳前端0.1.0，因為本次修復只在雲函數初始化；沒有改master、generated、依賴、舊提醒worker或舊回調。沒有commit／merge／push。

## 最終對照與交付（2026-11-03）

舊帳號的獨立 SDK 探測連線已恢復：官方 agent start 回傳實際9421端口；工具的 runtime-info 超時仍保留，但隨後業務探測及直接 miniprogram-automator SDK 都實測舊 AppID authenticated=true、戰鬥2筆／冒險3筆，與修復前相同。證據：`old-configs-final-sdk-probe.log`、`old-configs-final-direct-sdk.log`。沒有把工具初始化失敗或協議超時混成業務通過，成功對照採最後實際結果。

最終完成範圍：新 AppID 共享連線、獨立用戶資料歸屬、六個函數相容部署、三個入口首次文件建立修正、新小程序開發版本0.1.0上傳、後台版本核對、當前測試使用者的新舊讀取隔離及新配置CRUD回歸。所有部署任務均已有success，無待確認部署。

未完成／未宣稱通過：新帳號提醒模板與廣告、新留言發布及回調、新管理員權限、全部共享頁面保存場景覆蓋、iOS／Android真機、真兌換、正式審核／發布、exact-SHA遠端CI。新帳號未自動繼承舊管理員權限，仍可從舊小程序維護原資料；本輪沒有調整管理員白名單。

0.1.0上傳成功的真包主包1,959,455 bytes、總包5,795,186 bytes；後台顯示「開發版本」，沒有審核版本與線上版本。首次保存修復只改雲函數，沒有重新上傳前端、沒有新增依賴、沒有更改原資料／舊待發通知。臨時新配置已刪除，僅正常的新owner初始化中介資料保留。

完整門禁通過證據仍為獨立候選240檔／3392測試＋資料契約13檔／101測試；首次建檔部署候選另有4條紅綠復現與相關143項通過。原工作區歷史腳本的lint失敗及早期生成／工具阻塞記錄均保留。本地程式碼與門禁副本未產生新增差異，只有本輪記錄持續更新。

本地變更仍在 `codex/phase-20261102-miniprogram-migration` 未提交；沒有commit、合併或push。後續如需提交，仍須按AGENTS展示文件、門禁與message並取得當次確認。新小程序可在「管理／版本管理／開發版本」查看0.1.0，這不等於已設定正式體驗版或已發布。
