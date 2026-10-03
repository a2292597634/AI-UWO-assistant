# 全專案審查修復銷項記錄

更新日期：2026-10-03。範圍：2026-10-01 審查的 R01–R26，共 26 項確定缺陷、19 個實施任務。

## 當前結論

**26 項程式修復及正式邏輯回歸已完成銷項；整批 UI、設備及上線驗收未全部完成。** 修復提交為 `4ac55f98415445f6d225b53db174a3743ff1fda3`，已存在於本地 `main`、`origin/main` 和 `codex/phase-50-review-repair`。本輪核對現有修復，不重複實施，也沒有新增提交或部署。

**本輪收尾已將 `E:/AI UWO assistant` 同步到修復提交 `4ac55f9`，目前分支為 `codex/phase-51-review-closeout`。** 切換前七份未追蹤計劃已逐檔備份及 SHA-256 校驗，切換後完整還原；本機 `.codex/config.toml` 的既有修改保持原 hash。原 `codex/phase-0-review-repair-plan` 分支保留。修復取證工作樹及歷史 UI 證據仍位於 `C:/Users/XB/.codex/worktrees/phase-50-review-repair/AI UWO assistant`，沒有清理或刪除。此前只查看舊目錄造成的「尚未實施」結論已更正。

本輪以 Node 22.23.3 在完整隔離副本重跑 `npm run verify`，退出碼 0：179 個測試文件／2443 項測試，資料契約另 12 個文件／100 項測試；格式、lint、型別、網路邊界、包大小、素材、master 和生成一致性全部通過。修復工作樹 937 個追蹤文件（排除使用者本機配置）與驗證副本 SHA-256 完全一致；`git diff --check` 通過。

獨立代理已逐項交叉核對產碼、正式回歸與既有複核，未發現原缺陷仍存在的阻斷項。這是定向銷項複核，不是新的全專案審查。

## 26 項程式銷項表

下表「完成」僅指原缺陷的程式修復與正式回歸。UI 限制和獨立風險見後兩節，不計入已通過的設備或上線驗收。

| 問題 | 任務   | 已完成的修復                                              | 正式回歸入口                                              | 程式銷項 |
| ---- | ------ | --------------------------------------------------------- | --------------------------------------------------------- | -------- |
| R01  | A1     | 衝突綁定操作、配置與快照；非更新不得 force 覆蓋           | `fleet-config-conflict.test.ts`、兩艦隊 Page、service CAS | 完成     |
| R02  | A2     | 登入等待列表後重新核對操作版本與草稿                      | 兩艦隊 Page deferred 空／非空列表                         | 完成     |
| R03  | A2     | 重試載入經未保存守衛，保留原載入目標                      | 兩艦隊 Page 取消／保存／放棄／重試                        | 完成     |
| R04  | A3     | 依 scope 還原冒險 28／30 個目標，戰鬥上限獨立             | `fleet-config-contract.test.ts`、冒險 Page                | 完成     |
| R05  | A3     | 放棄先還原基線；失敗後 dirty、畫面與守衛一致              | 兩艦隊 Page load／delete 失敗與解析失敗                   | 完成     |
| R06  | A4     | Lv.0 不進 solver；全零禁用、混合正數可重算                | battle domain／presenter／Page                            | 完成     |
| R07  | B4     | 技能詳情收起 picker，關閉後恢復原選擇狀態                 | adventure Page 搜尋／選取／詳情／卸載                     | 完成     |
| R08  | C2     | 展示原始與歷次補充的文字、網址和全部圖片                  | error-report presenter／review Page                       | 完成     |
| R09  | C1     | 最後選取的篩選主導列表，舊 success／error 不覆寫          | review Page deferred、重試、卸載                          | 完成     |
| R10  | D1     | 提交鎖定玩家身份，遲到結果與原請求綁定                    | coupon Page 身份切換、double tap、卸載                    | 完成     |
| R11  | C3     | 文字／網址／截圖任一非空即可補充                          | work-orders Page 與 server 負例                           | 完成     |
| R12  | B1     | 圖片錯誤只更新局部 boolean，630 列 patch 為 36 bytes      | catalog Page 630 列、非法／重複事件                       | 完成     |
| R13  | B2     | hide／unload 清分鐘 timer，舊 callback 不再排程           | major-event Page fake timer                               | 完成     |
| R14  | B3     | 技能按 kind 計數與持有者，全部使用聯集                    | catalog presenter／Page 合成混合 kind                     | 完成     |
| R15  | E1     | 合併 master 的 Schema、引用、唯一性、映射和 counts 進門禁 | master-dataset／schema-collections／integrity             | 完成     |
| R16  | E2     | 手動技能不拼 voyage.tw 下載 URL                           | download-assets 完整集合／手動素材回歸                    | 完成     |
| R17  | E3     | 單一生成輸出清單覆蓋 fleet 等產物及失敗回復               | generated-output-paths／同步失敗回滾                      | 完成     |
| R18  | E1／E4 | levelInfo 成為正式契約；完整匯入正例通過                  | Schema 正反例、run-import 編排                            | 完成     |
| R19  | E4     | 明確拒絕的 chasT051 不重新建立城市或前置條件              | city-anomaly-disposition／transform／run-import           | 完成     |
| R20  | F1     | 逐文件及路由覆蓋，混合缺口仍阻塞；fixture 安全隔離        | trigger／config／CLI／report／fixtures                    | 完成     |
| R21  | D1     | 已知官方錯誤保留 code，顯示兌換失敗                       | coupon runtime／presenter／Page                           | 完成     |
| R22  | C3     | needsInfo 再次要求補充，server／domain／UI 一致           | domain／Page／server admin、revision、CAS                 | 完成     |
| R23  | D1     | 結果未知提示先官方確認，沒有自動重試                      | coupon runtime／presenter／Page unknown                   | 完成     |
| R24  | F2     | 明確全 Lv.1 fixture，無條件斷言省略 skillLevels           | build-runtime-data；變異紅燈及還原綠燈                    | 完成     |
| R25  | F2     | Range 測試確實不可整體解析，保留兩側完整鍵                | parse-languages；變異紅燈及還原綠燈                       | 完成     |
| R26  | E5     | 合併讀取、按 official／custom 歸屬寫回及回滾              | sync-maintenance／reference／load-officers                | 完成     |

## 驗收追蹤

| 編號  | 剩餘驗收                                           | 當前證據／狀態                                                                                                         | 完成條件                                                                                       |
| ----- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| QA-01 | 整批 UI final                                      | 本輪 final 仍 blocked：冒險技能選擇器第 4 步發生 `wechatide element query timeout`，兩次恢復後仍無法完成；後續場景未驗 | 所有受影響場景通過、讀取 HTML 與修改後截圖；不能以局部場景代替整批                             |
| QA-02 | C3 可信同狀態 before                               | 本輪修復後離線閉環通過，四張截圖；原 HEAD 基線被 `cant find runtimeid by projectpath` 阻塞，沒有截圖                   | 原基線窗口完成編譯，核對執行中程式身份後取得同流程 before                                      |
| QA-03 | 630 列原生畫面回退                                 | 630 列正式回歸通過；300 列真 image error／回退／滾動通過；630 列 data／render 分界原因未定                             | 同庫、同資料逐批記錄原 HEAD／修復版實際 render count，再驗圖片 error；不可把 300 列圖當 630 列 |
| QA-04 | 專項同狀態基線與系統確認                           | A1 update、A3 失敗完成狀態、A4 mixed、C1 每狀態 before 仍有限制；A1 二次確認含固定 mock                                | 取得可信對照，真系統確認另以設備流程驗證                                                       |
| QA-05 | 四寬度、public 3.7.0、兩平台真機、長圖／QR、編譯包 | 現有模擬器與本地包門禁不能代替                                                                                         | 320／375／393／430px 圖片、實際 SDK 版本、iOS／Android 實測、QR 掃描、微信編譯包輸出           |

## 獨立風險及資料複核

下列已有本地調查結果；不能以文檔更新或 26 項修復完成將它們關閉，也不混入本次修復範圍。

- V1：跨 owner 的檔案參照、同毫秒多 instance 命名碰撞仍需附件歸屬策略與真 CloudBase ACL 驗證。
- V2：原生返回／退出／進程終止沒有真機證據；是否新增原生離開保護或本地草稿需獨立決策。
- V3：服務端接受 50001 字、同批 25 次回報；coupon 節流不跨 instance 共享。文字／筆數／補充次數及共享節流政策待定。
- V4：合法最大資料樣本本地 solver 探針完成；純 solver 接受小數的邊界需獨立處理，桌面耗時不代表真機最差耗時。
- V5／V6：最終設備、基礎庫、編譯包及長列表橋接驗收按 QA 表續作。
- master 機械校驗為 0 errors，但 5254 筆 group／category 關係缺少精確映射證據，保留 warnings；不等同逐筆資料已人工確認。明細見修復提交中的 `docs/data-audit/2026-10-02-review-repair-master.md`。

## 證據位置

以下路徑均位於修復工作樹，既有圖片來源及歷史 failed／blocked 報告保持原樣。

- 完整門禁：`.superpowers/sdd/2026-10-01-review-repair-plan/closeout-verify-20261003.log`。
- 本輪獨立複核：`.superpowers/sdd/2026-10-01-review-repair-plan/closeout-audit-20261003.md`。
- C3 本輪修復後：[HTML 報告](<C:/Users/XB/.codex/worktrees/phase-50-review-repair/AI UWO assistant/artifacts/miniprogram-review/2026-10-03T011116799Z-7g7pb0/report.html>)，status `passed`；只代表目前模擬器的該場景。
- C3 原 HEAD 嘗試：[阻塞報告](<C:/Users/XB/.codex/worktrees/phase-50-review-repair/AI UWO assistant/artifacts/miniprogram-review/2026-10-03T011342775Z-jy9zyp/report.html>)，未取得 before，不能當修改前截圖。
- 本輪整批 final：[HTML 報告](<C:/Users/XB/.codex/worktrees/phase-50-review-repair/AI UWO assistant/artifacts/miniprogram-review/2026-10-03T011637689Z-ighcgi/report.html>)，退出碼 1、status `blocked`；無未匹配文件或路由，元件查詢逾時，兩次恢復用盡。固定底層 mock 全部成功還原，記憶體 storageWrites 為 0，未改真雲或真儲存。保留失敗現場圖，沒有把舊 SDK 專項通過圖用作本輪 final 通過。
- 歷史彙整：[HTML 報告](<C:/Users/XB/.codex/worktrees/phase-50-review-repair/AI UWO assistant/artifacts/miniprogram-review/review-repair-20261002-final/report.html>)，32 個結果、147 張唯一圖；248 次圖片引用、缺圖 0、越界 0、來源 hash 不符 0，總狀態仍 `blocked`。

本輪收尾同步現有修復提交、更新銷項文檔並整理交付；沒有新增產品修復、依賴、真雲操作或部署。使用者本機配置保持原樣，沒有清理其他工作樹。文檔提交仍按 AGENTS 第 3 節等待使用者確認。

## 本輪收尾驗證與提交候選

- `E:/AI UWO assistant/.superpowers/closeout-20261003/final-verify.log`：包含八份銷項文檔的完整隔離副本，Node 22.23.3 執行 `npm run verify` 退出 0；2443＋100 項測試和全部門禁通過。文檔同步狀態更新後另跑格式與差異檢查，不把本機配置列入提交。
- `E:/AI UWO assistant/.superpowers/closeout-20261003/adapter-diagnosis.md`：唯讀診斷證實正式 adapter 使用頁級 selector，而成功專項 SDK 使用真元件 scope；scope 是需 A/B 驗證的假說，不宣稱已完成根因實測或已修工具。
- 官方 CLI 對原 HEAD 基線的 `simulator_open_page` 未返回結果，已停止本次呼叫，沒有取得可信 before。E 盤現有 runtime 的 home 可以讀取；舊版 `auto` 啟動後只回 Tool.version、currentPage 逾時，官方 `simulator_refresh` 後仍相同。刷新成功不等同整批驗收通過，未將 SDK 故障換算為頁面 passed。
- 提交候選共八份 Markdown：本文件和七份 `2026-10-01-review-repair-*.md`。程式、生成資料、依賴、使用者 `.codex/config.toml` 均不包含。
- 擬用 message：`docs: 完成審查缺陷銷項並記錄剩餘驗收限制`。
- 本輪沒有 commit、push、部署或删除工作樹。QA-01–QA-05 和獨立風險保持開放，待相應工具／设备／测试环境证据後再關閉；不以收尾文檔宣稱全案已上線驗收。
