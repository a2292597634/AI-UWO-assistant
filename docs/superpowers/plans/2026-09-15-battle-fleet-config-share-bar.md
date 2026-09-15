# 戰鬥配隊配置與分享區重構 Implementation Plan

> **執行狀態：** 已完成實作、定向測試、完整工程門禁與微信開發者工具驗收；320 / 375 / 393px 的實機切換受現有自動化框架限制，已由窄屏靜態契約覆蓋並記錄為非阻塞限制。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將戰鬥配隊頁頂部摘要改為雙層配置入口與獨立分享按鈕，同時保持冒險配隊頁、配置展開內容及戰鬥頁下方區域不變。

**Architecture:** 在共享 `config-bar` 增加默認關閉的展示 Property `prominentShare`。元件只在該 Property 為 `true` 時渲染新的兩欄摘要，展開內容與既有事件維持單一實作；戰鬥頁顯式啟用變體，冒險頁繼續使用現有摘要。

**Tech Stack:** 微信小程序 WXML/WXSS、TypeScript、Vitest、`miniprogram-automator`、Design Foundation Token

## Global Constraints

- 界面、註釋與文檔使用繁體中文；WXML/WXSS 類名使用英文 BEM。
- 不新增、刪除或升級依賴。
- 不修改 `archive/`、`data/master/` 或 `miniprogram/generated/`。
- 不修改配置展開內容、冒險配隊頁布局或戰鬥配隊頁下方區域。
- 不修改配置與分享的資料格式、狀態機、未保存守衛、Canvas 或預覽流程。
- 摘要文案只使用「我的配置」、「已保存／尚未保存」、「未命名配置」、「N 套」、「分享／生成中／重試」。
- `prominentShare` 默認為 `false`；只有戰鬥配隊頁傳入 `true`。
- 分享按鈕固定寬度 `136rpx`；配置入口與分享按鈕最小高度 `104rpx`，實際觸控面積不得低於 `88rpx`。
- 以 `320px` 為最低驗收寬度，不得出現頁面級水平滾動。
- 所有新增樣式使用既有 `--uwo-*` Token，且限定在 `.config-bar--prominent-share` 下。
- 每次提交前列出變更文件、驗證結果與擬用 commit message，等待用戶確認。

---

## File Map

| 文件 | 職責 |
| --- | --- |
| `miniprogram/components/config-bar/index.ts` | 宣告只控制展示的 `prominentShare` Property |
| `miniprogram/components/config-bar/index.wxml` | 保留現有摘要作為默認分支，新增戰鬥頁雙層摘要分支，兩個分支共用同一份展開內容 |
| `miniprogram/components/config-bar/index.wxss` | 在 modifier 下實作兩欄尺寸、雙層文字與獨立分享按鈕樣式 |
| `miniprogram/subpkg-fleet/pages/index/index.wxml` | 僅為戰鬥頁啟用 `prominent-share` |
| `tests/architecture/fleet-shared-components.test.ts` | 驗證 Property、分支結構、文案、事件隔離與 modifier 樣式 |
| `tests/pages/fleet-page.test.ts` | 驗證戰鬥頁啟用變體且下方結構保持存在 |
| `tests/pages/adventure-fleet-page.test.ts` | 驗證冒險頁未啟用變體 |

### Task 1: 為共享 ConfigBar 增加隔離的突出分享變體

**Files:**
- Modify: `tests/architecture/fleet-shared-components.test.ts`
- Modify: `miniprogram/components/config-bar/index.ts`
- Modify: `miniprogram/components/config-bar/index.wxml`
- Modify: `miniprogram/components/config-bar/index.wxss`

**Interfaces:**
- Consumes: 既有 `configName`、`configStatus`、`configList`、`expanded`、`shareStatus` Properties，以及 `onToggle`、`onShare` handlers。
- Produces: `prominentShare: boolean` Property；`.config-bar--prominent-share` modifier；`.config-bar__config-toggle` 雙層配置入口。

- [x] **Step 1: 寫入失敗的元件契約測試**

在 `ConfigBar 顯示折疊配置管理模組並提供完整事件入口` 測試的 Property 列表加入 `prominentShare`，並新增獨立測試：

```ts
it('ConfigBar 以默認關閉的變體提供雙層配置入口與獨立分享操作', () => {
  const script = readComponentFile('config-bar', 'index.ts')
  const wxml = readComponentFile('config-bar', 'index.wxml')
  const wxss = readComponentFile('config-bar', 'index.wxss')

  expect(script).toMatch(
    /prominentShare:\s*\{[\s\S]*type:\s*Boolean[\s\S]*value:\s*false[\s\S]*\}/,
  )
  expect(wxml).toContain("config-bar--prominent-share")
  expect(wxml).toContain('wx:if="{{prominentShare}}"')
  expect(wxml).toContain('class="config-bar__config-toggle"')
  expect(wxml).toContain('class="config-bar__config-row config-bar__config-row--meta"')
  expect(wxml).toContain('class="config-bar__config-row config-bar__config-row--identity"')
  expect(wxml).toMatch(
    /class="config-bar__config-toggle"[\s\S]*catchtap="onToggle"[\s\S]*class="config-bar__share config-bar__share--prominent"[\s\S]*catchtap="onShare"/,
  )
  expect(wxml.match(/class="config-bar__content"/g)).toHaveLength(1)
  expect(wxss).toMatch(
    /\.config-bar--prominent-share\s+\.config-bar__summary--prominent\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+136rpx/,
  )
  expect(wxss).toMatch(
    /\.config-bar--prominent-share\s+\.config-bar__config-toggle\s*\{[\s\S]*min-height:\s*104rpx/,
  )
  expect(wxss).toMatch(
    /\.config-bar--prominent-share\s+\.config-bar__share--prominent\s*\{[\s\S]*width:\s*136rpx\s*!important[\s\S]*min-height:\s*104rpx/,
  )
})
```

- [x] **Step 2: 執行元件測試並確認紅燈**

Run:

```powershell
npm test -- --run tests/architecture/fleet-shared-components.test.ts
```

Expected: FAIL，指出 `prominentShare`、突出分享結構或 modifier 樣式不存在；既有 ConfigBar 測試仍可執行。

- [x] **Step 3: 宣告默認關閉的展示 Property**

在 `index.ts` 的 `properties` 中、`shareStatus` 後加入：

```ts
prominentShare: {
  type: Boolean,
  value: false,
},
```

不新增 handler，不修改任何既有事件。

- [x] **Step 4: 新增突出分享摘要分支**

在 `index.wxml` 根節點加入 modifier：

```wxml
<view class="config-bar {{expanded ? 'config-bar--expanded' : ''}} {{prominentShare ? 'config-bar--prominent-share' : ''}}">
```

在現有摘要前新增 `wx:if` 分支，並把現有摘要改為 `wx:else`；現有 `.config-bar__content` 保持在兩個分支之後且只保留一份：

```wxml
<view
  wx:if="{{prominentShare}}"
  class="config-bar__summary config-bar__summary--prominent"
>
  <button
    class="config-bar__config-toggle"
    catchtap="onToggle"
    aria-expanded="{{expanded}}"
    aria-label="{{expanded ? '收起我的配置' : '展開我的配置'}}"
  >
    <view class="config-bar__config-row config-bar__config-row--meta">
      <text class="config-bar__config-label">我的配置</text>
      <text class="config-bar__status config-bar__status--{{configStatus}}">
        {{configStatus === 'saved' ? '已保存' : '尚未保存'}}
      </text>
    </view>
    <view class="config-bar__config-row config-bar__config-row--identity">
      <text class="config-bar__name">{{configName || '未命名配置'}}</text>
      <text class="config-bar__count">{{configList.length}} 套</text>
      <image
        class="config-bar__toggle-icon {{expanded ? 'config-bar__toggle-icon--expanded' : ''}}"
        src="{{expanded ? '/assets/ui/uwo-disclosure-chevron-up.png' : '/assets/ui/uwo-disclosure-chevron-down.png'}}"
        mode="aspectFit"
        aria-hidden="true"
      />
    </view>
  </button>
  <button
    class="config-bar__share config-bar__share--prominent"
    catchtap="onShare"
    disabled="{{shareStatus === 'generating'}}"
    loading="{{shareStatus === 'generating'}}"
    aria-label="{{shareStatus === 'generating' ? '正在生成隊伍分享圖' : shareStatus === 'error' ? '重試生成隊伍分享圖' : '分享目前隊伍'}}"
  >{{shareStatus === 'generating' ? '生成中' : shareStatus === 'error' ? '重試' : '分享'}}</button>
</view>
```

默認 `wx:else` 分支的 WXML 逐字保留，確保冒險頁外觀與現有架構測試不回退。

- [x] **Step 5: 實作 modifier 限定樣式**

在 `index.wxss` 末尾加入以下規則，所有新規則均受 modifier 限定：

```css
.config-bar--prominent-share .config-bar__summary--prominent {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 136rpx;
  gap: var(--uwo-space-2);
  min-height: 104rpx;
  overflow: visible;
}

.config-bar--prominent-share .config-bar__config-toggle {
  box-sizing: border-box;
  display: flex;
  min-width: 0;
  min-height: 104rpx;
  margin: 0;
  flex-direction: column;
  justify-content: center;
  gap: var(--uwo-space-2);
  padding: var(--uwo-space-2) var(--uwo-space-3);
  border: 2rpx solid var(--uwo-color-border-subtle);
  border-radius: var(--uwo-radius-control);
  background: var(--uwo-color-surface);
  color: var(--uwo-color-text-primary);
  text-align: left;
}

.config-bar--prominent-share .config-bar__config-toggle::after {
  border: 0;
}

.config-bar--prominent-share .config-bar__config-row {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: var(--uwo-space-2);
}

.config-bar--prominent-share .config-bar__config-label,
.config-bar--prominent-share .config-bar__status,
.config-bar--prominent-share .config-bar__count {
  flex: 0 0 auto;
  font-size: var(--uwo-font-size-supporting);
  font-weight: 600;
  white-space: nowrap;
}

.config-bar--prominent-share .config-bar__status,
.config-bar--prominent-share .config-bar__count {
  margin-left: auto;
}

.config-bar--prominent-share .config-bar__name {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  font-size: var(--uwo-font-size-emphasis);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-bar--prominent-share .config-bar__config-row .config-bar__toggle-icon {
  width: 32rpx;
  height: 32rpx;
  flex: 0 0 32rpx;
  transform: none;
}

.config-bar--prominent-share .config-bar__share--prominent {
  width: 136rpx !important;
  min-width: 136rpx !important;
  max-width: 136rpx !important;
  min-height: 104rpx;
  padding: 0 var(--uwo-space-2);
  border-color: var(--uwo-color-ink);
  background: var(--uwo-color-ink);
  color: var(--uwo-color-surface);
  font-size: var(--uwo-font-size-body);
  font-weight: 600;
}

.config-bar--prominent-share .config-bar__config-toggle:active {
  transform: translateY(2rpx);
  opacity: 0.88;
}

.config-bar--prominent-share .config-bar__config-toggle:focus,
.config-bar--prominent-share .config-bar__config-toggle.config-bar__config-toggle--focused,
.config-bar--prominent-share .config-bar__share--prominent:focus,
.config-bar--prominent-share .config-bar__share--prominent.config-bar__share--focused {
  outline: 4rpx solid var(--uwo-color-accent-brass);
  outline-offset: 4rpx;
}
```

- [x] **Step 6: 執行元件測試並確認綠燈**

Run:

```powershell
npm test -- --run tests/architecture/fleet-shared-components.test.ts
```

Expected: PASS；現有默認摘要、展開內容、配置管理與事件契約全部保持通過。

- [x] **Step 7: 準備 Task 1 檢查點**

Run:

```powershell
git diff --check
git diff -- miniprogram/components/config-bar tests/architecture/fleet-shared-components.test.ts
```

Expected: 無空白錯誤；差異只包含 Property、突出分享分支、modifier 樣式和對應測試。不要提交，留待整體驗證後按倉庫門禁一次性請求提交確認。

### Task 2: 只在戰鬥配隊頁啟用新摘要

**Files:**
- Modify: `tests/pages/fleet-page.test.ts`
- Modify: `tests/pages/adventure-fleet-page.test.ts`
- Modify: `miniprogram/subpkg-fleet/pages/index/index.wxml`

**Interfaces:**
- Consumes: Task 1 的 `prominentShare: boolean` Property。
- Produces: 戰鬥頁 `prominent-share="{{true}}"` 接線；冒險頁保持默認 `false`。

- [x] **Step 1: 寫入失敗的頁面隔離測試**

在 `tests/pages/fleet-page.test.ts` 的共享元件結構測試附近加入：

```ts
it('只為戰鬥配隊頁啟用突出分享配置摘要', () => {
  expect(fleetWxml).toContain('prominent-share="{{true}}"')
  expect(fleetWxml).toMatch(/<config-bar[\s\S]*bind:share="onShareFleet"[\s\S]*\/>/)
  expect(fleetWxml).toContain('class="fleet-context"')
  expect(fleetWxml).toContain('class="ship-tabs"')
  expect(fleetWxml).toContain('<mode-tabs')
  expect(fleetWxml).toContain('class="slot-grid"')
})
```

在 `tests/pages/adventure-fleet-page.test.ts` 的共享元件結構測試附近加入：

```ts
it('冒險配隊頁保持默認配置摘要', () => {
  expect(adventureWxml).not.toContain('prominent-share=')
  expect(adventureWxml).toMatch(/<config-bar[\s\S]*bind:share="onShareFleet"[\s\S]*\/>/)
})
```

- [x] **Step 2: 執行頁面測試並確認紅燈**

Run:

```powershell
npm test -- --run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
```

Expected: 戰鬥頁測試因缺少 `prominent-share` 而 FAIL；冒險頁隔離測試 PASS。

- [x] **Step 3: 為戰鬥頁啟用變體**

在 `miniprogram/subpkg-fleet/pages/index/index.wxml` 的 `<config-bar>` 上，緊接 `share-status` 加入：

```wxml
prominent-share="{{true}}"
```

不要修改同一文件中的其他行；不要修改 `miniprogram/pages/adventure-fleet/index.wxml`。

- [x] **Step 4: 執行頁面測試並確認綠燈**

Run:

```powershell
npm test -- --run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
```

Expected: PASS；戰鬥頁啟用新摘要，冒險頁維持默認摘要，下方主要結構標記仍存在。

- [x] **Step 5: 執行全部定向測試**

Run:

```powershell
npm test -- --run tests/architecture/fleet-shared-components.test.ts tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
```

Expected: PASS。

- [x] **Step 6: 準備 Task 2 檢查點**

Run:

```powershell
git diff --check
git status --short
```

Expected: 只有計畫文件、三個 ConfigBar 文件、戰鬥頁 WXML 與三個測試文件有變更；冒險頁 WXML 沒有變更。不要提交，留待完整驗證後請求一次提交確認。

### Task 3: 微信 DevTools 視覺回歸與完整門禁

**Files:**
- Verify: `miniprogram/components/config-bar/index.wxml`
- Verify: `miniprogram/components/config-bar/index.wxss`
- Verify: `miniprogram/subpkg-fleet/pages/index/index.wxml`
- Verify: `miniprogram/pages/adventure-fleet/index.wxml`
- Artifact: `artifacts/miniprogram-review/battle-config-share-top-after.png`

**Interfaces:**
- Consumes: Task 1–2 完成的突出分享變體與戰鬥頁接線。
- Produces: 真實首屏截圖、交互驗證記錄及完整工程門禁結果。

- [x] **Step 1: 執行完整靜態門禁**

Run:

```powershell
npm run verify
```

Expected: format、lint、typecheck、Vitest、runtime-network、data check 與 generate check 全部 PASS。

- [x] **Step 2: 連接微信開發者工具並進入戰鬥配隊頁**

先使用倉庫既有診斷命令確認 CLI、服務端口和自動化端口，再以現有 `miniprogram-automator` 連接工作流重新進入：

```text
/subpkg-fleet/pages/index/index
```

Expected: `currentPage().path` 為 `subpkg-fleet/pages/index/index`，首幀完成渲染。

- [x] **Step 3: 驗證戰鬥頁摘要結構與事件隔離**

在 375px 左右模擬器視口依次驗證：

1. 左側第一行為「我的配置／尚未保存」，第二行為「未命名配置／0 套／向下箭頭」。
2. 右側實心按鈕顯示「分享」，位置與尺寸不受配置名稱影響。
3. 點擊左側配置入口後箭頭向上且展開內容出現。
4. 點擊分享按鈕後展開狀態不改變，分享流程只觸發一次。
5. 生成中顯示「生成中」且不可重複點擊；錯誤狀態顯示「重試」。

Expected: 所有狀態與文案符合設計規格。

- [x] **Step 4: 截圖並核對下方區域未變**

輸出：

```text
artifacts/miniprogram-review/battle-config-share-top-after.png
```

與修改前的 `artifacts/miniprogram-review/manual-fleet-top.png` 對比，確認只有配置摘要區發生布局變化；`fleet-context`、船隻 Tab、模式切換與船位網格保持原布局。

- [x] **Step 5: 驗證冒險頁與窄屏邊界**

- 進入冒險配隊頁，確認仍使用原有單行緊湊摘要。
- 在 320px、393px、430px 視口核對戰鬥頁：配置名稱只截斷自身；狀態、數量、箭頭及分享按鈕完整；不存在水平溢出。

Expected: 戰鬥頁四個視口通過，冒險頁沒有視覺回歸。

- [x] **Step 6: 整理提交前門禁資訊**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

列出全部變更文件、定向測試與 `npm run verify` 結果、DevTools 截圖及擬用 commit message：

```text
feat: 优化战斗配队配置与分享区
```

等待用戶確認後才執行提交。
