# 航海士資料投稿與審核運維說明

本功能的狀態流轉為：

`pending → approved → 同步 approved → data/master/custom-officers.json → 資產發布 → data:generate → 小程序發布 → published`

投稿者只能建立與查看自己的投稿；投稿資料不會直接寫入正式航海士名鑑。小程序管理員在「審核工作台」修改、保存、通過或駁回投稿，管理員身份由 CloudBase 雲函數根據服務端白名單判定。

## 管理員權限

第一版只配置一個管理員，也就是產品負責人的微信 OpenID。請在 CloudBase 雲函數 `officer-custom` 的環境變量中配置：

```text
OFFICER_ADMIN_OPENIDS=<產品負責人的微信 OpenID>
```

未配置或 OpenID 不匹配時，審核工作台仍可被打開，但所有管理操作都會由服務端返回「只有小程序管理員可以執行此操作」。前端的 `isAdmin`、URL 參數或投稿 payload 都不能提升權限。

未來增加審核員時，只需把多個 OpenID 以英文逗號分隔加入同一個環境變量，例如：

```text
OFFICER_ADMIN_OPENIDS=<OpenID A>,<OpenID B>
```

真實 OpenID 不寫入程式碼、資料檔、測試、WXML 或版本庫。

## 同步工具

同步工具使用另一個只供本地/CI 使用的服務端 token：

```text
OFFICER_SYNC_TOKEN=<隨機長 token>
```

這個 token 只允許 `listApprovedForSync`、`getPortraitDownloadUrl`、`markPublished` 三個同步 action。不要把 token 寫入倉庫或小程序；本地執行前透過目前終端的環境變量提供。

預設同步不會改變 CloudBase 投稿狀態：

```powershell
$env:OFFICER_SYNC_TOKEN = '<本地注入，不要保存到檔案>'
npm run sync:custom-officers
```

同步完成後依序執行：

```text
npm run assets:setup
npm run assets:publish
npm run data:generate
npm run verify
發布小程序
```

確認正式版本已發布後，才用明確版本號標記已同步投稿：

```powershell
npm run sync:custom-officers -- --mark-published --dataset-version <版本號>
```

同步工具只接受服務端回傳的最新 `approved` revision；`pending`、`rejected` 不會進入 `data/master/custom-officers.json`。投稿頭像透過臨時下載地址取得，轉成 PNG 後寫入 `data/assets/staging/`，臨時地址不會進入資料或 runtime。

## 頭像限制

小程序端會先壓縮並檢查頭像，服務端與同步工具會再次校驗：

- 只接受 PNG、JPG、JPEG。
- 實際檔案不超過 512 KB。
- 最長邊不超過 512 px，保持原比例。
- 建議使用 256–512 px 的正方形正式版頭像。

## 故障處理

- 審核工作台顯示無權限：確認 CloudBase 環境變量中的 OpenID 與當前微信帳號一致，重新部署雲函數後再試。
- 同步顯示 token 無效：確認本地 `OFFICER_SYNC_TOKEN` 與雲函數環境變量完全一致，不要把 token 放進小程序。
- `assets:setup` 找不到 custom 頭像：先確認同步已完成，並檢查 `data/assets/staging/officer_custom_*.png` 是否存在。
- `data:check` 或 `generate:check` 失敗：保留失敗輸出，修正 master 或資產後重新執行，不要手動修改 `miniprogram/generated/`。
