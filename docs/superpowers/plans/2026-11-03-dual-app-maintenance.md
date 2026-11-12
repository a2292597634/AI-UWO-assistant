# 新舊小程序並行維護實施計畫

**目標：** 建立兩個不易混淆的維護入口及可驗證的帳號／版本檢查。

**架構：** 原遷移目錄保留作新端；Codex 原生 worktree 作舊端；目錄聯結提供固定路徑。只讀 TypeScript 工具校驗目標，無依賴變更。

**約束：** Node >=22 <23；不改 main；不覆寫既有 tracked/untracked/ignored 工作；提交須最後確認；不重新上傳／部署。

- [x] 核對實際 Git、遠端 default main、兩個 AppID、歷史驗證及雲端兼容邊界。
- [x] 原生建立舊端 worktree，以 e5765d0 為基線；新端原地保留。
- [x] 備份原43項變更與 private config，保存 hash；建立舊維護分支及兩個固定聯結，禁止覆寫已存在目錄。
- [x] 在 tests/release/check-target.test.ts 先寫真實臨時 Git 倉庫測試，觀察缺失工具的失敗，再實現 tools/release/check-target.ts；測試與格式、型別、lint 通過。
- [x] 用實際 old/new 根目錄執行目標檢查，舊端初始乾淨基線通過；加入本輪文件後兩端因 dirty 被拒絕；不以此代替業務驗收。
- [x] 寫 docs/development/dual-app-maintenance.md 維護手冊及版本台帳；AGENTS 加入口與雲端部署限制；兩端 Verify 工作流監聽維護分支。
- [x] 在既有隔離候選加入本輪工具及文件，執行完整 verify；新端241檔／3403項、舊端238檔／3335項通過，兩端另各101項資料契約通過；原遷移內容 hash 保持不變，984個非Markdown路徑與已驗證候選一致。
- [x] 提供具體提交清單、證據及 message，按 AGENTS 取得最後確認：用戶回覆「ok建立吧」。清單為 artifacts/miniprogram-review/dual-app-20261103/proposed-commits.md；按清單分別本地提交，不合併main或推送。最終SHA與檢查結果見同目錄 committed-versions.json。
