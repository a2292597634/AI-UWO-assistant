# 兌換碼入口與玩家設定 UI 修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 修正兌換碼入口圖標、按鈕占高與玩家設定名稱流程，並保持舊本機資料可用。

**Architecture:** 延續既有 `data/master/ui-assets` → `miniprogram/assets/ui` 素材生成鏈；以 `CouponProfileInput` 移除 `name`、由 store 以暱稱推導 profile 顯示名稱；頁面只調整 WXML／WXSS 排列與表單字段，不改動 CloudBase 兌換 service。

**Tech Stack:** 微信小程序 TypeScript、WXML、WXSS、Sharp 素材生成、Vitest。

## Global Constraints

- 不直接在 `main` 分支開發；使用 `codex/phase-12-coupon-ui-polish`。
- 所有 UI、WXML、WXSS 變更遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
- 保存、確認刪除與確認領取等主要操作維持 `min-height: 88rpx`；列表與切換等輔助操作使用既有 `ui-button--compact` 變體。
- 不新增依賴；不修改伺服器清單、兌換請求、CloudBase 或資料流水線。
- 舊 profile 仍可讀取，但讀出後 `name` 以修剪後的 `userNo` 為準。
- 任何 commit 前先展示變更文件、驗證結果與 commit message，等待使用者確認。

---

### Task 1: 取消獨立設定名稱並兼容舊資料

**Files:**
- Modify: `miniprogram/contracts/coupon-redemption.ts`
- Modify: `miniprogram/runtime/coupon-profile-store.ts`
- Modify: `miniprogram/subpkg-coupon/pages/settings/index.ts`
- Modify: `tests/coupon-redemption/coupon-profile-store.test.ts`
- Modify: `tests/pages/coupon-settings-page.test.ts`

**Interfaces:**
- `CouponProfileInput` 變為 `{ gameServerId: GameServerId; userNo: string }`。
- `CouponProfile` 保留 `{ id; name; gameServerId; userNo }`，其中 `name` 必須等於修剪後的 `userNo`。
- `createCouponProfileStore(storage)` 的 `saveProfile`／`updateProfile` 只接受兩個輸入字段；`load()` 接受舊資料的 `name` 字段但不採用其內容。

- [x] **Step 1: 撰寫失敗測試**

在 `tests/coupon-redemption/coupon-profile-store.test.ts` 將輸入 helper 改為：

```ts
const profileInput = (userNo: string) => ({
  gameServerId: 'UWOGL-US-01' as const,
  userNo,
})
```

新增兩個案例：

```ts
it('保存設定時以修剪後的暱稱作為顯示名稱', () => {
  const profile = createCouponProfileStore(memoryStorage)
    .saveProfile({ gameServerId: 'UWOGL-US-01', userNo: '  航海家小明  ' })
    .profiles[0]!
  expect(profile).toMatchObject({ name: '航海家小明', userNo: '航海家小明' })
})

it('載入舊資料時忽略舊設定名稱並以暱稱顯示', () => {
  memoryStorage.value = JSON.stringify({
    profiles: [{ id: 'old', name: '主力商會', gameServerId: 'UWOGL-US-01', userNo: '航海家小明' }],
    activeProfileId: 'old',
  })
  expect(createCouponProfileStore(memoryStorage).load().profiles[0]).toMatchObject({
    name: '航海家小明',
    userNo: '航海家小明',
  })
})
```

在 `tests/pages/coupon-settings-page.test.ts` 斷言 page data 的 form 不含 `name`，並以 `{ gameServerId, userNo }` 保存。

- [x] **Step 2: 執行定向測試確認失敗**

Run: `npx vitest run tests/coupon-redemption/coupon-profile-store.test.ts tests/pages/coupon-settings-page.test.ts`

Expected: FAIL，因現有輸入型別與設定頁仍要求 `name`。

- [x] **Step 3: 實作最小資料邊界變更**

在 contract 移除 `MAX_COUPON_PROFILE_NAME_LENGTH` 與 `CouponProfileInput.name`。在 store 中：

```ts
const normalizeInput = (input: CouponProfileInput): CouponProfileInput => {
  const userNo = typeof input.userNo === 'string' ? input.userNo.trim() : ''
  if (!isValidServerId(input.gameServerId)) throw new CouponProfileStoreError('請選擇有效的伺服器。')
  if (!isNonEmptyString(userNo, MAX_COUPON_USER_NAME_LENGTH)) {
    throw new CouponProfileStoreError('遊戲內暱稱不可為空，且不得超過 100 個字元。')
  }
  return { gameServerId: input.gameServerId, userNo }
}
```

`isValidProfile` 只驗證 id、伺服器與 userNo；`parseStore` 回傳 profile 時設定 `name: profile.userNo.trim()`。新增與更新 profile 以 `{ id, name: normalized.userNo, ...normalized }` 持久化。設定頁移除 `onNameInput`、`form.name`、設定名稱 input 與相關 placeholder；編輯／刪除確認／列表顯示一律使用 `profile.userNo` 或 store 推導出的 `name`。

- [x] **Step 4: 執行定向測試確認通過**

Run: `npx vitest run tests/coupon-redemption/coupon-profile-store.test.ts tests/pages/coupon-settings-page.test.ts tests/coupon-redemption/coupon-redemption-presenter.test.ts`

Expected: PASS。

### Task 2: 新增兌換碼首頁圖標素材

**Files:**
- Create: `data/master/ui-assets/feature-coupon-source.png`
- Modify: `tools/ui-assets/config.ts`
- Modify: `tests/ui-assets/build-ui-assets.test.ts`
- Modify: `miniprogram/pages/home/index.ts`
- Modify: `tests/pages/home-page.test.ts`
- Generated: `miniprogram/assets/ui/feature-coupon.png`
- Generated: `data/audit/ui-asset-build-report.json`

**Interfaces:**
- 新 recipe `feature-coupon` 使用既有 `resize-png`、96×96、16 色與 12KB 上限。
- 首頁 module 使用 `/assets/ui/feature-coupon.png`，仍可在 image error 時回退。

- [x] **Step 1: 撰寫素材契約失敗測試**

在 fixture source 與 feature id 清單加入 `feature-coupon`，並在 production report 測試中要求 6 個 feature icon、96×96、透明邊界 84–88px、4KB 內。首頁測試加入：

```ts
expect(homePage.data.modules[4]).toMatchObject({
  iconPath: '/assets/ui/feature-coupon.png',
  iconFailed: false,
})
```

- [x] **Step 2: 執行素材與首頁測試確認失敗**

Run: `npx vitest run tests/ui-assets/build-ui-assets.test.ts tests/pages/home-page.test.ts`

Expected: FAIL，因 recipe、source 與首頁 iconPath 尚不存在。

- [x] **Step 3: 產生並接入本地图标**

產生與現有入口一致的深色底、金色邊框、航海風兌換券圖像，保存為 `data/master/ui-assets/feature-coupon-source.png`；不可加入文字、Emoji 或遠端資源。把 recipe 放入 `UI_ASSET_RECIPES` 的 feature 區段，執行：

```powershell
npm run assets:ui
```

將首頁 `coupon-redemption.iconPath` 改為 `/assets/ui/feature-coupon.png`、`iconFailed` 改為 `false`。更新素材測試 fixture 的來源與 id 陣列，使 deterministic build 覆蓋新素材。

- [x] **Step 4: 執行素材與首頁測試確認通過**

Run: `npx vitest run tests/ui-assets/build-ui-assets.test.ts tests/pages/home-page.test.ts && npm run assets:ui:check`

Expected: PASS，且 feature 群組預算與素材報告一致。

### Task 3: 收斂兌換相關按鈕的視覺占高

**Files:**
- Modify: `miniprogram/subpkg-coupon/pages/settings/index.wxml`
- Modify: `miniprogram/subpkg-coupon/pages/settings/index.wxss`
- Modify: `miniprogram/subpkg-coupon/pages/redemption/index.wxml`
- Modify: `miniprogram/subpkg-coupon/pages/redemption/index.wxss`
- Modify: `miniprogram/subpkg-coupon/pages/redemption/index.ts`
- Modify: `tests/pages/coupon-settings-page.test.ts`
- Modify: `tests/pages/coupon-redemption-page.test.ts`

**Interfaces:**
- 不改 page controller；只調整可見結構與樣式 class。
- 所有操作維持 `.ui-button` 與可見文字；保存、確認刪除與確認領取維持 `min-height: 88rpx`，列表／切換／新增等輔助操作使用 `ui-button--compact`，列表操作改成水平排列。

- [x] **Step 1: 撰寫 UI 結構失敗測試**

在設定頁測試要求 WXML 有 `coupon-settings__profile-actions--row` 與 `ui-button--compact`，且沒有將 `coupon-settings__small-button` 樣式設為縱向排列；在兌換頁測試要求次要按鈕使用 `coupon-redemption__compact-button ui-button--compact`，主要 submit 仍保留 `min-height: 88rpx`。

- [x] **Step 2: 執行頁面測試確認失敗**

Run: `npx vitest run tests/pages/coupon-settings-page.test.ts tests/pages/coupon-redemption-page.test.ts`

Expected: FAIL，因目前 actions 是 column 且沒有 compact class。

- [x] **Step 3: 調整 WXML 與 WXSS**

設定 profile card 將操作區移到 profile copy 下方，使用 `coupon-settings__profile-actions--row`；actions 以 `flex-direction: row`、`flex-wrap: wrap`、較小 gap；`.coupon-settings__small-button` 搭配 `ui-button--compact`，以 `flex: 1 1 0` 平衡窄屏寬度。兌換頁切換與新增按鈕套用 `coupon-redemption__compact-button ui-button--compact`；固定底部 submit 維持唯一 primary、`min-height: 88rpx`，移除不必要的額外高度。頁面初始 `couponNo` 設為 `FULLMOON2026`，提交後仍清空且不寫入 storage。

- [x] **Step 4: 執行頁面測試與格式檢查**

Run: `npx vitest run tests/pages/coupon-settings-page.test.ts tests/pages/coupon-redemption-page.test.ts && npx prettier --check miniprogram/pages/home/index.ts miniprogram/subpkg-coupon/pages/settings/index.ts miniprogram/subpkg-coupon/pages/settings/index.wxml miniprogram/subpkg-coupon/pages/settings/index.wxss miniprogram/subpkg-coupon/pages/redemption/index.wxml miniprogram/subpkg-coupon/pages/redemption/index.wxss tests/pages/home-page.test.ts tests/pages/coupon-settings-page.test.ts tests/pages/coupon-redemption-page.test.ts`

Expected: PASS。

### Task 4: 全量驗證與交付檢查

**Files:**
- Modify: `docs/superpowers/specs/2026-09-08-coupon-ui-polish-design.md`（完成後將狀態改為已實作並補驗證結果）

- [x] **Step 1: 執行完整門禁**

Run: `npm run verify`

Expected: format、lint、typecheck、Vitest、runtime-network、主包體積、UI 素材、資料與生成檢查全部 PASS。

- [x] **Step 2: 執行差異檢查並確認 UI 檔案範圍**

Run: `git diff --check; git status --short`

Expected: 無 whitespace error；變更只包含本計畫列出的資料契約／store、兩個兌換頁、首頁入口、UI 素材與測試／設計文件。

- [x] **Step 3: 回報結果並等待使用者確認提交**

展示變更文件、`npm run verify` 實際結果、素材／主包體積數字與擬用 commit message `fix: 修正兌換碼入口與玩家設定 UI`；未取得使用者確認前不執行 commit 或合併。
