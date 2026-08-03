# Offline Asset Subpackage Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the offline catalog reliably load all ten local asset subpackages on real devices before rendering portrait and skill image paths.

**Architecture:** Add a small runtime loader that warms each existing `subpkg-a0` through `subpkg-a9` by navigating to its placeholder page and immediately returning. The catalog page will await that loader, gate its list behind loading/error state, and expose retry without changing generated asset paths or adding network access.

**Tech Stack:** WeChat Mini Program TypeScript, native `wx.navigateTo`/`wx.navigateBack`, WXML/WXSS, Vitest.

## Global Constraints

- Keep the mini program fully offline; do not add CDN, cloud image URLs, remote URLs, or runtime network requests.
- Do not add, remove, or upgrade dependencies.
- Do not modify `data/master/`, `miniprogram/generated/`, or generated asset output.
- Keep the existing ten asset subpackages; do not move all images into the main package.
- Do not add a `preloadRule` that attempts to preload all ten asset packages.
- Preserve Traditional Chinese runtime copy.
- Follow TDD: each production behavior change must have a failing test before implementation.

---

### Task 1: Add the asset-package loader contract and tests

**Files:**
- Create: `miniprogram/runtime/asset-package-loader.ts`
- Create: `tests/runtime/asset-package-loader.test.ts`

**Interfaces:**
- Produces `ASSET_PACKAGE_ROOTS: readonly string[]` with `subpkg-a0` through `subpkg-a9` in order.
- Produces `AssetPackageNavigation` with `navigateTo(url: string): Promise<void>` and `navigateBack(): Promise<void>`.
- Produces `createAssetPackageLoader(navigation: AssetPackageNavigation)` returning `{ loadAll(): Promise<void>; loadedRoots(): readonly string[] }`.
- Produces `assetPackageLoader`, a production singleton backed by native `wx.navigateTo` and `wx.navigateBack`.
- Produces `resetAssetPackageLoaderForTests()` so page tests can clear the singleton's in-memory completion set without exposing reset behavior to runtime callers.

- [ ] **Step 1: Write the failing loader tests**

Add tests that use an injected navigation adapter and assert observable call order:

```ts
it('loads every asset package in root order and records completion', async () => {
  const calls: string[] = []
  const loader = createAssetPackageLoader({
    navigateTo: async (url) => calls.push(`to:${url}`),
    navigateBack: async () => calls.push('back'),
  })

  await loader.loadAll()

  expect(calls.slice(0, 4)).toEqual([
    'to:/subpkg-a0/pages/placeholder/index',
    'back',
    'to:/subpkg-a1/pages/placeholder/index',
    'back',
  ])
  expect(calls).toHaveLength(20)
  expect(loader.loadedRoots()).toEqual([...ASSET_PACKAGE_ROOTS])
})

it('does not navigate again for packages already loaded', async () => {
  const navigateTo = vi.fn(async () => undefined)
  const navigateBack = vi.fn(async () => undefined)
  const loader = createAssetPackageLoader({ navigateTo, navigateBack })

  await loader.loadAll()
  await loader.loadAll()

  expect(navigateTo).toHaveBeenCalledTimes(10)
  expect(navigateBack).toHaveBeenCalledTimes(10)
})

it('stops at the first failed package and leaves later packages unloaded', async () => {
  const calls: string[] = []
  const loader = createAssetPackageLoader({
    navigateTo: async (url) => {
      calls.push(url)
      if (url.includes('subpkg-a2')) throw new Error('asset package failed')
    },
    navigateBack: async () => calls.push('back'),
  })

  await expect(loader.loadAll()).rejects.toThrow('subpkg-a2')
  expect(calls).toEqual([
    '/subpkg-a0/pages/placeholder/index',
    'back',
    '/subpkg-a1/pages/placeholder/index',
    'back',
    '/subpkg-a2/pages/placeholder/index',
  ])
  expect(loader.loadedRoots()).toEqual(['subpkg-a0', 'subpkg-a1'])
})
```

- [ ] **Step 2: Run the focused test and verify the expected RED failure**

Run:

```powershell
npm.cmd test -- tests/runtime/asset-package-loader.test.ts
```

Expected: FAIL because `miniprogram/runtime/asset-package-loader.ts` and its exported loader contract do not yet exist.

- [ ] **Step 3: Implement the minimal loader**

Implement the fixed route list and sequential state machine. The production adapter should wrap native callbacks as promises:

```ts
const wxNavigation: AssetPackageNavigation = {
  navigateTo: (url) =>
    new Promise((resolve, reject) => {
      wx.navigateTo({ url, success: () => resolve(), fail: (error) => reject(error) })
    }),
  navigateBack: () =>
    new Promise((resolve, reject) => {
      wx.navigateBack({ delta: 1, success: () => resolve(), fail: (error) => reject(error) })
    }),
}
```

For each unloaded root, call `navigateTo('/subpkg-aN/pages/placeholder/index')`, await `navigateBack()`, then add the root to the loaded set. Wrap navigation errors with the root name so the catalog can display a useful failure message. Keep a shared in-flight promise so repeated calls while loading do not start a second navigation sequence. Implement `resetAssetPackageLoaderForTests()` by clearing the singleton's loaded-root set and in-flight promise; production code never calls it.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same command. Expected: all loader tests PASS with no unhandled promise warnings.

- [ ] **Step 5: Run the existing runtime tests for regression**

Run:

```powershell
npm.cmd test -- tests/runtime tests/pages/catalog-page.test.ts
```

Expected: the existing tests may still fail because the catalog page contract has not yet been updated; record only those expected contract failures before moving to Task 2.

---

### Task 2: Gate catalog initialization on local asset readiness

**Files:**
- Modify: `miniprogram/pages/catalog/index.ts`
- Modify: `tests/pages/catalog-page.test.ts`

**Interfaces:**
- Catalog page data adds `assetLoading: boolean` and `assetLoadError: string | null`.
- Catalog page exposes `retryAssetLoading(): Promise<void>`.
- Catalog initialization becomes `async onLoad(options?): Promise<void>`; WeChat ignores the returned promise while tests can await it.

- [ ] **Step 1: Extend page tests with failing loading-state behavior**

Update the page test's `CatalogPageData` and `CatalogPageConfig` types, stub `wx.navigateTo` and `wx.navigateBack` to invoke their success callbacks synchronously, and add assertions:

```ts
it('keeps catalog rows hidden until local asset packages finish loading', async () => {
  const page = createPageInstance()

  const loadPromise = page.onLoad()
  expect(page.data.assetLoading).toBe(true)
  expect(page.data.visibleRows).toEqual([])

  await loadPromise

  expect(page.data.assetLoading).toBe(false)
  expect(page.data.assetLoadError).toBeNull()
  expect(page.data.visibleRows.length).toBeGreaterThan(0)
})

it('exposes a retry state when an asset package cannot be opened', async () => {
  resetAssetPackageLoaderForTests()
  const wxApi = globalThis.wx as {
    navigateTo: ReturnType<typeof vi.fn>
    navigateBack: ReturnType<typeof vi.fn>
  }
  wxApi.navigateTo.mockImplementation(({ url, fail }) => {
    if (url.includes('subpkg-a0')) {
      fail?.({ errMsg: 'navigateTo:fail asset package unavailable' })
      return
    }
    throw new Error('unexpected package navigation')
  })

  const page = createPageInstance()
  await page.onLoad()

  expect(page.data.assetLoading).toBe(false)
  expect(page.data.assetLoadError).toContain('subpkg-a0')
})
```

The retry test exercises the real page loader boundary and uses only the narrowly scoped `resetAssetPackageLoaderForTests()` helper to isolate the singleton between cases.

- [ ] **Step 2: Run the focused page test and verify RED**

Run:

```powershell
npm.cmd test -- tests/pages/catalog-page.test.ts
```

Expected: FAIL because the page has no asset loading fields, does not await the loader, and does not expose retry behavior.

- [ ] **Step 3: Implement catalog initialization and retry**

Refactor the existing body of `onLoad` into a private page-local async initialization path without changing filtering or presenter logic:

1. Set `assetLoading: true`, `assetLoadError: null`, and `visibleRows: []` immediately.
2. Read catalog, skills, and dictionaries and enrich rows as today.
3. Await `assetPackageLoader.loadAll()`.
4. On success, run the existing query/filter setup and set the complete page data, including `assetLoading: false`.
5. On failure, set `assetLoading: false`, `assetLoadError` to a Traditional Chinese message containing the failed root, and leave `visibleRows` empty.
6. Store the latest query options in the page instance state so `retryAssetLoading()` can rerun initialization with the same options.
7. Guard against two concurrent initialization calls by reusing one page-local in-flight promise.

Keep all existing filter, search, pagination, navigation, and skill-sheet behavior unchanged after successful initialization.

- [ ] **Step 4: Implement retry and verify GREEN**

Implement `retryAssetLoading()` as an async call to the same page-local initialization path. Run:

```powershell
npm.cmd test -- tests/runtime/asset-package-loader.test.ts tests/pages/catalog-page.test.ts
```

Expected: loader and catalog page tests PASS.

- [ ] **Step 5: Run page and presenter regression tests**

Run:

```powershell
npm.cmd test -- tests/pages tests/presenters tests/runtime
```

Expected: PASS. If a test relies on the old synchronous `onLoad`, update only its test await/fixture contract; do not weaken the loading behavior.

---

### Task 3: Add visible loading and retry UI

**Files:**
- Modify: `miniprogram/pages/catalog/index.wxml`
- Modify: `miniprogram/pages/catalog/index.wxss`
- Modify: `tests/pages/catalog-page.test.ts`

**Interfaces:**
- Existing catalog controls and list render only when `assetLoading` is false and `assetLoadError` is null.
- Error state calls `retryAssetLoading` and uses only Traditional Chinese copy.

- [ ] **Step 1: Add failing markup/style assertions**

Add source-level assertions that the page contains:

```ts
expect(catalogWxml).toMatch(/asset-loading-state/)
expect(catalogWxml).toMatch(/正在載入本地圖片素材/)
expect(catalogWxml).toMatch(/asset-load-error/)
expect(catalogWxml).toMatch(/bindtap="retryAssetLoading"/)
expect(catalogWxss).toMatch(/\.asset-loading-state/)
expect(catalogWxss).toMatch(/\.asset-load-error/)
```

Run `npm.cmd test -- tests/pages/catalog-page.test.ts` and verify RED before editing the page markup.

- [ ] **Step 2: Implement the WXML state gate**

At the top of the catalog content, render one of three branches:

```xml
<view wx:if="{{assetLoading}}" class="asset-loading-state">
  <text>正在載入本地圖片素材…</text>
</view>
<view wx:elif="{{assetLoadError}}" class="asset-load-error">
  <text class="asset-load-error__message">{{assetLoadError}}</text>
  <button class="asset-load-error__retry" bindtap="retryAssetLoading">重新載入</button>
</view>
<block wx:else>
  <!-- existing catalog controls, list, and skill-sheet -->
</block>
```

Use a `<block>` so the existing `.catalog-page` layout remains the root container and no duplicate page shell is introduced.

- [ ] **Step 3: Add minimal WXSS and verify GREEN**

Add centered loading/error styles using the existing palette, with no new image or external font. Run:

```powershell
npm.cmd test -- tests/pages/catalog-page.test.ts
```

Expected: all catalog markup/style and page behavior tests PASS.

- [ ] **Step 4: Run typecheck and focused architecture checks**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run check:runtime-network
npm.cmd test -- tests/architecture tests/runtime tests/pages tests/presenters
```

Expected: PASS; no runtime network references and no generated/data files changed.

---

### Task 4: Verify generated boundaries and prepare handoff

**Files:**
- No new production files; inspect `git status`, generated outputs, and asset package directories.

- [ ] **Step 1: Confirm data generation is unchanged**

Run:

```powershell
npm.cmd run data:generate
git diff --exit-code -- miniprogram/generated miniprogram/subpkg-detail
```

Expected: no generated diff caused by the runtime-only change.

- [ ] **Step 2: Run the relevant full verification suite**

Run:

```powershell
npm.cmd test
npm.cmd run check:runtime-network
npm.cmd run assets:ui:check
npm.cmd run data:check
```

Expected: PASS. Run `npm.cmd run verify` before handoff if the repository baseline permits the existing unrelated working-tree changes to pass; report any baseline failure without changing unrelated files.

- [ ] **Step 3: Inspect the final diff and package shape**

Confirm that only the loader, catalog page/UI, tests, and this plan/spec are changed; the ten `subpkg-aN/imgs` directories remain present; no remote URL was introduced; and `app.json` still does not preload all ten packages.

- [ ] **Step 4: Report verification and request commit approval**

Show the changed-file list, test commands/results, and proposed commit message before creating any commit, per repository instructions.
