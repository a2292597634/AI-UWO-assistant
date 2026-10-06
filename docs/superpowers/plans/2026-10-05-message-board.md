# 留言板實施總計畫

> **給執行代理：** 必須使用 `executing-plans` 逐任務順序執行，按子計畫的 checkbox 記錄紅／綠與驗收證據。本對話預設由目前代理執行；未獲使用者要求，不派出子代理。遵循 AGENTS.md，commit／push／部署各自需要當次授權。

**目標：** 完成首頁獨立留言板，首次主動選用微信資料、投稿必選伺服器、管理員審核後公開，並提供本人管理、回覆及資料處置閉環。

**架構：** 專用分包與受控 runtime service；服務端權限、不可變投稿快照、交易去重、持久化安全任務。共用業務核心以可重現部署包供客戶端入口與事件／工作入口使用，避免雲端部署跨目錄 require 失敗。

**技術棧：** TypeScript、原生微信／Glass-Easel、現有 wx-server-sdk@4.0.2、CloudBase、Vitest、既有素材及頁面驗收工具。正式門禁 Node `>=22 <23`、npm `>=10`。

## 全域約束

- 規格以 [留言板設計](../specs/2026-10-05-message-board-design.md) 為準；網路與資料最高約束以執行根的 AGENTS.md 為準。
- 界面使用繁體中文；正式圖標用本地素材，UI 遵循 [Design Foundation](../specs/2026-08-09-design-foundation-design.md)。
- 使用 [頁面验收規格](../specs/2026-09-16-miniprogram-review-html-report-design.md)，頁面證據與真機／真雲分開。
- 第一版數值全部沿用規格：暱稱 1–32、正文／回覆 1–500、原因 1–200 個 code point；PNG／JPEG、256px、64 KiB，base64 87,384 字元，JSON 96 KiB。
- 投稿 60 秒間隔、每日 10 則；有關投稿／資料更新／檢查共用每分鐘 5 次寫入嘗試；檢舉每日 20 次。同操作去重不再扣額。
- 列表批次 20、窗口 100、最多五批候選掃描；重驗 60 秒，後台停止。草稿 7 天、操作自動確認窗口 24 小時、回執 30 天。
- 圖片檢查等待 45 分鐘；API 接收最多三次，重試延遲 1／5 分鐘；private 檢查連結至少 60 分鐘有效。provider pass／review／risky 不混同。
- 私有／公開素材權限不同，只有雲端上傳與刪除；前端僅新增專用 service 的 callFunction 白名單，不新增 uploadFile、downloadFile、CDN 或資料庫 API。
- 不新增／升級根依賴。新函數部署包使用既有版本 SDK 與所需環境／秘密設定，逐項列明後取得相應授權。
- archive 唯讀；伺服器人工資料進 data/master，data:check 後工具生成。不得手改生成物。
- 本計畫本身不授權操作正式雲端、提交、合併、推送或發布。2026-10-06 使用者另行選擇使用現有付費環境測試，依 [同環境測試調整](2026-10-06-message-board-shared-environment.md) 限定專用探測資源；不授權正式業務發布。已明確涵蓋的授權不重複詢問。

## 1. 實際基線與工作區保護

規劃根：`E:\AI UWO assistant`。

| 對象              | 2026-10-05 核對結果                                                                | 執行要求                                 |
| ----------------- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| 目前分支／HEAD    | codex/phase-56-development-workflow-plan／79e778c4a69ad2a66d07e86f93023efde36a1b82 | 只保存計畫，不在此分支疊加業務實作       |
| 本機 main         | 9fb8dec43d6f8bbc3c7ab54ba36c3fb33241f8aa                                           | 執行前重新核對，以最新 main 建立隔離候選 |
| 現有 tracked 修改 | .codex/config.toml、AGENTS.md、CLAUDE.md                                           | 記錄 SHA，不覆蓋、不重設、不夾帶提交     |
| 未追蹤規劃        | 2026-10-04 四份 plans、一份 spec；留言板 spec                                      | 保護全部；不要假定 worktree 自動複製     |
| 可用 Node 22      | C:\Users\XB\.codex\runtimes\uwo-review-node22\node-v22.23.3-win-x64\node.exe       | 再驗版本，不永久修改 PATH                |
| 現有邊界          | 六個 callFunction service，既有 uploadFile／init 例外                              | 規則文字已修正，留言板 service 尚未加入  |

建議分支 `codex/phase-58-message-board`；名稱若已占用，選未占用的 phase 名稱，不重置舊分支。使用 managed worktree 前先核對附屬 worktree；不得自動切換目前工作區或合併 main。

僅複製本輪五份留言板 plans 與 spec 到隔離候選，逐檔核對 SHA。AGENTS／CLAUDE 不整檔覆蓋 main：保留 main 已有只讀驗證／頁面證據規則，只套用本輪網路條款的差異。五份舊工作流程計畫保護即可，不重新執行已整合 A1–C3。

在完整隔離根執行 workflow:preflight；必要 ignored 素材按已核對輸入複製，或在授權的乾淨隔離副本執行 assets:ci。不能覆蓋原根素材，不能以歷史 CI 代替此次候選驗證。

## 2. 批次、任務與依賴

| 批次   | 子計畫與任務                                                  | 可獨立 review 的交付                                   |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------ |
| F 基礎 | [基礎計畫](2026-10-05-message-board-foundation.md)：G0、F1–F3 | 真雲技術門檻、唯一伺服器資料、協議、純規則與部署包能力 |
| B 雲端 | [後端計畫](2026-10-05-message-board-backend.md)：B1–B4        | 本人／管理權限、交易投稿、安全任務、處置及清理         |
| U 前端 | [頁面計畫](2026-10-05-message-board-ui.md)：U1–U4             | 受控 service、隱私／草稿、列表及投稿、管理／首頁       |
| V 收尾 | [驗收計畫](2026-10-05-message-board-release.md)：V1–V3        | 候選完整門禁、頁面證據、真雲／真機與可回退發布包       |

G0 有三個正式開發前門檻。尚無測試環境時，只完成只讀查證、探測程式／fixture 與部署準備，標 not-run；不把本地 mock 判為 G0 passed，也不啟動依賴 G0 的正式業務實作。

順序為 G0 → F1 → F2 → F3 → B1 → B2 → B3 → B4 → U1 → U2 → U3 → U4 → V1 → V2 → V3。F1／F2 的準備可在 G0 等待外部条件時設計及編寫測試，但按規格不越過真雲門檻宣稱功能可用。

## 3. 目前 G0 進度

| 門檻       | 已核對                                                                    | 缺少的實測                                                   |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 安全與回調 | 官方 2.0 recent-visit／非同步規則；原生雲函數推送不可直接假設支援安全事件 | 測試 AppID／CloudBase ID、現有接收端路由、真實驗簽與回調落庫 |
| 頭像鏈路   | 現有 base64 雲端上傳模式；64 KiB／96 KiB 功能預算                         | 原生圖片處理、私有預覽、HTTP 檢查連結、公開 fileID、實際 ACL |
| 本次身分   | 已有 SDK 4.0.2 和 getWXContext entry 模式；不得快取動態身分               | 本次可信來源、實例复用、跨來源拒絕與已配置平台調用权限       |

使用者已選擇現有付費環境測試，採專用探測資源與限定動作；不要求提供密鑰，不修改既有業務函數、消息回調或儲存規則。尚未具備的條件保持相應 not-run，繼續可獨立的計畫與驗證準備。

## 4. 工作檔案責任

- `data/master/game-servers.json`：唯一伺服器來源，九項基線逐字保留。
- `tools/data-pipeline/build-game-servers.ts`：純構建及生成九項，輸出小程序与两云函數參考檔。
- `miniprogram/contracts/message-board.ts`：动作输入／输出、DTO、錯誤碼與數值；pure guards 位於 domain。
- `cloudfunctions/message-board/core/`：聚焦的 validation、repository、operation、message、review、asset、safety、task、privacy、report 模組。
- `cloudfunctions/message-board/entry.js`：只处理本次小程序可信身分和 RPC 路由。
- `cloudfunctions/message-board-events/entry.js`：驗證 HTTP 回調或可信定時觸發，處理事件与工作；拒絕普通小程序調用。
- `tools/message-board/build-deploy-packages.ts`：將共用 core 與薄 entry 寫入兩個獨立部署包；不從雲函數包外 require。
- `miniprogram/runtime/message-board-service.ts`：唯一新的 callFunction 適配器，不直接寫資料庫。
- `miniprogram/domain/message-board/`、controllers、presenters：純規則、使用者意圖、畫面狀態；不在頁面塞入資料校驗與去重。
- `miniprogram/subpkg-message-board/pages/{board,compose,mine,admin}/`：四頁；mine 包含資料設定／清除，admin 包含檢舉／回覆／限制。
- `tools/miniprogram-review/scenarios/message-board-*.json`：保存可重跑場景；真機授权及消息推送不偽裝成 fixture。
- `docs/architecture/message-board-cloudbase.md`：集合／索引、IAM／ACL、角色、秘密變量名稱、回調、計時工作與部署順序。

新增核心檔以單一責任拆分，每任務對應精確測試。部署包及探測輸出置於 artifacts，不修改生成檔來遷就部署。

## 5. 規格覆盖矩陣

| 規格要求                                 | 任務               |
| ---------------------------------------- | ------------------ |
| 首頁獨立模組、四頁、長文字／安全區       | U3、U4、V1         |
| 暱稱／頭像主動選用、隱私、降級、草稿隔離 | F2、B2、U1、U2、V2 |
| 伺服器基線與唯一來源、生成登记           | F1、U3、V1         |
| 原文／展示資料不可變、五狀態             | F2、B1、B3、U3     |
| public／mine／admin 欄位及權限           | F2、B1、B3、U1、V2 |
| pass／review／risky、近期訪問、可靠回調  | G0、B2、B3、V2     |
| 持久任務、租約、重試、過期事件           | B2、B4、V2         |
| operation ID／payload hash、交易與競態   | F2、B1、B3、B4、V2 |
| 私有／公開頭像、發布 saga、撤銷與清理    | G0、B2、B3、B4、V2 |
| 檢舉、限制／解除、回覆、开关             | B3、B4、U4、V2     |
| 数据清除閘門、墓碑、保留期限与审计       | B4、U2、U4、V2     |
| 游標、短頁、窗口、重驗、離線提示         | F2、B1、U3、V1     |
| 不扩大全域网络、Node22、包体积、可回退   | F3、U1、V1、V3     |

## 6. 任務记录與交付

每任務在 `artifacts/message-board/<candidate-id>/task-ledger.md` 记录：基線／輸入 SHA、授权範圍、紅測試命令與真實失敗、最小修正、綠測試、頁面／仓库／外部 evidence、剩餘阻塞。不新寫只檢查文案存在的鏡像測試。

所有代碼任务以関連檢查結束；批次按使用者授权形成可 review 差異，不自動 commit。準備提交時展示檔案、各層驗證、未驗收項與擬用中文 message。工作停止或交接時，ledger 保留 pending／failed／blocked／not-run，不用新日期覆蓋歷史結果。

本輪只完成規格與分批實施計畫，沒有執行上述業務任務。開始實作時直接按 G0 与最新 main 保護流程進行，不再重新 brainstorm 已確認的產品方向。
