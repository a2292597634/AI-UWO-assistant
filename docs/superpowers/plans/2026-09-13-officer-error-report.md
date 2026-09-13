# 航海士資料錯誤回報 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將面向普通使用者的完整航海士維護表單替換為既有航海士錯誤回報，並在小程序內提供「我的回報」及管理員審核閉環。

**Architecture:** 沿用 `officer-maintenance` Cloud Function、登入與管理員白名單邊界，但為錯誤回報建立獨立契約與 repository 方法，避免把完整 canonical 工單欄位繼續暴露給普通使用者。正式資料仍只由線下修改 `data/master/`；線上「已修正」只記錄處理狀態與資料版本，不直接寫入名鑑。

**Tech Stack:** TypeScript、微信小程序 WXML/WXSS、CloudBase Cloud Function、Vitest。

## Global Constraints

- 所有界面、註釋、文檔與使用者訊息使用繁體中文。
- 編碼前完整閱讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`，新樣式只使用 `--uwo-*` Token。
- 不修改 `archive/`，不手動修改 `miniprogram/generated/`。
- 不新增、刪除或升級依賴。
- 不在小程序運行時新增 `wx.request`、遠程 URL、Node.js API；CloudBase 呼叫只存在於 service 邊界。
- 資料轉換、校驗、狀態流轉遵循紅—綠—重構。
- 每個 commit 前展示變更文件、驗證結果與擬用 message，取得使用者確認後才能提交。

---

## File Map

- `miniprogram/contracts/officer-error-report.ts`：錯誤報告、附件、狀態與 action 輸入契約。
- `miniprogram/domain/officer-error-report.ts`：表單校驗及狀態轉移純函式。
- `miniprogram/runtime/officer-error-report-service.ts`：唯一小程序 CloudBase 適配器。
- `cloudfunctions/officer-maintenance/error-report-repository.js`：`officer_error_reports` 集合存取與樂觀鎖。
- `cloudfunctions/officer-maintenance/error-report-service.js`：登入、所有權、管理員權限與狀態轉移。
- `miniprogram/pages/officer-editor/*`：改造成錯誤回報入口與表單。
- `miniprogram/subpkg-maintenance/pages/work-orders/*`：改造成「我的回報」。
- `miniprogram/subpkg-maintenance/pages/work-order-review/*`：改造成管理員回報列表與詳情。
- `tests/domain/officer-error-report.test.ts`、`tests/runtime/officer-error-report-service.test.ts`、`tests/cloudfunctions/officer-error-report-*.test.ts`、`tests/pages/*`：分層行為保護。

### Task 1: 定義錯誤報告契約與校驗

**Files:**
- Create: `miniprogram/contracts/officer-error-report.ts`
- Create: `miniprogram/domain/officer-error-report.ts`
- Create: `tests/domain/officer-error-report.test.ts`

**Interfaces:**
- Produces: `OfficerErrorType`、`OfficerErrorReportStatus`、`OfficerErrorReportDraft`、`OfficerErrorReport`、`validateOfficerErrorReportDraft()`、`canTransitionErrorReport()`。

- [ ] **Step 1: 寫入失敗測試**

測試必須證明：航海士 ID、至少一個錯誤類型、錯誤說明及建議內容必填；來源網址與截圖可以同時為空；最多三張截圖；終態只讀；`needsInfo` 可由使用者補充後返回 `pending`。

```ts
expect(
  validateOfficerErrorReportDraft({
    officerId: 'officer_1',
    errorTypes: ['skill'],
    description: '技能等級顯示錯誤',
    suggestedCorrection: '應顯示 Lv.2',
    sourceUrl: '',
    screenshotFileIds: [],
    supplement: '',
  }),
).toEqual([])
expect(canTransitionErrorReport('pending', 'accept', 'admin')).toBe(true)
expect(canTransitionErrorReport('fixed', 'supplement', 'owner')).toBe(false)
```

- [ ] **Step 2: 執行測試並確認因模組不存在而失敗**

Run: `npx vitest run tests/domain/officer-error-report.test.ts`

- [ ] **Step 3: 實作最小契約與純函式**

狀態固定為 `pending | needsInfo | accepted | fixed | rejected`；錯誤類型固定為 `basic | skill | skillLevel | recruitment | portrait | text | other`。錯誤陣列輸出 `{ field, message }`，供頁面就地顯示。

- [ ] **Step 4: 執行 focused test**

Run: `npx vitest run tests/domain/officer-error-report.test.ts`

- [ ] **Step 5: 準備 commit checkpoint**

擬用 message：`feat: 定義航海士錯誤回報契約`

### Task 2: 建立 Cloud Function 儲存與權限邊界

**Files:**
- Create: `cloudfunctions/officer-maintenance/error-report-repository.js`
- Create: `cloudfunctions/officer-maintenance/error-report-service.js`
- Modify: `cloudfunctions/officer-maintenance/index.js`
- Test: `tests/cloudfunctions/officer-error-report-repository.test.ts`
- Test: `tests/cloudfunctions/officer-error-report-service.test.ts`
- Modify: `tests/cloudfunctions/officer-maintenance-index.test.ts`

**Interfaces:**
- Consumes: Task 1 狀態與 action 語義。
- Produces: `createReport`、`listMyReports`、`appendReportSupplement`、`listReportsForAdmin`、`requestReportInfo`、`acceptReport`、`rejectReport`、`markReportFixed` actions。

- [ ] **Step 1: 寫 repository 失敗測試**

覆蓋建立記錄、按 `ownerOpenId` 隔離列表、按 `status` 倒序列出、`revision + updatedAt` 樂觀鎖以及歷史記錄追加。

- [ ] **Step 2: 執行 repository 測試確認失敗**

Run: `npx vitest run tests/cloudfunctions/officer-error-report-repository.test.ts`

- [ ] **Step 3: 實作 `officer_error_reports` repository**

記錄保存原始報告、只追加的 `supplements`、管理員 `reviewReply`、`fixedDatasetVersion`、`history`、`revision`、`createdAt` 與 `updatedAt`。使用者提交的 `ownerOpenId`、狀態、歷史和版本欄位不得直接寫入。

- [ ] **Step 4: 寫 service 失敗測試**

覆蓋未登入拒絕、使用者只能讀自己的報告、非管理員不能審核、要求補充與拒絕必須有回覆、標記已修正必須有資料版本、非法狀態轉移不改資料。

- [ ] **Step 5: 實作 service 並接入既有入口**

`OPENID` 只從 `cloud.getWXContext()` 取得；管理員沿用 `OFFICER_MAINTENANCE_ADMIN_OPENIDS`。所有 action 回傳既有 `{ ok, data }` 或 `{ ok: false, code, message }` 形狀。

- [ ] **Step 6: 執行 Cloud Function focused tests**

Run: `npx vitest run tests/cloudfunctions/officer-error-report-repository.test.ts tests/cloudfunctions/officer-error-report-service.test.ts tests/cloudfunctions/officer-maintenance-index.test.ts`

- [ ] **Step 7: 準備 commit checkpoint**

擬用 message：`feat: 新增錯誤回報服務端流程`

### Task 3: 建立小程序服務適配器

**Files:**
- Create: `miniprogram/runtime/officer-error-report-service.ts`
- Create: `tests/runtime/officer-error-report-service.test.ts`

**Interfaces:**
- Consumes: Task 1 契約、Task 2 action 名稱。
- Produces: `OfficerErrorReportService` 與 `getOfficerErrorReportService()`。

- [ ] **Step 1: 寫失敗測試**

逐一斷言每個方法呼叫 `OFFICER_MAINTENANCE_FUNCTION_NAME`、傳送正確 action，並把未知回應及呼叫失敗統一轉成安全的 `network` 錯誤。

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run tests/runtime/officer-error-report-service.test.ts`

- [ ] **Step 3: 實作適配器**

頁面只能透過此適配器提交、列出、補充或審核回報，不得直接使用 `wx.cloud`。

- [ ] **Step 4: 執行 focused test**

Run: `npx vitest run tests/runtime/officer-error-report-service.test.ts`

- [ ] **Step 5: 準備 commit checkpoint**

擬用 message：`feat: 接入錯誤回報小程序服務`

### Task 4: 將資料維護入口改造成錯誤回報表單

**Files:**
- Modify: `miniprogram/pages/officer-editor/index.ts`
- Modify: `miniprogram/pages/officer-editor/index.wxml`
- Modify: `miniprogram/pages/officer-editor/index.wxss`
- Modify: `miniprogram/pages/officer-editor/index.json`
- Modify: `miniprogram/pages/catalog/index.ts`
- Modify: `miniprogram/subpkg-detail/pages/detail/index.ts`
- Modify: `tests/pages/officer-editor-page.test.ts`
- Modify: `tests/pages/catalog-page.test.ts`
- Modify: `tests/pages/detail-page.test.ts`

**Interfaces:**
- Consumes: `getCatalog()`、Task 1 校驗、Task 3 `createReport()`。
- Produces: 可從資料維護入口搜尋航海士，或從詳情頁帶入 `officerId` 的回報表單。

- [ ] **Step 1: 寫頁面契約失敗測試**

斷言頁面不再出現「新增航海士」及 canonical 技術欄位；包含航海士選擇、錯誤類型、錯誤說明、建議內容、選填來源、最多三張截圖和就地錯誤訊息；詳情頁包含「回報資料錯誤」導航。

- [ ] **Step 2: 執行頁面測試確認失敗**

Run: `npx vitest run tests/pages/officer-editor-page.test.ts tests/pages/catalog-page.test.ts tests/pages/detail-page.test.ts`

- [ ] **Step 3: 實作頁面 Controller 與 WXML**

提交時先用 `validateOfficerErrorReportDraft()`；未登入或網路失敗保留表單；成功後顯示回報編號與「查看我的回報」。來源網址與截圖沒有填寫時不得阻止提交。

- [ ] **Step 4: 實作符合 Design Foundation 的 WXSS**

主要提交按鈕至少 `88rpx`；錯誤、處理中與成功均有可見文字；普通卡片不加陰影；底部操作使用安全區；在 320px 不產生橫向捲動。

- [ ] **Step 5: 執行頁面與架構測試**

Run: `npx vitest run tests/pages/officer-editor-page.test.ts tests/pages/catalog-page.test.ts tests/pages/detail-page.test.ts tests/architecture/design-foundation.test.ts`

- [ ] **Step 6: 準備 commit checkpoint**

擬用 message：`feat: 將資料維護改為錯誤回報`

### Task 5: 將工單列表改造成「我的回報」

**Files:**
- Modify: `miniprogram/subpkg-maintenance/pages/work-orders/index.ts`
- Modify: `miniprogram/subpkg-maintenance/pages/work-orders/index.wxml`
- Modify: `miniprogram/subpkg-maintenance/pages/work-orders/index.wxss`
- Modify: `tests/pages/work-orders-page.test.ts`

**Interfaces:**
- Consumes: Task 3 `listMine()` 與 `appendSupplement()`。
- Produces: 我的回報列表、狀態詳情及要求補充時的追加入口。

- [ ] **Step 1: 寫失敗測試**

覆蓋載入、空列表、錯誤重試、五種狀態文字、管理員回覆、追加內容以及終態只讀。

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run tests/pages/work-orders-page.test.ts`

- [ ] **Step 3: 實作列表與補充流程**

原始報告始終只讀；只有 `needsInfo` 顯示追加操作。追加成功後狀態回到 `pending`，本地以服務端回傳記錄替換舊記錄。

- [ ] **Step 4: 執行 focused test**

Run: `npx vitest run tests/pages/work-orders-page.test.ts`

- [ ] **Step 5: 準備 commit checkpoint**

擬用 message：`feat: 新增我的錯誤回報列表`

### Task 6: 改造管理員審核工作台

**Files:**
- Modify: `miniprogram/subpkg-maintenance/pages/work-order-review/index.ts`
- Modify: `miniprogram/subpkg-maintenance/pages/work-order-review/index.wxml`
- Modify: `miniprogram/subpkg-maintenance/pages/work-order-review/index.wxss`
- Modify: `miniprogram/subpkg-maintenance/pages/work-orders/index.ts`
- Modify: `tests/pages/work-order-review-page.test.ts`
- Modify: `tests/pages/work-orders-page.test.ts`

**Interfaces:**
- Consumes: Task 3 管理員列表及狀態 action。
- Produces: 待確認、要求補充、已採納、已修正、不採納的列表與操作。

- [ ] **Step 1: 寫失敗測試**

斷言要求補充與不採納必填原因、已修正必填資料版本、操作中禁用重複提交、衝突時重新載入、每個狀態均有文字而非只靠顏色。

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run tests/pages/work-order-review-page.test.ts tests/pages/work-orders-page.test.ts`

- [ ] **Step 3: 實作管理員頁面**

預設按更新時間倒序顯示 `pending`；操作成功後使用服務端回傳記錄更新頁面。管理員只能處理錯誤報告，不在此頁直接編輯 canonical 航海士資料。

- [ ] **Step 4: 執行 focused test**

Run: `npx vitest run tests/pages/work-order-review-page.test.ts tests/pages/work-orders-page.test.ts`

- [ ] **Step 5: 準備 commit checkpoint**

擬用 message：`feat: 改造錯誤回報審核工作台`

### Task 7: 收斂舊入口並完成驗證

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `tests/integration/maintenance-feature-contract.test.ts`
- Modify: `tests/pages/home-page.test.ts`
- Modify: `docs/superpowers/specs/2026-09-13-officer-error-report-and-offline-intake-design.md`

**Interfaces:**
- Consumes: Tasks 1–6 的完整功能。
- Produces: 只暴露錯誤回報的正式路由與驗收記錄。

- [ ] **Step 1: 寫整合契約失敗測試**

斷言普通使用者路由不再提供新增完整航海士表單；詳情與資料維護入口均進入錯誤回報；我的回報與管理員審核路由存在；舊同步工具及 `data/master/` 不被線上回報直接修改。

- [ ] **Step 2: 更新路由與舊入口**

移除不再可達的完整編輯入口；暫不刪除仍被線下發布流程使用的 Cloud Function 或同步工具。任何確認為完全無引用的舊頁面刪除，必須先列出精確文件並再次取得使用者確認。

- [ ] **Step 3: 執行 focused regression**

Run: `npx vitest run tests/domain/officer-error-report.test.ts tests/runtime/officer-error-report-service.test.ts tests/cloudfunctions/officer-error-report-repository.test.ts tests/cloudfunctions/officer-error-report-service.test.ts tests/pages/officer-editor-page.test.ts tests/pages/work-orders-page.test.ts tests/pages/work-order-review-page.test.ts tests/pages/catalog-page.test.ts tests/pages/detail-page.test.ts tests/integration/maintenance-feature-contract.test.ts`

- [ ] **Step 4: 執行完整門禁**

Run: `npm run verify`

- [ ] **Step 5: 完成人工驗收**

在微信 DevTools 的 320／375／393／430px 寬度驗證提交、我的回報、要求補充、管理員審核、載入失敗重試與安全區；記錄未能完成的真機條件，不把未驗收項聲稱為通過。

- [ ] **Step 6: 展示提交前證據**

展示變更文件、focused tests、`npm run verify`、人工驗收結果及擬用 message `feat: 將航海士維護改為錯誤回報`，等待使用者確認後再提交。
