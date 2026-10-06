# 留言板現有付費環境測試調整

> **給執行代理：** 使用 executing-plans 在目前隔離 worktree 順序執行，遵循主計畫的保護、證據與提交規則。本調整是使用者選擇沿用付費環境測試的執行範圍，不再要求建立第二環境。

**目標：** 不購買新環境，在 `cloud1-d7gxfuxfe813b4eaa` 的專用探測函數驗證微信身分與合成文字安全 API，保留尚未驗證的頭像／回調門檻。

**架構：** 不修改四個既有業務函數。組包時固化現有環境授權、單一 runId、24 小時內到期時間與 `identity-text` 範圍；部署後仍預設停用。未固化授權的原有包繼續拒絕正式環境，呼叫 payload 及普通環境變量不能提供該授權。

**技術棧：** Node >=22 <23、TypeScript、Vitest、既有 wx-server-sdk@4.0.2；不新增或升級根依賴。

## 範圍與限制

- 使用者拒絕新增 19.90 元環境費用，改選現有付費環境測試；不建立新環境、不變更套餐、續費或超限設定。探測用量仍計入现有套餐，不保證完全不消耗資源。
- 第一批只允許 `message-board-g0-rpc` 的 getIdentity／checkText。checkText 只使用固定合成文字，寫入／檢查操作者仍受 hash 清單限制。
- 已用實際 SDK 確認開發者工具來源為 `wx_devtools`，只在這批固化共享授權中接受直接 `wx_devtools` 或 `wx_client`；轉呼叫、HTTP、未知或 payload 自稱來源仍拒絕。開發者工具證據不作真機證據。
- 同環境第一批拒絕所有圖片動作、callback 與 worker；沒有上傳圖片、寫資料庫或變更消息路由。
- 現有 storage ACL 為 ADMINWRITE（所有人可讀／管理員寫），不能當作私有儲存。圖片門檻須先找到可在專用前綴限制讀取、且保留其他資料既有規則的方案；未實測前保持 not-run。
- 第二批圖片／回調設計須依真實平台能力補齊隔離與回退，不能用操作者限定的 RPC 冒充客戶端直接讀取 ACL。
- 原有三項 G0 門檻維持；只通過身分或文字的一部分不放行 F1 或正式留言板發布。

## 任務與接口

**修改：** `tools/message-board/build-probe-package.ts`、`probe-sources/shared.js`、`probe-sources/rpc.js`、`tests/message-board/probe-sources.test.ts`、`build-probe-package.test.ts`、現有 spec／主計畫／架構說明。

`buildProbePackages` 新增可選 `sharedEnvironment: { environmentId: string; runId: string; expiresAt: string }`。只能指向現有環境，runId 必須以 `g0-shared-` 開頭；expiresAt 為 ISO UTC 且未過期、距組包最多 24 小時。所有欄位納入 buildSha 及 manifest。

`checkedContext(cloud, config, action)` 在同正式環境時只接受固化的 `sharedEnvironmentAuthorization`，核對 environmentId／runId／scope／expiresAt，再限定 action 為 getIdentity／checkText。callback／worker 沒有這兩個 action，因此無法藉由共享環境授權寫入。

- [x] 加入授權成功、環境／run 不符、過期、圖片／callback／worker 拒絕及生成入口的行為測試；先記錄真實紅測試。
- [x] 實作最小 guard 和組包選項，重跑 message-board 測試至綠；驗證預設拒絕正式環境與無雲寫入的行為保持。
- [x] 確认雲 runtime、現有函數名稱無衝突；建立本次 manifest 及唯讀資源快照。首次只新增停用的 rpc，不使用 deploy --all／--force；後續修正只覆寫本次新建的 rpc，保留舊包及部署紀錄。
- [x] 部署後核對預設停用、固化 buildSha、四個原函數版本／配置未变；CLI 調用只能驗部署與拒絕行為，不能當作微信來源證據。
- [x] 透過實際微信來源做 getIdentity／checkText；開發者工具 SDK 局部通過，真機與跨帳號／同實例對照仍未執行，不把 CLI 注入 OPENID 或 SOURCE 当平台身分。
- [x] 更新 ledger 與缺口；完整 verify 通過後展示差異，不自動提交或推送。結果見 [本批記錄](../../audits/2026-10-06-message-board-shared-environment.md)，G0 整體仍未通過。
