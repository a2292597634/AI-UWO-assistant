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

| Field                   | Direction  | Type            |
| ----------------------- | ---------- | --------------- |
| `ownerUid`              | ascending  | standard        |
| `configId`              | ascending  | standard        |
| `ownerUid` + `configId` | ascending  | unique compound |
| `updatedAt`             | descending | standard        |

### Security

- No client-side collection access rules needed — the page calls the cloud function, not the database directly.
- `ownerUid` is always read from `cloud.getWXContext().OPENID` in the function entry — never accepted from client payload.
- No personal profile APIs (`getUserProfile`, `getUserInfo`, phone number) are called.

### Function Limits

- Max 20 configs per user (enforced by `createConfig` and `saveAsConfig`)
- Config name: 1-30 Unicode characters, trimmed, unique per user
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

### Manual Acceptance

1. Open the fleet page as a guest — UI shows "登入後保存"
2. Edit fleet configuration — status shows "尚未保存"
3. Tap login/save — WeChat login triggered
4. After login, name the draft and save — appears in "我的配置"
5. Load from another device — same config list appears
6. Create 20 configs — verify 21st is rejected with limit message
7. Modify on device A, then modify on device B — verify conflict dialog on save
8. Force overwrite — verify version increments and data persists
