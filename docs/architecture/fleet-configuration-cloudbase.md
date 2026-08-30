# Fleet Configuration CloudBase Deployment

## Environment

| Setting             | Value                                                   |
| ------------------- | ------------------------------------------------------- |
| Environment ID      | `cloud1-d7gxfuxfe813b4eaa`                              |
| Source              | `data/assets/cloudbase-manifest.json` → `cdnOrigin`     |
| Cloud function root | `cloudfunctions/` (configured in `project.config.json`) |

## Cloud Function: `fleet-config`

### Directory Structure

```
cloudfunctions/fleet-config/
  index.js                    — Entry point, reads OPENID from wx-server-sdk context
  fleet-config-service.js     — Pure business rules (ownership, limits, versioning)
  fleet-config-repository.js  — CloudBase database read/write
  package.json                — Dependencies (wx-server-sdk)
```

### Deployment

1. In WeChat DevTools, right-click `cloudfunctions/fleet-config/` → **Upload & Deploy: Cloud install**
2. Or use CloudBase CLI: `tcb fn deploy fleet-config`

### Database Collection

Create the collection `fleet_configs` in the CloudBase console with the following indexes:

| Field                                   | Direction  | Type            |
| --------------------------------------- | ---------- | --------------- |
| `ownerUid`                              | ascending  | standard        |
| `configId`                              | ascending  | standard        |
| `ownerUid` + `configId`                 | ascending  | unique compound |
| `ownerUid` + `scope` + `normalizedName` | ascending  | unique compound |
| `updatedAt`                             | descending | standard        |

`scope` 只允許 `battle`、`adventure` 或 `unclassified`。既有資料缺少或含有無效
`scope` 時，一律視為 `unclassified`，不可依配置內容自動推測類型。
`normalizedName` 是服務端 trim 後持久化的名稱；名稱唯一性只在同一個 `scope` 內生效，
因此戰鬥與冒險可以各自擁有同名配置。既有資料在建立唯一索引前，必須先以
`name.trim()` 回填 `normalizedName`，並只處理同一 scope 的重複名稱。

`fleet_configs` 的必要資料欄位：

| 欄位             | 值／規則                                          |
| ---------------- | ------------------------------------------------- |
| `ownerUid`       | 由 Cloud Function 的登入上下文取得                |
| `scope`          | `battle`、`adventure` 或 `unclassified`           |
| `name`           | 1–30 個 Unicode 字元                              |
| `normalizedName` | `name.trim()` 的結果，用於同 scope 名稱唯一性檢查 |
| `version`        | 樂觀鎖定版本；每次更新或分類成功後遞增            |

部署遷移可以將缺少 `scope` 的舊記錄回填為 `unclassified`，但不得替舊記錄自動判定為
戰鬥或冒險。使用者首次進入配置管理時，必須逐筆選擇目標類型；分類操作需攜帶
`configId`、`expectedVersion` 和 `targetScope`，並重新檢查目標類型上限與同 scope 名稱衝突。

為了讓「同 scope 名稱檢查、10 筆上限檢查、寫入」具備原子性，另建立
`fleet_config_owner_locks` 集合；每個 owner 使用一個穩定文件 ID。`createConfig`、
`saveAsConfig`、`renameConfig` 和 `classifyConfig` 會在 CloudBase server-side transaction
內更新該文件，
再讀取並寫入 `fleet_configs`。交易衝突由 `runTransaction` 重試，故不依賴
`count -> if -> insert` 的非原子流程。唯一索引是資料庫層的第二道防線。

### Security

- No client-side collection access rules needed — the page calls the cloud function, not the database directly.
- `ownerUid` is always read from `cloud.getWXContext().OPENID` in the function entry — never accepted from client payload.
- No personal profile APIs (`getUserProfile`, `getUserInfo`, phone number) are called.

### Function Limits

- 每位使用者的 `battle` 與 `adventure` 命名空間各最多 10 套配置；`unclassified` 舊配置不計入任一已分類上限
- 配置名稱為 1–30 個 Unicode 字元，服務端 trim；同一命名空間內唯一，並持久化為 `normalizedName`
- `listMyConfigs`、`loadConfig`、`createConfig`、`saveAsConfig`、`updateConfig`、`renameConfig`、`deleteConfig` 均必須使用已分類的 `scope`
- `listUnclassifiedConfigs` 僅回傳待分類舊配置；`classifyConfig` 只能將單筆配置移入 `battle` 或 `adventure`，並檢查版本、上限與名稱衝突
- 使用版本號進行樂觀鎖定，以偵測並發修改衝突

### Runtime Network Boundary

The project enforces an offline-first runtime boundary:

- `wx.cloud.init` → allowed only in `miniprogram/app.ts`
- `wx.cloud.callFunction` → allowed only in `miniprogram/runtime/fleet-config-service.ts`
- All other `wx.cloud`, `wx.request`, `wx.downloadFile`, and remote URLs remain forbidden

### Verification

Before manual testing:

```powershell
# Full project gate
npm run verify

# Runtime network check
npm run check:runtime-network

# Cloud function tests
npx vitest run tests/fleet-config/

# Adapter tests
npx vitest run tests/runtime/fleet-config-service.test.ts
```

### Manual Acceptance

1. 以訪客開啟配隊頁 — 介面顯示「登入後保存」
2. 修改配隊 — 狀態顯示「尚未保存」
3. 點擊登入／保存 — 觸發微信登入
4. 登入後為草稿命名並保存 — 配置出現在「我的配置」
5. 從另一台裝置載入 — 顯示相同的配置列表
6. 建立 10 套戰鬥與 10 套冒險配置 — 驗證任一命名空間的第 11 套均被上限訊息拒絕；同名配置可各自在兩個命名空間建立一次
7. 準備一筆缺少有效 `scope` 的舊記錄 — 驗證它出現在待分類列表，且必須逐筆分類；驗證分類會檢查目標命名空間上限與重複名稱
8. 在裝置 A 修改，再在裝置 B 修改 — 驗證保存時顯示衝突對話框
9. 強制覆蓋 — 驗證版本遞增且資料持久化
