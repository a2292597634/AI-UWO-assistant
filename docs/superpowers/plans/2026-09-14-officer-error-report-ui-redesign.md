# 航海士資料錯誤回報頁 UI 重設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將資料錯誤回報頁重做為統一、克制的單一資料卡表單，加入完整航海士身份資訊、可搜尋選擇、字段級校驗、可收合證據區及帶回報編號的成功狀態。

**Architecture:** 保留既有 `OfficerErrorReportDraft`、CloudBase service 與後端 action；新增純 Presenter 將 catalog、維護資料和字典投影為頁面身份卡與搜尋選項。頁面 Controller 只管理 UI 狀態、校驗映射、證據展開及提交結果，WXML/WXSS 依 Design Foundation 建立單一表單容器。

**Tech Stack:** TypeScript、微信小程序 WXML/WXSS、CloudBase、Vitest。

## Global Constraints

- 界面、代碼註釋與文檔使用繁體中文；必要 API、類型及文件名保留英文。
- 編碼前遵循 `docs/superpowers/specs/2026-08-09-design-foundation-design.md` 與 `docs/superpowers/specs/2026-09-14-officer-error-report-ui-redesign-design.md`。
- 不修改 `archive/`、`data/master/` 或手動修改 `miniprogram/generated/`。
- 不新增、刪除或升級依賴，不新增圖片、字體、圖標庫、遠程請求或動畫框架。
- 錯誤回報資料模型、狀態機、Cloud Function 權限、「我的回報」及管理員審核頁不在範圍內。
- 邏輯與 Presenter 遵循紅—綠—重構；UI 使用頁面契約測試與微信 DevTools 驗收。
- 重要操作熱區至少 `88rpx`；底部操作包含安全區；320px 不得出現頁面級橫向捲動。
- 每次 commit 前展示變更文件、驗證結果和擬用 message，取得使用者確認。

---

## File Map

- `miniprogram/presenters/officer-error-report-presenter.ts`：建立搜尋選項、身份卡、語言摘要及校驗錯誤映射。
- `miniprogram/pages/officer-editor/index.ts`：管理選人、表單、字段錯誤、證據展開、提交中與成功狀態。
- `miniprogram/pages/officer-editor/index.wxml`：身份卡、單一表單容器、字段錯誤、證據區及成功頁。
- `miniprogram/pages/officer-editor/index.wxss`：依 Design Foundation 實作已確認的精簡資料館樣式。
- `miniprogram/pages/officer-editor/index.json`：註冊既有 `entity-search-picker` 搜尋組件及更新導航標題。
- `tests/presenters/officer-error-report-presenter.test.ts`：Presenter 純函式測試。
- `tests/pages/officer-editor-controller.test.ts`：Controller 互動及提交狀態測試。
- `tests/pages/officer-editor-page.test.ts`：WXML/WXSS 靜態契約與回歸保護。

### Task 1: 建立錯誤回報頁 Presenter

**Files:**
- Create: `miniprogram/presenters/officer-error-report-presenter.ts`
- Create: `tests/presenters/officer-error-report-presenter.test.ts`

**Interfaces:**
- Consumes: `RuntimeCatalogEntry`、`MaintenanceOfficerData`、`MaintenanceDictionaries`、`OfficerErrorReportValidationError[]`。
- Produces: `OfficerReportOfficerOption`、`OfficerReportIdentityView`、`buildOfficerReportOptions()`、`presentOfficerReportIdentity()`、`mapOfficerReportFieldErrors()`。

- [ ] **Step 1: 寫 Presenter 失敗測試**

測試以下固定行為：搜尋文字包含姓名、ID 與 `searchAliases`；身份卡輸出頭像、稀有度、類型、職業、性別、國籍與語言摘要；超過兩種語言時使用「等 N 種語言」收斂；校驗錯誤按字段映射。

```ts
expect(buildOfficerReportOptions([catalogEntry])[0]).toMatchObject({
  id: 'officer_1',
  name: '克里斯蒂娜',
  searchableText: expect.stringContaining('Christina'),
})
expect(presentOfficerReportIdentity(catalogEntry, maintenanceData, dictionaries)).toEqual({
  id: 'officer_1',
  name: '克里斯蒂娜',
  portraitPath: '/assets/officers/officer_1.png',
  rarityName: 'S',
  typeName: '冒險',
  jobName: '博物學者',
  genderLabel: '女性',
  nationalityName: '荷蘭',
  languageSummary: '荷蘭語 Lv.5、英語 Lv.3',
})
expect(mapOfficerReportFieldErrors([{ field: 'officerId', message: '請選擇航海士' }])).toEqual({
  officerId: '請選擇航海士',
})
```

- [ ] **Step 2: 執行測試並確認因 Presenter 不存在而失敗**

Run: `npx vitest run tests/presenters/officer-error-report-presenter.test.ts`

- [ ] **Step 3: 實作最小純函式**

`presentOfficerReportIdentity()` 以 catalog 提供姓名、頭像、稀有度、類型、職業及性別；以 `MaintenanceOfficerData.nationalityId` 和 `languages` 配合字典補足國籍與語言等級。無法匹配時顯示「資料未收錄」，不得猜測。

- [ ] **Step 4: 執行 Presenter 測試**

Run: `npx vitest run tests/presenters/officer-error-report-presenter.test.ts`

- [ ] **Step 5: 準備 commit checkpoint**

擬用 message：`feat: 建立錯誤回報身份展示模型`

### Task 2: 重構頁面 Controller 狀態與提交流程

**Files:**
- Modify: `miniprogram/pages/officer-editor/index.ts`
- Create: `tests/pages/officer-editor-controller.test.ts`
- Modify: `tests/pages/officer-editor-page.test.ts`

**Interfaces:**
- Consumes: Task 1 Presenter、`getCatalog()`、`getMaintenanceOfficer()`、`getMaintenanceDictionaries()`、`validateOfficerErrorReportDraft()`、`OfficerErrorReportService`。
- Produces: `officerIdentity`、`fieldErrors`、`descriptionCount`、`correctionCount`、`evidenceExpanded`、`evidenceSummary`、`submitError`、`submittedReportId` 等頁面狀態及對應事件。

- [ ] **Step 1: 寫 Controller 失敗測試**

使用 Page 測試實例和 mock runtime service，覆蓋：

```ts
await page.onLoad({ officerId: 'officer_1' })
expect(page.data.officerIdentity).toMatchObject({ name: '克里斯蒂娜', rarityName: 'S' })

page.onDescriptionInput(input('錯誤內容'))
expect(page.data.descriptionCount).toBe(4)
expect(page.data.fieldErrors.description).toBeUndefined()

page.onToggleEvidence()
expect(page.data.evidenceExpanded).toBe(true)

await page.onSubmit()
expect(page.data.fieldErrors).toMatchObject({ errorTypes: '請至少選擇一種錯誤類型' })
```

另測：搜尋選擇航海士後原位替換身份卡；收合證據不清空網址或截圖；提交期間第二次 `onSubmit()` 不呼叫 service；失敗保留 draft；成功保存服務端 `reportId` 並不立即 `redirectTo`。

- [ ] **Step 2: 執行 Controller 測試並確認舊頁缺少新狀態而失敗**

Run: `npx vitest run tests/pages/officer-editor-controller.test.ts tests/pages/officer-editor-page.test.ts`

- [ ] **Step 3: 實作航海士載入與搜尋選擇**

`onLoad()` 建立 `OfficerReportOfficerOption[]`；query 有 `officerId` 時調用 `loadOfficerIdentity(id)`。`onOfficerSelect()` 更新 `draft.officerId`、清除 `fieldErrors.officerId`，並按需載入维护子包资料与字典。`onChangeOfficer()` 只切换为搜索状态，不清空其他表单字段。

- [ ] **Step 4: 實作字段狀態與證據收合**

输入事件同步更新字符数并清除对应错误；`onToggleEvidence()` 只切换显示；`evidenceSummary` 按是否有合法非空网址及截图数输出「添加来源网址或证据截图」或「1 个网址 · N 张截图」。

- [ ] **Step 5: 實作提交與成功狀態**

提交前把 `validateOfficerErrorReportDraft()` 结果映射到 `fieldErrors`；有错时使用 `wx.pageScrollTo({ selector: '#field-<field>', duration: 240 })` 定位首错。成功后设置 `submittedReportId = report.reportId` 并显示完成状态；失败设置 `submitError`、保留 draft 与附件；提交中以 `submitting` 防重。

- [ ] **Step 6: 執行 Controller 測試**

Run: `npx vitest run tests/pages/officer-editor-controller.test.ts tests/pages/officer-editor-page.test.ts`

- [ ] **Step 7: 準備 commit checkpoint**

擬用 message：`feat: 完善錯誤回報頁互動狀態`

### Task 3: 實作精簡資料館 UI

**Files:**
- Modify: `miniprogram/pages/officer-editor/index.wxml`
- Modify: `miniprogram/pages/officer-editor/index.wxss`
- Modify: `miniprogram/pages/officer-editor/index.json`
- Modify: `tests/pages/officer-editor-page.test.ts`

**Interfaces:**
- Consumes: Task 2 所有頁面狀態與事件。
- Produces: 已確認的「精簡表單＋航海士身份卡」視覺、字段錯誤、提交與成功頁。

- [ ] **Step 1: 擴充頁面契約失敗測試**

靜態斷言 WXML 包含：真實頭像、稀有度、類型、職業、性別、國籍、語言摘要、搜尋組件、字符計數、字段錯誤、證據收合、提交錯誤、回報編號與兩個成功後操作。斷言 WXSS：只有一個 `.report-form` surface；字段使用分隔線；Chip、输入框和按钮遵循 Token；不存在硬编码色值；`88rpx` 热区、安全区及长文字换行存在。

- [ ] **Step 2: 执行页面测试确认旧 WXML/WXSS 失败**

Run: `npx vitest run tests/pages/officer-editor-page.test.ts tests/architecture/design-foundation.test.ts`

- [ ] **Step 3: 重写 WXML**

使用以下顺序：引导区 → 未选择时的搜索区／已选择时的身份卡 → 单一 `.report-form` → 普通文档流提交区。证据字段在同一 `.report-form__field` 内条件展开；成功后用 `wx:if="{{submittedReportId}}"` 切换为完成页，不继续渲染表单。

- [ ] **Step 4: 重写 WXSS**

只使用 `--uwo-*` Token。普通容器无阴影；身份卡和表单共享 `surface`、`border-subtle` 与 `radius-card`；字段分隔使用 `border-top`；主按钮采用 `.ui-button.ui-button--primary`；证据区和错误信息不建立嵌套卡片。

- [ ] **Step 5: 更新页面 JSON**

注册：

```json
{
  "navigationBarTitleText": "資料勘誤",
  "navigationBarBackgroundColor": "#26332f",
  "navigationBarTextStyle": "white",
  "backgroundColor": "#e7deca",
  "usingComponents": {
    "entity-search-picker": "/components/entity-search-picker/index"
  }
}
```

导航配置中的 Design Foundation 固定色值保持现有平台配置形式；页面 WXSS 不新增硬编码色值。

- [ ] **Step 6: 执行 UI 契约测试**

Run: `npx vitest run tests/pages/officer-editor-page.test.ts tests/pages/officer-editor-controller.test.ts tests/architecture/design-foundation.test.ts`

- [ ] **Step 7: 准备 commit checkpoint**

拟用 message：`feat: 重設資料錯誤回報頁 UI`

### Task 4: 回归、完整门禁与人工验收

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-officer-error-report-ui-redesign-design.md`（只追加验收记录）

**Interfaces:**
- Consumes: Tasks 1–3 完整页面。
- Produces: 自动化门禁结果与微信 DevTools 验收记录。

- [ ] **Step 1: 执行错误回报回归测试**

Run:

```powershell
npx vitest run tests/presenters/officer-error-report-presenter.test.ts tests/pages/officer-editor-controller.test.ts tests/pages/officer-editor-page.test.ts tests/runtime/officer-error-report-service.test.ts tests/domain/officer-error-report.test.ts tests/pages/detail-page.test.ts tests/pages/work-orders-page.test.ts tests/architecture/design-foundation.test.ts tests/architecture/runtime-dependencies.test.ts
```

- [ ] **Step 2: 执行完整门禁**

Run: `npm run verify`

- [ ] **Step 3: 微信 DevTools 人工验收**

在 320／375／393／430px 宽度分别验证：未选择航海士、详情页带入、搜索更换、头像失败、长姓名／职业／语言摘要、Chip 换行、两个 textarea、证据收合与展开、三张截图、字段错误首错定位、网络失败、提交中和成功页。

- [ ] **Step 4: 追加验收记录**

在设计文档末尾逐项记录“通过／未执行／失败及原因”，不得把未能打开 DevTools 或未完成真机条件声称为通过。

- [ ] **Step 5: 展示最终提交前证据**

展示变更文件、红—绿测试证据、focused tests、`npm run verify`、DevTools 验收记录及拟用 message `feat: 重設資料錯誤回報頁 UI`，等待使用者确认后提交。
