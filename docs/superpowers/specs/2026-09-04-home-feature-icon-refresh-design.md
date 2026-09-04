# 首頁功能圖標改版設計規格

## 目標

更新首頁五個功能入口圖標，使圖標在相同的 `96×96` 運行畫布中具有一致的視覺占用範圍，並以清楚分離的語義色與圖形建立辨識度。首頁布局、路由、功能名稱與資料流保持不變。

## 問題證據

目前五個圖標的文件尺寸都為 `96×96`，但透明邊界不一致：

| 圖標 | 現有輸出透明邊界 |
| --- | ---: |
| 航海士名鑑 | `72×72` |
| 戰鬥模擬艦隊 | `86×88` |
| 冒險模擬艦隊 | `86×87` |
| 交易品淡旺季查詢 | `86×86` |
| 資料維護 | `86×87` |

因此 CSS 雖然給每個圖片相同的 `96rpx` 尺寸，航海士名鑑仍會看起來偏小，且各圖標的實體輪廓密度不完全一致。

## 已確認的視覺方案

### 共通造型

- 延續「古典航海資料館」的黃銅徽章語言：黃銅外框、暗色底材、細刻線與適度浮雕高光。
- 每枚圖標使用透明背景，圖形前視置中，外框和主要內容的視覺占用範圍一致。
- 運行輸出固定為 `96×96` PNG，目標非透明內容邊界為約 `84–88px`，避免透明留白造成視覺大小漂移。
- 不添加文字、字母、數字、Logo、水印、人物臉部或 Emoji；圖形與首頁名稱共同提供語義。

### 五個入口的圖形與顏色

| 首頁入口 | 主圖形 | 語義色 | 設計意圖 |
| --- | --- | --- | --- |
| 航海士名鑑 | 羅盤玫瑰＋開本 | 深靛藍 | 資料、定位、名鑑 |
| 戰鬥模擬艦隊 | 航海炮＋小型戰船 | 朱紅 | 戰鬥、火力、艦隊 |
| 冒險模擬艦隊 | 六分儀＋航線弧與星標 | 海藍青 | 探索、航線、冒險 |
| 交易品淡旺季查詢 | 天平＋貨箱與錢幣 | 翡翠綠 | 交易、貨物、供需平衡 |
| 資料維護 | 航海日誌＋羽毛筆 | 暖陶棕 | 編輯、紀錄、維護 |

共通黃銅和暗色底材維持整體品牌一致；深靛藍、朱紅、海藍青、翡翠綠和暖陶棕負責入口間的主要辨識差異。交易品必須使用清晰可見的綠色，資料維護不再使用容易混淆的橄欖綠。

## 素材與程式邊界

- 由內置 imagegen 生成五張高解析透明背景主源，覆蓋以下既有文件名：
  - `data/master/ui-assets/feature-officer-catalog-source.png`
  - `data/master/ui-assets/feature-battle-fleet-source.png`
  - `data/master/ui-assets/feature-adventure-fleet-source.png`
  - `data/master/ui-assets/feature-trade-goods-source.png`
  - `data/master/ui-assets/feature-data-maintenance-source.png`
- `tools/ui-assets/config.ts` 繼續作為素材處理配方唯一來源，不新增依賴、不修改輸出尺寸與 feature 單檔 `12KB` 預算。
- 透過 `npm run assets:ui` 生成 `miniprogram/assets/ui/feature-*.png` 與 `data/audit/ui-asset-build-report.json`；不得手動編輯生成文件。
- `miniprogram/pages/home/index.ts`、路由、WXML 結構與首頁三列布局不變；現有 `.module-grid__icon` 的 `96rpx` 渲染尺寸保留，由主源透明邊界統一視覺大小。
- 不修改 `archive/`、`data/master/trade-goods.json`、`miniprogram/generated/`、Cloud Function、遠程請求或依賴。

## 驗證與驗收

### 自動化驗證

- 素材測試納入五個 feature 圖標，確認所有輸出為 `96×96`、單檔不超過 `12KB`、透明邊界存在且寬高落在 `84–88px` 目標區間。
- 素材輸出需保持 deterministic：相同主源重建的 bytes、報告與總體積一致。
- 執行 `npm run assets:ui:check`，確認主源、輸出與報告沒有漂移。
- 執行首頁相關測試、`npm test`、`npm run lint`、`npm run typecheck` 與 `npm run check:runtime-network`。

### 微信 DevTools 手動驗收

- 320px、375px、393px、430px 寬度下，首頁五個圖標無橫向溢出，第一行三枚與第二行交易品圖標視覺大小一致。
- 交易品圖標一眼可見綠色，且與海藍冒險、暖陶棕資料維護分離。
- 圖標載入失敗時既有 CSS fallback 仍可工作；首頁入口名稱和路由不變。

## 不在本次變更

- 不修改首頁入口順序、三列布局、功能名稱或任何交易查詢業務邏輯。
- 不替換交易詳情頁中的季節、雨季或淡旺季圖示。
- 不處理整體小程序主包 `2MiB`／`1.5MB` 體積門禁；該問題按既有任務另行處理。
