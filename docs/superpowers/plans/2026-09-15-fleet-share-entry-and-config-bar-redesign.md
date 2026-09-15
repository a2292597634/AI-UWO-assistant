# 配隊分享入口與配置欄重整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將配隊分享入口移入配置欄，徹底移除底部固定分享區，並按確認稿整理配置摘要、配置行及管理按鈕。

**Architecture:** 共享 `config-bar` 只呈現配置與分享入口並向頁面派發事件；戰鬥與冒險頁繼續擁有分享狀態和生成流程。頁面移除固定分享欄與其布局补偿，方案預覽不再與分享入口共享底部層級。

**Tech Stack:** 微信小程序 WXML/WXSS、TypeScript、Vitest、Design Foundation Token

## Global Constraints

- 界面、註釋、文檔使用繁體中文；類名保持英文 BEM。
- 不新增、刪除或升級依賴。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`。
- 不改變配置保存、載入、衝突、分享圖生成及未保存守衛語義。
- 分享入口只有配置欄中的一處，底部固定分享區及其占位必須完全刪除。
- 所有樣式使用 Design Foundation Token，按鈕實際熱區至少 `88rpx`。
- 最低驗收寬度為 `320px`，不得出現橫向溢出。

---

### Task 1: 重整共享配置欄並提供分享事件

**Files:**
- Modify: `miniprogram/components/config-bar/index.ts`
- Modify: `miniprogram/components/config-bar/index.wxml`
- Modify: `miniprogram/components/config-bar/index.wxss`
- Test: `tests/architecture/fleet-shared-components.test.ts`

**Interfaces:**
- Consumes: 頁面傳入的 `shareStatus: 'idle' | 'generating' | 'ready' | 'error'`、既有配置 properties 與事件。
- Produces: `share` 事件；摘要列的合併狀態組；目前配置行中的 `exit` 操作；四欄管理操作容器。

- [ ] **Step 1: 寫入失敗的元件契約測試**

在 `fleet-shared-components.test.ts` 斷言：

```ts
expect(script).toContain("this.triggerEvent('share')")
expect(wxml).toContain('class="config-bar__share"')
expect(wxml).toContain("{{configList.length}} 套")
expect(wxml).toMatch(/bindtap="onLoad"[\s\S]*wx:if="{{item.configId === activeConfigId}}"[\s\S]*bindtap="onExit"/)
expect(wxml).toMatch(/bindtap="onSaveAs"[\s\S]*bindtap="onRename"[\s\S]*bindtap="onDelete"[\s\S]*bindtap="onNew"/)
```

同时斷言 `.config-bar__management-actions` 使用四欄 grid、摘要名稱可省略、狀態組不可換行、分享與箭頭熱區至少 `88rpx`。

- [ ] **Step 2: 執行測試並確認失敗**

Run: `npm test -- --run tests/architecture/fleet-shared-components.test.ts`

Expected: FAIL，缺少分享事件、新布局類名及四欄 grid。

- [ ] **Step 3: 實作配置欄最小變更**

在 `index.ts` 新增 property 與 handler：

```ts
shareStatus: { type: String, value: 'idle' }

onShare() {
  this.triggerEvent('share')
}
```

WXML 摘要列依序呈現名称組、`狀態 · N 套`、分享按鈕及箭頭；分享按鈕使用 `catchtap="onShare"`，生成中 disabled。把目前配置的「離開配置」移到其列表行中「載入」右側。把另存為、重新命名、刪除配置、新建配置放入 `.config-bar__management-actions`，覆蓋保存與訪客登入維持獨立全寬操作。

WXSS 使用 flex 完成摘要列、以配置名稱 `text-overflow: ellipsis` 吸收窄屏壓力，管理操作使用：

```css
.config-bar__management-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--uwo-space-1);
}
```

- [ ] **Step 4: 執行元件契約測試並確認通過**

Run: `npm test -- --run tests/architecture/fleet-shared-components.test.ts`

Expected: PASS。

### Task 2: 兩個配隊頁接入配置欄分享並刪除底部入口

**Files:**
- Modify: `miniprogram/subpkg-fleet/pages/index/index.wxml`
- Modify: `miniprogram/subpkg-fleet/pages/index/index.wxss`
- Modify: `miniprogram/subpkg-fleet/pages/index/index.ts`
- Modify: `miniprogram/pages/adventure-fleet/index.wxml`
- Modify: `miniprogram/pages/adventure-fleet/index.wxss`
- Modify: `miniprogram/pages/adventure-fleet/index.ts`
- Test: `tests/architecture/fleet-share.test.ts`
- Test: `tests/pages/fleet-page.test.ts`
- Test: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- Consumes: `config-bar` 的 `shareStatus` property 與 `share` 事件。
- Produces: 唯一分享入口绑定 `onShareFleet`；既有 Canvas、分享預覽與未保存守衛保持頁面級。

- [ ] **Step 1: 寫入失敗的頁面與架構測試**

兩頁都斷言配置欄包含：

```wxml
share-status="{{shareStatus}}"
bind:share="onShareFleet"
```

並斷言 WXML/WXSS 不再包含 `fleet-share-bar`。刪除先前針對 `showFleetShareBar` 的臨時回歸斷言，改為驗證底部入口不存在，方案預覽仍位於主滾動區外且保留 apply/cancel 綁定。

- [ ] **Step 2: 執行頁面定向測試並確認失敗**

Run: `npm test -- --run tests/architecture/fleet-share.test.ts tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts`

Expected: FAIL，配置欄尚未接入分享，頁面仍含底部分享欄。

- [ ] **Step 3: 實作兩頁接線與清理**

在兩頁 `<config-bar>` 增加 `share-status` 與 `bind:share`。完整刪除 `.fleet-share-bar` WXML、WXSS、底部占位 padding 及只服務於底部入口顯示的 `showFleetShareBar` data／setData。保留隱藏 Canvas、`fleet-share-preview`、`result-preview-sheet` 與 `onShareFleet` 實作。

- [ ] **Step 4: 執行頁面定向測試並確認通過**

Run: `npm test -- --run tests/architecture/fleet-share.test.ts tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts`

Expected: PASS。

### Task 3: 回歸檢查與完成門禁

**Files:**
- Verify: `miniprogram/components/config-bar/index.wxml`
- Verify: `miniprogram/components/config-bar/index.wxss`
- Verify: `miniprogram/subpkg-fleet/pages/index/index.wxml`
- Verify: `miniprogram/pages/adventure-fleet/index.wxml`

**Interfaces:**
- Consumes: Task 1–2 的完成布局與事件接線。
- Produces: 可提交的、通過全量門禁的实现。

- [ ] **Step 1: 靜態核對唯一入口與操作順序**

Run: `rg -n "fleet-share-bar|bind:share|config-bar__management-actions|bindtap=\"onExit\"" miniprogram/components/config-bar miniprogram/pages/adventure-fleet miniprogram/subpkg-fleet/pages/index`

Expected: 兩頁無 `fleet-share-bar`；分享只由兩頁配置欄綁定；離開配置只位於配置行；管理操作只有一個四欄容器。

- [ ] **Step 2: 執行差異與完整驗證**

Run: `git diff --check`

Expected: 無輸出。

Run: `npm run verify`

Expected: format、lint、typecheck、全部 Vitest、runtime-network、package size、assets、data 及 generate checks 全部 PASS。

- [ ] **Step 3: 微信 DevTools／真機驗收**

在 `320／375／393／430px` 檢查收起與展開状态；依次驗證訪客、未命名、已保存、未保存、多配置與錯誤狀態。確認分享不觸發展開，箭頭不觸發分享，四個管理按鈕同列，應用方案完整可見且页面底部不再存在分享区域。

- [ ] **Step 4: 准备提交信息**

列出所有變更文件、完整驗證結果及擬用 commit message `feat: 重整配隊分享入口與配置欄`，等待用戶確認後再提交。
