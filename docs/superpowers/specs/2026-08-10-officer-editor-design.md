# P10 航海士編輯器收口設計規格

日期：2026-08-10
變更：P10「航海士編輯器收口」
分支：`codex/phase-10-航海士編輯器收口`

## 1. 背景與目標

目前航海士編輯頁是單一深色長表單，所有欄位同時展開，與資料頁和詳情頁的資料館主題不一致，也讓使用者難以理解目前應先完成哪一段。審計建議將表單改為「基本資料—能力與語言—技能—確認」的分段流程，同時保留既有欄位、校驗與提交能力。

本次目標是在不改變表單資料結構、事件語義、校驗、提交、資料來源或保存流程的前提下：

- 讓長表單以分段收合方式呈現，預設只展開基本資料；
- 讓編輯頁使用 Design Foundation 的羊皮紙、深墨與黃銅 Token；
- 讓標題列、欄位操作、移除操作與提交操作符合觸控熱區規範；
- 保留所有繁體中文文案，移除正式操作中的 Emoji／Unicode 圖示替代；
- 確保長名稱、錯誤訊息、備註和窄屏內容不產生橫向溢出。

## 2. 非目標與硬約束

- 不修改 `miniprogram/pages/officer-editor/index.ts`。
- 不修改 `miniprogram/domain/officer-editor.ts`、`miniprogram/contracts/officer-editor.ts`、Presenter、提交服務或資料來源。
- 不新增 `wx.request`、`wx.cloud`、遠程 URL、Node.js Runtime API 或依賴。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`。
- 不新增大型位圖；本次只使用既有 `disclosure-section` 元件和 CSS 視覺效果，不開啟生圖瀏覽器。
- 不新增頁面級展開狀態；收合狀態由既有純 UI 元件維護。

## 3. 採用方案

### 3.1 沿用既有 Disclosure 元件

專案已存在 `miniprogram/components/disclosure-section/`，並已提供：

- `title`、`hint`、`countLabel` 和 `defaultExpanded` 屬性；
- 內容 slot；
- 元件內部 `expanded` 展示狀態；
- `aria-expanded`、繁體中文展開／收起文案；
- 至少 `88rpx` 的標題列熱區；
- Design Foundation Token 樣式。

因此本次不新增 `form-disclosure`，直接在編輯頁 `index.wxml` 使用既有元件。這使編輯頁 Controller 不需要知道任何展開狀態，也不會把展示狀態混入表單狀態。

### 3.2 編輯頁分段

既有欄位按原本資料邊界放入五個可收合區段，避免重新解釋或搬移資料：

1. **基本資料**：名稱、稀有度、Boss、類型、性別、職業、國籍、頭像。
2. **能力與語言**：語言能力列表與新增語言操作。
3. **技能**：技能列表、技能搜尋、技能組別、解鎖等級與技能等級。
4. **招募資訊**：招募城市、招募條件、所需航海士和招募備註。
5. **其他與確認**：來源 ID、維護備註。

「確認提交」保留在所有區段之後的獨立提交區，始終可在頁面底部找到；提交按鈕仍然綁定既有 `onSubmit`，提交中和錯誤摘要行為不變。

第一段使用 `default-expanded="{{true}}"`，其餘段落使用 `default-expanded="{{false}}"`。語言和技能區段使用既有陣列長度作為 `count-label`，不新增 Presenter 欄位或計算邏輯。

### 3.3 既有操作保留方式

欄位 input、picker、switch、portrait、語言行、技能行、招募標籤和提交按鈕繼續使用現有事件名稱與資料綁定。區段標題由 `disclosure-section` 負責，語言／技能的「新增」操作放在各自內容的工具列，避免與元件標題按鈕產生事件冒泡衝突。

移除 `📷`、`✕` 等正式操作圖示，改為可讀的繁體中文文字：

- 頭像空狀態顯示「選擇頭像」；
- 語言、技能、標籤移除操作顯示「移除」；
- 保留所有原有 `bindtap` 事件與 dataset。

## 4. 視覺與互動規格

### 4.1 主題 Token

編輯頁從歷史深色硬編碼切換到既有 Token：

- 頁面底色使用 `--uwo-color-canvas`；
- 區段與輸入控制使用 `--uwo-color-surface`、`--uwo-color-surface-muted`；
- 文字使用 `--uwo-color-text-primary` 和 `--uwo-color-text-secondary`；
- 標題、焦點與主要操作使用 `--uwo-color-accent-brass`、`--uwo-color-accent-text`；
- 錯誤使用 `--uwo-color-danger`；
- 間距、圓角、字體大小全部使用 `--uwo-*` Token。

頁面 JSON 的導航列與背景色只使用與 Token 對應的既有品牌色，不引入新的色彩系統。

### 4.2 觸控與安全區

- 區段標題列維持至少 `88rpx`；
- 新增、重新選擇、移除、添加等文字操作的有效熱區至少 `88rpx` 高；
- 輸入、picker 和 textarea 保持可讀的正文尺寸，操作文字不低於 `22rpx`；
- 提交按鈕高度至少 `88rpx`；
- 提交區與頁面底部間距包含 `env(safe-area-inset-bottom)`；
- 不使用固定定位遮擋表單內容，保留 scroll-view 的自然滾動。

### 4.3 長文本與窄屏

- 表單欄位、標籤、錯誤和備註使用 `overflow-wrap: anywhere` 或等效換行策略；
- 技能標題不再以單行省略造成關鍵資訊消失；
- 內嵌 row 在 320px 寬度下允許可收縮欄位，移除操作不擠壓輸入欄位；
- 編輯頁根容器和表單區塊使用 `box-sizing: border-box`，不產生頁面級橫向溢出。

## 5. 變更邊界與資料流

```text
頁面既有 PageData / PageState
          │
          ├─ 既有 input、picker、switch、操作事件
          │       │
          │       └─ 既有 index.ts / domain / presenter / service
          │
          └─ disclosure-section 只維護 expanded 展示狀態
```

`disclosure-section` 不讀取 Domain、Presenter、runtime 或網路服務。表單資料仍由既有 Controller 更新，校驗仍由既有 `validateOfficerForm` 執行，CanonicalOfficer 建構與提交服務完全不變。

## 6. 測試策略

新增 `tests/pages/officer-editor-page.test.ts`，使用靜態契約測試確認：

- 編輯頁註冊並使用既有 `disclosure-section`；
- 五個區段標題和預設展開狀態正確；
- `onSubmit`、欄位輸入、語言新增、技能新增、招募操作等既有事件仍存在；
- 使用 Token、88rpx 觸控熱區、安全區留白和換行規則；
- 不含頭像 Emoji 或 `✕` 正式圖示。

保留既有 Domain、Presenter 和 Controller 相關測試，並在實作後確認 `index.ts` 沒有變更。完整驗證仍必須執行 `npm.cmd run verify`、`git diff --check` 和禁止目錄檢查。

## 7. 驗收條件

- 320／375／393／430px 寬度下，五個區段可正常收合與展開；
- 首次進入只展開基本資料，其他區段標題仍清楚顯示摘要和數量；
- 長技能名稱、錯誤訊息、招募備註和維護備註不造成橫向溢出；
- 所有既有欄位可輸入，校驗錯誤仍顯示在原欄位附近；
- 頭像選擇、移除、語言新增／移除、技能新增／移除和招募操作仍可使用；
- 提交、提交中、成功、失敗和返回流程不變；
- 底部提交操作不被 Home Indicator 遮擋；
- 不修改既有 Controller、Domain、Presenter、提交服務與資料來源；
- 所有自動化門禁通過。
