# 真實畫面 UI 精修實施計畫

> 執行方式：本任務逐項實施；依據 `2026-09-22-ui-refinement-design.md` 與使用者修正後的五入口約束。Git 提交另待確認。

**目標：** 恢復可靠的真實頁面驗收，再完成既有功能的視覺精修。

**架構：** 沿用 WXML、WXSS 與共享元件；樣式僅使用 Design Foundation。保留事件、資料模型和業務流程。

**技術：** TypeScript、Vitest、微信開發者工具 wechatide。

## 全域約束

- 編碼前完整閱讀 Design Foundation、HTML 頁面验收與技能角標規範；界面繁體中文。
- 五入口數量、同級關係、順序保持不變，不新增依賴或修改權威資料。
- 分支 `codex/phase-1-ui-review-recovery`；既有未追蹤文件保持原樣。
- UI 用真實 DevTools 驗證；驗收邏輯使用紅綠測試。

## 任務與進度

- [x] 修正 `tools/miniprogram-review/wechatide.ts` 的轉場等待。先在 `tests/miniprogram-review/wechatide.test.ts` 重現短暫缺失被直接判定超時，再用期限內獨立查詢修正，保留連線錯誤。新增底層超時與非棧頂過期頁錯誤覆蓋，9 個測試通過；最終 9 場景及補充詳情流程均通過。
- [x] 取得首頁、名冊、配隊、交易品、兌換碼、回報、詳情及篩選基線。報告保存在 artifacts，未覆蓋狀態如實標示。
- [x] 精修 `pages/home`、`pages/catalog`、`subpkg-detail/pages/detail`：統一留白、列表與篩選固定操作區，保留所有綁定。
- [x] 精修 `components/config-bar`、`components/mode-tabs`、兩類配隊頁：配置卡減重，修復統計窄欄，空位網格精簡，保留已配置內容空間。
- [x] 精修交易品與兌換碼：一致內距、列表層級，禁用原因就近展示；不觸發提交。
- [x] 為變更頁補充 `tools/miniprogram-review/scenarios/`，包含等待、截圖、無寫入的搜尋／篩選／滾動步驟及 watchPaths。
- [x] 執行 iterate，直接識別每張截圖；修正後跑 final、verify 和 diff 檢查，整理 HTML 對照報告。

## 具體驗證

```powershell
npx vitest run tests/miniprogram-review
npm run devtools:changed -- --mode iterate --summary "真實畫面驅動的 UI 精修"
npm run devtools:changed -- --mode final --summary "UI 精修最終驗收"
npm run verify
git diff --check
```

預期：自動化沒有 failed／blocked，報告有 after 圖片，工程門禁退出碼為 0；未實測裝置不能標示通過。

## 最終驗證結果

- 2026-09-23 完整 npm run verify 退出碼 0：165 個測試文件、2089 項測試通過；資料契約額外 58 項通過。
- 最終頁面驗收：2026-09-22T113103517Z-jc8pop，9 場景全部通過；錯誤格式補強後複驗：2026-09-22T161547284Z-540lzf，名冊搜尋至詳情首尾通過。
- git diff --check 通過；data/master、generated、依賴無變更。
- 對照報告：artifacts/miniprogram-review/ui-design-review/report.html；圖片逐張人工識別，其他裝置與未覆蓋狀態明確標示。未提交 Git。
