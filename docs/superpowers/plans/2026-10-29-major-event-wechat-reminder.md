# 大流行微信提醒實施計畫

> **執行方式：** 使用 subagent-driven-development，依序完成實作與任務審查；最後完成整體審查。所有提交步驟由用戶確認門禁取代，本次不 commit。

**目標：** 實作單場大流行的微信訂閱提醒，一次完整激勵廣告對應開始前 3 小時、1 小時、10 分鐘的可用提醒，列表與詳情同步。

**架構：** 服務端重新驗證日程，持久化單場訂閱與逐次授權、廣告會話、任務及發送結果；獨立排程 worker 以原子領取與用戶／模板鎖執行。頁面透過專用 runtime service 與平台適配器完成原生授權、廣告及訂閱恢復，資料由既有 master 生成流程提供。

**技術：** TypeScript、微信小程序、CloudBase、wx-server-sdk 4.0.2、Node 22、Vitest，沿用既有依賴。

## 全域約束

- 工作區：`C:/Users/XB/.codex/worktrees/major-event-reminders/AI UWO assistant`，分支 `codex/phase-62-major-event-reminders`，基線 `c48d3732b961752e78a8f17f8ae38284a96e1682`。
- 原始 `E:/AI UWO assistant` dirty／untracked 檔案只讀保護；不得帶入無關改動、提交、推送或部署。
- `archive/` 唯讀，`data/master/` 唯一手動維護來源，生成產物透過工具產生；本功能不改原始日程資料。
- 所有說明、註釋及介面用中文，產品文字用繁體中文。
- 編碼前完整閱讀 Design Foundation、HTML 驗收規格及本功能設計稿；採用最後確認的緊湊雙行版，移除「最近一場」，開關唯一標籤「提醒訂閱」。
- 唯一新增前端網路例外為 `miniprogram/runtime/major-event-reminder-service.ts` 的 `wx.cloud.callFunction`；同步掃描器與契約，不擴大其他網路權限。
- 新雲函數部署包使用 `wx-server-sdk` 精確版本 `4.0.2`，不變更其他依賴。廣告位固定 `adunit-accfb914625e0bc7`；訂閱模板與欄位尚未提供，預設停用並顯示原因。
- 一次 accept 只登記一個提醒時點，不能以設定 accept 推算剩餘次數；從用戶點擊直接呼叫 requestSubscribeMessage。
- 不宣稱前端廣告完成回調不可偽造；無廣告、未完整觀看、缺配置不開通新提醒。網路結果不明要可查詢與恢復，不能直接要求重看。
- 3 個提前量為 `10800`、`3600`、`600` 秒；已過時點跳過。20 場未完成上限，30 天終態清理；發送恢復窗口 300 秒，絕不超過事件開始。
- 外部發送結果不明不得盲目重試。微信 errcode 0 表示提交微信成功，不表示手機實收。
- TDD 先觀察可解釋的失敗，再寫實作；使用 Node `C:/Users/XB/.codex/runtimes/uwo-review-node22/node-v22.23.3-win-x64/node.exe`。node_modules 已連到原工作區既有依賴，禁止重新安裝根依賴。
- 本次用戶已確認 Demo 並指示繼續實作；不要再詢問實作選項。缺模板可繼續本地開發，正式部署與真通知仍需後續配置及授權。

## 共享接口

由 Task 1 建立 `miniprogram/contracts/major-event-reminder.ts`，Task 2 依此實作適配器：

```ts
export type ReminderLeadSeconds = 10800 | 3600 | 600
export interface ReminderOccurrence {
  zoneId: string
  eventTypeId: string
  triggerAtUnixSeconds: number
}
export type ReminderSlotStatus =
  | 'unsubscribed' | 'authorized' | 'pending' | 'sending' | 'sent'
  | 'failed' | 'unknown' | 'missed' | 'cancelled'
export interface ReminderSlot {
  leadSeconds: ReminderLeadSeconds
  dueAtUnixSeconds: number
  status: ReminderSlotStatus
}
export interface ReminderSubscription {
  key: string
  version: number
  adCompleted: boolean
  slots: ReminderSlot[]
}
export interface ReminderConfig {
  enabled: boolean
  reason: string | null
  templateId: string
  adUnitId: string
}
export interface ReminderInputs {
  getConfig: Record<string, never>
  list: Record<string, never>
  prepare: { occurrence: ReminderOccurrence; requestId: string }
  authorize: { sessionId: string; leadSeconds: ReminderLeadSeconds; requestId: string }
  completeAd: { sessionId: string; requestId: string }
  activate: { sessionId: string; requestId: string }
  cancel: { key: string; expectedVersion: number; requestId: string }
}
export interface ReminderOutputs {
  getConfig: ReminderConfig
  list: { subscriptions: ReminderSubscription[] }
  prepare: { sessionId: string; subscription: ReminderSubscription }
  authorize: { subscription: ReminderSubscription }
  completeAd: { subscription: ReminderSubscription }
  activate: { subscription: ReminderSubscription }
  cancel: { subscription: ReminderSubscription }
}
```

雲函數固定 envelope：成功 `{ ok: true, data }`，失敗 `{ ok: false, code, message }`。`completeAd` 驗證本會話後保存本場廣告完成並開通已登記時點；`activate` 僅供本場已完成廣告的補授權或恢復。重放同一 requestId 不新增授權、會話或任務。`list` 必須覆蓋所有本人的有效待辦，不能被終態紀錄擠出頁面。

### Task 1: 雲端日程、訂閱與排程，連同生成及共享契約

**檔案：** 新增 `cloudfunctions/major-event-reminder/`、`cloudfunctions/major-event-reminder-worker/`、`miniprogram/contracts/major-event-reminder.ts`、`tests/major-event-reminder/`；修改 `tools/data-pipeline/generate.ts`、`generated-output-paths.ts` 與必要的生成契約測試、`package.json` 的 generate:check 路徑（不更動依賴）。新增 `docs/architecture/major-event-reminder-cloudbase.md`。

**產出：** 上述共享接口、可獨立部署的兩個雲函數包、可信排程入口、從 master 生成的參照與版本指紋、TDD 測試證據。

- [ ] 先寫 `tests/major-event-reminder/policy.test.ts`，驗證精確時點、真假日程、重疊規則與前端計算一致。

```ts
expect(policy.availableLeads(eventStart - 3600, eventStart)).toEqual([600])
expect(policy.availableLeads(eventStart - 10801, eventStart)).toEqual([10800, 3600, 600])
expect(policy.availableLeads(eventStart, eventStart)).toEqual([])
```

- [ ] 以 Node 22 執行 `vitest run tests/major-event-reminder`，保留功能缺失的紅燈原因；再實作日程驗證與生成並重跑。
- [ ] 測試並實作 service 與 CloudBase repository：owner 只取 getWXContext；記錄及 session 綁 owner、單場及資料指紋；交易處理重放、版本衝突、20 場上限、部分授權、廣告完成、取消與恢復。以記憶體 repository 驗證真實 service 行為，再以假資料庫適配驗證交易的身份及唯一性，不只斷言 mock 呼叫次數。

```ts
const first = await service.dispatch('authorize', input, owner)
const repeated = await service.dispatch('authorize', input, owner)
expect(repeated).toEqual(first)
expect((await service.dispatch('list', {}, otherOwner)).data.subscriptions).toEqual([])
```

- [ ] 缺模板 ID、欄位映射不完整或無效時 getConfig 回報停用；prepare／completeAd 不得繞過。欄位由伺服器設定且按官方模板型別限制校驗，收件者及通知正文不能由用戶傳入。
- [ ] worker 的原子領取與狀態轉移先寫紅燈：重疊執行只取一次，同用戶同模板串行；已發送不重送、超時結果 unknown 不盲重試、租約失效中的 sending 不能再發、取消／資料漂移／過期排除、清理有界且不刪 pending／sending／unknown 任務。

```ts
await Promise.all([worker.run(), worker.run()])
expect(deliveries).toHaveLength(1)
expect(storedJob.status).toBe('sent')
```

- [ ] 排程只接受可信 Timer 來源，拒絕微信客戶端偽造 event.Type；核對 CloudBase 官方 context／觸發器格式並在部署文件記錄權限要求。單包只能 require 包內檔案；如共享模組需要複製，透過明確生成工具產生，禁止人工維護兩份規則。
- [ ] 建立必要依賴 lock、配置示例（缺模板預設關閉）、集合／索引／服務端權限／每分鐘 cron 與環境變數文件。真雲操作不執行。
- [ ] 執行本任務測試、生成確定性與 data:check，格式化只限本任務檔案；報告新增、修改檔案與紅綠輸出。不要 commit。

### Task 2: 平台流程、狀態恢復、列表與詳情

**檔案：** 新增 `miniprogram/runtime/major-event-reminder-service.ts`、`major-event-reminder-platform.ts`、本功能專用 controller／presenter；修改 `miniprogram/runtime/cloudbase-config.ts`、`miniprogram/subpkg-trade/pages/popularity/index.ts`、`index.wxml`、`index.wxss`、精確網路白名單與必要契約測試；新增 runtime、controller、page 測試及 DevTools 場景。

**消費：** Task 1 的 `ReminderInputs`／`ReminderOutputs`；函數名 `major-event-reminder`。不能更改 Task 1 的 envelope 或把 API 容錯改成靜默成功。

- [ ] 先以測試描述缺配置不得展示廣告、授權拒絕、accept 每次只登記一個 slot；傳輸超時回報 unconfirmed，查詢原 requestId 結果再恢復，嚴格守衛完整回應。
- [ ] 建立 runtime service 的型別化 `invoke<A>(action, input): Promise<ReminderOutputs[A]>` 與有界傳輸超時；僅此檔案使用 wx.cloud.callFunction，函數名固定。配置取自服務端，不能硬編造模板 ID。
- [ ] 平台適配器管理頁面內廣告單例與 onClose／onError 的完整生命週期；完整觀看只接受 isEnded === true，顯示失敗最多一次 load 後重試，不使用任意延時作完成判據。
- [ ] controller 用 `prepare -> authorize(每次點擊) -> completeAd` 開通；本場已完成廣告改走 activate；取消帶 expectedVersion。保留 requestId／sessionId／未確認廣告完成在本機，回前景重新 list／prepare 同一操作；UI 在服務端確認前不打開開關。
- [ ] 訂閱槽採 [10800,3600,600]，距精確時點已到就跳過；部分授權顯示具體覆蓋。session 的事件快照不得因分鐘刷新、切換篩選／詳情而改成別場；離頁後回調不再更新已銷毀頁面。

```ts
await controller.select(occurrence)
await controller.authorize(10800)
expect(view.checked).toBe(false)
await controller.watchAd()
expect(view.checked).toBe(true)
```

- [ ] 依已確認 Demo 實作兩個列表與詳情三處同步開關，catchtap／catchchange 隔離詳情點擊；保留原查詢、展開、圖示降級與矩陣。按流行左右各兩行、移除「最近一場」、放大字與縮小內距，適配窄屏長海域名。
- [ ] 操作浮層提供三個原生點擊授權入口，廣告 CTA 隨覆蓋數顯示；缺配置在看廣告前提示原因；頁面普通顯示僅「提醒訂閱」，具體錯誤／部分覆蓋放操作浮層或 toast。
- [ ] 新增「無配置」場景，透過真實點擊打開開關／日程詳情並截圖；不要把直接調 handler、直接 setData 或 fixture 當真正的授權／廣告證據。
- [ ] 執行 runtime／controller／page／architecture 相關測試及 typecheck，按 TDD 記錄紅綠；不要 commit。

### Task 3: 整體檢查與 HTML 驗收交付

**檔案：** 維護本計畫進度與 `docs/architecture/major-event-reminder-cloudbase.md`；報告存入 `artifacts/miniprogram-review/`。

- [ ] 複核原工作區所有原有 dirty／untracked 指紋不變。
- [ ] 用 Node 22 執行完整 `npm run verify` 與 `git diff --check`，若 clean worktree 缺 staging，僅在隔離工作區按已提交 manifest 執行 assets:ci。無關基線故障明確列出，不夾帶修復。
- [ ] 開發前先 devtools:doctor；頁面完成後 iterate、最終 final，執行既有按流行／日程／矩陣以及新增提醒場景，生成含縮略圖與修改前後對照的 HTML。
- [ ] 核對 320、375、393、430px 文字、開關與時間關係；報告每個實測寬度及缺口。真機廣告、真微信授權與關閉小程序後實收三條通知，沒有實測就明示 not-run。
- [ ] 完成任務與整體代碼審查，修復本功能缺陷；回覆工作區、HTML 報告、倉庫門禁結果、缺少的模板配置及未部署狀態。不要自動提交／推送／合併。
