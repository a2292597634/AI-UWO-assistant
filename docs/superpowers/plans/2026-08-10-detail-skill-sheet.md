# P9 詳情與技能面板收口實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目標：** 收緊詳情頁技能區與技能 Sheet 的視覺層級、觸控熱區和安全區，同時維持既有資料、Controller、導航與錯誤回退流程。

**架構：** 只修改詳情頁與技能 Sheet 的 WXML/WXSS 以及契約測試；`miniprogram/subpkg-detail/pages/detail/index.ts` 保持不變。詳情頁保留人物檔案首卡和技能優先順序，技能區移除重複實體容器；技能 Sheet 保留單一浮層、既有事件與內容資料，補上標題層級、88rpx 關閉熱區和安全區 padding。

**技術組合：** 微信小程序原生 TypeScript／WXML／WXSS、Vitest、ESLint、Prettier。

## 全域約束

- 所有界面、文檔、註釋和交互使用繁體中文；WXML/WXSS 類名使用英文 BEM。
- 開發分支為 `codex/phase-9-詳情與技能面板收口`，基準為 `origin/main@92243b0`。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`。
- 不修改詳情資料、Controller、Presenter、Domain、Solver、導航與保存流程。
- 若既有 `generate:check` 誤檢查詳情頁目錄，只修改 `package.json` 的檢查路徑，限定於實際生成的 `details-*.js`、`detail-index.js` 與 `detail-loaders.js`。
- 不新增位圖、依賴、`wx.request`、`wx.cloud`、遠程 URL 或 Node.js Runtime API。
- 涉及 UI、WXML 或 WXSS 的任務，必須遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md` 的 Token、字體、間距、圓角、陰影、狀態、觸控和安全區規範。
- 每個階段執行相關測試、`npm.cmd run verify`、`git diff --check`，並檢查禁止路徑。
- 未展示變更文件、驗證結果、手動驗收清單和擬用 Commit Message 前，不執行 commit、merge 或 push。

---

### Task 1：建立詳情與技能 Sheet 的 RED 契約測試

**Files:**

- Modify: `tests/pages/detail-page.test.ts`
- Create: `tests/components/skill-sheet.test.ts`

**Interfaces:**

- Consumes: 現有詳情 Page 註冊、詳情圖片失敗回退測試與技能 Sheet Presenter 測試。
- Produces: 詳情技能區扁平化、Sheet 標題層級、關閉熱區、安全區和反查事件的靜態契約。

- [ ] **Step 1：在詳情頁測試加入失敗契約**

在 `tests/pages/detail-page.test.ts` 讀取詳情 WXML/WXSS，新增斷言：

```ts
expect(detailWxml).toContain('content-section--skills')
expect(detailWxml).toContain('bindtap="onSkillTap"')
expect(detailWxml).toContain('bind:dismiss="onSheetDismiss"')
expect(detailWxml).toContain('bind:reverselookup="onReverseLookup"')
expect(detailWxss).toMatch(/\.content-section--skills\s*\{[\s\S]*background:\s*transparent/)
expect(detailWxss).toMatch(/\.skill-action\s*\{[\s\S]*font-size:\s*var\(--uwo-font-size-minimum-action\)/)
```

- [ ] **Step 2：建立技能 Sheet 結構與樣式失敗契約**

建立 `tests/components/skill-sheet.test.ts`，讀取技能 Sheet WXML/WXSS，新增斷言：

```ts
expect(skillSheetWxml).toContain('技能詳情')
expect(skillSheetWxml).toContain('aria-label="關閉技能詳情"')
expect(skillSheetWxml).toContain('bindtap="onReverseLookup"')
expect(skillSheetWxss).toMatch(/\.skill-sheet__close\s*\{[\s\S]*min-width:\s*88rpx/)
expect(skillSheetWxss).toMatch(/\.skill-sheet__close\s*\{[\s\S]*min-height:\s*88rpx/)
expect(skillSheetWxss).toMatch(/\.skill-sheet__close\s*\{[\s\S]*font-size:\s*var\(--uwo-font-size-minimum-action\)/)
expect(skillSheetWxss).toContain('env(safe-area-inset-bottom)')
```

- [ ] **Step 3：執行 RED 驗證**

```powershell
npm.cmd test -- tests/pages/detail-page.test.ts tests/components/skill-sheet.test.ts
```

預期：新增契約因現有詳情技能區、Sheet 標題和關閉樣式尚未收口而失敗；既有詳情資料與 Presenter 測試不應出現 TypeScript 或測試載入錯誤。

### Task 2：收口詳情頁技能區層級

**Files:**

- Modify: `miniprogram/subpkg-detail/pages/detail/index.wxml`
- Modify: `miniprogram/subpkg-detail/pages/detail/index.wxss`
- Test: `tests/pages/detail-page.test.ts`

**Interfaces:**

- Consumes: 現有 `activeSkills`、`passiveSkills`、`failedSkillImages` 和 `onSkillTap` 事件。
- Produces: `content-section--skills` 扁平技能區、保留技能行點擊和圖片失敗回退的視覺結構。

- [ ] **Step 1：只為主動與被動技能 Section 增加 BEM 修飾類**

將兩個技能外層 View 的 class 改為 `content-section content-section--skills`，不改變 `wx:if`、技能迴圈、`data-skill-id`、`bindtap`、圖示失敗回退或文字內容。

- [ ] **Step 2：移除技能外層實體容器的重複視覺層**

讓 `.content-section--skills` 使用透明背景、無外框、無陰影與零水平內距；保留 `.section-heading` 的標題層級與 `.skill-card` 單層邊界。將技能操作文字改為 `var(--uwo-font-size-minimum-action)`，並以 `overflow-wrap: anywhere` 保護長技能名稱。

- [ ] **Step 3：執行 GREEN 驗證**

```powershell
npm.cmd test -- tests/pages/detail-page.test.ts tests/runtime/detail-presenter.test.ts
```

預期：詳情資料、圖片失敗回退、技能分組與扁平技能區契約全部通過。

### Task 3：統一技能 Sheet 標題、關閉熱區與安全區

**Files:**

- Modify: `miniprogram/components/skill-sheet/index.wxml`
- Modify: `miniprogram/components/skill-sheet/index.wxss`
- Test: `tests/components/skill-sheet.test.ts`

**Interfaces:**

- Consumes: 現有 `skill` property、`onDismiss`、`onReverseLookup` 與 `stopPropagation` 方法。
- Produces: 不改事件名稱的技能詳情浮層，具備清楚標題、88rpx 關閉熱區、22rpx 操作字級、安全區與長文本換行。

- [ ] **Step 1：增加標題眉標與關閉無障礙名稱**

在 `skill-sheet__identity` 內新增 `<text class="skill-sheet__eyebrow">技能詳情</text>`，並將關閉 View 改為保留 `bindtap="onDismiss"`、`role="button"` 和 `aria-label="關閉技能詳情"` 的可見文字操作。

- [ ] **Step 2：以 Design Foundation Token 重寫必要 Sheet 樣式**

使用 `--uwo-color-*`、`--uwo-font-*`、`--uwo-space-*`、`--uwo-radius-sheet`、`--uwo-radius-control` 與 `--uwo-shadow-sheet`；`.skill-sheet__close` 設置 `min-width: 88rpx`、`min-height: 88rpx`、`font-size: var(--uwo-font-size-minimum-action)`；Sheet 底部使用：

```css
padding-bottom: calc(var(--uwo-space-8) + env(safe-area-inset-bottom));
```

技能名稱、說明、等級描述與反查操作使用可換行規則，避免窄屏橫向溢出。

- [ ] **Step 3：執行 Sheet GREEN 驗證**

```powershell
npm.cmd test -- tests/components/skill-sheet.test.ts tests/pages/detail-page.test.ts
```

預期：Sheet 契約與詳情既有行為測試全部通過，未新增 Controller 或事件方法。

### Task 4：完整驗證與手動驗收準備

**Files:**

- Modify: `package.json` only when narrowing the generated-output diff path is required
- Inspect only: `miniprogram/subpkg-detail/pages/detail/index.ts`
- Inspect only: `tests/pages/detail-page.test.ts`
- Modify only if needed to correct approved UI assertions: `tests/pages/detail-page.test.ts`, `tests/components/skill-sheet.test.ts`

**Interfaces:**

- Consumes: Task 1–3 的測試與視覺結構。
- Produces: P9 完整驗證報告、禁止路徑檢查結果與待使用者在微信 DevTools 完成的驗收清單。

- [ ] **Step 1：執行聚焦回歸**

```powershell
npm.cmd test -- tests/pages/detail-page.test.ts tests/components/skill-sheet.test.ts tests/presenters/skill-sheet.test.ts tests/runtime/detail-presenter.test.ts
```

- [ ] **Step 2：執行完整門禁與差異檢查**

若 `generate:check` 因 `git diff --exit-code -- miniprogram/subpkg-detail` 把本次頁面 WXML/WXSS 變更誤判為生成差異，將 `package.json` 的命令收窄為：

```json
"generate:check": "npm run data:generate && git diff --exit-code -- miniprogram/generated miniprogram/subpkg-detail/details-*.js miniprogram/subpkg-detail/detail-index.js miniprogram/subpkg-detail/detail-loaders.js data/assets/asset-dependencies.json"
```

再執行：

```powershell
npm.cmd run verify
git diff --check
```

- [ ] **Step 3：檢查禁止目錄、業務邊界與網路規則**

```powershell
git diff --name-only -- archive data/master miniprogram/generated miniprogram/subpkg-detail/runtime miniprogram/domain cloudfunctions
rg -n 'wx\.request|wx\.cloud|https?://|iconFallback' miniprogram/subpkg-detail/pages/detail miniprogram/components/skill-sheet tests/pages/detail-page.test.ts tests/components/skill-sheet.test.ts
```

預期：禁止路徑無變更，生產頁面與元件無遠程請求、Emoji/Unicode 正式圖標或 Node.js Runtime API。

- [ ] **Step 4：整理手動驗收與提交資訊**

在 320/375/393/430px 檢查：人物檔案與技能優先順序、長技能名稱、長效果說明、關閉熱區、底部安全區、反向查詢入口與頁面級橫向溢出。

擬用 Commit Message：

```text
feat(detail): 收口詳情與技能面板
```

提交前展示完整變更文件、驗證結果、手動驗收清單和 Commit Message，等待使用者確認後才執行 Git 整合。
