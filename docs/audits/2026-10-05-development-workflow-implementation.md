# 開發流程改進實施交付

日期：2026-10-05。範圍 A1–C3；依 [總計畫](../superpowers/plans/2026-10-04-development-workflow-improvement.md) 實施。本記錄保留停止在可審閱狀態時的候選與驗收證據；使用者其後明確授權「提交合併推送」，集成版本與遠端驗證入口見 [開發現況](../development/current-state.md)。沒有部署或改依賴／個人配置。

## 基線與保護

- 原工作區：`E:\AI UWO assistant`；分支 `codex/phase-56-development-workflow-plan`；HEAD `79e778c4a69ad2a66d07e86f93023efde36a1b82`。
- 原狀態：只有使用者既有 `.codex/config.toml` 修改及五份未追蹤規劃文檔。
- 候選：`C:\Users\XB\.codex\worktrees\phase-57-development-workflow\AI UWO assistant`；分支 `codex/phase-57-development-workflow-improvement`。
- 建立時保存 7,241 個原檔 SHA，排除 Git 內部、依賴及其他 worktree；五份規劃文檔和必要 ignored 素材／私有編譯配置共 4,152 個輸入按原路徑複製核對。使用者個人配置只有保護備份，不覆寫候選配置。
- 保護证据：`.superpowers/workflow-20261005/original-protection.json`、`copied-inputs.json`；最後再核對原檔與 Git 狀態：7,241檔mismatches=[]、status及HEAD unchanged；結果在同目錄 `final-original-protection.json`。
- Node：定位現有 22.23.3／npm 10.9.9；PATH 原是 24.14.1，僅在命令中使用 Node 22。不修改持久設定。
- 遠端只讀 `ls-remote --symref origin HEAD` 確認 main／79e778c；本地 origin/HEAD 指向舊 importer 分支，未改 Git 配置或遠端引用。

## 任務台帳

| 任務 | 實際交付                                                                              | 證據／結果                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A1   | 純版本／輸入預檢、page 靜態配置、素材定義純資料抽出；verify 首步接入                  | 新介面缺失紅燈；版本／缺檔／JSON／manifest 結構／已有素材／外部路徑／私有庫／只讀測試通過                                               |
| A2   | 两個自有暫存構建、輸入指紋、完整成员／bytes 比較、四類失敗；候選不寫回                | A-red／A-green；空舊目錄紅綠；真實 37 個產物成员 before／after hash 相同；正常 data:generate 仍通過                                     |
| B1   | schema 2 逐圖來源與實測身份、fixture／場景／截圖鍵基線選取、來源guard／清理           | evidence／iteration／adapter／runner 回歸；實測圖片 comparable／incompatible／historical 三類                                           |
| B2   | page／repository／external，final gate 完成後同 run 寫主報告，blocked 保留 final mode | CLI／報告故障注入：gate fail、throw、not-run；HTML／JSON／Markdown／CLI 一致                                                            |
| B3   | waitUntil 有界 exists／text／page，連續兩次；pending probe 協議逾時，共用兩次恢復     | wait-condition／runner/schema 回歸；正式技能場景19步4圖；原斷言保留                                                                     |
| C1   | AGENTS／CLAUDE／README、current-state、任務模板、唯一 HTML 規範對齊                   | 3 個既有守門檔／6 項通過；定向格式與連結檢查                                                                                            |
| C2   | 對象／範圍／時間／獨立依據索引及 warning 台帳                                         | 已讀實際斷言；9 檔320測試通過；0 errors／5254 warnings／31組；基線tuple差異為0                                                          |
| C3   | 文檔、dirty 工具產物、真實離線 UI＋final 故障注入試運行                               | [試運行](2026-10-05-workflow-pilot.md)、[對照 HTML](../../artifacts/miniprogram-review/workflow-pilot-evidence/report.html)、provenance |

## 接口與計畫核對

- `buildGeneratedOutputs` 只增加 export，正式生成交易式替換／回復未改。
- 預檢引用純素材定義，不載入 sharp；CI 素材常量原接口重新匯出。
- 額外內部接口 `getReviewLaunchRecord`／`ReviewConfig.launchRecord` 用於記錄实际根和同批端點，CLI 不接受任意注入。編譯副本有 executionSha256 及 ts→js mapping；來源／SDK／正式編譯包證據分開。
- tsconfig 目標 ES2020，計畫樣例 `.at(-1)` 改為最後陣列索引，不改依賴或編譯設定。
- report-level 無頁面範圍可為 page=not-run／required=false；`changed final` 無頁面變更仍遵循既有唯一規範返回 blocked，不能假證頁面已验收。
- 不 resolve 的 probe 外層期限可能早於內層 SDK 同為5秒的期限；新增區分「條件仍 false」與「探測尚未回覆」，後者保留協議恢復分類及共享上限。
- 唯讀複核發現來源擷取清理、同鍵不同場景遮蔽、final blocked 模式、pending probe 恢復及 manifest null 結構，共五處；均先跑可觀察的紅測試再最小修正。沒有業務 controller 重構。

## 分層驗證

全部原始日誌在候選 `.superpowers/workflow-20261005/`，失败日誌保留。

| 層               | 本輪已確認                                                                                                                                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A 本機完整門禁   | A-verify.log 退出0；184檔／2506測試；資料契約100；diff --check通過                                                                                                                                                                                                                                                    |
| B 本機完整門禁   | B-final-verify.log 退出0；186檔／2543測試；資料契約100；manifest結構新增18項預檢另通過                                                                                                                                                                                                                                |
| 最終候選         | C-final-delivery-verify.log／final-delivery-diff-check.log 退出0；186檔／2548測試；資料契約100；全部門禁通過                                                                                                                                                                                                          |
| 乾淨基線候選副本 | clean-final-delivery-verify.log／clean-provenance.json：assets:ci、verify、diff --check 全部退出0；186檔／2548測試，資料契約100。功能 SHA 1bab6a0a73e97ee609af4d44df03c89b3885db6088370119cad718d5d72ff3d0，共780檔按SHA一致；從乾淨HEAD套入未提交候選並只補三張manifest PNG，沒有原staging/raw-assets/私有配置假設。 |
| 遠端 CI          | 未推送、未執行；舊 HEAD 的 Actions 成功不代表本候選                                                                                                                                                                                                                                                                   |
| 正式頁面工具     | SDK 3.17.0、DevTools 2.02.2609292、390×753；預設冒險3場景8圖及最終技能19步4圖通過；離線 coupon三次通過                                                                                                                                                                                                                |
| 外部／人工       | 本輪對照報告 HTML 人工核驗已通過；設備／真雲／QR等保持未完成                                                                                                                                                                                                                                                          |

已請求以文件面板打開本輪 HTML，工具返回 queued；內建瀏覽器安全政策拒绝 file 協議，Chrome 連接不可用，未透過其他表面或服務繞過。該工具阻塞保持原紀錄。

2026-10-05 使用者按 [對照報告](../../artifacts/miniprogram-review/workflow-pilot-evidence/report.html) 的五項清單人工核驗後回覆「正常」：展示／截圖、放大與關閉、折疊、歷史連結及分層狀態表達均確認正常。本輪 HTML 人工互動核驗已通過；證據與被確認報告 SHA 在 `.superpowers/workflow-20261005/html-manual-acceptance.json`。瀏覽器名稱／版本未提供，不推斷其他報告、設備或雲端已驗收。

## 失敗及必要輸入處置

三張原 staging PNG 與 manifest bytes 不同，在候選單獨備份後，從既有 CI 副本按 SHA 取得發布 bytes，assets:ci 校驗通過。首次下載 TLS ECONNRESET 保留；没有改 manifest 或回寫原工作區。預檢會拒絕原始 mismatch，是如實診斷而非產品新缺陷。

首次SDK首頁 metadata=null 失敗與 wechatide currentPage timeout 保留日志；後續已通過實際 SDK 元件 scoped 查詢、tap、readText及截圖。沒有猜唯一根因、延長超時或用 handler 注入替代技能互動。

## 剩餘缺口與審閱範圍

保留 [收尾隊列](../superpowers/plans/2026-10-03-closeout-validation-followup.md)：長列表510原生行、其他專項同條件對照、四寬度／公共3.7.0、iOS／Android、QR／微信上傳包、真CloudBase ACL／並發／草稿、solver性能／數值及資料語義。R01–R26沒有重新實施，warning保持unverified。

提交 message：`改進開發流程的只讀驗證與頁面證據`。實施交付時按要求停止在可審閱狀態；使用者其後已授權提交、合併與推送。集成在隔離候選及 main 工作樹進行，原規劃工作區的個人配置與五份未追蹤文檔保持原樣。

最終文檔連結核對：15份變更文檔／68個本地鏈結，缺失0；最後定向格式及diff檢查另保留日誌。功能候選SHA不含交付文檔及ignored個人環境；交付記錄回填後再做文檔門禁，不藉此重複全套測試。

收尾新增兩項 HTML 回歸：未執行徽章使用待驗收樣式；歷史報告只連結報告根內的普通檔案。條件等待重用既有時鐘圖標，長 SHA／來源字串可換行。紅綠日誌為 B-pending-badge-_、B-history-link-_；修正後再次在兩個相同功能候選執行完整門禁，上表引用最後一次結果。
