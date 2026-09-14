# 航海士錯誤回報頁實機優化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正錯誤回報頁在實機上的選人困惑、身份卡擠壓、操作辨識不足與垂直空間浪費，建立緊湊且始終可提交的手機表單。

**Architecture:** 保留既有錯誤回報契約、校驗與 CloudBase service；擴充純 Presenter，讓搜尋候選和身份卡共用 `buildOfficerVisuals()` 的分層頭像資料，並新增本頁專用搜尋函式。Controller 管理搜尋文字、候選結果與圖片失敗狀態；WXML/WXSS 移除後台 `entity-search-picker`，實作單一搜尋框、緊湊內容與固定底部操作欄。

**Tech Stack:** TypeScript、微信小程序 WXML/WXSS、Vitest、既有 Design Foundation 與本地 UI 素材。

## Global Constraints

- 界面、代碼註釋、測試描述與文檔均使用繁體中文；文件名、API、類型與變數名保留英文。
- 編碼前完整遵循 `docs/superpowers/specs/2026-08-09-design-foundation-design.md` 與 `docs/superpowers/specs/2026-09-14-officer-error-report-ui-redesign-design.md`。
- 不修改 `archive/`、`data/master/` 或手動修改 `miniprogram/generated/`。
- 不新增、刪除或升級依賴，不新增遠程請求、圖片、字體、圖標庫或動畫框架。
- 不修改 `OfficerErrorReportDraft`、CloudBase action、服務端狀態機、「我的回報」或管理員審核頁。
- Presenter、搜尋、圖片失敗映射與 Controller 行為遵循紅—綠—重構；UI 使用頁面契約測試及微信 DevTools／實機驗收。
- 固定提交欄必須包含 `env(safe-area-inset-bottom)`，頁面內容必須保留等量底部空間；320px 不得橫向溢出。
- 重要操作熱區至少 `88rpx`；錯誤類型 Chip 明確採用既有緊湊控制規格 `64rpx`。
- 每次 commit 前展示變更文件、紅—綠證據、驗證結果與擬用 message，取得使用者確認後才提交。

---

## File Map

- `miniprogram/presenters/officer-error-report-presenter.ts`：建立帶分層頭像的候選／身份展示模型，並執行本頁搜尋。
- `miniprogram/pages/officer-editor/index.ts`：管理搜尋文字、候選結果、圖片失敗狀態、選人與既有提交流程。
- `miniprogram/pages/officer-editor/index.wxml`：呈現單一搜尋框、帶頭像候選、緊湊身份卡、整行入口及固定提交欄。
- `miniprogram/pages/officer-editor/index.wxss`：實作實機確認的手機密度、分層頭像、右上角操作與內容避讓。
- `miniprogram/pages/officer-editor/index.json`：移除不再使用的 `entity-search-picker` 註冊。
- `tests/presenters/officer-error-report-presenter.test.ts`：保護搜尋規則及候選／身份視覺路徑。
- `tests/pages/officer-editor-controller.test.ts`：保護即時搜尋、選中、清除及圖片失敗狀態。
- `tests/pages/officer-editor-page.test.ts`：保護 WXML／WXSS／JSON 實機修訂契約。
- `docs/superpowers/specs/2026-09-14-officer-error-report-ui-redesign-design.md`：追加本輪自动化與實機驗收記錄。

### Task 1: 擴充候選與身份展示模型

**Files:**
- Modify: `miniprogram/presenters/officer-error-report-presenter.ts`
- Modify: `tests/presenters/officer-error-report-presenter.test.ts`

**Interfaces:**
- Consumes: `RuntimeCatalogEntry`、`buildOfficerVisuals(source: OfficerVisualSource): OfficerVisualPaths`。
- Produces: `OfficerReportOfficerOption.visuals`、`OfficerReportOfficerOption.portraitPath`、`OfficerReportIdentityView.visuals`、`searchOfficerReportOptions(options, query, limit?)`。

- [ ] **Step 1: 寫候選視覺與搜尋失敗測試**

測試名稱需指出可捕捉的回歸：候選缺少分層頭像、空白查詢錯誤展示整份目錄、別名搜尋失效或結果超過限制。

```ts
it('候選與身份卡共用稀有度分層頭像', () => {
  const option = buildOfficerReportOptions([catalogEntry])[0]!
  const identity = presentOfficerReportIdentity(catalogEntry, maintenanceData, dictionaries)

  expect(option).toMatchObject({
    portraitPath: '/assets/officers/officer_1.png',
    visuals: {
      framePath: '/assets/ui/uwo-bg-grade-5.png',
      rarityIconPath: '/assets/ui/uwo-icon-grade-5.png',
    },
  })
  expect(identity.visuals).toEqual(option.visuals)
})

it('只有輸入查詢後才按姓名、ID 或別名回傳受限候選', () => {
  const options = buildOfficerReportOptions([catalogEntry])
  expect(searchOfficerReportOptions(options, '   ')).toEqual([])
  expect(searchOfficerReportOptions(options, ' ＣＨＲＩＳＴＩＮＡ ')).toMatchObject([
    { id: 'officer_1', name: '克里斯蒂娜' },
  ])
  expect(searchOfficerReportOptions(options, 'officer_1')).toMatchObject([
    { id: 'officer_1' },
  ])
})
```

- [ ] **Step 2: 執行 Presenter 測試並確認紅燈**

Run: `npx vitest run tests/presenters/officer-error-report-presenter.test.ts`

Expected: FAIL，因 `visuals`、`portraitPath` 或 `searchOfficerReportOptions()` 尚未提供。

- [ ] **Step 3: 實作最小展示模型與搜尋函式**

```ts
export interface OfficerReportOfficerOption {
  readonly id: string
  readonly name: string
  readonly aliases: readonly string[]
  readonly meta: string
  readonly searchableText: string
  readonly portraitPath: string
  readonly visuals: OfficerVisualPaths
}

export const searchOfficerReportOptions = (
  options: readonly OfficerReportOfficerOption[],
  query: string,
  limit = 20,
): OfficerReportOfficerOption[] => {
  const normalized = query.normalize('NFKC').trim().toLocaleLowerCase()
  if (!normalized) return []
  return options
    .filter((option) =>
      option.searchableText.normalize('NFKC').toLocaleLowerCase().includes(normalized),
    )
    .sort((left, right) => {
      const leftRank = left.name.normalize('NFKC').toLocaleLowerCase().startsWith(normalized) ? 0 : 1
      const rightRank = right.name.normalize('NFKC').toLocaleLowerCase().startsWith(normalized) ? 0 : 1
      return leftRank - rightRank || left.name.localeCompare(right.name, 'zh-Hant')
    })
    .slice(0, limit)
}
```

`buildOfficerReportOptions()` 與 `presentOfficerReportIdentity()` 均直接調用 `buildOfficerVisuals(catalogEntry)`，不得自行拼接素材路徑。

- [ ] **Step 4: 執行 Presenter 測試與型別檢查**

Run:

```powershell
npx vitest run tests/presenters/officer-error-report-presenter.test.ts
npm run typecheck
```

Expected: Presenter 測試全部 PASS，TypeScript 無錯誤。

- [ ] **Step 5: 準備 commit checkpoint**

展示兩個變更文件、RED／GREEN 輸出與 `git diff --check`，擬用 message：`feat: 補齊錯誤回報航海士搜尋模型`。取得使用者確認後才提交。

### Task 2: 改為頁面專用即時搜尋 Controller

**Files:**
- Modify: `miniprogram/pages/officer-editor/index.ts`
- Modify: `tests/pages/officer-editor-controller.test.ts`

**Interfaces:**
- Consumes: `buildOfficerReportOptions()`、`searchOfficerReportOptions()`、`OfficerReportOfficerOption`、既有 `loadOfficerIdentity(officerId)`。
- Produces: `officerQuery: string`、`officerCandidates: OfficerReportOfficerOption[]`、`failedOfficerLayers: Record<string, true>`、`onOfficerSearchInput()`、`onOfficerCandidateTap()`、`onOfficerLayerError()`。

- [ ] **Step 1: 寫 Controller 失敗測試**

```ts
it('輸入姓名或別名立即顯示帶頭像候選並可選中', async () => {
  const page = await loadPage()
  await page.onLoad()

  page.onOfficerSearchInput(input('Christina'))
  expect(page.data.officerCandidates).toMatchObject([
    {
      id: 'officer_1',
      portraitPath: '/assets/officers/officer_1.png',
      visuals: { rarityIconPath: '/assets/ui/uwo-icon-grade-5.png' },
    },
  ])

  await page.onOfficerCandidateTap(tap('officer_1'))
  expect(page.data.officerIdentity?.id).toBe('officer_1')
  expect(page.data.selectingOfficer).toBe(false)
  expect(page.data.officerQuery).toBe('')
  expect(page.data.officerCandidates).toEqual([])
})

it('更換航海士時清空舊查詢但保留表單草稿', async () => {
  const page = await loadPage()
  await page.onLoad({ officerId: 'officer_1' })
  page.onDescriptionInput(input('已填錯誤內容'))
  page.onChangeOfficer()
  expect(page.data).toMatchObject({
    selectingOfficer: true,
    officerQuery: '',
    officerCandidates: [],
  })
  expect(page.data.draft.description).toBe('已填錯誤內容')
})

it('按候選 ID 與圖片層記錄失敗且不影響其他候選', async () => {
  const page = await loadPage()
  page.onOfficerLayerError({
    currentTarget: { dataset: { id: 'officer_1', layer: 'portrait' } },
  } as never)
  expect(page.data.failedOfficerLayers).toEqual({ officer_1_portrait: true })
})
```

- [ ] **Step 2: 執行 Controller 測試並確認紅燈**

Run: `npx vitest run tests/pages/officer-editor-controller.test.ts`

Expected: FAIL，因頁面仍依賴 `onOfficerSelect()`，且沒有查詢、候選與分層圖片失敗狀態。

- [ ] **Step 3: 實作即時搜尋與候選選中**

```ts
onOfficerSearchInput(event: WechatMiniprogram.Input) {
  const officerQuery = String(event.detail.value ?? '')
  this.setData({
    officerQuery,
    officerCandidates: searchOfficerReportOptions(this.data.officerOptions, officerQuery),
  })
},

async onOfficerCandidateTap(event: WechatMiniprogram.BaseEvent) {
  const officerId = String(event.currentTarget.dataset['id'] ?? '')
  if (!officerId) return
  await this.loadOfficerIdentity(officerId)
  if (!this.data.officerIdentity || this.data.officerIdentity.id !== officerId) return
  this.setData({ officerQuery: '', officerCandidates: [] })
},

onOfficerLayerError(event: WechatMiniprogram.BaseEvent) {
  const id = String(event.currentTarget.dataset['id'] ?? '')
  const layer = String(event.currentTarget.dataset['layer'] ?? '')
  if (!id || !layer) return
  this.setData({ [`failedOfficerLayers.${id}_${layer}`]: true })
},
```

`onChangeOfficer()` 同時重置查詢與候選，但不得清空 `draft` 其他字段；移除不再使用的 `onOfficerSelect()` 與單一 `portraitFailed` 狀態。

- [ ] **Step 4: 執行 Controller、Presenter 與型別檢查**

Run:

```powershell
npx vitest run tests/pages/officer-editor-controller.test.ts tests/presenters/officer-error-report-presenter.test.ts
npm run typecheck
```

Expected: 相關測試全部 PASS，TypeScript 無錯誤。

- [ ] **Step 5: 準備 commit checkpoint**

展示 Controller／測試變更、RED／GREEN 證據與 `git diff --check`，擬用 message：`feat: 改善錯誤回報航海士搜尋互動`。取得使用者確認後才提交。

### Task 3: 重做實機表單密度與固定操作欄

**Files:**
- Modify: `miniprogram/pages/officer-editor/index.wxml`
- Modify: `miniprogram/pages/officer-editor/index.wxss`
- Modify: `miniprogram/pages/officer-editor/index.json`
- Modify: `tests/pages/officer-editor-page.test.ts`

**Interfaces:**
- Consumes: Task 1–2 的 `officerQuery`、`officerCandidates`、`officerIdentity.visuals`、`failedOfficerLayers` 與頁面事件。
- Produces: 已確認的單標題、整行回報入口、帶頭像候選、右上角更換、緊湊 Chip、整行證據入口與固定底部提交欄。

- [ ] **Step 1: 擴充 UI 契約失敗測試**

```ts
it('使用單一搜尋框與帶稀有度分層頭像的候選列表', () => {
  const wxml = readPageFile('index.wxml')
  const config = JSON.parse(readPageFile('index.json'))
  expect(wxml).toContain('bindinput="onOfficerSearchInput"')
  expect(wxml).toContain('wx:for="{{officerCandidates}}"')
  expect(wxml).toContain('item.visuals.framePath')
  expect(wxml).toContain('item.visuals.rarityIconPath')
  expect(wxml).not.toContain('<entity-search-picker')
  expect(config.usingComponents).not.toHaveProperty('entity-search-picker')
})

it('身份卡、緊湊選項與固定提交欄不浪費窄屏寬度', () => {
  const wxml = readPageFile('index.wxml')
  const wxss = readPageFile('index.wxss')
  expect(wxml).toContain('回報航海士資料錯誤')
  expect(wxml).toContain('查看我的回報與處理進度')
  expect(wxml).toContain('補充證據（選填）')
  expect(wxss).toMatch(/\.type-chip\s*\{[^}]*min-height:\s*64rpx/s)
  expect(wxss).toMatch(/\.type-chip\s*\{[^}]*width:\s*auto/s)
  expect(wxss).toMatch(/\.report-actions\s*\{[^}]*position:\s*fixed/s)
  expect(wxss).toContain('env(safe-area-inset-bottom)')
  expect(wxss).toMatch(/\.report-page__content\s*\{[^}]*padding-bottom:/s)
})
```

身份卡契約另需斷言 `officerIdentity.visuals.framePath`、`officerIdentity.visuals.rarityIconPath`、左上角定位、資料欄 `min-width: 0`、右上角 `.officer-identity__change`，以及不存在右下角文字稀有度。

- [ ] **Step 2: 執行頁面與 Design Foundation 測試並確認紅燈**

Run:

```powershell
npx vitest run tests/pages/officer-editor-page.test.ts tests/architecture/design-foundation.test.ts tests/architecture/runtime-dependencies.test.ts
```

Expected: 頁面契約 FAIL；Design Foundation 與 runtime dependency 保持 PASS。

- [ ] **Step 3: 重寫頂部與航海士區**

WXML 固定順序：單一標題／說明 → 整行「查看我的回報與處理進度」→ 搜尋或身份卡。搜尋結果直接位於輸入框下方；候選行呈現 `80rpx` 分層頭像、姓名及 `meta`。身份卡頭像依序呈現 frame、portrait／fallback、左上角 rarity icon；「更換」放在資料區右上角，不建立第三欄固定寬度按鈕。

- [ ] **Step 4: 收緊表單與證據入口**

`.type-list` 使用 `justify-content: flex-start`；`.type-chip` 使用 `display: inline-flex`、`flex: none`、`width: auto`、`min-height: 64rpx` 與 Token 間距。證據收合行顯示「補充證據（選填）」「來源網址或最多 3 張截圖」及本地 disclosure 圖片；整行至少 `88rpx` 並保持完整可點擊。

- [ ] **Step 5: 實作固定底部提交操作欄**

`.report-actions` 使用 `position: fixed; right: 0; bottom: 0; left: 0; z-index`，背景與上邊界使用 Token，內距包含 `env(safe-area-inset-bottom)`。內層主按鈕占滿扣除頁面水平間距後的寬度；`.report-page__content` 增加固定欄高度加安全區的 `padding-bottom`。成功狀態不渲染 `.report-actions`。

- [ ] **Step 6: 更新页面 JSON**

保留導航配色與標題，將组件配置改為：

```json
{
  "navigationBarTitleText": "資料勘誤",
  "navigationBarBackgroundColor": "#26332f",
  "navigationBarTextStyle": "white",
  "backgroundColor": "#e7deca",
  "usingComponents": {}
}
```

- [ ] **Step 7: 執行 UI 契約、Controller、型別與格式檢查**

Run:

```powershell
npx vitest run tests/pages/officer-editor-page.test.ts tests/pages/officer-editor-controller.test.ts tests/presenters/officer-error-report-presenter.test.ts tests/architecture/design-foundation.test.ts tests/architecture/runtime-dependencies.test.ts
npm run typecheck
npx prettier --check miniprogram/pages/officer-editor/index.ts miniprogram/pages/officer-editor/index.wxss miniprogram/pages/officer-editor/index.json tests/pages/officer-editor-controller.test.ts tests/pages/officer-editor-page.test.ts miniprogram/presenters/officer-error-report-presenter.ts tests/presenters/officer-error-report-presenter.test.ts
git diff --check
```

Expected: 全部 PASS，WXML 不含遠程 URL，WXSS 不含硬編碼色值。

- [ ] **Step 8: 準備 commit checkpoint**

展示 UI／測試變更、RED／GREEN 證據及 focused checks，擬用 message：`feat: 收緊錯誤回報頁實機佈局`。取得使用者確認後才提交。

### Task 4: 完整回歸與實機驗收

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-officer-error-report-ui-redesign-design.md`（只追加本輪驗收記錄）

**Interfaces:**
- Consumes: Tasks 1–3 完整頁面。
- Produces: 完整工程門禁結果、微信 DevTools／實機驗收記錄與交付 checkpoint。

- [ ] **Step 1: 執行錯誤回報與架構回歸**

Run:

```powershell
npx vitest run tests/presenters/officer-error-report-presenter.test.ts tests/pages/officer-editor-controller.test.ts tests/pages/officer-editor-page.test.ts tests/runtime/officer-error-report-service.test.ts tests/domain/officer-error-report.test.ts tests/pages/detail-page.test.ts tests/pages/work-orders-page.test.ts tests/architecture/design-foundation.test.ts tests/architecture/runtime-dependencies.test.ts
```

Expected: 全部 PASS，沒有 runtime network 或 Design Foundation 回歸。

- [ ] **Step 2: 執行完整工程門禁**

Run: `npm run verify`

Expected: format、lint、typecheck、test、runtime network、包體、素材、資料與生成一致性全部 PASS。

- [ ] **Step 3: 執行微信 DevTools／實機驗收**

在 320／375／393／430px 檢查：

- 首屏能同時看見標題、整行回報入口、航海士搜尋／身份卡及固定提交欄。
- 搜尋姓名、ID、中文別名與英文別名時，候選立即出現並顯示正確頭像、稀有度背景及左上角稀有度圖標。
- 候選頭像、frame、rarity icon 分別載入失敗時仍能辨識及選中。
- 選中後「更換」固定右上角，長姓名、長職業、多語言摘要不被壓成窄列。
- 七個錯誤類型按內容寬度自然換行，無固定兩列或大面積空白。
- 證據整行入口可展開／收合並保留網址與三張截圖。
- 固定提交欄在安全區、鍵盤彈出、首錯定位與頁面底部均不遮擋內容；成功後提交欄消失。

- [ ] **Step 4: 追加本輪驗收記錄**

在設計文檔第 10 節追加日期、設備／宽度、逐項「通過／未執行／失敗及原因」。無法開啟 DevTools 或缺少實機條件時必須記為「未執行」。

- [ ] **Step 5: 展示最終提交前證據**

展示所有變更文件、各 Task 紅—綠證據、focused regression、`npm run verify`、DevTools／實機結果及擬用 message：`feat: 完成錯誤回報頁實機優化`。取得使用者確認後才提交。
