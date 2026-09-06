# 海戰主動強化技能圖示覆蓋修復設計

> 狀態：已獲使用者批准進入實施階段
>
> 適用分支：`codex/phase-5-fix-skill-icons`

## 目標

修復「海戰主動－強化」分類的 24 個技能全部顯示同一張圖示的問題，並讓後續 CDN 資產缺失在構建期直接暴露，不再靜默套用其他技能的圖示。

## 已確認的根因

- `data/master/skills.json` 中 24 個技能各自擁有獨立的 canonical ID，`iconId: null` 是目前延後到資產流水線處理的設計，不是錯誤來源。
- `data/assets/cloudbase-manifest.json` 目前只發布了 `skill_skill400591.png`，其餘 23 張原始 PNG 沒有進入發布清單。
- `tools/data-pipeline/generate.ts` 把已發布清單的檔名作為可用圖示集合。
- `tools/data-pipeline/asset-dependencies.ts` 對所有缺少自身檔名的技能套用同分類第一張可用圖示，因此 24 個技能共同回退到 `skill_skill400591.png`。
- 目錄頁、技能資料和詳情資料都直接消費生成的 `ip`/`iconPath`，沒有額外的圖示選擇錯誤。

## 設計決策

### 1. 普通技能必須使用自己的檔案

在 `asset-dependencies.ts` 中保留確定性的檔名規則 `${skill.id}.png`，但收窄 fallback 的適用範圍：

- 自身檔案存在於資產集合時，一律使用自身檔案。
- `skill_skillT` 數字變體技能可以沿用既有的分類 fallback，因為這些技能是來源資料中的變體 ID，部分沒有獨立 PNG。
- 其他普通技能若自身檔案不在非空的資產集合中，直接拋出包含技能 ID、分類和預期檔名的錯誤。
- 資產集合為空時維持既有測試/離線呼叫的 own filename 行為；真正的生成流程始終傳入已發布 manifest 的非空集合。

這樣可以把錯誤從「顯示錯圖」變成「生成期指出缺少哪個發布資產」，同時不破壞已知變體技能的相容性。

### 2. 發布清單由真實資產發布產生

不手寫或猜測 CloudBase `fileID`。使用既有資產流水線：

1. 從只讀 `archive/voyage-tw-2026052501/raw-assets` 收集原始 PNG。
2. 執行 `assets:setup`，依新的依賴索引整理並壓縮到 staging。
3. 在具備 CloudBase 發布權限的環境執行 `assets:publish`，產生包含真實 `fileID`、雜湊和 URL 的新 manifest。
4. 再執行 `data:generate`，讓技能 runtime 資料寫入每個技能自己的 CDN URL。

本分支不修改 `archive/`，也不在沒有成功發布的情況下偽造 `cloudbase-manifest.json`。

### 3. 回歸測試與構建門禁

新增測試覆蓋以下行為：

- 普通技能缺少自身資產時會失敗，且錯誤指出預期檔名。
- 已知 `skill_skillT` 變體在缺少自身資產時仍可使用分類 fallback。
- 當 24 個強化技能的自身檔案都在資產集合中時，依賴索引為每個技能產生獨立檔名，不會共享 `skill_skill400591.png`。

生成流程沿用現有 manifest 校驗；完整發布完成後，`generate:check` 應確認生成物與依賴索引可重現。

## 範圍

### 包含

- 技能資產依賴解析的 fallback 規則修正。
- 資產依賴回歸測試與覆蓋測試。
- 使用現有 archive 資產重新建立 staging 的發布準備。
- 生成物更新（僅由 `npm run data:generate` 產生）。

### 不包含

- 修改 `archive/`。
- 修改頁面 WXML/WXSS 或新增運行時網路請求。
- 修改 `data/master/skills.json` 的技能內容。
- 虛構 CloudBase 上傳結果、`fileID` 或未實際存在的 CDN URL。
- 與本問題無關的格式化或重構。

## 驗收標準

1. 強化分類的 24 個技能在生成資料中各自指向自己的技能圖示檔案。
2. 普通技能資產缺失時，`data:generate` 直接失敗，不產生跨技能 fallback。
3. 已知變體技能的既有 fallback 行為仍通過測試。
4. `npm test`、`npm run data:check`、`npm run check:runtime-network` 和 `npm run generate:check` 在資產發布清單完成後通過。
5. `archive/` 保持不變，新增/修改範圍僅限本修復所需檔案。
