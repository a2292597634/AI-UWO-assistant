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

| Field                         | Direction  | Type            |
| ----------------------------- | ---------- | --------------- |
| `ownerUid`                    | ascending  | standard        |
| `configId`                    | ascending  | standard        |
| `ownerUid` + `configId`       | ascending  | unique compound |
| `ownerUid` + `normalizedName` | ascending  | unique compound |
| `updatedAt`                   | descending | standard        |

`normalizedName` 是服務端 trim 後持久化的名稱。既有資料在建立唯一索引前，必須先以
`name.trim()` 回填此欄位並處理同 owner 的重複名稱。

為了讓「名稱檢查、20 筆上限檢查、寫入」具備原子性，另建立
`fleet_config_owner_locks` 集合；每個 owner 使用一個穩定文件 ID。`createConfig`、
`saveAsConfig` 和 `renameConfig` 會在 CloudBase server-side transaction 內更新該文件，
再讀取並寫入 `fleet_configs`。交易衝突由 `runTransaction` 重試，故不依賴
`count -> if -> insert` 的非原子流程。唯一索引是資料庫層的第二道防線。

### Security

- No client-side collection access rules needed — the page calls the cloud function, not the database directly.
- `ownerUid` is always read from `cloud.getWXContext().OPENID` in the function entry — never accepted from client payload.
- No personal profile APIs (`getUserProfile`, `getUserInfo`, phone number) are called.

### Function Limits

- Max 20 configs per user (enforced by `createConfig` and `saveAsConfig`)
- Config name: 1-30 Unicode characters, trimmed, unique per user; persisted as `normalizedName`
- Optimistic locking with version number for conflict detection

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

## 2026-08-20 唯讀 Preflight 與安全風險記錄

本節記錄的是唯讀檢查結果；未建立集合、索引或 ACL，亦未回填、刪除或部署任何 CloudBase 資源。

- 環境：`cloud1-d7gxfuxfe813b4eaa`。
- `fleet_configs` 已存在；目前只見 `_id_` 索引，尚未建立文件上列出的 owner／名稱相關索引。
- `fleet_config_owner_locks` 尚未存在；因此目前的交易鎖定設計尚不能在雲端驗收。
- `fleet_configs` ACL 回報為 `PRIVATE`。此設定本身不等同「客戶端直接讀寫已拒絕」，仍須以實際小程序身分做拒絕測試。
- 已見 6 筆缺少配置必要欄位的文件；它們未被修改，建立唯一索引或資料回填前須先由產品負責人確認遷移與保留策略。
- 已部署的 `fleet-config` 與 `officer-custom` 均為 `Nodejs16.13`；本次未部署本地修正。

可將唯讀查詢資料交給 `tools/cloudbase/fleet-config-preflight.ts` 的 `summarizeFleetConfigPreflight`，產出不含 owner UID、配置名稱或配置內容的摘要；其摘要規則由 `tests/tools/fleet-config-preflight.test.ts` 覆蓋。

### 需要用戶確認的後續方案

若要完成 CloudBase 上線驗收，建議依序：備份並人工判定 6 筆不完整文件、建立 `fleet_config_owner_locks`、建立設計索引、以真實小程序帳號驗證 direct client access 被拒絕，再部署 `fleet-config`。上述每一步都會變更外部環境，必須先取得用戶明確確認。

### 雲函式依賴稽核

2026-08-20 的 `npm audit --omit=dev` 結果：根目錄為 0 vulnerabilities；`cloudfunctions/fleet-config` 與 `cloudfunctions/officer-custom` 各為 6 項（5 high、1 moderate），來源鏈為 `wx-server-sdk@4.0.2` 的 transitive `@cloudbase/node-sdk`、`axios` 與 `lodash`。`npm audit fix --force` 會提議將 `wx-server-sdk` 降為 `2.5.3`，屬破壞性依賴降級，因此本次未執行。任何試裝、升級或降級都必須先取得用戶確認。

### Manual Acceptance

1. Open the fleet page as a guest — UI shows "登入後保存"
2. Edit fleet configuration — status shows "尚未保存"
3. Tap login/save — WeChat login triggered
4. After login, name the draft and save — appears in "我的配置"
5. Load from another device — same config list appears
6. Create 20 configs — verify 21st is rejected with limit message
7. Modify on device A, then modify on device B — verify conflict dialog on save
8. Force overwrite — verify version increments and data persists
