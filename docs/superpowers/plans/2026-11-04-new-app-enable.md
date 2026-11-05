# 新端既有功能啟用實施計畫

> 執行方式：使用 subagent-driven-development 分工獨立任務，主代理整合及處理平台配置；未獲當次確認不提交Git。

**目標：** 新端不使用廣告，恢復既有提醒、留言及管理功能，保留新舊私人隔離和舊端業務。

**架構：** 固定兩AppID的服務端profile；共享函數按可信身份路由API與回調；新端前端移植既有免廣告授權流程。平台配置不完整時只停用對應新能力。

**工具：** Node >=22 <23、npm >=10、TypeScript、Vitest、wx-server-sdk 4.0.2；不改依賴。

## 全局約束

- 設計規格：docs/superpowers/specs/2026-11-04-new-app-enable-design.md，包含精確AppID、環境及環境鍵名。
- 新worktree C:/Users/XB/.codex/worktrees/uwo-new-app-enable/AI UWO assistant，分支 codex/phase-20261104-new-app-enable，基線 d5161f9c7c01ca583460071a5b7406bc9375fcb0；所有修改只在此處。
- 中文交互及註釋；頁面／資料繁體。編碼前完整讀Design Foundation及HTML驗收規範。
- 不改archive/master/generated，不擴大runtime網路白名單，不增加依賴，不部署，不提交，不推送。每項先失敗測試再實作；先做定向測試，不並行執行多套完整verify。
- 每項保留舊AppID行為、舊任務及舊公開配置契約；平台秘密不進Git／報告。只有主代理處理官方工具與真雲。

### Task 1: 留言雙AppID安全與回調

**文件：** cloudfunctions/message-board/entry.js、core/{assembly,service,operation-service,safety-provider,task-worker,asset-service}.js；cloudfunctions/message-board-events/entry.js；相關tests/message-board及tests/cloudfunctions測試。不可改提醒／miniprogram／其他業務函數。

**輸入：** 設計中的 MESSAGE_BOARD_NEW_* 固定profile；已有resolveWechatIdentity。**輸出：** 配置完整／啟用時共享actor可正常寫、本人查詢及被白名單管理；新安全檢查與回調正確綁AppID，舊行為相容。

- [x] 先寫測試：完整新profile開放寫及僅新白名單有管理權；無新配置仍只讀；未知shared身份拒絕；actor輸入不可指定appId。
- [x] 先寫測試：新owner保存可信appId；舊owner缺appId回落固定舊端；text/image檢查按owner選固定兩者之一；跨App回調、資產、簽名URL拒絕，原舊回調仍通過。
- [x] 觀察新斷言失敗後實作最小profile分派，嚴格沿用HTTP／AES／HMAC校驗及安全／審核門禁；定時隊列同時保留兩端正確身份，不能把某profile套用整隊列。
- [x] 跑相關測試、eslint及自評；寫task-1-report.md，交代環境鍵、前置條件、文件、測試及未測項，交主代理審查。不提交／部署。

### Task 2: 提醒雙AppID服務與發送

**文件：** cloudfunctions/major-event-reminder/{handler,config,service}.js及worker/{handler,worker,shared/config}.js；tests/cloudfunctions、tests/major-event-reminder相關測試。主代理執行。

**輸入：** 設計中的 MAJOR_REMINDER_NEW_*；新命名空間owner及舊原生owner。**輸出：** 新端enabled配置與activateAuthorized，舊配置與舊任務不變。

- [x] 失敗測試覆蓋新profile完整時enabled且adUnitId空、無新模板停用、舊無FROM欄位及空字串均維持原生驗證、新端偽造／廣告action拒絕。
- [x] 失敗測試覆蓋worker兩端模板與收件原生OpenID／AppID一致、未知命名空間不得發送、舊歷史任務保持；再實作以可信owner及服務端profile選擇。
- [x] 新任務持久字段只由服務端生成，取消代數、session和授權綁定不變；timer驗證及原執行設定不改。定向測試通過，交審查。

### Task 3: 前端完全停廣告與授權直通

**文件：** miniprogram/contracts/major-event-reminder.ts、runtime/major-event-reminder-service.ts、runtime/major-event-reminder-platform.ts、subpkg-trade/controllers/major-event-reminder-controller.ts，以及舊端免廣告修改所涉及的必要頁面文案；對應tests。主代理執行。

- [x] 以舊維護分支已驗證流程為參考，先移植測試到新版觀察失敗，覆蓋微信三模板授權在點擊堆疊內、拒絕不開通、activateAuthorized重入／丟回覆重試、取消與卸載、廣告API零呼叫。
- [x] 再移植最小直接授權流程及必要契約，不再建立／預載／觀看廣告。不偽造adCompleted或微信accept，不增加請求端網路API。
- [x] 跑controller/platform/runtime定向測試、typecheck、network及size，必要時使用現有分包邊界，不放寬包體預算。

### Task 4: 平台核實、真雲候選、頁面與上線準備

**文件：** docs/development/2026-11-04-new-app-enable.md及既有HTML報告／本機ignored候選目錄。主代理執行。

- [ ] 官方工具讀取當前函數及回調metadata；完整線上包備份並逐檔核對最小增量；模板需由新帳號選擇有效三模板，不沿用舊ID。
- [ ] 用可信當前新端身份準備管理員名單，保持舊角色；新舊callback各自驗證，平台Secrets只留本機安全位置／雲端環境，不輸出。
- [ ] 全分支審查後順序完整verify；以真實SDK跑保存場景並檢視截圖，生成HTML分列repository／page／external，保留未測真機與實收。
- [ ] 真雲／上傳／審核以前完成具體候選、記錄及必要平台確認。AGENTS要求的Git提交前最後展示範圍／結果／message，不提前提交；任何原生待確認task先等確認再查原taskId。
