# 冒險分享圖航海士排列設計

## 目標

調整冒險配隊分享圖的航海士排列：以航海士類型分成「冒險、戰鬥、交易」三類，每類內依稀有度 `S → A → B → C` 排列，人物格改為五欄。戰鬥配隊分享圖維持現有排列與版面。

## 現況與問題

目前 `fleet-share-presenter` 將冒險分享圖資料按 `S/A/B/C` 分組，`fleet-share-layout` 再以四欄測量每個稀有度區塊；渲染器的區塊標題也直接使用稀有度。這使同一類型的航海士被拆散，且分享圖每行能容納的人物數少於預期。

## 設計

### 資料模型與排序

`AdventureFleetShareGroup` 改以類型作為分組識別，保留 `officers` 陣列，並增加：

- `zone`：`adventure | combat | trade`，沿用冒險領域既有的 `AdventureTypeZone`。
- `zoneLabel`：由既有 `getZoneLabel` 產生的繁體中文標題，分別為「冒險航海士」「戰鬥航海士」「交易航海士」。

分享 Presenter 建立分組時遵循既有 `ZONE_ORDER`：

1. `adventure`
2. `combat`
3. `trade`

只輸出實際有航海士的分組。每個分組內以既有 `RARITY_ORDER` 排序為 `S → A → B → C`；同一稀有度的航海士保留目前從艦隊配置收集到的順序，避免同稀有度內容無故跳動。未知類型或未知稀有度的資料不進入分享圖，延續現有對未知稀有度的忽略行為。

### 分享圖版面

將冒險分享圖專用的航海士欄數從 4 改為 5。現有的最後一行置中、欄距、人物格高度與區塊間距全部保留；戰鬥分享圖使用的 6 欄常數不變。版面測量仍以實際航海士數量建立格子，技能區與 QR 頁尾會依新的區塊高度順延，不增加額外固定高度。

### 渲染與文案

冒險分組標題改為使用 `zoneLabel`，人數統計與人物素材繪製流程不變。人物框、頭像、稀有度角標與類型角標的繪製順序不變，因此本次不涉及素材或透明度處理。

### 錯誤與相容性

- 空分組不渲染，避免產生沒有內容的標題區塊。
- 冒險技能累計仍依分享圖實際展示的航海士計算，不改變技能資料流。
- 不修改冒險配隊頁面上的選擇、分區或求解邏輯。
- 不修改戰鬥分享圖、不新增依賴、不引入遠程請求或運行時 Node.js API。

## 變更範圍

預計修改：

- `miniprogram/contracts/fleet-share.ts`：更新冒險分享分組契約。
- `miniprogram/presenters/fleet-share-presenter.ts`：改為按類型分組並在分組內按稀有度排序。
- `miniprogram/runtime/fleet-share-layout.ts`：將冒險分組人物欄數設為 5。
- `miniprogram/runtime/fleet-share-renderer.ts`：渲染類型分組標題。
- `tests/presenters/fleet-share-presenter.test.ts`：增加混合類型與稀有度排序案例。
- `tests/runtime/fleet-share-layout.test.ts`：驗證五欄與不重疊高度。

不修改 `WXML`、`WXSS`、頁面互動、資料主檔與生成資料；頁面驗收仍使用既有「冒險配隊分享圖」場景確認生成、可見性、滾動與截圖證據。

## 驗收條件

- 混合冒險、戰鬥、交易航海士時，分享圖分組順序固定為冒險、戰鬥、交易。
- 每一分組內人物的稀有度順序固定為 `S、A、B、C`，同稀有度保留配置順序。
- 每個分組最多五個人物一行；不足五個的最後一行維持置中。
- 冒險分享圖的技能區、頁尾與 QR 區不被人物區塊覆蓋。
- 原有戰鬥分享 Presenter、布局與渲染測試保持通過。
- 相關單元測試、`npm run verify`、`git diff --check` 與頁面驗收報告通過。
