# 自動配隊效能與底部常駐進度實施計畫

> 執行要求：使用 subagent-driven-development 或 executing-plans 按任務完成紅→綠→重構與審查；不自動提交。

**目標：** 縮短戰鬥／冒險配隊計算，等待時保持可操作，提供使用者已確認的底部常駐進度與取消。

**架構：** 共用可增量推進的數值搜索核心，保留同步入口和既有 Proposal 契約。頁面專用 runner 提供宏任務時間片、精確輸入快取、取消及失效保護；共用底部元件只展示狀態並發出取消／重試事件。

**技術：** 現有 TypeScript、Vitest、WXML/WXSS、miniprogram-automator；Node 22 正式驗證。不新增依賴。

## 全域約束

- 使用者於本輪確認「底部常駐」，可直接實施；設計來源為 `docs/superpowers/specs/2026-10-27-auto-fleet-performance-design.md`。
- 界面及資料只用繁體中文；註釋、文件、報告用中文。
- 保護既有未提交修改及未追蹤檔案，不提交、不推送、不部署、不改依賴或網路例外。
- 當前專用分支 `codex/phase-60-auto-fleet-performance`；為保留未提交前置資料在原工作區實施，既有 tracked 修改指紋見 `artifacts/auto-fleet-performance-design/protected-inputs.json`。
- 完整遵循 Design Foundation、技能等級規範及 HTML 驗收報告規範。
- 不修改 archive、權威資料或生成資料；配隊結果仍需使用者確認套用，沿用指紋與一次撤銷。
- 同步／非同步搜索共享同一算法；不得降低 DP 門檻、靜默減少精度或用假進度。
- 正式檢查使用 `C:/Users/XB/.codex/runtimes/uwo-review-node22/node-v22.23.3-win-x64/node.exe`，只對當前命令修改 PATH。

## 任務 1：共用可分批的快速求解器

**檔案：** 新增 `miniprogram/domain/fleet-solver-core.ts`、`tests/domain/fleet-solver-core.test.ts`；修改兩個 `*-fleet-solver.ts` 及直接相關 Solver 測試。

**輸出介面：**

```ts
export interface FleetSolveProgress {
  phase: 'preparing' | 'searching' | 'finalizing'
  processedCandidates: number
  totalCandidates: number
  candidateFraction: number
}
export type FleetCalculation<T> = Generator<FleetSolveProgress, T, void>
// 各自從原有 Solver 模組匯出：
createBattleTargetCalculation(input: AutoSolveInput): FleetCalculation<AutoSolveResult>
createAdventureTargetCalculation(input: AdventureAutoSolveInput): FleetCalculation<AdventureAutoSolveResult>
```

進度按實際處理候選計數；若做分組後數量截取，保留的代表仍逐人處理，不把組數冒稱原始人數。每小批狀態轉移均可 yield，不能只在整個候選完成後 yield。

- [ ] 在修改前保存舊實作作診斷對照，執行既有 Solver／頁面基線（已完成：4 檔／209 測試通過）。新增測試驗證真實慢輸入、分批可中斷、同步與增量結果一致，以及多人同貢獻、真實溢出、ID 排序、鎖定與容量護欄。
- [ ] 執行失敗測試，記錄失敗原因為增量入口缺失或現有性能不能滿足預算。
- [ ] 實作共用數值狀態核心，減少字串／物件建立與無收益轉移；用足量同類候選壓縮和安全快速返回。兩個入口保留各自校驗、約束、基線及 Proposal 建立。
- [ ] 執行全部 Solver 測試及小規模獨立枚舉／舊版對照。對未改輸入驗證完整 Proposal，不只比較達標數。
- [ ] 重測 Node 22：戰鬥五目標爭取低於原版 20%，冒險五目標爭取 2 秒內；若不達標繼續定位熱點，明確記錄狀態，不降低品質。
- [ ] 寫入實作報告、測試證據及待處理問題；交由獨立審查，不 commit。

## 任務 2：計算任務與頁面生命週期

**檔案：** 新增 `miniprogram/runtime/fleet-calculation.ts`、`tests/runtime/fleet-calculation.test.ts`；修改戰鬥／冒險頁 `index.ts` 和兩個頁面測試檔。

**輸入：** 任務 1 的 `FleetCalculation<T>`。**頁面輸出契約：**

```ts
interface FleetCalculationView {
  status: 'preparing' | 'searching' | 'finalizing' | 'cancelled' | 'error'
  title: string
  phaseLabel: string
  progress: number | null
  processed: number
  total: number
  elapsedText: string
  notice: string
}
// 每個頁面 data 新增：
// calculation: FleetCalculationView | null
// isCalculating: boolean
// 事件：onCancelCalculation()；onRecalculate(): Promise<void>
```

- [ ] 先寫並運行失敗測試：計算先釋放事件迴圈、可取消、不重複啟動、同輸入命中快取、不同貢獻／目標／基線不得命中、錯誤可重試。
- [ ] 實作每頁一個 runner，8 ms 時間片、100–150 ms 進度節流、宏任務排程。快取只保留最近一個已完成結果，鍵包含完整有效輸入及基線，失敗／取消不快取。
- [ ] 頁面先 setData 計算狀態再啟動 runner；完成建立預覽。重複點擊忽略；取消恢復按鈕與明確文案。收尾／失敗都不能遺留忙碌狀態。
- [ ] 新增並觀察頁面失敗測試，再接入目標／船／成員／配置變更、onHide 和 onUnload 取消；每批及回填前檢查任務識別與基線，禁止舊結果更新已卸載頁面或覆蓋新方案。
- [ ] 原有同步頁面測試在需要結果處 await onRecalculate，保留原有業務斷言；新增測試驗證計算期間編隊和 dirty 狀態不變、取消和過期結果不產生預覽。
- [ ] 運行 runtime、Solver、兩頁測試及 typecheck，記錄報告並獨立審查，不 commit。

## 任務 3：底部常駐元件與頁面接線

**檔案：** 新增 `miniprogram/components/fleet-calculation-panel/index.{ts,json,wxml,wxss}` 及元件必要測試；修改兩頁 WXML、WXSS、JSON。

**輸入：** `calculation` 物件及 `isCalculating`。元件屬性命名 `calculation`；事件 `cancel`、`retry`。兩頁使用：

```xml
<fleet-calculation-panel
  wx:if="{{calculation}}"
  calculation="{{calculation}}"
  bind:cancel="onCancelCalculation"
  bind:retry="onRecalculate"
/>
```

- [ ] 先寫事件契約測試並觀察失敗，再實作元件事件；只展示 runtime 提供的可見文案，禁止自行用計時器推進百分比。
- [ ] 依已確認稿實作底部常駐佈局：Token、墨綠無邊框填充條、已用時間、處理量與取消；準備／整理為不定進度，取消／錯誤提供重新計算。
- [ ] 兩頁註冊元件、禁用重複計算；為固定底欄預留內容空間與安全區，不遮最後一列，不影響既有彈層。
- [ ] 檢查 320／375／393／430 px、長等待、窄屏長文案、取消／錯誤及隱藏恢復。新增本次場景的 watchPaths，保留原有分享及技能選擇回歸。
- [ ] 執行 iterate，查看真實截圖並修復；運行元件／頁面測試及相關架構檢查，記錄報告與審查，不 commit。

## 任務 4：整體驗證與報告

**檔案：** 本計畫／設計及直接相關驗收場景；基準、測試與頁面證據置於 `artifacts/auto-fleet-performance-design/` 和報告工具目錄。

- [ ] 用相同 Node 22、輸入、資料指紋交錯重複基準；保存總耗時、長時間片、完整輸出一致性和精確快取命中結果。
- [ ] 執行 `npm run verify` 與 `git diff --check`；已有修改引起的範圍外失敗單列，不夾帶修復。
- [ ] 執行 final 並閱讀 HTML 報告和截圖；依頁面／倉庫／外部層記錄通過、失敗、未執行或阻塞。
- [ ] 對所有本次變更獨立審查；核對既有 tracked 修改指紋未變及未追蹤檔案仍在。
- [ ] 最終提供 HTML 主報告、前後效能、實際測試及真機限制；保留修改供使用者審閱，不提交、不推送。

## 收尾結果（2026-10-27）

- 任務1–3實作、紅綠回歸、各任務P2修正與獨立複審、最終整合審查已完成，無未解決P1/P2。
- Node22舊／新交錯三次、相同輸入完整Proposal一致。含可中斷調度中位數：戰鬥18.93秒→0.75秒；冒險49.17秒→2.05秒。此為本機壓力樣本，不是所有手機的時間保證。
- 全庫200檔2749項測試、TypeScript、ESLint、runtime-network、包體積、素材、資料與生成檢查通過；git diff --check通過。
- SDK3.17.0的375／393／430px兩頁共6場景通過，另有兩個保存的標準原生點擊場景通過。375px冒險壓力場景完成實際滾動／取消／重算；390px有可信計算中及取消真圖。
- 375／393／430px部分計算中截圖請求返回時已是預覽，依實際畫面命名與記錄，不冒充計算中圖像。320px、真機與實際讀屏未執行。
- 完整npm run verify因3份既有留言板JSON格式產物失敗；changed iterate／final因既有waitUntil場景與當前解析器不相容而阻塞，已使用專屬SDK與保存場景補充驗收。這兩項建議另開任務處理，不夾帶修改。
- 主報告：artifacts/miniprogram-review/2026-10-27-auto-fleet-performance-final/report.html；report.json分列頁面／倉庫／外部狀態並附來源指紋。
- 136份既有修改／未追蹤檔案指紋核對不變；原390px機型與空白冒險編隊已恢復。修改保留在專用分支，未提交、推送或部署。
