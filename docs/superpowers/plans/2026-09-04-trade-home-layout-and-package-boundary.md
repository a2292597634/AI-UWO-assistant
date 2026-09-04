# 交易品首頁布局與交易分包邊界修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓首頁交易入口以三欄網格顯示在第二行第一列，並將交易查詢運行時程式放入 `subpkg-trade`，消除微信開發者工具列出的主包未使用交易 JS。

**Architecture:** 首頁只調整 `modules` 順序、入口文案和主要網格寬度；「資料維護」仍保留現有次級入口。交易查詢、月份計算、季節矩陣和 Presenter 都由 `miniprogram/subpkg-trade/` 擁有，交易頁面透過分包內相對引用載入它們；共用型別契約仍放在 `miniprogram/contracts/`，不產生運行時 JS。

**Tech Stack:** TypeScript、微信小程序 WXML/WXSS、Vitest、Prettier、ESLint、TypeScript compiler、微信分包配置。

## Global Constraints

- 涉及 UI、WXML 或 WXSS 的任務，編碼前必須完整閱讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
- 首頁主要功能固定每行 3 個，交易入口必須是第 4 個主要功能，位於第二行第一列。
- 交易入口名稱固定為「交易品淡旺季查询」；「資料維護」維持次級入口。
- 交易運行時程式只能存在於 `miniprogram/subpkg-trade/`，不得用 `packOptions.ignore` 掩蓋錯誤依賴。
- 不修改 `archive/`、`data/master/`、貿易品生成資料、Cloud Function 或既有資料結構。
- 不新增依賴、遠程 URL、`wx.request`、`wx.cloud` 或 Node.js Runtime API 到小程序運行代碼。
- 遵循 TDD：先寫會失敗的契約測試，再移動程式與調整首頁。
- 本輪不處理微信代碼質量檢查中的整體 `1.5MB` 主包大小問題；該問題需要另行評估其他大型生成資料的分包策略。

---

### Task 1: 建立首頁布局與交易分包邊界的失敗測試

**Files:**
- Modify: `tests/pages/home-page.test.ts`
- Modify: `tests/integration/trade-feature-contract.test.ts`

**Interfaces:**
- Consumes: 現有首頁 `Page` 配置、WXML/WXSS 靜態內容和交易功能整合契約。
- Produces: 能明確指出舊四欄布局、舊交易名稱和交易運行時仍在主包根目錄的失敗測試。

- [ ] **Step 1: Write the failing test**

在 `tests/pages/home-page.test.ts` 將首頁主要模組順序與交易入口斷言改為：

```ts
expect(homePage.data.modules.map((module) => module.id)).toEqual([
  'officer-catalog',
  'battle-fleet',
  'adventure-fleet',
  'trade-goods',
  'data-maintenance',
])
expect(homePage.data.modules[3]).toMatchObject({
  name: '交易品淡旺季查询',
  route: '/subpkg-trade/pages/index/index',
})
expect(homeWxss).toMatch(/width:\s*33\.333333%/)
```

在 `tests/integration/trade-feature-contract.test.ts` 增加分包邊界契約：

```ts
it('keeps trade-only runtime sources inside the trade subpackage', () => {
  const tradeRoot = path.resolve('miniprogram/subpkg-trade')
  const mainRoot = path.resolve('miniprogram')
  const tradeSources = [
    'domain/game-month.ts',
    'domain/trade-query.ts',
    'domain/trade-season.ts',
    'presenters/trade-season-presenter.ts',
  ]

  expect(tradeSources.every((file) => fs.existsSync(path.join(tradeRoot, file)))).toBe(true)
  expect(tradeSources.every((file) => !fs.existsSync(path.join(mainRoot, file)))).toBe(true)
})
```

同時把此整合測試對 `buildTradePortMatrix` 的 import 路徑改成預期的新分包路徑：
`../../miniprogram/subpkg-trade/domain/trade-season`。

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm.cmd test -- tests/pages/home-page.test.ts tests/integration/trade-feature-contract.test.ts
```

Expected: FAIL；首頁目前仍是舊模組順序、`貿易品` 文案與 `25%` 寬度，且新的交易分包源檔尚不存在。

### Task 2: 移動交易運行時程式並修正相對引用

**Files:**
- Create: `miniprogram/subpkg-trade/domain/game-month.ts`
- Create: `miniprogram/subpkg-trade/domain/trade-query.ts`
- Create: `miniprogram/subpkg-trade/domain/trade-season.ts`
- Create: `miniprogram/subpkg-trade/presenters/trade-season-presenter.ts`
- Delete: `miniprogram/domain/game-month.ts`
- Delete: `miniprogram/domain/trade-query.ts`
- Delete: `miniprogram/domain/trade-season.ts`
- Delete: `miniprogram/presenters/trade-season-presenter.ts`
- Modify: `miniprogram/subpkg-trade/pages/index/index.ts`
- Modify: `miniprogram/subpkg-trade/pages/detail/index.ts`
- Modify: `tests/domain/game-month.test.ts`
- Modify: `tests/domain/trade-query.test.ts`
- Modify: `tests/domain/trade-season.test.ts`
- Modify: `tests/presenters/trade-season-presenter.test.ts`
- Modify: `tests/integration/trade-feature-contract.test.ts`

**Interfaces:**
- Consumes: Task 1 的分包邊界測試和既有交易域函式簽名。
- Produces: `subpkg-trade` 內可直接使用的 `gameMonthAt`、`queryTradeGoods`、`buildTradePortMatrix`、`presentTradeDetail` 及 `TradeDetailPageState`。

- [ ] **Step 1: Write the minimal implementation**

將原有 4 個交易運行時檔案原樣移入分包，只調整跨目錄型別引用：

```ts
// miniprogram/subpkg-trade/domain/trade-query.ts
import type { RuntimeTradeGoodIndexEntry } from '../../contracts/runtime-data'

// miniprogram/subpkg-trade/domain/trade-season.ts
import type { RuntimeTradeGoodDetail, RuntimeTradeReference } from '../../contracts/runtime-data'

// miniprogram/subpkg-trade/presenters/trade-season-presenter.ts
import { buildTradePortMatrix } from '../domain/trade-season'
import type { RuntimeTradeGoodDetail, RuntimeTradeReference } from '../../contracts/runtime-data'
```

同步把交易頁面引用調整為分包內路徑：

```ts
// subpkg-trade/pages/index/index.ts
import { queryTradeGoods } from '../../domain/trade-query'

// subpkg-trade/pages/detail/index.ts
import { gameMonthAt } from '../../domain/game-month'
import { presentTradeDetail } from '../../presenters/trade-season-presenter'
import type { TradeDetailPageState } from '../../presenters/trade-season-presenter'
```

測試檔案的 import 同步指向 `miniprogram/subpkg-trade/domain/` 或 `miniprogram/subpkg-trade/presenters/`；保留測試案例和公開函式簽名不變。

- [ ] **Step 2: Run tests to verify the trade boundary passes**

Run:

```powershell
npm.cmd test -- tests/domain/game-month.test.ts tests/domain/trade-query.test.ts tests/domain/trade-season.test.ts tests/presenters/trade-season-presenter.test.ts tests/pages/trade-page.test.ts tests/pages/trade-detail-page.test.ts tests/integration/trade-feature-contract.test.ts
```

Expected: PASS；交易查詢、季節矩陣、月份換算、搜尋頁、詳情頁和分包邊界測試全部通過。

### Task 3: 實施首頁三欄布局與交易入口文案

**Files:**
- Modify: `miniprogram/pages/home/index.ts`
- Modify: `miniprogram/pages/home/index.wxss`
- Modify: `tests/pages/home-page.test.ts`

**Interfaces:**
- Consumes: 現有首頁 `modules`、`onModuleTap` 路由事件和 `module-grid` 樣式。
- Produces: 四個主要入口按三欄排列，交易入口是第二行第一項，資料維護次級入口和既有功能不變。

- [ ] **Step 1: Write the minimal implementation**

將 `modules` 前 4 項排列為：

```ts
[
  { id: 'officer-catalog', name: '航海士名鑑', ... },
  { id: 'battle-fleet', name: '戰鬥模擬艦隊', ... },
  { id: 'adventure-fleet', name: '冒險模擬艦隊', ... },
  { id: 'trade-goods', name: '交易品淡旺季查询', ... },
]
```

只把主要網格項目寬度改為三等分：

```wxss
.module-grid__item {
  width: 33.333333%;
}
```

不修改次級資料維護卡片的寬度、提示文字、圖標錯誤回退或路由。

- [ ] **Step 2: Run the homepage tests**

Run:

```powershell
npm.cmd test -- tests/pages/home-page.test.ts tests/integration/trade-feature-contract.test.ts
```

Expected: PASS；首頁順序、名稱、路由、三欄寬度和交易分包入口契約均通過。

### Task 4: 完成門禁驗證並檢查提交範圍

**Files:**
- Verify: `miniprogram/pages/home/index.ts`
- Verify: `miniprogram/pages/home/index.wxss`
- Verify: `miniprogram/subpkg-trade/`
- Verify: `tests/`

**Interfaces:**
- Consumes: Tasks 1–3 的測試與程式碼。
- Produces: 可供微信開發者工具重新編譯的乾淨主包/交易分包邊界，以及完整驗證證據。

- [ ] **Step 1: Run targeted checks**

Run:

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run check:runtime-network
npm.cmd run check:miniprogram-size
git diff --check
```

Expected: 全部 PASS；`check:miniprogram-size` 不再把交易源檔計入主包，且 `runtime-network` 不發現新增網路邊界違規。

- [ ] **Step 2: Run the full verification suite**

Run:

```powershell
npm.cmd run verify
```

Expected: 全部 PASS；包括所有既有測試、資料檢查、資源清單檢查與生成一致性檢查。若主工作區本地 `miniprogram/project.private.config.json` 仍使主包大小與乾淨工作樹不同，保留該私有配置不動，分別記錄結果。

- [ ] **Step 3: Review the final diff**

Run:

```powershell
git status --short
git diff --stat
git diff --name-status
```

Expected: 只有首頁布局/文案、交易運行時分包引用、對應測試與本計劃文件的變更；沒有 `data/master/`、`archive/`、生成資料或依賴變更。

- [ ] **Step 4: Commit after user confirmation**

待向用戶展示變更文件、驗證結果與擬用 message 並獲得確認後執行：

```powershell
git add -- miniprogram tests docs/superpowers/plans/2026-09-04-trade-home-layout-and-package-boundary.md
git commit -m "fix(trade): 修正交易程式分包邊界與首頁入口布局"
```
