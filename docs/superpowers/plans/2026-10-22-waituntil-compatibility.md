# 預設頁面驗收 waitUntil 相容性修復

> 後續授權（2026-10-22）：用戶已要求提交、合併與推送。以最新 `main` 在 `codex/phase-60-review-integration` 集成，保留已發布的 evidence／workflow 和通用等待介面，再驗證集成版本。下列「不提交／推送」為原修復階段的限制；正式部署未獲本次授權。

> 按 subagent-driven-development 執行；用戶明確要求自動修復並完成。既有2026-10-04 B3設計已定義此動作，本次補回相容性，不另擴產品功能。

**目標：** 五份既有場景不再因waitUntil預讀失敗而阻斷預設批次；條件等待保持真元素、有限截止與原始錯誤分類。

**設計：** 支援exists（必填布林，含false）、text（equals／contains互斥，容許空字串）、page（安全絕對路徑）；只接受condition／timeoutMs欄位，timeout 1–30000ms。預設5000ms、100ms輪詢、連續兩次成立，單次probe也受總剩餘deadline約束。普通條件不達為failed；協議／連接錯誤保留以供既有最多兩次恢復，不將錯誤當元素不存在。頁面路徑到位不宣稱轉場動畫完成。保留waitFor、原場景斷言、R14真元素與R15報告分層。

## 約束

- 只在現有隔離工作樹codex/phase-59-review-repair，保護全部R01–R15修復與原有dirty/untracked。新增任務前1072來源已外部完整快照；禁止直接用HEAD diff辨認本次增量。
- 不改miniprogram產品頁、archive、master、generated、網路白名單、依賴或雲資源，不提交／推送／部署。原E保持不動。
- 先精確紅再最小綠，Node22.23.3；原始日誌及QA腳本在外部waituntil-compat-20261022，避免臨時JS被ESLint算入。
- 可參考phase57的wait-condition實作與測試，但只補本動作必要能力，不搬整套evidence/workflow系統。
- report顯示「等待條件」並保留失敗條件／最後觀察值；巢狀condition.selector亦納入SDK元件能力識別。
- 預設連線冒險整批須用安全fixture封鎖cloud、KV全memory再真互動；不裸跑污染真資料，不用handler/setData/假截圖。預設路徑與注入QA的差異如實列出。不得無限重啟或延長timeout。

## Task 1：工具補齊與獨立複核

- [ ] 紅：全保存場景載入含5份waitUntil、false消失/文字/路徑、閃現不能過、deadline/掛起probe、協議錯誤不吞、未知欄位/非法組合拒絕、巢狀元件能力、報告動作可讀。
- [ ] 綠：types/scenario/runner及最小獨立wait-condition；必要cli/report-html銜接，維持舊接口。
- [ ] 相關miniprogram-review整批與靜態，交完整dirty相對diff，規格／品質獨立審查；有Important先修復再復核。

## Task 2：實際驗收

- [ ] doctor、預設連線路徑冒險整批，在安全fixture下經正式parser/runner/adapter；另以真UI最小exists:false/page條件證明waitUntil有效，保留真圖、SDK/實際端點/尺寸/來源SHA與還原。
- [ ] 若另有原本fixture／UI／環境阻塞，保留原錯與真正停止點，不能把它再次稱waitUntil不相容或整批通過；不夾帶修無關頁面。

## Task 3：交付

- [ ] Node22完整npm run verify與git diff --check；核對來源前後、原E SHA與保護。
- [ ] HTML/JSON區分工具相容、實際場景、倉庫門禁、外部缺口，保留歷史失敗，不冒造before。
- [ ] 新增範圍最終審查並修復回歸；保留隔離分支與可恢復證據，不自動提交／合併／推送。
