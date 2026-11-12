# 兌換碼 CloudBase 部署

## 雲函數

`cloudfunctions/coupon-redemption/` 是唯一向 LINE Games 官方兌換 endpoint 發出 HTTPS 請求的元件。

```text
cloudfunctions/coupon-redemption/
  index.js                       — CloudBase entry、呼叫來源雜湊與安全回應
  coupon-redemption-service.js   — 伺服器白名單、節流、官方結果映射
  line-games-client.js           — 官方頁面 session、URL encoded POST 與 timeout
  package.json                   — wx-server-sdk@4.0.2
  cloudbaserc.json                 — CloudBase CLI 部署設定（函數逾時 10 秒）
```

官方請求固定送往：

```text
POST https://coupon-front.line.games/sbc/UWOGL/useGameCoupon
Referer: https://coupon-front.line.games/sbc/UWOGL
```

請求欄位為 `gameServerId`、`userNo` 與 `couponNo`，並照官方表單帶入空白的 `os`、`appStoreCd` 隱藏欄位。雲函數不將玩家設定或兌換碼寫入 CloudBase Database；日誌只記錄 request ID 與結果代碼，不記錄暱稱、兌換碼、官方原始 body 或完整 OpenID。

提交前會先 GET 官方頁面取得 `Set-Cookie`（例如 `JSESSIONID`），再將 cookie 帶入 `useGameCoupon` 的 POST；POST 同時使用官方 AJAX 的 `charset=UTF-8`、`Origin`、`X-Requested-With` 與瀏覽器 `User-Agent` 標頭。這與官方頁面在同一瀏覽器 session 內提交表單的流程一致，也可避免 CloudFront 將無瀏覽器標頭的請求攔截。

## 部署

1. 確認 CloudBase 環境為 `cloud1-d7gxfuxfe813b4eaa`，且出站 HTTPS 可連至 `coupon-front.line.games:443`。
2. `cloudbaserc.json` 將 `coupon-redemption` 的函數逾時設為 10 秒；官方 HTTP client 的總逾時預算為 5 秒（GET 與 POST 共用），兩者需保持前者較長。
3. 在微信開發者工具中，右鍵 `cloudfunctions/coupon-redemption/`，選擇「上傳並部署：雲端安裝依賴」後，確認雲函數逾時仍為至少 10 秒。
4. 如使用 CloudBase CLI，可先執行 `tcb config update fn coupon-redemption --timeout 10 -e cloud1-d7gxfuxfe813b4eaa`，再執行 `tcb fn deploy coupon-redemption`；部署來源必須包含同一目錄的 `package.json`。
5. 不需設定 AppSecret、API token 或資料庫 collection；不要在環境變量、程式碼、測試或日誌中加入兌換碼。
6. 先執行本地測試與 `npm run verify`，再由使用者在微信開發者工具中以一組有效玩家設定和一次性兌換碼手動驗證。

## Runtime 網路邊界

- 兌換分包經 `miniprogram/subpkg-coupon/runtime/coupon-redemption-service.ts` 呼叫已登記的 `coupon-redemption` 雲函數。
- 小程序頁面不含官方 URL、不呼叫 `wx.request`，也不直接訪問 CloudBase Database。
- 官方伺服器清單是版本控制中的固定資料；官方清單變更時要修改 contract、雲函數白名單與測試後重新部署小程序與雲函數。

## 失敗與重試

官方短時間限制、維護、HTTP 失敗與 timeout 都不會由雲函數自動重試。timeout 或未知 response 會回傳「結果未確認，請先到官方頁面確認再嘗試」，使用者應先確認官方頁面狀態，避免重複提交。

## 新端批次兌換

只有經過既有共享身分校驗的新端可使用 `redeemBatch`。前端一次最多選擇 20 位不同玩家，每次呼叫送出同一兌換碼和一至兩位玩家。服務端同時處理該小批並按輸入順序回傳結果，前端收到回覆後更新進度，再送下一批。離開頁面會停止尚未送出的批次。

在同一雲函數實例內，新端單選與批次共用每來源 60 秒內最多 20 位的限額，同一來源對同服同暱稱也有 60 秒冷卻。舊端單人入口維持原有回傳格式及限流。部署須以新端共享身分相容版為基礎，只更新兌換函數，並分別核對舊端單人入口與新端批次入口。
