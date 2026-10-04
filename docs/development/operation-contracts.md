# 操作契約與回歸索引

核對日期：2026-10-05；基線 79e778c。依據 [R01–R26](../superpowers/plans/2026-10-01-review-repair-plan.md)，當次執行結果見 [覆蓋記錄](../audits/2026-10-05-workflow-contract-coverage.md)。以下是既有行為的索引，本輪沒有重做業務修復或抽取 fleet controller。

## 四類契約

| 維度／契約               | 操作對象與前置狀態                                                   | 允許結果                                                              | 失敗／取消／卸載結果                                                                         | 獨立依據與現有測試                                                                                                                                                                                  | 未覆蓋項                              |
| ------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 對象：衝突授權           | active A，分類 L 發生 CAS conflict；force 只能來自同配置 update 快照 | 分類只刷新 L 清單；合法 update 的 configId、expectedVersion、快照一致 | 非 update 不寫 A；編輯、切換、取消、unload 使舊授權失效                                      | R01；[戰鬥測試](../../tests/pages/fleet-page.test.ts)「配置衝突綁定操作與對象」斷言 writes 為 0／A bytes 相同及合法寫入參數；[冒險測試](../../tests/pages/adventure-fleet-page.test.ts)同清單       | 真雲 CAS／並發及跨 instance           |
| 對象：兌換結果           | 發起玩家身份和輸入快照，提交尚未完成                                 | 結果綁發起玩家；已知失敗保留 code                                     | 提交中不能切換／改輸入；玩家變更清結果；遲到回覆／unload 不 setData；unknown 不重試          | R10／R21／R23；[coupon 測試](../../tests/pages/coupon-redemption-page.test.ts)「兌換結果與發起玩家綁定」，實際頁面狀態及請求次數斷言                                                                | 官方真兌換未執行                      |
| 範圍：正式全量資料       | official＋custom 合併集合，嚴格 Schema／外鍵／唯一性                 | 校驗所有 records、counts、技能和解鎖等級                              | 非法輸入精確定位；未知映射保留 warning                                                       | R15／R18；[master 契約](../../tests/data-contract/master-dataset.test.ts)、[load-officers 回歸](../../tests/data-pipeline/load-officers.test.ts)，覆蓋兩集合讀取及重複來源                          | group／category 獨立來源逐關係複核    |
| 範圍：維護回復           | 工單核准，master 與所有生成集合有既有 bytes／缺失狀態                | 工具只寫目標來源；custom 更新仍產生合併 reference                     | 任一 gate 失敗，master／registry 全部產物／缺失狀態／staging 回復；人工頁面不變              | R17／R26；[同步測試](../../tests/tools/sync-maintenance-work-orders.test.ts)「正式預設生成回復範圍」和「自訂主資料來源文件寫回」，逐路徑 SHA 及缺檔斷言                                             | 真發布鏈路、ACL 未驗證                |
| 範圍：頁面 final         | 所有頁面變更／路由都必須命中保存場景                                 | 場景、after 圖及必需 repository gate 都完成才通過                     | 任一 unmatched 文件／路由阻塞；failed／blocked／not-run 不互換                               | R20；[trigger](../../tests/miniprogram-review/trigger.test.ts)、[CLI](../../tests/miniprogram-review/cli.test.ts)、[report](../../tests/miniprogram-review/report.test.ts) 的混合覆蓋及分層故障回歸 | 外部設備／QR 不能由頁面工具推斷       |
| 時間：登入／列表／載入   | 等待期間可能有新編輯、較新重試或選取                                 | 最後意圖生效；登入列表只更新清單，保留新草稿                          | 舊回覆不得發起載入、覆寫草稿；卸載後不開命名窗或更新頁面                                     | R02／R03；兩個 fleet 頁面的「登入延續與重試保護草稿回歸」「配置列表与重試亂序回歸」，deferred 回覆先 B 後 A，assert activeConfigId=B                                                                | 原生退出／真機草稿恢復                |
| 時間：保存／放棄／重試   | 有保存基線及 dirty 編輯，載入／刪除可能失敗                          | 保存採服務端 fleetState 新基線；放棄先完整還原再執行目標              | 取消保留草稿；還原失敗保留守衛和 pending；服務失敗仍為已還原畫面；重試原配置而非 active 猜測 | R03–R06；兩個 fleet「放棄修改先還原保存基線」「保存後列表刷新仍保護新草稿」，實測 mode、targets、pending、dirty、提案狀態                                                                           | 原生卸載草稿及性能                    |
| 時間：UI／工具探測       | tap 返回後渲染可能尚未完成，RPC 可能掛起                             | waitUntil 連續兩次條件成立再保留斷言                                  | 正常 false 到期是頁面失敗；未完成 probe 是協議逾時，沿用整批最多 2 次恢復；錯誤不當成不存在  | [wait-condition](../../tests/miniprogram-review/wait-condition.test.ts)、[runner](../../tests/miniprogram-review/runner.test.ts)、CLI；正式技能場景見試運行                                         | path 到位不等於動畫完成；其他設備待驗 |
| 獨立依據：拒絕來源       | rejected chasT051 沒有合法城市來源                                   | 在寫候選之前拒絕，不能用自建字典合法化                                | 舊候選與正式資料 bytes／成员保留                                                             | R19；[run-import](../../tests/import/run-import.test.ts)「未決來源值在寫入前失敗，舊候選完整保留」真 pipeline 編排                                                                                  | 採納仍須人工來源審核                  |
| 獨立依據：Lv.1 省略      | 明確把每個 relation.level 設為 1 的合成 officer                      | catalog skillLevels 省略                                              | 不以原 fixture 恰好含非 1 數值代替省略斷言                                                   | R24；[build-runtime-data](../../tests/data-pipeline/build-runtime-data.test.ts)斷言唯一 officer ID 及 skillLevels undefined                                                                         | 產品語義仍依技能專題規範              |
| 獨立依據：Range fallback | 拼接後仍是破損 JSON 的來源片段                                       | fallback 恢復缺口兩側完整鍵和逸出／Unicode                            | 截斷值不恢復；先斷言整體 JSON.parse 必須拋錯                                                 | R25；[parse-languages](../../tests/import/parse-languages.test.ts)兩個破損片段用例，非雲端分頁契約                                                                                                  | 未取樣來源的其他破損形式              |

## 兩個 fleet 的共同核對清單

| 操作 | 已讀取的實際斷言                                                          |
| ---- | ------------------------------------------------------------------------- |
| 登入 | 等待新編輯後 mode=manual、unsaved、activeConfigId=null，不呼叫 loadConfig |
| 載入 | 第二次選 B 先回覆，A 遲到後 activeConfigId 仍為 B                         |
| 編輯 | 衝突後新編輯，使 force 授權無效；保存等待清單也不覆寫新草稿               |
| 保存 | 返回的服務端 fleetState 成為新基準，已保存狀態和後續 dirty 比較一致       |
| 放棄 | 完整還原 targets／mode／提案；還原失敗保持守衛、pending 和草稿            |
| 衝突 | 分類 L 不 force 寫 A；只有同對象 update 快照可 force                      |
| 重試 | 原載入配置失敗多次，第三次仍重試原 ID；取消守衛不載入                     |
| 卸載 | deferred 列表／確認回覆不再開命名窗、載入或更新頁面                       |

兩套頁面已有上述回歸，本輪不新增鏡像測試。共同 controller 重構另立設計與授權範圍。

## Warning 處置

[當次完整關係清單與分組](../audits/2026-10-05-workflow-contract-coverage.md)以 `(code, entityId, path)` 比較本輪開始的受保護資料。每筆保存 officer／skill ID、原 group／category／kind、獨立來源、核對狀態及理由。來源缺失保持 warning；禁止由名稱猜測 kind，禁止把 auditStatus 改成 confirmed。若另有批准修正，走 master → data:check → 工具生成 → 完整門禁。
