# AGENTS.md

本倉庫是《Uncharted Waters Origin》國際服航海士資料查詢微信小程序。界面與資料僅使用繁體中文。

## 1. 數據三層架構（最高優先級）

```
archive/  →  data/master/  →  miniprogram/generated/
 不可修改      唯一可手動維護      工具自動生成，禁止手動修改
```

- `archive/`：voyage.tw 一次性快照，只讀。
- `data/master/`：唯一權威數據源，所有人手修改在此進行。
- `miniprogram/generated/`：由 `npm run data:generate` 生成。手動修改無效，下次構建必定被覆蓋。
- 修改 `data/master/` 後必須運行 `npm run data:check`。

## 2. 硬約束

- 禁止直接在 `master` 分支開發。分支命名：`codex/phase-N-描述`。
- 禁止在 `miniprogram/` 運行時代碼中使用 `wx.request`、`wx.cloud`、遠程 URL 或 Node.js API。`npm run check:runtime-network` 會自動掃描。
- 禁止未經用戶確認新增/刪除/升級依賴。
- 禁止順手修復無關問題或格式化無關文件。
- 發現範圍外缺陷 → 報告並建議另開任務，不得夾帶。

## 3. 提交前門禁

提交前必須通過相關檢查。完整驗證：

```powershell
npm run verify
```

包含：format → lint → typecheck → test → runtime-network → data:check → generate:check。

commit 前展示變更文件、驗證結果和擬用 message，等待用戶確認。

## 4. TDD

數據解析、轉換、校驗、篩選邏輯、索引/分片生成、素材去重和確定性構建必須遵循紅-綠-重構循環。UI 代碼可用 DevTools 驗證代替。
