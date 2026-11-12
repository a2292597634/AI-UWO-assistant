# 開發現況與證據入口

## 新端主線（2026-11-12）

使用者確認新端已上線，舊端停止更新。保留原 GitHub 倉庫，新端成為唯一開發目標；固定入口 `E:\AI-UWO-new`，AppID `wxd0bc7afdc9cd334a`。共享舊雲資源繼續保留。實際整合版本見 [main 提交](https://github.com/a2292597634/AI-UWO-assistant/commits/main)，精確 SHA 的驗證見 [main Verify](https://github.com/a2292597634/AI-UWO-assistant/actions/workflows/verify.yml?query=branch%3Amain)。下表保留本輪整合前基線與來源，不把舊 SHA 當作之後的最新 main。

| 項目         | 當前可確認狀態                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------- |
| 新端代碼基線 | `006024d0ce472a79abb250a99e02a8e2e9baa881`，以 baseline/new-end-0.2.2-006024d 標籤保留              |
| main         | `e5765d09cf7bfde2aad1064dacc4770b26e48471`，為本輪整合前的 main；實際進度以遠端入口為準             |
| 工作分支     | `codex/phase-20261112-new-main-closeout`，準備流程與發布工具調整                                    |
| 新端微信版本 | 0.2.2 上傳收據對應新端基線；使用者回報已上線，本輪未重新查正式版本與發布時間                        |
| 舊端快照     | `27e3762` 是 2.5.4 體驗版候選；原任務最後確認正式版為 2.5.3                                         |
| 歷史遠端 CI  | 新端基線 Verify run 42764710987 失敗；5 項發布目錄測試出現 NOT_PROJECT_ROOT，不以舊 CI 銷項         |
| 本輪驗證     | 以 [收尾記錄](2026-11-12-repository-closeout.md) 的實際結果為準；未提交候選沒有本輪精確 SHA 遠端 CI |

本輪不改業務頁面、共享 runtime、master 或 generated；歷史核對後補回 fleet-config repository 精確錯誤碼與測試來源，不部署雲函數或上傳小程序。新端整合 main 後，日常從 main 建短期分支，PR 統一回 main。候選發布工具只接受 main 的乾淨新端，old 固定凍結。

當前入口：[維護與封存手冊](dual-app-maintenance.md)、[收尾與恢復記錄](2026-11-12-repository-closeout.md)、[待辦清單](backlog.md)。下方保留較早流程實施與驗收限制，不把歷史未測項改成通過。

## 歷史流程能力與驗收（2026-10-05）

更新：2026-10-05。實施基線 `79e778c4a69ad2a66d07e86f93023efde36a1b82`；實施分支 `codex/phase-57-development-workflow-improvement`。使用者已明確授權「提交合併推送」，實際集成版本見 [main 提交紀錄](https://github.com/a2292597634/AI-UWO-assistant/commits/main)，遠端驗證見 [main 的 Verify](https://github.com/a2292597634/AI-UWO-assistant/actions/workflows/verify.yml?query=branch%3Amain)。下文保留實施時的候選來源與驗收證據。原規劃工作區的五份文檔與個人配置保留。

支援 Node `>=22 <23`、npm `>=10`。本輪使用現有 Node 22.23.3／npm 10.9.9，僅調整執行命令的 PATH。最高規則見 [AGENTS](../../AGENTS.md)，日常任務用 [任務記錄](task-record-template.md)，歷史錯誤契約見 [操作索引](operation-contracts.md)。

## 已實施的流程接口

| 入口                                 | 判定與副作用                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `workflow:preflight`                 | repository 靜態環境／輸入檢查；不下載、不寫檔、不安裝、不修復                    |
| `workflow:preflight -- --scope page` | 加公共／私有基礎庫及 CLI 診斷；SDK、頁面、元素實測仍未執行                       |
| `generate:check`                     | 在兩個自建暫存根生成，先比較確定性，再比較候選；不讀 Git index、不替換候選       |
| `data:generate`                      | 正式產物的交易式寫回與失敗回復，使用既有輸出 registry                            |
| `assets:ci`                          | 只在乾淨隔離副本準備三張發布 PNG，依 manifest 校驗；已有不同 bytes 時拒絕覆寫    |
| `format`／`format:check`             | 前者會寫回，後者只讀；僅對本輪文件定向格式化                                     |
| 頁面報告 schema 2                    | 每張截圖來源、fixture、實測環境；同條件比較允許不同 commit，未知身份降為歷史參考 |
| `ReviewChecks`                       | page／repository／external；未跑為 not-run，final 門禁結束後才寫主報告           |
| `waitUntil`                          | 有界 exists／text／page 條件；連續兩次成立，掛起探測沿用整批最多兩次恢復         |

生成檢查失敗分類：`GENERATED_OUTPUT_DRIFT`、`GENERATION_NONDETERMINISTIC`、`GENERATION_INPUT_CHANGED`、`GENERATION_BUILD_FAILED`。檢查前後指紋無法證明中途改動又恢復的情況；使用固定隔離候選，不宣稱 hermetic build。第一版正式生成檢查從專案根 cwd 執行。

## 資料與網路現況

本地資料查詢使用生成產物；配置、維護、回報及兌換等既有功能有受控 CloudBase 通道，圖片使用發布 manifest 綁定的 CDN。例外只由 [網路掃描器](../../tools/quality/check-runtime-network.ts) 的精確檔案／API／origin／prefix 定義，不允許任意頁面新增 callFunction 或遠端 URL。

`import:run` 只產生 `artifacts/import-candidates/officers` 候選。必須審核採納後才維護 master；`pipeline:full` 不會自動採納，後續素材及生成仍使用現有 master。archive 是只讀快照，全部人工資料仍只在 master。

## 本輪驗證與限制

A1–B3 已實施並通過相關紅綠測試、完整門禁及正式模擬器場景；C1–C3 的規範、索引及試運行記錄見 [本輪交付](../audits/2026-10-05-development-workflow-implementation.md)、[契約覆蓋](../audits/2026-10-05-workflow-contract-coverage.md)、[試運行](../audits/2026-10-05-workflow-pilot.md)。最終候選身份、命令退出碼和日誌以交付記錄為準。

頁面已實測 SDK 3.17.0、390×753 視窗；doctor 只證明配置／CLI 邊界。2026-10-05 使用者按對照報告的五項人工核驗清單回覆「正常」，本輪 HTML 展示、圖片放大／關閉、折疊、歷史連結及分層結果表達已確認通過。內建瀏覽器拒絕 file 協議的原始工具阻塞仍保留；人工確認不宣稱自動化瀏覽器通過。

實施階段已通過乾淨基線套入候選的本機驗證；提交前尚無該候選的遠端 Actions 結果，不能借用舊 CI 成功。使用者其後授權提交／合併／推送，集成的遠端結果以本次 Git SHA 對應的 Verify 為準，與本機證據分開。發布和部署不在本次授權範圍。

## 保留的外部隊列

沿用 [R01–R26 修復記錄](../superpowers/plans/2026-10-01-review-repair-plan.md)、[收尾隊列](../superpowers/plans/2026-10-03-closeout-validation-followup.md) 與 [2026-10-04 收尾證據](../audits/2026-10-04-closeout-validation.md)。不覆寫歷史 failed／blocked。

長列表 510 原生行、其他專項 before／after、320／375／393／430px 與公共 3.7.0、iOS／Android、QR／上傳包、真 CloudBase ACL／並發／草稿、求解器性能／數值及資料語義尚未完成。資料 warning 由完整 findings 重算，本輪保留 `auditStatus=unverified`；沒有來源證據不猜 kind。
