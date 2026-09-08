# 兌換碼 CloudBase 部署

## 雲函數

`cloudfunctions/coupon-redemption/` 是唯一向 LINE Games 官方兌換 endpoint 發出 HTTPS 請求的元件。

```text
cloudfunctions/coupon-redemption/
  index.js                       — CloudBase entry、呼叫來源雜湊與安全回應
  coupon-redemption-service.js   — 伺服器白名單、節流、官方結果映射
  line-games-client.js           — URL encoded POST 與 timeout
  package.json                   — wx-server-sdk@4.0.2
```

官方請求固定送往：

```text
POST https://coupon-front.line.games/sbc/UWOGL/useGameCoupon
Referer: https://coupon-front.line.games/sbc/UWOGL
```

請求欄位為 `gameServerId`、`userNo` 與 `couponNo`，並照官方表單帶入空白的 `os`、`appStoreCd` 隱藏欄位。雲函數不將玩家設定或兌換碼寫入 CloudBase Database；日誌只記錄 request ID 與結果代碼，不記錄暱稱、兌換碼、官方原始 body 或完整 OpenID。

## 部署

1. 確認 CloudBase 環境為 `cloud1-d7gxfuxfe813b4eaa`，且出站 HTTPS 可連至 `coupon-front.line.games:443`。
2. 在微信開發者工具中，右鍵 `cloudfunctions/coupon-redemption/`，選擇「上傳並部署：雲端安裝依賴」。
3. 如使用 CloudBase CLI，可執行 `tcb fn deploy coupon-redemption`；部署來源必須包含同一目錄的 `package.json`。
4. 不需設定 AppSecret、API token 或資料庫 collection；不要在環境變量、程式碼、測試或日誌中加入兌換碼。
5. 先執行本地測試與 `npm run verify`，再由使用者在微信開發者工具中以一組有效玩家設定和一次性兌換碼手動驗證。

## Runtime 網路邊界

- 小程序只經 `miniprogram/runtime/coupon-redemption-service.ts` 呼叫 `wx.cloud.callFunction`。
- 小程序頁面不含官方 URL、不呼叫 `wx.request`，也不直接訪問 CloudBase Database。
- 官方伺服器清單是版本控制中的固定資料；官方清單變更時要修改 contract、雲函數白名單與測試後重新部署小程序與雲函數。

## 失敗與重試

官方短時間限制、維護、HTTP 失敗與 timeout 都不會由雲函數自動重試。timeout 或未知 response 會回傳「結果未確認，請先到官方頁面確認再嘗試」，使用者應先確認官方頁面狀態，避免重複提交。
