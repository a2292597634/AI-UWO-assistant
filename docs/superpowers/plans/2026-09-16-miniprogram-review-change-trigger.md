# 小程序页面变更触发器实施计划

> **供代理执行：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐任务执行本计划。步骤使用复选框追踪。

**目标：** 增加基于 Git 变更的轻量 `devtools:changed` 调度层，让页面开发批次自动选择受影响的最小/完整场景，并严格区分跳过、失败和开发环境阻塞。

**架构：** `trigger.ts` 只做纯路径分类和场景选择；`git.ts` 只读取 Git 变更；CLI 负责把计划接到现有 `miniprogram-automator` 连接、场景执行和 HTML/JSON/Markdown 报告。没有页面变更时不启动开发者工具；有页面变更时复用已有 WebSocket，场景完成即释放连接。

**技术栈：** TypeScript、Node.js `child_process`、Vitest、现有 `miniprogram-automator` 适配器；不新增 npm 依赖，不引入常驻文件监听器。

## 全局约束

- 所有代码注释、文档和终端文案使用中文；保留必要的命令、路径和 API 英文名称。
- 不在 `master`/`main` 分支直接开发，分支使用 `codex/phase-N-描述`。
- 自动化代码只位于 `tools/`，不在 `miniprogram/` 运行时代码中使用远程网络或 Node.js API。
- 页面相关变更才触发自动化；数据、文档和无关测试变更不启动 `miniprogram-automator`。
- 不按每次保存运行，不创建常驻 watcher，不新增/升级未确认的依赖。
- `blocked`（未登录、端口关闭、项目未打开、设备切换不可用或无可匹配场景）绝不能标成 `passed`。
- 每个任务提交前展示文件、验证结果和拟用 message，等待用户确认；最后运行 `npm run verify`。

---

### 任务 1：场景 `watchPaths` 契约

**文件：**

- 修改：`tools/miniprogram-review/types.ts`
- 修改：`tools/miniprogram-review/scenario.ts`
- 修改：`tests/miniprogram-review/scenario.test.ts`

**接口：**

- `ReviewScenario.watchPaths?: string[]`：仓库相对、使用 `/` 分隔的目录或文件路径。
- `parseScenario` 接受旧场景（没有 `watchPaths`），也接受新场景并拒绝不安全路径。

- [ ] **步骤 1：写失败测试，锁定合法路径、边界和未知字段拒绝**

```ts
it('接受 watchPaths 并规范化路径分隔符', () => {
  const scenario = parseScenario({
    name: '目录搜寻',
    entry: '/pages/catalog/index',
    watchPaths: ['miniprogram\\pages\\catalog\\', 'miniprogram/components/catalog'],
    state: 'normal',
    devices: ['iphone-standard'],
    steps: [{ action: 'screenshot', name: 'catalog' }],
  })

  expect(scenario.watchPaths).toEqual([
    'miniprogram/pages/catalog/',
    'miniprogram/components/catalog',
  ])
})

it.each(['../miniprogram/pages', '/miniprogram/pages', ''])('拒绝不安全 watchPath：%s', (path) => {
  expect(() => parseScenario({
    name: '危险路径',
    entry: '/pages/catalog/index',
    watchPaths: [path],
    state: 'normal',
    devices: ['iphone-standard'],
    steps: [{ action: 'screenshot', name: 'catalog' }],
  })).toThrow('watchPaths')
})
```

- [ ] **步骤 2：运行测试确认当前实现失败**

运行：`npx vitest run tests/miniprogram-review/scenario.test.ts`

预期：FAIL，原因是场景校验器目前把 `watchPaths` 当作未知字段，且类型没有该属性。

- [ ] **步骤 3：实现最小校验和规范化**

在 `ReviewScenario` 增加可选 `watchPaths`。`parseScenario` 的场景允许字段改为 `name`、`entry`、`watchPaths`、`state`、`devices`、`steps`；数组必须非空，路径去除首尾空白、把 `\` 替换成 `/`、拒绝空值、前导 `/`、`..` 段和 `.` 段，并保留调用方是否有结尾 `/`。重复路径在规范化后拒绝，避免匹配语义不确定。

- [ ] **步骤 4：运行场景测试和类型检查**

运行：`npx vitest run tests/miniprogram-review/scenario.test.ts && npm run typecheck`

预期：PASS；旧场景和所有动作测试保持通过。

- [ ] **步骤 5：提交任务 1**

展示变更文件、验证输出和拟用 message `feat: 为验收场景增加关注路径`，等待用户确认后提交。

---

### 任务 2：路径分类和场景选择纯函数

**文件：**

- 新建：`tools/miniprogram-review/trigger.ts`
- 新建：`tests/miniprogram-review/trigger.test.ts`

**接口：**

```ts
export type ReviewTriggerMode = 'iterate' | 'final'
export type TriggerOutcome = 'run' | 'skipped' | 'blocked'

export interface TriggerPlan {
  mode: ReviewTriggerMode
  changedFiles: string[]
  pageFiles: string[]
  scenarios: ReviewScenario[]
  outcome: TriggerOutcome
  reason?: string
}

export const normalizeRepoPath = (value: string): string
export const isPageRelatedPath = (value: string): boolean
export const createTriggerPlan = (input: {
  mode: ReviewTriggerMode
  changedFiles: string[]
  scenarios: ReviewScenario[]
}): TriggerPlan
```

- [ ] **步骤 1：写失败测试，覆盖页面文件、排除项、watchPaths 和两种模式**

```ts
const scenario = (name: string, steps: number, watchPaths?: string[]): ReviewScenario => ({
  name,
  entry: `/pages/${name}/index`,
  watchPaths,
  state: 'normal',
  devices: ['iphone-standard'],
  steps: Array.from({ length: steps }, () => ({ action: 'screenshot', name: 'screen' })),
})

it('只把页面相关变更送入最小迭代场景', () => {
  const plan = createTriggerPlan({
    mode: 'iterate',
    changedFiles: [
      'miniprogram/pages/catalog/index.wxss',
      'data/master/officers.json',
      'docs/miniprogram-review.md',
    ],
    scenarios: [
      scenario('catalog', 3, ['miniprogram/pages/catalog/']),
      scenario('catalog-detail', 1, ['miniprogram/pages/catalog/']),
    ],
  })

  expect(plan.outcome).toBe('run')
  expect(plan.pageFiles).toEqual(['miniprogram/pages/catalog/index.wxss'])
  expect(plan.scenarios.map(({ name }) => name)).toEqual(['catalog-detail'])
})

it('final 模式选择受影响入口的全部场景，共享组件可命中多个入口', () => {
  const plan = createTriggerPlan({
    mode: 'final',
    changedFiles: ['miniprogram/components/catalog/row.ts'],
    scenarios: [
      scenario('catalog', 2, ['miniprogram/components/catalog/']),
      scenario('detail', 2, ['miniprogram/components/catalog/']),
    ],
  })

  expect(plan.scenarios.map(({ name }) => name)).toEqual(['catalog', 'detail'])
})

it('没有页面变更时 iterate 跳过，final 阻塞', () => {
  const input = { changedFiles: ['data/master/officers.json'], scenarios: [] }
  expect(createTriggerPlan({ ...input, mode: 'iterate' })).toMatchObject({ outcome: 'skipped' })
  expect(createTriggerPlan({ ...input, mode: 'final' })).toMatchObject({ outcome: 'blocked' })
})
```

- [ ] **步骤 2：运行测试确认模块不存在导致失败**

运行：`npx vitest run tests/miniprogram-review/trigger.test.ts`

预期：FAIL，原因是 `trigger.ts` 尚不存在。

- [ ] **步骤 3：实现路径分类和确定性选择算法**

实现以下规则：

1. `normalizeRepoPath` 把反斜杠改为 `/`、移除 `./`、拒绝绝对路径和 `..` 段。
2. 页面相关路径必须位于 `miniprogram/`；扩展名包括 `.wxml`、`.wxss`、`.ts`、页面 `.js` 和常见页面素材（`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.svg`）。`miniprogram/generated/`、已知生成的详情/交易 JS 和 `miniprogram_npm/` 一律排除；`miniprogram/app.json` 单独视为页面路由变更。
3. `watchPaths` 用目录边界匹配：`miniprogram/pages/catalog/` 命中其子路径，但不命中 `catalog-old/`。没有 `watchPaths` 时，将 `entry` 转成 `miniprogram/<entry目录>/` 作为回退范围。
4. `app.json` 变更命中全部场景；其他页面变更只命中至少一个关注路径的场景。
5. `iterate` 按入口分组，每个入口选择一个场景：优先 `state === 'normal'`，再按步骤数升序、场景名升序；`final` 返回全部命中场景并按入口、状态、名称稳定排序。
6. 无页面文件时返回 `iterate/skipped` 或 `final/blocked`；有页面文件但没有场景时返回 `blocked`，并写出可操作的原因。

- [ ] **步骤 4：运行纯函数测试、类型检查和 lint**

运行：`npx vitest run tests/miniprogram-review/trigger.test.ts && npm run typecheck && npm run lint`

预期：PASS；不需要微信开发者工具在线。

- [ ] **步骤 5：提交任务 2**

展示变更文件、验证输出和拟用 message `feat: 根据页面变更选择验收场景`，等待用户确认后提交。

---

### 任务 3：Git 变更读取适配

**文件：**

- 新建：`tools/miniprogram-review/git.ts`
- 新建：`tests/miniprogram-review/git.test.ts`

**接口：**

```ts
export interface GitCommandRunner {
  (cwd: string, args: string[]): string
}

export const parseGitNameList = (output: string): string[]
export const readGitChangedFiles = (
  cwd: string,
  runCommand?: GitCommandRunner,
): string[]
```

- [ ] **步骤 1：写失败测试，锁定 staged、unstaged 和 untracked 合并**

```ts
it('合并三类 Git 路径并去重、排序', () => {
  const calls: string[][] = []
  const runCommand: GitCommandRunner = (_cwd, args) => {
    calls.push(args)
    if (args[0] === 'diff' && args[1] === '--cached') return 'miniprogram/pages/catalog/index.wxml\n'
    if (args[0] === 'diff') return 'miniprogram/pages/catalog/index.wxss\n'
    return 'miniprogram/pages/catalog/index.wxml\nminiprogram/components/catalog/row.ts\n'
  }

  expect(readGitChangedFiles('E:/project', runCommand)).toEqual([
    'miniprogram/components/catalog/row.ts',
    'miniprogram/pages/catalog/index.wxml',
    'miniprogram/pages/catalog/index.wxss',
  ])
  expect(calls).toEqual([
    ['diff', '--name-only'],
    ['diff', '--cached', '--name-only'],
    ['ls-files', '--others', '--exclude-standard'],
  ])
})
```

- [ ] **步骤 2：运行测试确认实现不存在时失败**

运行：`npx vitest run tests/miniprogram-review/git.test.ts`

预期：FAIL，原因是 `git.ts` 尚不存在。

- [ ] **步骤 3：实现命令注入和路径解析**

默认 runner 使用 `execFileSync('git', args, { cwd, encoding: 'utf8' })`，不调用 shell。`parseGitNameList` 按换行拆分、去除空白和空行、规范化路径、去重排序；命令失败时抛出包含 `git diff`/`git ls-files` 的中文诊断，不吞掉仓库错误。

- [ ] **步骤 4：运行 Git 适配测试和质量检查**

运行：`npx vitest run tests/miniprogram-review/git.test.ts tests/miniprogram-review/trigger.test.ts && npm run typecheck && npm run lint`

预期：PASS。

- [ ] **步骤 5：提交任务 3**

展示变更文件、验证输出和拟用 message `feat: 读取 Git 页面变更`，等待用户确认后提交。

---

### 任务 4：CLI `changed` 命令、迭代报告和阻塞处理

**文件：**

- 修改：`tools/miniprogram-review/cli.ts`
- 修改：`tests/miniprogram-review/cli.test.ts`
- 修改：`package.json`

**接口：**

- `CliDependencies.readGitChangedFiles(): string[]`，默认实现调用 `readGitChangedFiles(cwd)`。
- `CliDependencies.runQualityGate(): Promise<boolean>`，默认执行 `npm run verify`；测试注入固定布尔值。
- `runCli` 接受 `changed --mode iterate|final`。
- `runScenarios` 增加可选 `{ changedFiles?: string[]; mode?: ReviewTriggerMode }`，执行结束把结果交给既有 `createIterationInput` 写入 `ReviewReport.iterations`。

- [ ] **步骤 1：写失败测试，锁定 no-op、场景选择、阻塞和 final 门禁**

```ts
it('iterate 没有页面变更时不连接开发者工具', async () => {
  const connect = vi.fn()
  const log = vi.fn()
  const code = await runCli(
    ['changed', '--mode', 'iterate'],
    dependencies({
      log,
      connect,
      readGitChangedFiles: () => ['docs/miniprogram-review.md'],
    }),
  )

  expect(code).toBe(0)
  expect(connect).not.toHaveBeenCalled()
  expect(log).toHaveBeenCalledWith('未发现页面相关变更，已跳过自动验收')
})

it('final 没有可匹配场景时生成阻塞报告并返回非零', async () => {
  const writeReport = vi.fn()
  const code = await runCli(
    ['changed', '--mode', 'final'],
    dependencies({
      listScenarioPaths: () => [],
      readGitChangedFiles: () => ['miniprogram/pages/new/index.wxml'],
      writeReport,
    }),
  )

  expect(code).not.toBe(0)
  expect(writeReport).toHaveBeenCalledOnce()
  expect(writeReport.mock.calls[0]?.[1].status).toBe('blocked')
})

it('final 场景通过后仍执行 npm run verify，质量门禁失败则返回非零', async () => {
  const runQualityGate = vi.fn(async () => false)
  const code = await runCli(
    ['changed', '--mode', 'final'],
    dependencies({
      readGitChangedFiles: () => ['miniprogram/pages/catalog/index.wxss'],
      runQualityGate,
    }),
  )

  expect(runQualityGate).toHaveBeenCalledOnce()
  expect(code).not.toBe(0)
})
```

- [ ] **步骤 2：运行 CLI 测试确认当前命令未知或依赖缺失**

运行：`npx vitest run tests/miniprogram-review/cli.test.ts`

预期：FAIL，原因是 `changed` 尚未列入命令、依赖接口和报告阻塞结果尚未接入。

- [ ] **步骤 3：实现参数解析和触发计划调用**

在 `parseArguments` 增加 `--mode`，只接受 `iterate`/`final`；缺失或其他值返回参数错误码 `2`。加载 `listScenarioPaths` 的全部场景，调用 `readGitChangedFiles` 和 `createTriggerPlan`。

- [ ] **步骤 4：实现三种 CLI 结果**

1. `iterate/skipped`：只打印“未发现页面相关变更，已跳过自动验收”，返回 `0`，不执行 `doctor`、`connect` 或 `miniprogram-automator`。
2. `run`：先调用 `checkCliCapability`；通过后按计划运行场景、保存截图、调用 `createIterationInput`，再写 HTML/JSON/Markdown。迭代摘要默认“本轮页面修改与自动验收”，变更文件来自本次 Git 读取。
3. `blocked`：为每个阻塞原因生成一个 `ScenarioRunResult`（`status: 'blocked'`、空步骤、中文 `error`），写入完整报告并返回 `1`；绝不调用 `runQualityGate`。
4. `final` 场景全部通过后调用注入的 `runQualityGate`；门禁失败报告/日志显示“页面自动验收通过，但仓库质量门禁失败”，最终返回 `1`。全部通过才返回 `0`。

`runQualityGate` 默认用 `execFile('npm', ['run', 'verify'], { cwd, stdio: 'inherit' })`，不拼接 shell 字符串。开发者工具连接复用既有 WebSocket；每个场景仍由 `runScenario` 负责断开。

- [ ] **步骤 5：增加 npm 命令**

在 `package.json` 的 `scripts` 增加：

```json
"devtools:changed": "tsx tools/miniprogram-review/cli.ts changed"
```

- [ ] **步骤 6：运行 CLI、报告和类型检查**

运行：`npx vitest run tests/miniprogram-review && npm run typecheck && npm run lint && git diff --check`

预期：PASS；旧 `doctor`/`run`/`review` 行为不回归，新命令在无页面变更时不触碰开发者工具。

- [ ] **步骤 7：提交任务 4**

展示变更文件、验证输出和拟用 message `feat: 新增 Git 变更触发验收命令`，等待用户确认后提交。

---

### 任务 5：场景配置、AI 强制规则和使用文档

**文件：**

- 修改：`tools/miniprogram-review/scenarios/catalog-search.json`
- 修改：`AGENTS.md`
- 修改：`docs/miniprogram-review.md`
- 修改：`README.md`（仅在已有小程序工具入口处添加链接）
- 修改：`tests/miniprogram-review/catalog-scenario.test.ts`（如该测试在实现分支中存在）

**接口：**

- 目录示范场景声明 `watchPaths`，覆盖目录页、详情页和目录共享组件。
- 文档公开 `devtools:changed -- --mode iterate/final`、触发时机和三种结果语义。

- [ ] **步骤 1：更新目录场景关注路径**

在 `catalog-search.json` 的 `entry` 后加入：

```json
"watchPaths": [
  "miniprogram/pages/catalog/",
  "miniprogram/subpkg-detail/pages/detail/",
  "miniprogram/components/catalog/"
],
```

若仓库实际不存在某个目录，先用 `Test-Path` 只读确认并删除不存在的示例路径，不能为测试新建空页面目录。

- [ ] **步骤 2：把 AI 规则写入 AGENTS.md**

新增“页面自动验收触发规则”小节，明确：修改 `.wxml`、`.wxss`、页面/组件 `.ts`/`.js`、路由或页面素材后，每个主要修改批次必须运行 `devtools:changed -- --mode iterate`；最终回复“完成”前必须运行 `--mode final` 并读取 HTML 报告；数据/文档变更不触发；`blocked`/`skipped` 不得描述为页面已完成。

- [ ] **步骤 3：更新使用文档和故障恢复**

在 `docs/miniprogram-review.md` 增加命令示例、`watchPaths` 说明、迭代/最终模式表格、连接复用策略、触发时机清单和阻塞处理。将报告入口写成 `report.html`，并说明 JSON/Markdown 兼容文件仍会生成。

- [ ] **步骤 4：运行文档、场景和完整工具测试**

运行：`npx prettier --check AGENTS.md docs/miniprogram-review.md README.md tools/miniprogram-review/scenarios/catalog-search.json && npx vitest run tests/miniprogram-review`

预期：PASS；场景 `watchPaths` 通过严格校验。

- [ ] **步骤 5：提交任务 5**

展示变更文件、验证输出和拟用 message `docs: 固化页面变更触发验收规则`，等待用户确认后提交。

---

### 任务 6：完整门禁与真实开发者工具验收

**文件：**

- 检查：本计划涉及的全部文件。
- 不修改：`archive/`、`data/master/`、`miniprogram/generated/` 和与触发器无关的失败文件。

- [ ] **步骤 1：确认变更范围**

运行：`git status --short; git diff --stat`

预期：只出现触发器、报告接口、场景、文档、测试和 package script；`artifacts/miniprogram-review/` 不应出现在 Git 变更中。

- [ ] **步骤 2：运行完整门禁**

运行：`npm run verify`

预期：所有检查退出 `0`。已有无关失败只记录，不夹带修复。

- [ ] **步骤 3：验证不相关变更不会触发自动化**

运行：`npm run devtools:changed -- --mode iterate`（可先在临时分支制造一条文档变更再恢复）并确认输出“未发现页面相关变更”，没有启动/连接微信开发者工具。

- [ ] **步骤 4：验证页面变更的迭代模式**

在开发者工具已登录且服务端口/自动化端点可用时运行：

```powershell
npm run devtools:changed -- --mode iterate
```

确认只执行命中 `watchPaths` 的最小场景，终端打印 `report.html`，报告时间线包含本轮变更文件和 after 截图。

- [ ] **步骤 5：验证最终模式和阻塞恢复**

运行：

```powershell
npm run devtools:changed -- --mode final
```

确认所有受影响场景执行、`npm run verify` 被调用、通过/失败/阻塞语义准确。若开发者工具未登录，报告为 `blocked`；用户完成登录后重复相同命令即可恢复。

- [ ] **步骤 6：最终提交门禁**

展示所有文件、单元测试、`npm run verify`、真实自动化输出和拟用最终 message；等待用户明确确认后提交。
