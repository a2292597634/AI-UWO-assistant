# Design Foundation 設計規格

## 目標

在不改變任何頁面業務、資料、Controller、Solver 或互動流程的前提下，建立《Uncharted Waters Origin》航海士資料查詢微信小程序的 Design Foundation。此基礎包含單一來源的 Design Token、全局排版與盒模型規則、可逐步採用的按鈕樣式，以及不只依賴顏色的狀態表達規範。

本階段只讓頁面底色、正文顏色、正文系統無襯線字體和既有盒模型 reset 全局生效。按鈕、狀態與展示性襯線標題採 opt-in 類別，留給 P4 及後續頁面按需套用，不批量修改既有頁面 WXML 或頁面 WXSS。

## 視覺定位

Design Foundation 延續「古典航海資料館」方向：以工具效率為主體，以海圖、黃銅儀器和航海檔案為輕度裝飾。遊戲氛圍來自低飽和色彩、航海士素材、標題語氣與少量紋理，不以厚重邊框、複雜背景或大量動畫承擔資訊層級。

## 文件與樣式架構

本 Change 使用以下邊界：

- `docs/superpowers/specs/2026-08-09-design-foundation-design.md`：Design Foundation 的權威規格，記錄 Token 與使用規則。
- `AGENTS.md`：為所有 Agent 提供強制入口；涉及 UI、WXML 或 WXSS 的任務在編碼前必須完整閱讀本規格。
- `CLAUDE.md`：在「觸發式參考文檔」中提供相同強制入口，確保 Claude 類開發流程也會載入本規格。
- `miniprogram/styles/design-foundation.wxss`：所有 WXSS Token、全局基礎規則、按鈕與狀態樣式的唯一實作來源。
- `miniprogram/app.wxss`：只引入 `styles/design-foundation.wxss`，不重複定義 Token。
- `tests/architecture/design-foundation.test.ts`：以靜態契約保護 Token 色值、全局字體、按鈕狀態、最小熱區與狀態類別。

現有頁面中的歷史硬編碼樣式不在 P3 批量替換。此處的「單一來源」是指新的 Design Foundation Token 只在 `design-foundation.wxss` 定義；後續 Change 採用 Token 時，逐頁移除對應硬編碼值。

## 後續 Agent 觸發機制

Design Foundation 不能只依賴 Agent 主動搜尋 `docs/`。P3 必須在根目錄的兩份入口文件加入同一項強制規則：

> 涉及 UI、WXML 或 WXSS 的任務，編碼前必須完整閱讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`；新增或修改樣式必須遵守其中的 Token、字體、間距、圓角、陰影、狀態、按鈕、觸控和安全區規範。

觸發機制分為三層：

1. `AGENTS.md` 與 `CLAUDE.md` 負責在任務開始時提示必讀規格；兩者引用同一權威路徑，不複製整份規格。
2. 後續 UI 實施計畫的 Global Constraints 必須重申「編碼前完整閱讀 Design Foundation」。
3. `tests/architecture/design-foundation.test.ts` 驗證兩份入口文件仍引用正確路徑，並以樣式契約阻止 Token、字體、按鈕和狀態規則漂移。

規格內容仍只維護在本文件；`AGENTS.md` 和 `CLAUDE.md` 只保存觸發條件與連結，避免三份文檔日後互相矛盾。

## 色彩 Token

規格名稱與 WXSS 自訂屬性的對應如下：

| Token | WXSS 自訂屬性 | 色值 | 用途 |
| --- | --- | ---: | --- |
| `canvas` | `--uwo-color-canvas` | `#E7DECA` | 頁面底色 |
| `surface` | `--uwo-color-surface` | `#F5EFE0` | 主卡片、表單與浮層 |
| `surface-muted` | `--uwo-color-surface-muted` | `#E8DFCE` | 次級區塊、Chip 與禁用底色 |
| `ink` | `--uwo-color-ink` | `#26332F` | 導航、深色標題區與主要按鈕 |
| `text-primary` | `--uwo-color-text-primary` | `#292A26` | 主正文 |
| `text-secondary` | `--uwo-color-text-secondary` | `#625947` | 輔助正文 |
| `accent-brass` | `--uwo-color-accent-brass` | `#B99552` | 深色底上的裝飾、焦點與強調 |
| `accent-text` | `--uwo-color-accent-text` | `#76501A` | 淺色底上的黃銅語義文字 |
| `success` | `--uwo-color-success` | `#596257` | 已達成、已保存 |
| `warning` | `--uwo-color-warning` | `#7A541C` | 未達成、需復核 |
| `danger` | `--uwo-color-danger` | `#8B3A3A` | 錯誤、刪除與全局排除 |
| `border-subtle` | `--uwo-color-border-subtle` | `#C8BDA4` | 普通分隔 |
| `border-strong` | `--uwo-color-border-strong` | `#8C7E63` | 表單、按鈕與焦點邊界 |

色彩使用規則：

- `accent-brass` 不用作淺色背景上的小號正文；此情境使用 `accent-text`。
- 正常正文與背景的對比度以 4.5:1 為底線。
- 同一頁最多使用一個主要強調色；狀態色只表達狀態，不與主要強調色競爭。
- 成功、警告與錯誤不能只依賴色相差異，必須同時提供可見文字或明確圖形語義。
- 不為按下、焦點或陰影新增另一套品牌色；使用既有 Token、透明度、位移與邊界表達互動狀態。

## 字體與排版

### 字體家族

- 正文與操作 Token `--uwo-font-family-body`：`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif`。
- 展示標題 Token `--uwo-font-family-display`：`Georgia, "Times New Roman", "Noto Serif TC", "PMingLiU", serif`。
- 不引入自訂字體文件或字體依賴。
- 襯線字體只能透過 `.ui-display-title` 明確啟用，用於 Hero、人物檔案標題或同等展示性區域；正文、表單、按鈕、狀態和導航不得使用襯線字體。

### 字體層級

| 層級 | WXSS Token | 字級 | 字重 |
| --- | --- | ---: | ---: |
| 頁面／展示標題 | `--uwo-font-size-page-title` | `40rpx` | `700` |
| 區塊標題 | `--uwo-font-size-section-title` | `32rpx` | `600–700` |
| 強調正文 | `--uwo-font-size-emphasis` | `28rpx` | `600` |
| 正文、按鈕 | `--uwo-font-size-body` | `26rpx` | `400–600` |
| 輔助正文 | `--uwo-font-size-supporting` | `24rpx` | `400` |
| 小型標籤與操作下限 | `--uwo-font-size-minimum-action` | `22rpx` | `400–600` |

獨立操作文字不得小於 `22rpx`。低於此尺寸的文字只能承擔非必要裝飾或輔助資訊，不能成為唯一操作入口。

## 間距、圓角與陰影

### 間距序列

| Token | 值 |
| --- | ---: |
| `--uwo-space-1` | `4rpx` |
| `--uwo-space-2` | `8rpx` |
| `--uwo-space-3` | `12rpx` |
| `--uwo-space-4` | `16rpx` |
| `--uwo-space-6` | `24rpx` |
| `--uwo-space-8` | `32rpx` |
| `--uwo-space-12` | `48rpx` |

新樣式只從此序列取值。既有頁面的歷史間距不在 P3 批量重寫。

### 圓角

| Token | 值 | 用途 |
| --- | ---: | --- |
| `--uwo-radius-control` | `10rpx` | 按鈕、輸入與一般控件 |
| `--uwo-radius-card` | `16rpx` | 卡片與主容器 |
| `--uwo-radius-sheet` | `28rpx` | Bottom Sheet 頂部圓角 |
| `--uwo-radius-pill` | `999rpx` | Chip、Badge 與 Pill |

### 陰影

- 普通內容卡不使用陰影，以 `surface`、間距和邊框建立層級。
- `--uwo-shadow-elevated` 為 `0 12rpx 32rpx rgba(38, 51, 47, 0.18)`，只供 Hero、浮層等離開普通文流的內容使用。
- `--uwo-shadow-sheet` 為 `0 -12rpx 32rpx rgba(38, 51, 47, 0.16)`，只供 Bottom Sheet 使用。
- 同一區塊最多一層實體容器，禁止連續使用「頁面卡片 → 區塊卡片 → 條目卡片」。

## 全局基礎規則

`design-foundation.wxss` 對所有頁面立即生效的規則只有：

- `page` 使用 `canvas`、`text-primary` 與系統無襯線字體。
- `page` 保持至少滿版高度，並禁止由基礎層引入頁面級橫向溢出。
- `view`、`text`、`button`、`input`、`textarea`、`image`、`scroll-view` 使用 `border-box`。
- 表單與按鈕繼承系統無襯線字體，但不覆寫既有頁面按鈕的顏色、間距或布局。

不在基礎層使用通配選擇器重置 margin、padding 或 display，避免改變既有頁面布局。

## 按鈕規範

### 結構與尺寸

- 基礎類別：`.ui-button`。
- 變體：`.ui-button--primary`、`.ui-button--secondary`、`.ui-button--danger`。
- 狀態：原生 `[disabled]`、`.ui-button--disabled`、`:active`、`.ui-button--pressed`、`:focus`、`.ui-button--focused`。
- 重要操作最小高度為 `88rpx`，水平內距為 `32rpx`，操作文字為 `26rpx`。
- 純圖形按鈕不屬於 P3 基礎按鈕；後續若新增，必須同時提供可見文字或可讀的無障礙名稱，且熱區仍不得小於 `88rpx × 88rpx`。
- `.ui-button::after` 移除微信原生按鈕邊框，視覺邊界由基礎類別統一管理。

### 主要按鈕

- 用途：頁面唯一主要下一步、確認或應用操作。
- 背景：`ink`；文字：`surface`；邊框：`ink`。
- 同一操作區通常只出現一個主要按鈕。

### 次要按鈕

- 用途：取消、返回、展開與不改變核心狀態的操作。
- 背景：`surface`；文字：`text-primary`；邊框：`border-strong`。

### 危險按鈕

- 用途：真正不可逆或影響全艦隊的刪除、全局排除等操作。
- 背景：`danger`；文字：`surface`；邊框：`danger`。
- 危險色不應用於一般移除、取消或返回。

### 禁用狀態

- 同時使用原生 `disabled` 屬性；`.ui-button--disabled` 只供 ViewModel 或視覺測試補充。
- 背景使用 `surface-muted`，文字使用 `text-secondary`，邊框使用 `border-subtle`。
- 禁用原因必須由相鄰說明文字、狀態訊息或無障礙描述解釋；不能只把按鈕變灰。
- 禁用狀態不響應按下位移或按下透明度。

### 按下與焦點狀態

- 按下狀態使用 `translateY(2rpx)` 與 `opacity: 0.88`，不能只靠另一個近似色值表達。
- 焦點狀態使用 `4rpx` 的 `accent-brass` 外框與 `4rpx` offset；`:focus` 供平台焦點使用，`.ui-button--focused` 供程式狀態或 DevTools 驗收使用。
- 按下與焦點不得縮小實際熱區。

## 狀態表達規範

基礎結構使用 `.ui-status`、`.ui-status__label`，並提供下列變體：

| 狀態 | 類別 | 必須出現的可見語義 | 色彩 Token |
| --- | --- | --- | --- |
| 已達成 | `.ui-status--achieved` | `已達成` 或更具體的成功文字 | `success` |
| 未達成 | `.ui-status--unmet` | `未達成`、`尚差 Lv.N` 等 | `warning` |
| 需復核 | `.ui-status--review` | `需復核` 並說明原因或範圍 | `warning` |
| 錯誤 | `.ui-status--error` | `錯誤` 或可理解的失敗原因 | `danger` |

狀態規則：

- 狀態色只能增強辨識，不能代替文字。
- 單獨的彩色圓點、邊框或背景不構成完整狀態表達。
- 圖形語義若在後續 Change 加入，必須使用本地資產並搭配文字；P3 不新增圖標素材，也不使用 Emoji 充當正式圖標。
- 錯誤訊息必須描述發生什麼事或下一步，不只顯示紅色。
- `需復核` 與 `錯誤` 分開：前者表示結果可存在但需要確認，後者表示操作或資料無法正確完成。

## 安全區、長文字與窄屏規則

- 固定底部操作區使用 `calc(... + env(safe-area-inset-bottom))`；P3 只記錄並提供規範，不批量改寫既有頁面。
- 基礎類別不得設定超出視口的固定寬度。
- 長文字按鈕預設允許換行並維持至少 `88rpx` 高度；不得以裁切重要操作文字維持單行。
- 320px 寬設備不得由 Design Foundation 新增頁面級橫向滾動。
- 375px、393px、430px 寬設備需確認字體替換後不造成標題、按鈕或狀態文字溢出。

## 測試與驗收

### 自動化契約

`tests/architecture/design-foundation.test.ts` 驗證：

- `app.wxss` 正確且只引入一份 Design Foundation；
- `AGENTS.md` 與 `CLAUDE.md` 都包含 UI／WXML／WXSS 觸發條件，並引用同一份 Design Foundation；
- 13 個指定色彩 Token 的名稱與色值完全一致；
- 正文使用系統無襯線字體，展示性襯線字體只存在於 opt-in 類別；
- 間距、圓角與字體 Token 符合本規格；
- `.ui-button` 的最小高度與操作文字下限符合規範；
- 主要、次要、危險、禁用、按下與焦點狀態均有實作；
- 已達成、未達成、需復核與錯誤四種狀態類別均有實作。

### 微信 DevTools

在 320px、375px、393px、430px 寬度檢查：

- 首頁、資料頁、詳情頁、戰鬥配隊、冒險配隊與技能 Sheet 均可載入；
- 全局無襯線字體與指定頁面底色、正文色生效；
- 字體替換沒有新增頁面級橫向溢出或重要長文字裁切；
- 既有安全區行為沒有回退；
- P3 新按鈕基礎類別的 `88rpx` 熱區、禁用、按下和焦點規則可由樣式檢查確認；
- 既有頁面尚未採用基礎按鈕／狀態類別的地方如實記錄為後續 Change，不在 P3 夾帶修復。

### 工程門禁

- 執行 `npm run verify`。
- 執行 `git diff --check`。
- 確認 `archive/`、`data/master/`、`miniprogram/generated/`、Cloud Function、Controller、Presenter、Domain 與 Solver 沒有變更。
- 確認沒有新增依賴、遠程請求、`wx.request`、`wx.cloud` 或 Node.js Runtime API。

## 不在本 Change

- 不抽取 P4 的共享 WXML 元件。
- 不重構首頁、資料頁、詳情頁、編輯頁、戰鬥配隊、冒險配隊或技能 Sheet。
- 不修改任何業務流程、配置保存、未保存攔截、版本衝突或 Cloud Function。
- 不新增大型視覺素材、圖標集、自訂字體或 CSS 框架。
- 不批量將現有頁面硬編碼值替換為 Token。
- 不處理 Change 4 及以後的元件與頁面任務。

## 完成條件

- Design Foundation 文檔完整定義本規格中的色彩、字體、間距、圓角、陰影、按鈕與狀態。
- `AGENTS.md` 與 `CLAUDE.md` 都能在 UI／WXML／WXSS 編碼前觸發本規格，且只引用同一權威文件。
- Design Token 只有一個 WXSS 定義來源，`app.wxss` 全局引入該來源。
- 全局正文使用系統無襯線字體；襯線字體只能由展示性標題類別 opt-in。
- 基礎按鈕提供主要、次要、危險、禁用、按下與焦點狀態，重要操作熱區至少 `88rpx`，操作文字至少 `22rpx`。
- 已達成、未達成、需復核與錯誤狀態必須有文字或圖形語義，不能只靠顏色。
- 自動化契約、`npm run verify` 與指定 DevTools 驗收完成。
- 提交前展示變更文件、驗證結果、DevTools 結果和擬用 Commit Message，未經確認不 commit。
