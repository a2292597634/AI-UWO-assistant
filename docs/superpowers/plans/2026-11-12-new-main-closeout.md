# 新端主線與舊端封存實施計畫

> **執行方式：** 使用 executing-plans 在本對話逐項執行，最終按 requesting-code-review 進行獨立審查。提交、合併與推送仍遵循 AGENTS 的具體候選確認。

**目標：** 保留原倉庫，準備新端接管 main，安全收斂歷史分支、工作區及任務。

**架構：** 業務代碼沿用新端 006024d；只調整發布工具、CI 和當前流程文檔。清理先備份再核對，保留未提交與未整合內容。

**技術：** Git、PowerShell、Node 22.23.3、TypeScript、Vitest；無依賴變更。

## 全域約束

- 不在 main 開發；任務分支 codex/phase-20261112-new-main-closeout。
- 原有 dual-app-maintenance.md 路徑修訂已備份且須完整保留。
- 不修改 archive、master、generated、miniprogram、雲函數或私有帳號配置。
- 不重寫 Git 歷史，不用 git clean 清理原工作區，不把快照標籤當發布證明。
- 共享舊雲環境持續保留；不部署或上傳。

## 任務 1：盤點與保護

文件：artifacts/miniprogram-review/repository-closeout-20261112/inventory.before.json、all-refs-before.bundle、dual-app-maintenance.before.md。

- [x] 重新核對本地及遠端 SHA、全部 tracked/untracked 狀態與必要 ignored 清單。
- [x] 保存 Git bundle 並執行 git bundle verify；備份既有文檔修改。
- [x] 建立任務分支；Node 22 下現有發布測試 11 項通過。
- [x] 保存本地可刪分支、遠端候選、工作區及 Codex 任務的逐項處置清單。

## 任務 2：發布契約紅→綠

文件：tests/release/check-target.test.ts、tools/release/check-target.ts。

- [x] 先改測試：新端乾淨 main 成功、遷移／任務分支與 detached 失敗、舊端即使乾淨仍回 OLD_TARGET_FROZEN。
- [x] 保留帳號、Node、dirty、子目錄、CLI 退出碼測試；補 Windows 大小寫及 junction 真 Git 案例。
- [x] 執行 node_modules/.bin/vitest.cmd run tests/release/check-target.test.ts，確認新契約與 Windows 回歸為紅燈。
- [x] 最小修改 new.branch=main，old 固定凍結，採 realpathSync.native 正規化 Windows 路徑。
- [x] 同命令執行至全部通過，再作必要重構。

## 任務 3：流程入口與待辦

文件：AGENTS.md、README.md、.github/workflows/verify.yml、docs/development/dual-app-maintenance.md、docs/development/current-state.md、docs/development/2026-11-12-repository-closeout.md、docs/development/backlog.md。

- [x] 將新端 main、舊端凍結、共享資源保留寫入當前入口；原雙端歷史內容保留並標示歷史。
- [x] CI 僅監聽 main 的 push 與目標 PR，不擴大網路或依賴權限。
- [x] 文檔區分整合前候選與整合後正式流程，不提前聲稱 main 已更新。
- [x] 檢查對話 cwd、全部附加 worktree、realpath／junction、dirty 與 ignored 備份後歸檔已完成對話；有受保護關聯工作區就保持可見。執行後重讀 App queue 與 worktree 清單；本輪漏查的 ignored 證據損失見收尾記錄，不宣稱無損完成。未提交布局、人工流行採集、未選定頭像及驗收缺口保持待辦。
- [x] 對可恢復分支及工作區依清單分批清理，逐項留下恢復指引；遠端刪分支待 main 整合及 CI 後。

## 任務 4：驗證、審查與具體候選確認

- [x] 對本輪文件定向 prettier，執行 git diff --check。
- [x] 在乾淨隔離候選準備既有發布素材並執行 npm run verify；原工作區 ignored 證據不覆寫。
- [x] 核對隔離候選與待提交文件逐檔 SHA256，確認只涉及批准範圍。
- [x] 獨立審查工具、測試、文檔、CI 與清理記錄；修正重要問題後重跑相關檢查。
- [x] 已展示原11文件、完整驗證與message；使用者要求核對歷史分支後繼續，授權沿提交／PR／推送方案執行。續作新增歷史對照報告與最小repository修復／測試，共14文件；頁面及診斷缺口另列待辦。
- [ ] 完成14文件候選完整驗證、提交／PR及精確SHA CI，再整合main與清理已備份遠端分支。
