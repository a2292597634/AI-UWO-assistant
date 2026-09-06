# UI 資源輸出穩定性修復計劃

## Goal

修復 `assets:ui:check` 對 PNG/JPEG 編碼位元組完全相等的假設，避免相同解碼像素在不同 Sharp/libvips 環境下因編碼細節差異造成 GitHub Actions 漂移失敗。

## Architecture

- UI 資源仍由 `data/master/ui-assets/` 生成到 `miniprogram/assets/ui/`，並由 `data/audit/ui-asset-build-report.json` 固化審計結果。
- 報告中的 `sha256` 改為「影像尺寸、通道數與解碼後像素」的語義指紋，而不是輸出容器的原始位元組雜湊。
- `checkUiAssets` 仍驗證輸出集合、報告內容與預算；輸出檢查改為比較實際文件的語義指紋，允許不影響畫面的合法重編碼。

## Tech Stack

- TypeScript
- Sharp/libvips
- Node.js `crypto`、Vitest

## Global Constraints

- 不修改 `archive/`；主源只在 `data/master/`。
- 不新增、刪除或升級依賴。
- 生成的 runtime 圖片與審計報告只能透過既有 `npm run assets:ui -- --write` 流程更新。
- 不放寬尺寸、透明邊界或檔案大小預算；不同像素內容仍必須報錯。
- 先寫能重現「同像素、不同編碼」情境的失敗測試，再修改建置工具。

## Implementation Plan

- [ ] 在 `tests/ui-assets/build-ui-assets.test.ts` 新增回歸測試：先生成 fixture，將一個輸出以不同 PNG 編碼重新寫入，再確認 `checkUiAssets` 接受相同解碼像素；同時確認真正改變像素仍被拒絕。
- [ ] 在 `tools/ui-assets/build-ui-assets.ts` 增加包含尺寸、通道和 raw 像素的非同步語義雜湊函式，並用它填充報告的 `sha256`。
- [ ] 將 `checkUiAssets` 的輸出比對改為計算實際文件語義雜湊，保留輸出集合與報告漂移檢查，避免只忽略 hash 或接受任意 stale 文件。
- [ ] 透過既有生成命令更新受影響的 runtime 資源和審計報告；確認報告 schema、尺寸、透明邊界和大小門禁不變。
- [ ] 執行 UI 資源定向測試、資源檢查和完整 `npm run verify`；只在驗證結果明確後宣稱修復完成。

## Verification

- `npx vitest run tests/ui-assets/build-ui-assets.test.ts`
- `npm run assets:ui:check`
- `npm run verify`
