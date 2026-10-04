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

## 2. 硬約束

- 禁止直接在 `main`／`master` 分支開發。先核對實際 HEAD、分支、遠端預設分支及所有 tracked／untracked／必要 ignored 輸入，保護既有工作。分支命名：`codex/phase-N-描述`。
- `miniprogram/` 默認禁止 `wx.request`、雲端呼叫、遠程 URL 或 Node.js API。既有 CloudBase／CDN 例外僅依 `tools/quality/check-runtime-network.ts` 與掃描器的精確檔案、API、origin／prefix 邊界，不得擴大到任意頁面。必須通過 `npm run check:runtime-network`；部署策略參閱既有 `docs/architecture/` 雲端文檔。
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

見 [開發現況與證據](docs/development/current-state.md)、[操作契約索引](docs/development/operation-contracts.md) 與 [任務記錄模板](docs/development/task-record-template.md)。本機、乾淨 checkout、遠端 CI、正式模擬器、真機／真雲的通過證據分開記錄。

匯入候選在 `artifacts/import-candidates/officers`，審核採納後才維護 master；`pipeline:full` 不自動採納。doctor 的配置／CLI 診斷不等同實際 SDK、頁面、元素及外部驗收。歷史失敗與未驗收項保留，不以工具回歸測試銷項。
