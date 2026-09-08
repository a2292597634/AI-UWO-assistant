# 航海士資料維護 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立全使用者可提交、管理員可修訂審核、同步後才發布的航海士與關聯資料維護工單流程。

**Architecture:** 新增獨立的 maintenance work order 契約、雲函數資料庫集合與同步轉換器；正式資料仍只由本地同步工具寫入 `data/master/`。小程序以統一可搜尋選擇器取代長 `picker`，重用於航海士、技能、職業、語言與國家；管理員在工單詳情中保存審核修訂後再核准。

**Tech Stack:** TypeScript、微信小程序 WXML/WXSS、CloudBase 雲函數 JavaScript、AJV、Vitest、現有資料流水線。

## Global Constraints

- 所有界面、文件、註釋與交互使用繁體中文；WXML/WXSS 類名使用英文 BEM。
- 資料層固定為 `archive/ → data/master/ → miniprogram/generated/`；不得修改 `archive/`，不得手動修改 `miniprogram/generated/`。
- 修改既有航海士與字典項時必須保留既有正式 ID；新 ID 僅可在受信任同步流程依現行規則產生。
- 小程序運行時不得使用 `wx.request`、`wx.cloud`、遠端 URL 或 Node.js API。
- 不新增、刪除或升級依賴。
- 涉及 UI、WXML 或 WXSS 時，先完整閱讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`，使用既有 Token、88rpx 觸控熱區與安全區規則。
- 所有解析、轉換、校驗、搜尋索引與同步邏輯遵循紅－綠－重構；每個任務完成後先跑聚焦測試。
- 完成前執行 `npm run verify`；提交前展示變更文件、驗證結果與 commit message，等待使用者確認。

---

## 檔案地圖

- Create: `miniprogram/contracts/officer-maintenance.ts` — 工單、候選項、修訂、狀態與 API 契約。
- Create: `miniprogram/domain/officer-maintenance.ts` — 純函式表單、候選項、差異與前端校驗。
- Create: `miniprogram/presenters/maintenance-option-presenter.ts` — 可搜尋選擇器的正規化、別名／ID 搜尋與結果呈現。
- Create: `miniprogram/components/entity-search-picker/index.{json,ts,wxml,wxss}` — 共用可搜尋實體選擇器。
- Create: `miniprogram/subpkg-maintenance/pages/work-orders/index.{json,ts,wxml,wxss}` — 使用者工單列表。
- Create: `miniprogram/subpkg-maintenance/pages/work-order-editor/index.{json,ts,wxml,wxss}` — 新增／修改航海士工單編輯器。
- Create: `miniprogram/subpkg-maintenance/pages/work-order-review/index.{json,ts,wxml,wxss}` — 管理員審核與修訂頁。
- Create: `cloudfunctions/officer-maintenance/index.js`、`service.js`、`repository.js`、`reference-data.json` — 權限、狀態機、CAS 與參考資料。
- Create: `tools/sync-maintenance-work-orders.ts` — 核准工單至 master 資料的轉換與發布標記。
- Modify: `miniprogram/app.json` — 註冊資料維護子包。
- Modify: `miniprogram/runtime/officer-editor-service.ts` 或拆出 `miniprogram/runtime/officer-maintenance-service.ts` — 小程序到雲函數的型別服務。
- Modify: `tools/data-pipeline/generate.ts` 與對應 reference-data 建置流程 — 產出雲端審核需要的 ID 參考快照。
- Modify: `data/schema/officers.schema.json` 僅在工單發布需要的新合法欄位且已獲確認時；本計畫預設不修改正式 schema。
- Create: 對應 `tests/domain/`、`tests/presenters/`、`tests/components/`、`tests/pages/`、`tests/cloudfunctions/`、`tests/tools/` 測試。

## Task 1：建立工單契約與純函式校驗

**Files:**
- Create: `miniprogram/contracts/officer-maintenance.ts`
- Create: `miniprogram/domain/officer-maintenance.ts`
- Create: `tests/domain/officer-maintenance.test.ts`

**Interfaces:**
- Consumes: 既有 `RuntimeDictionaries`、`RuntimeSkill` 與正式航海士資料。
- Produces: `MaintenanceWorkOrderDraft`、`ReferenceCandidate`、`validateMaintenanceDraft`、`buildWorkOrderDiff`。

- [ ] **Step 1: 寫入失敗測試，鎖定新增與修改工單的 ID 規則**

```ts
it('修改工單保留目標 ID 並拒絕未知正式引用', () => {
  const result = validateMaintenanceDraft(updateDraft, context)
  expect(result).toContainEqual({ field: 'targetOfficerId', message: '航海士不存在' })
})

it('候選技能必須選取既有技能分類 ID', () => {
  expect(validateMaintenanceDraft(draftWithUnclassifiedSkill, context)).toContainEqual(
    { field: 'referenceCandidates[0].categoryId', message: '請選擇既有技能分類' },
  )
})
```

- [ ] **Step 2: 執行測試確認紅燈**

Run: `npm.cmd test -- tests/domain/officer-maintenance.test.ts`

Expected: FAIL，原因為契約與校驗函式尚未存在。

- [ ] **Step 3: 實作最小不可變工單型別與校驗**

```ts
export type MaintenanceOperation = 'createOfficer' | 'updateOfficer'
export type MaintenanceStatus =
  | 'draft'
  | 'pendingReview'
  | 'approvedPendingPublish'
  | 'published'
  | 'rejected'

export interface ReferenceCandidate {
  key: string
  kind: 'skill' | 'job' | 'language' | 'nationality'
  name: string
  aliases: string[]
  categoryId?: string
  description?: string
  levelInfo?: string
}
```

`validateMaintenanceDraft` 必須驗證 operation、`targetOfficerId`、正式引用 ID、候選項名稱與同類去重；技能候選項必須有存在於 context 的 `categoryId`。不得把候選項名稱當作正式 ID。

- [ ] **Step 4: 執行聚焦測試**

Run: `npm.cmd test -- tests/domain/officer-maintenance.test.ts`

Expected: PASS。

## Task 2：建立共用可搜尋實體選擇器邏輯

**Files:**
- Create: `miniprogram/presenters/maintenance-option-presenter.ts`
- Create: `tests/presenters/maintenance-option-presenter.test.ts`

**Interfaces:**
- Consumes: `RuntimeDictionaries`、`RuntimeSkill`、使用者查詢字串。
- Produces: `MaintenanceEntityOption`、`searchMaintenanceOptions(options, query)`。

- [ ] **Step 1: 寫入失敗測試，覆蓋名稱、別名、ID 與排序**

```ts
it('以名稱、別名或 ID 搜尋，並將前綴命中排在前方', () => {
  expect(searchMaintenanceOptions(options, '葡')).toMatchObject([
    { id: 'nationality_portugal', name: '葡萄牙' },
  ])
  expect(searchMaintenanceOptions(options, 'nation')).toContainEqual(
    expect.objectContaining({ id: 'nationality_portugal' }),
  )
})
```

- [ ] **Step 2: 執行紅燈測試**

Run: `npm.cmd test -- tests/presenters/maintenance-option-presenter.test.ts`

Expected: FAIL，原因為 presenter 尚未存在。

- [ ] **Step 3: 實作可重用的搜尋與展示模型**

```ts
export interface MaintenanceEntityOption {
  id: string
  name: string
  aliases: string[]
  meta: string
  searchableText: string
}

export const searchMaintenanceOptions = (
  options: readonly MaintenanceEntityOption[],
  query: string,
): MaintenanceEntityOption[] => {
  const normalized = query.trim().toLocaleLowerCase()
  return options
    .filter((option) => !normalized || option.searchableText.includes(normalized))
    .sort((left, right) => {
      const leftRank = left.name.toLocaleLowerCase().startsWith(normalized) ? 0 : 1
      const rightRank = right.name.toLocaleLowerCase().startsWith(normalized) ? 0 : 1
      return leftRank - rightRank || left.name.localeCompare(right.name, 'zh-Hant')
    })
}
```

空白查詢回傳受限首批結果，避免一次將 1,203 項技能傳入長 picker；搜尋結果必須保留 ID 與分類 meta。

- [ ] **Step 4: 執行聚焦測試**

Run: `npm.cmd test -- tests/presenters/maintenance-option-presenter.test.ts`

Expected: PASS。

## Task 3：建立雲函數工單儲存庫與狀態機

**Files:**
- Create: `cloudfunctions/officer-maintenance/repository.js`
- Create: `cloudfunctions/officer-maintenance/service.js`
- Create: `cloudfunctions/officer-maintenance/index.js`
- Create: `tests/cloudfunctions/officer-maintenance-repository.test.ts`
- Create: `tests/cloudfunctions/officer-maintenance-service.test.ts`

**Interfaces:**
- Consumes: CloudBase DB、管理員 OpenID 白名單與生成的 reference data。
- Produces: `saveDraft`、`submit`、`loadMine`、`listMine`、`listAdmin`、`saveReview`、`approve`、`reject`、`listApprovedForSync`、`markPublished` actions。

- [ ] **Step 1: 寫入失敗測試，鎖定權限與合法狀態轉換**

```js
await expect(service.dispatch('approve', payload, 'ordinary-user')).resolves.toMatchObject({
  ok: false,
  code: 'forbidden',
})
await expect(service.dispatch('approve', pendingPayload, 'admin-user')).resolves.toMatchObject({
  ok: true,
  data: expect.objectContaining({ status: 'approvedPendingPublish' }),
})
```

- [ ] **Step 2: 執行紅燈測試**

Run: `npm.cmd test -- tests/cloudfunctions/officer-maintenance-repository.test.ts tests/cloudfunctions/officer-maintenance-service.test.ts`

Expected: FAIL，原因為雲函數模組尚未存在。

- [ ] **Step 3: 實作版本化儲存與伺服端權威校驗**

儲存庫以 `workOrderId`、revision 與 `updatedAt` 做 compare-and-swap；服務端以白名單判斷管理員，不接受前端 `isAdmin`。`saveReview` 新增 history entry，保留 `proposedData`，只更新 `reviewedData`。核准前必須檢查目標航海士基準版本、所有正式 ID、候選項與狀態。

- [ ] **Step 4: 執行聚焦測試**

Run: `npm.cmd test -- tests/cloudfunctions/officer-maintenance-repository.test.ts tests/cloudfunctions/officer-maintenance-service.test.ts`

Expected: PASS，包含普通使用者越權、管理員修訂、衝突與發布狀態測試。

## Task 4：建立小程序服務與資料維護子包入口

**Files:**
- Create: `miniprogram/runtime/officer-maintenance-service.ts`
- Modify: `miniprogram/app.json`
- Create: `tests/runtime/officer-maintenance-service.test.ts`

**Interfaces:**
- Consumes: 雲函數 `officer-maintenance` action 契約。
- Produces: `OfficerMaintenanceService` 與子包路由。

- [ ] **Step 1: 寫入失敗測試，鎖定 action payload 與錯誤轉譯**

```ts
expect(await service.submit(input)).toEqual(expect.objectContaining({ status: 'pendingReview' }))
await expect(service.approve(input)).rejects.toMatchObject({ code: 'conflict' })
```

- [ ] **Step 2: 執行紅燈測試**

Run: `npm.cmd test -- tests/runtime/officer-maintenance-service.test.ts`

Expected: FAIL，原因為 service 尚未存在。

- [ ] **Step 3: 實作型別化 service 並註冊子包**

```ts
export interface OfficerMaintenanceService {
  saveDraft(input: SaveMaintenanceDraftInput): Promise<MaintenanceWorkOrder>
  submit(input: SubmitMaintenanceWorkOrderInput): Promise<MaintenanceWorkOrder>
  saveReview(input: SaveMaintenanceReviewInput): Promise<MaintenanceWorkOrder>
  approve(input: ApproveMaintenanceWorkOrderInput): Promise<MaintenanceWorkOrder>
}
```

service 只能經既有 `wx.cloud.callFunction` 封裝呼叫雲函數；不得在運行時引入 Node API 或網路請求。

- [ ] **Step 4: 執行聚焦測試與網路門禁**

Run: `npm.cmd test -- tests/runtime/officer-maintenance-service.test.ts; npm.cmd run check:runtime-network`

Expected: PASS。

## Task 5：實作可搜尋實體選擇器元件

**Files:**
- Create: `miniprogram/components/entity-search-picker/index.json`
- Create: `miniprogram/components/entity-search-picker/index.ts`
- Create: `miniprogram/components/entity-search-picker/index.wxml`
- Create: `miniprogram/components/entity-search-picker/index.wxss`
- Create: `tests/components/entity-search-picker.test.ts`

**Interfaces:**
- Consumes: `options`、`selectedIds`、`allowCandidate`、`label` properties。
- Produces: `select`、`remove`、`createcandidate` events，payload 為 ID 或候選項草稿。

- [ ] **Step 1: 完整閱讀 Design Foundation 並寫入 WXML/WXSS 靜態契約測試**

```ts
expect(wxml).toContain('bindinput="onQueryInput"')
expect(wxml).toContain('bindtap="onCreateCandidate"')
expect(wxss).toContain('var(--uwo-color-surface)')
expect(wxss).toMatch(/min-height\s*:\s*88rpx/)
```

- [ ] **Step 2: 執行紅燈測試**

Run: `npm.cmd test -- tests/components/entity-search-picker.test.ts`

Expected: FAIL，原因為元件尚未存在。

- [ ] **Step 3: 實作搜尋、選取、標籤與候選項事件**

搜尋輸入以 Task 2 presenter 過濾；每個結果顯示名稱和 meta；無結果且 `allowCandidate` 為 true 時顯示建立候選項操作。技能候選項的分類選擇由父表單傳入既有分類 ID，元件不產生正式 ID。

- [ ] **Step 4: 執行聚焦測試**

Run: `npm.cmd test -- tests/components/entity-search-picker.test.ts`

Expected: PASS。

## Task 6：實作使用者新增／修改工單編輯器

**Files:**
- Create: `miniprogram/subpkg-maintenance/pages/work-order-editor/index.{json,ts,wxml,wxss}`
- Create: `miniprogram/subpkg-maintenance/pages/work-orders/index.{json,ts,wxml,wxss}`
- Create: `tests/pages/work-order-editor-page.test.ts`
- Create: `tests/pages/work-orders-page.test.ts`

**Interfaces:**
- Consumes: Task 1 domain、Task 4 service、Task 5 元件。
- Produces: 新增／修改草稿、提交工單與使用者工單列表。

- [ ] **Step 1: 完整閱讀 Design Foundation 並寫入紅燈頁面契約測試**

```ts
expect(wxml).toContain('正在修改')
expect(wxml).toContain('<entity-search-picker')
expect(wxml).toContain('bindtap="onSubmit"')
expect(wxss).toContain('env(safe-area-inset-bottom)')
```

- [ ] **Step 2: 執行紅燈測試**

Run: `npm.cmd test -- tests/pages/work-order-editor-page.test.ts tests/pages/work-orders-page.test.ts`

Expected: FAIL，原因為頁面尚未存在。

- [ ] **Step 3: 實作新增與修改載入流程**

修改模式必須在導航參數帶入 `targetOfficerId`，載入正式資料後保存基準版本與快照。技能、職業、語言、國家皆使用 Task 5 元件；新增技能候選項要求選擇既有技能分類。草稿保存與送審均呈現明確錯誤與 loading 狀態。

- [ ] **Step 4: 執行聚焦測試**

Run: `npm.cmd test -- tests/pages/work-order-editor-page.test.ts tests/pages/work-orders-page.test.ts`

Expected: PASS，覆蓋候選項、修改 ID 固定與提交錯誤。

## Task 7：實作管理員差異審核與直接修訂

**Files:**
- Create: `miniprogram/subpkg-maintenance/pages/work-order-review/index.{json,ts,wxml,wxss}`
- Create: `miniprogram/presenters/officer-maintenance-presenter.ts`
- Create: `tests/presenters/officer-maintenance-presenter.test.ts`
- Create: `tests/pages/work-order-review-page.test.ts`

**Interfaces:**
- Consumes: 工單 `proposedData`、`reviewedData`、基準快照與管理員 service actions。
- Produces: 欄位級差異、管理員修訂保存、候選項合併、核准與駁回。

- [ ] **Step 1: 寫入紅燈差異與管理員互動測試**

```ts
expect(buildMaintenanceDiff(base, reviewed)).toContainEqual(
  expect.objectContaining({ field: 'jobId', before: 'job_a', after: 'job_b' }),
)
expect(wxml).toContain('bindtap="onSaveReview"')
expect(wxml).toContain('bindtap="onApprove"')
```

- [ ] **Step 2: 執行紅燈測試**

Run: `npm.cmd test -- tests/presenters/officer-maintenance-presenter.test.ts tests/pages/work-order-review-page.test.ts`

Expected: FAIL，原因為 presenter 與頁面尚未存在。

- [ ] **Step 3: 實作差異檢視與管理員修訂**

管理員可在同一表單修正所有欄位與候選項，並可指定候選項合併到既有 ID。保存時呼叫 `saveReview`，核准前顯示最新差異與衝突；駁回必填原因。UI 以文字加狀態樣式呈現，不只依賴色彩。

- [ ] **Step 4: 執行聚焦測試**

Run: `npm.cmd test -- tests/presenters/officer-maintenance-presenter.test.ts tests/pages/work-order-review-page.test.ts`

Expected: PASS。

## Task 8：實作核准工單同步與 master 資料合併

**Files:**
- Create: `tools/sync-maintenance-work-orders.ts`
- Create: `tests/tools/sync-maintenance-work-orders.test.ts`
- Modify: `tools/data-pipeline/generate.ts` 與 `tools/data-pipeline/build-officer-reference-data.ts`
- Modify: `cloudfunctions/officer-maintenance/reference-data.json`（僅由生成流程產出）

**Interfaces:**
- Consumes: `approvedPendingPublish` 工單、既有 `data/master/officers.json`、`skills.json`、`dictionaries.json`。
- Produces: 維持既有 ID 的 master 資料陣列、資料集版本與 `markPublished` 回寫。

- [ ] **Step 1: 寫入紅燈同步轉換測試**

```ts
it('修改航海士時保留既有 officer ID', () => {
  const result = applyApprovedWorkOrders(master, [approvedUpdate])
  expect(result.officers.find((item) => item.id === 'officer_existing')?.jobId).toBe('job_new')
})

it('核准候選技能只產生一次正式 ID 並回填航海士引用', () => {
  const result = applyApprovedWorkOrders(master, [approvedCreate])
  expect(result.skills).toContainEqual(expect.objectContaining({ name: '新技能' }))
  expect(result.officers[0].skills[0].skillId).toMatch(/^skill_/)
})
```

- [ ] **Step 2: 執行紅燈測試**

Run: `npm.cmd test -- tests/tools/sync-maintenance-work-orders.test.ts`

Expected: FAIL，原因為同步工具尚未存在。

- [ ] **Step 3: 實作純轉換、原子寫入與發布標記**

同步器必須先完整轉換至記憶體，再以暫存檔與原子替換寫入三份 master 資料；若名稱衝突、正式 ID 衝突、schema 或引用校驗失敗則不寫入。正式 ID 使用現行資料的前綴與不衝突序號規則；不得變更任何既有 ID。只有 `data:check`、資料生成、資產與發布成功後才呼叫 `markPublished`。

- [ ] **Step 4: 執行同步與資料聚焦驗證**

Run: `npm.cmd test -- tests/tools/sync-maintenance-work-orders.test.ts; npm.cmd run data:check; npm.cmd run data:generate`

Expected: PASS；生成結果只能由工具改動。

## Task 9：回歸驗證與人工驗收

**Files:**
- Modify: `tests/domain/officer-maintenance.test.ts`、`tests/presenters/maintenance-option-presenter.test.ts`、`tests/cloudfunctions/officer-maintenance-*.test.ts`、`tests/runtime/officer-maintenance-service.test.ts`、`tests/components/entity-search-picker.test.ts`、`tests/pages/work-order-*.test.ts`、`tests/tools/sync-maintenance-work-orders.test.ts`。

**Interfaces:**
- Consumes: 所有前序任務。
- Produces: 完整驗證紀錄與人工驗收結果。

- [ ] **Step 1: 執行完整自動驗證**

Run: `npm.cmd run verify`

Expected: format、lint、typecheck、Vitest、runtime-network、包體積、資料校驗與生成檢查全部 PASS。

- [ ] **Step 2: 執行範圍與禁止目錄檢查**

Run: `git diff --check; git diff --name-only -- archive miniprogram/generated; git status --short`

Expected: 空白檢查通過；`archive/` 無變更；`miniprogram/generated/` 只可能為執行生成造成且需由 `generate:check` 驗證的輸出。

- [ ] **Step 3: 人工驗收**

在 320、375、393、430px 寬度驗證：使用者可搜尋並選取 1,203 項技能、建立候選技能並選擇分類；可新增與修改航海士且修改時 ID 不變；管理員可檢視差異、直接修訂、合併候選項、核准或駁回；衝突工單不可核准；同步後正式名鑑才顯示變更；頁面無橫向溢出且操作熱區符合 88rpx。

- [ ] **Step 4: 提交前交接**

展示變更檔案、完整驗證結果、人工驗收清單與各任務建議 commit message；等待使用者確認後才 stage、commit、合併或推送。

## 自我審查

- 規格覆蓋：Task 1、3、8 覆蓋 ID、工單、候選項、狀態與發布；Task 2、5、6 覆蓋搜尋與使用者填報；Task 7 覆蓋管理員直接修訂；Task 9 覆蓋門禁。
- 範圍：計畫依可獨立驗證的契約、搜尋、雲端、使用者頁、管理員頁、同步分拆；不包含刪除能力與無關重構。
- 型別：`MaintenanceWorkOrder`、`ReferenceCandidate`、`OfficerMaintenanceService` 與狀態名稱在各任務一致。
