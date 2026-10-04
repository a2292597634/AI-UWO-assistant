# B 批：頁面證據與結果實施計畫

> **給執行代理：** 使用 `executing-plans` 逐項執行；本批未實施。B2、B3 順序修改共享檔案。提交前展示範圍、驗證和 message，等待使用者授權。

**目標：** 讓圖片身份、比較條件和最終結果可核對，降低非同步場景的補證成本。

**架構：** 擴充既有報告 schema，逐場景攜帶來源與實測環境；保留 adapter 能力及 fixture 邊界，增加分層結果和有界等待。

**技術棧：** TypeScript、Vitest、現有 nativeCLI／wechatide／SDK、HTML／JSON／Markdown；不升級 SDK 或增加依賴。

## 全域約束

遵守 [總計畫全域約束](2026-10-04-development-workflow-improvement.md#全域約束)。實施前完整閱讀 `docs/superpowers/specs/2026-09-16-miniprogram-review-html-report-design.md`；若觸及頁面 runtime／樣式，另完整讀 Design Foundation。保留整批 DevTools 恢復上限 2 次、自訂元件作用域查詢及 fixture 安裝／還原。正式適配器、SDK 診斷取證、離線 fixture、真機及真雲證據分開記錄。

## B1：身份與可比較基線

**檔案：**

- 新增 `tools/miniprogram-review/evidence.ts`：來源 hash、型別及比較規則。
- 修改 `adapter.ts`、`wechatide.ts`：只讀 runtime 身份探測，保留实际執行根及啟動紀錄；不改現有查詢路徑。
- 修改 `cli.ts`、`runner.ts`：探測與逐場景綁定；檢查執行前後來源未改變。
- 修改 `iteration.ts`：按場景及截圖步驟選基線；舊報告降為歷史參考。
- 修改 `report.ts`、`report-html.ts`：schema version 2 及缺失身份說明。
- 新增 `tests/miniprogram-review/evidence.test.ts`；修改 `iteration.test.ts`、`report.test.ts`、`cli.test.ts`、`adapter.test.ts`、`wechatide.test.ts`。HTML／Markdown 的既有測試已在 `report.test.ts`，不另建重複檔案。

上述既有實作／測試均在 `tools/miniprogram-review/`／`tests/miniprogram-review/` 下。新增與修改集中在工具，不主動改小程序。

**計畫接口：**

```ts
export interface ReviewEvidence {
  schemaVersion: 2
  source: {
    projectRoot: string
    executionRoot: string
    gitCommit: string | null
    candidateSha256: string
    unchangedDuringRun: boolean
    binding: 'launch-recorded' | 'unverified'
  }
  scenario: {
    pagePath: string
    scenarioSha256: string
    screenshotKey: string
    state: string
    stateInputSha256: string | null
    fixtureName: string | null
    fixtureSha256: string | null
  }
  runtime: {
    adapter: 'native-cli' | 'wechatide' | 'sdk'
    endpoint: string | null
    devToolsVersion: string | null
    sdkVersion: string | null
    width: number | null
    height: number | null
    pagePath: string | null
  }
}
export interface EvidenceComparison {
  status: 'comparable' | 'historical' | 'incompatible'
  reasons: string[]
}
export function compareReviewEvidence(
  before: ReviewEvidence | undefined,
  after: ReviewEvidence,
): EvidenceComparison
export function captureReviewSource(
  projectRoot: string,
  executionRoot: string,
): {
  projectRoot: string
  executionRoot: string
  gitCommit: string | null
  candidateSha256: string
}
export interface ReviewRuntimeInfo {
  adapter: ReviewEvidence['runtime']['adapter']
  endpoint: string | null
  devToolsVersion: string | null
  sdkVersion: string | null
  width: number | null
  height: number | null
  pagePath: string | null
}
// 加到既有 ReviewAdapter；相容不支援新方法的舊測試適配器。
// getReviewRuntimeInfo?(): Promise<ReviewRuntimeInfo>
```

`ReviewEvidence` 按截圖步驟保存，不把一個場景的首張圖當成整批所有修改的 before。既有 `ScenarioRunResult.screenshots` 保留；新增 `screenshotEvidence?: Array<{ path: string; evidence: ReviewEvidence }>`。既有 `beforeScreenshot` 暫留相容，增加 `comparisons?: Array<{ scenario: string; screenshotKey: string; before?: string; after: string; comparison: EvidenceComparison }>`，使每對圖片自帶判定。

- [ ] **1. 寫身份比較紅測試。**

```ts
const evidence = (commit: string): ReviewEvidence => ({
  schemaVersion: 2,
  source: {
    projectRoot: 'E:/project',
    executionRoot: 'E:/project',
    gitCommit: commit,
    candidateSha256: commit.repeat(64).slice(0, 64),
    unchangedDuringRun: true,
    binding: 'launch-recorded',
  },
  scenario: {
    pagePath: '/pages/catalog/index',
    scenarioSha256: 'a'.repeat(64),
    screenshotKey: 'catalog-ready',
    state: 'normal',
    stateInputSha256: 'b'.repeat(64),
    fixtureName: null,
    fixtureSha256: null,
  },
  runtime: {
    adapter: 'wechatide',
    endpoint: 'ws://127.0.0.1:9420',
    devToolsVersion: '2.02.2609292',
    sdkVersion: '3.17.0',
    width: 390,
    height: 844,
    pagePath: '/pages/catalog/index',
  },
})
it('有意不同版本的 before 與 after 可在同條件比較', () => {
  expect(compareReviewEvidence(evidence('1'), evidence('2')).status).toBe('comparable')
})
it('相同版本也不能跨不同狀態輸入比較', () => {
  const after = evidence('1')
  after.scenario.stateInputSha256 = 'c'.repeat(64)
  expect(compareReviewEvidence(evidence('1'), after).status).toBe('incompatible')
})
it('缺少身份的舊圖片只作歷史參考', () => {
  expect(compareReviewEvidence(undefined, evidence('2')).status).toBe('historical')
})
```

命令：`npm test -- tests/miniprogram-review/evidence.test.ts`。預期新比較器缺失。

補充矩陣：不同 fixture 實作 hash、SDK、尺寸、adapter、場景步驟或截圖鍵→不相容；未知實測尺寸／SDK／狀態輸入、來源執行中變更、僅 attach 且無啟動綁定→歷史參考；不同 endpoint／絕對副本路徑且各自有完整啟動記錄→可比較。版本、UI 素材及資料內容的有意變更展示在 source 區，不以 commit 必须相同作條件。

- [ ] **2. 實作 hash 與正式通道的最小探測。**

`captureReviewSource` 使用只讀 Git 命令取得完整 HEAD；候選 hash 取實際 `miniprogram/` 源碼／產物／素材、有效編譯配置及工具編譯副本映射，按安全相對路徑與 bytes 排序。忽略 temp、reports、node_modules 及個人 `.codex` 配置；私有編譯配置只保存 hash 和有效版本，不輸出原文。拒絕 root 外 symlink；開始及結束重新讀取，變動即 `unchangedDuringRun=false`。

場景 hash 使用已解析場景的穩定序列化；fixture hash 包含固定安裝／還原實作和資料。沒有 fixture 的場景必須有明確記錄的輸入狀態 hash 才能稱同條件；未知 storage／雲端狀態標 null，不能用場景名代替。

在工具固定的 evaluate 程式碼中讀實際 SDK／視窗資料，不接受場景提供任意腳本：

```js
function () {
  var win = typeof wx.getWindowInfo === 'function'
    ? wx.getWindowInfo() : wx.getSystemInfoSync();
  var app = typeof wx.getAppBaseInfo === 'function'
    ? wx.getAppBaseInfo() : wx.getSystemInfoSync();
  return { sdkVersion: app.SDKVersion, width: win.windowWidth, height: win.windowHeight };
}
```

重用現有固定 evaluate 與 ToolInfo 通道，當前頁面由 `currentPagePath()` 取得。先查既有實作是否提供版本／啟動資訊，沒有則返回 null；不得捏造平台返回的 projectRoot。`launch-recorded` 僅在本次工具實際啟動指定原始／編譯副本根、使用相應端點並完成頁面及元素探測時成立；既有 attach 会话无这些证据标 `unverified`。這是啟動紀錄，不宣稱已核對微信正式編譯包。

SDK 元件場景仍走 page→host nodeId→scoped element；使用实际 tap／readText 取證。doctor 靜態通過不設置 `launch-recorded`。

- [ ] **3. 更新基線選取與報告，保留旧格式读取。**

匹配 `pagePath + scenarioSha256 + screenshotKey`，再呼叫比較器。保持 `iteration.ts` 的檔案必須在報告目錄內、存在且是普通檔案的安全校驗。只複製相容圖片為可信基線；其他圖片不冒充 before，顯示原因及原歷史報告連結。無基線時仍執行 after 場景，报告列「缺修改前同條件證據」。

新增報告 `schemaVersion: 2`。讀取 schemaVersion 缺失的舊報告時兼容其 results；不回寫舊報告、不將其補成虛假的 runtime 身份。before／after 各顯示 commit、候選 hash、fixture、狀態、實測尺寸和 SDK。

- [ ] **4. 綠測試與真實工具驗證。**

命令：`npm test -- tests/miniprogram-review/evidence.test.ts tests/miniprogram-review/iteration.test.ts tests/miniprogram-review/report.test.ts tests/miniprogram-review/cli.test.ts tests/miniprogram-review/adapter.test.ts tests/miniprogram-review/wechatide.test.ts`。

選既有離線 fixture 場景，從工具啟動一次，保存 SDK／尺寸／頁面及元件查詢；再做 fixture 不同的副本，證明它不會被選為基線。對 fixture-free 目錄場景，先记录實際篩選條件／資料版本／storage 狀態；有 unknown 時只展示 after 與缺口。依頁面規範審查 HTML 畫面，最後 Node 22 跑完整門禁。

**驗收：** 有意跨版本比較成立；跨 fixture／狀態的同版本圖片也會拒絕；舊圖可讀但不獲得虛假可信度。

## B2：分層結果與最終報告

**檔案：** 修改 `cli.ts`、`report.ts`、`report-html.ts` 及 `tests/miniprogram-review/cli.test.ts`、`report.test.ts`；與 B1 schema 變更順序整合。

**計畫接口：**

```ts
export type ReviewCheckStatus = 'passed' | 'failed' | 'blocked' | 'not-run'
export interface ReviewChecks {
  mode: 'iterate' | 'final'
  page: { status: ReviewCheckStatus; required: boolean }
  repository: { status: ReviewCheckStatus; required: boolean; command: string }
  external: Array<{
    id: string
    status: ReviewCheckStatus
    required: boolean
    evidence?: string
  }>
}
export function overallReviewStatus(checks: ReviewChecks): ReviewCheckStatus
```

新 `checks` 放入 ReviewReportInput／ReviewReport。外部清單描述本輪聲明的驗收範圍；未收集證據的設備／真雲／QR 永不推斷 passed。報告必須標示整體結論的範圍為「本輪要求的檢查」，另外固定展示產品外部缺口；不把 external 全設 required=false 後宣稱發布通過。

`ReviewReport.status` 改用 `ReviewCheckStatus`；場景與 iteration 的既有 `ReviewResultStatus` 保持 passed／failed／blocked。`checks.page.status` 必須包含既有未命中文件／路由、缺 after 截圖及 iteration 失敗判定，不能只聚合單個場景的 passed。保留既有未覆盖阻塞回歸。

- [ ] **1. 新增 CLI 整合紅測試，重用當前測試中的 `dependencies()`。**

```ts
it('final 頁面通過但倉庫失敗，最後一份報告反映失敗', async () => {
  const writeReport = vi.fn(dependencies().writeReport)
  const deps = dependencies({
    readGitChangedFiles: () => ['miniprogram/pages/catalog/index.wxml'],
    listScenarioPaths: () => ['catalog.json'],
    runQualityGate: async () => false,
    writeReport,
  })
  expect(await runCli(['changed', '--mode', 'final'], deps)).toBe(1)
  const finalReport = writeReport.mock.calls.at(-1)?.[1]
  expect(finalReport?.checks.page.status).toBe('passed')
  expect(finalReport?.checks.repository.status).toBe('failed')
  expect(finalReport?.status).toBe('failed')
})
```

配合 B1 新增依賴更新測試 helper，使用顯式假的身份而非實際連 DevTools。補充 iterate repository=`not-run`、final 門禁拋錯=`blocked`、無頁面變更 page=`not-run` 且 `required=false`、外部必需項未跑→整體未完成。HTML 和 Markdown 必須包含三層中文標籤及未執行字樣。

- [ ] **2. 實作固定聚合規則與同 run 最終寫入。**

```ts
export function overallReviewStatus(checks: ReviewChecks): ReviewCheckStatus {
  const required = [checks.page, checks.repository, ...checks.external].filter(
    (check) => check.required,
  )
  if (required.some((check) => check.status === 'failed')) return 'failed'
  if (required.some((check) => check.status === 'blocked')) return 'blocked'
  if (required.length === 0 || required.some((check) => check.status === 'not-run'))
    return 'not-run'
  return 'passed'
}
```

頁面結果保留原始 failed／blocked 原因，總結另表達必需項。review／run 沒跑倉庫門禁時如實 `not-run`；是否 required 由 command 的範圍決定。`changed --mode final` 在品質門禁完成或拋錯後，用相同 runId／outputDir 寫入最終報告；若中途先寫草稿，明示尚未完成。只更新當次 run，盡可能以同目錄臨時檔再替換避免半份報告。報告寫入失敗保留原始原因並返回非零，不能回退宣稱 passed。

- [ ] **3. 跑綠測試與一次故障演示。**

命令：`npm test -- tests/miniprogram-review/cli.test.ts tests/miniprogram-review/report.test.ts`。用測試依賴注入 repository fail，保存 HTML／JSON／Markdown 及 CLI 結果；不要破壞真實工作區來製造門禁失敗。再跑 Node 22 完整門禁。

**驗收：** final 失敗不会留下表達本輪整體通過的主報告；未跑、阻塞和失敗分開，舊報告不變。

## B3：有界條件等待

**檔案：**

- 新增 `tools/miniprogram-review/wait-condition.ts` 及 `tests/miniprogram-review/wait-condition.test.ts`。
- 修改 `types.ts`、`scenario.ts`、`runner.ts` 及 `tests/miniprogram-review/scenario.test.ts`、`runner.test.ts`。
- 首次只修改 `tools/miniprogram-review/scenarios/adventure-skill-picker-detail.json` 中技能詳情關閉後的一段：現有等待 picker 可見不足以證明 detail 已消失，補 `waitUntil exists=false` 與原 `assertText` 配對。此場景沒有 duration 固定等待，不假稱替換了固定延時；不全量重寫場景。

**計畫接口：**

```ts
export type ReviewWaitCondition =
  | { kind: 'exists'; selector: string; exists: boolean }
  | { kind: 'text'; selector: string; equals: string }
  | { kind: 'text'; selector: string; contains: string }
  | { kind: 'page'; path: string }
export function waitForCondition(input: {
  probe: () => Promise<boolean>
  timeoutMs: number
  pollMs: number
  stableSamples: number
  nowMs?: () => number
  sleep?: (durationMs: number) => Promise<void>
}): Promise<void>
// 加入 ReviewStep union：
// { action: 'waitUntil'; condition: ReviewWaitCondition; timeoutMs?: number }
```

參數預設 timeout 5000ms、poll 100ms、连续成立 2 次。schema 限制 timeout 為 1–30000 整數，沿用安全 selector／page 校驗；equals／contains 互斥；拒絕未知欄位。輸入中不允許任意程式碼。

- [ ] **1. 寫超時與狀態抖動紅測試。**

```ts
it('条件抖動後要連續兩次成立', async () => {
  let now = 0
  const values = [false, true, false, true, true]
  const probe = vi.fn(async () => values.shift() ?? true)
  await waitForCondition({
    probe,
    timeoutMs: 1000,
    pollMs: 100,
    stableSamples: 2,
    nowMs: () => now,
    sleep: async (ms) => {
      now += ms
    },
  })
  expect(probe).toHaveBeenCalledTimes(5)
  expect(now).toBe(400)
})
it('協議錯誤保留原始例外，不能當成元素消失', async () => {
  const original = new Error('Connection closed')
  await expect(
    waitForCondition({
      probe: async () => {
        throw original
      },
      timeoutMs: 1000,
      pollMs: 100,
      stableSamples: 2,
    }),
  ).rejects.toBe(original)
})
```

命令：`npm test -- tests/miniprogram-review/wait-condition.test.ts`。另加一直 false／永不 resolve 的 probe 有界超時、文字節點尚未存在、路徑標準化、一次錯誤不加重啟預算等案例。使用 fake timers 或注入 now／sleep，不讓單元測試真等 30 秒。

- [ ] **2. 實作截止時間，接入 runner。**

probe 每次只啟動一次，不並行輪詢；以剩餘 deadline 包住當次 probe，超時後不再啟動 probe，既有 finally 仍清理 adapter。未 resolve 的協議呼叫不能讓整個場景無限等待。probe 拋出的連線／作用域錯誤直接向上傳，不廣泛 catch 成 false。

```ts
// runner 的條件分派；只重用既有 adapter API。
const condition = step.condition
const probe = async (): Promise<boolean> => {
  if (condition.kind === 'exists') {
    return (await adapter.queryElement(condition.selector)) === condition.exists
  }
  if (condition.kind === 'page') {
    const actual = '/' + (await adapter.currentPagePath()).replace(/^\//, '')
    return actual === condition.path
  }
  if (!(await adapter.queryElement(condition.selector))) return false
  const text = await adapter.readText(condition.selector)
  return 'equals' in condition ? text === condition.equals : text.includes(condition.contains)
}
await waitForCondition({ probe, timeoutMs: step.timeoutMs ?? 5000, pollMs: 100, stableSamples: 2 })
```

失敗訊息包含条件、總等待時間及最後可觀察值；不刪原 `assertExists`／`assertText`。現有 `waitFor` 完全相容。page condition 僅確認 path，不聲稱 routeDone／轉場動畫完成。

- [ ] **3. 遷移一個場景並驗證正式互動。**

技能元件打開後用 exists／text 等待實際節點，关闭後用 exists=false 等待其消失，再保留原斷言及 screenshot。選擇器使用既有 host scope，不因 page 級查不到就延長超時。若仍阻塞，保留最小重現與實際边界，停止擴大迁移。

首次場景具體插入在 `.skill-sheet__close` tap 之後、等待 `.skill-picker-sheet--sheet` 之前：

```json
{
  "action": "waitUntil",
  "condition": { "kind": "exists", "selector": ".skill-sheet", "exists": false },
  "timeoutMs": 5000
}
```

命令：`npm test -- tests/miniprogram-review/wait-condition.test.ts tests/miniprogram-review/scenario.test.ts tests/miniprogram-review/runner.test.ts tests/miniprogram-review/cli.test.ts`；正式工具執行該場景，保存身份及原始互動證據，再跑 Node 22 完整門禁。

**驗收：** 關閉、文字與 path 條件各有測試；有界超時；連線錯誤不吞沒；共享恢復預算仍最多 2 次；未刪既有斷言。

## B 批交付清單

- [ ] 一份 schema version 2 的實際 report.html／json／md，含可追溯圖片與缺口。
- [ ] 可比較／不相容／歷史參考三類基線證據。
- [ ] final 倉庫失敗與 iterate 未跑門禁的報告證據。
- [ ] 正式元件 scoped 查詢及條件等待記錄，不以 handler 注入代替互動。
- [ ] 相關測試、完整門禁、頁面規範要求及仍未完成的真機／真雲項。
- [ ] 擬用 message：`完善頁面證據身份與分層驗收結果`；未經授權不提交。
