# 舊小程序提醒移除廣告計畫

使用者已確認流程：點擊提醒訂閱 → 一次微信模板授權 → 開通尚未錯過的3小時／1小時／10分鐘提醒。保持既有緊湊開關，不新增訂閱子頁。

## 邊界與介面

- 交接基線7611e508771a7b914adab7292614e5f5957d1369，舊 AppID wx8f961bcd8b26996a。固定入口E:\AI-UWO-old，實際工作區C:\Users\XB\.codex\worktrees\uwo-old-maintenance\AI UWO assistant，開發分支codex/phase-20261103-old-reminder-without-ad。原e5765d0候選經git apply --check後逐項遷入，不修改main或E:\AI-UWO-new。
- 新增 `activateAuthorized:{sessionId,requestId}`，回覆與 activate 相同的 `{subscription}`。getBatchConfig 與其他舊DTO不新增欄位，保留舊客戶端相容性。
- 新action只允許批次session、完整尚有效模板授權、本人／同場／同epoch／同fingerprint及未開始場次；不寫adCompleted，不補發，不重送sent／sending／unknown，不放寬20場上限與冪等。
- handler僅在服務端 `MAJOR_REMINDER_ALLOW_DIRECT=true` 且可信上下文為舊AppID直接呼叫時允許新action，拒絕共享來源。遷移中的新號提醒仍停用。
- 客戶端不預載／播放廣告，不呼叫completeAd。保留舊操作與收據的恢復能力，新操作以activateAuthorized處理；未知結果仍用原requestId查詢，不能自動重新授權或重送。
- 發送端以服務端新job的activationMode=authorization-only、activationEpoch及授權／模板／場次／代數驗證免廣告資格，不借用adCompleted。原廣告任務保持原規則，未知或已發送任務不可重送。
- 後續雲端修改必須從新版兼容實現準備，保留已部署的新號共享隔離；本輪只準備及驗證最小增量方案，不由舊分支整包覆蓋，也不執行部署。
- 最新交接明確不授權提交、推送、雲端部署、微信上傳或正式發布；先交付可驗證的舊號候選與相容更新方案，等待另行確認。

## 任務

- [x] 後端：紅綠測試新action、handler來源限制、授權不足／過期／取消重開／冪等／舊任務不變；另將worker實際取消新任務的P1重現為9紅後修復，含一次mock send與未知不重送。
- [x] 前端：紅綠測試無廣告授權開通、未完整授權不開通、重試恢復／取消、滿收據仍可免費操作；更新contracts與service嚴格白名單。
- [ ] 整合：完整verify、網路與生成契約；按既有HTML規範執行頁面驗收並記錄實際截圖／阻塞。
- [x] 部署準備：從新版兼容實現核對最小增量與雙端本機驗證；公開manifest位於artifacts/miniprogram-review/old-reminder-direct-final/compatible-candidate.json。worker先相容→business更新→開啟舊號開關，全部待用戶另行授權，不操作線上任務。
- [x] 客戶端：準備舊AppID候選，將本機、SDK、未部署與未發布狀態分別交付；只有另行明確授權後才上傳。

## 驗收案例

免廣告頁面fixture固定Date.now為2026-11-03 00:01（東八區），恢復時還原。此時首個奢侈事件尚有32760秒、首個日程事件尚有18000秒，均可訂閱3個時點；避免合法的已錯過時點導致測試誤報。所有授權及雲端寫入均為工具內存fixture，不能視作真機或真通知。

## 實際驗證

完整verify最終通過：239檔3379項主測試及13檔101項資料契約，網路／包體積／素材／發布manifest／只讀生成檢查通過，記錄在artifacts/miniprogram-review/old-reminder-direct-final/verify.log。早期fixture長度及保存場景數目失敗已保留verify-first.log並修復；免廣告fixture已獨立以免影響既有場景。

changed final與SDK場景均在fixture替換callFunction時被開發者工具阻塞，未宣稱頁面通過或產生虛構截圖。最終HTML彙總本機門禁與此環境缺口；原生微信授權、真發送、真機與正式版仍待授權後驗證。共用雲候選只準備在工作區外，未改新版來源、未提交或部署。

已閱讀Design Foundation與頁面HTML驗收規範；不新增依賴、不修改生成檔或新增網路例外。後端與前端依此固定action契約分工，以TDD實作，整合後再獨立審查。
