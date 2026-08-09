# Design Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可被後續 Agent 強制發現、由單一 WXSS 來源提供的 Design Token、全局排版、按鈕與狀態基礎，不改變既有頁面業務或互動流程。

**Architecture:** `AGENTS.md` 與 `CLAUDE.md` 負責在 UI 任務開始時觸發權威設計規格；`miniprogram/app.wxss` 只引入 `miniprogram/styles/design-foundation.wxss`，由該文件集中定義 Token、全局基礎規則和 opt-in BEM 類別；一個 Vitest 靜態契約同時保護入口連結和樣式規範。

**Tech Stack:** 微信小程序 WXSS、CSS 自訂屬性、TypeScript、Vitest；不新增依賴或運行時 API。

## Global Constraints

- 編碼前完整閱讀 `AGENTS.md`、`CLAUDE.md`、`docs/audits/2026-08-09-ui-ux-final-audit.md`、Phase 2 設計／計畫與 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
- 工作分支固定為 `codex/phase-3-design-foundation`，基線為 `origin/main` 的 `1df6d97`。
- 所有 UI 文案、程式碼註釋、測試和文件使用中文；必要專有名詞與 API 名稱保留英文。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`、Cloud Function、Controller、Presenter、Domain 或 Solver。
- 不新增、刪除或升級依賴，不新增 `wx.request`、`wx.cloud`、遠程 URL 或 Node.js Runtime API。
- 不抽取 P4 共享元件，不修改既有頁面 WXML 或頁面 WXSS，不批量替換歷史硬編碼樣式。
- 本階段只有全局背景、正文色、系統無襯線字體、盒模型與字體繼承立即生效；按鈕、狀態及展示性襯線字體皆為 opt-in。
- 重要操作熱區至少 `88rpx`，操作文字不小於 `22rpx`；狀態必須配合文字或圖形語義，不能只依賴顏色。
- 未經使用者確認不執行 `git commit`；完成後先展示變更文件、驗證結果、DevTools 結果與擬用 Commit Message。

---

## File Map

- Create: `docs/superpowers/plans/2026-08-09-design-foundation.md` — 本實施計畫。
- Create: `docs/superpowers/specs/2026-08-09-design-foundation-design.md` — 已批准的權威 Design Foundation。
- Modify: `AGENTS.md` — 加入 UI／WXML／WXSS 強制閱讀入口。
- Modify: `CLAUDE.md` — 加入相同觸發入口。
- Create: `tests/architecture/design-foundation.test.ts` — 靜態架構契約。
- Create: `miniprogram/styles/design-foundation.wxss` — Token 與基礎樣式唯一來源。
- Modify: `miniprogram/app.wxss` — 只引入 Design Foundation。

---

### Task 1: 以紅燈契約鎖定入口與樣式要求

**Files:**
- Create: `tests/architecture/design-foundation.test.ts`
- Inspect: `AGENTS.md`
- Inspect: `CLAUDE.md`
- Inspect: `miniprogram/app.wxss`

**Interfaces:**
- Consumes: 權威規格路徑 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
- Produces: 一組對文檔入口、13 個色彩 Token、字體、尺寸、按鈕和狀態類別的靜態契約。

- [ ] **Step 1: 建立文件讀取與 Token fixture**

建立測試文件，使用 Node.js 測試環境讀取倉庫文件：

```ts
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const readProjectFile = (relativePath: string): string => {
  const target = resolve(ROOT, relativePath)
  return existsSync(target) ? readFileSync(target, 'utf8') : ''
}

const SPEC_PATH = 'docs/superpowers/specs/2026-08-09-design-foundation-design.md'
const COLOR_TOKENS = {
  '--uwo-color-canvas': '#e7deca',
  '--uwo-color-surface': '#f5efe0',
  '--uwo-color-surface-muted': '#e8dfce',
  '--uwo-color-ink': '#26332f',
  '--uwo-color-text-primary': '#292a26',
  '--uwo-color-text-secondary': '#625947',
  '--uwo-color-accent-brass': '#b99552',
  '--uwo-color-accent-text': '#76501a',
  '--uwo-color-success': '#596257',
  '--uwo-color-warning': '#7a541c',
  '--uwo-color-danger': '#8b3a3a',
  '--uwo-color-border-subtle': '#c8bda4',
  '--uwo-color-border-strong': '#8c7e63',
} as const
```

- [ ] **Step 2: 寫 Agent 觸發入口的失敗測試**

```ts
describe('Design Foundation 文件入口', () => {
  it.each(['AGENTS.md', 'CLAUDE.md'])('%s 在 UI 編碼前強制讀取同一份規格', (file) => {
    const content = readProjectFile(file)
    expect(content).toContain(SPEC_PATH)
    expect(content).toMatch(/UI.*WXML.*WXSS/s)
    expect(content).toMatch(/編碼前.*完整閱讀|编码前.*完整阅读/s)
  })
})
```

- [ ] **Step 3: 寫單一來源、Token 與全局字體的失敗測試**

```ts
describe('Design Foundation 全局入口與 Token', () => {
  it('app.wxss 只引入唯一基礎樣式來源', () => {
    expect(readProjectFile('miniprogram/app.wxss').trim()).toMatch(
      /^@import\s+['"]\.\/styles\/design-foundation\.wxss['"];$/,
    )
  })

  it('定義全部指定色彩 Token', () => {
    const foundation = readProjectFile('miniprogram/styles/design-foundation.wxss')
    for (const [token, value] of Object.entries(COLOR_TOKENS)) {
      expect(foundation).toContain(`${token}: ${value};`)
    }
  })

  it('正文使用無襯線字體，襯線字體只由展示類別 opt-in', () => {
    const foundation = readProjectFile('miniprogram/styles/design-foundation.wxss')
    expect(foundation).toContain('--uwo-font-family-body:')
    expect(foundation).toContain('--uwo-font-family-display:')
    expect(foundation).toMatch(/page\s*{[^}]*font-family:\s*var\(--uwo-font-family-body\)/s)
    expect(foundation).toMatch(
      /\.ui-display-title\s*{[^}]*font-family:\s*var\(--uwo-font-family-display\)/s,
    )
  })
})
```

- [ ] **Step 4: 寫按鈕、狀態與尺寸的失敗測試**

測試必須逐一斷言：

```ts
const foundation = readProjectFile('miniprogram/styles/design-foundation.wxss')
expect(foundation).toMatch(/\.ui-button\s*{[^}]*min-height:\s*88rpx/s)
expect(foundation).toContain('--uwo-font-size-minimum-action: 22rpx;')
expect(foundation).toContain('--uwo-font-size-body: 26rpx;')

for (const className of [
  '.ui-button--primary',
  '.ui-button--secondary',
  '.ui-button--danger',
  '.ui-button--disabled',
  '.ui-button--pressed',
  '.ui-button--focused',
  '.ui-status--achieved',
  '.ui-status--unmet',
  '.ui-status--review',
  '.ui-status--error',
]) {
  expect(foundation).toContain(className)
}

expect(foundation).toContain('.ui-button[disabled]')
expect(foundation).toContain('.ui-button:active')
expect(foundation).toContain('.ui-button:focus')
```

- [ ] **Step 5: 執行測試確認預期紅燈**

Run: `npm.cmd test -- tests/architecture/design-foundation.test.ts`

Expected: FAIL，原因依序包含兩份入口文件尚未引用規格、`design-foundation.wxss` 尚不存在，以及 `app.wxss` 尚未改為唯一 import。

---

### Task 2: 建立 Agent 強制入口

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Test: `tests/architecture/design-foundation.test.ts`

**Interfaces:**
- Consumes: `SPEC_PATH`。
- Produces: 所有 UI／WXML／WXSS 任務在編碼前的強制閱讀規則。

- [ ] **Step 1: 更新 AGENTS.md**

在 TDD 章節後新增：

```md
## 5. Design Foundation

涉及 UI、WXML 或 WXSS 的任務，編碼前必須完整閱讀
`docs/superpowers/specs/2026-08-09-design-foundation-design.md`。

新增或修改樣式必須遵守其中的 Token、字體、間距、圓角、陰影、狀態、按鈕、觸控和安全區規範。
```

- [ ] **Step 2: 更新 CLAUDE.md**

在「觸發式參考文檔」後加入相同語義的強制章節，保留簡體中文風格：

```md
## Design Foundation

涉及 UI、WXML 或 WXSS 的任务，编码前必须完整阅读
`docs/superpowers/specs/2026-08-09-design-foundation-design.md`。

新增或修改样式必须遵守其中的 Token、字体、间距、圆角、阴影、状态、按钮、触控和安全区规范。
```

- [ ] **Step 3: 執行入口 focused test**

Run: `npm.cmd test -- tests/architecture/design-foundation.test.ts -t "文件入口"`

Expected: PASS；兩份根目錄指引都指向同一權威規格。其餘樣式測試仍保持紅燈。

---

### Task 3: 建立單一來源 Token 與全局基礎 WXSS

**Files:**
- Create: `miniprogram/styles/design-foundation.wxss`
- Modify: `miniprogram/app.wxss`
- Test: `tests/architecture/design-foundation.test.ts`

**Interfaces:**
- Produces: `--uwo-*` Token、全局 `page` 基礎規則、`.ui-display-title`、`.ui-button*` 與 `.ui-status*`。
- Consumers: `app.wxss` 和後續 P4／頁面 Change。

- [ ] **Step 1: 建立 Token 與全局基礎規則**

`design-foundation.wxss` 的 `page` 先集中定義：

```css
page {
  --uwo-color-canvas: #e7deca;
  --uwo-color-surface: #f5efe0;
  --uwo-color-surface-muted: #e8dfce;
  --uwo-color-ink: #26332f;
  --uwo-color-text-primary: #292a26;
  --uwo-color-text-secondary: #625947;
  --uwo-color-accent-brass: #b99552;
  --uwo-color-accent-text: #76501a;
  --uwo-color-success: #596257;
  --uwo-color-warning: #7a541c;
  --uwo-color-danger: #8b3a3a;
  --uwo-color-border-subtle: #c8bda4;
  --uwo-color-border-strong: #8c7e63;

  --uwo-font-family-body: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC",
    "Microsoft JhengHei", sans-serif;
  --uwo-font-family-display: Georgia, "Times New Roman", "Noto Serif TC", "PMingLiU", serif;
  --uwo-font-size-page-title: 40rpx;
  --uwo-font-size-section-title: 32rpx;
  --uwo-font-size-emphasis: 28rpx;
  --uwo-font-size-body: 26rpx;
  --uwo-font-size-supporting: 24rpx;
  --uwo-font-size-minimum-action: 22rpx;

  --uwo-space-1: 4rpx;
  --uwo-space-2: 8rpx;
  --uwo-space-3: 12rpx;
  --uwo-space-4: 16rpx;
  --uwo-space-6: 24rpx;
  --uwo-space-8: 32rpx;
  --uwo-space-12: 48rpx;

  --uwo-radius-control: 10rpx;
  --uwo-radius-card: 16rpx;
  --uwo-radius-sheet: 28rpx;
  --uwo-radius-pill: 999rpx;
  --uwo-shadow-elevated: 0 12rpx 32rpx rgba(38, 51, 47, 0.18);
  --uwo-shadow-sheet: 0 -12rpx 32rpx rgba(38, 51, 47, 0.16);

  min-height: 100%;
  background: var(--uwo-color-canvas);
  color: var(--uwo-color-text-primary);
  font-family: var(--uwo-font-family-body);
}
```

保留既有 `border-box` reset，加入 `textarea`，並只讓 `button`、`input`、`textarea` 繼承字體；不做全局 margin、padding 或 display reset。

- [ ] **Step 2: 建立展示標題與按鈕基礎**

實作 `.ui-display-title` 及按鈕：

```css
.ui-display-title {
  font-family: var(--uwo-font-family-display);
}

.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  padding: 0 var(--uwo-space-8);
  border: 2rpx solid transparent;
  border-radius: var(--uwo-radius-control);
  font-family: var(--uwo-font-family-body);
  font-size: var(--uwo-font-size-body);
  font-weight: 600;
  line-height: 1.35;
  text-align: center;
  white-space: normal;
}

.ui-button::after {
  border: 0;
}
```

主要按鈕使用 `ink/surface`，次要按鈕使用 `surface/text-primary/border-strong`，危險按鈕使用 `danger/surface`。

- [ ] **Step 3: 建立禁用、按下與焦點狀態**

實作原生和可測試類別兩種入口：

```css
.ui-button:active,
.ui-button--pressed {
  opacity: 0.88;
  transform: translateY(2rpx);
}

.ui-button:focus,
.ui-button--focused {
  outline: 4rpx solid var(--uwo-color-accent-brass);
  outline-offset: 4rpx;
}

.ui-button[disabled],
.ui-button--disabled {
  border-color: var(--uwo-color-border-subtle);
  background: var(--uwo-color-surface-muted);
  color: var(--uwo-color-text-secondary);
  opacity: 1;
}

.ui-button[disabled]:active,
.ui-button--disabled.ui-button--pressed {
  opacity: 1;
  transform: none;
}
```

- [ ] **Step 4: 建立狀態結構與四種語義**

```css
.ui-status {
  display: inline-flex;
  align-items: center;
  min-height: 44rpx;
  padding: var(--uwo-space-1) var(--uwo-space-3);
  border: 2rpx solid currentColor;
  border-radius: var(--uwo-radius-pill);
  background: var(--uwo-color-surface-muted);
  font-size: var(--uwo-font-size-minimum-action);
  font-weight: 600;
  line-height: 1.4;
}

.ui-status__label {
  color: inherit;
}

.ui-status--achieved {
  color: var(--uwo-color-success);
}

.ui-status--unmet,
.ui-status--review {
  color: var(--uwo-color-warning);
}

.ui-status--error {
  color: var(--uwo-color-danger);
}
```

可見文案由 WXML 提供；規格要求使用「已達成」「未達成／尚差 Lv.N」「需復核」「錯誤／失敗原因」，P3 不新增 Emoji 或圖標資產。

- [ ] **Step 5: 將 app.wxss 收斂為唯一 import**

```css
@import './styles/design-foundation.wxss';
```

- [ ] **Step 6: 執行 focused contract 確認綠燈**

Run: `npm.cmd test -- tests/architecture/design-foundation.test.ts`

Expected: PASS；入口、Token、字體、按鈕、狀態和最小熱區全部符合規格。

- [ ] **Step 7: 執行格式與架構回歸**

Run: `npm.cmd exec prettier -- --write AGENTS.md CLAUDE.md docs/superpowers/specs/2026-08-09-design-foundation-design.md docs/superpowers/plans/2026-08-09-design-foundation.md miniprogram/app.wxss miniprogram/styles/design-foundation.wxss tests/architecture/design-foundation.test.ts`

Run: `npm.cmd test -- tests/architecture`

Expected: Prettier 只處理 P3 文件；架構測試全部 PASS。

---

### Task 4: 完整驗證、DevTools 驗收與提交前停點

**Files:**
- Inspect: 所有 P3 變更文件
- Do not modify: 既有頁面 WXML、頁面 WXSS、Controller、Presenter、Domain、Solver、資料與 Cloud Function

- [ ] **Step 1: 執行完整門禁**

Run: `npm.cmd run verify`

Expected: exit code 0；format、lint、typecheck、889 項既有測試加 P3 新測試、runtime-network、package size、UI assets、asset manifest、data:check 與 generate:check 全部通過。

- [ ] **Step 2: 檢查範圍與工作樹**

Run: `git diff --check`

Run: `git status --short`

Run: `git diff --name-only -- archive data/master miniprogram/generated cloudfunctions miniprogram/pages miniprogram/components miniprogram/subpkg-detail/pages miniprogram/domain miniprogram/presenters`

Expected: 禁止目錄無變更；變更只包含 File Map 列出的七個文件。

- [ ] **Step 3: 使用微信 DevTools 驗收六個指定區域**

在微信 DevTools 載入 worktree 的 `project.config.json`，逐一檢查首頁、資料頁、詳情頁、戰鬥配隊、冒險配隊及技能 Sheet。

每個區域至少驗證：

- 320px、375px、393px、430px 四種寬度；
- 無新增頁面級橫向溢出；
- 系統無襯線字體、`canvas` 背景和 `text-primary` 正文色生效；
- 長文字沒有新增裁切或遮擋；
- 固定底部與 Sheet 的既有安全區行為沒有回退；
- P3 基礎按鈕規則在樣式檢查中顯示 `min-height: 88rpx`，並存在禁用、按下和焦點樣式；
- 既有頁面尚未採用 `.ui-button`／`.ui-status` 的熱區或狀態缺口如實記錄，不在 P3 擴大修改。

- [ ] **Step 4: 保存驗收記錄**

在最終回報中以矩陣逐項記錄六個區域在 320px、375px、393px、430px 的通過／失敗結果，以及橫向溢出、安全區、長文字和既有未採用基礎類別的備註；不得以「已檢查」代替實際結果，也不新增大型截圖或視覺素材。

- [ ] **Step 5: 提交前停止，不執行 commit**

向使用者展示：

1. 變更文件與 diff 摘要；
2. focused tests、架構測試和 `npm run verify` 實際結果；
3. DevTools 六個區域、四種寬度、橫向溢出、安全區、按鈕熱區與長文字結果；
4. 擬用 Commit Message：`feat: 建立全局 Design Foundation`。

等待使用者明確確認後才執行 `git commit`。
