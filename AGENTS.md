# AGENTS.md

本倉庫是《Uncharted Waters Origin》國際服航海士資料查詢微信小程序。界面與資料僅使用繁體中文。

## 0. 語言規範

- **代碼註釋、文檔、與用戶的所有交互和回覆均使用中文**（繁體或簡體均可，以能正常溝通為準）。
- 保留必要的英文表述：專有名詞（TypeScript、CloudBase、CDN、Vitest）、文件名、命令、變數名、API 名稱等。
- WXML/WXSS 樣式類名採用英文（BEM 風格），但與其關聯的註釋和文檔說明使用中文。

## 1. 數據三層架構（最高優先級）

```
archive/  →  data/master/  →  miniprogram/generated/
 不可修改      唯一可手動維護      工具自動生成，禁止手動修改
```

- `archive/`：voyage.tw 一次性快照，只讀。
- `data/master/`：唯一權威數據源，所有人手修改在此進行。
- `miniprogram/generated/`：由 `npm run data:generate` 生成。手動修改無效，下次構建必定被覆蓋。
- 修改 `data/master/` 後必須運行 `npm run data:check`。

## 1.1 技能等級、解鎖等級與角標規範

涉及技能等級、解鎖等級、技能角標或主動／被動分類時，先閱讀並遵循
`docs/superpowers/specs/2026-09-13-skill-level-and-badge-convention-design.md`；本文件不重複詳細規則。

## 1.2 新增航海士與提督

收到新增航海士、提督或人物圖鑑的請求時，直接按[線下錄入規範](docs/superpowers/specs/2026-09-13-officer-error-report-and-offline-intake-design.md#52-技能引用)整理截圖或文字資料。先按規範辨識技能分組、槽位與解鎖等級，再核對現有主資料並整理錄入候選。已有位置規則或資料可確認的欄位直接填寫，只向用戶確認仍有歧義或缺少證據的欄位。

## 2. 硬約束

- 禁止直接在 `main`／`master` 分支開發。先核對實際 HEAD、分支、遠端預設分支及所有 tracked／untracked／必要 ignored 輸入，保護既有工作。分支命名：`codex/phase-N-描述`。
- `miniprogram/` 預設禁止 `wx.request`、`wx.downloadFile`、`wx.cloud`、手寫遠程 URL 或 Node.js API。頁面與元件不得直接呼叫 `wx.cloud` 或操作雲端資料庫；頁面透過專用 runtime service 訪問雲端。
- 既有 CloudBase／CDN 例外只依 [網路檢查入口](tools/quality/check-runtime-network.ts) 與 [掃描器](tools/quality/find-runtime-network-references.ts) 的精確檔案、API、CDN origin／prefix 邊界放行。CloudBase 僅允許已登記位置的 `init`、`callFunction`、`uploadFile`；CDN 僅允許已登記生成檔案中的圖片欄位，使用發布 manifest 指定的 HTTPS 來源與路徑，不含 query／hash。必須通過 `npm run check:runtime-network`，不得把例外擴大到任意頁面或其他 API。
- 新增或擴大網路例外前，必須說明檔案、API 與用途並取得用戶授權，再同步掃描白名單與相關契約測試；已有明確授權覆蓋時不重複確認。不得關閉或全域放寬掃描。雲端身分、權限與資料校驗在服務端執行，部署策略參閱既有 `docs/architecture/` 雲端文檔。
- 用戶於 2026-10-29 明確批准的唯一新增例外：`miniprogram/runtime/major-event-reminder-service.ts` 僅可使用 `wx.cloud.callFunction` 呼叫固定的 `major-event-reminder` 提醒函數；同步精確白名單與契約，既有白名單維持原狀，其餘 API 與檔案禁令不變。
- 用戶於 2026-11-02 批准新 AppID `wxd0bc7afdc9cd334a` 的共享連線例外：`miniprogram/runtime/shared-cloud-client.ts` 可使用 `wx.cloud.Cloud`、`init`、`callFunction`、`uploadFile`，共享資源方僅限舊 AppID `wx8f961bcd8b26996a` 與環境 `cloud1-d7gxfuxfe813b4eaa`。函數僅限原已登記的六個業務函數，上傳僅限既有 `officer-error-reports/` 截圖流程；同步精確白名單與契約，不授權資料庫直連、任意函數或其他網路 API。
- 禁止未經用戶確認新增/刪除/升級依賴。
- 禁止順手修復無關問題或格式化無關文件。
- 發現範圍外缺陷 → 報告並建議另開任務，不得夾帶。

## 3. 提交前門禁

提交前必須通過相關檢查。完整驗證：

```powershell
npm run verify
```

環境要求 Node `>=22 <23`、npm `>=10`。包含：只讀預檢 → format:check → lint → typecheck → test → runtime-network → 套件體積 → UI／重大事件素材 → 發布 manifest → data:check → 只讀 generate:check。

`workflow:preflight` 不下載、寫檔或修復環境；`generate:check` 使用兩個暫存集合比較當前候選，不讀 Git index，不覆寫合法 dirty 產物。`format` 會寫回、`format:check` 不會；必要時 `assets:ci` 只能在乾淨隔離副本準備已發布 PNG，不能在原工作區盲目覆寫。

commit 前展示變更文件、驗證結果和擬用 message，等待用戶確認。

## 4. TDD

數據解析、轉換、校驗、篩選邏輯、索引/分片生成、素材去重和確定性構建必須遵循紅-綠-重構循環。UI 代碼可用 DevTools 驗證代替。

## 5. Design Foundation

涉及 UI、WXML 或 WXSS 的任務，編碼前必須完整閱讀
`docs/superpowers/specs/2026-08-09-design-foundation-design.md`。

新增或修改樣式必須遵守其中的 Token、字體、間距、圓角、陰影、狀態、按鈕、觸控和安全區規範。

## 6. 页面变更验收触发

涉及 UI、WXML、WXSS、页面素材或页面共享运行时代码的任务，必须阅读并遵循
`docs/superpowers/specs/2026-09-16-miniprogram-review-html-report-design.md`。
该文件是页面验收、过程说明和截图证据的唯一规范来源；本文件不重复具体流程。

## 7. 當前流程入口

### 新端主線與舊端封存（2026-11-12）

- 唯一日常開發入口為 `E:\AI-UWO-new`（新 AppID `wxd0bc7afdc9cd334a`）。先讀 [維護與封存手冊](docs/development/dual-app-maintenance.md)；新端統一以 `main` 為整合主線，實際已整合 SHA 以 [開發現況](docs/development/current-state.md) 為準，不能把候選當作已推送。
- 整合後所有任務從最新 `main` 建立 `codex/phase-N-描述` 短期分支，經審查與 PR 整合回 `main`；不再開發舊端或向舊維護分支同步前端改動。提交前原有確認要求不變。
- 上傳新端前執行 `tools/release/check-target.ts --target new --project-root 絕對工程路徑`（Node 22／tsx）。工具要求新端 AppID、`main` 及乾淨提交；`--target old` 僅作診斷，一律回報 `OLD_TARGET_FROZEN`。此工具不能攔截開發者工具的手動按鈕，也不代替完整門禁、頁面或真機驗收。
- 舊端代碼、最後發布記錄、`E:\AI-UWO-old` 入口及含未提交內容的舊 worktree 保留作回溯，退出日常開發。恢復舊端開發或發布須另行確認，不能把歷史手冊當作目前授權。
- **共享舊雲環境及資源帳號繼續保留。** 禁止從舊維護分支整包部署雲函數；修改共享函數以新端相容實現為基礎，先比較線上差異與備份，最小增量部署並驗證受影響的新舊身份。舊端停更不授權刪除環境、資料、資源帳號或身份相容邏輯。
- 整理與待辦見 [收尾記錄](docs/development/2026-11-12-repository-closeout.md) 和 [待辦清單](docs/development/backlog.md)。歷史 failed／blocked、未提交工作與必要 ignored 證據不可因歸檔對話或刪除已合併分支而遺失。

見 [開發現況與證據](docs/development/current-state.md)、[操作契約索引](docs/development/operation-contracts.md) 與 [任務記錄模板](docs/development/task-record-template.md)。本機、乾淨 checkout、遠端 CI、正式模擬器、真機／真雲的通過證據分開記錄。

匯入候選在 `artifacts/import-candidates/officers`，審核採納後才維護 master；`pipeline:full` 不自動採納。doctor 的配置／CLI 診斷不等同實際 SDK、頁面、元素及外部驗收。歷史失敗與未驗收項保留，不以工具回歸測試銷項。
