# 留言板 CloudBase：G0 探測準備

## 當前範圍

2026-10-06 後續批次依使用者指示改驗證私有集合暫存與圖片回調，參照 [本批調整](../superpowers/plans/2026-10-06-message-board-private-avatar-callback.md) 及 [實測記錄](../audits/2026-10-06-message-board-private-avatar-callback.md)。四個專用 probe 集合已建立並設 ADMINONLY；真 SDK 本人預覽精確 64 KiB PNG／64×64 解碼成功，五次客戶端直接讀寫均被權限拒絕。已部署專用 callback 與批次 HTTP 路由，並修正平台環境上下文／啟用 HTTP 透傳；簽名圖片 SHA、URL 校驗協議及合成加密事件落庫／去重均真雲通過。真正微信 API 受理與推送仍待後台配置後驗收。公共桶、全域 HTTP 認證及既有四業務函數未變更。以下舊獨立環境與儲存型探測描述保留作歷史設計，不能用來聲稱共享環境已有私有儲存區。

本輪處於 G0 探測階段，不是正式留言板業務實作。2026-10-06 已在使用者指定的現有付費環境新增專用 rpc 探測函數，完成單帳號開發者工具來源身分與合成文字 API 診斷，測試後停用。沒有修改小程序頁面、遊戲資料、現有 runtime 白名單或既有業務函數；沒有提交、推送或發布留言板。

執行根：`C:\Users\XB\.codex\worktrees\phase-58-message-board\AI UWO assistant`，分支 `codex/phase-58-message-board`，基線 main `9fb8dec43d6f8bbc3c7ab54ba36c3fb33241f8aa`。

目前 CloudBase CLI 3.7.0 在已登入帳號的只讀環境清單中，僅返回現有正式環境。2026-10-06 使用者選擇沿用該付費環境測試，取代購買或申領第二環境；依 [同環境測試調整](../superpowers/plans/2026-10-06-message-board-shared-environment.md) 只開放固化授權下的身分與合成文字動作。其餘探測仍拒絕該環境；三項 G0 真雲門檻尚未完整實測。

## 本地工具與產物

- `tools/message-board/probe-contract.ts`：核對可讀證據、原始檔案 SHA、候選、探測包 buildSha、AppID、環境、runId、trace 與同容器的身份對照。
- `tools/message-board/build-probe-package.ts`：生成三個自包含包，每包自帶 shared.js；僅描述既有 SDK 4.0.2 依賴，不安裝或部署。
- `tools/message-board/probe-sources/rpc.js`：每次重新取得平台身分，限定本小程序來源與測試操作者；提供身份、合成文字檢查、私有圖片、圖片檢查發起、預覽、準備公開副本與清理。
- `callback.js`：GET URL 驗證、安全模式 JSON POST 的 msg_signature 與 AES 解密、AppID／事件校驗、去重持久化早到事件。
- `worker.js`：只接受配置後的可信定時來源，原子匹配 trace 與事件；不接受 event 自稱 timer。
- `shared.js`：環境／角色與有界圖片校驗、加密協議、固定資料命名及脫敏回應。

生成命令在隔離根執行，輸出目錄必須是全新目錄：

```powershell
node --import tsx tools/message-board/build-probe-package.ts --output artifacts/message-board-probes/<新的批次目錄> --candidate <40字元候選SHA>
```

目前凍結的三包在 `artifacts/message-board-probes/9fb8dec43d6f-g0/`，manifest 記錄共同 buildSha 與各包 SHA。生成入口預設停用，不含秘密、不預填測試環境。JavaScript 語法與包重現性已本地驗證，部署 runtime 與平台接收格式仍待真雲驗證。

不得在輸出目錄手改程式；修改權威來源後產生新批次，保留原 manifest。原有輸出不覆寫；組包前拒絕 symlink／junction、來源缺失、不安全 require 與依賴版本漂移。

## 啟用前需要的條件

1. 使用者批准的獨立測試 CloudBase 環境及其 AppID 綁定，或依同環境測試調整固化當次授權；不把正式環境改名當測試環境。同環境第一批只允许 getIdentity／checkText。
2. SDK 與當前平台支援的 runtime、HTTP 存取入口、可信 timer 来源與 invoke 權限。
3. 不會覆寫既有微信消息推送的安全模式 JSON 接收路由；真實 wxa_media_check 必須能分流到測試接收端。
4. 兩個可自願參與測試的微信帳號，僅使用合成文字／圖片。
5. 批准後於測試雲安裝現有版本 SDK，啟用必要 openapi 權限及私有集合／素材 ACL。
6. 以獨立最小探測頁或已審閱的診斷流程檢查原生圖片展示，不用修改业务页面 state 偽造點擊或充當正式 UI 驗收。

上述部署或配置未獲授權時保持停用；本地測試不代替授權，也不自動创建計費資源。

## 秘密與配置名稱

下列值只在測試部署配置中設定，不要求使用者貼入聊天，不寫入 Git：

| 變量                               | 用途                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| MESSAGE_BOARD_PROBE_ENABLED        | 明確 true 才啟用                                                              |
| MESSAGE_BOARD_PROBE_TEST_ENV       | 本次獲授權的測試環境，須與平台 ENV 相同                                       |
| MESSAGE_BOARD_PROBE_APP_ID         | 綁定 AppID，拒絕跨帳號                                                        |
| MESSAGE_BOARD_PROBE_RUN_ID         | 同批三包使用相同 runId                                                        |
| MESSAGE_BOARD_PROBE_ACTOR_HASHES   | 允許執行寫入／檢查的測試操作者 fingerprint，逗號分隔                          |
| MESSAGE_BOARD_PROBE_CALLBACK_TOKEN | 微信接收端 Token                                                              |
| MESSAGE_BOARD_PROBE_AES_KEY        | 43 字元 EncodingAESKey                                                        |
| MESSAGE_BOARD_PROBE_TIMER_SOURCE   | 實測確認的可信定時來源；不能填普通小程序來源                                  |
| MESSAGE_BOARD_PROBE_IMAGE_KEY      | 私有 HTTP 檢查連結的服務端 HMAC 密鑰，64 字元小寫 hex；不下發客戶端           |
| MESSAGE_BOARD_PROBE_HTTP_URL       | 本批接收端 HTTPS 基礎 URL，路徑 `/message-board-g0/<runId>`，不含 query／hash |

candidateSha、buildSha 與已知正式環境值由組包器固化，不能靠部署環境變量改成另一版本。預設仍拒絕正式環境；同環境第一批另用組包參數 `--shared-environment <envId> --run-id <g0-shared-批次> --expires-at <ISO UTC>` 固化 `identity-text` 授權，限同環境／批次、24 小時內到期，只開放 getIdentity／checkText。普通 payload 和環境變量不能提供或延長該授權。

getIdentity 只回傳 hash 與最少來源資訊，不回完整 OpenID、IP 或整份 SDK context。先取得本次指紋，再由授權部署者配置操作者清單。

私有集合與 HTTP 回調批次使用 `--scope private-avatar-callback`，例如在隔離根執行 `node --import tsx tools/message-board/build-probe-package.ts --output artifacts/message-board-probes/<新的批次目錄> --candidate <40字元候選SHA> --shared-environment <已授權環境> --run-id <g0-shared-批次> --expires-at <24小時內ISO-UTC> --scope private-avatar-callback`。生成仍預設停用，沒有自動部署／建集合／改路由；HTTP 入口還必須配置本批專用路由透傳與上述兩個服務端變量。

三包的 SDK 初始化仍不代表安全或身份門檻通過：必須在本次 invocation 比較 SOURCE、APPID、ENV，並做實例复用對照。tcb fn invoke 不是微信使用者身分證據。

同環境第一批已由實際 SDK 觀察到 `wx_devtools`，僅對已固化且未過期的共享測試授權接受此直接來源；保留 `wx_client` 真機來源。轉呼叫字串、HTTP、timer 和未知來源不放行。拒絕來源時的 getIdentity 診斷只回有界 source／AppID 與身分存在布林值，不回完整 OpenID 或 SDK 上下文。

## 專用測試資料與權限

集合均禁止小程序客戶端直接讀寫：

- message_board_probe_assets：有限圖片 metadata、ownerHash、公／私檔案參照。
- message_board_probe_traces：本次 API trace 與 asset／candidate／run 關係。
- message_board_probe_events：已驗證事件、matched 與本次身份。
- message_board_probe_results：已匹配結果與素材歸屬。

私有與公開前綴分別為 `message-board-probes/private/<runId>/` 與 `message-board-probes/public/<runId>/`。獨立測試環境 storage 只允許客戶端讀公開前綴，其他讀取／所有客戶端寫入拒絕；服務端仍按素材歸屬校驗。配置不得覆寫其他模組規則。現有付費環境 storage 為 ADMINWRITE（所有人可讀、管理員寫），第一批共享授權禁止全部圖片動作，不能靠這兩個目錄名稱假設私有；私有頭像規則未實測前保持 not-run。

RPC 寫入只允許操作者清單；makePublicAvatar 要有同 run、candidate、asset、trace 且 provider pass 的已匹配結果。預覽限同一作者，清理只處理本人本次資產，不接受任意 fileID 或外部 URL。

probe image 校驗只確認 64 KiB、256px 及 PNG／JPEG 傳輸簽名，不是完整解碼或內容安全證明。私有 URL 的實際有效期、原生 fileID 讀取及客戶端 ACL 要在真雲證明；服務端能讀到檔案不代表客戶端權限正確。

## 真雲操作順序與證據

1. 三包部署後先保持 disabled，建立專用私有集合／規則，核對 namespace、callback 路由、SDK／runtime 与 buildSha。
2. 配置測試 ENV／AppID／runId；明確启用。透過真實微信來源 getIdentity，由 A／B 兩使用者取得 fingerprint，再配置允許寫入。
3. A stageAvatar 使用合成小圖；A preview 可讀，B preview 必須 not-found。另用客戶端直接試私有 fileID 讀取失敗，不能只測 RPC 拒絕。
4. checkText、submitImage；後者 URL 僅供服務端呼叫，不輸出或寫普通日誌。記錄 provider 接收 trace、近期訪問要求及實際 private URL 有效期。
5. 配置 URL challenge 與真實安全模式消息推送，驗證 wrong signature／wrong AppID 被拒，真實事件先落庫後回 success；手工加密的事件只能算本地／協議測試。
6. 真實 timer worker 匹配早到與重複事件；普通小程序呼叫 timer 偽裝仍拒絕。makePublicAvatar 完成同素材準備，真機原生 image 能顯示且 hash 一致。
7. A removeAsset 清理本次公／私副本，重試／失敗與資料庫故障可追蹤；失敗留下的孤立路徑需由授權操作者按本次 runId 核對清理，不能遞迴刪除其他前綴。
8. A／B 的同 instanceId 身份對照、HTTP／跨 AppID拒絕證據完整後，才可review G0是否通過。若 API gateway envelope、SDK錯誤碼或來源不符合探測適配器，記真實差異并修正，不能猜測放行。

callback HTTP 回應 503 表示落庫失敗，不能當成功。探測 worker 只演示原子去重匹配，不代表正式業務的完整租約／重試／清除流程，後續按 B 計畫實作。

## 證據檔案格式與判定界限

每個檢查有 schemaVersion=1、gate、check、candidateSha、buildSha、environmentId、appId、runId、source、outcome、performedAt、artifact.path／sha256 及 details。artifact 必須在 evidenceRoot 內且非 symlink／junction。safety 的發起／回調／落庫 trace 一致；identity 的 A、B 与 warm-instance 要是同一 instanceId 且不同 actorHash。

source 必須如實記為 live-cloud、device-ios／device-android 或 local-fixture。本地 fixture 即使全字段齐備也不能代替平台實測。classifyProbe 的 verification 固定為 evidence-consistency；其 passed 只代表提交的證據資料完整一致，工具不能驗證人工填寫的來源是真實平台，也不能單憑這個值批准 G0。正式結論需结合原始 SDK／微信推送／真機見證 review。

目前 report.json 的三門檻均 not-run，没有填寫模擬通過。保留 [G0 本輪執行記錄](../audits/2026-10-05-message-board-g0.md) 与主計畫 ledger，完成真雲後另追加實際日期／結果，不覆蓋歷史。

2026-10-06 的局部真雲結果見 [現有付費環境測試記錄](../audits/2026-10-06-message-board-shared-environment.md)。合成文字 API 曾返回 `-604101`；用微信官方 CLI 部署單一 rpc 包並應用其 `security.msgSecCheck` 權限後，實際調用返回 pass。CloudBase CLI 部署成功不代表微信側雲调用權限已生效。共享文字失敗診斷只保留數字錯誤碼／受控類別／權限提示布林值，不回 SDK 原文、URL 或權杖。

後續 transport-only 批次已實際通過 64 KiB SDK／雲端往返及原生 PNG 解碼，僅允許 getIdentity／echoImage。私有存儲候選實测遇到目錄規則拒絕及單文件規則下舊公開素材 HTTP 403，已清理／恢復／停用；不能直接沿公共桶的全局規則實現私有頭像。詳見 [自動化結果與邊界](../audits/2026-10-06-message-board-automated-avatar.md)。原 scope identity-text 的結果保留為歷史批次，G0 整體仍未通過。
