# Fleet Slot Action Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with checkpoints.

**Goal:** Keep the fleet page's 11-officer six-column grid while replacing tiny slot actions with larger bottom action tiles containing the icon and short text inside each tile.

**Architecture:** Keep the existing page handlers and domain state transitions unchanged. Update only the fleet slot WXML structure and WXSS layout, then protect the markup and sizing contract with page-level tests.

**Tech Stack:** WeChat Mini Program WXML/WXSS, TypeScript, Vitest, Prettier, ESLint.

## Global Constraints

- Keep the six-column slot grid and all 11 officer positions.
- Preserve existing `onOfficerLock`, `onOfficerRemove`, and `onBanOfficer` behavior and dataset IDs.
- Show the exclude action only in auto mode, as it works today.
- Do not add image assets, dependencies, network requests, or data fields.
- Use Traditional Chinese UI copy.
- Do not modify unrelated user changes or generated data.

---

### Task 1: Add failing fleet slot action markup and sizing tests

**Files:**
- Modify: `tests/pages/fleet-page.test.ts`

**Interfaces:**
- Consumes: Current registered fleet `Page` configuration and the existing fleet WXML/WXSS files.
- Produces: Regression tests requiring six columns, three action handlers, icon/text content inside action tiles, and enlarged bottom touch targets.

- [ ] **Step 1: Write the failing test**

Add filesystem reads for `miniprogram/pages/fleet/index.wxml` and `index.wxss`, then add a markup contract test with these assertions:

```typescript
it('keeps six columns and gives each fleet action a large bottom icon tile', () => {
  expect(fleetWxml).toMatch(/<view class="officer-slot__actions">/)
  expect(fleetWxml).toMatch(/bindtap="onOfficerLock"[\s\S]*class="slot-action__glyph"/)
  expect(fleetWxml).toMatch(/bindtap="onOfficerRemove"[\s\S]*class="slot-action__glyph"/)
  expect(fleetWxml).toMatch(/bindtap="onBanOfficer"[\s\S]*class="slot-action__glyph"/)
  expect(fleetWxml).toMatch(/class="slot-action__label"[\s\S]*鎖定|class="slot-action__label"[\s\S]*解鎖/)
  expect(fleetWxml).toMatch(/class="slot-action__label"[\s\S]*移除/)
  expect(fleetWxml).toMatch(/class="slot-action__label"[\s\S]*排除/)
  expect(fleetWxss).toMatch(/\.slot-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,\s*1fr\)/)
  expect(fleetWxss).toMatch(/\.officer-slot\s*\{[\s\S]*min-height:\s*180rpx/)
  expect(fleetWxss).toMatch(/\.officer-slot__actions\s*\{[\s\S]*position:\s*absolute[\s\S]*bottom:/)
  expect(fleetWxss).toMatch(/\.officer-slot__actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*1fr\)/)
  expect(fleetWxss).toMatch(/\.slot-action\s*\{[\s\S]*min-height:\s*64rpx/)
})
```

Use a regex that tolerates existing attribute order where needed, but keep the assertions tied to the actual event names and classes rather than only counting generic strings.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm.cmd test -- tests/pages/fleet-page.test.ts
```

Expected: the existing fleet behavior tests pass, while the new markup contract fails because the current actions are `<text>` elements without icon/label children, the cards are only `124rpx` high, and the action row is not anchored or sized as a three-column touch area.

### Task 2: Implement the six-column bottom action tiles

**Files:**
- Modify: `miniprogram/pages/fleet/index.wxml`
- Modify: `miniprogram/pages/fleet/index.wxss`

**Interfaces:**
- Consumes: Existing page event handlers `onOfficerLock`, `onOfficerRemove`, and `onBanOfficer`.
- Produces: A six-column fleet grid whose filled cards have fixed bottom action tiles with icon symbols and in-tile Traditional Chinese labels.

- [ ] **Step 1: Replace the slot action text nodes with tile markup**

Keep each existing `data-id` and handler. Use three tile views inside `.officer-slot__actions`; keep the exclude tile behind the existing auto-mode condition:

```xml
<view class="officer-slot__actions">
  <view
    class="slot-action slot-action--lock"
    bindtap="onOfficerLock"
    data-id="{{item.officer.id}}"
    aria-label="{{item.officer.status === 'locked' ? '解鎖' : '鎖定'}}"
  >
    <text class="slot-action__glyph">{{item.officer.status === 'locked' ? '🔓' : '🔒'}}</text>
    <text class="slot-action__label">{{item.officer.status === 'locked' ? '解鎖' : '鎖定'}}</text>
  </view>
  <view class="slot-action" bindtap="onOfficerRemove" data-id="{{item.officer.id}}" aria-label="移除">
    <text class="slot-action__glyph">×</text>
    <text class="slot-action__label">移除</text>
  </view>
  <view
    wx:if="{{mode === 'auto'}}"
    class="slot-action slot-action--danger"
    bindtap="onBanOfficer"
    data-id="{{item.officer.id}}"
    aria-label="排除"
  >
    <text class="slot-action__glyph">⊘</text>
    <text class="slot-action__label">排除</text>
  </view>
</view>
```

- [ ] **Step 2: Anchor and enlarge the action area without changing the grid columns**

Keep `grid-template-columns: repeat(6, 1fr)`. Change the filled card's minimum height to `180rpx`, anchor `.officer-slot__actions` with `position: absolute`, `left/right: 4rpx`, and `bottom: 4rpx`, and give it `grid-template-columns: repeat(3, minmax(0, 1fr))`, a small gap, and `min-height: 64rpx`. Make each `.slot-action` a vertical flex tile with its own background, rounded corners, `min-height: 64rpx`, and pressed-state background. Keep `.slot-action--danger` red-toned and add `.slot-action__glyph` and `.slot-action__label` sizes that fit inside the tile.

- [ ] **Step 3: Run the focused test to verify it passes**

Run:

```powershell
npm.cmd test -- tests/pages/fleet-page.test.ts
```

Expected: all fleet page behavior tests and the new WXML/WXSS contract test pass.

### Task 3: Refine formatting and run regression validation

**Files:**
- Modify: only the files from Tasks 1–2 if formatting requires it.

- [ ] **Step 1: Run formatting and static checks**

```powershell
npx.cmd prettier --check miniprogram/pages/fleet/index.wxss tests/pages/fleet-page.test.ts
npm.cmd run lint -- --quiet
npm.cmd run typecheck -- --pretty false
```

Expected: all commands exit with code 0.

- [ ] **Step 2: Run the full test suite in a stable single-worker mode**

```powershell
npx.cmd vitest run --pool=threads --maxWorkers=1
```

Expected: all existing tests and the new fleet layout regression test pass.

- [ ] **Step 3: Review the final diff and report the handoff**

Run `git diff --check` and `git status --short`. Confirm only the fleet page WXML/WXSS, fleet page test, and this feature's spec/plan are part of this task. Do not stage or commit without showing the user the changed files and verification results first.
