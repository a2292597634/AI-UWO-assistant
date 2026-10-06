# 首頁留言板並列入口實施計畫

> 執行者使用 executing-plans，沿用現有隔離工作區與已批准設計，由目前代理順序執行。不將先行入口當作留言板業務完成，不自動提交／合併或部署。

**目標：** 按使用者指示，在首頁既有回報區並列提供留言板文字入口，點擊可進入獨立頁面並返回首頁。

**架構：** 保留六項主要圖標；兩個次級入口共用現有 navigateTo 事件。獨立 `subpkg-message-board/pages/board/index` 僅展示尚未開放狀態與投稿規則，不發網路請求或偽造資料。

**限制：** 已完整閱讀 Design Foundation 與 HTML 頁面驗收規格；UI 繁體中文、BEM 類名、Token、44px 熱區、安全區。Node 22，不新增依賴、素材或網路例外。原 E 槽修改保護；若最後將 UI 同步回實際原項目，逐檔核对基線並備份，拒絕覆寫衝突或既有新檔。

- [x] H1：devtools:doctor，對首頁保存修改前真實畫面；先添加首頁留言板入口路由／頁面註冊的行為測試並觀察缺入口失敗。
- [x] H2：修改 home index.ts／wxml／wxss，次級區使用兩個等寬文字卡片，hint、整卡點擊及可讀名稱俱全；保留舊回報路由與主圖標順序。新 board ts／json／wxml／wxss 顯示「留言板尚未開放」，原生禁用投稿、原因說明、返回首頁，註冊獨立分包。
- [ ] H3：更新 home-visual，新增 home-message-board-entry 與 message-board-unavailable 場景；真實點擊／跳轉／返回／舊回報路由均驗證，waitUntil 連續就緒。320／375／393／430 視窗檢查並保留證據，沒有實際切換則保留人工缺口。
- [ ] H4：iterate 後檢視 HTML 與截圖，修復相關問題。路由變更依規範觸發全頁面 final 場景與完整 verify，不以單頁截圖取代。
- [ ] H5：保存規格修訂與審核記錄，清楚区分可進入的未開放頁面與正式投稿。必要時將已驗證的 UI 子集同步原項目（其餘原修改保持），向使用者展示入口位置及截圖，不自動 commit。

H1 測試以 `supportEntries` 的留言板實際 route 透過 `onModuleTap` 送入 navigateTo，再以 app.json 分包檔案註冊核對。UI 外觀由真 DevTools 點擊與截圖驗證，不加入只比對新文案的鏡像測試。

## 執行狀態

H1／H2 完成；H3 場景／全路由覆蓋已補齊，但真點擊、尺寸與截圖未跑通。H4 完整 verify 2,660＋資料契約 100 通過，頁面 final 因 Tool.getInfo 超時保持 blocked。H5 已備份並將 8 個 UI 檔與 2 個測試同步原 E 槽項目，無關原修改保持；沒有自動 commit。詳見 [驗收與阻塞](../../audits/2026-10-06-message-board-home-entry.md)。
