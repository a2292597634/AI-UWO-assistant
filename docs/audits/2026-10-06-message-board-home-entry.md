# 首頁留言板並列入口：程式完成，頁面驗收阻塞

## 實際變更

依使用者要求，首頁既有六項主功能圖標保持順序；下方「交流與回報」區改為兩個等寬文字入口：資料錯誤回報、留言板。入口不新增功能圖標或圖片素材。舊回報路由仍為 `/pages/officer-editor/index`；留言板指向新增分包 `/subpkg-message-board/pages/board/index`。

獨立頁面清楚顯示「留言板尚未開放」、選伺服器／主動選用暱稱頭像／管理員審核後公開的規則，原生禁用投稿並提供返回首頁。沒有假留言、假空列表、頭像收集或新增雲端呼叫。這次只完成入口與頁面容器，正式業務未完成。

已同步 8 個 UI 檔案及 2 個相關測試到原項目 `E:\AI UWO assistant`。覆寫前逐檔確認原文件等於提交 2ba1010 的基線，新頁面原本不存在；先保存原 bytes 與 SHA，再同步候選並核對寫入 SHA。備份在 `C:\Users\XB\AppData\Local\Temp\uwo-home-message-board-ui-f5sEes`，清單另存隔離根 `artifacts/message-board/home-entry/original-ui-sync.json`。受保護原文件 963 檔中僅 6 個本次允許檔有變更，無關變更 0；另新增 4 個分包頁面檔。原個人配置、規範修改與未追蹤計畫保持，不切換／重設原分支。

## 本機驗證

首頁新路由測試先失敗（不存在 supportEntries），再通過；既有大流行首頁契約原先檢查舊 WXML 的 if 字串，改為保護新的次級迴圈與舊回報 ID，兩檔相關 9 項測試通過。

完整 npm run verify 通過：192 檔／2,660 測試，資料契約另 12 檔／100。主包 1,661.7 KB，網路掃描與只讀生成通過。Node 22.23.3 使用進程級 `NODE_OPTIONS=--max-old-space-size=768`，不改專案配置或依賴。原先 TypeScript 因系統可用虛擬記憶體約 535 MB 崩潰，384 MB 堆又不足；實際記憶體回升後 768 MB 完整檢查通過，不把記憶體問題當作所有 UI 超時原因。

相關記錄 `.superpowers/message-board-g0/home-entry-red.log`、`home-entry-verify.log`（舊契約失敗）、`home-entry-final-verify.log`（exit 0）；失敗不覆寫為通過。

## 頁面驗收：blocked

doctor 正常。修改前首頁真實截圖在 `artifacts/miniprogram-review/2026-10-06T133704977Z-cyrc30/`，僅覆蓋舊首頁，不是修改後證據。

新頁注册 app.json 觸發全路由驗收。新增首頁真點擊場景、留言板返回場景及原先未覆蓋四個葉頁的只讀相容性場景；createTriggerPlan 全路由 20 場景、無未覆蓋路由／檔案。不移除原場景或放寬觸發器。

iterate／run 的新版窗口介面 `open_project_window` 超時，兩次自動恢復均失敗；改用官方 CLI 已支援的 agent start、以實際 autoPort 9458 連 SDK，Tool.getInfo 仍無回應，兩次恢復失敗。曾用官方 CLI 僅關閉／重開本工作區並獨立做有界診斷；沒有關閉使用者其他項目或遊戲。原子 agent tool 要求 app.json 的 agent.skills；沒有為驗收增加生產 agent 設定。TCP 可連／啟動返回 ok 不是 SDK 或頁面通過。

final 報告 `artifacts/miniprogram-review/2026-10-06T142152353Z-h6q0ct/report.html`／JSON：page blocked、repository not-run，修改後截圖 0；已讀 HTML／JSON，保留時間線與失敗原因。上述獨立完整 verify 通過不改寫此報告的 not-run。320／375／393／430、實際点击與新頁呈現全部待驗收，沒有假截圖、mock 视口或 handler 代替點擊。

## 交付界限

程式已在原項目，重新編譯即可由首頁下方的並列入口打開所註冊頁面；這是程式與路由定義，並非已完成真實點擊驗收。需恢復開發者工具連線後重跑 saved scenes／final，讀取實際截圖再確認外觀。未自動提交、合併、推送或部署本輪 UI。

## 使用者授權的本機 checkpoint

使用者其後要求將兌換碼預填更新為 `ANTARIA3RD`，對既有首次進入預填測試先改期望值觀察失敗，再修改唯一 DEFAULT_COUPON_CODE 與同步原項目；相關 30 項測試、lint／格式通過。只改預填，不改手動輸入、玩家設定或兌換提交流程，沒有實際送出兌換請求。

使用者在已告知頁面阻塞與功能未開放之後，明確要求「合并提交」。本機提交因此納入並列入口、未開放頁面、相容性場景／相關測試、設計記錄及上述兌換碼更新；仍保留 page blocked，不視作實機驗收或發布。原項目的個人配置與舊規劃不夾帶，生成部署包和秘密不進 Git。提交後來源與門禁紀錄見本機 integration-result／task-ledger，不改寫前述歷史報告。
