# 航海士維護頭像與管理員入口修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓新增航海士工單可完成手機頭像裁切／上傳並由白名單管理員從維護列表進入待審核工作台。

**Architecture:** 頭像附件與正式 `MaintenanceOfficerData` 分離；小程序以微信原生選圖、1:1 裁切與壓縮取得暫存檔，維護雲函數校驗後上傳 Storage 並只保存檔案參照。維護列表以 `listAdmin('pendingReview')` 的成功回應決定是否顯示管理員入口，審核頁和服務端權限模型保持不變。

**Tech Stack:** 微信小程序 TypeScript/WXML/WXSS、CloudBase `wx-server-sdk`、Vitest、既有 image validation 與資料同步工具；不新增依賴。

## Global Constraints

- `archive/` 唯讀；正式資料只由既有同步工具寫入 `data/master/`；不得手改 `miniprogram/generated/`。
- 修改既有航海士不得變更正式 ID；`portraitId`、視覺等級與顯示排序由系統／同步規則設定。
- 小程序運行時不得使用 `wx.request`、遠端 URL 或 Node.js API；CloudBase 呼叫只經既有 runtime adapter。
- 不新增、刪除或升級依賴；所有 UI/WXML/WXSS 使用 Design Foundation Token、88rpx 觸控熱區與安全區規則。
- 影像限制固定為 PNG/JPG/JPEG、512 KB、最長邊 512 px；新增工單送審必須有已上傳頭像，草稿可以暫缺。
- 每一項行為先寫失敗測試、確認 RED，再寫最小實作並確認 GREEN；每個任務完成後執行聚焦測試。

---

### Task 1：維護頭像附件契約與雲函數上傳

**Files:**
- Modify: `miniprogram/contracts/officer-maintenance.ts`
- Modify: `miniprogram/runtime/officer-maintenance-service.ts`
- Modify: `cloudfunctions/officer-maintenance/service.js`
- Create: `cloudfunctions/officer-maintenance/image-validation.js`（沿用既有純 Node 圖片檢查邏輯，不新增依賴）
- Test: `tests/runtime/officer-maintenance-service.test.ts`
- Test: `tests/cloudfunctions/officer-maintenance-service.test.ts`

**Interfaces:**
- `MaintenancePortraitMeta`: `{ mimeType: 'image/png' | 'image/jpeg'; byteSize: number; width: number; height: number }`。
- `MaintenancePortraitUpload`: `{ base64: string; meta: MaintenancePortraitMeta }`，只存在 runtime request，不寫入工單資料。
- `MaintenanceWorkOrder`: 新增可選 `portraitFileId` 與 `portraitMeta`，兩者均為附件參照／檢查資訊，不加入 `MaintenanceOfficerData`。
- `saveDraft`／`submit` 接受可選 `portraitUpload`；Cloud Function 只在提供新附件時上傳，新增送審與核准再次要求 `portraitFileId` 存在。

- [ ] **Step 1: 寫入失敗測試**

在 runtime service 測試新增：

```ts
it('保存草稿時傳送裁切後頭像附件，不傳送正式 portraitId', async () => {
  const portraitUpload = {
    base64: 'png-base64',
    meta: { mimeType: 'image/png' as const, byteSize: 128, width: 256, height: 256 },
  }
  mockCallFunction.mockResolvedValue({ result: { ok: true, data: { status: 'draft' } } })
  await createOfficerMaintenanceService().saveDraft({ ...draftInput, portraitUpload })
  expect(mockCallFunction).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ action: 'saveDraft', portraitUpload }),
  }))
  expect(mockCallFunction.mock.calls[0]?.[0].data.portraitId).toBeUndefined()
})
```

在 Cloud Function 測試新增：無附件的 `createOfficer` 送審回傳 `invalid-data`，合法 PNG 附件呼叫注入的 `cloud.uploadFile` 並保存 `portraitFileId`。

- [ ] **Step 2: 執行 RED**

Run: `npm test -- --run tests/runtime/officer-maintenance-service.test.ts tests/cloudfunctions/officer-maintenance-service.test.ts`

Expected: FAIL，因 runtime 型別、雲函數上傳與送審附件門禁尚不存在。

- [ ] **Step 3: 最小實作**

將舊投稿 `image-validation.js` 的 PNG/JPEG 尺寸與 512 KB 純解析邏輯複製到維護雲函數；服務端在 `saveDraft`／`submit` 建立或更新版本時上傳至 `officer-maintenance/<workOrderId>/revision-<revision>-<token>.<ext>`，並把回傳 file ID／meta 放入工單。`toClientRecord` 與 history snapshot 只回傳參照，不回傳 base64。新增工單的 `submit` 和 `approve` 在沒有參照時拒絕；修改工單維持既有頭像。

- [ ] **Step 4: 執行 GREEN 與聚焦回歸**

Run: `npm test -- --run tests/runtime/officer-maintenance-service.test.ts tests/cloudfunctions/officer-maintenance-service.test.ts`

Expected: PASS，既有狀態機、CAS、權限測試不回歸。

- [ ] **Step 5: Commit**

```bash
git add miniprogram/contracts/officer-maintenance.ts miniprogram/runtime/officer-maintenance-service.ts cloudfunctions/officer-maintenance tests/runtime/officer-maintenance-service.test.ts tests/cloudfunctions/officer-maintenance-service.test.ts
git commit -m "feat: 支援維護工單頭像附件上傳"
```

### Task 2：編輯器手機裁切與頭像必填 UI

**Files:**
- Modify: `miniprogram/subpkg-maintenance/pages/work-order-editor/page.ts`
- Modify: `miniprogram/subpkg-maintenance/pages/work-order-editor/index.wxml`
- Modify: `miniprogram/subpkg-maintenance/pages/work-order-editor/index.wxss`
- Modify: `tests/pages/work-order-editor-page.test.ts`

**Interfaces:**
- 頁面狀態保存 `portraitTempPath`、`portraitMetaText`、`portraitUpload`；`choosePortrait` 依序呼叫 `wx.chooseImage` → `wx.cropImage({ cropScale: '1:1' })` → `wx.compressImage` → `wx.getImageInfo`／`statSync`。
- `persist` 將新選圖的 `portraitUpload` 傳給 `saveDraft`；保存回傳的 `portraitFileId` 後清除 base64，送審只依服務端已保存附件判斷。

- [ ] **Step 1: 寫入失敗測試**

新增頁面測試，斷言新增模式 WXML 有頭像操作與限制文字，且 `onPortraitTap` 會呼叫裁切：

```ts
it('新增模式提供 1:1 頭像裁切並在保存時傳送附件', async () => {
  expect(wxml).toContain('bindtap="onPortraitTap"')
  expect(wxml).toContain('PNG、JPG 或 JPEG')
  wx.chooseImage.mockImplementationOnce(({ success }) => success({ tempFilePaths: ['/tmp/a.jpg'] }))
  wx.cropImage.mockImplementationOnce(({ success }) => success({ tempFilePath: '/tmp/crop.jpg' }))
  // 斷言 saveDraft payload 含裁切後 meta，且不含 portraitId 輸入欄位。
})
```

- [ ] **Step 2: 執行 RED**

Run: `npm test -- --run tests/pages/work-order-editor-page.test.ts`

Expected: FAIL，因維護編輯器目前沒有頭像資料狀態、裁切事件或頭像區塊。

- [ ] **Step 3: 最小實作**

新增頭像卡片，只在新增模式要求附件；管理員模式顯示唯讀預覽。裁切取消或失敗只顯示提示並保留其他表單；壓縮後若格式／尺寸超限顯示錯誤。移除只清除尚未上傳的暫存狀態；已保存附件在草稿回載時保留。

- [ ] **Step 4: 執行 GREEN、WXML 與樣式檢查**

Run: `npm test -- --run tests/pages/work-order-editor-page.test.ts; git diff --check`

Expected: PASS；WXML 不使用 ID 輸入，按鈕與裁切操作符合 Design Foundation。

- [ ] **Step 5: Commit**

```bash
git add miniprogram/subpkg-maintenance/pages/work-order-editor tests/pages/work-order-editor-page.test.ts
git commit -m "feat: 新增維護航海士頭像裁切介面"
```

### Task 3：管理員入口與待審核提示

**Files:**
- Modify: `miniprogram/subpkg-maintenance/pages/work-orders/index.ts`
- Modify: `miniprogram/subpkg-maintenance/pages/work-orders/index.wxml`
- Modify: `miniprogram/subpkg-maintenance/pages/work-orders/index.wxss`
- Modify: `tests/pages/work-orders-page.test.ts`

**Interfaces:**
- `WorkOrdersPageData.adminReviewVisible: boolean`、`adminReviewCount: number`。
- `onShow` 並行呼叫 `listMine()` 與 `listAdmin('pendingReview')`；只有管理員呼叫成功才設 `adminReviewVisible: true`，普通使用者 forbidden 不影響自己的列表錯誤。
- `onAdminReview` 導航 `/subpkg-maintenance/pages/work-order-review/index`；審核頁仍由服務端再次驗證權限。

- [ ] **Step 1: 寫入失敗測試**

新增頁面測試：

```ts
it('管理員待審核探測成功時顯示審核工作台入口與筆數', async () => {
  listMine.mockResolvedValue([])
  listAdmin.mockResolvedValue([{ workOrderId: 'wo', status: 'pendingReview' }])
  await page!.loadWorkOrders()
  expect(page!.data.adminReviewVisible).toBe(true)
  expect(page!.data.adminReviewCount).toBe(1)
  page!.onAdminReview()
  expect(navigateTo).toHaveBeenCalledWith({ url: '/subpkg-maintenance/pages/work-order-review/index' })
})
```

另測普通使用者 `listAdmin` 拒絕時入口為 false、`loadError` 仍為空。

- [ ] **Step 2: 執行 RED**

Run: `npm test -- --run tests/pages/work-orders-page.test.ts`

Expected: FAIL，因頁面目前沒有管理員狀態或入口。

- [ ] **Step 3: 最小實作**

在 `onShow` 以 `Promise.allSettled` 或等價方式載入兩個清單；`OfficerMaintenanceError.code === 'forbidden'` 只隱藏管理員入口，其他 admin 載入錯誤也不覆蓋使用者列表錯誤。WXML 只有 `adminReviewVisible` 時顯示次要按鈕與「待審核 N 筆」文字。

- [ ] **Step 4: 執行 GREEN**

Run: `npm test -- --run tests/pages/work-orders-page.test.ts`

Expected: PASS，新增／修改入口與原工單列表測試均通過。

- [ ] **Step 5: Commit**

```bash
git add miniprogram/subpkg-maintenance/pages/work-orders tests/pages/work-orders-page.test.ts
git commit -m "feat: 新增維護工單管理員審核入口"
```

### Task 4：完整驗證與人工驗收

**Files:**
- No generated or archive files may change.

- [ ] **Step 1: 執行完整門禁**

Run: `npm run verify`

Expected: format、lint、typecheck、Vitest、runtime-network、包體積、素材、資料與生成檢查全部 PASS。

- [ ] **Step 2: 編譯維護頁 WXML**

Run:

```powershell
$wcc = 'D:\微信web开发者工具\resources\app.asar.unpacked\node_modules\wcc-exec\wcc.exe'
foreach ($page in @('miniprogram/subpkg-maintenance/pages/work-orders/index.wxml','miniprogram/subpkg-maintenance/pages/work-order-editor/index.wxml','miniprogram/subpkg-maintenance/pages/work-order-review/index.wxml')) { & $wcc $page -o NUL; if ($LASTEXITCODE -ne 0) { throw "WXML compile failed: $page" } }
```

Expected: 三個維護頁均編譯成功。

- [ ] **Step 3: 執行範圍檢查**

Run: `git diff --check; git diff --name-only -- archive miniprogram/generated; git status --short`

Expected: 無空白錯誤、禁止目錄無差異、工作樹只含本任務修改。

- [ ] **Step 4: 提交前交接**

展示變更檔案、測試輸出、WXML 編譯結果與擬用 commit message；合併前確認本地 `main` 已快轉，未推送遠端除非使用者另行要求。
