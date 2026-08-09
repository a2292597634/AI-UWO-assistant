# P10 航海士編輯器收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution required by the repository constraint; do not dispatch subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不修改航海士編輯器 Controller、Domain、校驗、提交或資料來源的前提下，將長表單改為使用既有 `disclosure-section` 的分段收合表單，並統一 Design Foundation 視覺與觸控規範。

**Architecture:** 編輯頁只負責把既有欄位內容放入五個 `disclosure-section` slot；收合狀態完全由既有展示元件維護，不進入 `index.ts` 的 PageData 或 PageState。頁面 WXSS 負責 slot 內容與表單控制項的 Token 化，保留所有既有事件名稱和資料綁定。

**Tech Stack:** 微信小程序 WXML、WXSS、TypeScript、Vitest、Prettier、ESLint、TypeScript compiler。

## Global Constraints

- 所有界面、文檔、註釋和交互使用繁體中文；WXML/WXSS 類名使用英文 BEM。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`。
- 不修改既有 Controller、Domain、Presenter、Solver、提交服務、數據來源和保存流程；`miniprogram/pages/officer-editor/index.ts` 必須保持不變。
- 不新增 `wx.request`、`wx.cloud`、遠程 URL、Node.js Runtime API 或依賴。
- 不新增位圖；沿用既有 `disclosure-section` 元件和 CSS Token，不開啟生圖瀏覽器。
- UI/WXML/WXSS 必須遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
- 實作前先完成紅燈測試；每個可驗證步驟都要執行對應測試。
- 完成前必須執行 `npm.cmd run verify`、`git diff --check` 和禁止目錄檢查。
- Commit 前必須展示變更文件、驗證結果、手動驗收清單和擬用 Commit Message，等待使用者確認。

---

## 檔案地圖

- Modify: `miniprogram/pages/officer-editor/index.json` — 註冊既有 `disclosure-section` 並對齊頁面導航／背景品牌色。
- Modify: `miniprogram/pages/officer-editor/index.wxml` — 將既有五段欄位包入 Disclosure slot，保留所有 input、picker、switch、操作和提交事件；移除正式操作中的 Emoji／Unicode 圖示。
- Modify: `miniprogram/pages/officer-editor/index.wxss` — 移除歷史深色硬編碼，改用 Design Foundation Token；補齊 88rpx 操作熱區、安全區和窄屏換行。
- Create: `tests/pages/officer-editor-page.test.ts` — 編輯頁分段結構、既有事件、Token、熱區、安全區與正式文案的靜態契約測試。
- Read-only: `miniprogram/pages/officer-editor/index.ts` — 確認 Controller 零變更。
- Read-only: `miniprogram/components/disclosure-section/index.{ts,wxml,wxss,json}` — 沿用既有元件契約，不修改元件。

## Task 1：建立編輯頁紅燈契約測試

**Files:**

- Create: `tests/pages/officer-editor-page.test.ts`
- Read: `miniprogram/pages/officer-editor/index.json`
- Read: `miniprogram/pages/officer-editor/index.wxml`
- Read: `miniprogram/pages/officer-editor/index.wxss`

**Interfaces:**

- Consumes: 編輯頁 JSON、WXML、WXSS 的靜態文字。
- Produces: 後續 WXML/WXSS 實作必須通過的分段 UI 契約；不呼叫 Controller 或 Domain。

- [ ] **Step 1: 建立最小靜態契約測試**

  測試應讀取三個頁面文件，確認既有元件註冊、五個分段標題和預設展開狀態：

  ```ts
  import { readFileSync } from 'node:fs'
  import { resolve } from 'node:path'
  import { describe, expect, it } from 'vitest'

  const ROOT = resolve(__dirname, '../..')
  const readPageFile = (file: string): string =>
    readFileSync(resolve(ROOT, 'miniprogram/pages/officer-editor', file), 'utf8')

  describe('OfficerEditor page disclosure contract', () => {
    it('registers the shared disclosure section and preserves the five sections', () => {
      const pageJson = JSON.parse(readPageFile('index.json')) as {
        usingComponents?: Record<string, string>
      }
      const wxml = readPageFile('index.wxml')

      expect(pageJson.usingComponents?.['disclosure-section']).toBe(
        '../../components/disclosure-section/index',
      )
      expect(wxml.match(/<disclosure-section/g) ?? []).toHaveLength(5)
      for (const title of ['基本資料', '能力與語言', '技能', '招募資訊', '其他與確認']) {
        expect(wxml).toContain(`title="${title}"`)
      }
    })

    it('opens only the basic data section by default', () => {
      const wxml = readPageFile('index.wxml')

      expect(wxml).toMatch(/title="基本資料"[\s\S]*?default-expanded="\{\{true\}\}"/)
      expect(wxml.match(/default-expanded="\{\{false\}\}"/g) ?? []).toHaveLength(4)
    })
  })
  ```

- [ ] **Step 2: 加入既有事件與正式文案契約**

  在同一測試檔加入下列行為契約，確保視覺重構不會移除現有互動：

  ```ts
  it('保留既有欄位、操作和提交事件', () => {
    const wxml = readPageFile('index.wxml')

    for (const handler of [
      'onNameInput',
      'onRarityChange',
      'onPortraitTap',
      'onLanguageAdd',
      'onLanguageRemove',
      'onSkillAdd',
      'onSkillRemove',
      'onCityAdd',
      'onRequiredOfficerAdd',
      'onSubmit',
    ]) {
      expect(wxml).toContain(`bindtap="${handler}"`)
    }
    expect(wxml).not.toContain('📷')
    expect(wxml).not.toContain('✕')
  })
  ```

- [ ] **Step 3: 加入 WXSS 門禁契約**

  ```ts
  it('使用 Design Foundation、操作熱區、安全區與長文本規則', () => {
    const wxss = readPageFile('index.wxss')

    expect(wxss).toContain('var(--uwo-color-canvas)')
    expect(wxss).toContain('var(--uwo-color-surface)')
    expect(wxss).toMatch(/min-height\s*:\s*88rpx/)
    expect(wxss).toContain('env(safe-area-inset-bottom)')
    expect(wxss).toMatch(/overflow-wrap\s*:\s*anywhere/)
    expect(wxss).not.toMatch(/#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\s*\(/i)
  })
  ```

- [ ] **Step 4: 執行紅燈測試**

  Run: `npm.cmd test -- tests/pages/officer-editor-page.test.ts`

  Expected: FAIL，失敗原因應是頁面尚未註冊／使用五個 `disclosure-section`、仍有 Emoji 圖示或 WXSS 尚未 Token 化；不得是測試載入錯誤或語法錯誤。

## Task 2：重組編輯頁 WXML 分段結構

**Files:**

- Modify: `miniprogram/pages/officer-editor/index.json`
- Modify: `miniprogram/pages/officer-editor/index.wxml`
- Test: `tests/pages/officer-editor-page.test.ts`

**Interfaces:**

- Consumes: `disclosure-section` 的 `title`、`hint`、`count-label`、`default-expanded` 和 slot。
- Produces: 五個只負責展示收合的表單區段；所有既有事件和資料綁定照原名稱傳回頁面 Controller。

- [ ] **Step 1: 註冊既有 Disclosure 元件**

  在 `index.json` 的 `usingComponents` 加入：

  ```json
  "disclosure-section": "../../components/disclosure-section/index"
  ```

  同時將導航列背景對齊既有 `--uwo-color-ink` 色值 `#26332f`，頁面背景對齊既有 `--uwo-color-canvas` 色值 `#e7deca`；不新增其他色彩。

- [ ] **Step 2: 將基本資料內容放入第一個 Disclosure**

  使用以下外層結構，原有基本資料欄位內容只移動位置，不修改事件：

  ```xml
  <disclosure-section
    title="基本資料"
    hint="名稱、定位與頭像"
    default-expanded="{{true}}"
  >
    <view class="editor-section__content">
      <!-- 原基本資料欄位，保留既有 bindinput、bindchange 和 bindtap -->
    </view>
  </disclosure-section>
  ```

- [ ] **Step 3: 將語言、技能、招募和其他內容各自放入剩餘四個 Disclosure**

  保持下列順序與屬性：

  ```xml
  <disclosure-section title="能力與語言" hint="語言能力等級" count-label="{{languages.length}}" default-expanded="{{false}}">
    <view class="editor-section__content">
      <view class="editor-section__toolbar">
        <text class="editor-section__toolbar-label">語言能力</text>
        <button class="editor-section__action" bindtap="onLanguageAdd">新增語言</button>
      </view>
      <!-- 原 languages 列表與 onLanguage* 事件 -->
    </view>
  </disclosure-section>

  <disclosure-section title="技能" hint="技能組別與等級" count-label="{{skills.length}}" default-expanded="{{false}}">
    <view class="editor-section__content">
      <view class="editor-section__toolbar">
        <text class="editor-section__toolbar-label">技能列表</text>
        <button class="editor-section__action" bindtap="onSkillAdd">新增技能</button>
      </view>
      <!-- 原 skills 列表與 onSkill* 事件 -->
    </view>
  </disclosure-section>

  <disclosure-section title="招募資訊" hint="城市、條件與前置航海士" default-expanded="{{false}}">
    <view class="editor-section__content">
      <!-- 原 recruitment 欄位與 onCity*、onRequirement*、onRequiredOfficer* 事件 -->
    </view>
  </disclosure-section>

  <disclosure-section title="其他與確認" hint="來源與維護備註" default-expanded="{{false}}">
    <view class="editor-section__content">
      <!-- 原 sourceVoyageTw 與 maintenanceNote 欄位 -->
    </view>
  </disclosure-section>
  ```

  以上註解只代表欄位搬移位置；實作時 WXML 不保留英文註解，頁面註釋仍使用繁體中文。

- [ ] **Step 4: 移除正式 Emoji／Unicode 圖示並保留事件**

  - 頭像空狀態改為「點擊選擇頭像」，仍由外層 `bindtap="onPortraitTap"` 處理。
  - 語言、技能和標籤移除操作改為可讀文字「移除」，保留原 `bindtap` 與 dataset。
  - 新增操作使用文字按鈕，避免在 Disclosure 標題列內嵌會觸發收合的事件。

- [ ] **Step 5: 執行 WXML 紅綠驗證**

  Run: `npm.cmd test -- tests/pages/officer-editor-page.test.ts`

  Expected: 事件、五段結構、預設展開、正式文案和 JSON 註冊相關測試通過；WXSS Token 測試仍可能失敗，留到 Task 3。

## Task 3：以 Design Foundation 收口 WXSS

**Files:**

- Modify: `miniprogram/pages/officer-editor/index.wxss`
- Test: `tests/pages/officer-editor-page.test.ts`

**Interfaces:**

- Consumes: `design-foundation.wxss` 的既有 `--uwo-*` Token 和 `disclosure-section` 的內部樣式。
- Produces: 編輯頁 slot 內容、輸入控制、操作熱區、錯誤狀態與提交區的統一樣式。

- [ ] **Step 1: 收口頁面、標題與內容容器**

  將 `.editor-page`、`.editor-header` 和 `.editor-section__content` 改為使用 Token，頁面保留 scroll-view 高度並以 `box-sizing: border-box` 控制寬度：

  ```css
  .editor-page {
    box-sizing: border-box;
    width: 100%;
    height: 100vh;
    padding: 0 var(--uwo-space-4);
    background: var(--uwo-color-canvas);
    color: var(--uwo-color-text-primary);
  }

  .editor-section__content {
    min-width: 0;
    padding-top: var(--uwo-space-2);
  }
  ```

- [ ] **Step 2: Token 化欄位、選擇器和錯誤狀態**

  將歷史色彩、間距、圓角和字體替換為 `--uwo-*` Token。輸入和 picker 以 surface-muted／border-subtle 為基礎，錯誤以 `--uwo-color-danger` 顯示；不在 WXSS 新增裸色值。

- [ ] **Step 3: 建立工具列與操作熱區**

  `.editor-section__toolbar` 使用 flex 佈局；`.editor-section__action`、重新選擇、移除和添加操作至少 `88rpx` 高，字體使用 `var(--uwo-font-size-minimum-action)`，並為 button 重設預設邊框和背景。

- [ ] **Step 4: 處理長文本、技能卡與窄屏 row**

  對技能標題、欄位標籤、錯誤、tag 文案和 textarea 附近文字加入 `overflow-wrap: anywhere`。輸入欄位使用 `min-width: 0`；數字欄位和移除操作保持 flex 不擠壓主要欄位。

- [ ] **Step 5: 收口提交區和安全區**

  提交按鈕維持 `onSubmit`、`disabled` 和 `loading` 綁定，視覺使用主要按鈕 Token，最小高度 `88rpx`；提交區底部使用：

  ```css
  .submit-area {
    padding: var(--uwo-space-8) 0
      calc(var(--uwo-space-8) + env(safe-area-inset-bottom));
  }
  ```

- [ ] **Step 6: 執行聚焦測試與格式檢查**

  Run: `npm.cmd test -- tests/pages/officer-editor-page.test.ts tests/architecture/fleet-disclosure.test.ts`

  Expected: 編輯頁契約與既有 Disclosure 元件契約全部通過。

  Run: `npm.cmd run format:check; git diff --check`

  Expected: 格式檢查與 diff 空白檢查通過。

## Task 4：邊界與回歸驗證

**Files:**

- Read-only: `miniprogram/pages/officer-editor/index.ts`
- Read-only: `miniprogram/domain/officer-editor.ts`
- Read-only: `miniprogram/presenters/officer-editor-presenter.ts`
- Test: `tests/pages/officer-editor-page.test.ts`

- [ ] **Step 1: 確認 Controller、Domain 和提交邊界沒有變更**

  Run: `git diff --name-only -- miniprogram/pages/officer-editor/index.ts miniprogram/domain/officer-editor.ts miniprogram/presenters/officer-editor-presenter.ts miniprogram/runtime/officer-editor-service.ts`

  Expected: 無輸出；既有 `validateOfficerForm`、CanonicalOfficer 建構與 `onSubmit` 提交流程的實作文件均不在變更範圍。

- [ ] **Step 2: 掃描禁止網路與遠程引用**

  Run: `rg -n "wx\\.request|wx\\.cloud|https?://" miniprogram/pages/officer-editor miniprogram/components/disclosure-section`

  Expected: 無禁止匹配；測試檔可以使用 Node.js 的讀檔 API，但小程序運行時文件不得出現網路或遠程引用。

- [ ] **Step 3: 執行完整驗證**

  Run: `npm.cmd run verify`

  Expected: format、lint、typecheck、全部測試、runtime network、包體積、UI asset、manifest、data check 和 generate check 全部通過。

- [ ] **Step 4: 執行禁止目錄和 diff 檢查**

  Run: `git diff --check; git status --short; git diff --name-only -- archive data/master miniprogram/generated`

  Expected: `git diff --check` 通過；禁止目錄無變更；工作區只包含本計畫列出的頁面 JSON/WXML/WXSS、測試和規格／計畫文件。

- [ ] **Step 5: 進行人工驗收**

  在 320／375／393／430px 檢查：

  - 首次只展開基本資料，其他四段可操作展開／收合；
  - 語言與技能數量摘要正確；新增與移除操作不誤觸發區段收合；
  - 長技能名稱、錯誤訊息、招募備註和維護備註能換行；
  - 頭像選擇、重新選擇、移除和既有校驗仍可使用；
  - 提交區熱區、提交中狀態、失敗提示與底部安全區正確；
  - 頁面沒有橫向溢出，Controller、Domain 和提交流程沒有改動。

- [ ] **Step 6: 提交前交接**

  顯示完整變更文件、驗證結果、人工驗收清單和擬用 Commit Message，等待使用者確認後才 stage、commit、合併與推送。建議 Commit Message：

  ```text
  feat(officer-editor): 收口航海士編輯表單
  ```
