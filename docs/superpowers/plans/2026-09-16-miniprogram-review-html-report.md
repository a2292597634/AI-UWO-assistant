# 小程序 HTML 验收报告实施计划

> **供代理执行：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐任务执行本计划。步骤使用复选框追踪。

**目标：** 将现有小程序验收结果升级为可离线打开的 HTML 主报告，同时保留 JSON 与 Markdown 兼容输出，并为每轮页面修改记录变更文件和截图证据。

**架构：** `tools/miniprogram-review/report.ts` 负责报告模型规范化、JSON/Markdown 写入和输出路径；新建 `report-html.ts` 只负责安全、确定性的 HTML 渲染。CLI 继续把场景执行器产出的截图路径传入报告器；后续 `devtools:changed` 触发器通过 `iterations` 字段追加修改时间线，不让 HTML 渲染器承担 Git 或开发者工具逻辑。

**技术栈：** TypeScript、Node.js `fs/path`、Vitest、内嵌 CSS/SVG/固定轻量浏览器脚本；不新增 npm 依赖，不加载远程资源。

## 全局约束

- 所有代码注释、文档和终端文案使用中文；WXML/WXSS 类名约束不适用于本地报告工具。
- 自动化与报告代码只放在 `tools/miniprogram-review/`，不得进入 `miniprogram/` 运行时代码。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`，不顺手修复无关问题。
- `artifacts/miniprogram-review/` 继续被 `.gitignore` 忽略；报告与截图不进入小程序发布包。
- 不使用远程 URL、`iframe`、外部 CSS、外部 JS、`innerHTML` 注入或未转义的场景数据。
- 每个任务的提交前都展示变更文件、验证结果和拟用 message，取得用户确认后才能提交。
- 最终运行 `npm run verify`，并在可用时使用微信开发者工具做一次真实验收。

---

### 任务 1：报告模型、迭代证据和阻塞状态

**文件：**

- 修改：`tools/miniprogram-review/report.ts`
- 修改：`tools/miniprogram-review/runner.ts`
- 修改：`tests/miniprogram-review/report.test.ts`
- 修改：`tests/miniprogram-review/runner.test.ts`

**接口：**

- `ReviewIterationInput`：接收 `id`、`startedAt`、可选 `finishedAt`、可选 `summary`、`changedFiles`、`status`、可选 `beforeScreenshot`、`afterScreenshots` 和可选 `notes`。
- `ReviewIteration`：将日期标准化为 ISO 字符串，缺省摘要为“本轮页面修改与自动验收”，缺省备注为空数组。
- `ReviewReportInput.iterations?: ReviewIterationInput[]`。
- `ReviewReport.status: 'passed' | 'failed' | 'blocked'`。
- `ScenarioRunResult.status: 'passed' | 'failed' | 'blocked'`；现有执行器的页面断言错误仍返回 `failed`，环境阻塞由 CLI 产生 `blocked` 结果。

- [ ] **步骤 1：先写失败测试，锁定迭代排序和状态优先级**

```ts
it('规范化修改轮次并让阻塞优先于失败', () => {
  const report = buildReviewReport({
    runId: 'fixed-run',
    generatedAt: new Date('2026-09-16T01:00:00.000Z'),
    git: { commit: 'abc1234', dirty: true },
    results: [
      {
        scenario: '目录搜寻',
        pagePath: '/pages/catalog/index',
        state: 'normal',
        status: 'blocked',
        steps: [],
        screenshots: [],
        error: '开发者工具未登录',
      },
    ],
    iterations: [
      {
        id: '002',
        startedAt: new Date('2026-09-16T01:02:00.000Z'),
        summary: '调整卡片间距',
        changedFiles: ['miniprogram/pages/catalog/index.wxss', 'miniprogram/pages/catalog/index.wxml'],
        status: 'blocked',
        afterScreenshots: [],
      },
      {
        id: '001',
        startedAt: new Date('2026-09-16T01:01:00.000Z'),
        changedFiles: ['miniprogram/pages/catalog/index.wxml'],
        status: 'passed',
        afterScreenshots: ['C:/review/run/after.png'],
      },
    ],
    coverage: { covered: [], exempted: [], manual: [], manualStates: [] },
  })

  expect(report.status).toBe('blocked')
  expect(report.iterations.map((iteration) => iteration.id)).toEqual(['001', '002'])
  expect(report.iterations[0]?.summary).toBe('本轮页面修改与自动验收')
  expect(report.iterations[0]?.changedFiles).toEqual(['miniprogram/pages/catalog/index.wxml'])
})
```

- [ ] **步骤 2：运行测试确认当前实现正确失败**

运行：`npx vitest run tests/miniprogram-review/report.test.ts`

预期：FAIL，原因是 `ReviewIteration` 尚未存在，且当前报告状态只有 `passed`/`failed`。

- [ ] **步骤 3：实现最小报告模型变更**

在 `report.ts` 中加入以下结构，并保持未传 `iterations` 的旧调用方可用：

```ts
export type ReviewResultStatus = 'passed' | 'failed' | 'blocked'

export interface ReviewIterationInput {
  id: string
  startedAt: Date
  finishedAt?: Date
  summary?: string
  changedFiles: string[]
  status: ReviewResultStatus
  beforeScreenshot?: string
  afterScreenshots: string[]
  notes?: string[]
}

export interface ReviewIteration {
  id: string
  startedAt: string
  finishedAt?: string
  summary: string
  changedFiles: string[]
  status: ReviewResultStatus
  beforeScreenshot?: string
  afterScreenshots: string[]
  notes: string[]
}
```

`buildReviewReport` 按 `blocked` → `failed` → `passed` 计算总体状态；迭代按 `startedAt` 和 `id` 稳定排序，文件去重后用 `localeCompare` 排序。同步更新 runner 的结果类型，但不在 runner 内猜测环境阻塞。

- [ ] **步骤 4：运行报告和原有 runner 测试确认通过**

运行：`npx vitest run tests/miniprogram-review/report.test.ts tests/miniprogram-review/runner.test.ts`

预期：PASS；旧 Markdown 断言和场景步骤断言不回归。

- [ ] **步骤 5：提交任务 1**

展示变更文件、测试输出和拟用 message `refactor: 扩展小程序验收报告状态模型`，等待用户确认后提交。

---

### 任务 2：安全、确定性的 HTML 渲染器

**文件：**

- 新建：`tools/miniprogram-review/report-html.ts`
- 修改：`tools/miniprogram-review/report.ts`
- 修改：`tests/miniprogram-review/report.test.ts`

**接口：**

- `escapeHtml(value: string): string`
- `toReportAssetPath(outputDir: string, assetPath: string): string | undefined`
- `renderReviewReportHtml(report: ReviewReport, outputDir: string): string`

- [ ] **步骤 1：写失败测试，锁定 HTML 骨架、相对截图路径和转义**

```ts
it('生成包含时间线、步骤图标和相对截图的离线 HTML', () => {
  const report = buildReviewReport({
    ...fixedInput,
    iterations: [
      {
        id: '001',
        startedAt: new Date('2026-09-16T01:00:00.000Z'),
        summary: '<调整卡片>',
        changedFiles: ['miniprogram/pages/catalog/index.wxss'],
        status: 'passed',
        afterScreenshots: ['C:/review/output/current-simulator/catalog.png'],
        notes: ['保持 <script> 文本为普通说明'],
      },
    ],
  })
  const html = renderReviewReportHtml(report, 'C:/review/output')

  expect(html).toContain('<title>小程序页面验收报告</title>')
  expect(html).toContain('修改过程')
  expect(html).toContain('调整卡片')
  expect(html).toContain('data-lightbox-src="current-simulator/catalog.png"')
  expect(html).toContain('icon-screenshot')
  expect(html).not.toContain('<script> 文本为普通说明')
  expect(html).toContain('&lt;script&gt; 文本为普通说明')
  expect(html).not.toMatch(/https?:\/\//i)
})

it('拒绝把报告目录外的截图渲染成图片链接', () => {
  expect(toReportAssetPath('C:/review/output', 'C:/review/secret.png')).toBeUndefined()
})
```

- [ ] **步骤 2：运行测试确认当前实现正确失败**

运行：`npx vitest run tests/miniprogram-review/report.test.ts`

预期：FAIL，原因是 `report-html.ts` 尚不存在。

- [ ] **步骤 3：实现转义和路径边界函数**

使用固定替换表实现 `escapeHtml`，至少转义 `&`、`<`、`>`、`"` 和 `'`。`toReportAssetPath` 使用 `resolve` + `relative`：解析后的目标必须位于解析后的 `outputDir` 内，且不能以 `..` 开头或成为绝对路径；通过后把 Windows 分隔符改成 `/`。

- [ ] **步骤 4：实现 HTML 模板和固定图标表**

在 `report-html.ts` 中按以下顺序拼接字符串：

1. `<!doctype html>`、`<meta charset="utf-8">`、`<title>`。
2. 内嵌 `<style>`：海绿色 `#26332f`、纸张背景 `#e7deca`、卡片 `#f5efe0`、黄铜 `#b99552`、失败 `#8b3a3a`、阻塞 `#7a5a2a`，使用响应式单列布局。
3. 内嵌 `<svg aria-hidden="true"><symbol ...></symbol></svg>` 图标表，至少包含 `status-passed`、`status-failed`、`status-blocked`、`icon-click`、`icon-input`、`icon-scroll`、`icon-assert`、`icon-screenshot`。
4. `<header>` 摘要、覆盖数字卡片、修改时间线、场景 `<details>` 卡片、人工核验列表和 JSON `<pre>`。
5. 每个截图只在 `toReportAssetPath` 返回值存在时渲染 `<img loading="lazy" src="..." alt="...">`，同时显示文件名。
6. 内嵌固定脚本，通过 `data-lightbox-src` 事件委托打开 `<dialog>`；关闭按钮、Esc 和遮罩点击关闭。脚本只读取 `dataset` 和 `textContent`，不执行报告字段。

动作与状态必须从固定映射表转换为中文，未知动作显示“未知动作”而不是把值拼入脚本。所有场景、错误、路径、摘要和备注先经过 `escapeHtml`。

- [ ] **步骤 5：运行报告测试并做确定性检查**

运行：`npx vitest run tests/miniprogram-review/report.test.ts && npm run typecheck && git diff --check`

预期：PASS；相同 report 和 outputDir 连续渲染得到完全相同字符串。

- [ ] **步骤 6：提交任务 2**

展示变更文件、验证输出和拟用 message `feat: 新增小程序 HTML 验收报告渲染器`，等待用户确认后提交。

---

### 任务 3：写入三个报告文件并接入 CLI 日志

**文件：**

- 修改：`tools/miniprogram-review/report.ts`
- 修改：`tools/miniprogram-review/cli.ts`
- 修改：`tests/miniprogram-review/report.test.ts`
- 修改：`tests/miniprogram-review/cli.test.ts`

**接口：**

- `writeReviewReport(outputDir: string, report: ReviewReport): { htmlPath: string; jsonPath: string; markdownPath: string }`
- `CliDependencies.writeReport` 使用同一返回类型。

- [ ] **步骤 1：写失败测试，锁定 HTML 文件和日志顺序**

```ts
it('同时写入 HTML、JSON、Markdown，并优先返回 HTML 路径', () => {
  const directory = mkdtempSync(join(tmpdir(), 'uwo-review-report-'))
  temporaryDirectories.push(directory)
  const paths = writeReviewReport(directory, buildReviewReport(fixedInput))

  expect(paths).toEqual({
    htmlPath: join(directory, 'report.html'),
    jsonPath: join(directory, 'report.json'),
    markdownPath: join(directory, 'report.md'),
  })
  expect(readFileSync(paths.htmlPath, 'utf8')).toContain('<title>小程序页面验收报告</title>')
})
```

在 CLI 测试中把 `writeReport` mock 返回值改为三个路径，并断言 `HTML 报告：...` 出现在 JSON/Markdown 日志之前。

- [ ] **步骤 2：运行测试确认旧 writer 类型和实现正确失败**

运行：`npx vitest run tests/miniprogram-review/report.test.ts tests/miniprogram-review/cli.test.ts`

预期：FAIL，原因是 writer 目前只写两个文件，CLI 依赖类型也只有两个路径。

- [ ] **步骤 3：实现写入逻辑和 CLI 输出**

`writeReviewReport` 先创建输出目录，再写 `report.json`、`report.md` 和 `report.html`；HTML 渲染器接收同一个 `report` 和 `outputDir`。CLI 输出顺序固定为：HTML、JSON、Markdown、成功/失败截图绝对路径。对旧 mock 保持测试替换时不读取不存在的字段。

- [ ] **步骤 4：运行相关测试和 lint**

运行：`npx vitest run tests/miniprogram-review/report.test.ts tests/miniprogram-review/cli.test.ts && npm run lint && npm run typecheck`

预期：PASS，终端日志明确包含三个报告路径。

- [ ] **步骤 5：提交任务 3**

展示变更文件、验证输出和拟用 message `feat: 接入 HTML 验收报告输出`，等待用户确认后提交。

---

### 任务 4：修改时间线证据收集

**文件：**

- 新建：`tools/miniprogram-review/iteration.ts`
- 新建：`tests/miniprogram-review/iteration.test.ts`
- 修改：`tools/miniprogram-review/cli.ts`

**接口：**

- `createIterationInput(input: { id: string; startedAt: Date; finishedAt: Date; changedFiles: string[]; results: ScenarioRunResult[]; previousReportDirs: string[]; outputDir: string }): ReviewIterationInput`
- `copyTrustedBaseline(input: { previousReportDir: string; outputDir: string; pagePath: string; scenario: string }): string | undefined`

- [ ] **步骤 1：写失败测试，锁定 after 截图、变更文件和可信 before 基线**

测试先在临时目录写入一个上次 `report.json` 和其目录内的 `previous.png`，再创建当前结果；断言：

```ts
const iteration = createIterationInput({
  id: '002',
  startedAt: new Date('2026-09-16T02:00:00.000Z'),
  finishedAt: new Date('2026-09-16T02:00:02.000Z'),
  changedFiles: ['miniprogram/pages/catalog/index.wxss'],
  results: [
    {
      scenario: '目录搜寻',
      pagePath: '/pages/catalog/index',
      state: 'normal',
      status: 'passed',
      steps: [],
      screenshots: [`${currentOutput}/current-simulator/catalog.png`],
    },
  ],
  previousReportDirs: [previousOutput],
  outputDir: currentOutput,
})

expect(iteration.status).toBe('passed')
expect(iteration.changedFiles).toEqual(['miniprogram/pages/catalog/index.wxss'])
expect(iteration.afterScreenshots).toEqual([`${currentOutput}/current-simulator/catalog.png`])
expect(iteration.beforeScreenshot).toContain(`${currentOutput}/iterations/002-before.png`)
```

另测：上一份报告的截图位于报告目录外时，`beforeScreenshot` 必须为 `undefined`；任一结果失败时迭代状态为 `failed`。

- [ ] **步骤 2：运行测试确认实现不存在时失败**

运行：`npx vitest run tests/miniprogram-review/iteration.test.ts`

预期：FAIL，原因是 `iteration.ts` 尚不存在。

- [ ] **步骤 3：实现可信基线复制和迭代规范化**

只读取 `previousReportDir/report.json`；从 JSON 找到相同 `scenario` 与 `pagePath` 的第一张成功截图。解析后必须位于 `previousReportDir` 内且文件存在，才复制到 `outputDir/iterations/<id>-before.png`。`afterScreenshots` 按当前结果顺序收集成功截图和 failure screenshot；不复制报告目录外文件。摘要使用固定缺省值，不从文件内容猜测修改原因。

- [ ] **步骤 4：运行迭代测试、报告测试和类型检查**

运行：`npx vitest run tests/miniprogram-review/iteration.test.ts tests/miniprogram-review/report.test.ts && npm run typecheck`

预期：PASS，且迭代目录路径使用 `/` 之外的 Windows 文件系统路径时仍能正常写入。

- [ ] **步骤 5：提交任务 4**

展示变更文件、验证输出和拟用 message `feat: 记录小程序页面修改迭代证据`，等待用户确认后提交。

---

### 任务 5：文档、人工检查和完整门禁

**文件：**

- 修改：`docs/miniprogram-review.md`
- 修改：`README.md`（仅在当前 README 已有验收入口的位置追加链接）

**接口：**

- 文档明确报告路径优先级：先打开 `report.html`，AI 需要结构化字段时读取 `report.json`，旧脚本仍可读取 `report.md`。

- [ ] **步骤 1：更新使用文档**

把现有“读取 `report.md`”改为“打开 `report.html`”；说明 HTML 为离线文件、截图不进包体积、缩略图可点击放大、修改时间线没有可信基线时会明确显示缺失，而不是伪造对比。

- [ ] **步骤 2：运行文档相关格式和报告测试**

运行：`npx prettier --check docs/miniprogram-review.md README.md tools/miniprogram-review/report-html.ts tools/miniprogram-review/iteration.ts && npx vitest run tests/miniprogram-review`

预期：PASS。

- [ ] **步骤 3：执行完整门禁**

运行：`npm run verify`

预期：format、lint、typecheck、test、runtime-network、包体积、素材、数据和生成检查全部退出 `0`。若发现与本任务无关的既有失败，只记录并停止夹带修复。

- [ ] **步骤 4：提交任务 5**

展示最终变更文件、`npm run verify` 输出、拟用 message `docs: 补充 HTML 验收报告使用说明`，等待用户确认后提交。

---

## 交付验收

在开发者工具已登录并开启自动化端口时运行：

```powershell
npm run devtools:review -- --page /pages/catalog/index
```

打开终端打印的 `report.html`，逐项确认摘要、场景步骤、截图缩放和人工清单；若再运行一次并有页面 Git 变更，确认时间线出现新轮次和 after 截图。最终交付必须同时说明 HTML、JSON、Markdown 三个路径，以及任何失败或阻塞原因。
