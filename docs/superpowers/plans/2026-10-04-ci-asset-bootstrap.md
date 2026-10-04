# CI 素材準備修復計畫

日期：2026-10-04。基線 `7ee47aa`；分支 `codex/phase-55-ci-asset-bootstrap`。

## 目標及設計

修復 CI `37160400852` 因三張冒險被動技能 staging PNG 不存在而失敗。保留原資料／圖片測試、素材不提交 Git 與無依賴變更的約束。

在 `npm ci` 後、`npm run verify` 前，以 `npm run assets:ci` 準備僅三張既有已發布素材。讀取並使用現有驗證器驗證 committed CloudBase manifest，下載對應版本 URL；核對 SHA-256、大小、PNG 解碼及 64×64 尺寸後才寫入被忽略的 staging。全部下載先驗證後再寫入；HTTP／逾時／資料不符皆非零退出，不產生假圖或跳過測試。

只讀公開 CDN，不需 CloudBase 憑證，不發布素材或寫雲端。下載使用有界逾時、拒絕重定向；已存在的本機同名圖也須校驗，不覆蓋不同內容。CI 會新增對這三個既有發布 URL 的可用性依賴。

## 文件

- 新增 `tools/asset-pipeline/prepare-ci-assets.ts`：素材清單、準備函式及 CLI。
- 新增 `tests/asset-pipeline/prepare-ci-assets.test.ts`：臨時目錄和注入 fetch 的邊界測試，不連網、不寫正式 staging。
- 修改 `package.json`：新增 `assets:ci` 命令，不變更依賴。
- 修改 `.github/workflows/verify.yml`：新增驗證前素材準備步驟。

## 執行清單

- [x] 官方 CI 日誌確認 179 文件通過，唯一失敗是素材不存在；核對 Git 忽略規則及 manifest 的三張已發布圖片。
- [x] 紅燈：新增乾淨目錄、HTTP 失敗、雜湊／大小／解碼／尺寸不符及已有素材保護測試；空實作 8 failed／1 passed，確認缺少行為時失敗。
- [x] 綠燈：實作最小準備函式與 CLI，新增 10 項測試通過；原冒險技能 3 項測試保留並通過。
- [x] CI 接線：新增 package 命令及工作流步驟。
- [x] 乾淨 Git 副本：先重現原失敗，再執行真 CDN 準備及完整 verify，確認不依賴主工作區 staging。
- [x] 更新本記錄的結果、格式／差異檢查；獨立唯讀複核未發現阻斷缺陷。
- [x] 展示五份候選文件與 message，使用者已授權提交、合併及推送。
- [ ] 推送後核對真 GitHub Actions 驗證結果。

## 驗證結果

- Git `7ee47aa` archive 副本不含 staging，原圖片測試為 1 failed／2 passed，與 CI 一致。日誌 `.superpowers/ui-scope-20261003/phase55-clean-red.log`。
- 正式驗證使用獨立 Git 工作樹 `.worktrees/phase55-ci-verification-20261004/`，不是以主工作區 staging 補檔；僅復用同一份已安裝依賴。`npm run assets:ci` 真實下載三個版本 URL，全部指紋、大小與 PNG 校驗成功。日誌 `phase55-clean-prepare.log`。
- Node 22.23.3 完整 `npm run verify` 退出 0：181 文件／2480 測試，另有資料契約 12 文件／100 測試；全部门禁及生成一致性通過。日誌 `phase55-clean-verify-retry.log`。四份實作／配置文件與被驗證副本逐一 SHA-256 相等。
- 使用者確認後，主工作區提交前再次完整 `npm run verify` 退出 0，2480＋100 項測試及全部門禁通過。日誌 `.superpowers/ui-scope-20261003/phase55-precommit-verify.log`。
- 首次完整驗證發現 Sharp 型別寫法錯誤，已改用套件匯出的 `Metadata`，失敗日誌 `phase55-clean-verify.log` 保留；修正後才取得上述通過結果。
- `.codex/config.toml` 使用者既有改動保持原 SHA-256，不納入候選。原始三張 staging 素材未修改；已發布圖與本機來源可能因壓縮而指紋不同，`assets:ci` 對不同內容會拒絕覆蓋，應在乾淨 staging 執行。
- 複核確認工作流／校驗／原測試保留正確。落盤不是交易式操作，磁碟 I/O 失敗可能留下部分已驗證文件；CI 仍失敗，下次執行不接受截斷內容。本輪沒有增加交易式檔案系統機制。

候選：上述四份實作／配置文件及本計畫，共五份。擬用 message：`fix: CI 驗證前補齊並校驗已發布測試素材`。

## 整合限制

本輪修復尚未提交前，不能聲稱 GitHub CI 已通過。新提交需上傳後以實際 Actions 結果驗證；原長列表、真機、CloudBase 寫入等待驗事項不在本輪範圍。
