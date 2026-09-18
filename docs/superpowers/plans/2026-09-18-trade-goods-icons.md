# 貿易品淡旺季真實圖示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 656 個貿易品在淡旺季清單頁和詳情頁都顯示 voyage.tw 對應的真實圖示，並沿用現有素材校驗與 CloudBase 版本化交付流程。

**Architecture:** 以 `data/master/trade-goods.json` 的 `iconId ?? sourceRefs.voyageTw` 解析圖示來源，使用現有下載器將去重後 PNG 放入 `data/assets/staging/`，再透過資產依賴索引和 CloudBase manifest 生成 `iconPath`。兩個貿易品頁只消費生成的路徑；圖片單張載入失敗時顯示文字占位，保留所有貿易品資料和操作流程。

**Tech Stack:** TypeScript、Vitest、Node.js 資產工具、Sharp PNG 校驗、微信小程序 WXML/WXSS、CloudBase CDN manifest；不新增依賴。

## Global Constraints

- `archive/` 只讀；規範資料仍由 `data/master/` 維護；`miniprogram/generated/` 只能由生成工具產生，禁止手動修改。
- 小程序運行時不直接依賴 voyage.tw，不新增 `wx.request`、`wx.cloud`、Node.js API 或不受控遠程 URL。
- 所有資料解析、素材清單、URL 生成、去重、雜湊和確定性構建邏輯遵循紅—綠—重構循環。
- 貿易品資料來源 URL 為 `https://voyage.tw/img/trade/uwo_<image-id>.png`，其中 `<image-id>` 是 `iconId ?? sourceRefs.voyageTw`。
- 普通貿易品使用自身來源 ID；有 `iconId` 覆蓋值的貿易品使用覆蓋 ID。
- 下載後必須驗證 HTTP 200、PNG 內容和 Sharp 可解碼性；去重後的圖示檔名格式為 `trade_<image-id>.png`。
- 新增或修改的 WXSS 只使用 Design Foundation 的顏色、字體、間距、圓角和狀態規範；UI 文字使用繁體中文，WXML/WXSS 類名使用英文 BEM。
- 不把 voyage.tw URL 寫入 WXML、頁面 TypeScript 或生成後的 runtime 路徑；構建階段才可由工具訪問 voyage.tw。
- 不修改貿易品名稱、分類、淡旺季規則、港口矩陣、月份計算和其他頁面行為。
- CloudBase 上傳是外部狀態變更；上傳前必須展示去重後檔案數、總大小、release 影響範圍和擬上傳路徑，取得用戶確認後才能執行。
- 提交前必須展示變更文件、驗證結果、DevTools 結果和擬用 commit message，未獲確認不 commit。

---

## File Map

### 新增

- `tools/asset-pipeline/trade-icons.ts`：貿易品圖示 image ID、檔名、來源 URL 和去重來源清單的純函式。
- `tests/asset-pipeline/trade-icons.test.ts`：貿易品圖示解析與去重契約。

### 修改

- `tools/asset-pipeline/download-assets.ts`：建立貿易品圖示下載項目並納入下載 CLI。
- `tools/asset-pipeline/setup-assets.ts`：將貿易品資料傳入依賴索引和 PNG 來源校驗。
- `tools/asset-pipeline/publish-assets.ts`：發布計畫重建依賴索引時包含貿易品圖示。
- `tools/data-pipeline/asset-dependencies.ts`：增加 `tradeIcons` 以及其 root/path 所有權校驗。
- `tools/data-pipeline/build-runtime-data.ts`：匯出共用的 manifest URL 解析 helper，供貿易品生成器使用。
- `tools/data-pipeline/build-trade-runtime-data.ts`：為索引和詳情輸出 `iconPath`。
- `tools/data-pipeline/generate.ts`：以含貿易品圖示的依賴索引生成 runtime 資料。
- `miniprogram/contracts/runtime-data.ts`：增加貿易品索引與詳情的 `iconPath` 以及資產依賴索引的 `tradeIcons`。
- `miniprogram/subpkg-trade/presenters/trade-season-presenter.ts`：將詳情圖示路徑投影到標題 view state。
- `miniprogram/subpkg-trade/pages/index/index.ts`：清單條目攜帶圖示失敗狀態並處理單張圖片錯誤。
- `miniprogram/subpkg-trade/pages/index/index.wxml`：加入清單圖示和失敗占位。
- `miniprogram/subpkg-trade/pages/index/index.wxss`：加入圖示容器、卡片兩欄布局和占位樣式。
- `miniprogram/subpkg-trade/pages/detail/index.ts`：詳情標題圖示失敗狀態和錯誤事件。
- `miniprogram/subpkg-trade/pages/detail/index.wxml`：加入詳情 hero 圖示和失敗占位。
- `miniprogram/subpkg-trade/pages/detail/index.wxss`：加入詳情 hero row 和圖示樣式。
- `tests/asset-pipeline/download-assets.test.ts`：下載 entry 的貿易品案例。
- `tests/asset-pipeline/setup-assets.test.ts`：貿易品依賴素材來源校驗案例。
- `tests/data-pipeline/asset-dependencies.test.ts`：貿易品圖示 mapping 和去重所有權案例。
- `tests/data-pipeline/asset-dependency-output.test.ts`：生成依賴輸出的貿易品 mapping 契約。
- `tests/data-pipeline/trade-runtime-output.test.ts`：生成索引、詳情和 deterministic icon path 契約。
- `tests/runtime-contract/trade-runtime.test.ts`：實際貿易 runtime 檔案的圖示欄位契約。
- `tests/pages/trade-page.test.ts`：清單頁資料和 WXML/WXSS 圖示契約。
- `tests/pages/trade-detail-page.test.ts`：詳情 presenter、失敗狀態和 WXML/WXSS 圖示契約。
- `tests/domain/trade-query.test.ts`、`tests/domain/trade-season.test.ts`、`tests/presenters/trade-season-presenter.test.ts`：為新增的 required `iconPath` 補齊最小測試 fixtures。
- `data/assets/asset-dependencies.json`：由 `npm run data:generate` 生成，加入去重後貿易品圖示依賴。
- `data/assets/cloudbase-manifest.json`：獲授權執行 `npm run assets:publish` 後由工具寫入新的 release 清單。
- `miniprogram/subpkg-trade/trade-goods.js`、`trade-details-*.js`：由生成器產生圖示路徑，不手動編輯。

### 不應修改

- `archive/**`
- `data/master/trade-goods.json`（現有 `iconId` 欄位和 `sourceRefs` 已足夠；不把普通 ID 重複寫入 `iconId`）
- `miniprogram/generated/**`（本任務不把貿易 runtime 移入主包）
- Cloud Function、Controller、Solver、非貿易品頁面和依賴版本。

---

## Task 1: 建立貿易品圖示來源解析器

**Files:**

- Create: `tools/asset-pipeline/trade-icons.ts`
- Test: `tests/asset-pipeline/trade-icons.test.ts`

**Interfaces:**

- Consumes: `CanonicalTradeGood` 的 `id`、`iconId`、`sourceRefs.voyageTw`。
- Produces:

  ```ts
  export interface TradeIconSource {
    imageId: string
    filename: string
    url: string
    tradeIds: string[]
  }

  export const resolveTradeIconImageId: (trade: Pick<CanonicalTradeGood, 'id' | 'iconId' | 'sourceRefs'>) => string
  export const tradeIconFilename: (imageId: string) => string
  export const tradeIconUrl: (imageId: string) => string
  export const buildTradeIconSources: (trades: readonly CanonicalTradeGood[]) => TradeIconSource[]
  ```

- [ ] **Step 1: Write the failing tests**

  In `tests/asset-pipeline/trade-icons.test.ts`, add fixtures for a normal trade and an overridden trade:

  ```ts
  const normal = {
    id: 'trade0615',
    iconId: null,
    sourceRefs: { voyageTw: 'trade0615' },
  } as const
  const overridden = {
    id: 'trade18T903',
    iconId: 'trade1817',
    sourceRefs: { voyageTw: 'trade18T903' },
  } as const

  it('resolves normal and overridden source image IDs', () => {
    expect(resolveTradeIconImageId(normal)).toBe('trade0615')
    expect(resolveTradeIconImageId(overridden)).toBe('trade1817')
  })

  it('builds the voyage.tw URL and collision-safe filename', () => {
    expect(tradeIconUrl('trade0615')).toBe(
      'https://voyage.tw/img/trade/uwo_trade0615.png',
    )
    expect(tradeIconFilename('trade0615')).toBe('trade_trade0615.png')
  })

  it('deduplicates two goods that share an overridden image ID', () => {
    const sources = buildTradeIconSources([normal, overridden, {
      id: 'trade1817',
      iconId: null,
      sourceRefs: { voyageTw: 'trade1817' },
    }] as never[])

    expect(sources).toEqual([
      {
        imageId: 'trade0615',
        filename: 'trade_trade0615.png',
        url: 'https://voyage.tw/img/trade/uwo_trade0615.png',
        tradeIds: ['trade0615'],
      },
      {
        imageId: 'trade1817',
        filename: 'trade_trade1817.png',
        url: 'https://voyage.tw/img/trade/uwo_trade1817.png',
        tradeIds: ['trade18T903', 'trade1817'],
      },
    ])
  })
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```powershell
  npx vitest run tests/asset-pipeline/trade-icons.test.ts
  ```

  Expected: FAIL because `tools/asset-pipeline/trade-icons.ts` and its exports do not exist yet.

- [ ] **Step 3: Implement the minimal resolver**

  Use `trade.iconId ?? trade.sourceRefs.voyageTw`, a fixed `https://voyage.tw` base, and a deterministic `Map` keyed by resolved image ID. Sort output by UTF-8 ID comparison, and sort each `tradeIds` list the same way. Do not make network calls in this file.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run the same Vitest command. Expected: all resolver, URL, filename and deduplication cases PASS.

---

## Task 2: Extend the source download pipeline

**Files:**

- Modify: `tools/asset-pipeline/download-assets.ts`
- Modify: `tests/asset-pipeline/download-assets.test.ts`
- Test: `tests/asset-pipeline/trade-icons.test.ts`

**Interfaces:**

- Consumes: `buildTradeIconSources()` from Task 1.
- Produces:

  ```ts
  export const buildTradeAssetEntries: (
    trades: readonly CanonicalTradeGood[],
  ) => AssetEntry[]
  ```

  Each entry uses `ownerCanonicalId: trade-icon_<imageId>`, `kind: 'icon'`, `sourceId: imageId`, `url: tradeIconUrl(imageId)`, and `localPath: data/assets/staging/<filename>`.

- [ ] **Step 1: Write failing download-entry tests**

  Add a test that calls `buildTradeAssetEntries()` with `trade18T903` and `trade1817`, then asserts one shared entry for `trade_trade1817.png`; add a full-data assertion that the current master data produces 633 unique entries for 656 goods.

  Add a download test with an injected fetcher:

  ```ts
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(Buffer.from('png'), { status: 200 }),
  )
  const entries = buildTradeAssetEntries([normalTrade])
  const manifest = await downloadAssets(entries.map((entry) => ({
    ...entry,
    localPath: join(root, entry.ownerCanonicalId + '.png'),
  })), [], { fetcher, sleep: async () => undefined, random: () => 0 })

  expect(fetcher).toHaveBeenCalledWith(
    'https://voyage.tw/img/trade/uwo_trade0615.png',
    expect.objectContaining({ headers: { 'user-agent': expect.any(String) } }),
  )
  expect(manifest[0]).toMatchObject({
    canonicalId: 'trade-icon_trade0615',
    sourceId: 'trade0615',
    status: 200,
  })
  ```

- [ ] **Step 2: Run focused tests to verify RED**

  Run:

  ```powershell
  npx vitest run tests/asset-pipeline/trade-icons.test.ts tests/asset-pipeline/download-assets.test.ts
  ```

  Expected: the existing officer/skill tests continue to pass while new trade entry cases fail because the builder and CLI integration are absent.

- [ ] **Step 3: Implement trade entry construction and CLI integration**

  Keep the existing officer and skill entry behavior unchanged. Add `buildTradeAssetEntries()` using the Task 1 source list. In the CLI branch, load `data/master/trade-goods.json`, combine officer/skill entries with trade entries, and pass the combined list to `downloadAssets()` so `npm run assets:download -- 0` fetches all trade icons.

  Preserve existing `limit` behavior for officer/skill entries. Trade icons are always included in full because this feature requires the complete trade catalog; the existing numeric limit remains a development limit for officer/skill downloads only.

- [ ] **Step 4: Run focused tests to verify GREEN**

  Run the commands from Step 2. Expected: all existing download tests and new 633-entry/URL/cache tests PASS.

---

## Task 3: Add trade icons to dependency indexing and asset setup

**Files:**

- Modify: `tools/data-pipeline/asset-dependencies.ts`
- Modify: `tools/asset-pipeline/setup-assets.ts`
- Modify: `tools/asset-pipeline/publish-assets.ts`
- Modify: `miniprogram/contracts/runtime-data.ts`
- Modify: `tests/data-pipeline/asset-dependencies.test.ts`
- Modify: `tests/data-pipeline/asset-dependency-output.test.ts`
- Modify: `tests/asset-pipeline/setup-assets.test.ts`

**Interfaces:**

- Consumes: `CanonicalTradeGood[]` and `buildTradeIconSources()`.
- Produces:

  ```ts
  interface AssetDependencyOptions {
    assetFilenames?: ReadonlySet<string>
    skillIconOverrides?: ReadonlyMap<string, string>
    trades?: readonly CanonicalTradeGood[]
  }

  interface RuntimeAssetDependencyIndex {
    // existing fields remain unchanged
    tradeIcons: Record<string, RuntimeAssetReference>
  }
  ```

- [ ] **Step 1: Write failing dependency tests**

  Extend the test fixture with two goods sharing `iconId: 'trade1817'`. Build the index with `trades` and an `assetFilenames` set containing `trade_trade1817.png`. Assert:

  ```ts
  expect(index.tradeIcons.trade18T903).toEqual(index.tradeIcons.trade1817)
  expect(index.roots.flatMap((root) => root.files)).toContain('trade_trade1817.png')
  expect(() => assertAssetDependencyIndex(index)).not.toThrow()
  ```

  Add a missing-file case that expects `validateReferencedAssetSources()` to reject with `trade_trade1817.png`. Update the generated-output test to assert `Object.keys(dependencies.tradeIcons)` covers 656 current goods and that every mapped path starts with `/subpkg-assets-`.

- [ ] **Step 2: Run focused tests to verify RED**

  Run:

  ```powershell
  npx vitest run tests/data-pipeline/asset-dependencies.test.ts tests/data-pipeline/asset-dependency-output.test.ts tests/asset-pipeline/setup-assets.test.ts
  ```

  Expected: the new assertions fail because the dependency contract has no trade mapping.

- [ ] **Step 3: Implement trade dependency ownership**

  Add optional `trades` to `buildAssetDependencyIndex()`. For each unique source in `buildTradeIconSources(trades)`, call `addFirstOwner()` with the first asset root and add the filename to that root exactly once. Build `tradeIcons[trade.id]` from the shared filename. Keep officer root order, officer IDs, skill fallback, and existing path ownership unchanged. Extend `assertAssetDependencyIndex()` to validate all `tradeIcons` references.

  In `setup-assets.ts`, load `trade-goods.json` in `canonicalData()` and pass `trades` to `buildAssetDependencyIndex()`. In `publish-assets.ts`, pass the same canonical trade list when `readPublishDependencies()` rebuilds from staged PNG filenames. In `generate.ts`, pass `tradeDataset.tradeGoods` when building the dependency index.

- [ ] **Step 4: Run focused tests to verify GREEN**

  Run the command from Step 2. Expected: all existing officer/skill dependency tests and new trade mapping/PNG missing-file tests PASS.

---

## Task 4: Generate runtime `iconPath` fields

**Files:**

- Modify: `tools/data-pipeline/build-runtime-data.ts`
- Modify: `tools/data-pipeline/build-trade-runtime-data.ts`
- Modify: `tools/data-pipeline/generate.ts`
- Modify: `miniprogram/contracts/runtime-data.ts`
- Modify: `tests/data-pipeline/trade-runtime-output.test.ts`
- Modify: `tests/runtime-contract/trade-runtime.test.ts`
- Modify: `tests/domain/trade-query.test.ts`
- Modify: `tests/domain/trade-season.test.ts`
- Modify: `tests/presenters/trade-season-presenter.test.ts`

**Interfaces:**

- Consumes: `AssetDependencyIndex.tradeIcons`, `RuntimeAssetUrlManifest`, and `publicAssetUrl()`.
- Produces:

  ```ts
  interface RuntimeTradeGoodIndexEntry {
    // existing fields remain unchanged
    iconPath: string
  }

  interface RuntimeTradeGoodDetail {
    // existing fields remain unchanged
    iconPath: string
  }

  export const buildTradeGoodsIndex: (
    dataset: CanonicalTradeDataset,
    dependencies?: AssetDependencyIndex,
    manifest?: RuntimeAssetUrlManifest,
  ) => RuntimeTradeGoodIndexEntry[]

  export const buildTradeGoodDetails: (
    dataset: CanonicalTradeDataset,
    dependencies?: AssetDependencyIndex,
    manifest?: RuntimeAssetUrlManifest,
  ) => Record<string, RuntimeTradeGoodDetail>
  ```

- [ ] **Step 1: Write failing generated-runtime tests**

  Update `tests/data-pipeline/trade-runtime-output.test.ts` so the wine index and detail both expect:

  ```ts
  iconPath: '/subpkg-assets-0/imgs/trade_trade0615.png'
  ```

  Add an overridden trade assertion that `trade18T903` uses `trade_trade1817.png`. Add a deterministic two-output comparison that includes the icon paths. Update `tests/runtime-contract/trade-runtime.test.ts` to require a non-empty `iconPath` for every index entry and every detail record.

  Add `iconPath: '/subpkg-assets-0/imgs/trade_trade0615.png'` to existing hand-written runtime fixtures in the domain and presenter tests so the required contract remains explicit.

- [ ] **Step 2: Run focused tests to verify RED**

  Run:

  ```powershell
  npx vitest run tests/data-pipeline/trade-runtime-output.test.ts tests/runtime-contract/trade-runtime.test.ts tests/domain/trade-query.test.ts tests/domain/trade-season.test.ts tests/presenters/trade-season-presenter.test.ts
  ```

  Expected: new icon assertions fail and TypeScript reports missing required fixture fields.

- [ ] **Step 3: Implement path resolution and generator wiring**

  Export `filenameFromPath()` and `publicAssetUrl()` from `build-runtime-data.ts` without changing their existing validation behavior. In `build-trade-runtime-data.ts`, resolve each trade through `dependencies.tradeIcons[trade.id]`; if no dependency index is passed, use the deterministic fallback `/subpkg-assets-0/imgs/trade_<resolvedImageId>.png`. If a manifest is passed, call `publicAssetUrl()` with the mapped filename so a missing or invalid published asset fails generation rather than silently producing a broken path.

  Add `iconPath` to both `buildTradeGoodsIndex()` and `buildTradeGoodDetails()`. Extend `writeTradeRuntimeData()` with optional dependency and manifest parameters, then pass `assetDependencies` and the combined `runtimeAssetManifest` from `generate.ts`.

- [ ] **Step 4: Run focused tests to verify GREEN**

  Run the command from Step 2. Expected: generated fallback paths, override paths, manifest validation and deterministic output all PASS.

---

## Task 5: Add real icons to the trade list page

**Files:**

- Modify: `miniprogram/subpkg-trade/pages/index/index.ts`
- Modify: `miniprogram/subpkg-trade/pages/index/index.wxml`
- Modify: `miniprogram/subpkg-trade/pages/index/index.wxss`
- Modify: `tests/pages/trade-page.test.ts`

**Interfaces:**

- Consumes: `RuntimeTradeGoodIndexEntry.iconPath` from Task 4.
- Produces: each `visibleGoods` item includes `iconFailed: boolean`; `onTradeIconError(event)` changes only the matching item to its failure placeholder.

- [ ] **Step 1: Write failing page tests**

  Extend `TradeListItem` with `iconPath` and `iconFailed`. After `page.onLoad()`, assert the wine item has the generated path and `iconFailed === false`. Add a test for the error event:

  ```ts
  page.onLoad()
  page.onTradeIconError({
    currentTarget: { dataset: { tradeId: 'trade0615' } },
  } as never)

  const wine = page.data.visibleGoods.find((item) => item.id === 'trade0615')
  expect(wine?.iconFailed).toBe(true)
  expect(page.data.resultCount).toBe(page.data.visibleGoods.length)
  ```

  Extend markup assertions to require `<image`, `lazy-load`, `binderror="onTradeIconError"`, `trade-result__icon`, and visible `圖示載入失敗` fallback text. Assert the existing `data-trade-id` navigation contract remains present.

- [ ] **Step 2: Run the page test to verify RED**

  Run:

  ```powershell
  npx vitest run tests/pages/trade-page.test.ts
  ```

  Expected: icon data, error handler and markup assertions fail.

- [ ] **Step 3: Implement list data and WXML**

  Set `iconFailed: false` in `toListItem()`. Add `onTradeIconError()` that reads `currentTarget.dataset.tradeId`, maps `visibleGoods`, and sets only the matching item's `iconFailed` to `true`; ignore malformed events. Keep `refreshResults()` responsible for rebuilding fresh item state after search/category changes.

  Replace the card's single text flow with this structure while preserving all existing labels:

  ```xml
  <view class="trade-result__icon-wrap">
    <image
      wx:if="{{item.iconPath && !item.iconFailed}}"
      class="trade-result__icon"
      src="{{item.iconPath}}"
      mode="aspectFit"
      lazy-load="{{true}}"
      binderror="onTradeIconError"
      data-trade-id="{{item.id}}"
      aria-label="{{item.name}}圖示"
    />
    <text wx:else class="trade-result__icon-fallback">圖示載入失敗</text>
  </view>
  <view class="trade-result__body">
    <!-- existing heading, meta and seasons remain here -->
  </view>
  ```

- [ ] **Step 4: Implement list styles using Design Foundation tokens**

  Make `.trade-result` a flex row with `gap: var(--uwo-space-3)`. Give the icon wrapper `width: 96rpx`, `height: 96rpx`, `flex: 0 0 96rpx`, `border-radius: var(--uwo-radius-control)`, `background: var(--uwo-color-surface-muted)`, and centered fallback text at `var(--uwo-font-size-minimum-action)`. Give the body `min-width: 0` and `flex: 1`. Keep the existing card border, radius, and state colors. Add a narrow-screen rule only if DevTools shows overflow; use token spacing and allow the body text to wrap.

- [ ] **Step 5: Run page tests to verify GREEN**

  Run `npx vitest run tests/pages/trade-page.test.ts`. Expected: list data, per-item failure isolation and WXML/WXSS contracts PASS.

---

## Task 6: Add the same icon to the trade detail page

**Files:**

- Modify: `miniprogram/subpkg-trade/presenters/trade-season-presenter.ts`
- Modify: `miniprogram/subpkg-trade/pages/detail/index.ts`
- Modify: `miniprogram/subpkg-trade/pages/detail/index.wxml`
- Modify: `miniprogram/subpkg-trade/pages/detail/index.wxss`
- Modify: `tests/pages/trade-detail-page.test.ts`
- Modify: `tests/presenters/trade-season-presenter.test.ts`

**Interfaces:**

- Consumes: `RuntimeTradeGoodDetail.iconPath` from Task 4.
- Produces: `TradeDetailPageState.title.iconPath` and page-level `iconFailed: boolean`; `onTradeIconError()` switches only the hero image to its fallback.

- [ ] **Step 1: Write failing presenter/page tests**

  Add `iconPath` to the presenter fixture and assert:

  ```ts
  expect(presentTradeDetail(detail, reference, 4).title.iconPath).toBe(
    '/subpkg-assets-0/imgs/trade_trade0615.png',
  )
  ```

  Add page markup assertions for `<image`, `trade-detail__icon`, `binderror="onTradeIconError"`, and `圖示載入失敗`. Add a page behavior assertion that `onTradeIconError()` sets `iconFailed` without changing `title.name`, `ports.length`, or `hasPorts`.

- [ ] **Step 2: Run focused presenter/page tests to verify RED**

  Run:

  ```powershell
  npx vitest run tests/presenters/trade-season-presenter.test.ts tests/pages/trade-detail-page.test.ts
  ```

  Expected: title icon path, page state, and markup assertions fail.

- [ ] **Step 3: Implement presenter and page state**

  Add `iconPath: string` to `TradeDetailPageState.title` and map `detail.iconPath` in `presentTradeDetail()`. Add `iconFailed: false` to the detail page initial and empty states; reset it to `false` after a successful detail load. Add:

  ```ts
  onTradeIconError() {
    this.setData({ iconFailed: true })
  }
  ```

  Keep `refreshCurrentMonth()` from clearing a current image failure state; it should only refresh matrix data.

- [ ] **Step 4: Implement detail WXML and styles**

  Wrap the header content in a flex hero row:

  ```xml
  <view class="trade-detail__hero-row">
    <view class="trade-detail__icon-wrap">
      <image
        wx:if="{{title.iconPath && !iconFailed}}"
        class="trade-detail__icon"
        src="{{title.iconPath}}"
        mode="aspectFit"
        binderror="onTradeIconError"
        aria-label="{{title.name}}圖示"
      />
      <text wx:else class="trade-detail__icon-fallback">圖示載入失敗</text>
    </view>
    <view class="trade-detail__hero-copy">
      <!-- existing eyebrow, title, meta and summary remain here -->
    </view>
  </view>
  ```

  Use a `112rpx × 112rpx` icon wrapper with `var(--uwo-radius-control)` and `var(--uwo-color-surface-muted)`, a `min-width: 0` hero copy, and tokenized gaps. Keep the existing dark header and all matrix styles unchanged. Add the existing `@media (max-width: 360px)` direction switch if needed so the hero copy wraps without horizontal overflow.

- [ ] **Step 5: Run focused presenter/page tests to verify GREEN**

  Run the command from Step 2. Expected: presenter mapping, page failure isolation, existing matrix behavior and markup contracts PASS.

---

## Task 7: Download and locally validate the 633 source PNGs

**Files:**

- Generated/ignored: `data/assets/staging/trade_*.png`
- Generated/ignored: `data/assets/source-asset-manifest.json`
- Generated: `data/assets/asset-dependencies.json`

**Interfaces:**

- Consumes: `data/master/trade-goods.json`, Task 2 downloader, Task 3 dependency index.
- Produces: 633 unique valid staged PNGs and a dependency index mapping all 656 goods. `trade02T092`（黃銅礦）經使用者批准以 `iconId: "trade0801"` 共用銅礦圖示，因其原始 voyage.tw 圖示回應 404。

- [ ] **Step 1: Run the full trade download**

  Run:

  ```powershell
  npm run assets:download -- 0
  ```

  Expected: the command completes with 656 trade references represented by 633 unique `trade_*.png` files; any non-200 response is printed and exits non-zero.

- [ ] **Step 2: Run source setup and PNG validation**

  Run:

  ```powershell
  npm run assets:setup
  ```

  Expected: Sharp decodes every referenced trade PNG, the setup reports the retained source count, and `data/assets/asset-dependencies.json` contains 656 `tradeIcons` entries. No file is copied under `miniprogram/`.

- [ ] **Step 3: Run a read-only completeness audit**

  Run:

  ```powershell
  $dataset = Get-Content -Raw 'data/master/trade-goods.json' | ConvertFrom-Json
  $expected = @($dataset.tradeGoods | ForEach-Object { if ($null -ne $_.iconId) { $_.iconId } else { $_.id } } | Sort-Object -Unique)
  $actual = @(Get-ChildItem 'data/assets/staging/trade_*.png' -File | ForEach-Object { $_.BaseName.Substring(6) } | Sort-Object -Unique)
  if ($expected.Count -ne 633 -or $actual.Count -ne 633 -or (@(Compare-Object $expected $actual).Count -ne 0)) { throw '貿易品圖示來源不完整' }
  "Trade icon sources: goods=$($dataset.tradeGoods.Count), unique=$($expected.Count), staged=$($actual.Count)"
  ```

  Expected: `goods=656, unique=633, staged=633` and no comparison differences.

- [ ] **Step 4: Run the asset and data focused tests**

  Run:

  ```powershell
  npx vitest run tests/asset-pipeline tests/data-pipeline/asset-dependencies.test.ts tests/data-pipeline/asset-dependency-output.test.ts
  ```

  Expected: all asset download, setup, dependency and output tests PASS.

---

## Task 8: Prepare and explicitly authorize CloudBase publication

**Files:**

- Read/validate: `data/assets/cloudbase-manifest.json`
- Read/validate: `data/assets/cloudbase-reused-skill-icons.json`
- External write after confirmation: CloudBase asset release

**Interfaces:**

- Consumes: 633 staged trade PNGs and the dependency index from Task 7.
- Produces: a new versioned CloudBase manifest whose `assets` includes all existing reused assets plus the new trade icon files.

- [ ] **Step 1: Build a dry-run publication summary**

  Run the publication plan in check-only/injected form or inspect the plan through the existing `buildAssetReleasePlan()` test helper. Report:

  - current manifest release ID;
  - number of existing assets reused;
  - number of new files to upload;
  - total bytes of new files and total release bytes;
  - first and last planned trade CloudBase paths;
  - configured CDN origin and content version.

  Do not call `npm run assets:publish` in this step.

- [ ] **Step 2: Ask the user for publication confirmation**

  Present the exact summary and ask whether to upload the new versioned assets to the configured CloudBase environment. If the user does not confirm, leave the code and staged files ready but do not write `data/assets/cloudbase-manifest.json` or contact CloudBase.

- [ ] **Step 3: Publish only after confirmation**

  After confirmation, run:

  ```powershell
  npm run assets:publish
  ```

  Expected: the command reuses unchanged existing assets, uploads only new trade PNGs, verifies public PNG responses, writes a validated versioned manifest, and does not delete any previous release.

- [ ] **Step 4: Validate the published manifest**

  Run:

  ```powershell
  npm run assets:manifest:check
  ```

  Expected: the new release ID and asset count validate successfully, and every `trade_<image-id>.png` has the configured CloudBase CDN origin and current release path.

---

## Task 9: Generate runtime output against the published release

**Files:**

- Modify by generator: `data/assets/asset-dependencies.json`
- Modify by generator: `miniprogram/subpkg-trade/trade-goods.js`
- Modify by generator: `miniprogram/subpkg-trade/trade-details-0.js` through `trade-details-9.js`
- Modify by generator if required: `miniprogram/subpkg-trade/trade-detail-index.js`, `trade-detail-loaders.js`

**Interfaces:**

- Consumes: Task 3 dependency index and Task 8 validated CloudBase manifest.
- Produces: runtime trade records whose `iconPath` values point to the same published release.

- [ ] **Step 1: Generate from `data/master`**

  Run:

  ```powershell
  npm run data:generate
  ```

  Expected: generator reads the published manifest, validates all 633 trade icon files, and writes `iconPath` into the trade index and all ten detail shards. It must not write trade data into `miniprogram/generated/`.

- [ ] **Step 2: Verify release consistency with a read-only assertion**

  Run:

  ```powershell
  $manifest = Get-Content -Raw 'data/assets/cloudbase-manifest.json' | ConvertFrom-Json
  $index = node -e "const v=require('./miniprogram/subpkg-trade/trade-goods.js'); console.log(JSON.stringify(v))" | ConvertFrom-Json
  $prefix = "$($manifest.cdnOrigin)/$($manifest.cloudPathPrefix)/$($manifest.releaseId)/trade_"
  $bad = @($index | Where-Object { -not $_.iconPath.StartsWith($prefix) })
  if ($bad.Count -gt 0) { throw 'runtime trade iconPath does not use the published release' }
  "Runtime trade icon paths: $($index.Count), release=$($manifest.releaseId)"
  ```

  Expected: 656 paths and zero bad entries.

- [ ] **Step 3: Run runtime and page focused tests**

  Run:

  ```powershell
  npx vitest run tests/data-pipeline/trade-runtime-output.test.ts tests/runtime-contract/trade-runtime.test.ts tests/pages/trade-page.test.ts tests/pages/trade-detail-page.test.ts tests/integration/trade-feature-contract.test.ts
  ```

  Expected: all trade data, runtime, page and integration tests PASS.

---

## Task 10: Full verification and user-facing review gate

**Files:**

- Read-only verification across the worktree.

- [ ] **Step 1: Run formatting, lint and type checks**

  Run:

  ```powershell
  npm run format:check
  npm run lint
  npm run typecheck
  ```

  Expected: all commands exit 0. If formatting fails, format only files changed by this task and rerun the checks; do not format unrelated files.

- [ ] **Step 2: Run the full test and architecture gates**

  Run:

  ```powershell
  npm test
  npm run check:runtime-network
  npm run check:miniprogram-size
  npm run assets:ui:check
  npm run assets:manifest:check
  npm run data:check
  npm run generate:check
  ```

  Expected: all commands exit 0; runtime network output has no new violation, main-package budget remains within its existing limit, and generated files are clean after regeneration.

- [ ] **Step 3: Run the repository verification command**

  Run:

  ```powershell
  npm run verify
  git diff --check
  ```

  Expected: `npm run verify` exits 0 and `git diff --check` produces no whitespace errors.

- [ ] **Step 4: Perform UI verification**

  Use the available WeChat DevTools review workflow to open `/subpkg-trade/pages/index/index` and `/subpkg-trade/pages/detail/index?id=trade0615`. Check at 320px, 375px, 393px and 430px:

  - list cards show the correct wine icon and remain tappable;
  - the detail hero shows the same wine icon;
  - search and category filtering keep icons aligned with their own rows;
  - simulated image failure shows `圖示載入失敗` while text and matrix remain usable;
  - long names and the hero row do not create horizontal overflow or crop important text;
  - existing safe-area padding and matrix layout remain unchanged.

- [ ] **Step 5: Show the final change and commit gate**

  Before committing implementation changes, show:

  ```powershell
  git status --short
  git diff --stat
  git diff --check
  ```

  Report changed files, test results, asset count/size, CloudBase release ID, DevTools results and proposed commit message `feat: 補上貿易品真實圖示`. Wait for explicit user confirmation before running `git commit`.
