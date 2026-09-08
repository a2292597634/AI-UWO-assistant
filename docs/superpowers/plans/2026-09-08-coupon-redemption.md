# 兌換碼自動領取 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供本機多組玩家設定與由 CloudBase 雲函數代理官方 LINE Games 兌換碼提交的小程序功能。

**Architecture:** 小程序以 contracts 定義伺服器白名單、設定資料與結果碼，`coupon-profile-store` 是唯一的本機儲存 adapter，`coupon-redemption-service` 是唯一可呼叫 CloudBase 的 Runtime adapter。新增獨立 `coupon-redemption` 雲函數，將官方 HTTP 呼叫、節流與結果映射隔離在可注入測試的 service／client 模組；兩個頁面只依賴 presenter 與 adapter。

**Tech Stack:** 微信小程序 TypeScript、WXML、WXSS、CloudBase Cloud Function（CommonJS）、Node.js 內建 `https`、Vitest。

## Global Constraints

- 所有程式註釋、文件、UI 文案與錯誤訊息使用繁體中文；必要的官方伺服器專有名稱可保留原文。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`；不新增、刪除或升級依賴。
- 小程序 Runtime 禁止 `wx.request`、遠端 URL、Node.js API 與非 allowlist 的 `wx.cloud`；只允許 `miniprogram/runtime/coupon-redemption-service.ts` 呼叫 `wx.cloud.callFunction`。
- 玩家設定只保存於本機 `wx` storage；兌換碼不寫入 storage、CloudBase Database 或一般日誌。
- 雲函數日誌不得輸出 `couponNo`、`userNo`、完整官方回應或完整 OpenID。
- 官方伺服器清單固定為 `UWOGL-JP-02`、`UWOGL-JP-03`、`UWO-KR-14`、`UWO-KR-13`、`UWO-KR-01`、`UWO-KR-04`、`UWO-KR-10`、`UWOGL-US-01`、`UWOGL-US-02`，並保留官方順序與顯示名稱。
- UI、WXML、WXSS 完整遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`：使用既有 Token、`.ui-button`、`.ui-status`、最小 `88rpx` 重要熱區與安全區規則。
- 每個 task 在提交前都執行指定測試；任何 `git commit` 前先向使用者展示變更檔案、驗證結果與擬用 message，取得確認後才可提交。

---

## 檔案結構

| 檔案 | 責任 |
| --- | --- |
| `miniprogram/contracts/coupon-redemption.ts` | 固定伺服器清單、profile／submit／result 型別、純驗證與結果碼定義。 |
| `miniprogram/runtime/coupon-profile-store.ts` | 唯一讀寫 `wx.getStorageSync`／`wx.setStorageSync` 的 profile adapter。 |
| `miniprogram/runtime/coupon-redemption-service.ts` | 唯一呼叫 `wx.cloud.callFunction` 的 type-safe adapter。 |
| `miniprogram/presenters/coupon-redemption-presenter.ts` | 頁面資料映射與狀態文案，無副作用。 |
| `cloudfunctions/coupon-redemption/line-games-client.js` | 有逾時的官方 URL-encoded POST adapter，不依賴雲端環境。 |
| `cloudfunctions/coupon-redemption/coupon-redemption-service.js` | 服務端驗證、節流、結果映射與安全回應。 |
| `cloudfunctions/coupon-redemption/index.js` | CloudBase entry，取得 context、注入服務並安全記錄最少資訊。 |
| `miniprogram/subpkg-coupon/pages/redemption/*` | 兌換碼分包頁的 Controller、WXML 與 WXSS。 |
| `miniprogram/subpkg-coupon/pages/settings/*` | 本機設定分包頁、編輯器與刪除確認。 |
| `tests/coupon-redemption/*` | contract、store、presenter、雲函數單元測試。 |
| `tests/runtime/coupon-redemption-service.test.ts` | CloudBase adapter contract。 |
| `tests/pages/coupon-*.test.ts` | Controller、WXML／WXSS 與首頁入口驗證。 |

### Task 1: 兌換資料契約與本機玩家設定

**Files:**
- Create: `miniprogram/contracts/coupon-redemption.ts`
- Create: `miniprogram/runtime/coupon-profile-store.ts`
- Create: `tests/coupon-redemption/coupon-redemption-contract.test.ts`
- Create: `tests/coupon-redemption/coupon-profile-store.test.ts`

**Interfaces:**
- Produces `GAME_SERVERS`、`GameServerId`、`CouponProfile`、`CouponProfileStore`、`CouponRedemptionInput`、`CouponRedemptionResult`。
- Produces `createCouponProfileStore(storage)`，其 API 為 `load()`、`saveProfile(input)`、`updateProfile(id, input)`、`deleteProfile(id)`、`setActiveProfile(id)`；所有 mutation 都回傳完整 `CouponProfileStore`。

- [ ] **Step 1: 撰寫伺服器清單、輸入正規化與上限的失敗測試**

```ts
import { GAME_SERVERS, normalizeCouponCode, validateCouponRedemptionInput } from '../../miniprogram/contracts/coupon-redemption'

it('保留官方九個伺服器的順序與 ID', () => {
  expect(GAME_SERVERS.map(({ id }) => id)).toEqual([
    'UWOGL-JP-02', 'UWOGL-JP-03', 'UWO-KR-14', 'UWO-KR-13', 'UWO-KR-01',
    'UWO-KR-04', 'UWO-KR-10', 'UWOGL-US-01', 'UWOGL-US-02',
  ])
})

it('修剪兌換碼且拒絕空值與超過 50 個字元', () => {
  expect(normalizeCouponCode(' UWO-1 ')).toBe('UWO-1')
  expect(validateCouponRedemptionInput({ gameServerId: 'UWOGL-US-01', userNo: '航海家', couponNo: '' }).code).toBe('coupon-required')
  expect(validateCouponRedemptionInput({ gameServerId: 'UWOGL-US-01', userNo: '航海家', couponNo: 'x'.repeat(51) }).code).toBe('coupon-too-long')
})
```

- [ ] **Step 2: 執行 contract 測試並確認失敗**

Run: `npx vitest run tests/coupon-redemption/coupon-redemption-contract.test.ts`

Expected: FAIL，因 `coupon-redemption` contract 模組尚不存在。

- [ ] **Step 3: 撰寫 profile store 失敗測試**

```ts
it('新增第 11 組設定時拒絕且不覆寫既有設定', () => {
  const store = createCouponProfileStore(memoryStorage)
  for (let index = 0; index < 10; index += 1) store.saveProfile(profileInput(`設定${index}`))
  expect(() => store.saveProfile(profileInput('超額'))).toThrow('最多保存 10 組')
  expect(store.load().profiles).toHaveLength(10)
})

it('刪除目前設定時改選第一組剩餘設定', () => {
  const first = store.saveProfile(profileInput('第一組')).profiles[0]!
  const second = store.saveProfile(profileInput('第二組')).profiles[1]!
  store.setActiveProfile(second.id)
  expect(store.deleteProfile(second.id).activeProfileId).toBe(first.id)
})

it('編輯既有設定時保留 ID 並只更新三個設定欄位', () => {
  const saved = store.saveProfile(profileInput('舊名稱')).profiles[0]!
  const updated = store.updateProfile(saved.id, profileInput('新名稱'))
  expect(updated.profiles).toEqual([
    expect.objectContaining({ id: saved.id, name: '新名稱', userNo: '航海家' }),
  ])
})
```

- [ ] **Step 4: 執行 store 測試並確認失敗**

Run: `npx vitest run tests/coupon-redemption/coupon-profile-store.test.ts`

Expected: FAIL，因本機設定 adapter 尚不存在。

- [ ] **Step 5: 實作最小 contract 與 store**

在 contract 定義以下邊界並讓兩端共用：

```ts
export const MAX_COUPON_PROFILES = 10
export const MAX_COUPON_CODE_LENGTH = 50
export const COUPON_PROFILE_STORAGE_KEY = 'coupon_profiles_v1'

export interface CouponProfileInput { name: string; gameServerId: GameServerId; userNo: string }
export interface CouponRedemptionInput { gameServerId: GameServerId; userNo: string; couponNo: string }
export type CouponValidationCode = 'valid' | 'profile-required' | 'server-invalid' | 'user-required' | 'coupon-required' | 'coupon-too-long'
export type CouponRedemptionCode =
  | 'success' | 'user-invalid' | 'coupon-invalid' | 'coupon-used' | 'coupon-expired'
  | 'coupon-group-used' | 'rate-limited' | 'server-unavailable' | 'maintenance' | 'retry-later' | 'unknown'
export interface CouponRedemptionResult { code: CouponRedemptionCode; message: string }
```

`coupon-profile-store.ts` 接受最小 storage interface：

```ts
export interface SyncStorage { getStorageSync(key: string): unknown; setStorageSync(key: string, value: unknown): void }
export const createCouponProfileStore = (storage: SyncStorage): CouponProfileStoreService => ({ /* load/saveProfile/deleteProfile/setActiveProfile */ })
```

只接受 key 完全符合 schema、profile ID 不重複、伺服器在 `GAME_SERVERS`、名稱與暱稱修剪後非空的 storage 值；不合法或超過 10 筆時回傳空 store。新 profile 用不依賴第三方套件的隨機 ID 產生器，且不保存兌換碼。

- [ ] **Step 6: 執行兩個測試檔確認通過**

Run: `npx vitest run tests/coupon-redemption/coupon-redemption-contract.test.ts tests/coupon-redemption/coupon-profile-store.test.ts`

Expected: PASS。

- [ ] **Step 7: 使用者確認後提交本 task**

建議 message: `feat: 新增本機兌換設定契約`

### Task 2: 官方 HTTP 代理與雲函數安全服務

**Files:**
- Create: `cloudfunctions/coupon-redemption/package.json`
- Create: `cloudfunctions/coupon-redemption/line-games-client.js`
- Create: `cloudfunctions/coupon-redemption/coupon-redemption-service.js`
- Create: `cloudfunctions/coupon-redemption/index.js`
- Create: `tests/cloudfunctions/coupon-redemption-service.test.ts`
- Create: `tests/cloudfunctions/line-games-client.test.ts`

**Interfaces:**
- Consumes `GAME_SERVERS` 的同一 ID 清單副本（雲函數以常數 module 自己驗證，避免 require 小程序 TypeScript）。
- Produces `createCouponRedemptionService({ client, rateLimiter, now })` 與 `dispatch(payload, requesterKey)`。
- Produces `createLineGamesClient({ request, timeoutMs })` 與 `redeem(input)`。

- [ ] **Step 1: 撰寫官方 client 的失敗測試**

```js
it('以 URL-encoded POST、官方 endpoint 與正確 Referer 提交', async () => {
  const request = vi.fn().mockResolvedValue({ statusCode: 200, body: JSON.stringify({ isSuccess: true }) })
  await createLineGamesClient({ request, timeoutMs: 3000 }).redeem({
    gameServerId: 'UWOGL-US-01', userNo: '航海家', couponNo: 'UWO-1',
  })
  expect(request).toHaveBeenCalledWith(expect.objectContaining({
    method: 'POST', path: '/sbc/UWOGL/useGameCoupon',
    headers: expect.objectContaining({ referer: 'https://coupon-front.line.games/sbc/UWOGL' }),
    body: 'gameServerId=UWOGL-US-01&userNo=%E8%88%AA%E6%B5%B7%E5%AE%B6&couponNo=UWO-1',
  }))
})

it('逾時時回傳 timeout，不重試', async () => {
  await expect(timeoutClient.redeem(validInput)).resolves.toMatchObject({ kind: 'timeout' })
  expect(request).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: 執行 client 測試並確認失敗**

Run: `npx vitest run tests/cloudfunctions/line-games-client.test.ts`

Expected: FAIL，因官方 HTTP client 尚不存在。

- [ ] **Step 3: 撰寫服務端驗證、節流與敏感日誌保護的失敗測試**

```js
it('拒絕未知伺服器，且不呼叫官方 client', async () => {
  const result = await service.dispatch({ ...validInput, gameServerId: 'forged' }, 'caller-a')
  expect(result).toMatchObject({ ok: false, code: 'server-invalid' })
  expect(client.redeem).not.toHaveBeenCalled()
})

it('同一來源在冷卻時間內回傳 rate-limited', async () => {
  await service.dispatch(validInput, 'caller-a')
  await expect(service.dispatch(validInput, 'caller-a')).resolves.toMatchObject({ ok: false, code: 'rate-limited' })
})

it('未知官方回應不回傳 couponNo、userNo 或原始 body', async () => {
  const result = await service.dispatch(validInput, 'caller-a')
  expect(JSON.stringify(result)).not.toContain(validInput.couponNo)
  expect(JSON.stringify(result)).not.toContain(validInput.userNo)
  expect(JSON.stringify(result)).not.toContain('third-party-detail')
})
```

- [ ] **Step 4: 執行 service 測試並確認失敗**

Run: `npx vitest run tests/cloudfunctions/coupon-redemption-service.test.ts`

Expected: FAIL，因雲函數 service 尚不存在。

- [ ] **Step 5: 實作 Node `https` client 與純服務層**

`line-games-client.js` 使用 `https.request`，只接受下列固定 host／path，將三個欄位以 `URLSearchParams` 編碼，設定 `Content-Type: application/x-www-form-urlencoded`、精確官方頁面 `referer` 與有限 timeout。將成功 JSON 解析為 `{ kind: 'response', body }`，連線錯誤為 `{ kind: 'network' }`，逾時為 `{ kind: 'timeout' }`；絕不在 client 重試。

`coupon-redemption-service.js` 以這些穩定代碼回應：

```js
const RESULT_CODES = new Set([
  'success', 'user-invalid', 'coupon-invalid', 'coupon-used', 'coupon-expired',
  'coupon-group-used', 'rate-limited', 'server-unavailable', 'maintenance', 'retry-later', 'unknown',
])
```

將官方 `NOT_EXIST_USER` 映射為 `user-invalid`、`NOT_EXIST_COUPON` 為 `coupon-invalid`、`ALREADY_USE_COUPON` 為 `coupon-used`、`ALREADY_USE_COUPON_SAME_GROUP`／`ALREADY_USE_COUPON_SAME_CONFIG` 為 `coupon-group-used`、`EXPIRED_COUPON` 為 `coupon-expired`、`FAIL_MAX_TRY_OVER` 為 `rate-limited`、`UNAVAILABLE_GAME_SERVER` 為 `server-unavailable`、`GAME_UNDER_INSPECTION`／`SYSTEM_MAINTENANCE` 為 `maintenance`，其餘已知暫時錯誤與連線失敗為 `retry-later`，未知 JSON／逾時為 `unknown`。節流使用可注入的 memory limiter（例如每來源 60 秒只允許 1 次），entry 不保存兌換碼。

`index.js` 以 `cloud.getWXContext().OPENID` 產生不可逆短雜湊作為 requester key，僅記錄 action、短 request ID 與 result code；catch 回傳 `{ ok: false, code: 'unknown', message: '結果未確認，請先到官方頁面確認再嘗試。' }`。

- [ ] **Step 6: 執行雲函數測試確認通過**

Run: `npx vitest run tests/cloudfunctions/line-games-client.test.ts tests/cloudfunctions/coupon-redemption-service.test.ts`

Expected: PASS。

- [ ] **Step 7: 使用者確認後提交本 task**

建議 message: `feat: 新增兌換碼雲端代理`

### Task 3: 小程序雲函數 adapter 與網路邊界

**Files:**
- Modify: `miniprogram/runtime/cloudbase-config.ts`
- Create: `miniprogram/runtime/coupon-redemption-service.ts`
- Modify: `tools/quality/check-runtime-network.ts`
- Modify: `tests/unit/local-only.test.ts`
- Create: `tests/runtime/coupon-redemption-service.test.ts`

**Interfaces:**
- Consumes `CouponRedemptionInput` 和雲函數 `{ ok, data | code, message }` envelope。
- Produces `CouponRedemptionService.submit(input): Promise<CouponRedemptionResult>` 與 `CouponRedemptionError`。

- [ ] **Step 1: 撰寫 adapter 的失敗測試**

```ts
it('只向 coupon-redemption 雲函數提交三個官方欄位', async () => {
  mockCallFunction.mockResolvedValue({ result: { ok: true, data: { code: 'success', message: '獎勵已發送至遊戲內信箱。' } } })
  await createCouponRedemptionService().submit(validInput)
  expect(mockCallFunction).toHaveBeenCalledWith({ name: 'coupon-redemption', data: validInput })
})

it('拒絕未知 success envelope，且不暴露伺服器原文', async () => {
  mockCallFunction.mockResolvedValue({ result: { ok: true, data: { code: 'third-party-detail' } } })
  await expect(createCouponRedemptionService().submit(validInput)).rejects.toMatchObject({ code: 'unknown' })
})
```

- [ ] **Step 2: 執行 adapter 測試並確認失敗**

Run: `npx vitest run tests/runtime/coupon-redemption-service.test.ts`

Expected: FAIL，因 Runtime adapter 尚不存在。

- [ ] **Step 3: 擴充 Runtime 網路守門測試的失敗案例**

在 `tests/unit/local-only.test.ts` 加入一個 fixture，驗證 `runtime/coupon-redemption-service.ts` 在 allowlist 中通過，任何 page 內的 `wx.cloud.callFunction` 仍被報告為 `wx.cloud`。

- [ ] **Step 4: 實作 adapter 與 allowlist**

在 `cloudbase-config.ts` 新增：

```ts
export const COUPON_REDEMPTION_FUNCTION_NAME = 'coupon-redemption'
```

adapter 只驗證 exact envelope keys：成功 `{ ok: true, data: { code, message } }`；失敗 `{ ok: false, code, message }`。允許的 `code` 必須是 Task 2 所定義的結果集合；CloudBase rejection、畸形 envelope 與未知 code 一律轉為 `CouponRedemptionError('unknown', '結果未確認，請先到官方頁面確認再嘗試。')`。在 network checker 的 `allowedCloudFunctionFiles` 加入 `'runtime/coupon-redemption-service.ts'`，不放寬其他檔案。

- [ ] **Step 5: 執行測試與網路掃描**

Run: `npx vitest run tests/runtime/coupon-redemption-service.test.ts tests/unit/local-only.test.ts && npm run check:runtime-network`

Expected: PASS，且輸出 `Runtime network boundary: PASS`。

- [ ] **Step 6: 使用者確認後提交本 task**

建議 message: `feat: 新增兌換碼小程序服務`

### Task 4: 設定 Presenter 與設定管理頁

**Files:**
- Create: `miniprogram/presenters/coupon-redemption-presenter.ts`
- Create: `miniprogram/subpkg-coupon/pages/settings/index.ts`
- Create: `miniprogram/subpkg-coupon/pages/settings/index.wxml`
- Create: `miniprogram/subpkg-coupon/pages/settings/index.wxss`
- Create: `tests/coupon-redemption/coupon-redemption-presenter.test.ts`
- Create: `tests/pages/coupon-settings-page.test.ts`

**Interfaces:**
- Consumes `CouponProfileStoreService` 與 `GAME_SERVERS`。
- Produces `buildCouponSettingsViewModel(store)`、`getCouponResultViewModel(result)`；設定頁以 `selectProfile`、`saveProfile`、`requestDeleteProfile`、`confirmDeleteProfile` 操作 store。

- [ ] **Step 1: 撰寫 presenter 的失敗測試**

```ts
it('空設定輸出新增引導，成功結果輸出 achieved 狀態', () => {
  expect(buildCouponSettingsViewModel(emptyStore)).toMatchObject({ isEmpty: true, emptyMessage: '尚未新增玩家設定' })
  expect(getCouponResultViewModel({ code: 'success', message: '獎勵已發送至遊戲內信箱。' })).toMatchObject({ statusClass: 'ui-status--achieved' })
})
```

- [ ] **Step 2: 執行 presenter 測試並確認失敗**

Run: `npx vitest run tests/coupon-redemption/coupon-redemption-presenter.test.ts`

Expected: FAIL，因 presenter 尚不存在。

- [ ] **Step 3: 撰寫設定頁 Controller 與靜態 UI 的失敗測試**

```ts
it('保存設定後寫入本機 store，並返回清單狀態', () => {
  page.onSaveProfile()
  expect(saveProfile).toHaveBeenCalledWith({ name: '主力商會', gameServerId: 'UWOGL-US-01', userNo: '航海家小明' })
})

it('使用官方伺服器 picker、Design Foundation 按鈕與刪除確認', () => {
  expect(wxml).toContain('picker mode="selector"')
  expect(wxml).toContain('range="{{gameServers}}"')
  expect(wxml).toContain('bindtap="onConfirmDeleteProfile"')
  expect(wxss).toContain('var(--uwo-color-canvas)')
  expect(wxss).toContain('min-height: 88rpx')
})
```

- [ ] **Step 4: 執行設定頁測試並確認失敗**

Run: `npx vitest run tests/pages/coupon-settings-page.test.ts`

Expected: FAIL，因設定頁尚不存在。

- [ ] **Step 5: 實作 presenter 與設定頁**

設定頁 onLoad 從 `createCouponProfileStore(wx)` 取得 store；以 `picker mode="selector" range="{{gameServers}}" range-key="name"` 顯示官方伺服器。保存時先用 contract 驗證名稱、伺服器與暱稱，新增呼叫 `saveProfile`，編輯呼叫 `updateProfile(id, input)`，錯誤以 `wx.showToast` 顯示繁體中文；刪除操作先將目標 ID 寫入 page data，只有 modal confirm 後才呼叫 `deleteProfile`。列表的「使用」操作呼叫 `setActiveProfile` 並 `navigateBack`。

WXSS 以 canvas page、surface 卡片、subtle border、card/control radius、Token spacing 與 `.ui-button`；每個新增、保存、使用、刪除操作具可見文字與至少 `88rpx` 熱區。不得使用 Emoji、網路圖片或硬編碼色碼。

- [ ] **Step 6: 執行 presenter 與設定頁測試**

Run: `npx vitest run tests/coupon-redemption/coupon-redemption-presenter.test.ts tests/pages/coupon-settings-page.test.ts`

Expected: PASS。

- [ ] **Step 7: 使用者確認後提交本 task**

建議 message: `feat: 新增玩家兌換設定頁`

### Task 5: 兌換碼頁、首頁入口與提交狀態

**Files:**
- Create: `miniprogram/subpkg-coupon/pages/redemption/index.ts`
- Create: `miniprogram/subpkg-coupon/pages/redemption/index.wxml`
- Create: `miniprogram/subpkg-coupon/pages/redemption/index.wxss`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/home/index.ts`
- Modify: `miniprogram/pages/home/index.wxml`
- Modify: `tests/pages/home-page.test.ts`
- Create: `tests/pages/coupon-redemption-page.test.ts`

**Interfaces:**
- Consumes `CouponProfileStoreService`、`CouponRedemptionService.submit` 與 `getCouponResultViewModel`。
- Produces從首頁 `/subpkg-coupon/pages/redemption/index` 進入的完整領取流程，並能導航至 `/subpkg-coupon/pages/settings/index`。

- [ ] **Step 1: 撰寫兌換頁的失敗測試**

```ts
it('沒有目前設定時禁用提交並導向設定頁', () => {
  page.onLoad()
  expect(page.data.submitDisabled).toBe(true)
  page.onOpenSettings()
  expect(wxStub.navigateTo).toHaveBeenCalledWith({ url: '/subpkg-coupon/pages/settings/index' })
})

it('提交期間鎖定重複請求，結束後清空兌換碼', async () => {
  const pending = deferred<CouponRedemptionResult>()
  submit.mockReturnValue(pending.promise)
  const first = page.onSubmit()
  await page.onSubmit()
  expect(submit).toHaveBeenCalledTimes(1)
  pending.resolve({ code: 'success', message: '獎勵已發送至遊戲內信箱。' })
  await first
  expect(page.data.couponNo).toBe('')
})
```

- [ ] **Step 2: 執行兌換頁測試並確認失敗**

Run: `npx vitest run tests/pages/coupon-redemption-page.test.ts`

Expected: FAIL，因兌換頁尚不存在。

- [ ] **Step 3: 擴充首頁入口的失敗測試**

在 `tests/pages/home-page.test.ts` 斷言首頁 modules 具有：

```ts
expect(homePage.data.modules).toContainEqual(expect.objectContaining({
  id: 'coupon-redemption', name: '兌換碼', route: '/subpkg-coupon/pages/redemption/index',
}))
```

並調整原本「四個主要模組」的斷言，使兌換碼為主要入口而資料維護仍為次級入口。

- [ ] **Step 4: 執行頁面測試並確認失敗**

Run: `npx vitest run tests/pages/home-page.test.ts tests/pages/coupon-redemption-page.test.ts`

Expected: FAIL，因首頁尚未新增入口且兌換頁不存在。

- [ ] **Step 5: 實作頁面、路由與首頁入口**

在 `app.json` 新增 `subpkg-coupon` 分包，頁面為 `pages/redemption/index` 與 `pages/settings/index`；首頁在資料維護前新增「兌換碼」module，並將主網格條件由 `index < 4` 調整為包含新入口，資料維護條件改用 module `id`，避免資料順序改動導致入口分類錯誤。分包用於保持主包低於既有大小門禁。

兌換頁於 `onShow` 重讀本機 store 以反映設定頁回傳後的 active profile。`onSubmit` 先驗證 profile 與 code，設 `isSubmitting: true` 後一次性呼叫 service；無論成功、已知失敗、network／unknown 都在 finally 清空 code 並解除鎖定。unknown 及 adapter rejection 固定顯示「結果未確認，請先到官方頁面確認再嘗試。」；不實作自動重送。

WXML 顯示 active profile、設定入口、input、唯一 primary submit button 及 presenter 產生的 `.ui-status`。WXSS 僅使用 Design Foundation Token，固定底部操作區加入 `env(safe-area-inset-bottom)`，長暱稱可換行，320px 不產生橫向溢出。

- [ ] **Step 6: 執行首頁與兌換頁測試**

Run: `npx vitest run tests/pages/home-page.test.ts tests/pages/coupon-redemption-page.test.ts`

Expected: PASS。

- [ ] **Step 7: 使用者確認後提交本 task**

建議 message: `feat: 新增兌換碼領取流程`

### Task 6: 部署文件、全量驗證與 DevTools 驗收

**Files:**
- Create: `docs/architecture/coupon-redemption-cloudbase.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-08-coupon-redemption-design.md`（僅將狀態改為已實作並補上實際部署驗收結果）

**Interfaces:**
- Consumes完成的 `coupon-redemption` 雲函數與兩個頁面。
- Produces可重現的雲函數部署、官方連線驗證與安全檢查說明。

- [ ] **Step 1: 撰寫部署文件的驗收清單**

文件必須明確列出：在微信開發者工具右鍵 `cloudfunctions/coupon-redemption/` 選擇「上傳並部署：雲端安裝依賴」、CloudBase 出站網路需能連至 `coupon-front.line.games:443`、不設定或提交任何帳密／token、以及生產環境以有效但非測試用帳號由使用者自行手動驗證一次。

- [ ] **Step 2: 在 README 加入功能入口與隱私說明**

加入一段繁體中文說明：「兌換設定僅保存於目前裝置；兌換碼不保存，送出時由雲函數代理官方網站。」不得把官方 URL 寫入 `miniprogram/` Runtime 檔案。

- [ ] **Step 3: 執行定向測試與格式／型別檢查**

Run: `npx vitest run tests/coupon-redemption tests/cloudfunctions/coupon-redemption-service.test.ts tests/cloudfunctions/line-games-client.test.ts tests/runtime/coupon-redemption-service.test.ts tests/pages/coupon-settings-page.test.ts tests/pages/coupon-redemption-page.test.ts tests/pages/home-page.test.ts && npm run typecheck && npm run check:runtime-network`

Expected: PASS。

- [ ] **Step 4: 執行完整門禁**

Run: `npm run verify && git diff --check`

Expected: 全部 PASS，且 `git diff --check` 無輸出。

- [ ] **Step 5: 在微信開發者工具完成視覺與互動驗收**

在 320px、375px、393px、430px 寬度確認：首頁入口、原生伺服器 selector 的九個選項與順序、新增／編輯／刪除／切換 profile、空設定禁用原因、長暱稱換行、提交鎖定、成功／失敗文字狀態與底部安全區。不得在自動化或開發測試中對官方送出兌換碼。

- [ ] **Step 6: 向使用者展示最終變更與驗證結果**

列出 `git status --short`、所有驗證指令的實際結果、DevTools 驗收結果，以及建議 commit message：`feat: 新增兌換碼自動領取功能`。等待使用者確認後才可提交。

## 自我審查

- 規格覆蓋：Task 1 實作九個官方伺服器、10 組本機設定、欄位與輸入驗證；Task 2 實作官方代理、節流、逾時、回應映射及敏感資料保護；Task 3 保護 Runtime 網路邊界；Task 4 與 Task 5 實作兩個頁面、Design Foundation UI、操作鎖定與首頁入口；Task 6 處理部署、全量驗證與 DevTools。
- 無 placeholder：已檢查本文件不含 `TODO`、`TBD`、`implement later` 或未指定的測試／錯誤處理步驟。
- 型別一致性：`CouponRedemptionInput` 為 Task 1 定義，Task 2、3、5 均使用同名三欄位 payload；Task 2 的 `CouponRedemptionResult` code 集合由 Task 3 adapter 驗證，再交由 Task 4 presenter 與 Task 5 page 消費。
