# 航海士投稿 OpenID 臨時診斷功能設計規格

## 目的

協助產品負責人取得目前微信帳號對本小程序的 OpenID，完成 CloudBase `OFFICER_ADMIN_OPENIDS` 管理員白名單配置。這是一個臨時診斷功能，不改變投稿或審核權限判斷。

## 使用方式

- 在「資料投稿」頁的頁首，對所有已登入用戶顯示「查看目前帳號 OpenID」入口。
- 點擊後由小程序呼叫 `officer-custom` 的 `getMyOpenId` action。
- 雲函數使用 `cloud.getWXContext().OPENID` 取得目前請求的身份，返回給同一個用戶的小程序頁面。
- 頁面以彈窗展示完整 OpenID，提供複製按鈕；不寫入資料庫、不寫入函數日誌、不接受客戶端傳入的 OpenID。
- 雲函數未取得登入身份時返回既有 `unauthenticated` 錯誤。

## 安全邊界

- OpenID 來源固定為 CloudBase 微信上下文，忽略 payload 中同名或相近欄位。
- 這個 action 只返回呼叫者自己的 OpenID，不返回其他用戶資料，也不自動授予管理員權限。
- 管理員仍然只由 `OFFICER_ADMIN_OPENIDS` 白名單判斷；OpenID 顯示功能與 `getAdminStatus` 分離。
- UI 文案標記為「臨時」，功能完成管理員配置後可移除。

## 實作範圍

1. Cloud Function service 增加 `getMyOpenId` action。
2. 小程序投稿 service 增加 `getMyOpenId()` 適配器方法。
3. 投稿頁增加臨時入口、載入狀態、錯誤提示、複製動作。
4. 增加 Cloud Function、runtime service 與頁面契約測試。
5. 不修改正式資料、審核狀態流、管理員白名單格式或同步流程。

## 驗證標準

- 未登入請求不能取得 OpenID。
- 服務端返回的 OpenID 必須等於 `cloud.getWXContext().OPENID`，不能被 payload 覆蓋。
- 投稿頁可觸發查詢、展示完整值並複製到剪貼簿。
- `npm.cmd run verify` 通過。

