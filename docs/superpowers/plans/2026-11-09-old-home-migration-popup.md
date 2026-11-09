# 舊端首頁遷移彈窗實作計畫

依已確認的設計，舊端首頁顯示不可關閉的遷移彈窗，使用微信原生跳轉打開新端正式版。採用既有 Design Foundation，使用 Node 22 與已鎖定的依賴。

- [ ] 在 `tests/pages/home-page.test.ts` 驗證首頁舊入口無點擊綁定、跳轉只呼叫固定 AppID 的正式版、連點只發出一次請求、取消後不報錯及失敗後可重試。先跑測試確認缺少功能。
- [ ] 在 `miniprogram/pages/home/index.wxml` 保留首頁畫面作背景並移除舊入口事件。加入固定全畫面遮罩及「前往新版」按鈕。在 `index.wxss` 套用既有 Token。在 `index.ts` 實作 `onOpenNewMiniProgram` 和狀態更新。
- [ ] 首頁場景檢查彈窗與文案。留言板從原分包路徑進入，回首頁後驗證彈窗。微信確認和正式版跳轉用一般微信帳號在真機核對。
- [ ] 通過定向測試、`npm run verify`，執行 DevTools 的 iterate 和 final 驗收。展示變更及擬用提交訊息並依 AGENTS.md 等待確認。
