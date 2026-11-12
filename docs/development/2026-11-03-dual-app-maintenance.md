# 雙小程序維護安排執行記錄

日期：2026-11-03；基線 `e5765d09cf7bfde2aad1064dacc4770b26e48471`。

## 已實施

- 原遠端預設分支為 main，遠端 HEAD 與本地基線一致；原工程仍在 `codex/phase-20261102-miniprogram-migration`。沒有切換原工程、沒有改 main。
- 用 Codex 原生 create_worktree 建立 `C:\Users\XB\.codex\worktrees\uwo-old-maintenance\AI UWO assistant`，建立舊維護分支 `codex/phase-20261103-old-maintenance`。舊業務代碼、AppID 及函數源碼保持 e5765d0。
- 固定目錄聯結 `E:\AI-UWO-old` 指向舊 worktree；`E:\AI-UWO-new` 指向原 `E:\AI UWO assistant`，沒有複製／移動原未提交候選。
- 兩端各有只讀發布檢查、最終11項定向測試、維護手冊及 AGENTS 規則；Verify 工作流新增兩個維護分支的 push／PR 觸發。新端另有本輪設計、計畫及記錄；舊端保存此前遷移歷史文件，以維護手冊連結追溯雲端現況。
- 舊 worktree 獨立 npm ci，未改 package.json／lock，未升級依賴；assets:ci 只在新建舊 worktree 準備已發布測試素材。原工程素材及依賴保持不動。

## 證據

證據目錄：`E:\AI UWO assistant\artifacts\miniprogram-review\dual-app-20261103`，本機 ignored，不放入發布包。

- 紅：先寫真實臨時 Git 倉庫的有效舊目標測試，工具尚不存在，預期成功的斷言失敗（工具缺失，退出1）。
- 綠：`release-check-tests.log`，最終11項通過。包含新舊正例、帳號／分支錯配、staged／unstaged／untracked、detached／main、非根目錄、未知目標／多餘參數及 Node 20／24 拒絕，另直接驗證有效CLI參數遇dirty時回傳1，並實測CLI成功JSON及退出碼。初次9項日誌另保存為 release-check-tests-initial-9.log；定向 eslint、typecheck 通過。
- `old-clean-baseline.json`：舊 worktree 加入本輪文件之前，基線乾淨、AppID及分支匹配，ready=true。
- `new-uncommitted-candidate.json`：新端 ready=false，UNCOMMITTED_CHANGES；加入本輪工具／文件之後兩端均應拒絕，不能以上傳前基線 SHA 冒充候選提交。
- `protected-source-check.json`：備份47個路徑，原遷移代碼與私有輸入 hash 不變；變化僅為本輪明確新增維護規則的 AGENTS，以及備份時已新建、本輪持續更新的設計／計畫。
- 只讀審查代理獨立以 Node 22.23.3 跑9項測試，未發現 P1／P2；指出設計中的舊基線通過與當前 dirty 狀態應分開，已補正文件。

完整驗證採新端既有隔離候選 `E:\AI-UWO-verification\migration-20261102-connection` 與新建舊 worktree，Node22，未修復原工程歷史 ignored 腳本。日誌分別 `new-isolated-verify.log`、`old-worktree-verify.log`；兩端最終均退出0。

原先並行執行兩套完整門禁時，新增檢查測試因重複啟動tsx子進程，兩項超過5秒，並非帳號校驗斷言失敗。保留中止日誌為 new-isolated-verify-interrupted.log、old-worktree-verify-interrupted.log。之後改為核心情境直接調用實際檢查函數，保留真實Git庫與全部拒絕斷言，額外保留單一實際CLI進程（10秒進程上限／15秒測試上限）。審查指出失敗退出碼覆蓋不可由測試自己合成代替，因此另補真正runReleaseTargetCli回傳1的用例；沒有修改或放寬生產檢查邏輯。兩套完整門禁改為順序執行。

新端隔離候選完整 npm run verify 已退出0：241檔／3403項測試，另13檔／101項資料契約，所有後續門禁及只讀生成通過。這是本機隔離候選驗證，沿用此前隔離副本的依賴聯結，不冒充獨立npm ci的乾淨checkout或遠端CI。舊端 worktree 獨立安裝依賴後，完整 npm run verify 退出0：238檔／3335項測試，另13檔／101項資料契約及所有後續門禁通過。

`verified-source-comparison.json` 比較新端全部 tracked／untracked 非Markdown文件，共984條路徑，與通過驗證的隔離候選零差異；最終文檔另做定向format:check。舊端業務源碼、AppID及依賴對HEAD無差異；兩端工具／測試內容一致。當前兩端實際發布檢查均因本輪未提交變更而拒絕，提交後應重新執行，不能直接沿用提交前JSON。

## 提交前狀態與最後授權

本輪還沒有 commit／merge／push，沒有再上傳、部署、審核或正式發布；現有新端0.1.0的「未提交候選上傳」歷史保持原樣。main 的基線不變。

擬兩筆本地提交：舊端 `chore: 建立舊小程序獨立維護與發布檢查`（工具、測試、文件、CI及AGENTS）；新端 `feat: 接入新小程序並建立雙端維護流程`（此前已部署／測試／上傳的遷移候選，以及本輪維護安排）。待展示完整文件清單、驗證與 message 並取得用戶最後確認後才執行。

本機保護備份 `E:\AI-UWO-verification\dual-app-20261103-backup` 含私有配置，不公開、不提交。真機、全面頁面驗收及遠端 exact-SHA CI 沿用遷移記錄的未完成項，本輪不冒認完成。

用戶隨後回覆「ok建立吧」，確認按已展示的舊端6文件、新端50文件及兩條message分別提交，並要求提供另一個agent在舊端開發的交接內容。提交前已再次核對兩個分支／基線／完整文件清單、984個非Markdown路徑及原有完整門禁日誌；沒有新增業務代碼變更，只將本輪文檔的提交狀態更新為已獲授權。提交後精確SHA、乾淨工作區及目標檢查結果記錄在同證據目錄的 committed-versions.json；交接內容另保存為舊小程序開發交接.md，並直接交付用戶，不自行發送給其他agent。
