# 資料頁資訊架構重構實作計畫

> **給代理工作者：** 建議使用 `subagent-driven-development` 或 `executing-plans`，依工作項目逐項執行本計畫。步驟使用核取方塊（`- [ ]`）追蹤。

**目標：** 將資料頁頂層內容收斂為「航海士／技能」兩種模式，以單一篩選 Bottom Sheet 集中航海士篩選維度，同時保留既有查詢與導航行為。

**架構：** 保留 `CatalogFilterState`、`queryCatalog`、`buildSkillCheckList`、`filterSkillCheckList`、分頁及既有 `skill-sheet` 元件。頁面 Controller 新增 `activeMode` 與依模式切換的篩選草稿狀態；草稿只在 Bottom Sheet 內預覽數量，套用後才進入既有查詢更新流程。WXML 只呈現兩種內容模式，WXSS 以 Design Foundation Token 和英文 BEM 類名提供頁面樣式。

**技術組合：** 微信小程序原生 TypeScript／WXML／WXSS、Vitest、ESLint、Prettier。

## 全域約束

- 所有 UI 文案、註釋與文檔使用繁體中文；WXML/WXSS 類名使用英文 BEM。
- 開發分支為 `codex/phase-8-資料頁資訊架構`，基準為 `origin/main@0f4ad77`。
- `archive/`、`data/master/`、`miniprogram/generated/` 不得修改。
- 不修改 `queryCatalog`、`filter-state`、其他 Domain、Solver、資料轉換、索引生成、保存流程、P5、P6 或預設技能追蹤修復。
- 不新增、刪除或升級依賴；不新增 `wx.request`、`wx.cloud`、遠端 URL 或 Node.js Runtime API。
- 涉及 UI、WXML 或 WXSS 的任務，編碼前完整閱讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`；新增或修改樣式必須遵守其中的 Token、字體、間距、圓角、陰影、狀態、按鈕、觸控和安全區規範。
- 搜尋與篩選行為遵循 TDD RED→GREEN→REFACTOR；先看失敗測試，再寫最小實作。
- 完成前必須執行 `npm.cmd run verify`、`git diff --check`，並檢查禁止路徑無 diff。
- 未展示完整變更文件、驗證結果、手動驗收待辦與擬用 commit message 前，不執行 Git 整合操作；本次由使用者已明確授權完成後 commit、merge、push。

---

## 文件結構

- `miniprogram/pages/catalog/index.ts`：資料頁內容模式、篩選草稿與既有查詢流程的頁面編排。
- `miniprogram/pages/catalog/index.wxml`：兩種模式、單一模式搜尋框、篩選 Bottom Sheet、航海士列表與技能列表。
- `miniprogram/pages/catalog/index.wxss`：資料頁 BEM 樣式、Design Foundation Token、Bottom Sheet 安全區與觸控熱區。
- `tests/pages/catalog-page.test.ts`：頁面行為回歸與 WXML/WXSS 靜態契約。
- `docs/superpowers/specs/2026-08-09-catalog-information-architecture-design.md`：已批准的設計規格。
- `docs/superpowers/plans/2026-08-09-catalog-information-architecture.md`：本實作計畫。

## 頁面介面

新增頁面狀態與事件使用以下名稱，避免在實作中同時維護舊 Tab 語義：

```ts
type CatalogMode = 'officer' | 'skill'

interface CatalogDraftData {
  filterSheetOpen: boolean
  filterSheetMode: 'officer' | 'skill'
  filterDraftCount: number
  filterDraftHasActiveFilters: boolean
}

interface CatalogPageState {
  _draftFilterState: CatalogFilterState | null
  _draftSkillCheckKind: 'all' | 'active' | 'passive' | null
  _draftSkillCheckCategories: string[] | null
}
```

頁面方法：

- `onModeTap(event)`：設定 `activeMode` 為 `officer` 或 `skill`。
- `onCatalogSearchInput(event)`：依 `activeMode` 分流至既有 `searchText` 或 `_skillCheckSearchText`。
- `openFilterSheet()`：依 `activeMode` 複製航海士或技能已套用狀態，計算草稿數量並開啟 Sheet。
- `toggleDraftFilter(event)`：在航海士模式只切換草稿中的稀有度、類型、性別、語言或職業。
- `onDraftSkillKindTap(event)`：依 Sheet 模式更新草稿 `activeFilter` 或技能清單類型。
- `toggleDraftSkillCategory(event)`：依 Sheet 模式更新航海士或技能清單的草稿分類。
- `clearDraftFilters()`：依 Sheet 模式清除對應草稿，保留 Sheet 開啟。
- `cancelFilterSheet()`：清除草稿並關閉 Sheet，不更新目前名冊。
- `applyDraftFilters()`：將草稿交給既有查詢更新流程，清除草稿並關閉 Sheet。

---

### 工作項目 1：建立 P7 頁面行為的 RED 測試

**文件：**
- 修改：`tests/pages/catalog-page.test.ts`

**介面：**
- 使用：目前註冊的 catalog Page config、`CatalogFilterState` 與既有測試中的 `createPageInstance()`。
- 產出：對 `activeMode`、單一模式搜尋分流、篩選草稿取消／套用／清除及反查模式回復的可執行行為契約。

- [ ] **步驟 1：擴充測試型別與事件工廠**

在 `CatalogPageConfig` 增加以下測試可呼叫方法與資料欄位：

```ts
activeMode: 'officer' | 'skill'
filterSheetOpen: boolean
filterDraftCount: number
filterDraftHasActiveFilters: boolean
onModeTap(event: WechatMiniprogram.BaseEvent): void
onCatalogSearchInput(event: WechatMiniprogram.Input): void
openFilterSheet(): void
toggleDraftFilter(event: WechatMiniprogram.BaseEvent): void
cancelFilterSheet(): void
applyDraftFilters(): void
clearDraftFilters(): void
```

增加 `modeEvent(mode)`、`draftFilterEvent(field, id)` 與 `skillSearchEvent(value)`，只提供真實事件 dataset，不直接呼叫私有狀態。

- [ ] **步驟 2：寫模式切換與搜尋分流失敗測試**

```ts
it('只提供航海士與技能兩種內容模式', async () => {
  const page = createPageInstance()
  await loadCatalogPage(page)

  expect(page.data.activeMode).toBe('officer')
  page.onModeTap(modeEvent('skill'))
  expect(page.data.activeMode).toBe('skill')
})

it('技能模式搜尋只更新技能清單，不覆寫航海士搜尋', async () => {
  const page = createPageInstance()
  await loadCatalogPage(page)
  page.onCatalogSearchInput(searchEvent('航海士條件'))
  page.onModeTap(modeEvent('skill'))

  page.onCatalogSearchInput(skillSearchEvent('技能條件'))

  expect(page.data.searchText).toBe('航海士條件')
  expect(page.data.skillCheckSearchText).toBe('技能條件')
})
```

- [ ] **步驟 3：寫篩選草稿生命週期失敗測試**

```ts
it('取消篩選草稿不改變目前名冊', async () => {
  const page = createPageInstance()
  await loadCatalogPage(page)
  const before = page.data.visibleRows.map((row) => row.id)

  page.openFilterSheet()
  page.toggleDraftFilter(draftFilterEvent('selectedRarities', 'rarity_2'))

  expect(page.data.filterSheetOpen).toBe(true)
  expect(page.data.filterDraftHasActiveFilters).toBe(true)
  expect(page.data.visibleRows.map((row) => row.id)).toEqual(before)

  page.cancelFilterSheet()
  expect(page.data.filterSheetOpen).toBe(false)
  expect(page.data.selectedRarities).toEqual([])
})

it('套用篩選草稿才更新名冊結果', async () => {
  const page = createPageInstance()
  await loadCatalogPage(page)

  page.openFilterSheet()
  page.toggleDraftFilter(draftFilterEvent('selectedRarities', 'rarity_2'))
  page.applyDraftFilters()

  expect(page.data.filterSheetOpen).toBe(false)
  expect(page.data.selectedRarities).toEqual(['rarity_2'])
  expect(page.data.visibleRows.every((row) => row.rarityId === 'rarity_2')).toBe(true)
})

it('清除草稿只清除 Sheet 內條件，套用後才清除名冊條件', async () => {
  const page = createPageInstance()
  await loadCatalogPage(page)
  page.openFilterSheet()
  page.toggleDraftFilter(draftFilterEvent('selectedRarities', 'rarity_2'))
  page.clearDraftFilters()

  expect(page.data.filterDraftHasActiveFilters).toBe(false)
  expect(page.data.selectedRarities).toEqual([])
})
```

- [ ] **步驟 4：寫反查與標記移除重複搜尋的失敗契約**

保留既有反查測試所需的 `sheetSkill` 流程，增加：

```ts
expect(catalogWxml).toContain('data-mode="officer"')
expect(catalogWxml).toContain('data-mode="skill"')
expect(catalogWxml).not.toContain('技能清單')
expect(catalogWxml.match(/placeholder="搜尋航海士名稱/g)?.length ?? 0).toBe(1)
expect(catalogWxml.match(/placeholder="搜尋技能名稱/g)?.length ?? 0).toBe(1)
expect(catalogWxml).not.toContain('skill-check-panel')
```

同步把舊的五 Tab、即時圖示篩選靜態契約改為新的兩模式與 Bottom Sheet 契約；此時測試應因生產碼仍是舊結構而 RED。

- [ ] **步驟 5：執行 RED 驗證**

執行：

```powershell
npm.cmd test -- tests/pages/catalog-page.test.ts
```

預期：測試失敗，原因是目前 Page 沒有 `activeMode`、篩選草稿事件與兩模式 WXML，而不是 TypeScript 語法或測試資料錯誤。

---

### 工作項目 2：實作 Controller 的模式與篩選草稿 GREEN

**文件：**
- 修改：`miniprogram/pages/catalog/index.ts`
- 測試：`tests/pages/catalog-page.test.ts`

**介面：**
- 使用：工作項目 1 的失敗頁面測試、`createEmptyFilterState()`、`toggleArrayFilter()`、`hasActiveFilters()` 與 `queryCatalog()`。
- 產出：`CatalogMode`、`_draftFilterState`、草稿預覽數量與套用／取消事件；既有 `_filterState`、分頁、資產失敗和反查流程保持原語義。

- [ ] **步驟 1：增加最小頁面型別與初始狀態**

在頁面資料增加：

```ts
activeMode: 'officer' | 'skill'
filterSheetOpen: false
filterDraftCount: 0
filterDraftHasActiveFilters: false
```

在 `CatalogPageState` 增加 `_draftFilterState: CatalogFilterState | null`，初始為 `null`。移除舊 `tabs`／`activeTab` 的頁面資料與依賴。

- [ ] **步驟 2：實作模式切換與搜尋分流**

`onModeTap` 只接受 `officer` 或 `skill`；`onCatalogSearchInput` 在航海士模式呼叫現有 `applyFilterUpdate('searchText', value)`，在技能模式更新 `_skillCheckSearchText` 後呼叫既有 `applySkillCheckFilter()`。

保留 `onSearchInput` 作為相容別名，轉呼叫 `onCatalogSearchInput`，避免舊頁面生命週期或測試引用時失效。

- [ ] **步驟 3：實作草稿複製與預覽計數**

增加純頁面內部 helper：

```ts
const cloneFilterState = (state: Readonly<CatalogFilterState>): CatalogFilterState => ({
  searchText: state.searchText,
  selectedRarities: [...state.selectedRarities],
  selectedTypes: [...state.selectedTypes],
  selectedGenders: [...state.selectedGenders],
  selectedLanguages: [...state.selectedLanguages],
  selectedJobs: [...state.selectedJobs],
  selectedSkillCategories: [...state.selectedSkillCategories],
  activeFilter: state.activeFilter,
  selectedSkillId: state.selectedSkillId,
})
```

`openFilterSheet()` 將目前狀態複製到 `_draftFilterState`，以 `queryCatalog(_enrichedCatalog, _skills, draft)` 計算 `filterDraftCount`，並以 `buildViewMaps(draft)` 將草稿選項投影到 ViewModel。

技能模式則複製 `_skillCheckKind` 與 `_skillCheckCategories`，以既有 `filterSkillCheckList` 計算技能結果預覽，不改變目前技能清單。

- [ ] **步驟 4：實作草稿更新、清除、取消與套用**

草稿更新不得改寫 `_filterState` 或 `_filteredAll`：

- `toggleDraftFilter` 只接受 `isCatalogFilterField(field)` 為真的欄位；
- `onDraftSkillKindTap` 只接受 `all`／`active`／`passive`；
- `toggleDraftSkillCategory` 只切換 `selectedSkillCategories`；
- `clearDraftFilters` 使用 `createEmptyFilterState()`；
- `cancelFilterSheet` 將 `_draftFilterState` 設回 `null` 並關閉 Sheet；
- `applyDraftFilters` 將草稿交給共用的頁面查詢更新 helper，然後清除草稿並關閉 Sheet。

共用查詢更新 helper 只抽取既有 `applyFilterUpdate` 的查詢、圖片失敗保留、分頁與 `setData` 行為，不修改 `queryCatalog`。

技能模式套用時只更新既有技能清單狀態並呼叫 `applySkillCheckFilter()`，不改動航海士的 `CatalogFilterState`。

- [ ] **步驟 5：執行 GREEN 驗證**

執行：

```powershell
npm.cmd test -- tests/pages/catalog-page.test.ts
```

預期：工作項目 1 的模式、搜尋分流、草稿取消／套用／清除測試通過，既有資產、分頁、搜尋與頁面實例隔離測試仍通過。

- [ ] **步驟 6：進行 Controller REFACTOR**

移除只服務舊 Tab 的 `onTabTap` 與 Tab 4 判斷，集中命名為 `activeMode`、`onCatalogSearchInput`、`openFilterSheet`、`applyDraftFilters`；重新執行工作項目 1 全部測試，確認重構後仍 GREEN。

---

### 工作項目 3：重組兩模式 WXML 與篩選 Bottom Sheet

**文件：**
- 修改：`miniprogram/pages/catalog/index.wxml`
- 不修改：`miniprogram/pages/catalog/index.json`；篩選 Sheet 使用頁面內 WXML，不新增元件註冊。
- 測試：`tests/pages/catalog-page.test.ts`

**介面：**
- 使用：工作項目 2 的 `activeMode`、搜尋分流資料、草稿 ViewModel、既有 `visibleRows`／`skillCheckRows`／`sheetSkill`。
- 產出：兩個內容模式、單一模式搜尋輸入、篩選 Sheet 內的六組篩選與既有列表／技能 Sheet 導航。

- [ ] **步驟 1：建立頂層模式與模式搜尋區**

使用英文 BEM 類名建立：

```xml
<view class="catalog-page__mode-tabs">
  <view class="catalog-page__mode-tab" data-mode="officer" bindtap="onModeTap">航海士</view>
  <view class="catalog-page__mode-tab" data-mode="skill" bindtap="onModeTap">技能</view>
</view>
```

以 `wx:if` 保證同一時間只存在一個搜尋輸入：航海士模式 placeholder 為「搜尋航海士名稱...」，技能模式 placeholder 為「搜尋技能名稱...」。

- [ ] **步驟 2：建立航海士模式入口與列表**

航海士模式只顯示搜尋、篩選入口、結果數量、清除已套用條件入口與既有航海士列表。列表保留 `onOfficerTap`、`onSkillIconTap`、分頁及圖片失敗事件，不在列表中重複提供語言、職業、稀有度、類型、性別或技能分類控制。

- [ ] **步驟 3：建立依模式切換的頁面專用篩選 Bottom Sheet**

航海士模式的 Sheet 必須包含：

- 稀有度、類型、性別的本地圖片或可理解文字標籤；
- 語言與職業多選 chip；
- 技能區的全部／主動／被動與技能分類 chip；
- 草稿結果數量；
- 「清除全部」、「取消」、「套用篩選」三個繁體中文操作。

技能模式的同一個 Sheet 顯示技能類型與技能分類，沿用既有技能清單篩選狀態；不在技能模式內容區另建篩選列。

所有事件使用 `toggleDraftFilter`、`onDraftSkillKindTap`、`toggleDraftSkillCategory`、`clearDraftFilters`、`cancelFilterSheet`、`applyDraftFilters`，避免直接綁定 `this.data` 欄位。

- [ ] **步驟 4：重組技能模式並移除重複搜尋與內嵌篩選列**

技能模式只呈現技能搜尋、篩選入口、數量與既有技能清單；移除 Tab 4 專用內嵌 `.search-bar`、舊「技能清單」文案、航海士搜尋輸入、內嵌技能篩選與 `activeTab === 4` 條件。

- [ ] **步驟 5：保留既有技能詳情與反查元件**

底部保留 `<skill-sheet>`，事件仍使用 `onSheetDismiss` 與 `onReverseLookup`。反查結果必須切換 `activeMode="officer"`，而不是回到已移除的數字 Tab。

- [ ] **步驟 6：執行 WXML 靜態契約 GREEN 驗證**

執行：

```powershell
npm.cmd test -- tests/pages/catalog-page.test.ts
```

預期：兩模式、單一搜尋輸入、Sheet 操作、既有列表與技能 Sheet 契約通過。

---

### 工作項目 4：依 Design Foundation 重寫資料頁 WXSS

**文件：**
- 修改：`miniprogram/pages/catalog/index.wxss`
- 測試：`tests/pages/catalog-page.test.ts`

**介面：**
- 使用：工作項目 3 的 WXML BEM 類名與 Design Foundation Token。
- 產出：無頁面級橫向溢出的模式頁籤、搜尋列、航海士列表、技能列表與 Bottom Sheet；保留技能列內部的必要橫向圖示區。

- [ ] **步驟 1：建立 BEM 類名對應的頁面布局**

使用 `catalog-page__*`、`catalog-page__mode-*`、`catalog-page__search-*`、`catalog-page__filter-*`、`catalog-page__sheet-*`、`catalog-page__officer-*` 與 `catalog-page__skill-*` 類名；新規則只使用 `var(--uwo-*)`、Design Foundation 間距序列、圓角與陰影。

- [ ] **步驟 2：建立觸控與狀態樣式**

模式切換、篩選入口、Sheet 操作按鈕與主要 chip 的可見文字不小於 `22rpx`；重要操作高度至少 `88rpx`；active、disabled、empty 與錯誤狀態同時有文字語義，不只改變色彩。

- [ ] **步驟 3：建立 Bottom Sheet 安全區樣式**

Sheet 使用 `--uwo-radius-sheet`、`--uwo-shadow-sheet`、遮罩與 `padding-bottom: calc(var(--uwo-space-8) + env(safe-area-inset-bottom))`；內容以 `scroll-view` 限制高度，避免窄屏遮擋操作按鈕。

- [ ] **步驟 4：補充 WXSS 靜態契約並確認綠燈**

確認 `.catalog-page__sheet` 有 28rpx 頂部圓角與安全區，主要操作有 88rpx 高度，頁面未建立固定寬度；重新執行頁面測試。

---

### 工作項目 5：全量回歸、品質門禁與驗收準備

**文件：**
- 僅在修正準確描述已批准行為的測試斷言時修改：`tests/pages/catalog-page.test.ts`。
- 工作項目 2–4 以外不修改其他生產文件。

**介面：**
- 使用：工作項目 1–4 的通過測試與完整資料頁流程。
- 產出：可供使用者驗收的 P7 分支、完整驗證結果、完整變更文件清單與擬用 commit message。

- [ ] **步驟 1：執行資料頁聚焦回歸**

執行：

```powershell
npm.cmd test -- tests/pages/catalog-page.test.ts tests/domain/catalog-query.test.ts tests/presenters/catalog-presenter.test.ts tests/presenters/catalog-page-state.test.ts
```

預期：所有聚焦測試通過，並確認 `queryCatalog` 的 AND／OR／ALL 測試未被修改。

- [ ] **步驟 2：執行完整驗證**

執行：

```powershell
npm.cmd run verify
git diff --check
```

預期：`verify` 所有子命令退出碼為 0；格式、lint、typecheck、Vitest、runtime network、資料檢查、生成檢查與 diff whitespace 全部通過。

- [ ] **步驟 3：檢查範圍與禁止路徑**

執行：

```powershell
git status --short
git diff --name-only 0f4ad77
git ls-files --others --exclude-standard
git diff --name-only -- archive data/master miniprogram/generated miniprogram/domain miniprogram/pages/fleet miniprogram/pages/adventure-fleet cloudfunctions
```

預期：追蹤變更只包含規格、計畫、資料頁 Controller／WXML／WXSS／測試；未跟蹤清單保留既有 `docs/audits/`；禁止路徑命令沒有輸出。

- [ ] **步驟 4：整理手動驗收清單與提交訊息**

擬用 commit message：

```text
feat(catalog): 重構資料頁資訊架構
```

提交前向使用者展示完整變更文件、`npm.cmd run verify` 結果、手動驗收仍需在 DevTools 完成的項目與上述 commit message；取得確認後才執行 `git add`、commit、merge 或 push。

- [ ] **步驟 5：執行 Git 整合**

依使用者已授權的流程：

```powershell
git add docs/superpowers/specs/2026-08-09-catalog-information-architecture-design.md docs/superpowers/plans/2026-08-09-catalog-information-architecture.md miniprogram/pages/catalog/index.ts miniprogram/pages/catalog/index.wxml miniprogram/pages/catalog/index.wxss tests/pages/catalog-page.test.ts
git commit -m "feat(catalog): 重構資料頁資訊架構"
git switch main
git merge --ff-only codex/phase-8-資料頁資訊架構
git push origin main
```

若 `merge --ff-only` 或 push 因遠端分支更新失敗，停止並回報，不使用 force push，也不刪除功能分支或未跟蹤 `docs/audits/`。
