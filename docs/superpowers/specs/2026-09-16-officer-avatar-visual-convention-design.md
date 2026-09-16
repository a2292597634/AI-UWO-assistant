# 航海士名鑒與配隊分享頭像視覺規範設計

## 目標

參考 voyage.tw 航海士列表與使用者提供的頭像截圖，統一航海士名鑒和生成的配隊分享長圖中的人物頭像分層、稀有度角標、類型角標與品質背景比例。

本次只調整視覺呈現，不改變航海士資料、技能資料、配隊排序、分享流程或互動行為。

## 參考規則

voyage.tw 的人物單格以 `60×60px` 為基準：

- 品質背景填滿人物單格。
- 人物圖填滿人物單格，透明邊角讓背景仍可見。
- 稀有度角標是一張覆蓋整格的透明圖層；可見徽章位於左上，不是獨立的小方塊。
- 類型角標使用約 `16×16px` 的視覺尺寸，位於左下並保留少量內縮。

本專案已有對應本地素材：`uwo-bg-grade-*.png`、`uwo-icon-grade-*.png` 與 `uwo-icon-class-*.png`。其中稀有度素材包含 `60×60` 透明畫布，不能再以小尺寸 `<image>` 直接縮放其畫布。

## 範圍

### 納入

- 航海士名鑒主列表頭像。
- 航海士名鑒技能反查列表中的人物縮圖。
- 戰鬥與冒險配隊生成分享長圖中的人物頭像。
- 相關 Renderer、WXSS 與靜態／單元測試契約。

### 不納入

- 戰鬥／冒險配隊編輯頁的槽位、候選列、排除卡與貢獻者頭像。
- 航海士與技能資料、Presenter、Solver、保存流程與分享流程。
- 新增素材、遠程請求、依賴或共用 WXML 頭像元件。

## 視覺分層設計

所有納入範圍的頭像都遵循同一順序：

```text
品質背景 framePath
        ↓
人物 portraitPath
        ↓
稀有度 rarityIconPath（整格覆蓋，左上可見）
        ↓
類型 typeIconPath（左下，小比例）
        ↓
姓名文字（只在含姓名的容器繪製）
```

### 名鑒 WXSS

| 使用位置 | 人物格 | 背景／人物／稀有度層 | 類型層 | 類型錨點 |
| --- | ---: | ---: | ---: | --- |
| 主列表 | `104rpx` | `104rpx × 104rpx` | `28rpx × 28rpx` | 左下，`4rpx` 內縮 |
| 技能反查縮圖 | `80rpx` | `80rpx × 80rpx` | `21rpx × 21rpx` | 左下，`4rpx` 內縮 |

稀有度層與人物格同寬高、左上 `0` 定位；類型層改為左下定位。既有 `aspectFill`／`aspectFit` 模式、失敗回退與點擊事件保持不變。

### 分享圖 Renderer

分享圖維持既有 `84px` 邏輯人物格與布局，不改船隻、分組、技能欄數或內容高度。`getOfficerVisualRects` 改為輸出：

- `frame`：品質背景完整人物格。
- `portrait`：與 `frame` 相同矩形，不再額外縮進。
- `rarity`：與 `frame` 相同矩形，使用完整透明稀有度素材。
- `type`：尺寸依 `frameSize × 16 / 60` 計算（`84px` 約為 `22px`），左下約 `4px` 內縮。

Renderer 會在人物圖後繪製稀有度層，再繪製類型層。稀有度素材加入既有 `ui` 預載流程；載入失敗是可降級的 UI 素材錯誤，不改 QR 缺失的致命錯誤語義。

背景色正常情況由既有品質背景資產提供；不另建一套與素材可能不一致的 CSS／Canvas 色板。背景資產缺失時沿用目前的佔位與降級回報。

## 實作邊界

預計修改：

- `miniprogram/pages/catalog/index.wxss`
- `miniprogram/runtime/fleet-share-renderer.ts`
- `tests/pages/catalog-page.test.ts`
- `tests/runtime/fleet-share-layout.test.ts`
- `tests/runtime/fleet-share-renderer.test.ts`
- `tests/architecture/fleet-share.test.ts`

不修改 `miniprogram/presenters/officer-visuals.ts` 的資料路徑契約；它已提供本次需要的背景、稀有度與類型素材路徑。

## 測試設計

### 名鑒

- 主列表稀有度層使用整格尺寸並以左上定位。
- 主列表與技能反查縮圖的類型層都以左下定位。
- 既有人物載入失敗、技能反查與技能點擊契約保持通過。

### 分享 Renderer

- `getOfficerVisualRects` 輸出 `rarity`，且 `rarity` 與 `frame` 同矩形。
- 人物矩形與背景矩形同尺寸，類型矩形在人物格左下範圍內。
- 靜態契約確認背景先於人物、人物先於稀有度、稀有度先於類型。
- 稀有度素材會進入 UI 預載；空路徑仍只增加可降級計數。
- 現有空艦隊、QR 缺失、素材超時與技能圖示降級測試保持通過。

### 工程驗證

- 相關 Vitest 測試。
- `npm run verify`。
- `git diff --check`。
- 確認 `archive/`、`data/master/`、`miniprogram/generated/`、Cloud Function、Controller、Presenter、Domain 與 Solver 沒有變更。
- 確認未新增依賴、遠程 Runtime 請求或 Node.js API。

## 完成條件

- 名鑒主列表與技能反查人物縮圖符合 `60×60` 基準的分層比例：背景／人物滿格、稀有度完整透明覆蓋、類型左下。
- 戰鬥與冒險分享圖使用相同分層規則，且分享圖保留既有布局與降級語義。
- 相關測試、完整驗證與 `git diff --check` 通過。
- 工作區原有與本次無關的未提交文件保持不變。
