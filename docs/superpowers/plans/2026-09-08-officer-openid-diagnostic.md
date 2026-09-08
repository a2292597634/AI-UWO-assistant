# 航海士投稿 OpenID 臨時診斷功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「資料投稿」頁提供一個臨時入口，讓已登入用戶取得目前微信小程序 OpenID，以完成 CloudBase 管理員白名單配置。

**Architecture:** Cloud Function 只從 `cloud.getWXContext().OPENID` 取得呼叫者身份，新增 `getMyOpenId` action；小程序 runtime service 轉換為型別化方法；投稿頁使用既有頁首入口顯示 OpenID 並提供複製按鈕。功能不寫資料庫、不記錄完整 OpenID、不改變管理員權限判斷。

**Tech Stack:** Node.js Cloud Function、`wx-server-sdk`、微信小程序 TypeScript/WXML/WXSS、Vitest、Prettier、ESLint、TypeScript。

## Global Constraints

- UI、文件與回覆使用中文；WXML/WXSS 類名使用英文 BEM 風格。
- OpenID 只能由 CloudBase `wxContext.OPENID` 提供，不能接受客戶端傳入值。
- 不新增或升級依賴。
- 不修改正式資料、投稿狀態流、`OFFICER_ADMIN_OPENIDS` 格式或同步發布流程。
- 頁面入口對所有已登入用戶可見，完成管理員配置後可移除；不把入口可見性當作授權。
- UI 改動遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md` 的 Token、觸控與安全區規範。
- 修改後執行 `npm.cmd run verify`；不要直接修改 `miniprogram/generated/`。

---

### Task 1: 新增 Cloud Function OpenID action

**Files:**
- Modify: `cloudfunctions/officer-custom/officer-custom-service.js:32-35,453-469`
- Test: `tests/cloudfunctions/officer-custom-service.test.ts`

**Interfaces:**
- Consumes: `dispatch(action, payload, ownerUid)`，其中 `ownerUid` 由入口的 `cloud.getWXContext().OPENID` 注入。
- Produces: `dispatch('getMyOpenId', payload, ownerUid)` 返回 `{ ok: true, data: { openid: string } }`；未登入返回 `{ ok: false, code: 'unauthenticated', ... }`。

- [x] **Step 1: Write the failing test**

在 `describe('Officer custom submission service', ...)` 中加入：

```ts
it('只返回服務端目前呼叫者的 OpenID，忽略 payload 內的偽造值', async () => {
  await expect(
    service.dispatch('getMyOpenId', { openid: 'openid_spoofed' }, 'openid_user'),
  ).resolves.toMatchObject({
    ok: true,
    data: { openid: 'openid_user' },
  })
})

it('未登入時不能取得 OpenID', async () => {
  await expect(service.dispatch('getMyOpenId', {}, null)).resolves.toMatchObject({
    ok: false,
    code: 'unauthenticated',
  })
})
```

同步把測試內 `dispatch` 的 `ownerUid` 型別由 `string` 擴展為 `string | null`，讓未登入案例直接反映 production contract。

- [x] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/cloudfunctions/officer-custom-service.test.ts`

Expected: FAIL，錯誤應指出 `getMyOpenId` 尚未被允許或回傳 `unknown-action`。

- [x] **Step 3: Write minimal implementation**

把 `getMyOpenId` 加入允許的 user action，保留現有未登入檢查，並在 `switch` 中只使用服務端參數：

```js
case 'getMyOpenId':
  return ok({ openid: ownerUid })
```

不要從 `payload.openid`、`payload.ownerUid` 或其他客戶端欄位讀取身份；不要新增完整 OpenID 日誌。

- [x] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/cloudfunctions/officer-custom-service.test.ts`

Expected: PASS，包含既有投稿、審核、同步和限額測試。

- [ ] **Step 5: Commit（等待用户确认）**

```powershell
git add tests/cloudfunctions/officer-custom-service.test.ts cloudfunctions/officer-custom/officer-custom-service.js
git commit -m "feat: 新增 OpenID 診斷雲函數 action"
```

### Task 2: 接通小程序 runtime service

**Files:**
- Modify: `miniprogram/runtime/officer-editor-service.ts:112-150,180-193`
- Test: `tests/runtime/officer-editor-service.test.ts`

**Interfaces:**
- Consumes: Cloud Function action `getMyOpenId`。
- Produces: `OfficerSubmissionService.getMyOpenId(): Promise<{ openid: string }>`，调用 payload 固定为空对象。

- [x] **Step 1: Write the failing test**

在 runtime adapter contract suite 加入：

```ts
it('取得目前登入帳號 OpenID 時不向服務端傳入身份欄位', async () => {
  mockCallFunction.mockResolvedValue({
    result: { ok: true, data: { openid: 'openid_user' } },
  })

  await expect(createOfficerSubmissionService().getMyOpenId()).resolves.toEqual({
    openid: 'openid_user',
  })
  expect(mockCallFunction).toHaveBeenLastCalledWith({
    name: 'officer-custom',
    data: { action: 'getMyOpenId' },
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/runtime/officer-editor-service.test.ts`

Expected: FAIL，`getMyOpenId` 尚未存在於 service interface 或實作。

- [x] **Step 3: Write minimal implementation**

在 `OfficerSubmissionService` interface 增加：

```ts
getMyOpenId(): Promise<{ openid: string }>
```

並在 `createOfficerSubmissionService()` 返回物件加入：

```ts
async getMyOpenId(): Promise<{ openid: string }> {
  return callOfficerFunction<{ openid: string }>('getMyOpenId')
}
```

繼續使用既有 `callOfficerFunction` 的錯誤轉換與網路錯誤遮罩，不在頁面直接呼叫 `wx.cloud`。

- [x] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/runtime/officer-editor-service.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit（等待用户确认）**

```powershell
git add tests/runtime/officer-editor-service.test.ts miniprogram/runtime/officer-editor-service.ts
git commit -m "feat: 接通 OpenID 診斷 runtime service"
```

### Task 3: 在投稿頁增加臨時展示與複製入口

**Files:**
- Modify: `miniprogram/pages/officer-editor/index.ts:40-125,190-207,371-467,811-819`
- Modify: `miniprogram/pages/officer-editor/index.wxml:8-12`
- Modify: `miniprogram/pages/officer-editor/index.wxss`（只增加既有 Token 下的臨時入口狀態）
- Test: `tests/pages/officer-editor-page.test.ts`

**Interfaces:**
- Consumes: `getOfficerSubmissionService().getMyOpenId()`。
- Produces: 頁首「查看目前帳號 OpenID（臨時）」入口；成功後以 `wx.showModal` 展示完整值，點擊確認按鈕後使用 `wx.setClipboardData` 複製。

- [x] **Step 1: Write the failing test**

在投稿頁契約測試加入：

```ts
it('提供臨時 OpenID 顯示與複製入口', () => {
  const wxml = readPageFile('index.wxml')
  const ts = readPageFile('index.ts')

  expect(wxml).toContain('查看目前帳號 OpenID（臨時）')
  expect(ts).toContain('onShowOpenId')
  expect(ts).toContain("getOfficerSubmissionService().getMyOpenId()")
  expect(ts).toContain('wx.setClipboardData')
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/pages/officer-editor-page.test.ts`

Expected: FAIL，投稿頁尚未包含臨時入口文字或 `getMyOpenId` 呼叫。

- [x] **Step 3: Write minimal implementation**

在頁首 actions 增加不依賴 `isAdmin` 的入口：

```xml
<view class="submission-header__link submission-header__link--temporary" bindtap="onShowOpenId">
  查看目前帳號 OpenID（臨時）
</view>
```

在頁面事件中调用 service；成功後用 callback API 展示並複製：

```ts
onShowOpenId() {
  getOfficerSubmissionService()
    .getMyOpenId()
    .then(({ openid }) => {
      wx.showModal({
        title: '目前帳號 OpenID（臨時）',
        content: openid,
        confirmText: '複製',
        success: (result) => {
          if (!result.confirm) return
          wx.setClipboardData({
            data: openid,
            success: () => showSuccess('OpenID 已複製'),
          })
        },
      })
    })
    .catch((error) => {
      showError(error instanceof OfficerSubmissionError ? error.message : 'OpenID 讀取失敗，請重試')
    })
}
```

若需要防止連續點擊，沿用頁面既有 `submitting` 狀態模式新增局部 `openIdLoading`，在請求期間將入口文字改為「正在讀取 OpenID…」；不把 OpenID 寫入 Page data 或本地儲存。WXSS 只使用 design foundation Token，不增加硬編碼顏色。

- [x] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/pages/officer-editor-page.test.ts`

Expected: PASS，既有表單欄位和入口契約仍然成立。

- [ ] **Step 5: Commit（等待用户确认）**

```powershell
git add tests/pages/officer-editor-page.test.ts miniprogram/pages/officer-editor/index.ts miniprogram/pages/officer-editor/index.wxml miniprogram/pages/officer-editor/index.wxss
git commit -m "feat: 在投稿頁顯示目前帳號 OpenID"
```

### Task 4: 更新操作說明並執行整體驗證

**Files:**
- Modify: `docs/architecture/officer-submission-review.md:10-30`

**Interfaces:**
- Consumes: 完成的 `getMyOpenId` action 與投稿頁入口。
- Produces: 可直接照做的 OpenID 配置與臨時功能移除說明。

- [x] **Step 1: 更新運維文件**

在管理員權限段落加入：先進小程序「資料投稿」→「查看目前帳號 OpenID（臨時）」→複製值，再到 CloudBase `officer-custom` 環境變量設定 `OFFICER_ADMIN_OPENIDS`；配置完成後重新部署雲函數與小程序，最後移除臨時入口。明確說明不要把 OpenID 寫入 Git 或提交訊息。

- [x] **Step 2: 執行相關測試**

Run: `npm.cmd test -- tests/cloudfunctions/officer-custom-service.test.ts tests/runtime/officer-editor-service.test.ts tests/pages/officer-editor-page.test.ts`

Expected: 相關測試全部 PASS。

- [x] **Step 3: 執行完整門禁**

Run: `npm.cmd run verify`

Expected: format、lint、typecheck、全部測試、runtime network、主包大小、資產、資料檢查與 deterministic generate 全部 PASS。

- [x] **Step 4: 核對變更範圍**

Run: `git diff --check` and `git status --short`

Expected: 沒有空白錯誤；只包含本功能的 Cloud Function、runtime、投稿頁、測試和操作文件。

- [ ] **Step 5: Commit（等待用户确认）**

```powershell
git add docs/architecture/officer-submission-review.md
git commit -m "docs: 補充 OpenID 臨時配置說明"
```
