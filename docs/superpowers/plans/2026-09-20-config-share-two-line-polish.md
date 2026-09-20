# 配置／分享双行压缩版实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将冒险配队与战斗配队共享的顶部配置／分享卡压缩为参考图要求的紧凑双行布局，并以独立透明素材呈现分享图标。

**Architecture:** 保留 `config-bar` 作为唯一共享组件，只调整 `prominentShare` 分支的 WXML/WXSS、分享 PNG 素材与两个页面 host 高度。第一行组合「我的配置／N 套／状态胶囊」，第二行显示配置名称和箭头；分享票据与左侧等高，只显示独立图片和主文案。

**Tech Stack:** 微信小程序 WXML/WXSS、TypeScript、Vitest、微信开发者工具自动化验收。

## Global Constraints

- 只修改顶部配置／分享区域，船只、技能、目标、总览、底部导航与分享预览内容不变。
- 所有样式使用 Design Foundation Token 和 BEM 类名，不新增依赖、远程资源、滤镜、渐变、硬编码品牌色或字体。
- 分享图标是本地透明 PNG，仅由图片素材承载图形，不再用 WXML/WXSS 手动画节点和连线。
- 保留配置展开、保存状态、未保存拦截、分享生成、loading、error 和无障碍事件。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`、Cloud Function 或既有未跟踪文件。
- 完成前运行相关 Vitest、两个 DevTools 分享场景、`git diff --check` 和 `npm run verify`。

### Task 1: 共享配置卡双行结构与压缩几何

**Files:**
- Modify: `miniprogram/components/config-bar/index.wxml`
- Modify: `miniprogram/components/config-bar/index.wxss`
- Create: `miniprogram/assets/ui/share-action-icon.png`
- Modify: `miniprogram/pages/adventure-fleet/index.wxml`
- Modify: `miniprogram/subpkg-fleet/pages/index/index.wxml`
- Test: `tests/architecture/fleet-shared-components.test.ts`
- Test: `tests/pages/adventure-fleet-page.test.ts`
- Test: `tests/pages/fleet-page.test.ts`

**Steps:**

- 将 `N 套` 从 identity 行移动到 meta 行，删除突出分享分支中的 `config-bar__share-hint`，保留默认状态、生成中和错误状态文案。
- 将突出分享分支的状态元素改为 `view` 容器和内部文本，使用 `surface` 背景、`border-subtle` 边界与 flex 双向居中；默认展开列表分支的状态结构不变。
- 使用图像生成工具生成透明 PNG 分享图标，WXML 通过 `image` 引用素材，删除突出分享分支的节点与连线子元素及对应 WXSS。
- 将突出外卡调整为 `144rpx`，左右内部控件调整为 `120rpx`；将突出 host 的内联高度同步为 `144rpx`。
- 将配置按钮纵向 gap 和内边距分别压缩到 `space-1`、`space-2`；为状态胶囊设置明确的 `min-height`、flex 双向居中、`surface-muted` 背景和 pill 圆角。
- 保留分享图片、分享按钮宽度、按钮事件和 focus/active/disabled 状态。
- 更新静态架构与页面高度契约，运行三个相关测试文件。

### Task 2: 开发者工具视觉验证

**Files:**
- Generated: `artifacts/miniprogram-review/<run-id>/`
- Review only: `miniprogram/components/config-bar/index.wxss`

**Steps:**

- 运行 `adventure-fleet-share` 与 `battle-fleet-share` 场景，读取两张顶部截图。
- 只根据参考图和截图调整共享 WXSS 的几何、Token、opacity 或边界；下方区域不得改动。
- 记录截图路径和下方区域未被顶部布局额外推移的结果。

### Task 3: 完整门禁

**Steps:**

- 运行 `git diff --check`。
- 运行 `npm run verify`。
- 检查 `git status --short`，确认 `artifacts/`、既有两份 plans 与其它未跟踪文件未被暂存。
