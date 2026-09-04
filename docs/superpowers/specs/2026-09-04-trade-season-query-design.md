# 貿易品淡旺季查詢設計規格

日期：2026-09-04
變更：貿易品淡旺季查詢
分支：codex/phase-1-trade-season-query

## 1. 背景與目標

新增「貿易品淡旺季查詢」模組，將 voyage.tw 的貿易品、港口季節與淡旺季資料整理為小程序本地資料，讓使用者可以：

1. 先搜尋或篩選某個貿易品；
2. 查看該貿易品的分類、淡旺季規則與銷售港口；
3. 在同一頁看完不同港口的 1–12 月完整季節、雨季與淡旺季狀態；
4. 以目前遊戲月份作醒目提示，但不取代全年矩陣。

本功能只提供資料查詢，不包含即時價格、利潤計算、航線推薦、採購量或使用者自訂資料。

## 2. 已確認的方案

### 2.1 主流程

採用「搜尋某項貿易品 → 查看貿易品詳情 → 比較不同港口全年矩陣」：

    貿易品入口
      ↓
    搜尋／類型篩選
      ↓ 點擊貿易品
    貿易品詳情
      ├─ 貿易品名稱、分類、名產標記
      ├─ 旺季／淡季摘要
      ├─ 目前遊戲月份提示
      └─ 不同港口的 1–12 月矩陣

搜尋頁只負責找到貿易品，詳情頁才呈現完整港口矩陣。這樣可以避免首屏直接載入所有港口資料，也保留後續加入更多貿易品資訊的空間。

### 2.2 矩陣呈現

- 每個港口一列，所有 1–12 月以 12 個等寬欄位同列顯示。
- 不使用左右滑動或頁面級橫向滾動。
- 月份集中顯示於矩陣表頭，避免每個儲存格重複較長的月份文字。
- 每格保留網站語義中的季節／天候圖示，以及 ▲ 旺、▼ 淡、🅞 一般狀態圖示。
- 圖示語義在矩陣上方提供小型圖例；每格同時提供可讀的輔助標籤，狀態不依賴顏色或圖示單獨判斷。
- 目前遊戲月份以金色框線及表頭強調；其他月份仍完整保留。
- 在 320px、375px、393px 與 430px 寬度下，透過縮小儲存格內邊距與圖示尺寸保持 12 欄完整可見。

### 2.3 遊戲月份校準

以日本時區的日曆日為基準，假設每日 00:00（日本時區）換算到下一個遊戲月份：

- 2026-09-04 JST 對應遊戲內 12 月；
- 現實世界每增加 1 日，遊戲月份增加 1；
- 月份超過 12 後循環回 1；
- 計算不使用使用者裝置的本地時區。

計算定義：

    anchor = 2026-09-04T00:00:00+09:00
    deltaDays = floor((now - anchor) / 1 日)
    gameMonth = ((deltaDays + 11) mod 12 + 12) mod 12 + 1

實作時使用 UTC timestamp 加固定 +09:00 基準，避免 Date 直接取本地年月日造成時區差異。

## 3. voyage.tw 資料來源與映射

### 3.1 使用的來源

來源為 voyage.tw 的靜態 JavaScript 資料，不在小程序執行期請求網站：

- json.js：https://voyage.tw/js/json.js?v=2026052501，提供貿易品、港口、分類淡旺季規則、港口季節配置與網站圖示映射；
- lang_1.js：https://voyage.tw/js/lang_1.js?v=1779690379，提供繁體中文貿易品名稱、港口名稱、分類名稱、季節名稱與月份名稱；
- map.js：https://voyage.tw/js/map.js?v=2026052501，用於確認網站如何把上述資料組合到城市市場、貿易品清單與詳情視圖；不直接作為小程序執行期依賴。

既有 archive 快照保持不變；由匯入工具產生新的版本化來源快照，並以雜湊與來源 URL 固定可追溯性。既有快照只有航海士相關資料與受限語言片段，不足以支援完整貿易品模組，因此不可直接以缺失欄位猜測資料。

### 3.2 來源欄位

| 來源資料 | 用途 |
| --- | --- |
| trades | 656 筆貿易品、分類、名產等級、固定銷售港口、`v`／`vc` 交換資料、`nlp` 無淡旺季標記、特殊／交換品標記與圖片覆寫 |
| city_trades | 港口與可銷售貿易品的關係，用來反向建立貿易品的銷售港口 |
| json_city | 港口名稱、港口 ID 與 `ss` 港口季節配置索引（`s` 不作季節索引） |
| tradetype_pm | 20 個貿易品分類的旺季／淡季季節規則 |
| seasons | 10 組港口季節配置，每組包含 1–12 月的季節 ID |
| emoji_ss | 季節／天候圖示：春、夏、秋、冬、旱季、雨季、熱帶、寒帶、聖誕 |
| emoji_pm | 狀態圖示：▲、▼、🅞 |
| lang_1 | 所有繁體中文顯示文字，包括 trade*、city*、tradetype*、seasons* 與 mon* |

網站目前可解析出 656 筆貿易品、224 個港口、20 個貿易品分類與 10 組港口季節配置。資料匯入時以來源的 ID 及關係為準，不把顯示名稱當作關聯鍵。

### 3.3 圖示與素材

- 季節、天候與淡旺季狀態沿用網站的靜態字元語義，並在小程序內以本地常數輸出，不載入網站遠程 URL。
- 矩陣使用「季節圖示 + 狀態圖示」的緊湊形式；圖例、無障礙標籤與詳情摘要提供文字意義。
- 貿易品圖片若納入詳情標題，依網站 img_src 的 ID／覆寫規則下載到既有本地素材管線，再以本地路徑生成；找不到圖片時顯示文字與分類標記，不讓遠程圖片成為功能依賴。
- 不在 miniprogram/ 執行 wx.request、wx.cloud、遠程 URL 或 Node.js API。

## 4. 三層資料架構

### 4.1 Archive：來源快照

新增版本化來源快照，不修改既有快照內容。快照至少包含：

- 完整 json.js；
- 完整繁體中文 lang_1.js；
- 匯入判讀所需的 map.js；
- 來源 manifest、下載時間、版本參數、URL、檔案大小與 SHA-256。

map.js 僅作為來源行為證據與匯入測試 fixture，不進入小程序 runtime。

### 4.2 Master：唯一手動維護資料

新增 data/master/trade-goods.json，保存經匯入、轉換與人工審核後的貿易品權威資料。建議結構分為：

- tradeGoods：貿易品基本資料與銷售港口 ID；
- tradeTypes：20 個貿易品分類與分類淡旺季規則；
- ports：港口顯示資料與季節配置 ID；
- seasonProfiles：每個港口季節配置的 12 個月份；
- glyphs：季節／天候與淡旺季狀態的本地字元映射；
- sourceSnapshot：來源快照版本與欄位證據。

固定銷售港口不存在的交換品、特殊品、區域限定品或公會／Boss 品不被刪除，改以 salesMode 標記。這些貿易品可以被搜尋，但詳情頁顯示「目前沒有固定銷售港口矩陣」的明確空狀態。

### 4.3 Generated：工具自動生成

由 npm run data:generate 產生，不手動修改：

- miniprogram/subpkg-trade/trade-goods.js：搜尋索引與貿易品摘要；
- miniprogram/subpkg-trade/trade-reference.js：分類、港口、季節配置與圖示字元；
- miniprogram/subpkg-trade/ 下的搜尋頁、貿易品參照資料、詳情分片與索引：貿易品完整資料放在同一分包，避免接近微信主包 2 MiB 限制；
- miniprogram/contracts/runtime-data.ts 的貿易品 runtime contract 對應上述輸出。

小程序 runtime 只透過貿易品 Data Store 讀取生成資料，頁面與 presenter 不直接 require generated 資料。

## 5. Runtime 資料模型與資料流

### 5.1 Runtime contract

使用緊湊且不重複資料的結構：

    interface RuntimeTradeGoodIndexEntry {
      id: string
      name: string
      categoryId: string
      categoryName: string
      rank: number | null
      salesMode: 'fixed-port' | 'barter' | 'special'
      salesPortCount: number
      searchAliases: string[]
    }

    interface RuntimeTradeGoodDetail {
      id: string
      name: string
      categoryId: string
      categoryName: string
      rank: number | null
      iconId: string | null
      salesMode: 'fixed-port' | 'barter' | 'special'
      salesPortIds: string[]
      peakSeasonIds: string[]
      lowSeasonIds: string[]
    }

    interface RuntimeTradePortReference {
      id: string
      name: string
      regionName: string | null
      seasonProfileId: string
    }

    interface RuntimeTradeSeasonProfile {
      id: string
      monthSeasonIds: string[]
    }

monthSeasonIds 必須恰好包含 12 個元素，索引 0 對應遊戲 1 月。淡旺季不把每個港口的 12 個狀態重複存入資料，而是在 presenter 依「貿易品分類規則 + 港口月份季節」計算：

    seasonId = port.seasonProfile.monthSeasonIds[gameMonth - 1]
    seasonStatus =
      peakSeasonIds 包含 seasonId → peak
      lowSeasonIds 包含 seasonId  → low
      其他                       → normal

### 5.2 讀取流程

    頁面
      ↓
    trade presenter / trade query
      ↓
    trade data store
      └─ subpkg-trade 搜尋頁、索引、參照資料與詳情分片
      ↓
    純函式建立 12 個月份矩陣

搜尋、類型篩選、狀態計算、月份校準與矩陣投影均保持純函式，方便在不啟動微信環境的情況下測試。

## 6. 頁面與互動設計

### 6.1 頁面範圍

- miniprogram/subpkg-trade/pages/index/index：貿易品搜尋與清單；
- miniprogram/subpkg-trade/pages/detail/index：貿易品詳情與港口矩陣；
- miniprogram/app.json：新增頁面與貿易品分包；
- miniprogram/pages/home/index.ts：在首頁主要功能資料中新增「貿易品」模組；
- miniprogram/pages/home/index.wxml：讓「貿易品」以主要功能卡形式顯示，不放在「資料維護」次要區域；
- data/master/ui-assets/feature-trade-goods-source.png：新增首頁入口圖示來源，透過既有 UI 素材流程生成本地 feature-trade-goods.png；
- 首頁「啟航港口」功能區：與航海士名鑑、戰鬥模擬艦隊、冒險模擬艦隊並列顯示「貿易品」卡片，點擊後進入貿易品分包搜尋頁。

頁面全部使用繁體中文，樣式類名使用英文 BEM 命名。

首頁入口的具體行為：

- 圖示文字為「貿易品」，副標或頁面說明使用「淡旺季查詢」；
- 入口使用既有 module-grid 的尺寸、按壓狀態、圖片錯誤回退與本地路徑；
- 主要功能區由 3 個卡片擴充為 4 個卡片，資料維護仍保留在次要入口；
- 不新增首頁第二個搜尋框或首頁內嵌矩陣，首頁只負責導航。

### 6.2 搜尋頁

- 首屏顯示單一「搜尋貿易品」輸入框；
- 提供貿易品分類篩選；
- 清單列顯示貿易品名稱、分類、名產／普通標記、旺季／淡季摘要與港口數；
- 點擊列導向詳情頁並傳遞貿易品 ID；
- 無結果時保留搜尋條件並顯示可理解的繁體中文空狀態；
- 交換品或特殊品保留在清單中，使用狀態標記區分沒有固定銷售港口矩陣的資料。

### 6.3 詳情頁

頁面由上至下：

1. 貿易品標題、分類、等級與可用本地圖片；
2. 旺季／淡季文字摘要；
3. 目前遊戲月份與校準日期；
4. 季節／天候／淡旺季圖例；
5. 港口 1–12 月矩陣；
6. 資料來源與特殊資料狀態說明。

港口矩陣規則：

- 表頭一行顯示 1月 至 12月；
- 每個港口一行，左側顯示港口名稱與區域；
- 12 個儲存格全部在可視寬度內；
- 儲存格顯示季節／天候圖示與 ▲、▼ 或 🅞；
- aria-label／可讀文字包含月份、季節與「旺／淡／一般」；
- 12 月目前為遊戲月份時，對應表頭及每個港口的 12 月儲存格使用金色目前狀態；
- 任何寬度不得出現頁面級水平溢出或要求左右滑動。

## 7. Design Foundation 遵循事項

完整遵循 docs/superpowers/specs/2026-08-09-design-foundation-design.md：

- 使用既有 --uwo-* 顏色、字體、間距、圓角、陰影與安全區 Token；
- 維持紙張／航海資料卡的視覺語氣，不新增一套品牌色；
- 重要操作維持至少 88rpx 觸控高度，輸入文字不小於規範值；
- 淡旺季不只用顏色區分，保留圖示、文字摘要與無障礙標籤；
- 矩陣是密集資料視圖，優先減少裝飾、保留欄位對齊與可讀性；
- 不新增依賴、不載入遠程資源、不把 Demo 樣式直接複製成 runtime 全域樣式。

## 8. 錯誤與邊界處理

### 8.1 搜尋與詳情

- 搜尋關鍵字為空：顯示完整貿易品索引；
- 查無貿易品 ID：顯示「找不到此貿易品資料」並提供返回入口；
- 詳情分片載入失敗：顯示頁面級錯誤文字與重試按鈕，不崩潰；
- 圖片不存在：降級為文字／分類標記，矩陣照常可用。

### 8.2 資料完整性

- 貿易品 ID、港口 ID、分類 ID 不可重複；
- 每個固定銷售港口必須有港口名稱與季節配置；
- 每個季節配置必須有完整 12 個月份；
- peakSeasonIds 與 lowSeasonIds 的重疊資料列為阻擋錯誤，避免同月同時顯示淡旺；
- 未知季節 ID、未知狀態代碼、錯誤月份長度與失效圖片映射必須在 data:check 報告；
- 來源中沒有固定港口的貿易品不可被轉換成虛構港口，必須呈現特殊狀態。

## 9. 測試與驗收

### 9.1 TDD 優先單元

先建立失敗測試，再以最小實作使其通過，最後重構：

- tests/pages/home-page.test.ts：首頁 modules 包含貿易品、路由與本地入口圖示；
- tests/import/parse-trades.test.ts：解析 trades、city_trades、json_city、tradetype_pm、seasons 與語言資料；
- tests/import/transform-trades.test.ts：ID、港口反向關係、特殊品標記與淡旺季轉換；
- tests/data-contract/trade-goods-schema.test.ts：必填欄位、唯一鍵、12 月份、季節規則與異常；
- tests/domain/trade-season-query.test.ts：搜尋、分類篩選、狀態投影、固定港口與無港口空狀態；
- tests/domain/game-month.test.ts：校準日、前一天、後一天、跨年與跨 12 月循環；
- tests/runtime-contract/trade-runtime.test.ts：生成輸出符合 runtime contract；
- tests/data-pipeline/trade-runtime-output.test.ts：生成結果確定性與分片索引一致性。
- tests/ui-assets/build-ui-assets.test.ts：新增首頁貿易品圖示的輸入、輸出與素材預算。

遊戲月份至少固定驗證：

| 日本時區日期 | 期望遊戲月份 |
| --- | --- |
| 2026-09-03 | 11 |
| 2026-09-04 | 12 |
| 2026-09-05 | 1 |
| 2026-09-16 | 12 |

### 9.2 自動化門禁

完成實作後至少通過：

    npm run data:check
    npm run data:generate
    npm run check:runtime-network
    npm run typecheck
    npm test
    npm run verify
    git diff --check

generate:check 必須確認所有生成檔由 data/master/ 可重現，且不手動修改 miniprogram/generated/ 或貿易品詳情分片。

### 9.3 微信 DevTools 手動驗收

在 320px、375px、393px、430px 寬度檢查：

- 搜尋、分類篩選、清單點擊與返回流程正常；
- 貿易品詳情顯示完整 1–12 月；
- 所有港口的 12 個月份同列可見，不需左右滑動；
- 月份表頭與港口儲存格對齊；
- 2026-09-04 日本時區顯示遊戲 12 月；
- 12 月金色目前狀態在每個港口列位置一致；
- 季節、雨季與淡旺季圖示均有圖例與文字語義；
- 無固定銷售港口的特殊品有明確空狀態；
- 無頁面級橫向溢出，返回、重試、圖片降級狀態正常。

## 10. 明確不在本次範圍

- 即時抓取 voyage.tw 或任何外部 API；
- 貿易品即時價格、價格歷史、利潤與路線計算；
- 港口距離、航線規劃與船隊建議；
- 使用者自訂貿易品、手動編輯季節或雲端同步；
- 修改既有航海士、技能、戰鬥配隊與冒險配隊資料；
- 未經確認的 npm 依賴、遠程素材或全域樣式重構。

## 11. 預計變更邊界

預計新增或修改：

- archive/：新增版本化 voyage.tw 來源快照，不修改既有快照；
- data/master/trade-goods.json；
- data/schema/trade-goods.schema.json；
- tools/import/：貿易品來源解析與轉換；
- tools/data-pipeline/：貿易品 runtime 生成與確定性檢查；
- miniprogram/contracts/runtime-data.ts；
- miniprogram/subpkg-trade/runtime/trade-data-store.ts；
- miniprogram/domain/：貿易品搜尋、淡旺季與遊戲月份純函式；
- miniprogram/generated/ 與 miniprogram/subpkg-trade/：自動生成輸出與詳情分片；
- miniprogram/subpkg-trade/pages/index/、miniprogram/subpkg-trade/pages/detail/；
- miniprogram/app.json、miniprogram/pages/home/index.ts、miniprogram/pages/home/index.wxml、首頁入口相關素材設定；
- data/master/ui-assets/feature-trade-goods-source.png 與 miniprogram/assets/ui/feature-trade-goods.png；
- 對應 tests/ 測試檔。

明確不修改既有無關頁面、既有資料內容、npm 依賴與 runtime 網路邊界。

## 12. 完成條件

- 可從小程序入口搜尋貿易品並進入詳情；
- 首頁「啟航港口」主要功能區有清楚的「貿易品」入口圖示，點擊可進入貿易品搜尋頁；
- 任何固定銷售港口的貿易品均可查看不同港口完整 1–12 月矩陣；
- 12 個月份在同一行完整顯示，不依賴左右滑動；
- 遊戲月份以 2026-09-04 JST＝12 月為基準正確循環；
- 季節／雨季／淡旺季圖示語義與 voyage.tw 對齊，並有文字可讀替代；
- 來源資料可追溯至 archive，master 與 generated 三層邊界清楚；
- 無遠程 runtime 請求與新增依賴；
- 相關自動化測試、data:check、generate:check 與 npm run verify 通過；
- 提交前展示變更文件、驗證結果與擬用 commit message，等待使用者確認後提交。
