# 小程序 HTML 页面验收报告设计

## 1. 背景与目标

现有 `report.md` 能记录验收结果，但人工需要在长文本中寻找状态、步骤和截图路径，无法快速理解页面经历了哪些修改。新的报告以本地 `report.html` 为主入口，让 AI 和用户打开一个文件即可看到：本次运行是否通过、覆盖了哪些状态、每一步做了什么、每轮修改后页面变成什么样，以及仍需人工核验的事项。

本设计服务于既有的 `miniprogram-automator` 工作流。自动化框架继续只负责连接和操作微信开发者工具中的运行页面；报告层负责把场景执行结果和修改轮次整理成可读证据，不把 HTML 或任何报告资源放进小程序运行时代码。

## 2. 范围

### 2.1 本次实现

- 生成 `report.html`，作为人工阅读的主报告。
- 保留 `report.json` 作为机器读取和后续 AI 判断的稳定数据源。
- 暂时保留 `report.md`，兼容现有脚本、链接和旧报告读取流程。
- 增加轻量 `git diff` 变更触发器和 `devtools:changed` 命令，支持 `iterate` 与 `final` 两种模式。
- 为场景增加 `watchPaths`，用仓库相对路径前缀把变更页面映射到最小必要场景；共享组件变更可命中多个场景。
- 在报告中增加“修改过程”时间线，展示每一轮的修改摘要、变更文件、结果、前后截图和备注。
- 用内嵌 SVG 图标、内嵌 CSS 和一段固定的轻量脚本实现状态图标、步骤图标、截图缩放和折叠详情；不引入新依赖、不加载 CDN 或远程资源。
- 为 HTML 输出、路径转换、HTML 转义、迭代信息排序和报告路径返回值增加单元测试。
- 更新 CLI 输出和使用文档，使终端优先提示 `report.html`。

### 2.2 不在本次实现

- 不实现视觉评分模型、像素级 diff 或自动判定“好不好看”。
- 不把报告上传到云端，不启动本地 HTTP 服务，也不把截图复制到 `miniprogram/`。
- 不修改页面 WXML/WXSS 以迁就报告器。
- 不把文件系统 watcher 变成常驻进程，不按每次保存频繁重启开发者工具。修改触发由一次批量修改完成后的 `devtools:changed` 命令承担；后续如需更自动的触发，只增加调用层，不改变报告格式。

### 2.3 截图证据规则（规范性）

- `report.html` 是交付给用户阅读的主报告；截图必须在报告内直接展示为可见缩略图，点击后可放大，不得只列出截图路径。
- 修改过程时间线必须展示“修改前基线”和“修改后截图”。没有可信基线时显示明确的缺失说明，不得把修改后截图冒充修改前截图。
- 场景截图和失败现场截图也必须在对应场景卡片内直接展示。
- `report.md` 同步使用本地相对图片链接展示截图；`report.json` 保留绝对路径供机器读取。路径只作为辅助证据，不能替代报告内的图片展示。
- 页面变更的通过报告至少要有一张修改后截图；截图缺失时不得把该轮标记为通过。

## 3. 使用流程

```text
文字需求 + Design Foundation
          ↓
AI 修改页面
          ↓
npm run devtools:changed -- --mode iterate
          ↓
场景执行：点击 / 输入 / 滚动 / 断言 / 截图
          ↓
记录本轮变更文件和截图，追加到迭代时间线
          ↓
生成 report.html + report.json + report.md
          ↓
AI 读取 HTML 与截图，继续修改或交给用户最终核验
```

每次 `devtools:changed` 运行代表一个可追踪的验收轮次。变更文件由 Git 工作区状态自动收集，场景截图由执行器自动收集；需要解释设计取舍时，调用方可通过 `--summary` 和重复的 `--note` 提供修改说明。没有上一轮基线时，时间线仍展示“本轮结果”，不虚构 before 截图。

常规开发只需在一批页面修改完成后运行迭代模式；准备提交或交付时运行最终模式。AI 不应把每次保存文件都当作触发点。

## 4. 数据模型

### 4.1 修改轮次

在 `tools/miniprogram-review/report.ts` 中增加以下公开类型，并让 `ReviewReportInput` 接收可选的 `iterations`。保持旧调用方不传该字段时仍能生成报告。

```ts
export interface ReviewIterationInput {
  id: string
  startedAt: Date
  finishedAt?: Date
  summary?: string
  changedFiles: string[]
  status: 'passed' | 'failed' | 'blocked'
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
  status: 'passed' | 'failed' | 'blocked'
  beforeScreenshot?: string
  afterScreenshots: string[]
  notes: string[]
}
```

规范化规则：

- `id` 按调用方提供的轮次标识保存；报告按 `startedAt`、再按 `id` 稳定排序。
- `summary` 缺省为“本轮页面修改与自动验收”。`notes` 缺省为空数组。
- `changedFiles` 去重并按仓库相对路径排序；绝对路径在写入前转换为相对仓库路径，无法转换时保留原文但在 HTML 中标记为外部路径。
- 截图路径在 JSON 中保留绝对路径，供 AI 或本地工具直接读取；HTML 只使用相对报告目录的路径。
- `beforeScreenshot` 是可选的上一轮基线截图。找不到可信基线时必须省略，而不是把本轮 after 截图重复标成 before。
- `blocked` 只表示环境、登录、授权或设备切换阻塞，不表示页面实现通过。

### 4.2 总体报告

`ReviewReport.status` 扩展为 `'passed' | 'failed' | 'blocked'`，让环境问题无法被误读为页面通过。若场景断言或交互失败，整体为 `failed`；开发者工具未登录、端口未开启、项目未打开或设备切换不可用，整体为 `blocked`。旧消费者只把 `status === 'passed'` 当成功即可保持安全兼容；CLI 仍返回非零退出码表示失败或阻塞。`ReviewReport.iterations` 规范化为空数组而不是 `undefined`，确保 JSON 字段稳定。

报告 JSON 顶层字段为：`runId`、`generatedAt`、`status`、`git`、`coverage`、`iterations`、`results`。不把 HTML 拼接结果写入 JSON。

## 5. HTML 信息架构

`report.html` 是一个可以直接用 Chrome/Edge 打开的离线报告文件。页面使用语义化的 `<header>`、`<main>`、`<section>`、`<ol>` 和 `<details>`，窄屏下单列显示，不依赖构建工具。报告目录内的截图资源使用相对路径引用并在页面内直接显示，不要求把二进制图片转换成 base64 塞进 HTML。

### 5.1 顶部摘要

- 海绿色标题栏：小程序页面验收报告、总体状态徽章和运行编号。
- 元数据行：生成时间、Git commit、工作区是否有未提交修改、当前页面/场景数。
- 摘要卡片：已覆盖、待人工核验、豁免、失败步骤四个数字；数字旁配固定 SVG 图标。

### 5.2 修改过程时间线

时间线位于摘要之后，是本次改版的核心。每个 `<li>` 对应一轮 `ReviewIteration`，显示：

- “第 N 轮”与通过/失败/阻塞状态。
- 开始和结束时间、`summary`。
- 变更文件 chips；过长路径折叠显示，完整路径放在 `title` 和详情中。
- before 与 after 截图缩略图，直接显示在报告内并支持点击放大；缺失时显示明确的“本轮没有可信基线/截图”。
- `notes` 作为“为什么这样改”列表，帮助用户理解修改过程。
- 轮次末尾的 `<details>` 显示本轮关联场景和原始路径，避免首屏过重。

没有迭代数据时显示空状态：“本次运行未附带修改轮次；以下为场景验收结果。”这不是错误。

### 5.3 场景与步骤

每个场景使用可折叠卡片，首行显示场景名、页面路径、数据状态和结果。展开后按执行顺序显示步骤：

- 动作图标和中文动作名（跳转、点击、输入、清空、滚动、等待、断言、截图）。
- 步骤状态、耗时、选择器/输入值（敏感值按调用方脱敏后展示）。
- 步骤截图缩略图和失败现场截图直接显示在场景卡片内；点击缩略图打开本地对话框放大。
- 失败步骤显示错误原因，并明确“后续步骤未执行”。

### 5.4 覆盖与人工清单

页面底部并列展示已覆盖、豁免、待人工设备和待人工状态。豁免项必须同时展示原因；人工项不能用绿色“通过”图标。

### 5.5 原始数据

使用 `<details>` 放置格式化后的 `report.json` 片段，便于 AI 排查字段而不影响普通用户阅读。报告不把完整二进制图片转成 base64，避免 HTML 文件膨胀；截图资源仍必须以相对路径在报告内直接展示。

## 6. 视觉与交互规范

报告不是小程序运行页面，但沿用仓库 Design Foundation 的海洋航海语义：

- 页面背景 `#e7deca`，卡片 `#f5efe0`，正文深绿 `#26332f`，黄铜强调 `#b99552`，失败 `#8b3a3a`，阻塞 `#7a5a2a`。
- 使用系统无衬线字体栈和现有的圆角、间距、阴影层级；不得在报告中引入远程字体。
- 图标全部由安全的内嵌 SVG 符号表提供，不使用 emoji。每个图标有 `aria-label` 或 `<title>`，颜色不能作为唯一状态提示。
- 截图卡片有明确的文件名和 `alt`；图片加载失败时显示文件路径和失败说明。
- 缩放交互使用固定脚本：事件委托监听带 `data-lightbox-src` 的缩略图，打开 `<dialog>`；关闭按钮、Esc 和点击遮罩均可关闭。脚本不执行报告数据中的代码。
- 所有来自场景名、错误信息、文件名和备注的文字都经过 `escapeHtml`；禁止把它们拼进 `<script>` 或事件处理器。
- HTML 中不使用远程 URL、`iframe`、外部 CSS、外部 JS 或不受控的 `innerHTML`。

## 7. 文件与路径策略

每次运行目录保持现有结构，并增加迭代目录：

```text
artifacts/miniprogram-review/<run-id>/
├── report.html
├── report.json
├── report.md
├── console.log
├── iterations/
│   ├── 001-before.png       # 有可信上一轮基线时才生成
│   └── 001-after-001.png
└── current-simulator/
    └── <序号-场景名>/...
```

报告器用 `path.relative(outputDir, screenshotPath)` 生成 HTML `src` 和 Markdown 图片链接，并统一为 `/`。只有解析后位于当前运行目录内的截图才渲染为图片；目录外的路径只作为文本证据显示，防止 HTML 意外暴露任意本机文件。JSON 继续保存绝对路径语义，Markdown 在无法安全内嵌时才回退为路径文本。

`artifacts/miniprogram-review/` 继续由 `.gitignore` 忽略。HTML、截图和 JSON 都在仓库外的小程序包目录之外，不会增加发布包容量；长期保留策略仍由后续清理命令另行设计。

## 8. 变更触发器与场景匹配

### 8.1 变更收集

新增 `devtools:changed` 命令，入口为：

```powershell
npm run devtools:changed -- --mode iterate
npm run devtools:changed -- --mode final
```

触发器在一次命令开始时读取 Git 变更：

- 使用 `git diff --name-only` 读取工作区未暂存变更。
- 同时读取 `git diff --cached --name-only` 和未跟踪文件，避免新建页面漏检。
- 统一为仓库相对、`/` 分隔的路径并去重。

页面相关文件包括 `.wxml`、`.wxss`、页面或组件 `.ts`、`app.json`/页面路由、页面素材以及 `watchPaths` 覆盖的资源文件。`data/master`、`miniprogram/generated`、Cloud Function、纯数据脚本、纯文档和无关测试默认不触发自动化。`app.json` 或路由配置变更按全量页面场景处理。

### 8.2 `watchPaths`

场景 JSON 增加可选字段：

```json
{
  "name": "目录搜寻与详情",
  "entry": "/pages/catalog/index",
  "watchPaths": [
    "miniprogram/pages/catalog/",
    "miniprogram/subpkg-detail/pages/detail/",
    "miniprogram/components/catalog/"
  ],
  "state": "normal",
  "devices": ["iphone-standard"],
  "steps": []
}
```

路径匹配使用规范化后的目录前缀，并要求路径边界，避免 `catalog-old/` 误命中 `catalog/`。变更命中任一 `watchPaths` 时选择该场景；共享组件可以命中多个场景。没有 `watchPaths` 的旧场景回退到 `entry` 推导的页面目录，保证旧 JSON 仍可加载。触发器不构建反向依赖图，也不引入第三方 glob 库。

### 8.3 两种模式与退出语义

- `iterate`：只运行受影响页面的最小场景，优先快速截图和关键交互；不执行全仓库 `npm run verify`。没有页面相关变更时输出“跳过自动验收”的明确 no-op 结果并返回 `0`，不启动或连接 `miniprogram-automator`。
- `final`：运行所有受影响页面的已保存场景，覆盖点击、输入、滚动、文字断言和关键截图；随后由 AI 执行 `npm run verify`。如果页面变更存在但没有可匹配场景，或开发者工具不可用，结果为 `blocked`/非零退出码，AI 不得回复“页面已完成”。没有页面相关变更时，命令返回非零并提示“未检测到页面变更，无法用本次命令证明页面已验收”，需要用户/AI 显式运行 `devtools:review -- --page` 才能得到最终证据。
- 两种模式都复用本机开发者工具会话：Windows 上若 `cli.bat` 同目录存在 `wechatide.cmd`，优先使用新版项目窗口接口；显式 WebSocket 或没有新版接口时回退到 `miniprogram-automator`。每个场景完成后释放自动化连接；新版接口保留用户项目窗口，不启动常驻监听器。若连接能力检查或场景执行遇到环境阻塞，按 8.5 的有限恢复流程尝试重启并重连。

### 8.4 调用时机规则

页面任务开始时先运行一次 `devtools:doctor`；页面首次能打开、完成一批布局调整、修改点击/输入/滚动、增加加载/空/错误状态，或 AI 根据截图修复后，都在完整修改批次结束时运行 `iterate`。最终交付前必须运行 `final` 并读取 HTML 报告。只改数据或文档时不调用自动化，只运行对应代码检查。

该规则由 `AGENTS.md` 触发，并在 `docs/miniprogram-review.md` 提供操作说明：检测页面变更 → 选择受影响场景 → 调用自动化 → 读取报告内截图 → 修复 → 重跑 → 通过后交付。

### 8.5 阻塞自动恢复规则

页面截图确认遇到下列环境问题时，验收命令必须先尝试自动恢复，不得立即结束为阻塞：服务端口不可访问、开发者工具未返回登录状态、自动化 WebSocket 无法连接、连接被关闭、读取工具信息或当前页面超时，以及 automator 协议连接超时。

恢复流程固定为：

1. 记录原始阻塞原因，并输出“正在尝试重启微信开发者工具并重新连接”的日志。
2. 对当前自动化端点或项目窗口执行最佳努力关闭；关闭失败不隐藏后续启动错误。
3. 使用相同的项目路径、CLI、服务端口和自动化端口重新启动开发者工具自动化会话；旧版 automator 路径额外使用 `--trust-project`。
4. 新版接口等待 `automation_runtime_info.currentPage`，旧版路径等待 `Tool.getInfo` 和页面首帧就绪，随后重新检查连接能力。
5. 如果阻塞发生在场景开始前，恢复成功后继续当前场景；如果发生在场景执行中，只重新连接并重跑当前场景，不重复已完成场景。

单次验收最多执行 2 次恢复尝试。两次均失败时生成 `blocked` 报告，报告备注必须包含原始阻塞原因、每次恢复结果和最终原因；不得把恢复失败当成页面 `passed`。如果只有 `WECHAT_AUTOMATION_WS_ENDPOINT` 而没有可用 CLI，允许尝试重新连接，但必须在报告中说明无法自动启动开发者工具。

元素不存在、元素不可见、文字断言失败、页面业务逻辑错误和截图内容不符合预期属于页面失败，不触发开发者工具重启；这些结果继续标记为 `failed`，避免把实现缺陷掩盖成环境恢复。

## 9. 实现边界

- 在 `report.ts` 中负责报告模型规范化、JSON/Markdown 写入和输出路径；HTML 模板/渲染逻辑拆到 `tools/miniprogram-review/report-html.ts`，避免继续膨胀 CLI。
- `writeReviewReport` 返回 `{ htmlPath, jsonPath, markdownPath }`。CLI 最后优先打印 `HTML 报告：...`，同时保留 JSON、Markdown 和截图证据日志。
- CLI 在开始一次 `changed`/`review`/`run` 时收集 Git 变更文件；场景结束后把本轮截图作为 `afterScreenshots` 写入迭代记录。上一轮基线仅在同一页面、同一场景且路径仍存在时复制到当前 `iterations/` 并标记为 `beforeScreenshot`。
- CLI 的 `changed` 命令支持 `--summary "修改摘要"` 和重复的 `--note "补充说明"`；调用层可以提供 `summary` 和 `notes`，报告器不得自行推断修改原因。
- CLI 通过有限恢复协调器处理环境阻塞：恢复次数上限为 2；恢复协调器调用适配器关闭并重新启动自动化会话，然后重新执行能力检查或当前场景。
- 适配器负责会话生命周期，不负责判断页面断言是否正确；Windows 新版 `wechatide` 适配器负责项目窗口、页面路由、视口截图和自定义组件状态读取，旧版 `miniprogram-automator` 作为回退；连接错误分类必须与选择器、断言错误分类分离，并可通过依赖注入测试。
- HTML 输出必须是确定性的：同一 `ReviewReport` 和输出目录生成相同 DOM 顺序、类名和文本；不在模板中读取当前时间或随机数。
- 触发器的页面相关扩展名、`watchPaths` 匹配、模式选择和阻塞状态独立成纯函数，便于不连接开发者工具的单元测试。
- 不改动 `miniprogram/` 运行时代码，不新增生产依赖，不改变自动化动作集合。

## 10. 测试与验收

### 9.1 单元测试

在 `tests/miniprogram-review/report.test.ts` 增加：

- `writeReviewReport` 返回三个稳定路径，并实际写入 `report.html`。
- HTML 含总体状态、摘要数字、时间线、修改摘要、变更文件、步骤图标和相对 `<img src>`。
- Markdown 含修改过程、修改前/修改后和场景截图的相对图片链接；安全路径之外的截图只显示文本。
- 缺失迭代或缺失 before 截图时显示空状态，不生成错误图片链接。
- 场景名、错误信息、截图文件名中的 `<script>`、引号和 `&` 被安全转义。
- HTML 不含 `http://`/`https://`/`iframe`，截图 `src` 不越界到输出目录外。
- 给定同一输入，HTML 内容每次完全一致。

在 `tests/miniprogram-review/cli.test.ts` 增加 HTML 路径日志和新返回值的兼容断言；现有 Markdown 断言继续保留，确保过渡期脚本不回归。

新增 `tests/miniprogram-review/trigger.test.ts`，覆盖：

- 页面扩展名识别、数据/文档变更跳过和未跟踪页面文件捕获。
- `watchPaths` 的目录边界、共享组件多场景命中和旧场景回退。
- `iterate` 只选择最小场景，`final` 选择全部受影响场景。
- 没有页面变更、没有场景、开发者工具阻塞三种结果不会被标为通过。
- 环境阻塞最多触发 2 次重启与重连；恢复成功后只重跑当前场景；页面断言失败不会触发重启。

### 9.2 本机验收

在微信开发者工具已登录并开启自动化端口后运行：

```powershell
npm run devtools:review -- --page /pages/catalog/index
```

打开终端打印的 `report.html`，确认可以直接看到摘要、场景步骤、修改前/修改后截图和截图缩放；连续修改页面并重复命令，确认每次运行的迭代记录包含变更文件和 after 截图。若登录、授权或设备切换阻塞，报告必须清楚显示阻塞原因，并把该项列为人工核验。

### 9.3 仓库门禁

实现完成后运行：

```powershell
npm run verify
```

报告工具只位于 `tools/` 和测试/文档目录；`check:runtime-network`、包体积检查和生成检查结果不得因本功能新增异常。

## 11. 完成标准

1. AI 执行一次现有页面验收命令即可得到可直接打开且直接展示截图的 `report.html`。
2. HTML 首屏能在数秒内告诉用户总体结果、覆盖情况和失败位置，并可展开每一步。
3. 修改时间线能显示每轮摘要、变更文件和实际截图；没有可信基线时不会伪造 before 证据。
4. 修改前、修改后、场景和失败现场截图均在报告内展示；点击缩略图可放大，截图和文字路径均能在本地离线使用。
5. JSON 仍可被机器读取，Markdown 兼容输出仍存在，且没有引入运行时依赖或增加小程序包体积。
6. `devtools:changed --mode iterate/final` 能按 Git 变更和 `watchPaths` 选择场景；不相关变更不会启动自动化。
7. 报告严格区分通过、失败和阻塞；阻塞或跳过时 AI 不得宣称页面完成。
8. 连接阻塞时会自动尝试最多 2 次重启和重连；恢复失败仍清楚报告为阻塞，不会无限等待或无限重启。
9. 单元测试和完整 `npm run verify` 通过；真实开发者工具验收结果与报告内容一致。
