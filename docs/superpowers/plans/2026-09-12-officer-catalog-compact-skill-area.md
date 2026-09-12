# 航海士名鑒技能區緊湊化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將航海士名鑒頁技能區從 88rpx 操作盒壓縮為 64rpx，降低行高與圖標空白，同時保留 44rpx 視覺圖標和技能點擊行為。

**Architecture:** 只修改名鑒頁 WXSS 與該頁既有靜態契約測試。技能入口尺寸局部調整，不修改共享元件、WXML 結構或全局 Design Foundation；此局部例外已由使用者明確接受。

**Tech Stack:** 微信小程序 WXML/WXSS、Design Foundation CSS 自訂屬性、Vitest、Prettier、ESLint、TypeScript。

## Global Constraints

- 所有代碼註釋、文檔與回覆使用中文；必要的文件名、命令與 API 保留英文。
- 不修改 `archive/`、`data/master/` 或 `miniprogram/generated/`。
- 不在 `miniprogram/` 新增遠程請求、`wx.request`、`wx.cloud` 或 Node.js Runtime API。
- 不新增、刪除或升級依賴。
- 新增或修改間距只使用 Design Foundation Token；本次使用 `--uwo-space-1`。
- 不修改共享 `skill-icon` 元件；圖標視覺尺寸維持 44rpx。
- 不修改 WXML 結構；保留 `role="button"`、技能詳情 aria-label 與 `catchtap="onSkillIconTap"`。
- 本次技能入口 64rpx 是名鑒頁局部緊湊例外，不將其擴散到其他頁面。
- 本次工作分支為 `codex/phase-2-officer-catalog-compact`；不直接在 `main` 分支開發。
- 提交前展示變更文件、驗證結果與擬用 commit message，等待用戶確認後才提交。

---

### Task 1: 更新名鑒技能入口尺寸契約

**Files:**
- Modify: `tests/pages/catalog-page.test.ts:464-477`
- Test: `tests/pages/catalog-page.test.ts`

**Interfaces:**
- Consumes: 現有名鑒頁 WXML 的技能入口事件與 aria 契約。
- Produces: 名鑒頁技能入口尺寸為 64rpx 的可重跑靜態契約，並繼續要求技能入口可點擊。

- [x] **Step 1: 將測試契約改為 64rpx**

  將測試名稱從「88rpx catchtap target」改為「64rpx compact catchtap target」，並把下列 CSS 契約的四個 `88rpx` 期望改為 `64rpx`：

  ```ts
  expect(cssRule('.catalog-page__skill-hit-target')).toMatch(/min-width:\s*64rpx;/)
  expect(cssRule('.catalog-page__skill-hit-target')).toMatch(/width:\s*64rpx;/)
  expect(cssRule('.catalog-page__skill-hit-target')).toMatch(/min-height:\s*64rpx;/)
  expect(cssRule('.catalog-page__skill-hit-target')).toMatch(/height:\s*64rpx;/)
  ```

- [x] **Step 2: 執行 RED 驗證**

  執行：

  ```powershell
  npm test -- tests/pages/catalog-page.test.ts
  ```

  預期：測試失敗，且失敗原因是現有 `miniprogram/pages/catalog/index.wxss` 仍宣告 `.catalog-page__skill-hit-target` 為 88rpx；不可因測試錯誤或模組載入錯誤而失敗。

### Task 2: 實作緊湊技能區

**Files:**
- Modify: `miniprogram/pages/catalog/index.wxss:220-264`
- Test: `tests/pages/catalog-page.test.ts`

**Interfaces:**
- Consumes: Task 1 的 64rpx 名鑒頁尺寸契約。
- Produces: `.catalog-page__officer-skills`、`.catalog-page__officer-skills-content` 與 `.catalog-page__skill-hit-target` 以 64rpx 形成更短的技能區；`skill-icon` 仍為 44rpx。

- [x] **Step 1: 修改技能滾動區與內容軌道高度**

  將以下兩個選擇器的 `height` 從 `88rpx` 改為 `64rpx`：

  ```css
  .catalog-page__officer-skills {
    height: 64rpx;
  }

  .catalog-page__officer-skills-content {
    height: 64rpx;
  }
  ```

- [x] **Step 2: 修改單個技能入口的寬高**

  將 `.catalog-page__skill-hit-target` 的 `min-width`、`flex-basis`、`width`、`min-height` 和 `height` 統一改為 `64rpx`，保留 `margin-right: var(--uwo-space-1)`；不修改 `skill-icon` 元件。

- [x] **Step 3: 執行 GREEN 驗證**

  執行：

  ```powershell
  npm test -- tests/pages/catalog-page.test.ts
  ```

  預期：名鑒頁契約測試通過，包含 64rpx 尺寸、技能 aria-label、`catchtap` 事件與共享 `skill-icon` 註冊契約。

### Task 3: 完整驗證與交付檢查

**Files:**
- Verify: `miniprogram/pages/catalog/index.wxss`
- Verify: `tests/pages/catalog-page.test.ts`

- [x] **Step 1: 執行格式、邊界與完整驗證**

  執行：

  ```powershell
  git diff --check
  npm run verify
  ```

  預期：格式、Lint、型別、測試、runtime network、包體積、素材、資料與生成一致性全部通過；生成檢查不得產生本次範圍外的變更。

- [ ] **Step 2: 執行 DevTools 視覺驗收**

  在微信小程序 DevTools 以 320px、375px、393px、430px 寬度檢查航海士名鑒：

  1. 航海士卡片高度較目前版本縮短，頭像下方空白明顯減少。
  2. 技能圖標仍保持約 44rpx 視覺尺寸，圖標直接空隙縮小。
  3. 主動／被動分隔線清楚，技能橫向滾動與點擊查看詳情不變。
  4. 無新增頁面級橫向溢出或重要文字裁切。

- [ ] **Step 3: 回報並等待提交確認**

  展示變更文件、驗證結果、DevTools 結果與擬用 message：

  ```text
  fix: compact officer catalog skill spacing
  ```

  未獲用戶確認前不執行 `git commit`。
