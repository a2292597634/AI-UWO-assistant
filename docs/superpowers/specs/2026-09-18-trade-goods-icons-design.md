# 貿易品淡旺季頁面真實圖示設計

> 狀態：已獲用戶確認，進入實作計畫階段
>
> 日期：2026-09-18

## 1. 目標

為貿易品淡旺季功能的「貿易品清單頁」和「貿易品詳情頁」補上 voyage.tw 對應的真實貿易品圖示，同時維持本倉庫既有的資料三層架構、素材校驗、CloudBase 版本化交付和小程序運行時邊界。

完成後：

- 清單頁每個貿易品條目都能從生成資料取得圖示路徑；
- 詳情頁標題區能顯示同一個貿易品圖示；
- 普通貿易品使用自身來源 ID；有 `iconId` 覆蓋值的貿易品使用覆蓋 ID；
- 656 個現有貿易品的圖示來源可下載、校驗並納入素材發布清單；
- 圖示載入失敗時，文字資料、搜尋、分類、導航和季節矩陣仍可用。

## 2. 背景與現況

貿易品資料位於 `data/master/trade-goods.json`，目前有 656 筆資料。每筆資料已有 `sourceRefs.voyageTw`，並保留少量來源資料中的 `iconId` 覆蓋值；目前生成的索引和詳情沒有輸出圖示路徑，兩個頁面也沒有 `<image>`。

voyage.tw 的來源程式使用下列規則構造貿易品圖示：

```text
https://voyage.tw/img/trade/uwo_<image-id>.png
```

其中 `<image-id>` 是貿易品的 `iconId`，若沒有覆蓋值則使用貿易品自身 ID。現有資料中有 22 筆 `iconId` 覆蓋記錄，其餘貿易品使用自身 ID。

本倉庫目前已將航海士和技能圖示遷移到「下載／校驗／CloudBase 版本清單／資料生成」流程。小程序運行時不應直接依賴 voyage.tw，也不應在頁面程式中新增網路請求或 CloudBase SDK 呼叫。

## 3. 範圍與非目標

### 本次範圍

- 擴充貿易品圖示的來源 URL、下載快取和 PNG 校驗；
- 將去重後的貿易品圖示納入素材依賴索引與 CloudBase 發布計畫；
- 讓貿易品索引和詳情生成資料輸出 `iconPath`；
- 修改清單頁和詳情頁的 WXML、WXSS 與頁面狀態以展示圖示和圖示失敗占位；
- 增加資料管線、生成輸出、頁面標記和圖示失敗降級測試；
- 針對 320px、375px、393px、430px 寬度檢查新增圖示布局不造成橫向溢出。

### 非目標

- 不修改 `archive/`；
- 不修改貿易品名稱、分類、淡旺季規則、港口矩陣或月份計算；
- 不把 voyage.tw URL 直接寫入小程序 WXML、頁面 TypeScript 或生成後的運行時路徑；
- 不新增依賴；
- 不重構現有 CloudBase 發布工具或其他頁面的圖片錯誤處理；
- 不更換現有 UI 圖示、字體或 Design Foundation Token；
- 不在本次順手修復與貿易品圖示無關的門禁、頁面或素材問題。

## 4. 方案決策

採用現有素材管線的擴充方案：

```text
data/master/trade-goods.json
        │ 來源 ID + iconId 覆蓋
        ▼
trade 圖示 URL／檔名解析
        ▼
data/assets/staging/（下載、PNG 解碼、雜湊）
        ▼
data/assets/asset-dependencies.json
        ▼
CloudBase 版本化發布清單
        ▼
npm run data:generate
        ▼
subpkg-trade/trade-goods.js + trade-details-*.js
        ▼
清單頁 + 詳情頁
```

不採用直接使用 voyage.tw URL，因為這會繞過版本清單、第三方站點可用性和小程序運行時邊界。不採用把全部 PNG 放回小程序分包，因為目前業務素材已由 CloudBase 版本化交付，重新放回分包會造成重複資產鏈路和額外首屏下載量。

## 5. 資料與素材模型

### 5.1 圖示 ID 解析

新增共享的純函式規則：

```text
resolvedImageId = trade.iconId ?? trade.sourceRefs.voyageTw
filename        = trade_<resolvedImageId>.png
sourceUrl       = https://voyage.tw/img/trade/uwo_<resolvedImageId>.png
```

以解析後的 image ID 作為資產去重鍵，確保例如 `trade18T903` 和其基礎貿易品共用同一張來源圖示時只保留一份 PNG。運行時仍為每筆貿易品輸出自己的 `iconPath` 映射，不讓頁面自行推測檔名。

### 5.2 運行時契約

在 `RuntimeTradeGoodIndexEntry` 和 `RuntimeTradeGoodDetail` 增加：

```ts
iconPath: string
```

`iconId` 繼續保留在詳情資料中，作為來源語義和後續資料維護的欄位；頁面只消費生成的 `iconPath`。

圖示路徑的生成規則與既有航海士／技能圖示一致：

- 有已校驗的 CloudBase manifest 時，輸出該 manifest 對應的 HTTPS URL；
- 沒有 manifest 的純函式測試仍輸出穩定的本地相容路徑，方便測試生成結果；
- manifest 缺少任一被引用的貿易品圖示時，正式生成失敗，不產生一份看似完整但實際缺圖的運行資料。

## 6. 素材依賴與發布

### 6.1 下載

擴充既有 `tools/asset-pipeline/download-assets.ts`：

- 從 `data/master/trade-goods.json` 建立貿易品圖示項目；
- 使用 `iconId ?? sourceRefs.voyageTw` 建構來源 URL；
- 下載檔案寫入被 `.gitignore` 排除的 `data/assets/staging/`；
- 使用解析後 image ID 作為快取鍵和檔名，避免覆蓋不同來源；
- 保留 HTTP 狀態、大小、SHA-256 和來源 URL 到下載 manifest；
- 全量模式必須驗證 656 筆貿易品都有可用圖示引用，去重後的 PNG 數量另由工具輸出。

下載工具只在構建／維護階段訪問 voyage.tw；小程序運行時不引入該 URL。

### 6.2 依賴索引

擴充 `AssetDependencyIndex`，增加 `tradeIcons`：

```ts
tradeIcons: Record<string, RuntimeAssetReference>
```

依賴索引中的 `roots[].files` 必須包含所有去重後的 `trade_<resolvedImageId>.png`，並為每個貿易品建立唯一且可校驗的路徑引用。既有航海士和技能 root 的排序、去重與所有權規則保持不變。

### 6.3 CloudBase 發布

正常的 `assets:setup` 和 `assets:publish` 流程負責將新增 PNG 納入同一個版本化 release。普通驗證只讀取和檢查清單，不上傳、不刪除舊版本。

本次實作需要一次外部發布操作才能讓真實小程序環境取得新圖示。上傳前要向用戶展示：去重後檔案數、總大小、release 影響範圍和即將上傳的 CloudBase 路徑；未獲用戶確認前不執行上傳或刪除任何雲端資產。

## 7. 頁面設計

### 7.1 清單頁

`miniprogram/subpkg-trade/pages/index/index` 的每張貿易品卡片使用一個 `trade-result__icon` 圖示區：

- 約 `96rpx × 96rpx`，以 `aspectFit` 保持原始圖示比例；
- 圖示左側，文字內容右側；
- 名稱、等級、分類、銷售方式和淡旺季摘要的現有語義不變；
- 圖示提供可理解的 `aria-label`，不依賴色彩或裝飾辨識貿易品；
- 使用圖片懶載入屬性，避免清單頁一次主動預取全部圖片。

頁面在圖示錯誤時只將該條目切換為「圖示載入失敗」占位，不清空整個搜尋結果。重新搜尋或分類後建立新的條目狀態，允許新結果重新嘗試。

### 7.2 詳情頁

`miniprogram/subpkg-trade/pages/detail/index` 的深色標題區增加圖示與標題並排的 hero row：

- 圖示區維持約 `112rpx × 112rpx`；
- 標題、分類、等級和淡旺季摘要保持既有信息層級；
- 矩陣、季節圖例和目前月份標示不改變；
- 圖示錯誤時只顯示「圖示載入失敗」占位，仍可查看完整港口矩陣。

新增樣式只使用 Design Foundation 的既有色彩、字體、間距和圓角 Token。需要在窄屏檢查 hero row、清單卡片和長貿易品名稱，避免固定寬度或圖示造成頁面級橫向滾動。

## 8. 錯誤處理

- 來源 HTTP 非 200、回應不是 PNG 或 PNG 無法解碼：素材管線報錯並停止正式資產整理；
- 已有快取 SHA-256 或大小不匹配：忽略快取並重新下載；
- 生成 manifest 缺少被引用檔案：生成失敗並指出貿易品與檔名；
- 單張圖片運行時載入失敗：保留該條目的文字和操作入口，顯示文字占位，不使用 voyage.tw 或其他遠程 fallback；
- 不因單張圖片錯誤阻斷清單頁初始化、搜尋、分類、詳情導航或詳情矩陣；
- 不做無限重試，不在本次新增頁面級圖片預載或網路請求。

## 9. 測試策略

遵循資料與素材邏輯的紅—綠—重構循環，先補失敗測試再實作。

### 9.1 單元與資料管線

- 貿易品 image ID 解析：普通 ID、`iconId` 覆蓋和相同解析 ID 去重；
- URL 和檔名：只生成 `/img/trade/uwo_*.png` 來源 URL 與 `trade_*.png` 本地檔名；
- 下載 entry：來源 ID、owner key、URL、快取和 limit 行為正確；
- 資產依賴：656 筆貿易品均能映射到唯一合法 root/path，去重檔案只出現一次；
- 生成資料：索引和所有詳情都含正確 `iconPath`，同一輸入兩次生成的 bytes 相同；
- manifest：缺少 trade PNG、錯誤 MIME、錯誤路徑或不一致雜湊時失敗。

### 9.2 頁面契約

- 清單頁 `TradeListItem` 具有 `iconPath`，WXML 顯示圖示並有錯誤占位；
- 詳情 presenter 輸出 `title.iconPath`，詳情 WXML 顯示圖示並有錯誤占位；
- 圖示錯誤不改變搜尋結果數、導航行為或詳情矩陣；
- 新增 WXSS 使用既有 Token，沒有固定超視口寬度或水平滾動。

### 9.3 工程與視覺驗收

至少執行：

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run check:runtime-network
npm run data:check
npm run generate:check
npm run verify
git diff --check
```

在微信 DevTools 以 320px、375px、393px、430px 寬度驗收：

- 清單頁每個可見條目顯示與文字對應的真實圖示；
- 詳情頁標題區顯示同一個圖示；
- 搜尋、分類和進入詳情不因圖片載入延遲而失效；
- 模擬圖片失敗時占位文字可見且矩陣仍可操作；
- 沒有頁面級橫向溢出、重要文字裁切或既有安全區回退。

## 10. 完成條件

- 656 個貿易品都能通過來源圖示解析；
- 下載、校驗、依賴索引和生成流程可重複；
- 清單頁和詳情頁都消費生成的 `iconPath`，不手寫圖示 URL；
- 小程序運行時沒有新增 `wx.request`、`wx.cloud`、Node.js API 或不受控遠程 URL；
- 圖示失敗不會破壞文字資料和既有淡旺季功能；
- 相關測試和工程門禁通過；
- CloudBase 上傳前已展示並獲確認，發布後生成資料引用與新 release 一致；
- 提交前向用戶展示變更文件、驗證結果、DevTools 結果和擬用 commit message，未獲確認不 commit。
