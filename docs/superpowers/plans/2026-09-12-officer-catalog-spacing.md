# 航海士名鑒列表密度調整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收緊航海士名鑒列表每行的垂直留白與技能圖標區間距，提升單屏資訊密度，同時保留技能圖標的 88rpx 操作熱區。

**Architecture:** 只在航海士名鑒頁的頁面級 WXSS 中調整既有 Token 值引用，不改 WXML 結構、資料或共享元件。行內距與技能區間距分別沿用 Design Foundation 的 `space-1`、`space-2` 和 `space-4`，使變更局部且可逆。

**Tech Stack:** 微信小程序 WXML/WXSS、Design Foundation CSS 自訂屬性、Prettier、ESLint、TypeScript、Vitest。

## Global Constraints

- 所有代碼註釋、文檔與回覆使用中文；必要的文件名、命令與 API 保留英文。
- 不修改 `archive/`、`data/master/` 或 `miniprogram/generated/`。
- 不在 `miniprogram/` 新增遠程請求、`wx.request`、`wx.cloud` 或 Node.js Runtime API。
- 不新增、刪除或升級依賴。
- 修改 WXSS 時只使用 Design Foundation 間距序列：`space-1=4rpx`、`space-2=8rpx`、`space-4=16rpx`。
- 保留每個技能圖標外層至少 `88rpx × 88rpx` 的操作熱區，不改共享 `skill-icon` 元件。
- 本次工作分支為 `codex/phase-1-officer-catalog-spacing`；不直接在 `main` 分支開發。
- 提交前展示變更文件、驗證結果與擬用 commit message，等待用戶確認後才提交。

---

### Task 1: 收緊航海士行與技能圖標區間距

**Files:**
- Modify: `miniprogram/pages/catalog/index.wxss:117-264`
- Test: 以 `git diff --check`、`npm run verify` 與微信小程序 DevTools 的視覺檢查驗證；本次不新增邏輯測試。

**Interfaces:**
- Consumes: 現有 `.catalog-page__officer-row`、`.catalog-page__officer-skills`、`.catalog-page__skill-hit-target`、`.catalog-page__skill-more`、`.catalog-page__skill-divider` 樣式與 Design Foundation 間距 Token。
- Produces: 航海士行上下 `8rpx`、左右 `16rpx` 的內距；技能區與資料區 `4rpx` 上間距；圖標相鄰、更多標記與組間分隔使用 `4rpx` 留白；原有圖標尺寸、橫向滾動與操作熱區保持不變。

- [x] **Step 1: 修改頁面級 WXSS 的密度相關值**

  在 `.catalog-page__officer-row` 中將 `min-height` 從 `132rpx` 調整為 `124rpx`，將 `padding` 改為：

  ```css
  min-height: 124rpx;
  padding: var(--uwo-space-2) var(--uwo-space-4);
  ```

  並將以下非必要間距改為 `var(--uwo-space-1)`：

  ```css
  .catalog-page__officer-skills { margin-top: var(--uwo-space-1); }
  .catalog-page__skill-hit-target { margin-right: var(--uwo-space-1); }
  .catalog-page__skill-more { margin-right: var(--uwo-space-1); }
  .catalog-page__skill-divider { margin: 0 var(--uwo-space-1); }
  ```

  不修改 `.catalog-page__skill-hit-target` 的 `88rpx` 寬高、`.skill-icon` 尺寸或任何事件綁定。

- [x] **Step 2: 檢查變更邊界與格式**

  執行：

  ```powershell
  git diff --check
  git status --short
  git diff -- miniprogram/pages/catalog/index.wxss
  ```

  預期：只出現本任務的設計／計劃文檔與 `miniprogram/pages/catalog/index.wxss`，WXSS 變更只落在上述選擇器；根目錄原有未提交修改不應出現在此隔離工作區。

- [x] **Step 3: 執行專案驗證**

  執行：

  ```powershell
  npm run verify
  ```

  預期：`format:check`、`lint`、`typecheck`、測試、runtime network、package size、UI asset、asset manifest、data check 與 generate check 全部通過；若環境工具鏈在 Node 版本上僅產生既有警告，需在結果中明確記錄。

- [ ] **Step 4: 進行 UI 驗收**

  在微信小程序 DevTools 中檢查航海士名鑒頁的 320px、375px、393px、430px 寬度：

  1. 每行上下留白較現況收窄，104rpx 頭像、名稱、職業／性別和技能圖標不裁切。
  2. 技能圖標之間更緊湊，主動／被動分隔線仍可辨識。
  3. 圖標仍可獨立點擊查看技能詳情，橫向滾動行為不變。
  4. 列表無新增頁面級橫向溢出。

- [ ] **Step 5: 回報結果並等待提交確認**

  展示變更文件、`npm run verify` 和 `git diff --check` 結果、DevTools 驗收結果，以及擬用 message：

  ```text
  fix: tighten officer catalog row spacing
  ```

  未獲用戶確認前不執行 `git commit`。
