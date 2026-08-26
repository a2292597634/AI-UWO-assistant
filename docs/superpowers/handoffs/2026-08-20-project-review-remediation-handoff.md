# 專案 Review 修復移交報告

日期：2026-08-20
專案：`E:\AI UWO assistant`
目前分支：`codex/phase-7-adventure-save-limit`
文件性質：程式碼審查後續修復移交；本文件本身不包含任何功能修復
建議後續分支：待目前工作區改動妥善提交或轉移後，再建立 `codex/phase-8-review-remediation`

## 1. 移交目標

接手 Agent 應修復本輪 Review 的第 1、4、5、6、8、9、10 項，優先確保剛上線的雲端配置保存不會出現「服務端已寫入、前端卻顯示失敗」、載入失敗誤判為空資料，以及冒險艦隊預設目標被登入／保存流程清空等問題。

所有修復都必須先補失敗測試，再做最小實作，最後通過相關測試與完整門禁。不得順手處理本文件明確排除的第 2、3、7 項。

## 2. 範圍與優先級

| 原 Review 編號 | 優先級 | 修復項目 | 主要風險 |
| --- | --- | --- | --- |
| 1 | P0 | 雲函數回傳 `normalizedName`，前端嚴格契約拒收 | 寫入成功但 UI 報錯，使用者重試後可能產生混亂 |
| 4 | P1 | 配置列表載入失敗被後續流程當成空列表 | 現有畫面狀態被重設，且掩蓋雲端故障 |
| 5 | P1 | 冒險艦隊首次登入／保存會清空預設目標 | 使用者尚未保存便遺失系統預填內容 |
| 6 | P1 | 原生返回、手勢返回未進入未保存保護 | 未保存配置可被無提示丟棄 |
| 8 | P1 | 搜尋後的職業／國籍 picker 索引映射錯誤 | 畫面選中項與實際提交 ID 不一致 |
| 9 | P1 | CloudBase 權限與索引只存在於人工文件，無部署證據 | 唯一性、查詢與資料隔離依賴未驗證的外部設定 |
| 10 | P1 | 兩個雲函數的生產依賴存在高風險稽核項 | 已上線後端攜帶已知漏洞依賴鏈 |

### 2.1 明確不在本次修復範圍

以下項目由使用者明確決定不修；只能保留記錄，不得實作：

- 第 2 項：自訂航海士頭像在校驗、重複檢查或配額檢查前上傳，可能覆蓋同路徑檔案。
- 第 3 項：自訂航海士後端的欄位校驗、公開待審資料和併發控制不足。
- 第 7 項：自訂航海士尚未接入實際名冊、生成器及完整運行時資料流。

因此，下列相鄰問題也不應藉本任務處理：

- `listCustom` 未分頁及 CloudBase 查詢預設數量限制。
- 頭像以 base64 經 `callFunction` 傳輸及請求體大小限制。
- 自訂航海士同步工具、公開狀態、素材清理或名冊整合。

第 8 項雖位於航海士編輯頁，但只允許修復職業／國籍 picker 的本地索引映射，不得擴大到提交、審核、頭像或名冊流程。

## 3. 接手前必讀約束

1. 完整閱讀根目錄 `AGENTS.md`。
2. 禁止直接在 `master` 分支開發；後續分支使用 `codex/phase-N-描述`。
3. 不得修改 `archive/`；人工資料修改只能進入 `data/master/`；不得手改 `miniprogram/generated/`。
4. 未經使用者再次明確確認，不得新增、刪除或升級依賴。
5. 涉及 `miniprogram/pages/`、WXML 或 WXSS 前，完整閱讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
6. 配置流程、篩選映射和校驗邏輯必須遵循紅－綠－重構。
7. 不得格式化或修復與本次工作無關的文件。
8. commit 前必須展示變更文件、驗證結果及擬用 message，等待使用者確認。

## 4. 目前工作區狀態：禁止覆蓋

移交文件建立前的狀態如下：

```text
## codex/phase-7-adventure-save-limit
 M cloudfunctions/fleet-config/fleet-config-repository.js
 M cloudfunctions/fleet-config/fleet-config-service.js
 M miniprogram/contracts/fleet-config.ts
 M tests/fleet-config/fleet-config-repository.test.ts
 M tests/fleet-config/fleet-config-service.test.ts
?? docs/audits/2026-08-10-ui-ux-re-audit-handoff.md
```

這些都是既有使用者改動。當前 diff 主要包含：

- 將單船目標上限由 20 提高到 50，以容納 25 個冒險預設目標。
- 補充 25 個預設目標在 create／update／saveAs 的測試。
- 將 CloudBase 的 `ResourceUnavailable.ResourceExist` 視為集合已存在。

接手 Agent 必須先執行：

```powershell
git status --short --branch
git diff -- cloudfunctions/fleet-config/fleet-config-repository.js cloudfunctions/fleet-config/fleet-config-service.js miniprogram/contracts/fleet-config.ts tests/fleet-config/fleet-config-repository.test.ts tests/fleet-config/fleet-config-service.test.ts
```

其中 `cloudfunctions/fleet-config/fleet-config-service.js` 與原 Review 第 1 項直接重疊。在目前改動尚未由使用者處理前，不要切分支、stash、還原、覆蓋或提交；應先取得使用者指示，或等 Phase 7 改動完成後再開始。

## 5. Review 基線與已知門禁狀態

截至 2026-08-20，本輪已取得以下結果：

| 檢查 | 結果 |
| --- | --- |
| `npm test` | 通過：78 個測試檔、1121 個 tests |
| `npm run lint` | 通過 |
| `npm run typecheck` | 通過 |
| `npm run check:runtime-network` | 通過，但存在下文所述規範衝突 |
| `npm run check:miniprogram-size` | 通過：主包 1898.1 KB、85 個檔案 |
| `npm run assets:ui:check` | 通過 |
| `npm run assets:manifest:check` | 通過：1223 個素材 |
| `npm run data:check` | 通過：7 個測試檔、47 個 tests |
| `npm run format:check` | 未通過；當時只報既有未跟蹤文件 `docs/audits/2026-08-10-ui-ux-re-audit-handoff.md` |
| `npm run generate:check` | 本輪未執行，因命令會先重寫生成產物；不能宣稱完整 `npm run verify` 已通過 |

補充校正：倉庫已有且已追蹤 `.github/workflows/verify.yml`，會在 `main` 的 push 和 pull request 上執行 `npm ci` 及 `npm run verify`。不要建立重複 CI workflow。

## 6. 建議執行順序

1. 保護並處理現有 Phase 7 工作區改動。
2. 修復 P0 的服務端／客戶端配置記錄契約。
3. 修復配置列表失敗分支，建立可靠的「成功空列表」語義。
4. 修復冒險艦隊預設草稿的 dirty 狀態及新建工廠。
5. 補齊原生返回的未保存保護。
6. 修復職業／國籍 picker 的篩選索引。
7. 以只讀方式核對 CloudBase 權限、索引和既有資料，再經確認處理外部環境。
8. 調查雲函數依賴可行升級路徑，獲得使用者確認後才改依賴。
9. 執行完整門禁、DevTools 流程驗收及交付前 Review。

## 7. 工作包 A：統一雲端配置回傳契約（原第 1 項，P0）

### 問題證據

- `cloudfunctions/fleet-config/fleet-config-service.js:296` 的 `toClientRecord()` 只移除 `ownerUid` 和 `_id`，保留資料庫內部欄位 `normalizedName`。
- 同檔 create、saveAs、rename 等流程都經 `toClientRecord()` 返回完整記錄。
- `miniprogram/runtime/fleet-config-service.ts:107` 的 `isValidFleetConfigRecord()` 使用 `hasOnlyKeys()`，允許欄位中沒有 `normalizedName`。
- `tests/fleet-config/fleet-config-service.test.ts:244` 目前反而要求服務回傳值包含 `normalizedName`；這項測試把「資料庫應持久化」和「客戶端應看見」混為一談。
- `tests/runtime/fleet-config-service.test.ts:137` 的成功 fixture 沒有模擬真實服務端洩漏出的欄位，因此未覆蓋端到端契約衝突。

### 風險

create／saveAs／rename 等寫操作可能已在服務端成功，前端卻將成功 envelope 判定為非法回應並顯示失敗。使用者重試時可能遇到同名衝突，誤以為首次資料沒有保存。

### 推薦修復

保持前端嚴格白名單，不把 `normalizedName` 擴大成公開契約。由服務端 `toClientRecord()` 明確移除 `ownerUid`、`_id`、`normalizedName`，並保留資料庫層對 `normalizedName` 的持久化與唯一索引用途。

### TDD 步驟

1. 先在 `tests/fleet-config/fleet-config-service.test.ts` 增加／改寫失敗測試，逐一驗證 load、create、update、saveAs、rename 回傳值不包含三個內部欄位。
2. 在 repository 層測試 `normalizedName` 仍被持久化，取代目前從公開 service response 斷言內部欄位的測試。
3. 在 `tests/runtime/fleet-config-service.test.ts` 使用真實服務端允許欄位集合建立成功 fixture；另保留「未知欄位必須被拒絕」測試。
4. 確認紅燈後，只修改 `toClientRecord()` 完成最小修復。

建議先跑：

```powershell
npx vitest run tests/fleet-config/fleet-config-service.test.ts tests/fleet-config/fleet-config-repository.test.ts tests/runtime/fleet-config-service.test.ts
```

### 驗收標準

- 五個返回完整記錄的 action 都只返回公開契約欄位。
- `normalizedName` 仍在資料庫記錄中存在並參與唯一性檢查。
- `ownerUid`、`_id`、`normalizedName` 均不會送到小程序。
- 前端仍拒絕真正未知的服務端欄位，不放寬為任意物件。
- 模擬「服務端寫入成功」後，前端 adapter 能正常解析並更新配置狀態。

## 8. 工作包 B：區分列表載入失敗與成功空列表（原第 4 項，P1）

### 問題證據

戰鬥頁 `miniprogram/pages/fleet/index.ts:419` 及冒險頁 `miniprogram/pages/adventure-fleet/index.ts:429` 的 `refreshConfigList()` 在 catch 後只顯示錯誤，不返回失敗狀態，也不拋出錯誤。

兩頁的 `onAfterLogin()` 會在 await 後直接讀取 `state.configList`；初始值或舊值為空時，網路失敗也會進入 `doNewConfig()`。`onConfigListOpen()` 同樣可能在刷新失敗後打開空白或過期列表。

### 推薦修復

讓 `refreshConfigList()` 明確返回可判別結果，例如 `{ ok: true, list } | { ok: false }`，或在失敗時拋出並由呼叫端中止。只有「請求成功且 list 確實為空」才允許進入新配置狀態。

不要用清空 `configList` 代表 loading 或 error；必要時增加明確的載入／失敗 UI 狀態，但避免超出既有組件和 Design Foundation。

### TDD 步驟

1. 在戰鬥與冒險頁測試中 mock `listMyConfigs()` reject。
2. 驗證登入後列表失敗時，當前 fleet、預設目標、`activeConfigId`、`configName` 和 dirty 狀態都不改變。
3. 驗證配置列表按鈕刷新失敗時不打開「成功的空列表」。
4. 再補成功返回 `[]` 的對照測試，確認確實進入各頁定義的新建狀態。
5. 用最小結果型別或 throw 流程修復兩頁。

建議先跑：

```powershell
npx vitest run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
```

### 驗收標準

- 載入失敗與成功空列表具有不同控制流。
- 失敗時保留目前可編輯狀態並允許重試。
- 失敗時不自動載入、清空或建立配置。
- 成功空列表仍顯示正確的新建配置體驗。
- 兩個艦隊頁的行為一致，且沒有不必要的大型重構。

## 9. 工作包 C：保留冒險艦隊預設草稿（原第 5 項，P1）

### 問題證據

`miniprogram/pages/adventure-fleet/index.ts:567` 建立空 fleet 後，會把所有船同步為自動模式並呼叫 `initDefaultTargets()`，但初始 `isDirty` 仍為 `false`，`savedFleetState` 仍為 `null`。

未登入使用者點保存時，`onConfigSave()` 完成登入後只在 `isDirty === true` 時開啟 saveAs；目前預設草稿被視為 clean，因此改走 `onAfterLogin()`。若雲端列表成功返回空陣列，通用 `doNewConfig()` 又會建立完全空白的 fleet，將冒險預設目標清除。

### 推薦修復

建立冒險頁自己的「新冒險草稿」工廠或初始化 helper，統一負責：

- 建立七艘船。
- 設為自動模式。
- 加入完整預設冒險技能目標。
- 依真正的 business state 計算 dirty，而不是手寫 `false`。

首次載入和點擊「新建」都應走同一 helper。不要修改戰鬥頁的空白新建語義。

### TDD 步驟

1. 測試冒險頁首次載入後存在完整預設目標，且相對空白 baseline 為未保存草稿。
2. 測試 guest 點保存並登入成功後，直接打開命名／saveAs，預設目標不變。
3. 測試雲端列表成功為空時，若目前已有 dirty 預設草稿，不得清空。
4. 測試點擊新建並確認放棄舊修改後，新草稿仍包含冒險預設目標。
5. 測試保存成功後才轉為 clean，且序列化內容包含全部預設目標。

建議先跑：

```powershell
npx vitest run tests/pages/adventure-fleet-page.test.ts tests/fleet-config/fleet-config-contract.test.ts tests/fleet-config/fleet-config-service.test.ts
```

### 驗收標準

- 首次進入冒險頁時，預設目標不會因登入、空列表或首次保存而消失。
- 首次保存能進入命名流程，並保存完整預設內容。
- 「新建」產生的是冒險預設草稿，不是戰鬥頁式空白草稿。
- 僅成功保存或成功載入雲端配置後標記為 clean。
- 與 Phase 7 的 25 個目標／單船上限修改相容，不回退既有改動。

## 10. 工作包 D：補齊原生返回的未保存保護（原第 6 項，P1）

### 問題證據

兩個艦隊頁目前只有 `onConfigExit()` 會呼叫 `checkUnsavedAndProceed(..., { type: 'exit' })`。專案內未找到 `onUnload`、`onHide`、`wx.enableAlertBeforeUnload` 或等價的頁面離開保護。

因此，導航欄返回、Android 系統返回和 iOS 手勢返回可能繞過頁內自訂退出按鈕，直接丟棄未保存狀態。

### 推薦修復

保留既有頁內三選一 guard；另外依微信小程序當前正式 API，在 dirty 時啟用原生離頁提示，在 clean、成功保存、成功載入及頁面確定卸載後停用。不要把 `onUnload` 當成可取消的前置事件。

原生提示通常只能提供「離開／取消」而非既有的「保存／放棄／取消」三選一；若平台限制如此，應在文件和驗收記錄中明確標註降級差異，但底線是不得無提示丟失。

### TDD／驗證步驟

1. 在兩個頁面測試 harness 中 mock 原生離頁提示 API。
2. 驗證 business state 由 clean 變 dirty 時只啟用一次提示。
3. 驗證保存、載入或放棄後立即停用提示。
4. 驗證 UI-only 變更不啟用提示。
5. 用微信 DevTools 實際驗證導航欄返回。
6. 如可取得設備，再驗證 Android 系統返回和 iOS 返回手勢。

建議先跑：

```powershell
npx vitest run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
```

### 驗收標準

- 所有可重現的原生返回路徑都不會靜默丟失 dirty 配置。
- clean 頁面返回時不出現多餘提示。
- 頁內自訂退出仍保留現有保存／放棄／取消流程。
- 沒有重複註冊、殘留 guard 或成功保存後仍阻止返回的情況。
- DevTools／實機驗收結果、基礎庫版本與平台限制被記錄。

## 11. 工作包 E：修復職業與國籍 picker 篩選索引（原第 8 項，P1）

### 問題證據

- `miniprogram/pages/officer-editor/index.wxml:61` 和 `:72` 的 picker range 分別是 `filteredJobOptions` 與 `filteredNationalityOptions`。
- `miniprogram/pages/officer-editor/index.ts:228` 和 `:245` 的 change handler 卻重新取得完整 `jobOptions`／`nationalityOptions`，再用篩選後 picker 回傳的索引取值。
- `miniprogram/presenters/officer-editor-presenter.ts:219` 先在完整列表計算選中索引，WXML 卻用該索引讀取篩選列表；搜尋時可能顯示錯誤項或越界。

### 推薦修復

事件 handler 應以畫面當下實際傳給 picker 的 filtered options 解析 index，或讓 picker 攜帶穩定 ID。Presenter 也要以同一 filtered range 計算 index；若已選項被搜尋條件排除，應使用獨立的已選名稱顯示，不能拿另一個 filtered 項目冒充。

### TDD 步驟

目前只有 `tests/pages/officer-editor-page.test.ts`，尚無 presenter 專用測試。此工作包預計新建 `tests/presenters/officer-editor-presenter.test.ts`，不要把它誤認為既有文件。

1. 新建 presenter 測試，加入「完整列表第 N 項成為篩選結果第 0 項」的案例。
2. 在頁面測試輸入關鍵詞，再觸發 picker index `0`，驗證寫入的是篩選結果 ID，而非完整列表第 0 項。
3. 職業和國籍各做一組測試。
4. 增加已選項不在目前搜尋結果時的顯示測試，禁止 undefined 或錯誤名稱。
5. 清除搜尋後，驗證完整 range 的 index 和已選 ID 重新一致。

建議先跑：

```powershell
npx vitest run tests/pages/officer-editor-page.test.ts tests/presenters/officer-editor-presenter.test.ts
```

### 驗收標準

- 搜尋前後，使用者看到的職業／國籍和 `form.jobId`／`form.nationalityId` 始終一致。
- index 越界或篩選結果為空時不會提交錯誤 ID。
- 清除搜尋不改變已選值。
- 不觸碰頭像上傳、後端提交、審核或名冊整合。

## 12. 工作包 F：驗證 CloudBase 權限、索引與部署（原第 9 項，P1）

### 問題證據

`cloudfunctions/fleet-config/fleet-config-repository.js` 的 `ensureCollection()` 只能懶建立 `fleet_configs` 與 `fleet_config_owner_locks`，不會建立索引或配置客戶端存取權限。

`docs/architecture/fleet-configuration-cloudbase.md:30` 只以人工步驟要求索引；同文件 Security 段落寫著「No client-side collection access rules needed」。這不足以證明線上環境已禁止小程序直接存取資料庫，也無法證明唯一複合索引真的存在。

### 執行要求

本工作包含外部環境和既有使用者資料。必須先取得確切 CloudBase 環境 ID，先做只讀盤點和備份方案；未確認環境與回復方式前不得建立唯一索引、批次回填、改權限或刪除資料。

只讀盤點至少包含：

- `fleet_configs` 與 `fleet_config_owner_locks` 是否存在。
- `fleet_configs` 的 `ownerUid`、`configId`、`ownerUid + configId`、`ownerUid + normalizedName`、`updatedAt` 索引是否符合文件。
- 複合唯一索引建立前，是否有缺少 `normalizedName` 或同 owner 重名資料。
- 兩個集合的客戶端讀寫權限是否為拒絕／僅管理端，並確認雲函數服務端 SDK 仍可讀寫。
- 線上雲函數版本是否和倉庫預計部署版本一致。

### 推薦產出

1. 將 `docs/architecture/fleet-configuration-cloudbase.md` 的部署與安全段落改為中文，明確列出安全規則、索引、回填前置條件及驗證命令。
2. 在不引入新依賴的前提下，增加可重複執行的只讀 preflight；若平台無法可靠匯出 metadata，至少保存控制台截圖、環境 ID、檢查日期和操作者。
3. 唯一索引建立前先輸出衝突清單；衝突處理方式必須再由使用者確認，不能自動改名或刪除。
4. 在測試環境完成權限與 CRUD smoke test 後，再安排正式環境變更。

### 驗收標準

- 能提供線上環境的索引清單和權限證據，而不是只引用倉庫文件。
- 小程序客戶端不能直接讀寫兩個集合；雲函數仍能按 `OPENID` 正常操作。
- `ownerUid + configId` 和 `ownerUid + normalizedName` 的唯一性在資料庫層生效。
- 既有資料已在唯一索引建立前完成只讀審計、備份和經確認的遷移。
- 部署／回滾步驟可由下一位維護者重複。

## 13. 工作包 G：處理雲函數依賴風險（原第 10 項，P1）

### 現況

以下兩個雲函數都直接固定使用 `wx-server-sdk` `4.0.2`：

- `cloudfunctions/fleet-config/package.json`
- `cloudfunctions/officer-custom/package.json`

在各自目錄執行 `npm audit --omit=dev`，截至 2026-08-20 都得到 6 項生產依賴漏洞：5 high、1 moderate。主要依賴鏈為：

```text
wx-server-sdk 4.0.2
└─ @cloudbase/node-sdk 3.17.2
   ├─ @cloudbase/database 1.4.3
   │  ├─ lodash.set 4.3.2
   │  └─ lodash.unset 4.5.2
   └─ axios 0.27.2
```

`npm audit` 提示的自動方案是把 `wx-server-sdk` 改成 `2.5.3`，並標記為 SemVer major；這是降級路徑，不得直接執行 `npm audit fix --force`。

### 執行要求

1. 先查核微信／CloudBase 官方目前支持的 SDK 版本、Node runtime 和升級／降級相容性。
2. 盤點實際使用 API：`init`、`getWXContext`、database、transaction、collection 建立、storage upload 等。
3. 在隔離分支或臨時驗證環境試裝候選版本，記錄 lockfile 差異及 audit 結果。
4. 先向使用者展示候選版本、相容性風險、測試結果和預計修改的兩份 package／lockfile；取得明確確認後才可修改依賴。
5. 不因第 10 項而修改第 2、3、7 項的業務行為。

### 驗收標準

- 不使用 `--force` 或未審核的自動降級。
- 若有官方支持且可相容的安全版本：兩個雲函數使用一致版本，lockfile 可重現，相關單元測試和測試環境 smoke test 通過。
- 若目前沒有可接受的安全版本：提交可驗證的調研證據、暴露面分析、暫時緩解措施及需使用者接受的剩餘風險，不得宣稱漏洞已修復。
- 依賴變更後重新執行兩個目錄的 `npm audit --omit=dev`，並保存結果。
- fleet-config 至少驗證 authenticate、list、load、create、update、saveAs、rename、delete 和版本衝突；officer-custom 僅做依賴相容 smoke test，不擴大其功能修復範圍。

## 14. 次要跟蹤事項

### 14.1 主包只剩很小余量

`npm run check:miniprogram-size` 目前為 1898.1 KB，內部上限是 1.9 MiB（1945.6 KiB），只剩約 47.5 KiB，約已使用 97.6%。最大的三個檔案是：

- `miniprogram/generated/fleet-officers.js`：642.7 KB
- `miniprogram/generated/catalog.js`：509.8 KB
- `miniprogram/generated/skills.js`：447.2 KB

這不是本次 P0／P1 的前置修復，但後續不得再把大資料或素材放入主包。若核心修復導致包體增加，必須另開明確任務處理生成資料分包，且只能修改生成器和權威資料層，不能手改 `miniprogram/generated/`。

### 14.2 運行時網路規範存在文字與門禁衝突

根目錄 `AGENTS.md` 文字上禁止 `miniprogram/` 運行時使用任何 `wx.cloud`；但 `tools/quality/check-runtime-network.ts` 已明確放行：

- `runtime/fleet-config-service.ts`
- `runtime/officer-editor-service.ts`
- `runtime/main-data-store.ts`
- `app.ts` 中的 CloudBase 初始化

雲端保存已上線，因此不要為了字面規則刪除受控適配層。這屬於治理決策：應請使用者確認是否把 `AGENTS.md` 改成「只允許已登記的 CloudBase 適配層」，再另行修改規範；本次功能修復只需確保不新增放行檔案或任意網路能力。

## 15. 每個工作包的完成流程

對每一工作包重複以下流程，不要一次修改全部內容後才測試：

1. 確認當前 diff，避免覆蓋 Phase 7 或其他使用者變更。
2. 寫一個能穩定重現問題的失敗測試。
3. 執行該測試並保存預期失敗證據。
4. 做最小實作，使新測試和相鄰測試通過。
5. 再做必要重構，不擴大行為範圍。
6. 執行相關 lint、typecheck 和測試。
7. 每完成一個工作包便重新檢查 `git diff --check` 與變更清單。

## 16. 最終驗證清單

在所有程式碼修復完成，且現有未跟蹤審計文件的格式問題已由其擁有者處理後，執行：

```powershell
npm run verify
```

另外必須執行：

```powershell
npm audit --omit=dev
Push-Location cloudfunctions/fleet-config
npm audit --omit=dev
Pop-Location
Push-Location cloudfunctions/officer-custom
npm audit --omit=dev
Pop-Location
git diff --check
git status --short
```

注意：`npm run verify` 內的 `generate:check` 會先執行生成器。執行前先確認工作區狀態，執行後檢查是否產生非預期 diff；不得把生成器造成的無關改動混入提交。

DevTools 最少驗收路徑：

1. 戰鬥配置：登入 → 新建 → 保存 → 載入 → 改動 → 原生返回提示。
2. 配置列表斷網：登入後列表失敗，不清空目前配置，恢復網路後可重試。
3. 冒險配置：首次進入有預設目標 → 登入保存 → 命名 → 重新載入內容一致。
4. 冒險頁原生返回：dirty 時提示、clean 時直接返回。
5. 航海士編輯：搜尋職業／國籍 → 選擇非完整列表首項 → 畫面文字與提交 ID 一致。
6. CloudBase 測試環境：客戶端直連被拒絕，雲函數 CRUD 正常，唯一索引阻止重複。

## 17. 提交邊界

建議至少拆成以下可審查提交，但 commit 前仍須逐次取得使用者確認：

1. `fix: align fleet config response contract`
2. `fix: preserve fleet drafts across cloud failures`
3. `fix: guard unsaved fleet navigation`
4. `fix: map filtered officer picker selections`
5. `docs: harden CloudBase deployment verification`
6. 依賴提交訊息需在確定版本與取得批准後另擬，不預先承諾。

不得把第 2、3、7 項、包體重構、規範文字調整或其他既有審計問題混入上述提交。

## 18. 可直接發給接手 Agent 的移交話術

請接手 `E:\AI UWO assistant` 的 Review 修復工作，先完整閱讀根目錄 `AGENTS.md` 和 `docs/superpowers/handoffs/2026-08-20-project-review-remediation-handoff.md`。本次只處理原 Review 第 1、4、5、6、8、9、10 項，第 2、3、7 項由使用者明確決定不修，也不要順手處理其相鄰的自訂航海士上傳、後端校驗或名冊整合問題。開始前先保護目前 `codex/phase-7-adventure-save-limit` 上的既有未提交改動，尤其不要覆蓋 `cloudfunctions/fleet-config/fleet-config-service.js`。請按報告中的優先級和 TDD 步驟逐項完成，外部 CloudBase 變更及任何依賴升降級都要先展示方案並取得使用者確認；最後提供完整測試、`npm run verify`、依賴稽核、DevTools／CloudBase 驗收和剩餘風險證據，commit 前仍需等待使用者確認。
