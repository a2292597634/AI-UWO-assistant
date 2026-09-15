# 小程序 AI 自主页面验收实施计划

> **供代理执行：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐任务执行本计划。步骤使用复选框追踪。

**目标：** 建立以 `miniprogram-automator` 为执行引擎的本地页面交互、截图和结构化验收闭环，使 AI 能完成页面实现后的自主检查，只把最终证据交给用户核验。

**架构：** `tools/miniprogram-review/` 分成配置诊断、场景契约、自动化适配器、步骤执行器、报告器和 CLI 六个边界。单元测试只依赖抽象适配器，不要求本机开发者工具在线；真实连接由显式 `devtools:*` 命令验收。

**技术栈：** TypeScript、tsx、Vitest、Node.js 22、微信官方 `miniprogram-automator`、微信开发者工具 CLI。

## 全局约束

- 所有用户可见文字、代码注释和文档使用繁体中文。
- 自动化工具只存在于 `tools/`，不得进入 `miniprogram/` 运行时代码。
- 不修改 `archive/`、`data/master/` 或 `miniprogram/generated/`。
- 只新增已获用户确认的 `miniprogram-automator` 开发依赖，不新增或升级其他依赖。
- 自动化端口只绑定本机，不绕过微信登录、授权或扫码确认。
- 普通 `npm test` 不得依赖微信开发者工具已安装、已登录或正在运行。
- 每个提交前展示变更文件、验证结果和拟用 message，取得用户确认后才能提交。
- 最终执行完整 `npm run verify`。

---

## 文件结构

- `tools/miniprogram-review/types.ts`：场景、步骤、报告和适配器的共享类型。
- `tools/miniprogram-review/config.ts`：环境变量、CLI 路径、端口和项目路径解析。
- `tools/miniprogram-review/scenario.ts`：读取并严格校验 JSON 场景。
- `tools/miniprogram-review/adapter.ts`：把 `miniprogram-automator` 封装为可测试接口。
- `tools/miniprogram-review/runner.ts`：按顺序执行场景步骤并收集结果。
- `tools/miniprogram-review/report.ts`：确定性生成 JSON 和 Markdown 报告。
- `tools/miniprogram-review/cli.ts`：实现 `doctor`、`start`、`inspect`、`run`、`review` 子命令。
- `tools/miniprogram-review/scenarios/catalog-search.json`：目录页真实示范场景。
- `tests/miniprogram-review/*.test.ts`：对应模块单元测试。
- `docs/miniprogram-review.md`：人工初始化、AI 使用和故障恢复说明。
- `.env.example`：仅记录无秘密的配置键示例。
- `.gitignore`：忽略验收产物。
- `package.json`、`package-lock.json`：依赖及命令入口。

---

### 任务 1：配置解析与环境诊断

**文件：**

- 新建：`tools/miniprogram-review/types.ts`
- 新建：`tools/miniprogram-review/config.ts`
- 新建：`tests/miniprogram-review/config.test.ts`
- 新建：`.env.example`
- 修改：`package.json`
- 修改：`package-lock.json`

**接口：**

- 产出：`resolveReviewConfig(input): ReviewConfig`
- 产出：`diagnoseReviewConfig(config): DiagnosticItem[]`
- `ReviewConfig` 包含 `projectPath`、`cliPath`、`servicePort?`、`automationPort`、`wsEndpoint?`。
- 配置优先级：显式参数 > 环境变量 > 常见安装路径/默认值。

- [ ] **步骤 1：编写失败测试，锁定配置优先级和错误信息**

```ts
import { describe, expect, it } from 'vitest'
import { resolveReviewConfig } from '../../tools/miniprogram-review/config'

describe('小程序验收配置', () => {
  it('显式参数覆盖环境变量，自动化端口默认 9420', () => {
    const config = resolveReviewConfig({
      cwd: 'E:/project',
      args: { cliPath: 'D:/explicit/cli.bat' },
      env: { WECHAT_DEVTOOLS_CLI: 'D:/env/cli.bat' },
      existingPaths: new Set(['D:/explicit/cli.bat']),
    })
    expect(config.cliPath).toBe('D:/explicit/cli.bat')
    expect(config.automationPort).toBe(9420)
  })

  it('拒绝超出范围的端口', () => {
    expect(() =>
      resolveReviewConfig({ cwd: 'E:/project', args: {}, env: { WECHAT_AUTOMATION_PORT: '70000' } }),
    ).toThrow('自动化端口必须是 1 至 65535 的整数')
  })
})
```

- [ ] **步骤 2：运行测试并确认因模块不存在而失败**

运行：`npx vitest run tests/miniprogram-review/config.test.ts`

预期：FAIL，原因是无法解析 `tools/miniprogram-review/config`。

- [ ] **步骤 3：实现最小配置解析和诊断**

实现纯函数配置解析；常见路径探测只接收可注入的 `existingPaths`/`pathExists`，避免测试访问真实安装目录。诊断项目目录必须存在 `project.config.json`，CLI 必须是文件，端口必须为 `1..65535` 整数。错误文案使用繁体中文并给出对应环境变量名。

- [ ] **步骤 4：安装唯一获准依赖并增加临时测试命令**

运行：`npm install --save-dev miniprogram-automator`

在 `package.json` 增加：

```json
"devtools:doctor": "tsx tools/miniprogram-review/cli.ts doctor"
```

- [ ] **步骤 5：验证任务 1**

运行：`npx vitest run tests/miniprogram-review/config.test.ts && npm run typecheck`

预期：全部 PASS，且类型检查退出码为 `0`。

- [ ] **步骤 6：提交门禁**

展示本任务文件、验证输出和拟用 message `feat: 新增小程序验收环境诊断`，等待用户确认后提交。

---

### 任务 2：声明式场景契约与严格校验

**文件：**

- 修改：`tools/miniprogram-review/types.ts`
- 新建：`tools/miniprogram-review/scenario.ts`
- 新建：`tests/miniprogram-review/scenario.test.ts`

**接口：**

- 产出：`parseScenario(value: unknown): ReviewScenario`
- 产出：`loadScenario(path: string): ReviewScenario`
- 动作为带 `action` 判别字段的联合类型，不允许额外字段。

- [ ] **步骤 1：编写失败测试，覆盖合法动作和危险输入**

```ts
it('接受点击、输入、滚动、等待、断言和截图步骤', () => {
  expect(parseScenario({
    name: '目錄搜尋',
    entry: '/pages/catalog/index',
    state: 'normal',
    devices: ['iphone-standard'],
    steps: [
      { action: 'input', selector: '.catalog-page__search-input', value: '鄭和' },
      { action: 'tap', selector: '.catalog-page__officer-row' },
      { action: 'scrollPage', distance: 600 },
      { action: 'assertExists', selector: '.detail-page' },
      { action: 'screenshot', name: 'detail-bottom' },
    ],
  }).steps).toHaveLength(5)
})

it('拒绝任意 JavaScript 动作和未知字段', () => {
  expect(() => parseScenario({
    name: '危險場景', entry: '/pages/catalog/index', state: 'normal', devices: [],
    steps: [{ action: 'evaluate', code: 'wx.request({})' }],
  })).toThrow('不支援的場景動作')
})
```

- [ ] **步骤 2：运行测试并确认正确失败**

运行：`npx vitest run tests/miniprogram-review/scenario.test.ts`

预期：FAIL，原因是 `parseScenario` 尚未实现。

- [ ] **步骤 3：实现动作联合类型和手写严格校验器**

不新增 Schema 依赖。验证场景名称、绝对页面路径、五类状态、三类设备、非空步骤、选择器、等待上限、滚动距离和安全截图名称。拒绝原型键、未知动作和每种动作的额外字段。

- [ ] **步骤 4：验证并重构重复校验逻辑**

运行：`npx vitest run tests/miniprogram-review/scenario.test.ts && npm run typecheck`

预期：PASS。只在绿色后提取 `expectRecord`、`expectString` 和 `rejectUnknownKeys` 等内部函数。

- [ ] **步骤 5：提交门禁**

展示变更和拟用 message `feat: 定义小程序验收场景契约`，等待用户确认后提交。

---

### 任务 3：自动化适配器与步骤执行器

**文件：**

- 新建：`tools/miniprogram-review/adapter.ts`
- 新建：`tools/miniprogram-review/runner.ts`
- 新建：`tests/miniprogram-review/runner.test.ts`

**接口：**

- 消费：`ReviewScenario` 和动作联合类型。
- 产出：`ReviewAdapter`，仅暴露 `navigate`、`switchTab`、`tap`、`input`、`clearInput`、`scrollPage`、`scrollElement`、`waitFor`、`queryElement`、`readText`、`screenshot`、`currentPagePath`、`disconnect`。
- 产出：`runScenario(adapter, scenario, context): Promise<ScenarioRunResult>`。
- `adapter.ts` 是唯一允许导入 `miniprogram-automator` 的文件。

- [ ] **步骤 1：编写失败测试，证明步骤按序调度**

```ts
it('按场景顺序执行输入、点击、滚动和截图', async () => {
  const calls: string[] = []
  const adapter = createRecordingAdapter(calls)
  const result = await runScenario(adapter, scenario, { outputDir: 'C:/review/run' })

  expect(calls).toEqual([
    'navigate:/pages/catalog/index',
    'input:.catalog-page__search-input:鄭和',
    'tap:.catalog-page__officer-row',
    'scrollPage:600',
    'screenshot:C:/review/run/detail-bottom.png',
  ])
  expect(result.status).toBe('passed')
})
```

- [ ] **步骤 2：编写失败测试，证明失败现场会被保存**

```ts
it('元素缺失时保存失败截图并停止后续步骤', async () => {
  const adapter = createRecordingAdapter([], { missingSelector: '.missing' })
  const result = await runScenario(adapter, missingElementScenario, {
    outputDir: 'C:/review/run',
  })
  expect(result.status).toBe('failed')
  expect(result.failedStep).toBe(0)
  expect(result.failureScreenshot).toBe('C:/review/run/failure-step-001.png')
})
```

- [ ] **步骤 3：运行测试并确认因执行器不存在而失败**

运行：`npx vitest run tests/miniprogram-review/runner.test.ts`

- [ ] **步骤 4：实现最小步骤执行器**

按顺序执行动作；每一步记录动作、开始时间、耗时和结果。选择器操作前统一等待元素；错误对象包含场景名、步骤索引、动作、选择器、页面路径和原始错误。失败后只执行现场截图与断开连接，不继续剩余步骤。

- [ ] **步骤 5：实现真实 `miniprogram-automator` 适配器**

连接模式使用 `automator.connect({ wsEndpoint })`；启动模式使用 `automator.launch({ cliPath, projectPath, port, trustProject: true })`。把 SDK 的 `MiniProgram`、`Page` 和 `Element` 调用封装在适配器内，业务层不得依赖 SDK 类型。实现前以已安装包的类型声明为准，若类型声明与微信文档不同，只在适配层兼容，不扩散到 runner。

- [ ] **步骤 6：验证任务 3**

运行：`npx vitest run tests/miniprogram-review/runner.test.ts && npm run typecheck && npm run check:runtime-network`

预期：全部 PASS；运行时网络边界不受工具目录影响。

- [ ] **步骤 7：提交门禁**

展示变更和拟用 message `feat: 实现小程序自动化场景执行器`，等待用户确认后提交。

---

### 任务 4：确定性报告和命令行入口

**文件：**

- 新建：`tools/miniprogram-review/report.ts`
- 新建：`tools/miniprogram-review/cli.ts`
- 新建：`tests/miniprogram-review/report.test.ts`
- 新建：`tests/miniprogram-review/cli.test.ts`
- 修改：`package.json`
- 修改：`.gitignore`

**接口：**

- 产出：`writeReviewReport(input): { jsonPath: string; markdownPath: string }`。
- 产出：`runCli(argv, dependencies): Promise<number>`，便于测试且不直接调用 `process.exit()`。
- 子命令：`doctor`、`start`、`inspect`、`run`、`review`。

- [ ] **步骤 1：编写失败测试，锁定报告结构与状态语义**

```ts
it('报告区分已覆盖、豁免和待人工核验', () => {
  const report = buildReviewReport(fixedRunInput)
  expect(report.coverage).toEqual({
    covered: ['iphone-standard/normal'],
    exempted: [{ target: 'error', reason: '此純本地頁面沒有遠端錯誤狀態' }],
    manual: ['iphone-small', 'android-large'],
  })
  expect(report.generatedAt).toBe('2026-09-15T12:00:00.000Z')
})
```

- [ ] **步骤 2：编写失败测试，锁定 CLI 退出码**

```ts
it('run 场景失败时返回非零退出码', async () => {
  const code = await runCli(['run', '--scenario', 'catalog-search'], failingDependencies)
  expect(code).toBe(1)
})
```

- [ ] **步骤 3：运行测试并确认正确失败**

运行：`npx vitest run tests/miniprogram-review/report.test.ts tests/miniprogram-review/cli.test.ts`

- [ ] **步骤 4：实现报告器和 CLI**

运行编号采用 UTC 时间加短随机后缀；测试注入固定时钟和 ID。报告按场景、设备、状态和步骤稳定排序。终端输出最后必须打印 JSON/Markdown 报告及关键截图的绝对路径。CLI 捕获已分类错误，打印繁体中文恢复建议并返回 `1`；未知参数返回 `2`。

- [ ] **步骤 5：增加正式 npm 命令和忽略目录**

在 `package.json` 增加：

```json
"devtools:start": "tsx tools/miniprogram-review/cli.ts start",
"devtools:inspect": "tsx tools/miniprogram-review/cli.ts inspect",
"devtools:run": "tsx tools/miniprogram-review/cli.ts run",
"devtools:review": "tsx tools/miniprogram-review/cli.ts review"
```

在 `.gitignore` 增加：

```gitignore
artifacts/miniprogram-review/
```

- [ ] **步骤 6：验证任务 4**

运行：`npx vitest run tests/miniprogram-review && npm run typecheck && npm run lint`

- [ ] **步骤 7：提交门禁**

展示变更和拟用 message `feat: 新增小程序验收报告与命令`，等待用户确认后提交。

---

### 任务 5：真实目录页场景与使用文档

**文件：**

- 新建：`tools/miniprogram-review/scenarios/catalog-search.json`
- 新建：`tests/miniprogram-review/catalog-scenario.test.ts`
- 新建：`docs/miniprogram-review.md`
- 修改：`README.md`

**接口：**

- 示例使用现有 `.catalog-page__search-input`、`.catalog-page__officer-row`、`.catalog-page__list` 和详情页根选择器。
- 示例必须覆盖输入、点击、滚动、断言和截图，不修改页面 WXML 来迎合测试。

- [ ] **步骤 1：先写场景契约测试并确认失败**

```ts
it('目录示范场景覆盖要求的交互动作', () => {
  const scenario = loadScenario('tools/miniprogram-review/scenarios/catalog-search.json')
  const actions = scenario.steps.map((step) => step.action)
  for (const required of ['input', 'tap', 'scrollPage', 'assertExists', 'screenshot']) {
    expect(actions).toContain(required)
  }
})
```

- [ ] **步骤 2：运行测试并确认场景文件缺失导致失败**

运行：`npx vitest run tests/miniprogram-review/catalog-scenario.test.ts`

- [ ] **步骤 3：创建目录页示范场景**

场景从 `/pages/catalog/index` 开始，输入仓库数据中确定存在的航海士名称，断言结果行出现，点击第一行进入详情页，断言详情根节点，滚动并保存顶部和底部截图。实施时先从 `data/master/` 读取稳定名称，不硬编码未经验证的示例数据。

- [ ] **步骤 4：编写初始化和 AI 操作说明**

文档包含：开启服务端口、首次登录、CLI 路径、四个环境变量、五个 npm 命令、场景格式、三档设备覆盖定义、五类状态政策、失败恢复、安全边界，以及 AI 每次页面修改后的标准验收清单。

- [ ] **步骤 5：运行本机只读诊断**

运行：`npm run devtools:doctor`

预期之一：

- 环境完整时退出 `0` 并显示 CLI、项目和端口；或
- 环境尚未初始化时以非零退出并准确指出需要用户完成的单一步骤。

不得把缺少人工登录错误描述为代码缺陷。

- [ ] **步骤 6：运行真实示范场景**

在开发者工具已登录并开启服务端口后运行：

```powershell
npm run devtools:run -- --scenario catalog-search
```

检查 `report.json`、`report.md`、失败/成功截图路径和实际页面交互。使用本地图片查看能力逐张检查关键截图。若设备切换不能自动完成，将未执行设备写为 `manual`，不得宣称覆盖。

- [ ] **步骤 7：验证任务 5**

运行：`npx vitest run tests/miniprogram-review && npm run typecheck && npm run lint && git diff --check`

- [ ] **步骤 8：提交门禁**

展示变更、真实验收结果和拟用 message `docs: 补充小程序自主验收工作流`，等待用户确认后提交。

---

### 任务 6：完整门禁与最终交付

**文件：**

- 检查：本计划涉及的全部文件。
- 不得借机修改无关失败。

- [ ] **步骤 1：确认工作区范围**

运行：`git status --short` 与 `git diff --stat`。只允许出现本计划文件；发现范围外修改时保留并报告，不纳入提交。

- [ ] **步骤 2：运行完整验证**

运行：`npm run verify`

预期：format、lint、typecheck、test、runtime-network、package-size、素材、数据和生成检查全部退出 `0`。

- [ ] **步骤 3：重新执行真实自动化验收**

运行：

```powershell
npm run devtools:doctor
npm run devtools:run -- --scenario catalog-search
```

记录实际覆盖设备、截图和报告路径。若因登录或授权阻塞，只请求用户完成该安全步骤，然后从相同命令继续。

- [ ] **步骤 4：最终提交门禁**

展示所有变更文件、`npm run verify` 结果、真实自动化结果及拟用最终 message；等待用户明确确认后提交。

- [ ] **步骤 5：交付说明**

向用户提供：启动方式、常用命令、首次人工动作、示范报告与截图链接、已自动覆盖项、仍需人工核验项，以及后续为新页面增加场景的最短流程。
