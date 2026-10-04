# C 批：規範、契約與試運行實施計畫

> **給執行代理：** 使用 `executing-plans` 逐項執行；本批未實施。文檔任務按實際內容驗收，不為可逆文字修改新增鏡像測試。提交前等待使用者當次授權。

**目標：** 用精簡入口保持規範一致，讓歷史錯誤轉化為可檢查契約，驗證新流程能支持日常任務。

**架構：** AGENTS 管最高約束，既有專題規範管細節；現況頁連至證據，契約頁連至已有測試。試運行使用隔離候選與離線樣例。

**技術棧：** Markdown、既有 Vitest、Node `>=22 <23`、npm `>=10`；不新增依賴或發布服務。

## 全域約束

遵守 [總計畫全域約束](2026-10-04-development-workflow-improvement.md#全域約束)。不重寫歷史計畫、不猜資料映射、不調整實際網路白名單／限流／ACL、不抽取大型 controller。页面工具及 runtime 若需修改，按既有 Design Foundation／頁面報告規範。

## C1：規範與現況入口對齊

**檔案：**

- 修改 `AGENTS.md`、`CLAUDE.md`、`README.md`：只對齊當前規則、入口與命令。
- 新增 `docs/development/current-state.md`：可更新的現況／證據／外部缺口入口。
- 新增 `docs/development/task-record-template.md`：一頁任務記錄模板。
- 在 `docs/superpowers/specs/2026-09-16-miniprogram-review-html-report-design.md` 補 B1／B2 已實施的身份及分層結果要求；頁面流程細節只在這裡維護。
- 核對 `tests/architecture/page-review-convention.test.ts`、`tests/architecture/tooling-runtime-contract.test.ts` 等既有架構守門測試，不以文案修改為由無條件擴寫測試。

**消費接口：** A1 的命令及只讀邊界、A2 的失敗分類、B1 的 schema version 2、B2 的 `ReviewChecks`、B3 的 `waitUntil`。文檔只能描述已實際完成的能力；未完成項保留計畫連結。

**產出接口：** 三個入口都指向 current-state；任務記錄使用以下固定欄位，其他計畫只引用，不複製規則。

```md
# 任務記錄

- 目標與本輪範圍：
- 基線、分支、候選身份與保護清單：
- 讀取的專題規範：
- 實際變更檔案與對象／範圍／時間契約：
- 紅測試或重現證據：
- 通過證據：相關測試／完整門禁／頁面工具／乾淨 checkout／遠端 CI，分開填寫。
- 未覆蓋項與阻塞原因：
- 下一步與擬用提交 message；提交授權狀態：
```

模板欄位供實際任務填寫；不能用空欄位當完成證據。

- [ ] **1. 先列實際差異，再逐項對齊。**

| 差異                           | 最終文案要表達的契約                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 只禁止 master                  | 禁止在 main／master 開發，先核對遠端預設分支及實際 HEAD                                                     |
| 全面禁止 wx.cloud／遠端 URL    | 默認禁止；例外只由 `check-runtime-network` 及掃描器的精確檔案／API／CDN origin／prefix 邊界決定，不新增例外 |
| 全本地 V1 陳述混同現狀         | 說明本地查詢、受控雲端功能、工具發布鏈路，歷史 V1 保留歷史日期                                              |
| 匯入直接形成 master            | 現有候選在 `artifacts/import-candidates/officers`；候選必須審核採納後才入 master                            |
| pipeline:full 名稱暗示一鍵採納 | 說明 import 產候選，後續 assets／generate 使用現有 master，不自動採納                                       |
| verify 描述不全／有寫回副作用  | 按最終 scripts 說明預檢、素材、套件體積、資料及只讀生成檢查；format 會寫回、format:check 不會               |
| doctor 等同 UI readiness       | 配置／CLI 診斷、實際 SDK／頁面探測、完整場景及外部驗收分開                                                  |
| CI 本地假設已有 staging        | 乾淨 checkout 的 `assets:ci` 依發布 manifest 準備三張圖；原工作區不盲目覆蓋                                 |

網路例外描述只連到 `tools/quality/check-runtime-network.ts` 和既有架構文檔；不要把「受控」寫成任意頁面都能 callFunction。CLAUDE 不再另設一套與 AGENTS 衝突的最高規則。

- [ ] **2. 建立精簡 current-state。**

包含更新日期、當時 HEAD、支援環境、資料來源／候選採納邊界、門禁狀態、流程計畫完成狀態及外部驗收連結。所有通過描述指向實際記錄；未推送的候選不能引用舊 Actions 成功證明新版本。保留 2026-10-01 修復計畫與 2026-10-04 收尾報告，從現況頁指向它們，不將老 failed／blocked 改成 passed。

- [ ] **3. 檢查規範一致性與連結。**

命令：`npm test -- tests/architecture/page-review-convention.test.ts tests/architecture/tooling-runtime-contract.test.ts tests/architecture/cloudbase-runtime-network.test.ts`、`git diff --check`。使用既有 Prettier 只检查本批文檔；被忽略的 superpowers 文檔明確指定 `--ignore-path .gitignore`，不對全仓 format --write。

逐條對照表核對實際 scripts、預檢輸出、registry 和掃描器；不添加只檢查某句文案是否存在的冗餘測試。提交前如果規則要求完整門禁，使用 Node 22 完成並明示文檔本身未改執行行為。

**驗收：** 三個入口沒有互相矛盾的當前規則，任務讀者能在一頁找到實際版本、能力和未驗收項。

## C2：操作契約與既有回歸索引

**檔案：**

- 新增 `docs/development/operation-contracts.md`：四類根因、關鍵場景、現有測試與未覆蓋項。
- 新增 `docs/audits/2026-10-04-workflow-contract-coverage.md`：當次核對結果；若在其他日期執行，改用執行日期而不偽裝當日結果。
- 只讀核對兩個 fleet 頁面、coupon 頁面、資料校驗／匯入／生成／維護同步及工具報告；只有發現能精確重現的缺口時才列具體測試檔修改。新的業務缺陷單獨建立修復範圍。

**消費接口：** [R01–R26 完成紀錄](2026-10-01-review-repair-plan.md) 與既有 tests，不假設舊結果等於本次實測。

**產出接口：** 每條契約固定包含「操作對象、前置狀態、允許結果、失敗／取消／卸載結果、獨立依據、現有測試、未覆蓋項」。契約是可查的索引，不引入新運行時狀態機。

- [ ] **1. 從既有回歸建立下表並核對實際斷言。**

| 維度     | 必查契約／歷史例子                                                                                                                   | 現有測試入口                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 對象     | 衝突分類／force 不得寫錯 activeConfigId；兌換結果綁發起玩家                                                                          | `tests/pages/fleet-page.test.ts`、`adventure-fleet-page.test.ts`、`coupon-redemption-page.test.ts`                                           |
| 範圍     | official／custom 全量校驗；維護失敗回復全部生成路徑；final 所有頁面命中                                                              | `tests/data-contract/master-dataset.test.ts`、`tests/tools/sync-maintenance-work-orders.test.ts`、`tests/miniprogram-review/trigger.test.ts` |
| 時間     | 列表等待中新編輯不被覆蓋；逆序回覆只保留最後意圖；卸載後不操作頁面                                                                   | 兩個 fleet 頁面測試及 coupon 頁面測試                                                                                                        |
| 獨立依據 | 已拒絕的來源不能被自建字典重新合法化；全 Lv.1 fixture 的欄位省略必須實際斷言；Range 破碎片段必須確實觸發 fallback 而非完整 JSON 解析 | `tests/import/run-import.test.ts`、`tests/data-pipeline/build-runtime-data.test.ts`、`tests/import/parse-languages.test.ts`                  |

具體搜尋既有用例：`登入等待列表時新編輯保留草稿`、`兩次載入逆序回覆只保留最後選取配置`、`放棄修改先還原保存基線`、`兌換結果與發起玩家綁定`、`非法輸入`、`回復`、`chasT051`、`JSON.parse`。Range 回歸要確認測試先断言整體 JSON.parse 拋錯，再断言 fallback 恢復兩側鍵；這是來源解析契約，不是雲端分頁或 HTTP 回應裁剪。必須打開測試核對斷言內容，不能只凭名称勾选。

- [ ] **2. 把「重複實作」與「缺失契約」分開。**

兩個 fleet 頁面使用同一套行為清單核對登入、載入、編輯、保存、放棄、衝突、重試、卸載八個操作。若既有測試已覆盖，不再新增鏡像測試。若出現共同且可重現的新缺口，先寫针对该缺口的紅測試，再另列修復任務；不要為消除重複而抽取 controller。共同狀態機只有在接口與差異充分確認、專門設計獲得範圍授權後才啟動。

- [ ] **3. 複核資料 warning 的處置機制。**

使用 `checkMasterDataset()` 的現有完整 findings，按 code／關係 group／來源證據分組。記錄當時總量、新增／消失／改變項，以 `(code, entityId, path)` 比較歷次 findings；5254 只是歷史基線，不硬編為當前數量。

每個待核對關係記錄 officer／skill ID、原 group／category、獨立來源、核對狀態及處置理由。沒有證據的項保持 warning，不能猜 `kind`，不能把 `auditStatus` 改成全量 confirmed。若批准資料修正，另走 master→data:check→工具生成→門禁；此契約索引本身不改資料。

- [ ] **4. 跑風險回歸並保存覆蓋／未覆蓋表。**

命令：`npm test -- tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts tests/pages/coupon-redemption-page.test.ts tests/data-contract/master-dataset.test.ts tests/data-pipeline/build-runtime-data.test.ts tests/tools/sync-maintenance-work-orders.test.ts tests/miniprogram-review/trigger.test.ts tests/import/run-import.test.ts tests/import/parse-languages.test.ts`。

選擇性測試通過只證明表中既有契約回歸；不稱全專案新一輪完整審查。若沒有代码修改，不為索引文檔虛構紅測試。報告對資料語義、真雲並發、性能及設備缺口分別標記。

**驗收：** 四類風險均可從具體契約追到實際測試或缺口；R01–R26 不被重做；没有默認業務重構。

## C3：三類隔離試運行

**檔案：** 新增 `docs/audits/2026-10-04-workflow-pilot.md`，實施在其他日期則使用實際日期。樣例及故障注入留在測試／暫存目錄，不污染 master 或正式 generated 檔案。

**消費接口：** A1 的 PreflightReport、A2 的 GenerationCheckResult、B1 的 ReviewEvidence、B2 的 ReviewChecks、C1 的任務記錄模板。

**產出接口：** 一份固定候選版本的試運行記錄：類型、來源身份、預檢、動作、預期與實際分類、證據位置、耗時、補證操作數、未覆蓋項。

- [ ] **1. 保存候選身份與實驗保護清單。**

完整隔離副本須包含必要 archive／master／schemas／assets／manifest／工具及 lock。任何未被 Git 跟蹤但必要的輸入都記錄來源和 hash；依賴只使用已授權、符合版本的安裝，不新增或升級。原工作區與副本界線明確，不能把副本生成結果直接拷回使用者工作區。

- [ ] **2. 執行三類樣例。**

| 類型       | 執行內容                                                                                      | 必須成立的證據                                                    |
| ---------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 文檔       | 用本批真實文檔變更執行相關格式／連結／既有守門測試                                            | 不誤触 UI 驗收；不格式化無關檔案                                  |
| 資料／生成 | 在測試 fixture 或副本修改一個有來源的主資料輸入並工具生成；保留合法 dirty，再注入單一錯誤產物 | 正常候選通過；故障分類為漂移且不覆寫；前後保護 hash 相同          |
| 非同步 UI  | 正式工具執行 B3 場景、保存身份／条件等待及截圖；用測試依賴注入 final 倉庫失敗                 | 無錯配 before；原斷言仍在；HTML／JSON／Markdown／CLI 一致反映失敗 |

資料樣例無需憑空修改真實航海士，可使用 A2 的可追溯最小 fixture。UI 使用既有離線 fixture 能力，清楚寫明不代表真雲驗收。

- [ ] **3. 記錄成本，不預設提升百分比。**

記錄開始至首次可信判定的時間、相同環境錯誤重試次數、恢復次數、額外補證動作和人工缺口。舊流程只在安全隔離 fixture 中重現已知問題，不重新製造正式環境故障。沒有可比的舊時間記錄就寫「無可比基線」，保留原始次數；不要以測試總數或文檔數當效率指標。

- [ ] **4. 完成批次驗收與對外限制。**

Node 22 下執行 `npm run verify`、`git diff --check`；需要 CI 結論時用相同候選版本的乾淨 checkout 和實際 Actions 結果。證據包括 A2 無寫回、B1 身份／基線判定、B2 最終結果、B3 有界等待、規範一致性和契約索引。

重核收尾队列状态，仅以其指定的真實證據銷項；未完成的設備、真雲、QR／上傳包、長列表、性能和資料語義維持開啟。沒有雲端測試環境授權時，不對正式環境做試驗。

**驗收：** 三類任務都能走完新流程；工具問題與產品外部验收边界清楚，記錄可供後續任務重用。

## C 批交付清單

- [ ] 三個入口對齊及 current-state／任務模板。
- [ ] 四類契約到已讀過的回歸斷言／缺口的映射。
- [ ] 真實試運行記錄、相關檢查及完整門禁。
- [ ] 外部隊列逐項保持真實狀態。
- [ ] 擬用 message：`對齊開發規範並建立契約與流程驗收記錄`；未經授權不提交。
