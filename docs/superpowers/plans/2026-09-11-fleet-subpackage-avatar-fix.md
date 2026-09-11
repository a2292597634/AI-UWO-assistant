# Fleet Subpackage and Avatar Delivery Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the battle-fleet feature and its 657KB officer index out of the WeChat main package so the published CloudBase avatar URLs can be uploaded and displayed.

**Architecture:** Keep catalog search, officer editor, and existing subpackages unchanged in the main package. Add a `subpkg-fleet` package containing the fleet page and fleet-only generated officer data, with a local fleet data store that no longer makes the main data store load `fleet-officers.js`. Update the generator and runtime-contract tests so future data generation preserves this package boundary.

**Tech Stack:** TypeScript, WeChat Mini Program `app.json` subpackages, Vitest, the existing runtime data generator, and the existing package-size scanner.

## Global Constraints

- The WeChat main package must remain below the repository budget of `1.9 * 1024 * 1024` bytes and below the platform upload limit of 2048KB.
- Runtime data must remain offline-first; generated CDN URLs are data, not runtime network requests.
- Existing battle-fleet behavior and existing CloudBase data changes must be preserved.
- Do not commit the pre-existing CloudBase/data audit changes unless they are required by this fix.

---

### Task 1: Lock the package boundary with failing tests

**Files:**
- Create: `tests/quality/miniprogram-package-boundary.test.ts`
- Modify: `tests/runtime-contract/runtime-shapes.test.ts`

**Interfaces:**
- Consumes: `readMiniProgramConfig`, `analyzeMiniProgramPackage`, and the generated fleet officer file.
- Produces: A regression test proving the fleet index is read from `miniprogram/subpkg-fleet/generated/fleet-officers.js`, and a package report proving the main package excludes `fleet-officers.js`.

- [ ] **Step 1: Write the failing test**

  Add a test that reads `miniprogram/app.json`, requires the `subpkg-fleet` root, and asserts the fleet generated file is not in `report.largestFiles` or the main package file list. Change the runtime contract helper to load `miniprogram/subpkg-fleet/generated/fleet-officers.js` instead of `miniprogram/generated/fleet-officers.js`.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run: `npx vitest run tests/quality/miniprogram-package-boundary.test.ts tests/runtime-contract/runtime-shapes.test.ts`

  Expected: FAIL because `subpkg-fleet` and its generated file do not exist yet, while the current generated fleet file is still in the main package.

### Task 2: Move the fleet page and route into a dedicated subpackage

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/home/index.ts`
- Move: `miniprogram/pages/fleet/index.ts` to `miniprogram/subpkg-fleet/pages/index/index.ts`
- Move: `miniprogram/pages/fleet/index.wxml` to `miniprogram/subpkg-fleet/pages/index/index.wxml`
- Move: `miniprogram/pages/fleet/index.wxss` to `miniprogram/subpkg-fleet/pages/index/index.wxss`
- Move: `miniprogram/pages/fleet/index.json` to `miniprogram/subpkg-fleet/pages/index/index.json`
- Modify: `tests/pages/home-page.test.ts`
- Modify: `tests/pages/fleet-page.test.ts`
- Modify: `tests/architecture/fleet-shared-components.test.ts`
- Modify: `tests/unit/local-only.test.ts`

**Interfaces:**
- Consumes: Existing fleet page component contracts and the current home-module route.
- Produces: Route `/subpkg-fleet/pages/index/index` and a fleet page whose imports resolve through `../../../domain`, `../../../presenters`, `../../../contracts`, and `../../../runtime`.

- [ ] **Step 1: Move the page resources and update relative imports**

  Move all four fleet page resources into `subpkg-fleet/pages/index/`. Change the page’s shared-module imports from `../../...` to `../../../...`, and change its fleet data-store import to `../../runtime/fleet-data-store`.

- [ ] **Step 2: Register the subpackage and update the home route**

  Remove `pages/fleet/index` from `app.json.pages`, add:

  ```json
  {
    "root": "subpkg-fleet",
    "name": "fleet",
    "pages": ["pages/index/index"]
  }
  ```

  Update the home module route to `/subpkg-fleet/pages/index/index`.

- [ ] **Step 3: Update route and architecture tests**

  Point fleet-page tests at the moved page/resources, update the home route expectation, and include `miniprogram/subpkg-fleet/pages/index` in the shared-component contract list. Update the local-only allowlist assertion to the new fleet page path.

- [ ] **Step 4: Run the focused page and architecture tests**

  Run: `npx vitest run tests/pages/home-page.test.ts tests/pages/fleet-page.test.ts tests/architecture/fleet-shared-components.test.ts tests/unit/local-only.test.ts`

  Expected: PASS after route and import updates.

### Task 3: Move fleet runtime data out of the main package

**Files:**
- Modify: `tools/data-pipeline/build-runtime-data.ts`
- Modify: `tools/data-pipeline/generate.ts`
- Create: `miniprogram/subpkg-fleet/runtime/fleet-data-store.ts`
- Modify: `miniprogram/runtime/main-data-store.ts`
- Modify: `miniprogram/runtime/generated-modules.d.ts`
- Modify: `miniprogram/contracts/runtime-data.ts`
- Move/generated: `miniprogram/generated/fleet-officers.js` to `miniprogram/subpkg-fleet/generated/fleet-officers.js`

**Interfaces:**
- Consumes: `buildFleetOfficers`, the published asset manifest, and `RuntimeFleetOfficer`.
- Produces: `getFleetOfficers(): readonly RuntimeFleetOfficer[]` from `subpkg-fleet/runtime/fleet-data-store.ts`; `main-data-store.ts` no longer requires or exports the fleet index.

- [ ] **Step 1: Add a generator output parameter and a failing generation assertion**

  Extend `writeRuntimeData` with an optional fleet output directory. When supplied, write `fleet-officers.js` there and remove any legacy root `miniprogram/generated/fleet-officers.js`; retain the old default only for direct callers that do not supply the new directory. In `generate.ts`, create `miniprogram/subpkg-fleet/generated` and pass it to the generator.

- [ ] **Step 2: Add the subpackage fleet store and remove the main-package import**

  Create the fleet store with a static CommonJS require of `../generated/fleet-officers`, typed as `RuntimeFleetOfficer[]`. Remove `_fleetOfficers`, `getFleetOfficers`, and the unused `RuntimeFleetOfficer` import from `main-data-store.ts`. Remove only the obsolete fleet module declaration from `miniprogram/runtime/generated-modules.d.ts` and update the runtime-data comment to the new path.

- [ ] **Step 3: Point the fleet page at the new store**

  Import `getFleetOfficers` from `../../runtime/fleet-data-store` within the moved page and leave all other runtime data access unchanged.

- [ ] **Step 4: Regenerate runtime data and run focused contract/package tests**

  Run: `npm run data:generate`.

  Then run: `npx vitest run tests/quality/miniprogram-package-boundary.test.ts tests/runtime-contract/runtime-shapes.test.ts`.

  Expected: PASS; the fleet file exists only under `subpkg-fleet/generated`, and its portrait URLs still pass the published CloudBase URL contract, including the two August custom officers.

### Task 4: Verify upload-size and avatar delivery regression coverage

**Files:**
- Modify: `tools/quality/find-runtime-network-references.ts`
- Modify: `package.json`
- Modify: `README.md` only if the package layout documentation lists the old fleet route or generated path

**Interfaces:**
- Consumes: the moved generated fleet file and the existing package/network scanners.
- Produces: Stable checks for the new subpackage-generated CDN data and a main-package report below budget.

- [ ] **Step 1: Allow the new generated fleet path in the offline network scanner**

  Extend the generated-asset path matcher so `subpkg-fleet/generated/fleet-officers.js` is treated like the existing generated asset modules.

- [ ] **Step 2: Run package-size and runtime-network checks**

  Run: `npm run check:miniprogram-size` and `npm run check:runtime-network`.

  Expected: both pass, with the main package at least 650KB smaller than the current report and no new forbidden runtime network references.

- [ ] **Step 3: Run the full verification suite**

  Run: `npm run typecheck`, `npm test`, `npm run data:check`, and `npm run generate:check`.

  Expected: all commands pass; generated output is reproducible, and the existing CloudBase manifest continues to resolve the two custom portraits.

- [ ] **Step 4: Review the diff and commit only the implementation**

  Confirm the diff contains the subpackage, route, generator, tests, and scanner changes. Keep the pre-existing CloudBase/data audit changes uncommitted unless they were already part of the user’s requested release. Commit the implementation as:

  ```bash
  git add miniprogram/app.json miniprogram/pages/home/index.ts miniprogram/pages/fleet miniprogram/subpkg-fleet tools/data-pipeline tools/quality/find-runtime-network-references.ts tests package.json README.md
  git commit -m "fix: move fleet data into subpackage"
  ```
