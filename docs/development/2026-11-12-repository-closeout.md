# 新端主線與舊端封存收尾記錄

日期：2026-11-12。工作分支 `codex/phase-20261112-new-main-closeout`。使用者已批准保留原倉庫、新端接管 main、舊端停更及安全整理本地與 GitHub 任務。

## 整合前狀態快照與授權邊界

本節保存提交前的盤點快照，後續實際主線與CI見 [main提交](https://github.com/a2292597634/AI-UWO-assistant/commits/main) 與 [main Verify](https://github.com/a2292597634/AI-UWO-assistant/actions/workflows/verify.yml?query=branch%3Amain)。

新端基線 `006024d0ce472a79abb250a99e02a8e2e9baa881` 已在遠端遷移分支；main 仍為 `e5765d09cf7bfde2aad1064dacc4770b26e48471`。本輪準備候選，不提前宣稱已提交、合併或推送。按 AGENTS，先展示文件、驗證與 message，再等具體候選確認。

新端 0.2.2 上傳收據對應基線；使用者本輪回報新端已上線，平台正式版本與時間未重新查。舊端 `27e3762` 是 2.5.4 體驗版候選，原任務最後確認正式版仍為 2.5.3；不把代碼標籤當作正式發布證明。舊端不再安排日常更新或進一步發布。

共享舊雲環境、資源方帳號及身份相容持續保留。本輪不修改 miniprogram、master 或 generated；歷史核對後僅補回 fleet-config repository 的精確集合錯誤碼來源及測試，不部署、上傳、送審或正式發布。

## 已執行的整理

| 項目                   | 整理前                      | 目前結果                                                         |
| ---------------------- | --------------------------- | ---------------------------------------------------------------- |
| 本地分支               | 91（本輪新增 1 個任務分支） | 24；已刪除 68 個備份已驗證、已包含新端且未被使用的分支           |
| Git worktree           | 35                          | 18；已安全移除 17 個乾淨且已整合工作區，舊候選源碼取消歸檔後恢復 |
| 初始 dirty 工作區      | 11                          | 全部保留；原有主目錄文檔修改已備份並保留於歷史手冊正文           |
| Codex 本專案未歸檔對話 | 15                          | 8；其餘 7 個已歸檔，未完成事項移入待辦                           |
| GitHub 分支            | 18                          | 本輪未刪遠端分支，待 main 整合且精確 SHA CI 通過後按下表清理     |
| 本地 origin/HEAD       | 舊 importer 分支            | 已修正為 origin/main                                             |

GitHub 目前無開啟的 PR；剩餘事項集中於 [Issue #2](https://github.com/a2292597634/AI-UWO-assistant/issues/2)，本地入口為 [backlog](backlog.md)。Issue 由本機已登入管理員身份的 gh 建立；連接器建立接口回 403 後改用 CLI，沒有重複任務。

本地已建立三個標籤，尚未推送：`baseline/new-end-0.2.2-006024d`、`archive/old-end-code-27e3762`、`archive/pre-new-main-20261112`。分別保存新端已上傳代碼、舊端候選代碼及整合前 main。

## 工作區逐項處置

乾淨工作區的 ignored 文件（包括證據、私有配置及 staging 輸入）先備份，移除前再次核對文件集合、來源與備份 SHA256、HEAD 及乾淨狀態。僅排除可依鎖檔重建的頂層 node_modules／miniprogram_npm。含嵌套工作區者未移除。

| 原工作區                                                                        | 初始修改數 | 處置                                                   |
| ------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------ |
| E:/AI UWO assistant                                                             | 1          | 保留主要工作區與本輪候選                               |
| C:/Users/XB/.codex/worktrees/home-entry-icons/AI UWO assistant                  | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| C:/Users/XB/.codex/worktrees/home-icon-size-tuning/AI UWO assistant             | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| C:/Users/XB/.codex/worktrees/home-icon-transparent-backgrounds/AI UWO assistant | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| C:/Users/XB/.codex/worktrees/phase-15-error-report-button-layout                | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| C:/Users/XB/.codex/worktrees/phase-22-officer-change-button-layout              | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| C:/Users/XB/.codex/worktrees/phase-46-current-event-copy/AI UWO assistant       | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| C:/Users/XB/.codex/worktrees/phase-50-review-main-merge/AI UWO assistant        | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| C:/Users/XB/.codex/worktrees/phase-57-commit-verification/AI UWO assistant      | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| C:/Users/XB/.codex/worktrees/phase-57-development-workflow/AI UWO assistant     | 0          | 保留嵌套工作區及歷史證據                               |
| C:/Users/XB/.codex/worktrees/phase-58-message-board/AI UWO assistant            | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| E:/AI UWO assistant/.worktrees/phase-19-maintenance-avatar-admin                | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| E:/AI UWO assistant/.worktrees/phase-4-shared-components                        | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| E:/AI UWO assistant/.worktrees/phase-5-fix-skill-icons                          | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| E:/AI UWO assistant/.worktrees/phase-6-asset-loading-strategy                   | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| E:/AI UWO assistant/.worktrees/phase-6-review-followups                         | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| E:/AI UWO assistant/.worktrees/phase-7-skill-icon                               | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| E:/AI UWO assistant/.worktrees/phase-8-game-month-china-time                    | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| E:/CodexData/worktrees/old-home-migration-popup/AI UWO assistant                | 0          | App 恢復 detached 代碼；ignored 未完整恢復，見副作用章 |
| E:/UWO-worktrees/coupon-batch-verify-20261110                                   | 17         | 保留未提交內容                                         |
| E:/UWO-worktrees/major-event-integration                                        | 0          | 已封存 ignored 資料並移除；Git 提交可由 bundle 恢復    |
| E:/UWO-worktrees/major-event-reminders                                          | 15         | 保留未提交內容                                         |
| E:/UWO-worktrees/old-direct-new-verify                                          | 5          | 保留未提交內容                                         |
| E:/UWO-worktrees/phase-1-fleet-solver-correctness                               | 0          | 保留獨有提交；不得直接整分支合併                       |
| E:/UWO-worktrees/phase-2-fleet-config-optimistic-lock                           | 0          | 保留獨有提交；不得直接整分支合併                       |
| E:/UWO-worktrees/phase-3-fleet-config-create-constraints                        | 0          | 保留獨有提交；不得直接整分支合併                       |
| E:/UWO-worktrees/phase-4-fleet-config-contract-validation                       | 0          | 保留獨有提交；不得直接整分支合併                       |
| E:/UWO-worktrees/phase-5-fleet-config-page-flow                                 | 2          | 保留未提交內容                                         |
| E:/UWO-worktrees/phase-5-review-followups                                       | 0          | 保留獨有提交；不得直接整分支合併                       |
| E:/UWO-worktrees/phase-50-review-repair                                         | 10         | 保留未提交內容                                         |
| E:/UWO-worktrees/phase-57-clean-verification                                    | 51         | 保留未提交內容                                         |
| E:/UWO-worktrees/phase55-ci-verification-20261004                               | 5          | 保留未提交內容                                         |
| E:/UWO-worktrees/uwo-new-app-enable                                             | 19         | 保留未提交內容                                         |
| E:/UWO-worktrees/uwo-officer-intake-verify-20261110                             | 22         | 保留未提交內容                                         |
| E:/UWO-worktrees/uwo-old-maintenance                                            | 3          | 保留未提交內容                                         |

## 本地已清理分支

所有下列成功項的 SHA 均在清理前 Git bundle 中，且為新端基線祖先；未使用強制刪除。失敗項因上游合併條件不同而保留，沒有放寬保護。

| 分支                                               | 原 SHA       | 處置                                   |
| -------------------------------------------------- | ------------ | -------------------------------------- |
| codex/phase-0-review-repair-plan                   | b6789b6d8295 | 已刪除，可從 bundle 恢復               |
| codex/phase-0-ui-ux-audit-report                   | c5e567dd6f65 | 已刪除，可從 bundle 恢復               |
| codex/phase-1-fleet-share-design                   | 82ef9b2b5499 | 已刪除，可從 bundle 恢復               |
| codex/phase-1-冒險配隊安全護欄                     | 167ae7b246b4 | 已刪除，可從 bundle 恢復               |
| codex/phase-11-data-maintenance-design             | 4afb2e9f15b5 | 已刪除，可從 bundle 恢復               |
| codex/phase-11-error-report-intake-design          | ba3fd7290f30 | 已刪除，可從 bundle 恢復               |
| codex/phase-13-error-report-ui-redesign            | 0b1dfccbf457 | 已刪除，可從 bundle 恢復               |
| codex/phase-14-error-report-ui-polish              | ae82aee93e47 | 已刪除，可從 bundle 恢復               |
| codex/phase-16-maintenance-skill-form              | 407a81edee19 | 已刪除，可從 bundle 恢復               |
| codex/phase-18-package-size-fix                    | 17ca84329b61 | 已刪除，可從 bundle 恢復               |
| codex/phase-2-fleet-config-optimistic-lock         | 46fa1ec9cd37 | 已刪除，可從 bundle 恢復               |
| codex/phase-2-review-followups                     | 52e2e1fc8769 | 已刪除，可從 bundle 恢復               |
| codex/phase-20261103-reminder-direct-cloud-compat  | d5161f9c7c01 | 已刪除，可從 bundle 恢復               |
| codex/phase-20261109-officer-intake-rules          | 28ffcd06891c | 已刪除，可從 bundle 恢復               |
| codex/phase-20261110-coupon-batch                  | 006024d0ce47 | 已刪除，可從 bundle 恢復               |
| codex/phase-21-fleet-share-button-design           | 5f74b9d658be | 已刪除，可從 bundle 恢復               |
| codex/phase-23-fleet-share-bugfix                  | 39d6a1bc866e | 已刪除，可從 bundle 恢復               |
| codex/phase-24-miniprogram-visual-review           | 7551bd6f694c | 已刪除，可從 bundle 恢復               |
| codex/phase-25-html-review-report                  | b3f5a4238f4a | 已刪除，可從 bundle 恢復               |
| codex/phase-27-fleet-share-background-contrast     | fe284fe68c64 | 已刪除，可從 bundle 恢復               |
| codex/phase-28-fleet-share-visual-reimplementation | 1569c34d2c24 | 已刪除，可從 bundle 恢復               |
| codex/phase-29-adventure-target-limit              | fefcc74f7041 | 已刪除，可從 bundle 恢復               |
| codex/phase-3-fleet-right-align                    | c5917e3c0843 | 已刪除，可從 bundle 恢復               |
| codex/phase-31-fix-officer-portrait-alpha          | 90816291df4c | 已刪除，可從 bundle 恢復               |
| codex/phase-35-top-config-share-polish             | bed51f559540 | 已刪除，可從 bundle 恢復               |
| codex/phase-37-config-share-two-line               | bed51f559540 | 已刪除，可從 bundle 恢復               |
| codex/phase-38-fix-officer-alpha                   | 08dd5e16e7d0 | 已刪除，可從 bundle 恢復               |
| codex/phase-39-adventure-share-order               | a520eb596aec | 已刪除，可從 bundle 恢復               |
| codex/phase-4-ui-deep-polish                       | c39be91c23ed | 已刪除，可從 bundle 恢復               |
| codex/phase-41-fix-share-frame-color               | 8e51e378205d | 已刪除，可從 bundle 恢復               |
| codex/phase-42-project-codex-config                | a940875e1873 | 已刪除，可從 bundle 恢復               |
| codex/phase-43-trade-category-icons                | 8593054c00fd | 已刪除，可從 bundle 恢復               |
| codex/phase-45-major-event-schedule-cleanup        | 7d789c3485fc | 已刪除，可從 bundle 恢復               |
| codex/phase-5-battle-fleet-simulator               | 95d271c04dc5 | 已刪除，可從 bundle 恢復               |
| codex/phase-5-戰鬥配隊重構                         | 8530519cb628 | 已刪除，可從 bundle 恢復               |
| codex/phase-51-review-closeout                     | c93dd5bbf34a | 已刪除，可從 bundle 恢復               |
| codex/phase-52-ui-automation-scope                 | e1e699595721 | 已刪除，可從 bundle 恢復               |
| codex/phase-53-project-closeout                    | 089448f70974 | 已刪除，可從 bundle 恢復               |
| codex/phase-54-closeout-validation                 | 7ee47aa3e4dc | 已刪除，可從 bundle 恢復               |
| codex/phase-55-ci-asset-bootstrap                  | 79e778c4a69a | 已刪除，可從 bundle 恢復               |
| codex/phase-56-development-workflow-plan           | 79e778c4a69a | 已刪除，可從 bundle 恢復               |
| codex/phase-59-review-repair                       | 79e778c4a69a | 已刪除，可從 bundle 恢復               |
| codex/phase-6-航海士操作按鈕                       | 318cbe112c90 | 已刪除，可從 bundle 恢復               |
| codex/phase-60-auto-fleet-performance              | 45073943ee2c | 已刪除，可從 bundle 恢復               |
| codex/phase-60-review-integration                  | ff87780b40cb | 已刪除，可從 bundle 恢復               |
| codex/phase-61-major-event-by-type                 | c48d3732b961 | 已刪除，可從 bundle 恢復               |
| codex/phase-62-major-event-reminders               | 07c7adc55203 | 已刪除，可從 bundle 恢復               |
| codex/phase-62-reminder-integration                | 07c7adc55203 | 已刪除，可從 bundle 恢復               |
| codex/phase-63-reminder-ad-diagnostics             | e5765d09cf7b | 已刪除，可從 bundle 恢復               |
| codex/phase-8-package-size-cleanup                 | 2d0bbe84ef1f | 已刪除，可從 bundle 恢復               |
| codex/phase-8-資料頁資訊架構                       | b3cbaeb611ca | 已刪除，可從 bundle 恢復               |
| codex/phase-9-battle-catalog-fixes                 | b348e3346ef7 | 已刪除，可從 bundle 恢復               |
| codex/phase-9-config-management-redesign           | 55e7f140c59d | 已刪除，可從 bundle 恢復               |
| codex/runtime-architecture-stabilization           | d593bcfbae80 | 已刪除，可從 bundle 恢復               |
| codex/phase-15-error-report-button-layout          | e58d05fad35c | 已刪除，可從 bundle 恢復               |
| codex/phase-19-maintenance-avatar-admin            | 069dacef17fc | 已刪除，可從 bundle 恢復               |
| codex/phase-22-officer-change-button-layout        | f924ee65c769 | 已刪除，可從 bundle 恢復               |
| codex/phase-4-配隊共享元件                         | cc92e2616851 | 已刪除，可從 bundle 恢復               |
| codex/phase-46-hide-current-possible-label         | 982f1e009ca8 | 已刪除，可從 bundle 恢復               |
| codex/phase-47-home-entry-icons                    | c678024e09c7 | 已刪除，可從 bundle 恢復               |
| codex/phase-48-home-icon-transparent-background    | 0c5b9598f4fc | 已刪除，可從 bundle 恢復               |
| codex/phase-49-enlarge-home-fleet-icons            | ccaa11aa4b35 | 已刪除，可從 bundle 恢復               |
| codex/phase-5-fix-skill-icons                      | bd5b2a0c4891 | 已刪除，可從 bundle 恢復               |
| codex/phase-58-message-board                       | f7934fbf51ed | 已刪除，可從 bundle 恢復               |
| codex/phase-6-asset-loading-strategy               | 46393f61b70d | 已刪除，可從 bundle 恢復               |
| codex/phase-6-review-followups                     | a8b58749f4d6 | 保留：git branch -d 拒絕，另行核對上游 |
| codex/phase-61-major-event-integration             | 36eb2c06a7df | 已刪除，可從 bundle 恢復               |
| codex/phase-7-skill-icon                           | a8b58749f4d6 | 已刪除，可從 bundle 恢復               |
| codex/phase-8-game-month-china-time                | 2e942a8ba1b3 | 已刪除，可從 bundle 恢復               |

## 遠端分支候選（尚未執行）

只在 main 完成整合、標籤已推送與精確 SHA CI 通過後執行。刪除前再次讀取遠端 SHA，不因本次清單而盲刪後來新增的提交。

| 遠端分支                                   | 盤點 SHA     | 後續處置                              |
| ------------------------------------------ | ------------ | ------------------------------------- |
| codex/phase-1-blockers                     | 52e2e1fc8769 | main 整合後可刪候選；遷移分支最後清理 |
| codex/phase-1-冒險配隊安全護欄             | 167ae7b246b4 | main 整合後可刪候選；遷移分支最後清理 |
| codex/phase-2-自動配隊預覽                 | 1df6d9722975 | main 整合後可刪候選；遷移分支最後清理 |
| codex/phase-20261102-miniprogram-migration | 006024d0ce47 | main 整合後可刪候選；遷移分支最後清理 |
| codex/phase-20261103-old-maintenance       | 27e3762eb4ef | 保留凍結基線，舊端代碼標籤另存        |
| codex/phase-3-fleet-right-align            | c5917e3c0843 | main 整合後可刪候選；遷移分支最後清理 |
| codex/phase-4-review-followups             | 58adb7946a2b | 保留；核對獨有提交或等效修正後另決定  |
| codex/phase-4-ui-deep-polish               | c39be91c23ed | main 整合後可刪候選；遷移分支最後清理 |
| codex/phase-41-fix-share-frame-color       | 8e51e378205d | main 整合後可刪候選；遷移分支最後清理 |
| codex/phase-5-review-followups             | e152319d6abf | 保留；核對獨有提交或等效修正後另決定  |
| codex/phase-50-review-repair               | 4ac55f984154 | main 整合後可刪候選；遷移分支最後清理 |
| codex/phase-6-review-followups             | adbbbfcbb968 | main 整合後可刪候選；遷移分支最後清理 |
| codex/phase-60-review-integration          | ff87780b40cb | main 整合後可刪候選；遷移分支最後清理 |
| codex/phase-7-adventure-save-limit         | 8688e1317e75 | 保留；核對獨有提交或等效修正後另決定  |
| codex/phase-7-skill-icon                   | a8b58749f4d6 | main 整合後可刪候選；遷移分支最後清理 |
| codex/phase-9-battle-catalog-fixes         | b348e3346ef7 | main 整合後可刪候選；遷移分支最後清理 |
| codex/runtime-architecture-stabilization   | f315c5d71b53 | main 整合後可刪候選；遷移分支最後清理 |
| main                                       | e5765d09cf7b | 保留唯一開發主線                      |

## Codex 任務處置

歸檔保留對話歷史，不代表未驗收能力通過。保留的三個功能對話仍待比對或決策；另外四個對話為保護關聯工作區而取消歸檔。CI 根目錄問題由本輪候選承接。

| 原對話標題                     | 處置                               |
| ------------------------------ | ---------------------------------- |
| 分析旧端停更与新端仓库整理方案 | 保留可見                           |
| 支持批量兑换码提交             | 已歸檔；未完成事項已轉入待辦       |
| 查找航海士截图文件夹           | 已歸檔；未完成事項已轉入待辦       |
| 排查新端小程序搜索不到         | 保留可見：取消歸檔以保護關聯工作區 |
| 迁移 Codex 数据到 E 盘         | 已歸檔；未完成事項已轉入待辦       |
| 迁移小程序到新注册账号         | 保留可見：取消歸檔以保護關聯工作區 |
| 开发流行时间微信提醒           | 保留可見：取消歸檔以保護關聯工作區 |
| 设计小程序图标                 | 保留可見                           |
| 了解广告任务与业务订阅         | 已歸檔；未完成事項已轉入待辦       |
| 添加流行时间与下次开始时间     | 已歸檔；未完成事項已轉入待辦       |
| 优化留言板页面控件布局         | 保留可見                           |
| 设计用户留言板功能             | 已歸檔；未完成事項已轉入待辦       |
| 实施开发流程改进计划           | 保留可見：取消歸檔以保護關聯工作區 |
| 梳理开发流程并优化规范         | 已歸檔；未完成事項已轉入待辦       |
| 設計人工流行功能               | 保留可見                           |

## 本輪代碼與流程變更

- 發布工具：新端僅接受 main；舊端一律回 OLD_TARGET_FROZEN。帳號、Node 22、dirty、Git 根目錄及 CLI 失敗碼仍檢查。
- 修正同一工具既有 Windows 大小寫誤判：採 realpathSync.native，普通子目錄仍拒絕，不以全轉小寫或關閉檢查放寬邊界。
- Verify 僅監聽 main push／目標 PR；維護入口與 README 指向新端，歷史雙端操作保留並標示已被新規則取代。

## 歷史分支核對續作

使用者已在展示候選後要求核對並繼續，授權沿原提交／PR／推送方案執行。四個分支對照及一處最小修復見 [核對報告](../audits/2026-11-12-unmerged-branch-reconciliation.md)。不合併早期demo或舊端分支；原生返回未保存保護列獨立後續頁面任務。

## 驗證記錄

- 發布工具原基線：11/11 通過。
- 新契約紅燈：18 項中 13 failed；主線／凍結契約實作後，Windows 大小寫兩項獨立以 NOT_PROJECT_ROOT 失敗，重現原遠端 CI 根因。
- 最小修復後：18/18 通過，包含新端 main、舊端凍結、Windows 大小寫與 junction、dirty、帳號、Node、子目錄及 CLI 退出碼。
- 獨立只讀審查：工具、測試與 CI 未發現功能性缺陷；固定手冊、設計與計畫已補對話附加工作區／聯結／dirty／ignored／queue 防護。已排除本輪受保護工作區的 queued 排程。原始證據缺口仍為未解項，不能標示無損完成。
- Node 22.23.3／npm 10.9.9 的全新隔離候選：依鎖檔離線安裝、assets:ci 校驗 3 張發布 PNG，完整 npm run verify 退出 0。244 個測試檔／3493 項測試通過，資料契約另 13 檔／101 項通過；runtime-network、套件體積、素材、manifest、data:check 及只讀 generate:check 均通過。
- 最終文檔更新後 format:check 與 lint 再次通過；全候選正式文件與隔離副本逐檔 SHA256 相同。三份歷史 Markdown 的 Git checkout 換行差異只在隔離副本對齊，未修改原工作區的無關文檔。
- 主目錄之外 10 個初始 dirty 工作區的 HEAD 與完整狀態清單逐項與盤點相同；原有主目錄維護手冊路徑修訂仍保留。
- 原基線遠端 Verify run 42764710987 為 failure；本輪尚無已提交候選的精確 SHA 遠端 CI。真機／真雲／發布不在本輪驗證範圍。

## 歸檔副作用與尚未恢復的證據

本輪先對 17 個可清理工作區做了逐檔備份，再使用 Git 移除，這批 ignored 資料均可由 manifest 與物件恢復。`restore-worktree.ps1` 已實際重建 phase-4-shared-components 的代碼與 26 個 ignored 文件，雜湊與乾淨狀態均通過，臨時恢復目錄已移除。

其後歸檔 Codex 對話時，App 自動排程歸檔所屬 worktree；本輪漏查此副作用，造成未列入 Git 清理清單的舊首頁候選工作區被移除。已取消該對話歸檔，App 恢復源碼為 detached `27e3762`；原分支與 Git bundle 也仍保留，但 App 沒有恢復 ignored 資料。

截至本輪，該候選原 `artifacts/miniprogram-review/` 下四份 2026-11-09 頁面報告與原始截圖尚未找回；staging 原始集合也未能證明完整恢復。不能聲稱此工作區已完整恢復。四份原目錄為 `2026-11-09T031323409Z-swww8x`、`2026-11-09T031610365Z-2cvcvm`、`2026-11-09T032242313Z-3aebbe`、`2026-11-09T032703249Z-ol1khx`。已從原對話救援 10 張 149×321 縮圖，另存本機證據目錄的 rescued-popup-previews，manifest 記錄來源行號、尺寸與 SHA256；這些是對話預覽副本，不能代替原始解析度截圖或完整 report.html。原對話 visualization 的 12 個設計預覽與素材文件仍在。固定舊入口的 `artifacts/miniprogram-review/old-migration-popup-2.5.4/` 仍保存 delivery、release-target 與 upload-result 收據，不能以收據代替缺失的頁面截圖。

審查另發現三個受保護 dirty 工作區有自動歸檔排程，已透過公開工具取消對應對話歸檔，三項排程已消失。這些工作區、HEAD 與未提交內容仍保留。舊首頁候選對話及上述三個對話暫保持可見，本輪實際歸檔 7 個對話。

同一時段主工程 node_modules 曾變空；尚無足夠證據把它與同一機制確立因果。已使用原鎖檔及 Node 22 執行 `npm ci --offline --no-audit --no-fund` 恢復 222 個套件，沒有依賴版本變更。後續完整驗證使用獨立鎖檔安裝的隔離候選。

## 本輪提交文件（14 個）

- `.github/workflows/verify.yml`
- `AGENTS.md`
- `README.md`
- `docs/development/current-state.md`
- `docs/development/dual-app-maintenance.md`
- `docs/development/backlog.md`
- `docs/development/2026-11-12-repository-closeout.md`
- `docs/superpowers/plans/2026-11-12-new-main-closeout.md`
- `docs/superpowers/specs/2026-11-12-new-main-closeout-design.md`
- `tests/release/check-target.test.ts`
- `tools/release/check-target.ts`
- `docs/audits/2026-11-12-unmerged-branch-reconciliation.md`
- `cloudfunctions/fleet-config/fleet-config-repository.js`
- `tests/fleet-config/fleet-config-repository.test.ts`

擬用 message：`chore: 統一新端主線並封存舊端流程`。提交後計畫將新端既有 7 個提交及本輪候選經 PR 整合回 main；CI 通過後才執行清單中的遠端分支清理。

## 本機證據與恢復

證據目錄：`artifacts/miniprogram-review/repository-closeout-20261112/`（ignored，本機保存）。包含 Git bundle、初始盤點、分支與 worktree 處置 JSON、原文檔備份、對話處置、紅綠測試日誌，以及 `worktree-backup-manifest.private.json` 與 `worktree-backups.private/objects/`。私有輸入不加入 Git 或公開附件。

Git 歷史備份已執行 git bundle verify，確認為完整歷史。恢復分支前先以 git bundle list-heads 核對原 ref 與 SHA，再 fetch 到新的恢復分支；不要直接覆寫 main 或現有分支。

恢復已移除工作區可在本機執行 `restore-worktree.ps1`，明確提供原工作區路徑及全新的目標目錄。腳本先建立 detached 工作區，再依 manifest 恢復 ignored 文件並核對 SHA256；依賴需在 Node 22 下以鎖檔 npm ci 重建。原路徑若需恢復目錄聯結另行核對，不能用已有主目錄作恢復目標。

## 歷史核對續作完整驗證

Node 22.23.3／npm 10.9.9 全新隔離候選 npm run verify 退出0：244檔3501測試，資料契約另13檔101項；精確集合碼修復已獨立複核。原候選3493測試屬前一階段證據，本次增加8個正反例。無雲端部署、微信上傳或真機操作。PR與main的精確SHA遠端結果另保存於本機整合交付記錄並在GitHub檢查頁可查。
