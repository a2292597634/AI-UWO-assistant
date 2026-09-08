# 兌換碼自動領取設計

**日期：** 2026-09-08  
**狀態：** 已完成實作，待分支整合與 CloudBase 部署驗證

## 目標

在《Uncharted Waters Origin》航海助手小程序新增兌換碼功能。使用者可在同一裝置保存多組遊戲帳號設定，選定設定並輸入兌換碼後，由 CloudBase 雲函數代為向 LINE Games 官方兌換頁提交；頁面以繁體中文呈現可理解的結果與下一步。

## 範圍與約束

- 小程序 Runtime 不使用 `wx.request`、`wx.cloud`、遠端 URL 或 Node.js API；唯一的 CloudBase 呼叫封裝在新增的 Runtime service。
- 設定只儲存在小程序本機儲存，不使用 CloudBase Database，不需要登入，亦不跨裝置同步。
- 兌換碼只存在於本次輸入與雲函數請求中；不寫入本機儲存、資料庫或一般日誌。
- 雲函數是唯一可向官方網站發出請求的元件。它會呼叫 `POST https://coupon-front.line.games/sbc/UWOGL/useGameCoupon`，並使用官方頁面要求的來源資訊。
- 不修改 `archive/`、`data/master/` 或 `miniprogram/generated/`，也不新增、刪除或升級依賴。
- UI、WXML 與 WXSS 必須遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。

## 官方伺服器清單

伺服器選單採用官方頁面目前的識別值與名稱。選單的欄位標籤、提示與錯誤訊息使用繁體中文；官方伺服器專有名稱原樣顯示。此清單是隨小程序發佈的固定資料，不在 Runtime 動態抓取外部網站。

| 官方識別值 | 顯示名稱 |
| --- | --- |
| `UWOGL-JP-02` | Blue Ocean |
| `UWOGL-JP-03` | Pacific Ocean |
| `UWO-KR-14` | 북극해 |
| `UWO-KR-13` | Caribbean Sea |
| `UWO-KR-01` | 태평양1 |
| `UWO-KR-04` | 대서양1 |
| `UWO-KR-10` | 창해 |
| `UWOGL-US-01` | Atlantic Ocean |
| `UWOGL-US-02` | Utopia Ocean |

官方日後若調整伺服器，需同步更新此受版本控制的清單與對應測試後再發佈；不可讓小程序 Runtime 直接抓取官方頁面。

## 資料模型與本機儲存

本機儲存鍵只保存下列設定清單與目前選取的設定 ID：

```ts
type CouponProfile = {
  id: string
  name: string
  gameServerId: GameServerId
  userNo: string
}

type CouponProfileStore = {
  profiles: CouponProfile[]
  activeProfileId: string | null
}
```

- 最多保存 10 組設定。
- `name` 是由修剪後的 `userNo` 自動產生的顯示名稱，不再由使用者另外輸入；`userNo` 是官方欄位定義的 Company Name，即玩家遊戲內暱稱。
- 舊版本資料若保存了獨立設定名稱，載入時仍接受該欄位，但顯示與後續保存一律以 `userNo` 為準。
- 新增、編輯、刪除與設為目前使用都在本機同步完成；刪除目前設定時，將目前選取改為剩餘第一組或 `null`。
- 儲存資料遭到手動破壞、格式錯誤或超過上限時，讀取時視為無效資料並回復為安全的空清單，不拋出頁面錯誤。

## 頁面與互動

### 兌換碼頁

- 顯示目前玩家設定的名稱、官方伺服器與遊戲內暱稱；沒有設定時提供明確的「新增玩家設定」入口，且送出按鈕禁用並說明原因。
- 輸入兌換碼後，顯示「確認並領取」作為頁面唯一主要按鈕。
- 送出前驗證：已選擇玩家設定、兌換碼非空、去除前後空白、長度不得超過官方限制的 50 字元。
- 送出期間鎖定按鈕與設定切換，避免同一操作重複提交；提交完成後清空兌換碼。
- 成功與失敗均用 `.ui-status` 類別顯示文字語義，不能只靠顏色。

### 兌換設定頁

- 列出至多 10 組設定，並以「使用」切換目前設定。
- 提供新增、編輯與刪除；新增／編輯表單包含伺服器原生下拉選單與遊戲內暱稱，顯示名稱直接使用暱稱。
- 伺服器使用 selector picker，選項值與順序依「官方伺服器清單」表格。
- 刪除前顯示二次確認，避免不可逆的本機資料移除。
- 以 Design Foundation 的 `canvas`、`surface`、邊界、間距、字體與 `.ui-button` 變體實作；重要按鈕熱區至少 `88rpx`，不新增自訂字型或網路素材。

## 雲函數代理

新增獨立 `coupon-redemption` 雲函數，而不混入既有配隊或投稿函數。

1. 入口只接受 `gameServerId`、`userNo` 與 `couponNo`，在服務端再次驗證伺服器白名單、非空字串與兌換碼長度。
2. 依 CloudBase 呼叫上下文識別來源，執行保守的短時間節流；節流狀態只保存雜湊或最少量的技術識別資訊，絕不保存完整兌換碼。
3. 對官方 endpoint 發送 URL-encoded POST，帶入官方頁面來源資訊；設定有限逾時，且不在逾時、連線中斷或未知回應時自動重試。
4. 將官方的已知結果碼映射為穩定的內部結果碼與繁體中文文案。包含成功、玩家資料錯誤、兌換碼不存在、已使用、同群組已使用、過期、請求過於頻繁、伺服器不可用、維護中與稍後重試。
5. 未知官方回應、HTTP 失敗或逾時均回傳不含原始回應內容的安全錯誤；前端顯示「結果未確認，請先到官方頁面確認再嘗試」，以免重複兌換。
6. 雲函數日誌不輸出 `couponNo`、`userNo` 或完整第三方回應。

## 模組邊界

| 區域 | 職責 |
| --- | --- |
| `miniprogram/contracts/coupon-redemption.ts` | 伺服器清單、設定／請求／結果型別、純驗證與序列化邊界 |
| `miniprogram/runtime/coupon-profile-store.ts` | 唯一可讀寫本機設定的 adapter |
| `miniprogram/runtime/coupon-redemption-service.ts` | 唯一可呼叫 `wx.cloud.callFunction` 的 Runtime adapter |
| `miniprogram/presenters/coupon-redemption-presenter.ts` | 將設定、提交狀態與結果映射為 WXML ViewModel |
| `miniprogram/subpkg-coupon/pages/redemption/*` | 兌換碼分包頁面控制器、WXML 與 WXSS，不直接接觸 CloudBase 或 storage |
| `miniprogram/subpkg-coupon/pages/settings/*` | 設定分包頁面、清單與表單控制器、WXML 與 WXSS |
| `cloudfunctions/coupon-redemption/*` | 官方 HTTP adapter、節流、服務層、入口與安全回應 |

## 錯誤處理

| 情況 | 使用者可見結果 |
| --- | --- |
| 沒有玩家設定 | 請先新增並選擇一組玩家設定。 |
| 表單欄位無效 | 顯示對應欄位的繁體中文提示，不送出。 |
| 已成功 | 獎勵已發送至遊戲內信箱。 |
| 玩家資料錯誤 | 請確認伺服器與遊戲內暱稱。 |
| 兌換碼無效、已使用或過期 | 顯示官方狀態對應的明確提示。 |
| 官方短時間限制 | 請稍候再試，不自動重送。 |
| 官方維護或服務失敗 | 官方服務暫時不可用，請稍後再試。 |
| 逾時／未知回應 | 結果未確認，請先到官方頁面確認再嘗試。 |

## 測試與驗收

- Contract／Domain 測試：伺服器白名單、設定欄位、最大 10 組限制、破損儲存資料、切換與刪除目前設定、兌換碼驗證。
- Runtime 測試：本機儲存讀寫、`wx.cloud.callFunction` payload 與未知回應防護；禁止小程序直接使用外部網路。
- Cloud function 測試：官方 request 參數與來源資訊、節流、逾時、已知／未知結果映射、日誌不含暱稱與兌換碼。
- 頁面與 Presenter 測試：空設定、設定切換、提交鎖定、結果狀態和兌換碼清空。
- UI 驗收：在 320px、375px、393px、430px 寬度檢查原生伺服器 selector、長暱稱、繁體中文提示、按鈕熱區及安全區；與既有頁面使用相同 Design Foundation 視覺語言。
- 提交前執行 `npm run verify` 及 `git diff --check`；由使用者確認變更檔案、驗證結果與 commit message 後才提交。

## 不在本次範圍

- 跨裝置同步、登入後的雲端設定資料庫。
- 自動掃描、保存、批量兌換或排程提交兌換碼。
- Runtime 動態抓取官方網站伺服器或兌換碼資訊。
- 修改既有配隊、航海士資料、資料流水線、generated 資料或無關 UI。
