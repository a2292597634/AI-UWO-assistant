# 歷史未整合分支逐項核對

日期：2026-11-12。對照新端基線 006024d 與 main e5765d0。使用者在看過提交範圍、驗證及 message 後要求「好好核對完繼續幹」，本輪繼續主線整合，不重複詢問既有授權。

## 判定方法

精讀歷史提交相對 parent 的 diff，再逐項對照現碼與測試；Git 祖先或 patch-id 不匹配不能直接證明功能缺失。由兩個獨立只讀審查分別檢查配置原子性／契約與早期 demo／Review 修復，主代理確認疑點並統一執行測試。

## 結論

| 歷史提交／分支                                    | 現碼與測試證據                                                                                                                                                           | 處置                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 93d2bb2／phase-2-demo                             | 舊 data/*.js、detail 單頁、demo 素材及 rebuild-demo-data 已由 generated、分包詳情及正式素材流水線取代；現查詢與詳情入口持續存在                                          | 早期原型，封存，不恢復舊目錄或資料源                                                                               |
| bbc633d／phase-3-fleet-config-create-constraints  | fleet-config-repository 的 owner 鎖、insertWithConstraints、renameIfVersionAndNameAvailable；service 的 create／saveAs；repository/service 測試                          | 已涵蓋。現交易改用 owner 輕量索引，避免交易內 where；每 owner 20 套明確替換為戰鬥／冒險各 10 套，同 scope 名稱唯一 |
| 2f2a67d／phase-4-fleet-config-contract-validation | contracts/fleet-config.ts 的 state/envelope 驗證、runtime/fleet-config-service.ts 的回應驗證、server validateState 與固定安全 network error；contract/error/runtime 測試 | 已涵蓋。合法 Lv.0、冒險 30 目標、共享客戶端及 scope 是後續明確規則，不倒退恢復舊限制                               |
| 8688e13／phase-7-adventure-save-limit             | 現兩頁 checkUnsavedAndProceed 與 config-bar 流程、現 presenter/runtime 驗證；職業篩選移除另有 2026-09-07 產品決策                                                        | 配置自訂操作保護已有實作；原生返回未保存保護沒有現行等效入口，列下方獨立頁面待辦，不整分支合併                     |
| 5896db4／phase-7-adventure-save-limit             | fleet-config-repository 的 isCollectionAlreadyExistsError 僅保留兩碼、優先單一欄位；舊碼曾包含 ResourceUnavailable.ResourceExist 且任一欄位命中                          | 真缺口：本輪以最小修復補回三個精確碼、code／errCode 任一命中；不吞未知／權限錯誤，不部署雲函數                     |

## 本輪修復與紅綠證據

新增 8 個 repository 測試：5 個正例涵蓋 ResourceUnavailable.ResourceExist 的兩欄位位置，以及另一欄位為未知碼但 errCode 命中；3 個反例涵蓋權限錯誤、單純數值 -1／文字 already exists、近似未知碼。

- 修復前：5 failed、16 passed，精確重現遺漏。
- 最小修復後：21/21 passed。
- 修改前的配置／runtime／兩頁流程／presenter／發布相關實際匹配測試：8 檔364項通過。命令中另指定的 fleet-config-preflight 工具測試目前不存在，不能列作已跑。
- 本機 fake repository 測試不等於 CloudBase 真交易、正式部署或 SDK驗收。雲函數來源會隨 Git 整合，線上部署不在本輪操作範圍。

## 保留的獨立後續事項

1. 原生返回未保存保護：歷史8688e13曾使用 enableAlertBeforeUnload／disableAlertBeforeUnload；現戰鬥／冒險頁面未見此類入口，現自訂操作保護不覆蓋微信原生返回。需另按 Design Foundation 與 HTML 頁面驗收規範設計、補測試及真機驗證；本輪不夾帶頁面行為修改。
2. 歷史 tools/cloudbase/fleet-config-preflight.ts 與對應測試已不在現目錄；不能把未執行的診斷當已通過。獨立審查未找到現行同等 ACL／索引／invalidDocumentCount／部署 metadata 脫敏摘要替代，屬維護工具缺口。另開維護任務恢復或重設計，不能把本地 workflow preflight 當作等效診斷，也不能直接搬回舊檔。
3. 歷史日期顯示不是當前缺口：runtime 已拒絕不可解析時間，現 config-bar 列表不顯示日期；不用的舊 modal 不能作恢復舊 UI 的理由。

配置上限命中後覆蓋／刪除／新建各路徑仍可用，但目前缺少該組合序列的專門回歸測試，亦列後續測試待辦。

其餘歷史修復分支經 git cherry 確認有等效補丁者不重複合併。舊端免廣告與遷移彈窗留在封存基線；新端主線採已有新舊共享身分相容實作，不整包採納舊端 cloudfunctions。

## 主線整合範圍

整合新端既有7個提交、原收尾候選11個文件、本核對報告、repository來源與回歸測試，共14個本輪變更文件。原擬message維持 chore: 統一新端主線並封存舊端流程。先完成相關檢查與完整隔離門禁，再提交／PR；以遠端精確SHA CI通過後才清理已備份舊分支。缺失原始報告／截圖的風險沿用收尾記錄，不因本次核對銷項。

## 歷史核對續作完整驗證

Node 22.23.3／npm 10.9.9 全新隔離候選 npm run verify 退出0：244檔3501測試，資料契約另13檔101項；精確集合碼修復已獨立複核。原候選3493測試屬前一階段證據，本次增加8個正反例。無雲端部署、微信上傳或真機操作。PR與main的精確SHA遠端結果另保存於本機整合交付記錄並在GitHub檢查頁可查。
